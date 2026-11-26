// Universe Graph — игра по сети, сторона Мастера (0.30.3). Окно программы Мастера решает всё: кто вошёл (вход
// «вопрос-ответ» по отпечатку пароля из 0.30.1), что игроки видят (onhSnapshot — список «что можно»), картинки по запросу.
// Связь — через служебную часть (universeDesktop.online: события join/msg/leave/reset/state, ответы out). Проверки
// подставляют свою связь в onh.transport — логика та же.
// Модуль загружается обычным <script> после online.js; имена — с приставкой onh.
'use strict';
const ONH_PROTO=1,ONH_MAX_TRIES=3,ONH_LOCK_TRIES=8,ONH_LOCK_MS=10*60000,ONH_LOCK_WINDOW=10*60000;
const ONH_MESSAGE_CHAR_LIMIT=1000000;
const ONH_WORLD_PART=384*1024,ONH_WORLD_DIRECT=2*1024*1024,ONH_WORLD_TOTAL=128*1024*1024;
const ONH_RELAY_FRAME=24*1024*1024;
const onh={seqs:new Map(),admitted:new Set(),ver:0,lastObj:null,open:false,ready:false,url:'',wsId:'',conns:new Map(),fails:new Map(),secret:null,ask:(()=>{try{return UniverseGraphStorage.getSetting('ug-online-ask')==='1'}catch{return false}})(),last:'',lastSnap:null,timer:0,transport:null,asks:[]};

// ---- что видят игроки: только перечисленное ----
function onhSnapshot(ws,bindings){
  if(!ws)return null;
  const p=playerProjection(ws),vis=new Set(p.entities.map(e=>e.id)),hintIds=new Set(p.entities.filter(e=>e.hint).map(e=>e.id));
  const visArt=new Set(p.articles.filter(a=>!a.hint).map(a=>a.id));
  const secretNames=[];for(const e of ws.entities||[])if(!vis.has(e.id)||hintIds.has(e.id)){secretNames.push(e.name,...(Array.isArray(e.aliases)?e.aliases:[]))}
  for(const a of Array.isArray(ws.articles)?ws.articles:[])if(!visArt.has(a.id))secretNames.push(a.title);
  const re=secretNameRe(secretNames.filter(Boolean));
  for(const e of p.entities){
    // a map of a visible entity: pins and areas of what the players do not see are dropped, names masked
    if(isRecord(e.map)){const m=e.map;m.pins=(Array.isArray(m.pins)?m.pins:[]).filter(x=>vis.has(x?.entityId)&&!hintIds.has(x?.entityId));
      m.areas=(Array.isArray(m.areas)?m.areas:[]).filter(a=>!a?.entityId||(vis.has(a.entityId)&&!hintIds.has(a.entityId)));if(re)e.map=maskDeep(m,re)}
    for(const k of ['offBoard','contentOffBoard','gmNotes'])delete e[k];
  }
  const tags=new Set();for(const x of [...p.entities,...p.articles])for(const t of Array.isArray(x.tags)?x.tags:[])tags.add(tagKey(t));
  const tagColors={};for(const [k,v] of Object.entries(isRecord(ws.tagColors)?ws.tagColors:{}))if(tags.has(k))tagColors[k]=v;
  return {id:ws.id,name:String(ws.name||''),rootId:ws.rootId,...(udUsesSharedLayout(ws)?{udLayoutMode:UD_SHARED_LAYOUT}:{}),...(ws.udRuleGroups?{udRuleGroups:clone(ws.udRuleGroups)}:{}),favorite:!!ws.favorite,entityTypes:clone(ws.entityTypes||[]),relationTypes:clone(ws.relationTypes||[]),statusGroups:clone(ws.statusGroups||[]),
    ...(ws.relationTiers!==undefined?{relationTiers:clone(ws.relationTiers)}:{}),tagColors,...(ws.styleLock?{styleLock:ws.styleLock}:{}),sketches:clone(Array.isArray(ws.sketches)?ws.sketches:[]),sketchPlayers:ws.sketchPlayers!==false,
    entities:p.entities,relations:p.relations,articles:p.articles,
    ...(udWorkspaceHasPlacements(ws)?{boards:udProjectPaperBoards(ws,p,bindings)}:{})};
}
function onhMediaIds(snapText){
  if(onh.mediaText!==snapText||!onh.mediaIds){
    onh.mediaIds=new Set(mediaDataIdsFromData(JSON.parse(snapText||'null')));
    onh.mediaText=snapText;
  }
  return onh.mediaIds;
}

// ---- связь ----
function onhApi(){return onh.transport||window.universeDesktop?.online||null}
function onhOut(m){if(typeof udNetNoteControl==='function')udNetNoteControl(m);const api=onhApi();if(api?.out)api.out(m)}
function onhSend(c,obj){onhOut({t:'send',c,d:JSON.stringify(obj)})}
function onhSendState(c,wire){
  const x=onh.conns.get(c);if(!x)return;
  if(x.worldTransfer){x.worldRefresh=true;return}
  const fitsLegacy=!x.worldParts&&wire.length<ONH_RELAY_FRAME&&(
    wire.length<=7*1024*1024||new TextEncoder().encode(JSON.stringify({t:'send',c,d:wire})).length<=ONH_RELAY_FRAME);
  if(wire.length<=ONH_WORLD_DIRECT||fitsLegacy){
    onhOut({t:'send',c,d:wire});return;
  }
  if(!x.worldParts||wire.length>ONH_WORLD_TOTAL){onhKick(c,'world-size');return}
  const transfer={id:onhRandom(9),workspace:onh.wsId,wire,offset:0};
  x.worldTransfer=transfer;onhWorldNext(c,x,transfer);
}
function onhWorldNext(c,x,transfer){
  const {id,workspace,wire,offset}=transfer,total=wire.length;
  const part=wire.slice(offset,offset+ONH_WORLD_PART);
  transfer.offset+=part.length;
  onhSend(c,{t:'worldPart',workspace,id,total,offset,part});
  if(transfer.offset===total){
    x.worldTransfer=null;
    if(x.worldRefresh){x.worldRefresh=false;onhSendWorld(c)}
  }
}
function onhKick(c,why=''){const x=onh.conns.get(c);if(x?.partId&&(!why||why==='flood'))onh.admitted?.delete(x.partId);if(why&&x)onhSend(c,{t:'bye',why});onhOut({t:'kick',c});onh.conns.delete(c);udDragClear(c);if(x?.partId&&typeof prsHostSet==='function'&&![...onh.conns.values()].some(o=>o.partId===x.partId&&o.state==='in'))prsHostSet(x.partId,null);onhChanged()}
// 0.30.9: «Отключить всех» — everybody out at once, the game stays open (they log in again, the Master lets them in)
function onhKickAll(){const ins=[...onh.conns.keys()];for(const c of ins)onhKick(c);onh.asks=[];onhAskRender();onh.admitted=new Set();onhChanged();return ins.length}
function onhChanged(){onhSendRoster();if(typeof onlRender==='function'&&$('#onlBody'))onlRender();if(typeof renderRoleMenu==='function')renderRoleMenu()}
function onhPlayers(){return [...onh.conns.entries()].filter(([,x])=>x.state==='in').map(([c,x])=>({c,...(partGet(x.partId)?partPublic(partGet(x.partId)):{id:x.partId,name:x.name||'?'}),at:x.at}))}
function onhPublicAvatar(p){
  return {id:p.id,name:p.name,color:p.color,avatar:p.avatar,role:p.role};
}
function onhRoster(){
  const online=new Set([...onh.conns.values()].filter(x=>x.state==='in').map(x=>x.partId));
  return {gm:partGm(),avatars:partList().filter(p=>(data.workspaces||[]).some(w=>partAllowed(p,w.id))).map(p=>({...onhPublicAvatar(p),online:online.has(p.id)}))};
}
function onhSendRoster(){
  if(!onh.open||!onh.conns.size)return;
  const d=JSON.stringify({t:'roster',...onhRoster()});
  if(d===onh.lastRoster)return;
  onh.lastRoster=d;
  onhOut({t:'bcast',d});
}
function onhRandom(n=16){const a=new Uint8Array(n);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a))}
// a nick that does not exist gets a made-up salt that is always the same: «no such nick» and «wrong password» look alike
async function onhFakeSalt(nick){if(!onh.secret)onh.secret=onhRandom(24);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(onh.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('salt:'+searchFold(nick)));return partB64(sig).slice(0,24)}
async function onhProof(hashB64,nonce){
  const rawKey=partUnB64(hashB64),bytes=new TextEncoder().encode(nonce);
  if(!crypto.subtle)return partB64(UDOnlineCrypto.proof(rawKey,bytes));
  const key=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return partB64(await crypto.subtle.sign('HMAC',key,bytes));
}
function onhLocked(partId){const f=(onh.fails.get(partId)||[]).filter(t=>Date.now()-t<ONH_LOCK_WINDOW);onh.fails.set(partId,f);return f.length>=ONH_LOCK_TRIES&&Date.now()-f.at(-1)<ONH_LOCK_MS}

