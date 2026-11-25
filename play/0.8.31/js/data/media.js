// Universe Graph — Изображения: форматы, сжатие, кеш, сохранение в базу, перенос изображений при копировании карточек.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
const MEH_MEDIA_MAX_DIM=2200,MEH_MEDIA_MAX_BYTES=8*1024*1024,MEH_MEDIA_MAX_COUNT=50;
const MEH_MEDIA_ACCEPT_MIMES=['image/png','image/jpeg','image/webp','image/gif','image/bmp','image/svg+xml','image/avif','image/x-icon'];
const MEH_MEDIA_ACCEPT_EXTS=['png','jpg','jpeg','webp','gif','bmp','svg','avif','ico'];
const MEH_MEDIA_ACCEPT_ATTR=MEH_MEDIA_ACCEPT_MIMES.join(',')+','+MEH_MEDIA_ACCEPT_EXTS.map(x=>'.'+x).join(',');
function imageMime(file){
  const type=String(file?.type||'').toLowerCase();
  if(MEH_MEDIA_ACCEPT_MIMES.includes(type))return type;
  const name=String(file?.name||'').toLowerCase();
  const ext=name.includes('.')?name.split('.').pop():'';
  return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',svg:'image/svg+xml',avif:'image/avif',ico:'image/x-icon'})[ext]||'';
}
function isSupportedImageFile(file){return !!imageMime(file)}
function supportedImageFormatsText(){return 'PNG, JPG/JPEG, WebP, GIF, BMP, SVG, AVIF и ICO'}
function supportedImageFormatExtensionsText(){return '.png, .jpg, .jpeg, .webp, .gif, .bmp, .svg, .avif и .ico'}
// Decoded images (data URLs, up to 8 MB each) used to stay in memory forever.
// Now at most MEDIA_CACHE_LIMIT are kept; the least recently used is dropped.
const mediaUrlCache=new Map(),MEDIA_CACHE_LIMIT=40;
function mediaCacheSet(key,url){mediaUrlCache.delete(key);mediaUrlCache.set(key,url);while(mediaUrlCache.size>MEDIA_CACHE_LIMIT)mediaUrlCache.delete(mediaUrlCache.keys().next().value)}
function entityMedia(e){return Array.isArray(e?.media)?e.media:[]}
function getMediaMeta(e,id){return entityMedia(e).find(m=>m?.id===id)||null}
function getMediaUrl(id){
  const key=String(id||''); if(!key)return '';
  if(typeof udNetOriginalAvailable==='function'&&!udNetOriginalAvailable(key)){udNetDemandOriginal(key);return ''}
  if(mediaUrlCache.has(key)){const url=mediaUrlCache.get(key);mediaCacheSet(key,url);return url}
  try{
    const m=UniverseGraphStorage.mediaGet(key);
    if(!m?.data||!m?.mime)return '';
    const url=`data:${m.mime};base64,${m.data}`; mediaCacheSet(key,url); return url;
  }catch{return ''}
}
function invalidateMediaCache(ids){
  for(const id of Array.isArray(ids)?ids:[ids]) mediaUrlCache.delete(String(id||''));
  if(typeof udPhotoInvalidate==='function')udPhotoInvalidate(ids);
}
function mediaDataIdsFromData(doc){
  const ids=new Set();
  const collectItem=item=>{
    for(const m of entityMedia(item))if(m?.id)ids.add(String(m.id));
  };
  const collectStrokes=strokes=>{
    if(Array.isArray(strokes))for(const stroke of strokes)if(stroke?.t==='image')collectItem(stroke);
  };
  const collect=list=>{for(const item of Array.isArray(list)?list:[]){
    collectItem(item);collectStrokes(item?.map?.drawing?.strokes);
  }};
  const collectWorld=ws=>{
    collect(ws?.entities);collect(ws?.articles);
    for(const sheet of Array.isArray(ws?.sketches)?ws.sketches:[])collectStrokes(sheet?.strokes);
  };
  collectWorld(doc);
  for(const ws of Array.isArray(doc?.workspaces)?doc.workspaces:[]){
    collectWorld(ws);
    collect(Array.isArray(ws?.trash)?ws.trash.map(item=>item?.entity):[]);
  }
  return [...ids];
}
// 0.18: description text understands [[вики-ссылки]], **жирный** and *курсив* (features/wiki.js).
async function processImageFile(file,{maxDim=MEH_MEDIA_MAX_DIM,quality=.84}={}){
  const inputMime=imageMime(file);
  if(!file||!inputMime)throw new Error(`Поддерживаются ${supportedImageFormatsText()}.`);
  if(file.size>25*1024*1024)throw new Error('Исходное изображение слишком большое (максимум 25 МБ).');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image(); img.decoding='async'; img.src=url;
    try{await img.decode()}catch(error){throw new Error(`Не удалось открыть формат ${inputMime}. Возможно, этот формат не поддерживается Chromium.`)}
    let w=img.naturalWidth,h=img.naturalHeight; if(!w||!h)throw new Error('Не удалось определить размер изображения.');
    const scale=Math.min(1,maxDim/Math.max(w,h)); const outW=Math.max(1,Math.round(w*scale)),outH=Math.max(1,Math.round(h*scale));
    const canvas=document.createElement('canvas'); canvas.width=outW; canvas.height=outH; const c=canvas.getContext('2d',{alpha:true}); c.clearRect(0,0,outW,outH); c.drawImage(img,0,0,outW,outH);
    let mime=inputMime==='image/png'?'image/png':'image/webp'; let dataUrl=canvas.toDataURL(mime, mime==='image/png'?1:quality);
    let bytes=atob(dataUrl.split(',')[1]).length;
    if(bytes>MEH_MEDIA_MAX_BYTES && mime!=='image/png'){
      let q=quality; while(bytes>MEH_MEDIA_MAX_BYTES&&q>.48){q-=.08;dataUrl=canvas.toDataURL('image/webp',q);bytes=atob(dataUrl.split(',')[1]).length;}
    }
    if(bytes>MEH_MEDIA_MAX_BYTES){
      const reduce=Math.sqrt(MEH_MEDIA_MAX_BYTES/bytes); const c2=document.createElement('canvas'); c2.width=Math.max(1,Math.floor(outW*reduce));c2.height=Math.max(1,Math.floor(outH*reduce));c2.getContext('2d',{alpha:true}).drawImage(canvas,0,0,c2.width,c2.height);dataUrl=c2.toDataURL('image/webp',.76);mime='image/webp';bytes=atob(dataUrl.split(',')[1]).length;
    }
    if(bytes>MEH_MEDIA_MAX_BYTES)throw new Error('Не удалось ужать изображение до 8 МБ.');
    return {dataUrl,mime,width:outW,height:outH,sourceWidth:w,sourceHeight:h,size:bytes,name:file.name||'image'};
  }finally{URL.revokeObjectURL(url)}
}
function base64FromDataUrl(dataUrl){const s=String(dataUrl||''),i=s.indexOf(',');return i>=0?s.slice(i+1):''}
function rewriteImportedMediaRefs(doc,replacements){
  if(!replacements?.size)return;
  const visitEntity=e=>{
    if(!e||typeof e!=='object')return;
    if(Array.isArray(e.media)) for(const m of e.media){
      const id=String(m?.id||''); if(replacements.has(id)) m.id=replacements.get(id);
    }
    if(e.map?.mediaId&&replacements.has(String(e.map.mediaId)))e.map.mediaId=replacements.get(String(e.map.mediaId));
    if(typeof e.description==='string') e.description=e.description.replace(/\{\{image:([^}]+)\}\}/g,(_,id)=>replacements.has(String(id))?`{{image:${replacements.get(String(id))}}}`:`{{image:${id}}}`);
    if(Array.isArray(e.widgets)) for(const w of e.widgets){
      if(w?.kind==='image'&&w?.config?.mediaId&&replacements.has(String(w.config.mediaId))) w.config.mediaId=replacements.get(String(w.config.mediaId));
    }
  };
  const visitArticle=article=>{
    if(!isRecord(article))return;
    for(const image of entityMedia(article))if(replacements.has(image?.id))image.id=replacements.get(image.id);
    for(const box of Array.isArray(article.infoboxes)?article.infoboxes:[])if(replacements.has(box?.imageId))box.imageId=replacements.get(box.imageId);
    if(typeof article.body==='string')article.body=article.body.replace(/\{\{image:([^}]+)\}\}/g,(token,id)=>replacements.has(id)?`{{image:${replacements.get(id)}}}`:token);
  };
  const visitWorkspace=ws=>{
    for(const e of Array.isArray(ws?.entities)?ws.entities:[])visitEntity(e);
    for(const article of Array.isArray(ws?.articles)?ws.articles:[])visitArticle(article);
    for(const item of Array.isArray(ws?.trash)?ws.trash:[])visitEntity(item?.entity);
  };
  visitWorkspace(doc);
  for(const ws of Array.isArray(doc?.workspaces)?doc.workspaces:[])visitWorkspace(ws);
}
function mediaPut(meta){
  if(!UniverseGraphStorage.mediaAvailable)throw new Error('Хранилище изображений недоступно в этом режиме.');
  invalidateMediaCache(meta.id);
  const result=UniverseGraphStorage.mediaPut({id:meta.id,workspaceId:state.workspaceId||null,entityId:meta.entityId||null,filename:meta.name||'',mime:meta.mime,width:meta.width,height:meta.height,data:base64FromDataUrl(meta.dataUrl),metadata:{sourceWidth:meta.sourceWidth,sourceHeight:meta.sourceHeight,alt:meta.alt||'',caption:meta.caption||''}});
  if(!result?.ok)throw new Error(result?.error||'Не удалось сохранить изображение.');
  mediaCacheSet(meta.id,meta.dataUrl); return result.media;
}
function newMediaMeta(processed,entityId){return {id:uid('media'),name:processed.name,mime:processed.mime,width:processed.width,height:processed.height,sourceWidth:processed.sourceWidth,sourceHeight:processed.sourceHeight,size:processed.size,alt:processed.name.replace(/\.[^.]+$/,''),caption:'',displayWidth:Math.min(720,processed.width),fit:'contain',align:'center',entityId:entityId||null,dataUrl:processed.dataUrl}}
function cloneEntityMediaBindings(source,target,createdIds){
  const replacements=new Map();
  const sourceMedia=entityMedia(source);
  target.media=[];
  for(const meta of sourceMedia){
    if(typeof udNetOriginalAvailable==='function'&&!udNetOriginalAvailable(meta.id)){udNetDemandOriginal(meta.id);throw new Error(`Ожидается оригинал изображения «${meta.name||meta.id}». Повторите копирование после загрузки.`)}
    const stored=UniverseGraphStorage.mediaGet(meta.id);
    if(!stored?.data||!stored?.mime) throw new Error(`Не удалось скопировать изображение «${meta.name||meta.id}».`);
    const newId=uid('media');
    const result=UniverseGraphStorage.mediaPut({
      id:newId,workspaceId:state.workspaceId||null,entityId:target.id,filename:stored.filename||meta.name||'image',
      mime:stored.mime,width:Number(stored.width)||Number(meta.width)||0,height:Number(stored.height)||Number(meta.height)||0,
      data:stored.data,metadata:stored.metadata||{}
    });
    if(!result?.ok) throw new Error(result?.error||`Не удалось скопировать изображение «${meta.name||meta.id}».`);
    replacements.set(String(meta.id),newId);
    createdIds?.push(newId);
    target.media.push({...clone(meta),id:newId,entityId:target.id});
  }
  target.description=String(target.description||'').replace(/\{\{image:([^}]+)\}\}/g,(_,id)=>replacements.has(String(id))?`{{image:${replacements.get(String(id))}}}`:`{{image:${id}}}`);
  target.widgets=(Array.isArray(target.widgets)?target.widgets:[]).map(w=>{
    const copy=clone(w);
    if(copy?.kind==='image'&&copy.config?.mediaId&&replacements.has(String(copy.config.mediaId)))copy.config.mediaId=replacements.get(String(copy.config.mediaId));
    return copy;
  });
  return replacements;
}

