// Display-only photo mip levels. The original ID, stored bytes, dimensions and
// paper geometry never change. Jobs are limited and only paint live consumers.
'use strict';
const UD_PHOTO_CACHE_BYTES=32*1024*1024,UD_PHOTO_CACHE_COUNT=2000,UD_PHOTO_WORKERS=2;
const udPhotoCache=new Map(),udPhotoJobs=new Map();let udPhotoCacheBytes=0,udPhotoRunning=0,udPhotoPumpTimer=0;
function udPhotoTier(z){return z>=1?0:z>=.5?1024:z>=.2?512:256}
function udPhotoSize(w,h,tier){
  if(!tier||!(w>0&&h>0))return null;
  const scale=Math.min(1,tier/Math.max(w,h));return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale))};
}
function udPhotoKey(id,tier){return JSON.stringify([id,tier])}
function udPhotoCached(key){const row=udPhotoCache.get(key);if(row){udPhotoCache.delete(key);udPhotoCache.set(key,row)}return row}
function udPhotoCachePut(key,id,url){
  const old=udPhotoCache.get(key);if(old)udPhotoCacheBytes-=old.url.length;
  udPhotoCache.delete(key);udPhotoCache.set(key,{id,url});udPhotoCacheBytes+=url.length;
  while(udPhotoCache.size>UD_PHOTO_CACHE_COUNT||udPhotoCacheBytes>UD_PHOTO_CACHE_BYTES){const first=udPhotoCache.keys().next().value;udPhotoCacheBytes-=udPhotoCache.get(first).url.length;udPhotoCache.delete(first)}
}
function udPhotoInvalidate(ids){
  const set=new Set((Array.isArray(ids)?ids:[ids]).map(String));
  for(const [key,row] of udPhotoCache)if(set.has(row.id)){udPhotoCacheBytes-=row.url.length;udPhotoCache.delete(key)}
  for(const [key,job] of udPhotoJobs)if(set.has(job.id)){udPhotoJobs.delete(key);job.waiters.clear()}
}
function udPhotoFrameTier(frame,z){
  const tier=udPhotoTier(z),w=Number(frame.dataset.udPhotoWidth),h=Number(frame.dataset.udPhotoHeight);
  return tier&&w>0&&h>0&&Math.max(w,h)<=tier?0:tier;
}
function udPhotoPaint(frame,key,url,level=JSON.parse(key)[1]){
  if(!frame.isConnected||frame._udPhotoGoal!==key)return;
  const image=frame.querySelector('img[data-ud-photo-image]'),notice=frame.querySelector('[data-ud-photo-message]'),resize=frame.querySelector('.udPhotoResize');
  if(!image)return;
  if(url){if(image.getAttribute('src')!==url)image.src=url;image.hidden=false;image.dataset.udPhotoLevel=String(level);if(notice)notice.hidden=true;if(resize)resize.hidden=false;frame._udPhotoApplied=key;return}
  image.removeAttribute('src');image.hidden=true;delete image.dataset.udPhotoLevel;
  if(notice){notice.hidden=false;notice.textContent=window.UG_ONLINE_PLAYER&&onpImagePending(frame.dataset.udBoardMedia)?'Снимок загружается…':'нет снимка'}
  if(resize)resize.hidden=true;frame._udPhotoApplied=key;
}
function udPhotoLive(job){for(const node of job.waiters)if(!node.isConnected||node._udPhotoGoal!==job.key)job.waiters.delete(node);return job.waiters.size>0}
async function udPhotoMake(job){
  const row=UniverseGraphStorage.mediaGet(job.id);if(!row?.data||!row.mime)return '';
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
    context.drawImage(source,0,0,out.w,out.h);return canvas.toDataURL('image/webp',.84);
  }finally{bitmap?.close();if(objectUrl)URL.revokeObjectURL(objectUrl)}
}
function udPhotoSchedule(){if(!udPhotoPumpTimer&&udPhotoRunning<UD_PHOTO_WORKERS)udPhotoPumpTimer=setTimeout(()=>{udPhotoPumpTimer=0;udPhotoPump()},0)}
function udPhotoPump(){
  for(const [key,job] of udPhotoJobs){
    if(udPhotoRunning>=UD_PHOTO_WORKERS)break;
    if(job.running)continue;if(!udPhotoLive(job)){udPhotoJobs.delete(key);continue}
    job.running=true;udPhotoRunning++;
    // Do not overwrite a new version of the photo or resurrect an old scene.
    Promise.resolve().then(()=>udPhotoMake(job)).then(url=>({url,level:job.tier})).catch(()=>({url:getMediaUrl(job.id),level:0})).then(({url,level})=>{
      if(udPhotoJobs.get(key)!==job)return;
      if(level&&url&&url.startsWith('data:')&&url.length<UD_PHOTO_CACHE_BYTES&&udPhotoLive(job))udPhotoCachePut(key,job.id,url);
      for(const node of job.waiters)udPhotoPaint(node,key,url||'',level);
    }).finally(()=>{if(udPhotoJobs.get(key)===job)udPhotoJobs.delete(key);udPhotoRunning--;udPhotoSchedule()});
  }
}
function udPhotoRequest(frame,z,{force=false}={}){
  const id=frame.dataset.udBoardMedia,tier=udPhotoFrameTier(frame,z),key=udPhotoKey(id,tier);
  if(!force&&frame._udPhotoGoal===key)return;
  frame._udPhotoGoal=key;
  if(typeof udNetOriginalAvailable==='function'&&!udNetOriginalAvailable(id)){
    const preview=udNetPhotoSource(id,tier);udPhotoPaint(frame,key,preview?.url||'',preview?.level??tier);return;
  }
  if(tier&&typeof udNetPlayerLive==='function'&&udNetPlayerLive()){const preview=udNetPreview(id,tier);if(preview){udPhotoPaint(frame,key,preview.url,preview.level);return}}
  if(window.UG_ONLINE_PLAYER&&onp.copy&&!UniverseGraphStorage.mediaGet(id)){
    const preview=[tier,256,512,1024].map(level=>onp.copyPreviews?.get(udNetVariantKey(id,level))).find(Boolean);if(preview){udPhotoPaint(frame,key,preview.url,preview.level);return}
  }
  if(!tier){udPhotoPaint(frame,key,getMediaUrl(id));return}
  const cached=udPhotoCached(key);if(cached){udPhotoPaint(frame,key,cached.url);return}
  // A new DOM card can reuse a nearby cached level immediately. A live card
  // keeps its previous source until the requested level is decoded.
  const image=frame.querySelector('img[data-ud-photo-image]');
  if(!image?.getAttribute('src')){
    for(const level of [256,512,1024]){const other=udPhotoCached(udPhotoKey(id,level));if(other){udPhotoPaint(frame,key,other.url,level);delete frame._udPhotoApplied;break}}
  }
  let job=udPhotoJobs.get(key);if(!job){job={key,id,tier,w:Number(frame.dataset.udPhotoWidth),h:Number(frame.dataset.udPhotoHeight),waiters:new Set(),running:false};udPhotoJobs.set(key,job)}
  job.waiters.add(frame);udPhotoSchedule();
}
function udSyncBoardPhotos(stage,z=state.boardZoom||1,changed=null){
  if(!stage)return;const tier=udPhotoTier(z);
  if(!changed&&stage._udPhotoTier===tier)return;
  if(!changed)stage._udPhotoTier=tier;
  const frames=changed?changed.flatMap(card=>[...card.querySelectorAll('[data-ud-board-media]')]):stage.querySelectorAll('[data-ud-board-media]');
  for(const frame of frames)udPhotoRequest(frame,z);
}
function udRefreshBoardMedia(ids){
  const stage=$('#detectiveView .boardStage');if(!stage)return;
  const wanted=new Set(ids.map(String));
  for(const frame of stage.querySelectorAll('[data-ud-board-media]'))if(wanted.has(frame.dataset.udBoardMedia))udPhotoRequest(frame,state.boardZoom||1,{force:true});
}