async function onhOpen(){
  const api=onhApi();if(!api?.open)return {ok:false,error:'Игра по сети работает в программе для Windows'};
  if(persistenceLocked)return {ok:false,error:'Сохранение мира отключено'};
  const ws=currentWorkspace();if(!ws)return {ok:false,error:'Нет открытого мира'};
  const r=await api.open();if(!r?.ok)return r||{ok:false};
  const live=data.workspaces.find(item=>item.id===ws.id);
  if(!live){
    await api.close?.();
    return {ok:false,error:'Рабочая зона изменилась во время запуска сетевой игры.'};
  }
  udDragClear();onh.seqs.clear();
  onh.open=true;onh.lastRoster='';onh.session=uid('game');onh.admitted=new Set();onh.openedAt=new Date().toISOString();onh.wsId=ws.id;onh.url=r.url||'';onh.links=Array.isArray(r.links)?r.links:[];onh.lastSnap=null;onh.last='';onh.lastObj=null;onhChanged();return r;
}
async function onhClose(){const api=onhApi();for(const c of [...onh.conns.keys()])onhKick(c,'closed');onh.pres=new Map();if(typeof prsTake==='function')prsTake([]);onh.open=false;onh.ready=false;onh.conns.clear();clearTimeout(onh.timer);onh.timer=0;udClearZoneCaches();onhChanged();if(api?.close)await api.close();return {ok:true}}
function onhWorld(){return onh.candidate||(data.workspaces||[]).find(w=>w.id===onh.wsId)||null}
function onhSnapText(){if(!onh.lastSnap){onh.paperBindings=new Map();const s=onhSnapshot(onhWorld(),onh.paperBindings);onh.paperBoards=s?.boards;onh.dragVisible=new Map((s?.entities||[]).map(e=>[e.id,e]));onh.lastSnap=s?JSON.stringify(s):'null'}return onh.lastSnap}
// the Master changed something — the players get the new world (only when their part really changed)
function onhWorldChanged(){onh.lastSnap=null; /* 0.30.4: the cached players' world is stale at once — an edit arriving within the 0,4 s must not see the old one */
  if(!onh.open||!onh.conns.size)return;onhNotesPush();clearTimeout(onh.timer);onh.timer=setTimeout(onhBroadcast,ONH_BCAST_MS)}
const ONH_BCAST_MS=120;
// 0.30.5: the players get only what changed since the version they have (or the whole world when rules, tags, sheets changed)
function onhSameMeta(a,b,boards=false){const strip=w=>{const o={...w};if(boards){
    const legacy=Object.entries(w.boards||{}).filter(([,board])=>!board?.placements);
    if(legacy.length)o.boards=Object.fromEntries(legacy);else delete o.boards;
  }delete o.entities;delete o.relations;delete o.articles;o.sketches=(w.sketches||[]).map(s=>({...s,strokes:undefined}));return JSON.stringify(o)};return strip(a)===strip(b)}
function onhBroadcast(){
  clearTimeout(onh.timer);onh.timer=0;
  if(udWorkspaceHasPlacements(onhWorld()))for(const [c,x] of onh.conns){
    if(x.state==='in'&&(x.workspace||onh.wsId)===onh.wsId&&(x.papers!==1||udUsesSharedLayout(onhWorld())&&x.sharedLayout!==1))onhKick(c,'paper-version');
  }
  const t=onhSnapText();if(t===onh.last)return;const obj=JSON.parse(t);if(!obj)return; /* 0.30.9: the game's world is gone (its workspace deleted) */
  const clients=[...onh.conns.entries()].filter(([,x])=>x.state==='in'&&(x.workspace||onh.wsId)===onh.wsId);
  const boards=typeof udCompactBoardOps==='function'&&clients.every(([,x])=>x.boardChanges);
  let msg;
  if(onh.lastObj&&onhSameMeta(onh.lastObj,obj,boards)){
    const changes=onpDiff(onpCopy(onh.lastObj),onpCopy(obj));
    const ops=(boards?udCompactBoardOps(changes):changes).map(o=>{
      if(o.op==='patch')return o;
      const x={...o};delete x.old;delete x.was;return x;
    });
    msg=JSON.stringify({t:'delta',workspace:onh.wsId,from:onh.ver,to:onh.ver+1,ops});
  }else msg=JSON.stringify({t:'world',workspace:onh.wsId,ver:onh.ver+1,world:obj});
  onh.ver++;onh.last=t;onh.lastObj=obj;
  if(msg.length>ONH_WORLD_DIRECT||clients.some(([,x])=>x.worldTransfer)){
    for(const [c] of clients)onhSendState(c,msg);
    return;
  }
  const ins=new Set(clients.map(([c])=>c));if(!ins.size)return;
  onhOut({t:'bcast',d:msg,not:[...onh.conns.keys()].filter(c=>!ins.has(c))});
}
// the whole world to one player, at the version the others have
function onhSendWorld(c){if(onh.timer)onhBroadcast();if(!onh.last){onh.last=onhSnapText();onh.lastObj=JSON.parse(onh.last);onh.ver++}onhSendState(c,`{"t":"world","ver":${onh.ver},"world":${onh.last}}`)}

