// The JSON world document contains ordinary metadata and a potentially very
// large _media array. Read/write it in bounded pieces instead of ever making
// one giant JavaScript string (V8 strings are limited to about 512 MiB).
'use strict';
const UD_WORLD_FILE_MAX=1024*1024*1024;
const UD_WORLD_SECTION_MAX=256*1024*1024;
const UD_WORLD_IMAGE_JSON_MAX=16*1024*1024;
const UD_WORLD_READ_CHUNK=1024*1024;
const UD_WORLD_MEDIA_COUNT_MAX=10000;

function udWorldJsonParser(){
  const doc={},fields=new Set(),parts=[];
  let phase='start',key='',media=null,canEnd=true,length=0,depth=0,inString=false,escaped=false;
  const outside=/["{}\[\],:]/g,inside=/["\\]/g,space=/[ \r\n\t]*/y;
  const fail=()=>{throw Error('Некорректный или незавершённый JSON мира.')};
  function append(s,max){if(!s.length)return;length+=s.length;if(length>max)throw Error('Слишком большой отдельный раздел или изображение в JSON мира.');parts.push(s)}
  function value(){const s=parts.join('');parts.length=0;length=0;depth=0;inString=false;escaped=false;return JSON.parse(s)}
  function setField(v){if(fields.has(key))throw Error('Повторяющийся раздел JSON мира.');fields.add(key);Object.defineProperty(doc,key,{value:v,enumerable:true,writable:true,configurable:true})}
  // Scan a single JSON value until a delimiter at its own outer level. JSON.parse
  // validates its full grammar; here only strings, escapes and depth matter.
  function scan(chunk,i,delimiters,max){
    const start=i;
    if(escaped&&i<chunk.length){i++;escaped=false}
    while(i<chunk.length){
      const re=inString?inside:outside;re.lastIndex=i;const match=re.exec(chunk);
      if(!match){i=chunk.length;break}
      const c=match[0];i=match.index;
      if(inString){if(c==='\\'){i++;if(i<chunk.length)i++;else escaped=true;continue}inString=false;i++;continue}
      if(depth===0&&delimiters.includes(c)){append(chunk.slice(start,i),max);return {i,c}}
      if(c==='"')inString=true;
      else if(c==='{'||c==='[')depth++;
      else if(c==='}'||c===']'){if(--depth<0)fail()}
      i++;
    }
    append(chunk.slice(start),max);return {i};
  }
  function feed(chunk){
    let i=0;
    while(i<chunk.length){
      if(phase==='keyValue'||phase==='value'||phase==='mediaValue'){
        const isKey=phase==='keyValue',isMedia=phase==='mediaValue';
        const end=scan(chunk,i,isKey?':':isMedia?',]':',}',isKey?1024*1024:isMedia?UD_WORLD_IMAGE_JSON_MAX:UD_WORLD_SECTION_MAX);
        i=end.i;if(!end.c)return;
        const v=value();i++;
        if(isKey){if(typeof v!=='string')fail();key=v;phase='valueStart';continue}
        if(isMedia){media.push(v);if(media.length>UD_WORLD_MEDIA_COUNT_MAX)throw Error('Слишком много изображений в импорте.');if(end.c===']'){setField(media);media=null;phase='afterMedia'}else{phase='mediaStart';canEnd=false}continue}
        setField(v);phase=end.c==='}'?'done':'key';canEnd=false;continue;
      }
      space.lastIndex=i;i+=space.exec(chunk)[0].length;if(i===chunk.length)return;
      const c=chunk[i];
      if(phase==='start'){if(c!=='{')fail();i++;phase='key';canEnd=true}
      else if(phase==='key'){if(c==='}'&&canEnd){i++;phase='done'}else{if(c!=='"')fail();phase='keyValue'}}
      else if(phase==='valueStart'){if(key==='_media'&&c==='['){i++;media=[];phase='mediaStart';canEnd=true}else phase='value'}
      else if(phase==='mediaStart'){if(c===']'&&canEnd){i++;setField(media);media=null;phase='afterMedia'}else phase='mediaValue'}
      else if(phase==='afterMedia'){if(c!==','&&c!=='}')fail();i++;phase=c==='}'?'done':'key';canEnd=false}
      else fail();
    }
  }
  return {feed,finish(){if(phase!=='done')fail();return doc}};
}

async function udReadWorldFile(file,{signal,onProgress=()=>{}}={}){
  if(file.size>UD_WORLD_FILE_MAX)throw Error('Файл слишком большой (максимум 1 ГБ JSON).');
  const parser=udWorldJsonParser(),decoder=new TextDecoder('utf-8',{fatal:true});
  for(let offset=0;offset<file.size;offset+=UD_WORLD_READ_CHUNK){
    if(signal?.aborted)throw new DOMException('Импорт отменён','AbortError');
    const end=Math.min(file.size,offset+UD_WORLD_READ_CHUNK),chunk=await file.slice(offset,end).arrayBuffer();
    if(signal?.aborted)throw new DOMException('Импорт отменён','AbortError');
    parser.feed(decoder.decode(chunk,{stream:true}));onProgress(end,file.size);
  }
  if(signal?.aborted)throw new DOMException('Импорт отменён','AbortError');
  parser.feed(decoder.decode());return parser.finish();
}

function udValidateWorldDocument(parsed){
  const version=Number(parsed?.version||0);
  if(Number.isFinite(version)&&version>WORLD_SCHEMA_VERSION)throw Error(`Файл создан более новой версией Universe Graph (схема ${version}).`);
  const lists=['workspaces','entities','entityTypes','relationTypes','relations'];
  if(!isRecord(parsed)||!lists.some(key=>Array.isArray(parsed[key])))throw Error('В файле нет мира Universe Graph.');
  return parsed;
}
