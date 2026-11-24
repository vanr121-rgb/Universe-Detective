// Versioned media transport. No derivatives or cache metadata enter the world
// document. All requests are authorized against the current host projection.
'use strict';
const UD_NET_MEDIA_CHUNK=256*1024,UD_NET_MEDIA_CATALOG=256,UD_NET_MEDIA_BATCH=16,UD_NET_MEDIA_BYTES=Math.ceil(8*1024*1024/3)*4;
const UD_NET_WINDOW_MAX=6;
function udNetWindowSize(n){return Number.isSafeInteger(n)?Math.max(1,Math.min(UD_NET_WINDOW_MAX,n)):1}
function udNetAdaptiveWindow(current,bytes,elapsed,rtt){
  current=udNetWindowSize(current);if(bytes<128*1024||!Number.isFinite(elapsed)||elapsed<=0)return current;
  rtt=Math.max(0,Math.min(2000,Number(rtt)||0));
  const rate=bytes/Math.max(20,elapsed-rtt),target=udNetWindowSize(Math.ceil(rate*rtt/(192*1024))+2);
  if(elapsed>Math.max(1800,rtt*3+900)&&rate<200)return Math.max(1,Math.floor(current/2));
  return current+Math.sign(target-current);
}
function udNetRequestedWindow(priority){return priority<4&&udNetPlayerBusy()?1:udNetWindowSize(udNetPlayer.window)}
function udNetWindowStart(t){t.windowStarted=performance.now();t.windowBytes=0;t.windowFrames=0}
function udNetWindowSample(t){const p=udNetPlayer,elapsed=performance.now()-t.windowStarted;if(t.windowBytes>=128*1024){const ping=typeof prs!=='undefined'?prs.ping:0;p.window=udNetAdaptiveWindow(p.window,t.windowBytes,elapsed,ping);p.stats.mbps=Math.round(t.windowBytes*8/Math.max(1,elapsed)/1000*100)/100}p.stats.windows++;p.stats.window=p.window}
function udNetWindowLoss(){const p=udNetPlayer;p.window=Math.max(1,Math.floor(p.window/2));p.stats.retries++;p.stats.window=p.window}
function udNetHostWindow(requested){const active=[...onh.conns.values()].filter(x=>x.mediaV2Transfer).length;return Math.min(udNetWindowSize(requested),Math.max(1,Math.floor(12/Math.max(1,active))))}
let udNetHostControlAt=0,udNetHostFrameAt=0;
function udNetNoteControl(m){if(typeof m?.d==='string'&&!m.d.startsWith('{"t":"mediaData2"'))udNetHostControlAt=Date.now()}
async function udNetHostFrameTurn(){const now=Date.now(),at=Math.max(now,udNetHostControlAt+8,udNetHostFrameAt+5);udNetHostFrameAt=at;await new Promise(resolve=>setTimeout(resolve,at-now))}
const udNetPlayer={zone:null,identity:null,session:null,allowed:new Set(),catalog:new Map(),catalogAt:0,index:null,request:null,seq:0,generation:0,timer:0,loaded:new Map(),partial:new Map(),absent:new Set(),demand:new Map(),boardWanted:new Map(),priorityTimer:0,next:0,previews:new Map(),checked:new Set(),loading:false,window:4,stats:{window:4,retries:0,windows:0,bytes:0,frames:0,mbps:0}};
const udNetHostPreviews=new Map(),udNetHostPreviewJobs=new Map();let udNetHostPreviewBytes=0,udNetHostPreviewWorkers=0;const udNetHostPreviewQueue=[];
function udNetValidRevision(rev){return typeof rev==='string'&&/^[0-9a-f]{64}$/.test(rev)}
function udNetMediaBytes(data){return typeof Uint8Array.fromBase64==='function'?Uint8Array.fromBase64(data):Uint8Array.from(atob(data),c=>c.charCodeAt(0))}
function udNetBytesBase64(bytes){if(typeof bytes.toBase64==='function')return bytes.toBase64();const parts=[];for(let i=0;i<bytes.length;i+=16384)parts.push(String.fromCharCode(...bytes.subarray(i,i+16384)));return btoa(parts.join(''))}
function udNetDecodeWire(wire){
  if(!(wire instanceof ArrayBuffer)||wire.byteLength<5||wire.byteLength>512*1024)return null;
  const bytes=new Uint8Array(wire),length=new DataView(wire).getUint32(0);if(length<1||length>64*1024||length+4>bytes.length)return null;
  let header;try{header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(4,4+length)))}catch{return null}
  const packet=header?.packet;if(packet?.t!=='mediaData2'||packet.binary!==true||!Array.isArray(packet.items)||!packet.items.length||packet.items.length>UD_NET_MEDIA_BATCH)return null;
  let offset=4+length;for(const item of packet.items){if(!item||!Number.isSafeInteger(item.bytes)||item.bytes<1||item.bytes>192*1024||offset+item.bytes>bytes.length||Object.hasOwn(item,'data'))return null;item.data=udNetBytesBase64(bytes.subarray(offset,offset+item.bytes));offset+=item.bytes;delete item.bytes}
  return offset===bytes.length?packet:null;
}
async function udNetHash(data){
  const bytes=udNetMediaBytes(data);
  const digest=globalThis.crypto?.subtle?await crypto.subtle.digest('SHA-256',bytes):UDOnlineCrypto.sha256(bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function udNetReadInfo(ids){
  const native=UniverseGraphStorage.mediaInfo?.(ids);if(Array.isArray(native))return native;
  const out=[];for(const id of ids){const m=UniverseGraphStorage.mediaGet(id);if(!m?.data||!m.mime)continue;const rev=await udNetHash(m.data);if(!rev)continue;out.push({id,rev,mime:m.mime,width:Number(m.width)||0,height:Number(m.height)||0,size:udNetMediaBytes(m.data).length})}return out;
}
function udNetHostLive(c,x,zone){return onh.conns.get(c)===x&&x.state==='in'&&x.mediaV2&&udZoneOf(x)===zone&&partAllowed(partGet(x.partId),zone)}
function udNetHostAllowed(c,x,zone,id){return udNetHostLive(c,x,zone)&&udInZone(zone,()=>onhMediaIds(onhSnapText()).has(id))}
async function udNetHostCatalog(c,x,q){
  if(!x.mediaV2||!Number.isSafeInteger(q.request)||!Array.isArray(q.ids)||q.ids.length>UD_NET_MEDIA_CATALOG)return;
  const now=Date.now();if(x.mediaCatalogAt&&now-x.mediaCatalogAt<100)return;x.mediaCatalogAt=now;
  const zone=udZoneOf(x),ids=[...new Set(q.ids.filter(id=>typeof id==='string'&&id.length<=180))].filter(id=>udNetHostAllowed(c,x,zone,id));
  const items=await udNetReadInfo(ids);if(!udNetHostLive(c,x,zone))return;
  onhSend(c,{t:'mediaCatalog2',workspace:zone,request:q.request,items:items.filter(m=>udNetHostAllowed(c,x,zone,m.id))});
}
function udNetVariantKey(id,level){return JSON.stringify([id,level])}
function udNetValidLevel(level){return [0,256,512,1024].includes(level)}
function udNetHostPreviewPump(){
  while(udNetHostPreviewWorkers<2&&udNetHostPreviewQueue.length){const job=udNetHostPreviewQueue.shift();udNetHostPreviewWorkers++;
    Promise.resolve().then(async()=>{
      const url=await udPhotoMake({id:job.info.id,w:job.info.width,h:job.info.height,tier:job.level});if(!url)return null;
      const at=url.indexOf(','),mime=url.slice(5,at).split(';')[0],data=url.slice(at+1),digest=await udNetHash(data);if(!digest)return null;
      const [current]=await udNetReadInfo([job.info.id]);if(current?.rev!==job.info.rev)return null;
      const row={mime,data,digest};udNetHostPreviews.set(job.key,row);udNetHostPreviewBytes+=data.length;
      while(udNetHostPreviewBytes>64*1024*1024||udNetHostPreviews.size>3000){const key=udNetHostPreviews.keys().next().value;udNetHostPreviewBytes-=udNetHostPreviews.get(key).data.length;udNetHostPreviews.delete(key)}
      return row;
    }).catch(()=>null).then(job.resolve).finally(()=>{udNetHostPreviewJobs.delete(job.key);udNetHostPreviewWorkers--;udNetHostPreviewPump()});
  }
}
function udNetHostPreview(info,level){
 const key=JSON.stringify([info.id,info.rev,level]),cached=udNetHostPreviews.get(key);
 if(cached){udNetHostPreviews.delete(key);udNetHostPreviews.set(key,cached);return Promise.resolve(cached)}
 if(udNetHostPreviewJobs.has(key))return udNetHostPreviewJobs.get(key);
 const pending=new Promise(resolve=>udNetHostPreviewQueue.push({key,info,level,resolve}));udNetHostPreviewJobs.set(key,pending);udNetHostPreviewPump();return pending;
}
async function udNetHostFile(c,x,transfer,entry){
  const zone=transfer.zone;if(!udNetHostAllowed(c,x,zone,entry.id))return null;
  const [info]=await udNetReadInfo([entry.id]);if(!info||info.rev!==entry.rev||!udNetHostAllowed(c,x,zone,entry.id))return null;
  let row=entry.level?await udNetHostPreview(info,entry.level):null;
  if(!row){const original=UniverseGraphStorage.mediaGet(entry.id);if(!original?.data)return null;row={mime:original.mime,data:original.data,digest:info.rev}}
  if(row.data.length>UD_NET_MEDIA_BYTES||!udNetHostAllowed(c,x,zone,entry.id))return null;
  return {id:entry.id,rev:entry.rev,level:entry.level,mime:row.mime,digest:row.digest,data:row.data,offset:entry.offset};
}
function udNetHostStart(c,x,q){
  if(!x.mediaV2||!Number.isSafeInteger(q.request)||!Array.isArray(q.entries)||q.entries.length<1||q.entries.length>UD_NET_MEDIA_BATCH)return;
  const entries=[],seen=new Set();for(const e of q.entries){const key=udNetVariantKey(e?.id,e?.level);if(!e||typeof e.id!=='string'||e.id.length>180||!udNetValidRevision(e.rev)||!udNetValidLevel(e.level)||!Number.isSafeInteger(e.offset)||e.offset<0||e.offset>UD_NET_MEDIA_BYTES||seen.has(key))return;seen.add(key);entries.push({...e})}
  const now=Date.now();if(x.mediaFetchAt&&now-x.mediaFetchAt<25)return;x.mediaFetchAt=now;
  const transfer={zone:udZoneOf(x),request:q.request,entries,step:0,current:null,busy:false,window:udNetWindowSize(q.window),waiting:false};x.mediaV2Transfer=transfer;return udNetHostNext(c,x,transfer);
}
async function udNetHostNext(c,x,t){
  if(t.busy||x.mediaV2Transfer!==t||!udNetHostLive(c,x,t.zone))return;t.busy=true;t.waiting=false;
  try{
   const window=udNetHostWindow(t.window);for(let frame=0;frame<window;frame++){
    const items=[],missing=[];let bytes=0;
    while(t.current||t.entries.length){
      if(!t.current){const entry=t.entries.shift(),file=await udNetHostFile(c,x,t,entry);if(x.mediaV2Transfer!==t||!udNetHostLive(c,x,t.zone))return;if(!file||file.offset>=file.data.length){missing.push(entry);continue}t.current=file}
      const f=t.current;if(!udNetHostAllowed(c,x,t.zone,f.id)){missing.push({id:f.id,rev:f.rev,level:f.level});t.current=null;continue}
      const part=f.data.slice(f.offset,f.offset+UD_NET_MEDIA_CHUNK);if(bytes+part.length>UD_NET_MEDIA_CHUNK)break;
      const offset=f.offset;f.offset+=part.length;bytes+=part.length;items.push({id:f.id,rev:f.rev,level:f.level,mime:f.mime,digest:f.digest,total:f.data.length,offset,data:part});if(f.offset===f.data.length)t.current=null;
      if(bytes>=UD_NET_MEDIA_CHUNK)break;
    }
    await udNetHostFrameTurn();if(x.mediaV2Transfer!==t||!udNetHostLive(c,x,t.zone))return;
    const done=!t.current&&!t.entries.length,windowEnd=done||frame===window-1;
    if(windowEnd)t.waiting=true;
    onhSend(c,{t:'mediaData2',workspace:t.zone,request:t.request,step:++t.step,items:items.filter(m=>udNetHostAllowed(c,x,t.zone,m.id)),missing,done,windowEnd,binary:!!x.mediaBinary});
    if(done){x.mediaV2Transfer=null;break}if(windowEnd)break;
    // Give input, mutations and presence messages an event-loop turn between
    // chunks. Never queue an unbounded blob in a single WebSocket message.
    await new Promise(resolve=>setTimeout(resolve,0));if(x.mediaV2Transfer!==t||!udNetHostLive(c,x,t.zone))return;
   }
  }finally{t.busy=false}
}
function udNetHostMessage(c,x,q){if(q.t==='mediaCatalog2')return udNetHostCatalog(c,x,q);if(q.t==='mediaGet2')return udNetHostStart(c,x,q);if(q.t==='mediaNext2'){const t=x.mediaV2Transfer;if(t?.waiting&&!t.busy&&q.request===t.request&&q.step===t.step){t.window=udNetWindowSize(q.window);return udNetHostNext(c,x,t)}}}

function udNetIdentity(){return JSON.stringify([window.UG_ONLINE_PLAYER?.room||'',onp.me?.id||'',onp.world?.id||''])}
function udNetCacheKey(identity,id,rev,level){return JSON.stringify([identity,id,rev,level])}
function udNetRecordOK(row,info,level){return !!row&&row.id===info.id&&row.rev===info.rev&&row.level===level&&typeof row.data==='string'&&row.data.length>0&&row.data.length<=UD_NET_MEDIA_BYTES&&MEH_MEDIA_ACCEPT_MIMES.includes(row.mime)&&(level!==0?udNetValidRevision(row.digest):row.mime===info.mime&&row.data.length===Math.ceil(info.size/3)*4)}
function udNetPlayerLive(){return !!window.UG_ONLINE_PLAYER&&onp.mediaV2&&onp.state==='in'&&!onp.copy&&onp.world?.id===udNetPlayer.zone&&udNetPlayer.session===onp.ws&&udNetPlayer.identity===udNetIdentity()}
function udNetPlayerReset(){
  clearTimeout(udNetPlayer.timer);clearTimeout(udNetPlayer.priorityTimer);Object.assign(udNetPlayer,{zone:null,identity:null,session:null,allowed:new Set(),catalog:new Map(),index:null,request:null,timer:0,priorityTimer:0,absent:new Set(),demand:new Map(),boardWanted:new Map(),next:0,previews:new Map(),checked:new Set(),seen:new Set(),loading:false,generation:udNetPlayer.generation+1});
}
function udNetClearMemory(){const p=udNetPlayer;for(const id of p.loaded.keys()){UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}p.loaded.clear();p.partial.clear();udNetPlayerReset();p.window=4;p.stats={window:4,retries:0,windows:0,bytes:0,frames:0,mbps:0};onp.copyPreviews=new Map()}
function udNetSyncWorldAccess(world){
  if(!onp.mediaV2||onp.copy)return;
  const p=udNetPlayer,identity=udNetIdentity(),ids=new Set(mediaDataIdsFromData(world));
  if(p.zone!==world.id||p.session!==onp.ws||p.identity!==identity){udNetPlayerReset();Object.assign(p,{zone:world.id,session:onp.ws,identity})}
  if(ids.size===p.allowed.size&&[...ids].every(id=>p.allowed.has(id)))return;
  clearTimeout(p.timer);p.timer=0;p.generation++;p.index=null;p.request=null;p.loading=false;
  for(const id of p.allowed)if(!ids.has(id)){p.catalog.delete(id);p.absent.delete(id);for(const level of [0,256,512,1024]){const key=udNetVariantKey(id,level);p.demand.delete(key);p.previews.delete(key)}invalidateMediaCache(id)}
  p.allowed=ids;
}
function udNetOriginalAvailable(id){
  if(!window.UG_ONLINE_PLAYER||!onp.mediaV2||onp.copy||onp.state!=='in')return true;
  const p=udNetPlayer,info=p.catalog.get(id),loaded=p.loaded.get(id);
  if(!p.allowed.has(id))return !loaded&&!p.allowed.has(id)&&!onpImages.ids.has(id); // locally created, not downloaded data
  return !!info&&loaded===udNetCacheKey(p.identity,id,info.rev,0)&&!!UniverseGraphStorage.mediaGet(id);
}
function udNetDemand(id,level,priority=1){if(udNetPlayerLive()&&udNetPlayer.allowed.has(id)&&!udNetVariantAvailable(id,level)){const key=udNetVariantKey(id,level),old=udNetPlayer.demand.get(key);udNetPlayer.demand.set(key,{id,level,priority:Math.max(priority,old?.priority||0)});udNetKick()}}
function udNetDemandOriginal(id){udNetDemand(id,0,6)}
async function udNetEnsureOriginals(ids){
  if(!udNetPlayerLive())return;const p=udNetPlayer,scope=p.identity,wanted=[...new Set(ids)].filter(id=>!udNetOriginalAvailable(id));
  if(!wanted.length)return;const deadline=Date.now()+120000;
  while(udNetPlayerLive()&&p.identity===scope&&Date.now()<deadline){
    const missing=wanted.filter(id=>!udNetOriginalAvailable(id));if(!missing.length)return;
    if(missing.some(id=>!p.allowed.has(id)||p.absent.has(id)))break;
    for(const id of missing)udNetDemandOriginal(id);await new Promise(resolve=>setTimeout(resolve,175));
  }throw Error('Не удалось получить все оригиналы. Проверьте соединение и повторите действие.');
}
function udNetPreview(id,level){const p=udNetPlayer,info=p.catalog.get(id),row=p.previews.get(udNetVariantKey(id,level));return row&&info?.rev===row.rev&&p.allowed.has(id)?row:null}
function udNetVariantAvailable(id,level){return level===0?udNetOriginalAvailable(id):!!udNetPreview(id,level)}
function udNetPhotoSource(id,level){
  if(!udNetPlayerLive()||!udNetPlayer.allowed.has(id))return null;
  const best=[level,...[256,512,1024].filter(x=>x!==level)].filter(Boolean).map(l=>udNetPreview(id,l)).find(Boolean);
  udNetSchedulePriority();
  return best?{url:best.url,level:best.level}:null;
}
function udNetPhotoPriority(rect,view,selected){
  if(selected)return 5;
  const intersects=(padX,padY)=>rect.right>=view.left-padX&&rect.left<=view.right+padX&&rect.bottom>=view.top-padY&&rect.top<=view.bottom+padY;
  return intersects(0,0)?4:intersects(view.width*.65,view.height*.65)?3:2;
}
function udNetSchedulePriority(){const p=udNetPlayer;if(!udNetPlayerLive()||p.priorityTimer)return;p.priorityTimer=setTimeout(()=>{p.priorityTimer=0;udNetReprioritize()},80)}
function udNetCameraChanged(){if(udNetPlayerLive()){udNetPlayer.cameraAt=performance.now();udNetSchedulePriority()}}
function udNetPlayerBusy(){return !!state.boardDrag||!!onp.outbox?.length||!!onp.notesFlight||(onp.ws?.bufferedAmount||0)>256*1024||performance.now()-(udNetPlayer.cameraAt||-10000)<180}
function udNetReprioritize(){
  const p=udNetPlayer;if(!udNetPlayerLive())return;
  const v=$('#detectiveView'),stage=v?.querySelector('.boardStage'),wanted=new Map();
  if(stage){const clip=v.getBoundingClientRect();for(const frame of stage.querySelectorAll('[data-ud-board-media]')){
    const id=frame.dataset.udBoardMedia;if(!p.allowed.has(id)||udNetOriginalAvailable(id))continue;
    const priority=udNetPhotoPriority(frame.getBoundingClientRect(),clip,frame.closest('.boardCard')?.classList.contains('selected'));
    const info=p.catalog.get(id),small=info&&Math.max(info.width,info.height)>0&&Math.max(info.width,info.height)<=256;
    const tier=udPhotoFrameTier(frame,state.boardZoom||1),preview=[256,512,1024].some(level=>udNetVariantAvailable(id,level));
    const level=small?0:!preview?256:priority>=4?tier:256;
    if(udNetVariantAvailable(id,level))continue;
    if(priority<4&&info&&p.seen?.has(udNetCacheKey(p.identity,id,info.rev,level)))continue;
    const key=udNetVariantKey(id,level),old=wanted.get(key);if(!old||old.priority<priority)wanted.set(key,{id,level,priority});
  }}
  p.boardWanted=wanted;
  const top=Math.max(0,...[...wanted.values(),...p.demand.values()].map(d=>d.priority));
  if(p.request&&top>p.request.priority&&Date.now()-(p.preemptAt||0)>220){clearTimeout(p.timer);p.timer=0;p.request=null;p.preemptAt=Date.now()}
  udNetKick();
}
function udNetAskMedia(world){udNetSyncWorldAccess(world);udNetSchedulePriority();udNetKick()}
function udNetKick(){const p=udNetPlayer;if(!udNetPlayerLive()||p.timer||p.index||p.request||p.loading)return;p.timer=setTimeout(()=>{p.timer=0;udNetPump()},Math.max(0,p.next-Date.now()))}
function udNetDeadline(kind,request){const p=udNetPlayer;clearTimeout(p.timer);p.timer=setTimeout(()=>{p.timer=0;if(p[kind]!==request)return;if(kind==='request'){udNetCheckpointPartials(request);udNetWindowLoss()}p[kind]=null;udNetKick()},12000)}
async function udNetPump(){
  const p=udNetPlayer;if(!udNetPlayerLive()||p.index||p.request||p.loading)return;
  p.next=Date.now()+150;
  const unchecked=[...p.allowed].filter(id=>!p.catalog.has(id)&&!p.absent.has(id)).slice(0,UD_NET_MEDIA_CATALOG);
  if(unchecked.length){const index={request:++p.seq,ids:unchecked,generation:p.generation};p.index=index;udNetDeadline('index',index);onpSend({t:'mediaCatalog2',request:index.request,ids:unchecked});return}
  const entries=[],generation=p.generation;p.loading=true;
  const queue=new Map(p.boardWanted);for(const [key,d] of p.demand)queue.set(key,d);
  if(![...queue.values()].some(d=>d.priority>=4)&&udNetPlayerBusy()){p.loading=false;p.next=Date.now()+180;udNetKick();return}
  let priority=0;
  try{for(const d of [...queue.values()].sort((a,b)=>b.priority-a.priority)){
    const info=p.catalog.get(d.id);if(!info||!p.allowed.has(d.id)||udNetVariantAvailable(d.id,d.level))continue;
    const key=udNetCacheKey(p.identity,d.id,info.rev,d.level);
    if(!p.checked.has(key)){const cached=await onpIdbGet('mediaV2',key);if(p.generation!==generation||!udNetPlayerLive())return;p.checked.add(key);if(udNetRecordOK(cached,info,d.level)&&udNetApplyRecord(info,cached))continue}
    if(entries.length&&d.priority<priority)break;priority=d.priority;
    let partial=p.partial.get(key);if(!partial){const saved=await onpIdbGet('mediaPartialV2',key);if(p.generation!==generation||!udNetPlayerLive())return;if(udNetPartialOK(saved,key)){partial=saved;udNetKeepPartial(key,saved)}}
    entries.push({id:d.id,level:d.level,rev:info.rev,offset:partial?.length||0});if(entries.length>=UD_NET_MEDIA_BATCH)break;
  }}finally{if(p.generation===generation)p.loading=false}
  if(p.generation!==generation||!udNetPlayerLive())return;
  if(!entries.length)return;const request={request:++p.seq,entries:new Map(entries.map(e=>[udNetVariantKey(e.id,e.level),e])),step:0,generation:p.generation,priority,chain:Promise.resolve()};p.request=request;udNetWindowStart(request);udNetDeadline('request',request);onpSend({t:'mediaGet2',request:request.request,entries,window:udNetRequestedWindow(priority)});
}
function udNetApplyRecord(info,row,p=udNetPlayer){
  if(!udNetPlayerLive()||!p.allowed.has(info.id)||p.catalog.get(info.id)?.rev!==info.rev||!udNetRecordOK(row,info,row.level))return false;
  if(row.level){const key=udNetVariantKey(info.id,row.level);p.previews.delete(key);p.previews.set(key,{rev:row.rev,level:row.level,url:`data:${row.mime};base64,${row.data}`});let bytes=0;for(const v of p.previews.values())bytes+=v.url.length;while(p.previews.size>2000||bytes>64*1024*1024){const first=p.previews.keys().next().value,[id,level]=JSON.parse(first),old=p.previews.get(first);p.checked.delete(udNetCacheKey(p.identity,id,old.rev,level));bytes-=old.url.length;p.previews.delete(first)}}
  else{if(!UniverseGraphStorage.mediaPut({id:info.id,mime:row.mime,data:row.data,width:info.width,height:info.height})?.ok)return false;p.loaded.set(info.id,udNetCacheKey(p.identity,info.id,info.rev,0))}
  p.demand.delete(udNetVariantKey(info.id,row.level));p.boardWanted.delete(udNetVariantKey(info.id,row.level));const key=udNetCacheKey(p.identity,info.id,info.rev,row.level);p.seen?.add(key);p.partial.delete(key);onpIdbDelete('mediaPartialV2',key);invalidateMediaCache(info.id);onpRefreshImages([info.id]);udNetSchedulePriority();return true;
}
async function udNetReceiveCatalog(m){
  const p=udNetPlayer,index=p.index;if(!udNetPlayerLive()||m.workspace!==p.zone||!index||m.request!==index.request||!Array.isArray(m.items))return;
  clearTimeout(p.timer);p.timer=0;const ids=new Set(index.ids),found=new Set();
  for(const info of m.items){if(!info||!ids.has(info.id)||!p.allowed.has(info.id)||!udNetValidRevision(info.rev)||!Number.isSafeInteger(info.size)||info.size<1||info.size>8*1024*1024||!MEH_MEDIA_ACCEPT_MIMES.includes(info.mime))continue;
    found.add(info.id);p.catalog.set(info.id,info);
    if(onp.sentMedia.has(info.id)&&!udNetOriginalAvailable(info.id)){
      const local=UniverseGraphStorage.mediaGet(info.id);if(local?.data&&await udNetHash(local.data).catch(()=>null)===info.rev&&p.index===index&&udNetPlayerLive()){
        const row={key:udNetCacheKey(p.identity,info.id,info.rev,0),id:info.id,rev:info.rev,level:0,mime:local.mime,data:local.data,digest:info.rev};if(udNetApplyRecord(info,row))onpIdbPut('mediaV2',row)
      }
    }
  }
  if(p.index!==index||!udNetPlayerLive())return;
  for(const id of ids)if(!found.has(id)){p.absent.add(id);onpImages.absent.add(id);onpRefreshImages([id])}
  p.index=null;onpCopySave();udNetSchedulePriority();udNetKick();
}
function udNetPartialOK(row,key){return !!row&&row.key===key&&Number.isSafeInteger(row.total)&&row.total>0&&row.total<=UD_NET_MEDIA_BYTES&&Number.isSafeInteger(row.length)&&row.length>0&&row.length<row.total&&udNetValidRevision(row.digest)&&Array.isArray(row.parts)&&row.parts.length<=Math.ceil(UD_NET_MEDIA_BYTES/UD_NET_MEDIA_CHUNK)+1&&row.parts.every(s=>typeof s==='string'&&s.length>0&&s.length<=UD_NET_MEDIA_CHUNK)&&row.parts.reduce((n,s)=>n+s.length,0)===row.length}
function udNetKeepPartial(key,partial){const p=udNetPlayer;p.partial.delete(key);p.partial.set(key,partial);while(p.partial.size>8)p.partial.delete(p.partial.keys().next().value)}
function udNetCheckpointPartials(t){for(const e of t.entries.values()){const key=udNetCacheKey(udNetPlayer.identity,e.id,e.rev,e.level),partial=udNetPlayer.partial.get(key);if(partial?.length&&udNetPartialOK({...partial,key},key))onpIdbPut('mediaPartialV2',{...partial,key})}}
function udNetReceiveData(m){const t=udNetPlayer.request;if(!t||m.request!==t.request)return;t.chain=t.chain.then(()=>udNetProcessData(m,t)).catch(error=>{console.warn('media transfer',error);if(udNetPlayer.request===t){clearTimeout(udNetPlayer.timer);udNetPlayer.timer=0;udNetPlayer.request=null;udNetKick()}});return t.chain}
async function udNetProcessData(m,t){
  const p=udNetPlayer;if(!udNetPlayerLive()||m.workspace!==p.zone||p.request!==t||m.request!==t.request||!Array.isArray(m.items)||m.step<=t.step)return;
  if(m.step!==t.step+1){udNetCheckpointPartials(t);udNetWindowLoss();clearTimeout(p.timer);p.timer=0;p.request=null;udNetKick();return}
  clearTimeout(p.timer);p.timer=0;t.step=m.step;
  for(const part of m.items){const e=t.entries.get(udNetVariantKey(part?.id,part?.level)),info=e&&p.catalog.get(e.id);if(!e||!info||!p.allowed.has(e.id)||e.rev!==part.rev||info.rev!==part.rev||!MEH_MEDIA_ACCEPT_MIMES.includes(part.mime)||!udNetValidRevision(part.digest)||(!e.level&&(part.mime!==info.mime||part.digest!==info.rev||part.total!==Math.ceil(info.size/3)*4))||!Number.isSafeInteger(part.total)||part.total<1||part.total>UD_NET_MEDIA_BYTES||!Number.isSafeInteger(part.offset)||typeof part.data!=='string'||!part.data.length||part.data.length>UD_NET_MEDIA_CHUNK||part.offset+part.data.length>part.total)continue;
    const key=udNetCacheKey(p.identity,e.id,e.rev,e.level);let partial=p.partial.get(key);if(!partial&&part.offset===0){partial={key,length:0,parts:[],total:part.total,digest:part.digest};udNetKeepPartial(key,partial)}if(!partial||partial.length!==part.offset||partial.total!==part.total||partial.digest!==part.digest){p.partial.delete(key);onpIdbDelete('mediaPartialV2',key);continue}
    const bytes=Math.floor(part.data.length*3/4);t.windowBytes+=bytes;p.stats.bytes+=bytes;partial.parts.push(part.data);partial.length+=part.data.length;if(partial.length!==partial.total)continue;
    p.partial.delete(key);onpIdbDelete('mediaPartialV2',key);const data=partial.parts.join('');let hash;try{hash=await udNetHash(data)}catch{continue}if(p.request!==t||!udNetPlayerLive())return;
    if(hash&&hash!==part.digest)continue;const row={key,id:e.id,rev:e.rev,level:e.level,mime:part.mime,data,digest:part.digest};
    if(udNetApplyRecord(info,row)){t.entries.delete(udNetVariantKey(e.id,e.level));onpIdbPut('mediaV2',row)}
  }
  if(p.request!==t||!udNetPlayerLive())return;
  for(const entry of Array.isArray(m.missing)?m.missing:[]){const e=t.entries.get(udNetVariantKey(entry?.id,entry?.level));if(!e)continue;p.catalog.delete(e.id);const key=udNetCacheKey(p.identity,e.id,e.rev,e.level);p.partial.delete(key);onpIdbDelete('mediaPartialV2',key);t.entries.delete(udNetVariantKey(e.id,e.level))}
  t.windowFrames++;p.stats.frames++;if(m.done||m.windowEnd!==false)udNetWindowSample(t);
  if(m.done){p.request=null;udNetKick();return}
  udNetDeadline('request',t);if(m.windowEnd!==false){udNetCheckpointPartials(t);udNetWindowStart(t);onpSend({t:'mediaNext2',request:t.request,step:t.step,window:udNetRequestedWindow(t.priority)})}
}
function udNetCopyCatalog(){return onp.copy?onp.copyMediaCatalog||[]:[...udNetPlayer.catalog.values()].filter(info=>udNetPlayer.allowed.has(info.id))}
const udNetChangedMedia=new Set();let udNetChangedTimer=0;
function udNetMarkMediaChanged(id){
  if(window.UG_ONLINE_PLAYER||typeof onh==='undefined'||!onh.open)return;
  udNetChangedMedia.add(String(id));if(udNetChangedTimer)return;udNetChangedTimer=setTimeout(()=>{
    udNetChangedTimer=0;const ids=[...udNetChangedMedia];udNetChangedMedia.clear();if(!onh.open)return;
    for(const [c,x] of onh.conns){if(x.state!=='in'||!x.mediaV2)continue;const zone=udZoneOf(x);if(!udNetHostLive(c,x,zone))continue;const allowed=udInZone(zone,()=>onhMediaIds(onhSnapText()));const changed=ids.filter(id=>allowed.has(id));if(changed.length)onhSend(c,{t:'mediaInvalidated2',workspace:zone,ids:changed})}
  },200);
}
function udNetInvalidateCatalog(m){
  const p=udNetPlayer;if(!udNetPlayerLive()||m.workspace!==p.zone||!Array.isArray(m.ids))return;
  const ids=m.ids.filter(id=>p.allowed.has(id));if(!ids.length)return;
  clearTimeout(p.timer);p.timer=0;p.index=null;p.request=null;p.loading=false;p.generation++;
  for(const id of ids){p.catalog.delete(id);p.absent.delete(id);onpImages.absent.delete(id);for(const level of [256,512,1024])p.previews.delete(udNetVariantKey(id,level));invalidateMediaCache(id)}
  onpRefreshImages(ids);udNetKick();
}
async function udNetLoadCopyMedia(copy){
  const ids=new Set(mediaDataIdsFromData(copy.world)),identity=JSON.stringify([window.UG_ONLINE_PLAYER?.room||'',copy.me?.id||'',copy.world.id]);
  onp.copyMediaCatalog=copy.mediaCatalog||[];onp.copyPreviews=new Map();
  if(Array.isArray(copy.mediaCatalog))for(const id of ids){UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}
  for(const info of copy.mediaCatalog||[]){if(!ids.has(info.id)||!udNetValidRevision(info.rev))continue;for(const level of [0,256,512,1024]){const row=await onpIdbGet('mediaV2',udNetCacheKey(identity,info.id,info.rev,level));if(onp.state==='in')return;if(udNetRecordOK(row,info,level)){if(!level)UniverseGraphStorage.mediaPut({id:info.id,mime:row.mime,data:row.data,width:info.width,height:info.height});else onp.copyPreviews.set(udNetVariantKey(info.id,level),{url:`data:${row.mime};base64,${row.data}`,level});invalidateMediaCache(info.id)}}}
}