async function onhEvent(m){
  if(!m||typeof m!=='object')return;
  if(m.t==='state'){onh.ready=!!m.ready;if(!m.open&&onh.open){onh.open=false;onh.conns.clear();clearTimeout(onh.timer);onh.timer=0;udClearZoneCaches();if(m.error)toast(m.error,'err')}if(m.url)onh.url=m.url;if(Array.isArray(m.links))onh.links=m.links;if(m.tunnel&&typeof m.tunnel==='object')onh.tunnel=m.tunnel; /* UD 0.3: links of the own server, the tunnel's state */onhChanged();return}
  if(m.t==='reset'){onh.conns.clear();udDragClear();onhChanged();return}
  if(!onh.open)return;
  const c=String(m.c||'');if(!/^c[a-f0-9]{6,20}$/.test(c))return;
  if(m.t==='join'){onh.conns.set(c,{state:'new',tries:0,at:Date.now()});onhSend(c,{t:'hello',proto:ONH_PROTO,papers:1,mediaFlow:1,mediaPull:1,mediaV2:1,boardChanges:1,app:'universe-graph',...onhRoster()});return}
  if(m.t==='leave'){const x=onh.conns.get(c);onh.conns.delete(c);udDragClear(c);if(x?.partId&&x.state==='in'&&![...onh.conns.values()].some(o=>o.partId===x.partId&&o.state==='in')&&typeof prsHostSet==='function')prsHostSet(x.partId,null);onh.asks=onh.asks.filter(a=>a.c!==c);onhAskRender();if(x?.state==='in'){toast(`«${x.name}» вышел из игры`,'ok');onhChanged()}return}
  if(m.t!=='msg')return;
  const x=onh.conns.get(c);if(!x)return;
  const d=String(m.d||'');if(d.length>ONH_MESSAGE_CHAR_LIMIT){onhKick(c,'big');return}
  let q;try{q=JSON.parse(d)}catch{return}if(!isRecord(q))return;
  if(!onhBudget(c,x,q))return;
  try{await onhHandle(c,x,q)}catch(e){console.warn('online',e)}
}
// 0.30.9: how often one connection may talk (cursor 20 a second, the rest 8; whole world again — once in 3 s, pictures — 10 asks in 10 s);
// far over the limit for long — the connection is cut ('flood')
const ONH_RATE={cur:[20,40],boardDrag:[20,32],any:[8,60],resyncMs:3000,mediaPer10s:10,floodDrops:400};
function onhBudget(c,x,q){
  if(q.t==='edit'||q.t==='mediaPut'||q.t==='mediaNext'||q.t==='mediaNext2'||q.t==='worldNext')return true; /* checked against their own protocol state */
  const now=Date.now(),kind=q.t==='cur'||q.t==='boardDrag'?q.t:'any',[per,burst]=ONH_RATE[kind],b=(x.bucket||(x.bucket={}))[kind]||(x.bucket[kind]={n:burst,at:now});
  b.n=Math.min(burst,b.n+(now-b.at)/1000*per);b.at=now;
  if(q.t==='resync'){if(now-(x.resyncAt||0)<ONH_RATE.resyncMs){x.resyncWanted=true;clearTimeout(x.resyncTimer);x.resyncTimer=setTimeout(()=>{if(onh.conns.get(c)===x&&x.state==='in'&&x.resyncWanted){x.resyncWanted=false;x.resyncAt=Date.now();onhSendWorld(c)}},ONH_RATE.resyncMs);return false}x.resyncAt=now;x.resyncWanted=false}
  if(q.t==='media'&&!Number.isSafeInteger(q.request)){x.mediaAsks=(x.mediaAsks||[]).filter(t=>now-t<10000);if(x.mediaAsks.length>=ONH_RATE.mediaPer10s)return false;x.mediaAsks.push(now)}
  if(b.n>=1){b.n--;return true}
  x.drops=(x.drops||0)+1;if(x.drops>ONH_RATE.floodDrops){onhKick(c,'flood');toast(`«${x.name||'?'}» присылал слишком много сообщений — отключён`,'err');onhChanged()}
  return false;
}
// 0.30.9: what a player changed is saved as «someone else's change» — the Master's Ctrl+Z takes back only his own
function onhOthers(fn){const was=typeof historyOthers!=='undefined'?historyOthers:false;try{historyOthers=true;return fn()}finally{historyOthers=was}}
async function onhHandle(c,x,q){
  if(q.t==='login'&&x.state==='new'){
    x.papers=q.papers===1?1:0;x.editor=q.editor===2?2:0;x.boardChanges=q.boardChanges===1;x.sharedLayout=q.sharedLayout===1?1:0;
    x.worldParts=q.worldParts===1;x.notesReceipts=q.notesReceipts===1;x.mediaV2=q.mediaV2===1;x.mediaBinary=q.mediaBinary===1;
    if((!x.papers&&udWorkspaceHasPlacements(onhWorld()))||(udUsesSharedLayout(onhWorld())&&x.sharedLayout!==1)){onhSend(c,{t:'denied',why:'paper-version'});return}
    const nick=partCleanName(q.nick),id=typeof q.partId==='string'?q.partId.slice(0,60):'';
    const p=id?partGet(id):partFind(nick);
    x.nonce=onhRandom(18);x.partId=p?.id||'';x.name=p?.name||nick;x.state='challenge';
    const salt=p?.pass?.salt||await onhFakeSalt(id||nick),iter=p?.pass?.iter||PART_ITER;
    onhSend(c,{t:'challenge',salt,iter,nonce:x.nonce});return}
  if(q.t==='proof'&&x.state==='challenge'){
    const p=x.partId?partGet(x.partId):null;
    if(p&&onhLocked(p.id)){onhSend(c,{t:'denied',why:'locked'});x.state='new';return}
    x.state='proof';
    const good=!!(p?.pass&&typeof q.proof==='string'&&partSameText(await onhProof(p.pass.hash,x.nonce),q.proof));
    if(onh.conns.get(c)!==x)return;
    if(!good||partGet(p.id)?.pass?.hash!==p.pass.hash){x.tries++;x.state='new';if(p){const f=onh.fails.get(p.id)||[];f.push(Date.now());onh.fails.set(p.id,f)}
      if(x.tries>=ONH_MAX_TRIES){onhKick(c,'tries');return}onhSend(c,{t:'denied',why:'pass'});return}
    if(!partAllowed(partGet(p.id),x.workspace||onh.wsId)){onhSend(c,{t:'denied',why:'world'});x.state='new';return}
    x.passHash=p.pass.hash;
    for(const [oc,ox] of onh.conns)if(oc!==c&&ox.partId===p.id&&ox.state==='in')onhKick(oc,'elsewhere');
    if(onh.ask&&!onh.admitted?.has(p.id)){x.state='wait';onhSend(c,{t:'wait'});onh.asks.push({c,partId:p.id,name:p.name});onhAskRender();return}
    onhAdmit(c);return}
  if(x.state!=='in')return;
  if(q.t==='worldNext'){
    const transfer=x.worldTransfer;
    if(transfer?.id===q.id&&transfer.offset===q.offset)onhWorldNext(c,x,transfer);
    return;
  }
  if(q.t==='resync'){onhSendWorld(c);return}
  if(q.t==='ping'){onhSend(c,{t:'pong'});return}
  if(q.t==='avatar'){await onhSetAvatar(c,x,q.avatar);return}
  if(q.t==='ai'){onhSend(c,{t:'aiRes',id:String(q.id||'').slice(0,40),error:'В Universe Detective нет Меха и ИИ'});return} /* UD: no Meh — a player's question gets a plain «no» (the protocol stays UG's) */
  if(q.t==='cur'){if(typeof prsHostFrom==='function')prsHostFrom(c,x,q);return}
  if(q.t==='boardDrag'){udDragRelay(c,q);return}
  if(q.t==='edit'&&Array.isArray(q.ops)){
    /* 0.30.9: an edit sent again after a lost connection (same tab, number already taken) — only the answer */
    const seq=Math.max(0,Math.floor(Number(q.seq)||0)),tab=typeof q.tab==='string'?q.tab.slice(0,40):'',last=onh.seqs.get(x.partId);
    if(tab&&last&&last.tab===tab&&seq<=last.seq){
      onhSend(c,{t:'ack',seq,dup:true,ok:0,rejected:[],conflicts:[],...(seq===last.seq?last.fixResult:null)});return;
    }
    const r=onhOthers(()=>onhApplyEdit(c,x,q.ops));
    const needsReceipt=r.migrationUndo||q.ops.length===1&&['fix','paper','createPaper'].includes(q.ops[0]?.op);
    const fixResult=needsReceipt?r:null;
    if(tab)onh.seqs.set(x.partId,{tab,seq,fixResult});
    onhSend(c,{t:'ack',seq,...r});return}
  if(q.t==='notes'&&Array.isArray(q.ops)){onhOthers(()=>onhNotes(c,x,q));return}
  if(q.t==='mediaPut'){
    const part=Object.hasOwn(q,'offset');
    const result=part?onhMediaPart(x,q):onhMediaPut(x,q);
    onhSend(c,{t:'mediaAck',id:String(q.id||''),...(part?{offset:q.offset}:{}),...result});return}
  if(['mediaCatalog2','mediaGet2','mediaNext2'].includes(q.t)){if(typeof udNetHostMessage==='function')return udNetHostMessage(c,x,q);return}
  if(q.t==='mediaNext'){
    const transfer=x.mediaTransfer;
    if(transfer?.request===q.request&&transfer.step===q.step)onhMediaNext(c,x,transfer);
    return;
  }
  if(q.t==='media'&&Array.isArray(q.ids)){
    const ids=[...new Set(q.ids.slice(0,40).map(String))];
    if(q.pull===1&&Number.isSafeInteger(q.request)){
      const transfer={request:q.request,step:0,ids,missing:[],current:null};
      x.mediaTransfer=transfer;onhMediaNext(c,x,transfer);return;
    }
    const allowed=onhMediaIds(onhSnapText()),limit=ONH_MEDIA_OUT_LIMIT,missing=[];
    const receipt=Number.isSafeInteger(q.request)?{request:q.request}:{};
    const frameLimit=receipt.request===undefined?limit:ONH_MEDIA_PART;
    let items=[],size=0,sent=0;
    for(const id of ids){
      const media=allowed.has(id)?UniverseGraphStorage.mediaGet(id):null;
      if(!media?.data||!media.mime||media.data.length>limit){missing.push(id);continue}
      const {data,mime}=media;
      if(receipt.request!==undefined&&sent+data.length>limit)break;
      sent+=data.length;
      if(size&&size+data.length>frameLimit){
        onhSend(c,{t:'media',...receipt,items});items=[];size=0;
      }
      if(data.length>frameLimit){
        for(let offset=0;offset<data.length;offset+=frameLimit){
          onhSend(c,{t:'media',...receipt,items:[{id,mime,offset,total:data.length,data:data.slice(offset,offset+frameLimit)}]});
        }
      }else{
        items.push({id,mime,data});size+=data.length;
      }
    }
    onhSend(c,{t:'media',...receipt,items,...(receipt.request===undefined?{}:{done:true,missing})});return}
}
const ONH_MEDIA_OUT_LIMIT=12*1024*1024;
function onhMediaNext(c,x,transfer){
  const allowed=onhMediaIds(onhSnapText());
  const items=[];let size=0;
  if(transfer.current&&!allowed.has(transfer.current.id)){
    transfer.missing.push(transfer.current.id);transfer.current=null;
  }
  while(transfer.current||transfer.ids.length){
    if(!transfer.current){
      const id=transfer.ids.shift();
      const media=allowed.has(id)?UniverseGraphStorage.mediaGet(id):null;
      if(!media?.data||!media.mime||media.data.length>ONH_MEDIA_OUT_LIMIT){transfer.missing.push(id);continue}
      transfer.current={id,mime:media.mime,data:media.data,offset:0};
    }
    const file=transfer.current,{id,mime,data,offset}=file,total=data.length;
    if(total>ONH_MEDIA_PART){
      if(items.length)break;
      const part=data.slice(offset,offset+ONH_MEDIA_PART);
      file.offset+=part.length;
      if(file.offset===total)transfer.current=null;
      items.push({id,mime,data:part,offset,total});break;
    }
    if(size+total>ONH_MEDIA_PART)break;
    items.push({id,mime,data});size+=total;transfer.current=null;
  }
  const step=++transfer.step;
  const done=!transfer.current&&!transfer.ids.length;
  if(done)x.mediaTransfer=null;
  onhSend(c,{t:'media',request:transfer.request,step,items,...(done?{done:true,missing:transfer.missing}:{})});
}
async function onhSetAvatar(c,x,avatar){
  const now=Date.now();
  if(!partAvatarOk(avatar)){
    onhSend(c,{t:'avatarAck',ok:false,error:'Не удалось прочитать картинку аватара.'});
    return;
  }
  if(x.avatarAt&&now-x.avatarAt<5000){
    onhSend(c,{t:'avatarAck',ok:false,error:'Картинку можно менять раз в 5 секунд.'});
    return;
  }
  x.avatarAt=now;
  const result=await partUpdate(x.partId,{avatar});
  if(onh.conns.get(c)===x)onhSend(c,{t:'avatarAck',ok:result.ok,error:result.error});
}
function onhAdmit(c){
  const x=onh.conns.get(c);if(!x||!['proof','wait'].includes(x.state))return;
  if(x.papers!==1&&udWorkspaceHasPlacements(onhWorld())||udUsesSharedLayout(onhWorld())&&x.sharedLayout!==1){
    x.state='new';onhSend(c,{t:'denied',why:'paper-version'});return;
  }
  const p=partGet(x.partId);
  if(!partAllowed(p,onh.wsId)||!p.pass||p.pass.hash!==x.passHash){onhKick(c,'gone');return}
  if(onh.timer)onhBroadcast(); /* the others first get what is pending — then everybody is at the same version */
  if(onh.last!==onhSnapText()){onh.last=onhSnapText();onh.lastObj=JSON.parse(onh.last);onh.ver++}const world=onh.last;
  x.state='in';x.at=Date.now();x.name=p.name;(onh.admitted||(onh.admitted=new Set())).add(p.id);x.passHash=p.pass?.hash||'';const gm=partGm();
  onhSendState(c,`{"t":"in","ai":false,"ver":${onh.ver},"me":${JSON.stringify(onhPublicAvatar(p))},"gm":${JSON.stringify({name:gm.name,color:gm.color,avatar:gm.avatar})},"notes":${JSON.stringify(onhNotesOf(p.id))},"world":${world}}`);x.notesSig=JSON.stringify(onhNotesOf(p.id));
  toast(`«${p.name}» вошёл в игру`,'ok');onhChanged();
}
// «спрашивать меня перед входом»: a small panel with «Пустить» / «Не пускать»
function onhAskRender(){
  let box=$('#onhAsk');if(!onh.asks.length){if(box)box.hidden=true;return}
  if(!box){box=document.createElement('div');box.id='onhAsk';box.className='onhAsk';box.setAttribute('role','alertdialog');document.body.appendChild(box);
    box.addEventListener('click',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-onh-ask]'):null;if(!b)return;const [c,yes]=b.dataset.onhAsk.split('|');onh.asks=onh.asks.filter(a=>a.c!==c);
      if(yes==='1')onhAdmit(c);else{onhSend(c,{t:'denied',why:'gm'});const x=onh.conns.get(c);if(x)x.state='new'}onhAskRender()})}
  box.hidden=false;const a=onh.asks[0];
  box.innerHTML=`<b>«${escapeHtml(a.name)}» хочет войти в игру</b><div class="onhAskBtns"><button type="button" class="btn primary" data-onh-ask="${escapeHtml(a.c)}|1">Пустить</button><button type="button" class="btn" data-onh-ask="${escapeHtml(a.c)}|0">Не пускать</button></div>${onh.asks.length>1?`<small>Ещё ждут: ${onh.asks.length-1}</small>`:''}`;
}
// a participant was deleted or changed — the one who is in the game with it is let go
function onhPartsChanged(){
  for(const [c,x] of [...onh.conns])if(x.state==='in'||x.state==='wait'){
    const p=partGet(x.partId);
    if(!partAllowed(p,onh.wsId)||(p.pass?.hash||'')!==x.passHash)onhKick(c,'gone');
  }
  onh.asks=onh.asks.filter(a=>onh.conns.has(a.c));
  onhAskRender();
  onhChanged();
}
{const api=window.universeDesktop?.online;if(api?.onEvent)api.onEvent(m=>onhEvent(m))}

