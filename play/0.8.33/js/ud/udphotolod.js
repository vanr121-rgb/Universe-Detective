// Display-only photo mip levels. The original ID, stored bytes, dimensions and
// paper geometry never change. Jobs are limited and only paint live consumers.
'use strict';
const UD_PHOTO_CACHE_BYTES=32*1024*1024,UD_PHOTO_CACHE_COUNT=2000,UD_PHOTO_WORKERS=2;
const udPhotoCache=new Map(),udPhotoJobs=new Map();let udPhotoCacheBytes=0,udPhotoRunning=0,udPhotoPumpTimer=0;
let udPhotoManagedEnabled=true;
function udPhotoTier(z){return z>=1?0:z>=.5?1024:z>=.2?512:256}
function udPhotoSize(w,h,tier){
  if(!tier||!(w>0&&h>0))return null;
  const scale=Math.min(1,tier/Math.max(w,h));return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale))};
}
function udPhotoKey(id,tier){return JSON.stringify([id,tier])}
function udPhotoCacheCost(row){return row.url.length+(row.sourceUrl?.length||0)}
function udPhotoCached(key,sourceUrl){const row=udPhotoCache.get(key);if(!row||row.sourceUrl!==sourceUrl)return null;udPhotoCache.delete(key);udPhotoCache.set(key,row);return row}
function udPhotoCachePut(key,id,url,sourceUrl){
  const old=udPhotoCache.get(key);if(old)udPhotoCacheBytes-=udPhotoCacheCost(old);
  udPhotoCache.delete(key);const row={id,url,sourceUrl};udPhotoCache.set(key,row);udPhotoCacheBytes+=udPhotoCacheCost(row);
  while(udPhotoCache.size>UD_PHOTO_CACHE_COUNT||udPhotoCacheBytes>UD_PHOTO_CACHE_BYTES){const first=udPhotoCache.keys().next().value;udPhotoCacheBytes-=udPhotoCacheCost(udPhotoCache.get(first));udPhotoCache.delete(first)}
}
function udPhotoInvalidate(ids){
  const set=new Set((Array.isArray(ids)?ids:[ids]).map(String));
  for(const [key,row] of udPhotoCache)if(set.has(row.id)){udPhotoCacheBytes-=udPhotoCacheCost(row);udPhotoCache.delete(key)}
  for(const [key,job] of udPhotoJobs)if(set.has(job.id)){udPhotoJobs.delete(key);job.waiters.clear()}
}
function udPhotoFrameTier(frame,z){
  const tier=udPhotoTier(z),w=Number(frame.dataset.udPhotoWidth),h=Number(frame.dataset.udPhotoHeight);
  return tier&&w>0&&h>0&&Math.max(w,h)<=tier?0:tier;
}
// Local presentation quality is independent of the 256/512/1024 network
// catalog. Never ask the relay for a new unsupported level.
function udPhotoOverviewTier(z,w,h,dpr=1){
  const top=z<.1?.1:.2,need=Math.max(w,h)*top*Math.max(1,dpr)*1.5;
  return need<=64?64:need<=128?128:256;
}
function udPhotoDpr(){return (devicePixelRatio||1)*(Number(document.documentElement.style.getPropertyValue('--zf'))||1)}
function udPhotoManaged(stage){return udPhotoManagedEnabled&&!!stage?.parentElement?.classList.contains('bBig')}
function udPhotoDisplayTier(frame,z){
  const nominal=udPhotoFrameTier(frame,z),stage=frame.closest('.boardStage');
  if(!udPhotoManaged(stage))return nominal;
  const w=Number(frame.dataset.udPhotoWidth),h=Number(frame.dataset.udPhotoHeight),source=Math.max(w,h);
  // An already-small source is cheaper to use unchanged than to transcode.
  if(source>0&&source<=256)return nominal;
  const card=frame.closest('.boardCard');
  if(z<.2){
    const cw=parseFloat(card?.style.width)||240,ratio=w>0&&h>0?w/h:4/3;
    const ch=parseFloat(card?.style.getPropertyValue('--ud-overview-height'))||parseFloat(card?.style.height)||parseFloat(card?.style.minHeight)||Math.max(cw,cw/ratio+100);
    return Math.min(256,udPhotoOverviewTier(z,cw,ch,udPhotoDpr()));
  }
  // At close zoom, only visible or nearby papers (plus the selection) need
  // large decoded originals; off-screen papers keep a visible lightweight mip.
  if(z>=.5&&stage._udPhotoState?.observer&&!frame._udPhotoNear&&!card?.classList.contains('selected'))return frame._udPhotoLastSmall||256;
  return nominal;
}
function udPhotoPaint(frame,key,url,level=JSON.parse(key)[1]){
  if(!frame.isConnected||frame._udPhotoGoal!==key)return;
  const image=frame.querySelector('img[data-ud-photo-image]'),notice=frame.querySelector('[data-ud-photo-message]'),resize=frame.querySelector('.udPhotoResize');
  if(!image)return;
  if(url){if(image.getAttribute('src')!==url)image.src=url;image.hidden=false;image.dataset.udPhotoLevel=String(level);if(level>=64&&level<=256)frame._udPhotoLastSmall=level;if(notice)notice.hidden=true;if(resize)resize.hidden=false;frame._udPhotoApplied=key;return}
  image.removeAttribute('src');image.hidden=true;delete image.dataset.udPhotoLevel;
  if(notice){notice.hidden=false;notice.textContent=window.UG_ONLINE_PLAYER&&onpImagePending(frame.dataset.udBoardMedia)?'Снимок загружается…':'нет снимка'}
  if(resize)resize.hidden=true;frame._udPhotoApplied=key;
}
function udPhotoLive(job){for(const node of job.waiters)if(!node.isConnected||node._udPhotoGoal!==job.key)job.waiters.delete(node);return job.waiters.size>0}
async function udPhotoMake(job){
  let row;
  if(job.sourceUrl){
    const comma=job.sourceUrl.indexOf(','),mime=job.sourceUrl.slice(5,comma).replace(/;base64$/,'');
    if(comma<0||!job.sourceUrl.startsWith('data:')||!mime)return '';
    row={mime,data:job.sourceUrl.slice(comma+1)};
  }else row=UniverseGraphStorage.mediaGet(job.id);
  if(!row?.data||!row.mime)return '';
  // No giant data URL in card markup; decode at reduced resolution where the
  // engine supports it. Fall back to a normal decoded image for SVG/ICO etc.
  const bytes=typeof Uint8Array.fromBase64==='function'?Uint8Array.fromBase64(row.data):Uint8Array.from(atob(row.data),c=>c.charCodeAt(0));
  const blob=new Blob([bytes],{type:row.mime});let bitmap=null,objectUrl=null,source;
  try{
    const size=udPhotoSize(job.w,job.h,job.tier);
    if(typeof createImageBitmap==='function')try{bitmap=await createImageBitmap(blob,size?{resizeWidth:size.w,resizeHeight:size.h,resizeQuality:'medium'}:undefined);source=bitmap}catch{}
    if(!source){objectUrl=URL.createObjectURL(blob);const image=new Image();image.src=objectUrl;await image.decode();source=image}
    const out=udPhotoSize(source.naturalWidth||source.width,source.naturalHeight||source.height,job.tier);if(!out)return '';
    const canvas=document.createElement('canvas');canvas.width=out.w;canvas.height=out.h;
    const context=canvas.getContext('2d');if(!context)return '';
    context.drawImage(source,0,0,out.w,out.h);
    // Encoding WebP synchronously (toDataURL) can block the next camera
    // frame. Let Chromium encode the immutable bitmap asynchronously.
    if(typeof canvas.toBlob==='function'&&typeof FileReader==='function'){
      const encoded=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));
      if(encoded)return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(encoded)});
    }
    return canvas.toDataURL('image/webp',.84);
  }finally{bitmap?.close();if(objectUrl)URL.revokeObjectURL(objectUrl)}
}
function udPhotoSchedule(){if(!udPhotoPumpTimer&&udPhotoRunning<UD_PHOTO_WORKERS)udPhotoPumpTimer=setTimeout(()=>{udPhotoPumpTimer=0;udPhotoPump()},0)}
function udPhotoPump(){
  const limit=state.boardDrag?.kind==='pan'?1:UD_PHOTO_WORKERS;
  for(const [key,job] of udPhotoJobs){
    if(udPhotoRunning>=limit)break;
    if(job.running)continue;if(!udPhotoLive(job)){udPhotoJobs.delete(key);continue}
    job.running=true;udPhotoRunning++;
    // Do not overwrite a new version of the photo or resurrect an old scene.
    Promise.resolve().then(()=>udPhotoMake(job)).then(url=>({url:url||job.sourceUrl||'',level:url?job.tier:job.sourceLevel||0})).catch(()=>job.sourceUrl?{url:job.sourceUrl,level:job.sourceLevel}:{url:getMediaUrl(job.id),level:0}).then(({url,level})=>{
      if(udPhotoJobs.get(key)!==job)return;
      if(level===job.tier&&url&&url.startsWith('data:')&&url.length<UD_PHOTO_CACHE_BYTES&&udPhotoLive(job))udPhotoCachePut(key,job.id,url,job.sourceUrl);
      for(const node of job.waiters)udPhotoPaint(node,key,url||'',level);
    }).finally(()=>{if(udPhotoJobs.get(key)===job)udPhotoJobs.delete(key);udPhotoRunning--;udPhotoSchedule()});
  }
}
function udPhotoRequest(frame,z,{force=false}={}){
  const id=frame.dataset.udBoardMedia,networkTier=udPhotoFrameTier(frame,z),tier=udPhotoDisplayTier(frame,z),key=udPhotoKey(id,tier);
  if(!force&&frame._udPhotoGoal===key)return;
  frame._udPhotoGoal=key;
  let preview=null;
  if(typeof udNetOriginalAvailable==='function'&&!udNetOriginalAvailable(id)){
    preview=udNetPhotoSource(id,networkTier);
    if(!preview||!tier||preview.level<=tier){udPhotoPaint(frame,key,preview?.url||'',preview?.level??tier);return}
  }else if(tier&&typeof udNetPlayerLive==='function'&&udNetPlayerLive()){
    preview=udNetPreview(id,tier)||(tier<256?udNetPreview(id,256):null)||(networkTier>tier?udNetPreview(id,networkTier):null);
    if(preview&&preview.level<=tier){udPhotoPaint(frame,key,preview.url,preview.level);return}
  }
  if(!preview&&window.UG_ONLINE_PLAYER&&onp.copy&&!UniverseGraphStorage.mediaGet(id)){
    preview=[networkTier,256,512,1024].map(level=>onp.copyPreviews?.get(udNetVariantKey(id,level))).find(Boolean);
    if(preview&&(!tier||preview.level<=tier)){udPhotoPaint(frame,key,preview.url,preview.level);return}
  }
  if(!tier){udPhotoPaint(frame,key,getMediaUrl(id));return}
  const cached=udPhotoCached(key,preview?.url);if(cached){udPhotoPaint(frame,key,cached.url);return}
  // A new DOM card can reuse a nearby cached level immediately. A live card
  // keeps its previous source until the requested level is decoded.
  const image=frame.querySelector('img[data-ud-photo-image]');
  if(!image?.getAttribute('src')){
    if(preview){udPhotoPaint(frame,key,preview.url,preview.level);delete frame._udPhotoApplied}
    else for(const level of [64,128,256,512,1024]){const other=udPhotoCached(udPhotoKey(id,level));if(other){udPhotoPaint(frame,key,other.url,level);delete frame._udPhotoApplied;break}}
  }
  let job=udPhotoJobs.get(key);
  if(job&&job.sourceUrl!==preview?.url){job.waiters.clear();udPhotoJobs.delete(key);job=null}
  if(!job){job={key,id,tier,w:Number(frame.dataset.udPhotoWidth),h:Number(frame.dataset.udPhotoHeight),sourceUrl:preview?.url,sourceLevel:preview?.level,waiters:new Set(),running:false};udPhotoJobs.set(key,job)}
  job.waiters.add(frame);udPhotoSchedule();
}
function udPhotoDispose(stage){
  const ctx=stage?._udPhotoState;if(!ctx)return;
  cancelAnimationFrame(ctx.raf);ctx.observer?.disconnect();ctx.frames.clear();ctx.urgent.clear();ctx.queue=[];delete stage._udPhotoState;
}
function udPhotoDrain(ctx){
  if(ctx.raf)return;
  ctx.raf=requestAnimationFrame(()=>{
    ctx.raf=0;if(!ctx.stage.isConnected||ctx.stage._udPhotoState!==ctx)return;
    const start=performance.now(),panning=state.boardDrag?.kind==='pan';let count=0;
    while(ctx.urgent.size||ctx.index<ctx.queue.length){
      const frame=ctx.urgent.size?ctx.urgent.values().next().value:ctx.queue[ctx.index++];
      ctx.urgent.delete(frame);
      if(frame.isConnected&&ctx.stage.contains(frame)){udPhotoRequest(frame,state.boardZoom||1);count++}
      if(count>=(panning?6:12)||performance.now()-start>=(panning?2.5:4))break;
    }
    if(ctx.urgent.size||ctx.index<ctx.queue.length)udPhotoDrain(ctx);else{ctx.queue=[];ctx.index=0}
  });
}
function udPhotoRegister(ctx,frames){
  for(const frame of ctx.frames)if(!ctx.stage.contains(frame)){ctx.observer?.unobserve(frame);ctx.frames.delete(frame);ctx.urgent.delete(frame)}
  for(const frame of frames){if(ctx.frames.has(frame))continue;ctx.frames.add(frame);ctx.observer?.observe(frame);ctx.urgent.add(frame)}
}
function udPhotoStage(stage){
  if(stage._udPhotoState)return stage._udPhotoState;
  const ctx=stage._udPhotoState={stage,frames:new Set(),urgent:new Set(),queue:[],index:0,raf:0,observer:null};
  if(typeof IntersectionObserver==='function'){
    ctx.observer=new IntersectionObserver(entries=>{
      if(!stage.isConnected||stage._udPhotoState!==ctx)return;
      for(const {target,isIntersecting} of entries){
        if(!ctx.frames.has(target))continue;
        const was=target._udPhotoNear;target._udPhotoNear=isIntersecting;
        if((state.boardZoom||1)>=.5&&(isIntersecting||was===true))ctx.urgent.add(target);
      }
      if(ctx.urgent.size)udPhotoDrain(ctx);
    },{root:stage.parentElement,rootMargin:'160px'});
  }
  udPhotoRegister(ctx,stage.querySelectorAll('[data-ud-board-media]'));
  return ctx;
}
function udSyncBoardPhotos(stage,z=state.boardZoom||1,changed=null){
  if(!stage)return;
  if(udPhotoManaged(stage)){
    const ctx=udPhotoStage(stage),key=[udPhotoTier(z),z<.1?'tiny':z<.2?'far':'normal',udPhotoDpr()].join(':');
    if(changed){
      const frames=changed.flatMap(card=>[...card.querySelectorAll('[data-ud-board-media]')]);udPhotoRegister(ctx,frames);
      // Selection swaps only a few nodes; reuse their cached image before the
      // next paint instead of showing a one-frame empty replacement.
      for(const frame of frames){ctx.urgent.delete(frame);udPhotoRequest(frame,z)}
    }
    if(ctx.key!==key){ctx.key=key;ctx.queue=[...ctx.frames];ctx.index=0;ctx.urgent.clear();udPhotoDrain(ctx)}
    return;
  }
  const tier=udPhotoTier(z);
  if(!changed&&stage._udPhotoTier===tier)return;
  if(!changed)stage._udPhotoTier=tier;
  const frames=changed?changed.flatMap(card=>[...card.querySelectorAll('[data-ud-board-media]')]):stage.querySelectorAll('[data-ud-board-media]');
  for(const frame of frames)udPhotoRequest(frame,z);
}
function udRefreshBoardMedia(ids){
  const stage=$('#detectiveView .boardStage');if(!stage)return;
  const wanted=new Set(ids.map(String));
  for(const frame of stage._udPhotoState?.frames||stage.querySelectorAll('[data-ud-board-media]'))if(frame.isConnected&&wanted.has(frame.dataset.udBoardMedia))udPhotoRequest(frame,state.boardZoom||1,{force:true});
}