// ---- 0.30.4: правка мира игроками ----
// Игрок присылает разницу со своей копией мира: add / set (поля: новое и прежнее у него) / del — для сущностей (e), связей (r),
// статей (a). Здесь проверяется каждое: только поля из списка; поле, где у игрока что-то скрыто, не меняется (отказ);
// в свойствах и разделах — только видимые ему ключи; метки и области карты из скрытого остаются; удалённое — в корзину.
const ONH_FIELDS={e:['name','type','description','note','properties','sectionData','page','widgets','tags','aliases','media','style','map','status','paper','board'],
  r:['from','to','type','udMembership','label','description','properties','style','tier'],a:['media','infoboxes','title','icon','body','parentId','primaryFor','links','collect','tags','order']};
const ONH_RECORD_FIELDS=new Set(['properties','sectionData','status']);
const ONH_GM_ONLY=new Set(['vis','namedVisibility','blockVis','offBoard','onBoard','contentOffBoard','secret']);
const ONH_EDIT_LIMITS={opsPerMsg:400,msgsPer10s:40,fieldBytes:300000,addsPerMin:600,mediaBytes:8*1024*1024,mediaPerConn:200};
const onhJ=v=>JSON.stringify(v===undefined?null:v);
function onhList(ws,k){return k==='e'?ws.entities:k==='r'?ws.relations:(Array.isArray(ws.articles)?ws.articles:(ws.articles=[]))}
function onhWhatName(k,o){return k==='e'?`«${o?.name||'?'}»`:k==='a'?`статья «${o?.title||'?'}»`:'связь'}
const ONH_MEDIA_PART=256*1024;
const ONH_MEDIA_ID=/^media-[a-z0-9]{3,12}-[a-z0-9]{2,8}$/;
const ONH_MEDIA_MIME=/^image\/(png|jpe?g|webp|gif)$/;
function onhMediaPart(x,q){
  const max=Math.ceil(ONH_EDIT_LIMITS.mediaBytes/3)*4;
  const {id,mime,offset,total,data}=q;
  const reject=why=>{delete x.mediaPart;return {ok:false,why}};
  if(partGet(x.partId)?.role!=='player')return reject('Зритель только смотрит');
  if(typeof id!=='string'||!ONH_MEDIA_ID.test(id)||!ONH_MEDIA_MIME.test(mime||'')||
    !Number.isSafeInteger(offset)||offset<0||offset%4||!Number.isSafeInteger(total)||total>max||total%4||
    typeof data!=='string'||!data.length||data.length>ONH_MEDIA_PART||data.length%4||
    offset+data.length>total||!/^[A-Za-z0-9+/]+={0,2}$/.test(data)||
    offset+data.length<total&&data.endsWith('='))return reject('Некорректная часть изображения');
  if(offset===0)x.mediaPart={id,mime,total,workspace:onh.wsId,length:0,parts:[]};
  const part=x.mediaPart;
  if(!part||part.id!==id||part.mime!==mime||part.total!==total||part.workspace!==onh.wsId||part.length!==offset)
    return reject('Последовательность загрузки изображения прервалась');
  part.parts.push(data);part.length+=data.length;
  if(part.length<total)return {ok:true,next:part.length};
  delete x.mediaPart;
  return {...onhMediaPut(x,{id,mime,data:part.parts.join(''),name:q.name},{legacy:false}),done:true};
}
// A receipt confirms a successful storage write or a repeat of the same file.
function onhMediaPut(x,q,{legacy=true}={}){
  if(partGet(x.partId)?.role!=='player')return {ok:false,why:'Зритель только смотрит'};
  if(legacy){x.media=(x.media||0)+1;if(x.media>ONH_EDIT_LIMITS.mediaPerConn)return {ok:false,why:'Слишком много картинок'}}
  const id=String(q.id||''),mime=String(q.mime||'').toLowerCase(),data=String(q.data||'');
  const size=data.length*3/4-(data.endsWith('==')?2:data.endsWith('=')?1:0);
  if(!ONH_MEDIA_MIME.test(mime)||data.length%4||size>ONH_EDIT_LIMITS.mediaBytes||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))
    return {ok:false,why:'Картинка не подходит (png, jpg, webp, gif до 8 МБ)'};
  const had=ONH_MEDIA_ID.test(id)?UniverseGraphStorage.mediaGet(id):null;
  if(had&&had.data===data&&had.mime===mime)return {ok:true,dup:true};
  if(!ONH_MEDIA_ID.test(id)||had)return {ok:false,why:'Картинка с таким номером уже есть'};
  try{
    const result=UniverseGraphStorage.mediaPut({id,mime,data,filename:String(q.name||'').slice(0,120),workspaceId:onh.wsId});
    if(!result?.ok)return {ok:false,why:result?.error||'Файл не записан на компьютере Мастера'};
    (x.mediaIds||(x.mediaIds=new Set())).add(id);return {ok:true};
  }catch(e){return {ok:false,why:String(e.message||e)}}
}
function onhFixCard(c,ws,o){
  const refusal=why=>{
    onhSendWorld(c);
    return {ok:0,rejected:[{why}],conflicts:[]};
  };
  const projection=onhSnapshot(ws);
  const visible=new Set(projection.entities.map(e=>e.id));
  if(!visible.has(o.id)||!visible.has(o.scope))return refusal('Бумажка или доска больше недоступна');
  const e=ws.entities.find(e=>e.id===o.id);
  const types=new Set(ws.relationTypes.filter(t=>t.containment).map(t=>t.id));
  const parents=new Map(ws.relations.filter(r=>types.has(r.type)).map(r=>[r.to,r.from]));
  const parent=parents.get(e.id)||null;
  if(o.parent!==parent)return refusal('Бумажка перемещена. Выберите её на доске снова');
  if(persistenceLocked)return refusal('Сохранение мира отключено');
  const originId=parent||ws.rootId;
  let nested=false;
  for(let scope=parent, limit=ws.entities.length;scope&&limit--;scope=parents.get(scope)){
    if(scope===o.scope){nested=true;break}
  }
  const auxiliary=e.id!==o.scope&&(
    !!e.board?.fixed?.[o.scope]||o.auxiliary===true||(!nested&&o.scope!==originId));
  const lock=auxiliary?e.board?.fixed?.[o.scope]:e.board?.lock;
  if(typeof o.locked!=='boolean')return refusal('Непонятная команда закрепления');
  if(!!lock===o.locked){onhSendWorld(c);return {ok:0,rejected:[],conflicts:[]}}
  const p=o.place;
  if(!isRecord(p)||!['x','y','dx','dy','w','h'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=10000000)){
    return refusal('Некорректные размеры или положение');
  }

  // Saved positions and dimensions on the host take precedence. An unplaced card
  // can use its rendered coordinates from the player's board.
  const stored=boardPlace(e,o.scope),size=boardSize(e,o.scope);
  const origin=boardPlace(ws.entities.find(e=>e.id===originId),o.scope);
  let position=stored||p;
  if(lock){
    if(auxiliary||!parent&&e.id===o.scope)position=lock;
    else if(e.id!==o.scope&&origin)position={x:origin.x+lock.x,y:origin.y+lock.y};
    else position=p;
  }
  const relative=stored&&origin&&e.id!==o.scope?{dx:stored.x-origin.x,dy:stored.y-origin.y}:p;
  const place={
    x:Math.round(position.x),y:Math.round(position.y),
    dx:Math.round(relative.dx),dy:Math.round(relative.dy),
    w:Math.round(clamp(lock?.w??size?.w??p.w,BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w)),
    h:Math.round(clamp(lock?.h??size?.h??p.h,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h))
  };
  const before=e.board===undefined?undefined:clone(e.board);
  boardApplyFix(e,o.scope,o.locked,place,{auxiliary,parent});
  if(!onhSave()){
    if(before===undefined)delete e.board;else e.board=before;
    if(viewAsPlayer())playerReproject();
    updateUI();
    return refusal('Не удалось сохранить закрепление');
  }
  onhBroadcast();
  return {ok:1,rejected:[],conflicts:[]};
}
function onhCreationTarget(ws,projection,scope,at){
  if(!isRecord(at)||typeof at.board!=='string'||!projection.entities.some(entity=>entity.id===at.board&&!entity.hint))return null;
  const shared=udUsesSharedLayout(ws),automatic=shared&&at.auto===true;
  if(shared&&at.board!==ws.rootId||!automatic&&(!udCoordinate(at.x)||!udCoordinate(at.y)))return null;
  const point=automatic?undefined:at;
  const board=ws.boards?.[at.board]?.placements;
  if(shared&&!board)return null;
  if(at.parentId===null)return at.board===scope?{board,scope:at.board,parentId:null,point,automatic}:null;
  const visible=projection.boards?.[at.board]?.placements?.items.find(p=>p.id===at.parentId);
  const parent=board?.items.find(p=>p.id===at.parentId);
  if(typeof at.parentId!=='string'||visible?.entityId!==scope||parent?.entityId!==scope||!parent.childrenReady)return null;
  return {board,scope:at.board,parentId:parent.id,point,automatic};
}
function onhCreatedPaperReply(ws,id){
  const visible=onhSnapshot(ws).entities.find(entity=>entity.id===id&&!entity.hint);
  return {ok:1,rejected:[],conflicts:[],...(visible?{creationUndo:{c:'e',op:'del',id,old:visible}}:{})};
}
function onhCreatePaper(ws,p,op){
  const reject=why=>({ok:0,rejected:[{why}],conflicts:[]});
  if(!partAllowed(p,ws.id)||op.workspace!==ws.id)return reject('Эта рабочая зона недоступна');
  const projection=onhSnapshot(ws);
  const scope=projection.entities.find(e=>e.id===op.scope);
  const parent=ws.entities.find(e=>e.id===op.scope);
  if(!scope||scope.hint||!parent||parent.contentOffBoard)return reject('На этой доске нельзя создать бумажку');
  const v=op.v;
  if(!isRecord(v)||typeof v.id!=='string'||!/^[A-Za-z0-9_-]{3,80}$/.test(v.id)||
     typeof v.name!=='string'||!v.name.trim()||v.name.length>300||
     typeof v.note!=='string'||v.note.length>ONH_EDIT_LIMITS.fieldBytes)return reject('Проверьте название и заметку');
  const type=v.type;
  if(type!==''&&!ws.entityTypes.some(t=>t.id===type))return reject('Выберите существующий тип');
  const contains=ws.relationTypes.find(t=>t.containment);
  const existing=ws.entities.find(e=>e.id===v.id);
  if(existing){
    const same=existing.by?.id===p.id&&ws.relations.some(r=>r.type===contains?.id&&r.to===v.id&&r.from===scope.id);
    return same?onhCreatedPaperReply(ws,v.id):reject('Номер бумажки уже занят');
  }
  if((ws.trash||[]).some(item=>item.entity?.id===v.id))return reject('Эту бумажку уже перенесли в корзину');
  if(persistenceLocked)return reject('Сохранение мира отключено');
  const target=op.at===undefined?null:onhCreationTarget(ws,projection,scope.id,op.at);
  if(op.at!==undefined&&!target)return reject('Точка создания или контейнер больше недоступны');
  if(udUsesSharedLayout(ws)&&!target)return reject('Адрес бумажки в общей раскладке не передан');
  const board=projection.boards?.[scope.id]?.placements;
  if(!target&&board&&udVisiblePlacements(board,()=>true,undefined,{limit:BOARD_LIMIT-1}).size>=BOARD_LIMIT-1){
    return reject('На доске нет свободного места');
  }
  if(target&&!target.board&&udWithWorkspace(ws,()=>{state.scopeId=target.scope;return boardLayout().nodes.length})>=BOARD_LIMIT)
    return reject('На доске нет свободного места');
  const before=snapshotWorkspaceMutation();
  const full='На доске нет свободного места';
  try{
    let relationType=contains;
    if(!relationType){
      relationType=containmentTypeTemplate();
      if(ws.relationTypes.some(t=>t.id===relationType.id))relationType.id=uid('rtype');
      ws.relationTypes.unshift(relationType);
    }
    const at=new Date().toISOString();
    const obj={id:v.id,name:v.name.trim(),type,note:v.note,description:'',properties:{},tags:[],
      style:{x:(Number(parent.style?.x)||0)+Math.cos(ws.entities.length*.9)*190,
        y:(Number(parent.style?.y)||0)+Math.sin(ws.entities.length*.9)*150},
      by:{id:p.id,name:p.name,at},createdAt:at,updatedAt:at};
    ws.entities.push(obj);
    ws.relations.push({id:uid('relation'),from:scope.id,to:obj.id,type:relationType.id,properties:{},style:{}});
    if(target?.board){
      const context=target.parentId?{paperId:target.parentId}:null;
      const outerFit=context&&udPaperViewFits(target.board,null,()=>true);
      if(!udPlaceAtContext(obj.id,target.board,target.parentId,target.automatic?udSharedDefaultPoint(target.board,target.parentId):target.point)||
         !udPaperViewFits(target.board,context,()=>true)||(outerFit&&!udPaperViewFits(target.board,null,()=>true)))
        throw Error(full);
      if(target.automatic){udAddMemberPlacements(scope.id,obj.id,ws);if(!udPaperViewFits(target.board,context,()=>true)||(outerFit&&!udPaperViewFits(target.board,null,()=>true)))throw Error(full)}
    }else if(target){
      boardSetPlace(obj,target.point,target.scope);
    }else udAddMemberPlacements(scope.id,obj.id,ws);
    onhLog(ws,p,{op:'add',c:'e',id:obj.id,name:obj.name});
    if(!onhSave())throw new Error('Не удалось сохранить бумажку');
  }catch(e){
    restoreWorkspaceMutation(before.data,before.state);
    onh.lastSnap=null;
    updateUI();
    return reject(e.message===full?full:'Не удалось сохранить бумажку. Попробуйте ещё раз');
  }
  onhBroadcast();
  return onhCreatedPaperReply(ws,v.id);
}

function onhApplyEdit(c,x,ops){
  const ws=onhWorld();if(!ws)return {ok:0,rejected:[{why:'Игра закрыта'}]};
  const p=partGet(x.partId);if(!p||p.role==='viewer')return {ok:0,rejected:[{why:'Зритель только смотрит — менять мир могут игроки'}]};
  const now=Date.now();x.edits=(x.edits||[]).filter(t=>now-t<10000);x.edits.push(now);if(x.edits.length>ONH_EDIT_LIMITS.msgsPer10s)return {ok:0,rejected:[{why:'Слишком часто — подождите немного'}]};
  if(ops.length>ONH_EDIT_LIMITS.opsPerMsg)return {ok:0,rejected:[{why:'Слишком большая правка за один раз'}]};
  if(ops.length===1&&ops[0]?.c==='e'&&ops[0]?.op==='createPaper')return onhCreatePaper(ws,p,ops[0]);
  if(ops.length===1&&ops[0]?.c==='paper'&&ops[0]?.op==='paper')return onhApplyPaper(c,ws,ops[0]);
  if(ops.length===1&&ops[0]?.c==='e'&&ops[0].op==='fix')return onhFixCard(c,ws,ops[0]);
  const snap=JSON.parse(onhSnapText()||'null');if(!snap)return {ok:0,rejected:[{why:'Нет мира'}]};
  const seenK=new Map(onpStrokes(snap).map(o=>[o.id,o]));
  const seen={e:new Map(snap.entities.map(o=>[o.id,o])),r:new Map(snap.relations.map(o=>[o.id,o])),a:new Map(snap.articles.map(o=>[o.id,o]))};
  const types=new Set((ws.entityTypes||[]).map(t=>t.id)),relTypes=new Set((ws.relationTypes||[]).map(t=>t.id));
  const rejected=[],conflicts=[];let okN=0,changed=false;const trashIds=[];
  const reject=(why,k,o)=>rejected.push({why,what:k?onhWhatName(k,o):''});
  const big=v=>onhJ(v).length>ONH_EDIT_LIMITS.fieldBytes;
  const mediaOk=list=>(Array.isArray(list)?list:[]).every(m=>{const id=String(m?.id||'');return !id||UniverseGraphStorage.mediaGet(id)});
  // a value the player may write into field f of object kind k
  const clean=(k,f,v)=>{
    if(big(v))return {err:'слишком большое поле'};
    if(k==='e'&&f==='type'&&v!==''&&!types.has(v))return {err:'такого типа нет в наборе правил'};
    if(k==='r'&&f==='type'&&!relTypes.has(v))return {err:'такого вида связи нет'};
    if(k==='r'&&(f==='from'||f==='to')&&(!seen.e.has(v)||seen.e.get(v).hint==='named'))return {err:'конец связи недоступен для правки'};
    if(k==='e'&&f==='media'&&!mediaOk(v))return {err:'картинка не дошла'};
    if(k==='a'&&f==='primaryFor'&&v&&(!seen.e.has(v)||seen.e.get(v).hint))return {err:'бумажка недоступна'};
    if(k==='a'&&f==='parentId'&&v&&!seen.a.has(v))return {err:'такой статьи нет'};
    if(k==='r'&&f==='properties'&&isRecord(v)){v={...v};delete v.secret}
    return {v:clone(v)};
  };
  // order: entities first (an undone delete brings an entity back before its links), then articles, then links;
  // a link to an entity deleted in the same batch is not removed by hand — the trash keeps it with the entity
  const rank=o=>!isRecord(o)?9:o.c==='e'?(o.op==='del'?3:0):o.c==='a'?1:2;
  const delE=new Set(ops.filter(o=>isRecord(o)&&o.c==='e'&&o.op==='del').map(o=>String(o.id||'')));
  ops=ops.slice().sort((x,y)=>rank(x)-rank(y));
  for(const o of ops){
    if(isRecord(o)&&o.c==='r'&&o.op==='del'){const rr=ws.relations.find(z=>z.id===o.id);if(rr&&(delE.has(rr.from)||delE.has(rr.to))){okN++;continue}}
    if(!isRecord(o)||!['e','r','a','k'].includes(o.c)||!['add','set','del'].includes(o.op)){reject('непонятная правка');continue}
    if(o.c==='k'){const r=onhStroke(ws,o,p,seenK);if(r===true){okN++;changed=true}else if(r)reject(r);continue}
    const k=o.c,list=onhList(ws,k),fields=ONH_FIELDS[k];
    if(o.op==='add'){
      const v=isRecord(o.v)?o.v:null,id=String(v?.id||'');
      if(!v||!/^[A-Za-z0-9_-]{3,80}$/.test(id)){reject('непонятная правка');continue}
      if(list.some(z=>z.id===id)){if(seen[k].has(id)){okN++;continue}reject('такой номер уже занят',k,v);continue} /* already back (restored with its entity) */
      if(k==='e'){
        const entry=(ws.trash||[]).find(t=>t.entity?.id===id);
        if(entry){
          if(!snap.trash?.some(t=>t.id===entry.id)){reject('этот номер недоступен');continue}
          if(!onhTrashRestore(ws,entry)){reject('не получилось вернуть из корзины');continue}
          const restored=onhSnapshot(ws);
          const entity=restored.entities.find(e=>e.id===id);
          if(entity)seen.e.set(id,entity);
          for(const relation of restored.relations)if(relation.from===id||relation.to===id)seen.r.set(relation.id,relation);
          onhLog(ws,p,{op:'back',c:'e',id,name:entry.entity.name});
          okN++;changed=true;continue;
        }
      }
      const obj={id};let bad='';
      for(const f of fields){if(v[f]===undefined)continue;const r=clean(k,f,v[f]);if(r.err){bad=r.err;break}obj[f]=r.v}
      if(!bad&&k==='e'&&obj.type===undefined)bad='нет типа';if(!bad&&k==='r'&&(!obj.from||!obj.to||!obj.type))bad='у связи нет концов или вида';
      if(!bad&&k==='a'&&typeof obj.title!=='string')bad='у статьи нет названия';
      if(!bad&&k==='a'&&obj.primaryFor&&list.some(a=>a.primaryFor===obj.primaryFor))bad='у бумажки уже есть основная статья';
      if(bad){reject(bad,k,v);continue}
      if(k==='e')obj.name=String(obj.name||'Без названия').slice(0,300);
      obj.by={id:p.id,name:p.name,at:new Date().toISOString()}; /* 0.30.7: who made it — entities, links and articles */
      if(k==='a'){obj.createdAt=obj.updatedAt=new Date().toISOString()}
      onhLog(ws,p,{op:'add',c:k,id,name:onhLogName(k,obj,ws)});
      list.push(obj);seen[k].set(id,clone(obj));okN++;changed=true;continue}
    const id=String(o.id||''),real=list.find(z=>z.id===id),base=seen[k].get(id);
    if(!real||!base){reject('этого нет в вашей части мира');continue}
    if(base.hint||base.type==='__hint'||k==='r'&&playerRelationMasked(base)){reject('это скрыто Мастером — его нельзя менять',k,base);continue}
    if(k==='e'&&id===ws.rootId&&o.op==='del'){reject('корень мира удалить нельзя',k,real);continue}
    if(o.op==='del'){onhLog(ws,p,{op:'del',c:k,id,name:onhLogName(k,real,ws),...(k==='e'?{}:{old:onhLogSmall(real)})});if(k==='e')trashIds.push(id);else list.splice(list.indexOf(real),1);okN++;changed=true;continue}
    // set: field by field
    const f0=isRecord(o.f)?o.f:{},was=isRecord(o.was)?o.was:{};let any=false;const before={};for(const f of Object.keys(f0))if(fields.includes(f))before[f]=clone(real[f]===undefined?null:real[f]);
    for(const [f,nv] of Object.entries(f0)){
      if(!fields.includes(f)){if(ONH_GM_ONLY.has(f))reject('это может только Мастер',k,real);continue}
      if(k==='a'&&f==='primaryFor'&&nv&&list.some(a=>a.id!==id&&a.primaryFor===nv)){reject('у бумажки уже есть основная статья',k,real);continue}
      if(k==='e'&&f==='note'&&udDescriptionRestricted(real,ws)){reject('описание закрыто Мастером',k,real);continue}
      const r=clean(k,f,nv);if(r.err){reject(r.err,k,real);continue}
      if(f in was&&onhJ(was[f])!==onhJ(base[f])){
        if(udWorkspaceHasPlacements(ws)){reject('это поле уже изменили. Повторите правку',k,real);continue}
        conflicts.push(onhWhatName(k,real));
      }
      if(ONH_RECORD_FIELDS.has(f)){
        // only the keys the player sees: hidden keys stay, a key whose value he sees masked is not changed
        const bv=isRecord(base[f])?base[f]:{},rv=isRecord(real[f])?real[f]:{},v=isRecord(r.v)?r.v:{},out={...rv};let masked=false;
        for(const key of new Set([...Object.keys(bv),...Object.keys(v)])){
          if(onhJ(bv[key])!==onhJ(rv[key])){if(onhJ(v[key])!==onhJ(bv[key]))masked=true;continue}
          if(key in v)out[key]=v[key];else delete out[key]}
        if(masked)reject('в этом поле есть скрытое Мастером — его часть не изменена',k,real);
        real[f]=out;any=true;continue}
      if(f==='map'&&isRecord(r.v)){
        // the master's drawing and the pins / areas of what the player does not see stay as they are
        const rm=isRecord(real.map)?real.map:{},vis=id=>seen.e.has(id)&&!seen.e.get(id).hint;
        real.map={...r.v,drawing:onhJ(base.map?.drawing)===onhJ(rm.drawing)?r.v.drawing:rm.drawing,pins:[...(rm.pins||[]).filter(x=>!vis(x?.entityId)),...(Array.isArray(r.v.pins)?r.v.pins:[]).filter(x=>vis(x?.entityId))],areas:[...(rm.areas||[]).filter(x=>x?.entityId&&!vis(x.entityId)),...(Array.isArray(r.v.areas)?r.v.areas:[]).filter(x=>!x?.entityId||vis(x.entityId))]};
        if(!real.map.drawing)delete real.map.drawing;any=true;continue}
      if(onhJ(base[f])!==onhJ(real[f])){reject('в этом поле есть скрытое Мастером — его нельзя менять',k,real);continue}
      if(k==='e'&&f==='board'){
        const board=isRecord(r.v)?{...r.v}:{};
        // A pending move from another participant must not clear a new lock.
        for(const key of ['lock','fixed']){
          if(real.board?.[key]!==undefined)board[key]=real.board[key];else delete board[key];
        }
        if(Object.keys(board).length)real.board=board;else delete real.board;
      }else real[f]=r.v;
      any=true}
    if(any){if(k==='a')real.updatedAt=new Date().toISOString();const ch=Object.keys(before).filter(f=>onhJ(before[f])!==onhJ(real[f]));if(ch.length)onhLog(ws,p,{op:'set',c:k,id,name:onhLogName(k,real,ws),fields:ch,before:onhLogSmall(Object.fromEntries(ch.map(f=>[f,before[f]])))});okN++;changed=true}
  }
  if(trashIds.length&&onhTrashEntities(ws,trashIds))changed=true;
  if(changed)onhSave();
  // something was not taken: the player gets the world as it is, so his screen does not keep what did not happen
  else if(rejected.length)onhSendWorld(c);
  return {ok:okN,rejected:rejected.slice(0,20),conflicts:[...new Set(conflicts)].slice(0,10)};
}
// into the trash — like deleting by hand, but for the shared world even when the Master is looking at another one
function onhTrashEntities(ws,ids){
  const cur=currentWorkspace()===ws&&!viewAsPlayer();
  if(cur&&typeof deleteEntities==='function'){const keep={sel:state.selectedId,ids:[...state.selectedIds],rel:state.selectedRelationId};deleteEntities(ids,{confirm:false,networkShared:true});
    /* the Master's own selection stays (deleteEntities clears it) */if(getEntity(keep.sel))state.selectedId=keep.sel;state.selectedIds=new Set(keep.ids.filter(i=>getEntity(i)));if(keep.rel&&data.relations.some(r=>r.id===keep.rel))state.selectedRelationId=keep.rel;return true}
  const set=new Set(ids),at=new Date().toISOString(),batch=uid('del');if(!Array.isArray(ws.trash))ws.trash=[];
  const contain=new Set((ws.relationTypes||[]).filter(t=>t.containment).map(t=>t.id)),parentOf=id=>ws.relations.find(r=>contain.has(r.type)&&r.to===id)?.from||null;
  for(const id of ids){const e=ws.entities.find(z=>z.id===id);if(!e)continue;
    ws.trash.push({id:uid('trash'),batch,at,networkShared:true,entity:clone(e),parent:parentOf(id),children:ws.relations.filter(r=>contain.has(r.type)&&r.from===id&&!set.has(r.to)).map(r=>r.to),relations:ws.relations.filter(r=>r.from===id||r.to===id).map(clone),pins:[],areas:[],articleLinks:[],paperBoards:udCapturePaperBoards(ws,id)})}
  for(let i=ws.entities.length-1;i>=0;i--)if(set.has(ws.entities[i].id))ws.entities.splice(i,1);
  for(let i=ws.relations.length-1;i>=0;i--){const r=ws.relations[i];if(set.has(r.from)||set.has(r.to))ws.relations.splice(i,1)}
  normalizeBoards(ws,new Set(ws.entities.map(e=>e.id)));
  if(viewAsPlayer())playerReproject();return true;
}
function onhTrashRestore(ws,t){
  if(currentWorkspace()===ws&&!viewAsPlayer()&&typeof trashRestore==='function')return trashRestore([t.id],{askName:false})>0;
  if(ws.entities.some(z=>z.id===t.entity.id))return false;
  ws.entities.push(clone(t.entity));for(const r of t.relations||[])if(!ws.relations.some(z=>z.id===r.id)&&ws.entities.some(z=>z.id===r.from)&&ws.entities.some(z=>z.id===r.to))ws.relations.push(clone(r));
  udRestorePaperBoards(ws,t.paperBoards||[]);
  ws.trash=ws.trash.filter(z=>z.id!==t.id);if(viewAsPlayer())playerReproject();return true;
}
// save the shared world even while the Master looks «глазами игрока» (his data then is a copy)
function onhSave(){
  if(typeof invalidateContainmentIndex==='function')invalidateContainmentIndex();
  if(typeof boardUI!=='undefined'&&boardUI.open)setTimeout(()=>boardRender(),0);
  if(!viewAsPlayer()){const ok=persist();updateUI();return ok}
  let ok=false;
  try{ok=writeWorld({sharedUpdate:true});if(ok===true&&typeof recordPersistedChange==='function')recordPersistedChange() /* the Master's undo baseline follows (0.30.9) */}catch(e){console.warn('online save',e)}finally{playerReproject();updateUI()}
  if(ok)onhWorldChanged();return !!ok;
}

// 0.30.8: the player's own notes (ws.myNotes with owner = his id): he adds, changes, deletes only his; the Master sees them all
const ONH_NOTES={opsPerMsg:200,perPlayer:500,textMax:4000};
function onhNotesOf(partId){const ws=onhWorld();return (Array.isArray(ws?.myNotes)?ws.myNotes:[]).filter(n=>n&&n.owner===partId&&typeof n.text==='string').map(n=>({id:n.id,text:n.text,at:n.at||'',...(n.edited?{edited:n.edited}:{})}))}
function onhNotesFailed(c,x,seq,error){
  if(x.notesReceipts)onhSend(c,{t:'notes',seq,ok:false,error});
  else onhSend(c,{t:'zoneError',error});
}
function onhNotes(c,x,q){
  const ws=onhWorld(),p=partGet(x.partId),seq=Number(q.seq)||0;
  if(!ws||!p||persistenceLocked){onhNotesFailed(c,x,seq,'Мастер не может сохранить заметки.');return}
  if(q.ops.length>(x.notesReceipts?ONH_NOTES.opsPerMsg:ONH_NOTES.perPlayer)){
    onhNotesFailed(c,x,seq,'Слишком большой пакет заметок.');return;
  }
  const previous=ws.myNotes,next=(Array.isArray(previous)?previous:[]).map(n=>({...n}));
  const okId=v=>typeof v==='string'&&/^[A-Za-z0-9_\-]{3,60}$/.test(v),text=v=>typeof v==='string'?v.trim().slice(0,ONH_NOTES.textMax):'',iso=v=>typeof v==='string'&&!Number.isNaN(Date.parse(v))?v.slice(0,40):new Date().toISOString();
  let changed=false,rejected=0;
  for(const o of q.ops){
    if(!isRecord(o)){rejected++;continue}
    if(o.op==='add'&&isRecord(o.n)&&okId(o.n.id)&&text(o.n.text)){
      const existing=next.find(n=>n.id===o.n.id);
      if(existing?.owner===p.id)continue; /* a retry after the first receipt was lost */
      if(existing||next.length>=2000||next.filter(n=>n.owner===p.id).length>=ONH_NOTES.perPlayer){rejected++;continue}
      next.push({id:o.n.id,owner:p.id,text:text(o.n.text),at:iso(o.n.at)});changed=true;continue;
    }
    if(!okId(o.id)){rejected++;continue}
    const n=next.find(item=>item.id===o.id&&item.owner===p.id);
    if(o.op==='del'){
      if(n){next.splice(next.indexOf(n),1);changed=true}
      continue;
    }
    const value=text(o.text);
    if(o.op!=='set'||!n||!value){rejected++;continue}
    if(value!==n.text){n.text=value;n.edited=iso(o.edited);changed=true}
  }
  if(changed){
    ws.myNotes=next;
    let saved=false;
    try{saved=onhSave()}finally{
      if(!saved){
        const live=onhWorld()||ws;
        if(previous===undefined)delete live.myNotes;else live.myNotes=previous;
        onhNotesFailed(c,x,seq,'Мастер не сохранил заметки.');
      }
    }
    if(!saved)return;
    if(typeof renderMyNotes==='function')renderMyNotes();
  }
  const list=onhNotesOf(p.id),sig=JSON.stringify(list);
  x.notesSig=sig;
  onhSend(c,{t:'notes',seq,ok:true,rejected,list});
}
// the Master changed or deleted a player's note: that player gets his list again
function onhNotesPush(){for(const [c,x] of onh.conns){if(x.state!=='in')continue;const list=onhNotesOf(x.partId),sig=JSON.stringify(list);if(sig!==x.notesSig){x.notesSig=sig;onhSend(c,{t:'notes',list})}}}

// 0.30.5: a stroke of the drawing board from a player: added (with his name), changed, wiped — unless the Master forbade drawing
function onhStroke(ws,o,p,seenK){
  if(ws.sketchPlayers===false)return 'Мастер не разрешил игрокам рисовать на доске';
  const id=String(o.op==='add'?o.v?.id:o.id||''),[sheetId,strokeId]=id.split('~');
  if(!/^[A-Za-z0-9_-]{3,80}$/.test(sheetId||'')||!/^[A-Za-z0-9_-]{3,80}$/.test(strokeId||''))return 'непонятная правка';
  if(!Array.isArray(ws.sketches))ws.sketches=[];let sh=ws.sketches.find(x=>x.id===sheetId);
  if(o.op==='del'){if(!seenK.has(id)||!sh)return 'этого штриха уже нет';const i=(sh.strokes||[]).findIndex(x=>x.id===strokeId);if(i>=0)sh.strokes.splice(i,1);return true}
  const st=o.op==='add'?o.v?.s:o.f?.s;if(!isRecord(st)||JSON.stringify(st).length>300000)return 'штрих не подходит';
  const clean={...clone(st),id:strokeId,by:p.name,byId:p.id};
  if(o.op==='add'){if(!sh){if(ws.sketches.length>=50)return 'слишком много листов';sh={id:sheetId,name:'Лист '+(ws.sketches.length+1),strokes:[],createdAt:new Date().toISOString()};ws.sketches.push(sh)}
    if(!Array.isArray(sh.strokes))sh.strokes=[];if(sh.strokes.length>=5000)return 'на листе слишком много штрихов';if(sh.strokes.some(x=>x.id===strokeId))return true;sh.strokes.push(clean);return true}
  if(!seenK.has(id)||!sh)return 'этого штриха уже нет';const i=(sh.strokes||[]).findIndex(x=>x.id===strokeId);if(i<0)return 'этого штриха уже нет';
  clean.by=sh.strokes[i].by;clean.byId=sh.strokes[i].byId;sh.strokes[i]=clean;return true;
}

// ---- 0.30.6: ИИ Мастера для игроков ----
// Мастер разрешил — вопрос игрока (сообщения для модели: его часть мира и разговор) уходит модели Мастера; ответ — кусочками.

// ---- 0.30.7: журнал правок игроков (только у Мастера; игрокам не уходит) ----
const ONH_LOG_MAX=1500;
function onhLogName(k,o,ws){if(k==='e')return String(o?.name||'?');if(k==='a')return String(o?.title||'?');const n=id=>ws.entities.find(e=>e.id===id)?.name||'?';return `${n(o?.from)} → ${n(o?.to)}`}
function onhLogSmall(v){const t=JSON.stringify(v===undefined?null:v);return t.length>40000?null:JSON.parse(t)}
function onhLog(ws,p,entry){if(!Array.isArray(ws.playerLog))ws.playerLog=[];ws.playerLog.push({lid:uid('plog'),at:new Date().toISOString(),who:p.name,whoId:p.id,session:onh.session||'',...entry});if(ws.playerLog.length>ONH_LOG_MAX)ws.playerLog.splice(0,ws.playerLog.length-ONH_LOG_MAX)}

function onhApplyPaper(actor,ws,op){
  const refuse=why=>{onhSendWorld(actor);return {ok:0,rejected:[{why}],conflicts:[]}};
  if(persistenceLocked||typeof op.scope!=='string'||typeof op.id!=='string'||!isRecord(op.was)||!isRecord(op.f))return refuse('Изменение бумажки недоступно');
  onhSnapText();
  const projected=onh.paperBoards?.[op.scope]?.placements;
  const realId=onh.paperBindings?.get(JSON.stringify([op.scope,op.id]))||op.id;
  const paper=ws.boards?.[op.scope]?.placements?.items.find(p=>p.id===realId);
  if(!paper||!projected?.items.some(p=>p.id===op.id))return refuse('Бумажка больше недоступна');
  const lease=udPaperLeases.get(JSON.stringify([op.scope,realId]));
  if(lease&&lease.actor!==actor&&lease.expires>performance.now())return refuse('Бумажку уже двигает другой участник');
  const was=udPaperFields(paper),next=op.f;
  if(Object.keys(was).some(k=>was[k]!==op.was[k]))return refuse('Бумажка уже изменилась. Повторите действие');
  const moves=next.x!==was.x||next.y!==was.y;
  if(moves){
    if(was.locked||!udCoordinate(next.x)||!udCoordinate(next.y)||
      ['locked','w','h','autoHeight'].some(k=>was[k]!==next[k]))return refuse('Перемещение недоступно');
  }else{
    const sized=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
    const validLock=next.locked===true&&next.autoHeight===(was.h===null)&&
      (was.w===null?sized(next.w,BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w):next.w===was.w)&&
      (was.h===null?sized(next.h,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h):next.h===was.h);
    const validUnlock=next.locked===false&&next.autoHeight===false&&(next.w===was.w||next.w===null)&&next.h===(was.autoHeight?null:was.h);
    if(was.locked===next.locked||!(validLock||validUnlock))return refuse('Некорректное закрепление');
  }
  const original={...paper};
  const apply=fields=>{
    for(const k of Object.keys(was)){
      if(fields[k]===false||fields[k]==null)delete paper[k];else paper[k]=fields[k];
    }
  };
  apply(next);
  if(!onhSave()){apply(original);updateUI();return refuse('Не удалось сохранить бумажку')}
  onhBroadcast();
  return {ok:1,rejected:[],conflicts:[]};
}

