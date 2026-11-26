// Universe Graph — игра по сети, сторона игрока (0.30.3). Работает, когда страницу открыли по ссылке игры
// (onlinedetect.js). Сначала — страница входа: ник и пароль; пароль в сеть не уходит: программа Мастера присылает «вопрос»
// (соль, число повторов, одноразовое слово), браузер считает ответ из пароля и отправляет только его. Потом приходит мир
// (только то, что видят игроки), картинки — по запросу. Пароль держится в памяти до закрытия вкладки — для переподключения.
// 0.30.4: игрок правит мир — после каждого сохранения разница с копией от Мастера уходит Мастеру (onpPersist); своя отмена —
// обратными правками (onpUndo). 0.30.8: свои заметки игрока (уходят Мастеру, без связи — копятся и уходят при входе);
// копия мира в браузере (IndexedDB) — открывается без связи «только посмотреть»; play-sw.js хранит файлы программы.
// Модуль загружается обычным <script> перед app.js; имена — с приставкой onp.
'use strict';
const ONP_NICK_KEY='ug-online-nick'+(window.UG_ONLINE_PLAYER?.stable?':'+window.UG_ONLINE_PLAYER.room:'');
const onp={world:null,ver:0,ws:null,state:'off',me:null,gm:null,pass:'',nick:'',partId:'',avatars:[],avatarPending:false,retry:0,timer:0,mediaAsked:new Set(),mediaTimer:0,first:true,why:'',base:null,pendingWorld:null,undo:[],redo:[],seq:0,sentMedia:new Set(),viewerNoted:false,copy:false,copyNoted:false,outbox:[],tab:Math.random().toString(36).slice(2,10)+Date.now().toString(36),lastMsg:0,notes:[],notesPending:[],notesSeq:0,saveTimer:0};
const onpImages={workspace:null,ids:new Set(),missing:new Map(),absent:new Set(),version:null,batch:null,timer:0,next:0,seq:0};

function onpActive(){return !!window.UG_ONLINE_PLAYER}
function onpMsg(text,kind=''){const el=$('#onpMsg');if(el){el.textContent=text;el.className='onpMsg'+(kind?' is'+kind:'')}}
function onpGate(show){const g=$('#onpGate');if(g)g.hidden=!show;if(show&&typeof onpCopyGateRender==='function')onpCopyGateRender();document.documentElement.classList.toggle('ugOnlineIn',!show);if(show)setTimeout(onpFocusLogin,0)}
function onpFocusLogin(){
  if($('#onpGate')?.hidden)return;
  const el=onp.partId?$('#onpPass'):$('#onpAvatars button')||($('#onpNick')?.value?$('#onpPass'):$('#onpNick'));
  el?.focus();
}
function onpLoginHint(){return onp.avatars.length?'Выберите свой аватар и введите пароль.':'Впишите ник и пароль, которые дал Мастер.'}
function onpRenderAvatars(){
  const host=$('#onpAvatars'),has=onp.avatars.length>0;
  if(!host)return;
  host.hidden=!has;
  $('#onpNickLabel').hidden=$('#onpNick').hidden=has;
  $('#onpNick').disabled=has;
  const html=onp.avatars.map(p=>`<button type="button" class="onpAvatar" data-onp-avatar="${escapeHtml(p.id)}" aria-pressed="${p.id===onp.partId}">${partAvatarHtml(p)}<span style="--part-c:${p.color}">${escapeHtml(p.name)}</span></button>`).join('');
  if(onp.avatarHtml===html)return;
  const focused=document.activeElement?.dataset?.onpAvatar;
  host.innerHTML=html;
  onp.avatarHtml=html;
  if(focused)host.querySelector(`[data-onp-avatar="${CSS.escape(focused)}"]`)?.focus();
}
function onpTakeRoster(m){
  const avatars=Array.isArray(m.avatars)?m.avatars:[];
  onp.avatars=avatars.slice(0,PART_MAX).filter(p=>p&&typeof p.id==='string'&&/^[a-z0-9_-]{3,60}$/i.test(p.id)).map(p=>({...partClean(p),online:p.online===true})).filter(p=>p.name);
  if(m.gm&&typeof m.gm==='object')onp.gm=m.gm;
  if(onp.me){
    const p=onp.avatars.find(p=>p.id===onp.me.id);
    if(p)onp.me={id:p.id,name:p.name,color:p.color,avatar:p.avatar,role:p.role};
  }
  if(onp.partId&&!onp.avatars.some(p=>p.id===onp.partId)){
    onp.partId='';onp.pass='';if($('#onpPass'))$('#onpPass').value='';
  }
  onpRenderAvatars();
  if(onp.state==='in'&&typeof renderRoleMenu==='function')renderRoleMenu();
}
function onpBusy(on){const b=$('#onpGo');if(b)b.disabled=!!on}
function onpMessage(obj){return JSON.stringify({...obj,...(!Object.hasOwn(obj,'workspace')&&onp.world?{workspace:onp.world.id}:{})})}
function onpSend(obj,wire=onpMessage(obj)){
  const ws=onp.ws;
  if(!ws||ws.readyState!==undefined&&ws.readyState!==1)return false;
  try{ws.send(wire);return true}catch{return false}
}
const ONP_WHY={pass:'Неверный ник или пароль.',world:'Вам нет места в этом мире — спросите Мастера.',locked:'Слишком много ошибок с этим ником — попробуйте через 10 минут.',gm:'Мастер не пустил.',
  tries:'Слишком много неверных попыток. Обновите страницу и попробуйте снова.',elsewhere:'Вы вошли в игру с другого устройства или вкладки.',gone:'Мастер изменил ваш вход (ник, пароль или мир). Войдите снова.',closed:'Мастер закрыл игру.',big:'Слишком большое сообщение.',
  'world-size':'Мир превышает допустимый размер для этой версии. Проверьте, что у Мастера и игрока установлена актуальная версия.',identity:'Не удалось подтвердить сервер Мастера. Попросите у Мастера новую ссылку.'};

function onpConnect(){
  clearTimeout(onp.timer);if(!onpActive()||window.UG_ONLINE_PLAYER.invalid)return;
  const config=window.UG_ONLINE_PLAYER;let ws,challenge;try{challenge=config.stable?udStableSocket(config):null;ws=new WebSocket(challenge?challenge.url:config.ws)}catch(e){onpMsg('Не удалось подключиться: '+e.message,'Bad');return}
  onp.ws=ws;onp.state='connecting';onp.connectAt=performance.now();onp.lastMsg=0;onpBusy(true);if(onp.me)onpMsg('Связь с Мастером прервалась — переподключаюсь…');else if(!$('#onpMsg')?.classList.contains('isBad'))onpMsg('Подключаюсь к игре…');
  let verified=!challenge,checking=false;const pending=[];
  const dispatch=m=>{if(onp.ws===ws&&m&&typeof m==='object')onpOn(m).catch(e=>console.warn('online',e))};
  const refuse=()=>{if(onp.ws!==ws)return;onp.why='identity';ws.close()};
  ws.binaryType='arraybuffer';ws.onmessage=ev=>{if(onp.ws!==ws)return;onp.lastMsg=performance.now();if(!verified&&(typeof ev.data!=='string'||ev.data.length>256*1024)){refuse();return}let m;try{m=typeof ev.data==='string'?JSON.parse(ev.data):verified&&typeof udNetDecodeWire==='function'?udNetDecodeWire(ev.data):null}catch{if(!verified)refuse();return}
    if(verified){dispatch(m);return}
    if(checking){if(pending.length>=8){refuse();return}pending.push(m);return}
    checking=true;udStableVerify(config,challenge.nonce,m).then(ok=>{if(onp.ws!==ws)return;if(!ok){refuse();return}verified=true;for(const packet of pending.splice(0))dispatch(packet)}).catch(refuse);
  };
  ws.onclose=ev=>onpLost(ws,ev);
  ws.onerror=()=>{};
}
// the connection is gone (closed, or silent for too long): back to the gate and try again
function onpLost(ws,ev={}){{if(onp.ws!==ws)return;
    onp.lastDisconnect={at:Date.now(),phase:onp.state,source:ev.source||'socket',code:ev.code??null,
      reason:onp.why||ev.reason||'',silenceMs:onp.lastMsg?Math.round(performance.now()-onp.lastMsg):null};
    onp.ws=null;onp.worldTransfer=null;onpResetMedia();onpResetNotesFlight();onpUploadReceipt?.finish(null);const was=onp.state;onp.state='off';udDragClear();onp.avatarPending=false;onpBusy(false);
    if(typeof udPeopleRefresh==='function')udPeopleRefresh();
    if(onp.why==='identity'){onp.why='';onp.pass='';if(onp.copy){onpCopyBar();toast(ONP_WHY.identity,'err')}else{onpGate(true);onpMsg(ONP_WHY.identity,'Bad')}return}
    if(onp.copy){onp.why='';onpCopyBar();onpRetry();return} /* 0.30.8: looking at the copy — the gate stays away, the bar says when the Master is back */
    if(onp.why){onpGate(true);onpMsg(ONP_WHY[onp.why]||'Связь закрыта.','Bad');const w=onp.why;onp.why='';onp.retry=0;if(w==='identity'){onp.pass='';return}onp.timer=setTimeout(onpConnect,w==='closed'?10000:300);return}
    if(ev.code===4007){
      onp.me=null;onp.outbox=[];onp.pass='';$('#onpPass').value='';
      onpGate(true);onpMsg('Мастер отключил вас от игры.','Bad');
      onpRetry(); // Restore the login screen and roster; a fresh password is required.
      return;
    }
    onpGate(true);onpMsg(was==='in'?'Связь с Мастером прервалась — переподключаюсь…':'Мастер сейчас не в сети или игра закрыта. Пробую снова…',was==='in'?'':'Bad');onpRetry(was==='in'?300:0)}}
// 0.30.9: a connection that went silent (the network dropped without a word): no answer for 20 s — cut it and reconnect
const ONP_SILENT_MS=20000,ONP_HELLO_MS=25000;
function onpWatch(){
  const ws=onp.ws;if(!ws)return;
  const now=performance.now();
  const connecting=onp.state==='connecting'&&now-onp.connectAt>ONP_HELLO_MS;
  const loginStalled=onp.state==='login'&&now-onp.loginAt>ONP_HELLO_MS;
  const stalled=onp.worldTransfer&&now-onp.worldTransfer.at>ONP_HELLO_MS;
  const silent=!document.hidden&&onp.state==='in'&&onp.lastMsg&&now-onp.lastMsg>(onp.silentMs||ONP_SILENT_MS);
  if(!connecting&&!loginStalled&&!stalled&&!silent)return;
  try{ws.onclose=null;ws.close()}catch{}
  onpLost(ws,{source:connecting?'hello-timeout':loginStalled?'login-timeout':stalled?'world-timeout':'watchdog'});
}
function onpRetry(ms){onp.retry++;onp.timer=setTimeout(onpConnect,ms||Math.min(15000,1500*onp.retry))}
const ONP_PART_INTERVAL=60;
function onpWorldPart(m){
  const {id,workspace,offset,total,part}=m;
  if(typeof id!=='string'||typeof workspace!=='string'||!Number.isSafeInteger(total)||
    total<1||total>ONH_WORLD_TOTAL||typeof part!=='string'||!part.length||part.length>ONH_WORLD_PART)return null;
  if(offset===0)onp.worldTransfer={id,workspace,total,offset:0,parts:[],at:performance.now()};
  const transfer=onp.worldTransfer;
  if(!transfer||transfer.id!==id||transfer.workspace!==workspace||transfer.total!==total||
    transfer.offset!==offset||offset+part.length>total)return null;
  transfer.parts.push(part);transfer.offset+=part.length;transfer.at=performance.now();
  if(transfer.offset<total){
    const ws=onp.ws;
    setTimeout(()=>{if(onp.ws===ws&&onp.worldTransfer===transfer)onpSend({t:'worldNext',id,offset:transfer.offset,workspace})},ONP_PART_INTERVAL);
    return null;
  }
  onp.worldTransfer=null;
  const message=JSON.parse(transfer.parts.join(''));
  return ['in','world','delta'].includes(message?.t)?message:null;
}
async function onpOn(m){
  if(m.t==='worldPart'){const whole=onpWorldPart(m);if(whole)return onpOn(whole);return}
  if(m.t==='hello'){
    onp.state='hello';onp.retry=0;onp.mediaFlow=m.mediaFlow===1;onp.mediaPull=m.mediaPull===1;onp.mediaV2=m.mediaV2===1&&typeof udNetAskMedia==='function';onp.boardChanges=m.boardChanges===1;onp.sentMedia.clear();onpTakeRoster(m);onpBusy(false);onpCopyBar();
    if(onp.pass&&onp.nick)onpLogin(onp.nick,onp.pass,true,onp.partId);
    else {
      if(!$('#onpMsg')?.classList.contains('isBad'))onpMsg(onpLoginHint());
      onpFocusLogin();
    }
    return;
  }
  if(m.t==='zones'){onp.zones=Array.isArray(m.zones)?m.zones:[];updateWorkspacePopup();return}if(m.t==='zoneError'){toast(m.error||'Не удалось перейти в зону','err');return}if(m.t==='roster'){onpTakeRoster(m);return}
  if(m.t==='avatarAck'&&onp.state==='in'){
    onp.avatarPending=false;
    if(typeof udPeopleRefresh==='function')udPeopleRefresh();
    toast(m.ok?'Картинка аватара сохранена':m.error||'Не удалось сохранить аватар',m.ok?'ok':'err');
    return;
  }
  if(m.t==='challenge'){
    const salt=String(m.salt||''),iter=Math.max(10000,Math.min(2000000,Number(m.iter)||0)),nonce=String(m.nonce||'');
    if(onp.state!=='login')return;
    const ws=onp.ws,pass=onp.pass;
    try{
      const h=await partHash(pass,salt,iter),proof=await onhProof(h.hash,nonce);
      if(onp.ws===ws&&onp.state==='login')onpSend({t:'proof',proof});
    }catch{
      if(onp.ws===ws){onp.pass='';onpMsg('Не удалось проверить пароль. Переподключаюсь…','Bad');ws?.close()}
    }
    return;
  }
  if(m.t==='denied'){onpBusy(false);onp.state='hello';onp.pass='';onpGate(true);onpMsg(m.why==='paper-version'?'Для этой доски нужна новая версия Universe Detective.':ONP_WHY[m.why]||'Вход не удался.','Bad');$('#onpPass')&&($('#onpPass').value='');return}
  if(m.t==='wait'){onp.state='wait';onpMsg('Ждём, пока Мастер пустит…');return}
  if(m.t==='bye'){if(m.why==='paper-version')onpMsg('Обновите Universe Detective для этой доски.','Bad');if(onp.state==='in')onpCopySave(true); /* the game ends — the copy is as fresh as it gets */onp.why=String(m.why||'');if(['elsewhere','gone','tries','closed','world-size'].includes(onp.why)){onp.me=null;onp.pass=''}return}
  if(m.t==='in'&&m.world?.id&&Array.isArray(m.world.entities)){if(onp.outboxMe&&onp.outboxMe!==m.me?.id){onp.mediaAsked.clear();udPlayerZoneState.clear();onp.undo=[];onp.redo=[];onp.notesPending=[];onp.world=null;onp.first=true}onp.state='in';onp.me=m.me&&typeof m.me==='object'?m.me:null;onp.gm=m.gm&&typeof m.gm==='object'?m.gm:null;
    try{localStorage.setItem(ONP_NICK_KEY,onp.nick)}catch{}
    if(onp.outboxMe&&onp.outboxMe!==onp.me?.id)onp.outbox=[];onp.outboxMe=onp.me?.id||'';
    if(m.world?.id!==onp.world?.id)udEnteringZone(m.world.id,m.notes||[]);
    const wasCopy=onp.copy;onp.copy=false;if(wasCopy)onp.first=false;
    if(onp.notesPending.length&&onp.copyMe&&onp.copyMe!==onp.me?.id)onp.notesPending=[];onp.copyMe='';
    if(!wasCopy&&!onp.notesPending.length)onpRestorePendingNotes();
    onpNotesTake(m.notes);onpTake(m.world,m.ver);onpGate(false);onpMsg('');onpCopyBar();onpNotesFlush(true);onpOutboxResend();if(!onp.swReady&&document.readyState==='complete')setTimeout(onpSwSetup,3000);return}
  if(m.t==='notes'&&onp.state==='in'){if(m.workspace&&m.workspace!==onp.world?.id)return;onpNotesTake(m.list,m.seq,m);return}
  if(m.t==='world'&&onp.state==='in'&&m.world?.id&&Array.isArray(m.world.entities)){
    if(m.world.id!==onp.world?.id)udEnteringZone(m.world.id,m.notes||[]);
    else if(Number(m.ver)<onp.ver)return;
    if(Array.isArray(m.notes))onpNotesTake(m.notes);
    onpTake(m.world,m.ver);onpNotesFlush(true);return
  }
  // 0.30.5: only what changed; a missed step — ask for the whole world
  if(m.t==='delta'&&onp.state==='in'){if(m.workspace&&m.workspace!==onp.world?.id)return;if(!onp.world||Number(m.from)!==onp.ver){onpSend({t:'resync'});return}onlApplyOps(onp.world,m.ops);onp.ver=Number(m.to)||onp.ver+1;
    if(!udApplyRemoteBoardMove(m.ops))onpInstall(clone(onp.world));return}
  if(m.t==='ack'){onpAck(m);return}
  if(m.t==='boardDrag'&&onp.state==='in'){if(m.workspace&&m.workspace!==onp.world?.id)return;udDragTake(m);return}
  if(m.t==='pres'){if(m.workspace&&m.workspace!==onp.world?.id)return;if(typeof prsTake==='function')prsTake(m.list);if(typeof renderRoleMenu==='function'&&$('#roleMenu')?.classList.contains('open'))renderRoleMenu();return}
  if(m.t==='pong'){if(typeof prs!=='undefined'&&prs.pingAt)prs.ping=Math.round(performance.now()-prs.pingAt);return}
  if(m.t==='mediaAck'){
    const pending=onpUploadReceipt;
    if(pending&&m.id===pending.id&&m.offset===pending.offset&&(!m.workspace||m.workspace===pending.workspace))pending.finish(m);
    return;
  }
  if(m.t==='mediaCatalog2'&&onp.mediaV2)return udNetReceiveCatalog(m);
  if(m.t==='mediaData2'&&onp.mediaV2)return udNetReceiveData(m);
  if(m.t==='mediaInvalidated2'&&onp.mediaV2)return udNetInvalidateCatalog(m);
  if(m.t==='media'&&Array.isArray(m.items))onpReceiveMedia(m);
}
function onpLogin(nick,pass,silent=false,id=''){
  const avatar=id?onp.avatars.find(p=>p.id===id):null;
  if(onp.avatars.length&&!avatar){onpMsg('Сначала выберите свой аватар.','Bad');onpFocusLogin();return}
  nick=partCleanName(avatar?.name||nick);
  if(!nick||!pass){onpMsg(avatar?'Впишите пароль.':'Впишите ник и пароль.','Bad');return}
  if(!['off','connecting','hello'].includes(onp.state))return;
  onp.nick=nick;onp.pass=String(pass);onp.partId=avatar?.id||'';
  if(!onp.ws||onp.state!=='hello'){
    onpMsg('Подключаюсь к игре…');if(!onp.ws)onpConnect();return;
  }
  onp.state='login';onp.loginAt=performance.now();onpBusy(true);if(!silent)onpMsg('Проверяю…');
  onpSend({t:'login',...(avatar?{partId:avatar.id}:{nick}),papers:1,editor:2,boardChanges:1,worldParts:1,notesReceipts:1,sharedLayout:1,mediaV2:onp.mediaV2?1:0,mediaBinary:onp.mediaV2?1:0,workspace:udLastPlayerZone()});
}
// the world from the Master: replaces what is shown, keeps where the player is looking
function onpInstall(world){
  if(!world||typeof world!=='object'||!Array.isArray(world.entities))return;
  if(typeof appBooted!=='undefined'&&!appBooted){
    onp.pendingWorld=world;
    if(!onp.installTimer)onp.installTimer=setTimeout(()=>{onp.installTimer=0;onpFlushWorld()},200);
    return
  }
  // an editor is open: the new world waits until it is closed (the person's typing is not swept away)
  if($('#modalBack')?.classList.contains('open')){onp.pendingWorld=world;return}
  if(!onp.first&&onp.world?.id===world.id&&currentWorkspace()?.id===world.id){udKeepPlayerZone();world.view=clone(udPlayerZoneState.get(world.id)?.view||{})}
  onp.pendingWorld=null;previewBoards.clear();if(onp.mediaV2&&!onp.copy)udNetSyncWorldAccess(world);
  /* 0.30.9: own changes the Master has not confirmed yet stay on screen (slow network: no blinking, nothing vanishes) */
  if(onp.outbox.length&&!onp.copy)for(const o of onp.outbox)if(!o.workspace||o.workspace===world.id)onlApplyOps(world,o.ops);
  const first=onp.first;onp.first=false;const keep={hiddenTiers:[...(state.hiddenTiers||[])],context:clone(state.udContainerContext||null),contextHistory:clone(state.udContextHistory||[]),scope:state.scopeId,sel:state.selectedId,ids:[...(state.selectedIds||[])],rel:state.selectedRelationId,mode:state.visualMode,
    boardPanX:state.boardPanX,boardPanY:state.boardPanY,boardZoom:state.boardZoom};
  world.myNotes=onpNotesView();data={version:WORLD_SCHEMA_VERSION,metadata:{},workspaces:[world]};state.workspaceId=world.id;normalize();
  const ws=currentWorkspace();applyWorkspace(ws);udApplyPlayerFilters(world.view);onp.base=onpCopy(ws);
  if(typeof invalidateContainmentIndex==='function')invalidateContainmentIndex();state.viewVersion=(state.viewVersion||0)+1;
  if(first){state.scopeId=getEntity(world.view?.scopeId)?world.view.scopeId:ws.rootId||data.entities[0]?.id;state.history=[state.scopeId];state.historyIndex=0;setScope(state.scopeId,{push:false,center:false});if(!world.view)fitView()}
  else{state.hiddenTiers=new Set(keep.hiddenTiers);if(getEntity(keep.scope)){
      state.scopeId=keep.scope;
      state.udContainerContext=udBoundContainerContext(keep.context);
      if(!udContainerContext())state.udContainerContext=null;
      udRestoreSharedContext();
      state.udContextHistory=keep.contextHistory;
      state.boardPanX=keep.boardPanX;state.boardPanY=keep.boardPanY;state.boardZoom=keep.boardZoom;
    }/* 0.30.9: someone else's edit keeps the player's whole selection (several picked with Shift, a picked link) */
    const ids=keep.ids.filter(id=>getEntity(id));state.selectedId=getEntity(keep.sel)?keep.sel:null;state.selectedIds=new Set(ids.length?ids:state.selectedId?[state.selectedId]:[]);
    state.selectedRelationId=keep.rel&&data.relations.some(r=>r.id===keep.rel)?keep.rel:null;state.visualMode=keep.mode}
  if(typeof renderRoleMenu==='function')renderRoleMenu();updateUI();if(typeof renderMyNotes==='function')renderMyNotes();if(typeof boardUI!=='undefined'&&boardUI.open)boardRender();if(!onp.copy){onpAskMedia(onp.world||world);onpCopySave()}
}
function onpTake(world,ver){if(!world||typeof world!=='object')return;if(onp.world?.id===world.id&&currentWorkspace()?.id===world.id&&typeof udKeepPlayerZone==='function')udKeepPlayerZone();onp.world=world;const saved=typeof udPlayerZoneState!=='undefined'?udPlayerZoneState.get(world.id):null;if(saved?.view)world.view=clone(saved.view);onp.ver=Number(ver)||0;onpInstall(clone(world))}
function onpFlushWorld(){if(onp.pendingWorld&&!$('#modalBack')?.classList.contains('open'))onpInstall(onp.pendingWorld)}
// ---- 0.30.4: правка ----
const ONP_COLLS=[['e','entities'],['r','relations'],['a','articles'],['k','sketches']];
// 0.30.5: strokes of the drawing board are items of their own («лист~штрих») — each travels alone
function onpCopy(ws){
  const o={};
  for(const [k,f] of ONP_COLLS)o[k]=k==='k'?onpStrokes(ws):clone(Array.isArray(ws?.[f])?ws[f]:[]);
  for(const row of [...o.e,...o.a])if(Array.isArray(row?.media))for(const image of row.media){
    if(isRecord(image))delete image.dataUrl;
  }
  return o;
}
function onpStrokes(ws){const out=[];for(const sh of Array.isArray(ws?.sketches)?ws.sketches:[])for(const st of Array.isArray(sh?.strokes)?sh.strokes:[])if(st?.id)out.push({id:sh.id+'~'+st.id,sheet:sh.id,s:clone(st)});return out}
// a change (from the Master or from the player himself) applied to a world object: add / set / del per kind
function onlApplyOps(world,ops){
  for(const o of Array.isArray(ops)?ops:[]){
    if(!o||typeof o!=='object'||o.op==='fix'||o.op==='createPaper')continue;
    if(o.c==='k'){if(!Array.isArray(world.sketches))world.sketches=[];
      const id=String(o.op==='add'?o.v?.id:o.id||''),[sheetId,strokeId]=id.split('~');if(!sheetId||!strokeId)continue;
      let sh=world.sketches.find(x=>x.id===sheetId);if(!sh){if(o.op==='del')continue;sh={id:sheetId,name:'Лист',strokes:[]};world.sketches.push(sh)}
      if(!Array.isArray(sh.strokes))sh.strokes=[];const i=sh.strokes.findIndex(x=>x.id===strokeId);
      if(o.op==='del'){if(i>=0)sh.strokes.splice(i,1);continue}
      const st=o.op==='add'?o.v.s:o.f?.s;if(!st)continue;if(i>=0)sh.strokes[i]=st;else sh.strokes.push(st);continue}
    const f={e:'entities',r:'relations',a:'articles'}[o.c];if(!f)continue;if(!Array.isArray(world[f]))world[f]=[];const list=world[f];
    if(o.op==='add'){const i=list.findIndex(x=>x.id===o.v?.id);if(i>=0)list[i]=o.v;else list.push(o.v);continue}
    const i=list.findIndex(x=>x.id===o.id);if(i<0)continue;
    if(o.op==='del'){list.splice(i,1);continue}
    for(const [k,v] of Object.entries(o.f||{})){if(v===null)delete list[i][k];else list[i][k]=v}
  }
  return world;
}
const onpJ=v=>JSON.stringify(v===undefined?null:v);
// what changed against the copy from the Master: add / set (field by field, with the old value) / del (with the old object)
function onpDiff(base,cur){
  const ops=[];
  for(const [k] of ONP_COLLS){
    const b=new Map((base[k]||[]).map(o=>[o.id,o])),c=new Map((cur[k]||[]).map(o=>[o.id,o]));
    for(const [id,o] of c){const was=b.get(id);if(!was){ops.push({c:k,op:'add',v:o});continue}
      const f={},w={};for(const key of new Set([...Object.keys(o),...Object.keys(was)])){if(key==='id'||key==='updatedAt'||key==='createdAt')continue;if(onpJ(o[key])!==onpJ(was[key])){f[key]=o[key]===undefined?null:o[key];w[key]=was[key]===undefined?null:was[key]}}
      if(Object.keys(f).length)ops.push({c:k,op:'set',id,f,was:w})}
    for(const [id,o] of b)if(!c.has(id))ops.push({c:k,op:'del',id,old:o})}
  return ops;
}
function onpInverse(ops){return ops.slice().reverse().map(o=>o.op==='fix'?{...o,locked:!o.locked}:o.op==='paper'?{...o,f:o.was,was:o.f}:o.op==='add'?{c:o.c,op:'del',id:o.v.id,old:o.v}:o.op==='del'?{c:o.c,op:'add',v:o.old}:{c:o.c,op:o.op==='patch'?'patch':'set',id:o.id,f:o.was,was:o.f})}
function onpFixCard(op){
  if(worldReadOnly()||onp.outbox.some(item=>item.ops.some(queued=>queued.op==='fix'&&queued.id===op.id)))return false;
  onpSendOps([op],true);
  return true;
}
function onpSendOps(ops,recordFix=false,paperHistory=null,acknowledge=null,onSend=null){
  const out={workspace:currentWorkspace()?.id,seq:++onp.seq,recordFix,paperHistory,acknowledge,onSend,ops:ops.map(o=>({...o}))};
  onp.outbox.push(out);
  onpFlushOutbox();
  return out.seq;
}
let onpUploadReceipt=null,onpUploadChain=Promise.resolve();
const onpUploadPackets=[];
function onpMediaCandidates(value,workspace){
  if(workspace!==onp.world?.id)return [];
  return [...new Set(JSON.stringify(value).match(/media-[a-z0-9]{3,12}-[a-z0-9]{2,8}/g)||[])].filter(id=>
    !onpImages.ids.has(id)&&!onp.mediaAsked.has(id)&&!onp.sentMedia.has(id)&&UniverseGraphStorage.mediaGet(id)?.data);
}
function onpMediaPacket(message,ws,workspace){
  if(onp.ws!==ws||onp.state!=='in'||onp.world?.id!==workspace)return Promise.resolve(null);
  return new Promise(resolve=>{
    const finish=result=>{clearTimeout(timeout);if(onpUploadReceipt?.finish===finish)onpUploadReceipt=null;resolve(result)};
    const timeout=setTimeout(()=>finish(null),20000);
    onpUploadReceipt={id:message.id,offset:message.offset,workspace,finish};
    onpSend({...message,workspace});
  });
}
async function onpUploadBudget(bytes,ws,workspace){
  // The installed relay budgets all player messages over a minute. Reserve
  // room for edits, pings and requests while sustaining uploads across windows.
  const limit=40*1024*1024;
  for(;;){
    if(onp.ws!==ws||onp.state!=='in'||onp.world?.id!==workspace)return false;
    const now=Date.now();
    while(onpUploadPackets.length&&now-onpUploadPackets[0].at>=60000)onpUploadPackets.shift();
    if(onpUploadPackets.reduce((sum,packet)=>sum+packet.bytes,bytes)<=limit){
      onpUploadPackets.push({at:now,bytes});return true;
    }
    await new Promise(resolve=>setTimeout(resolve,Math.min(1000,Math.max(1,60000-now+onpUploadPackets[0].at))));
  }
}
async function onpUploadFile(id,file,workspace,ws){
  const message={t:'mediaPut',id,mime:file.mime,name:file.filename||''};
  const total=file.data.length,partSize=ONH_MEDIA_PART;
  if(!onp.mediaFlow&&total>990000)return {error:'Для передачи этого фото нужна новая версия у Мастера'};
  for(let offset=0;offset<total;){
    const data=file.data.slice(offset,onp.mediaFlow?offset+partSize:total);
    if(!await onpUploadBudget(data.length+1024,ws,workspace))return {interrupted:true};
    const receipt=await onpMediaPacket({...message,data,...(onp.mediaFlow?{offset,total}:{})},ws,workspace);
    if(!receipt)return onp.ws!==ws||onp.world?.id!==workspace?{interrupted:true}:{retry:true};
    if(!receipt.ok)return {error:receipt.why||'Мастер не принял изображение'};
    offset+=data.length;
    if(onp.mediaFlow&&(offset===total?!receipt.done:receipt.next!==offset))return {error:'Мастер не подтвердил часть изображения'};
  }
  return {ok:true};
}
function onpUploadFiles(ids,workspace,ws=onp.ws){
  const upload=async()=>{
    for(const id of ids){
      if(onp.sentMedia.has(id))continue;
      const file=UniverseGraphStorage.mediaGet(id);
      if(!file?.data)return {error:'Изображение больше недоступно на этом устройстве'};
      let result=await onpUploadFile(id,file,workspace,ws);
      if(result.retry)result=await onpUploadFile(id,file,workspace,ws);
      if(result.retry)return {error:'Мастер не подтвердил сохранение изображения. Повторите загрузку.'};
      if(!result.ok)return result;
      onp.sentMedia.add(id);
    }
    return {ok:true};
  };
  const next=onpUploadChain.then(upload);
  onpUploadChain=next.catch(()=>{});
  return next;
}
function onpFlushOutbox(){
  const ws=onp.ws;
  if(!ws||onp.state!=='in')return;
  for(const item of onp.outbox){
    if(item.sentOn===ws)continue;
    if(item.uploading)return;
    const edit={t:'edit',workspace:item.workspace,seq:item.seq,tab:onp.tab,ops:item.ops},wire=onpMessage(edit);
    if(wire.length>ONH_MESSAGE_CHAR_LIMIT){
      item.uploading=true;
      queueMicrotask(()=>{
        onpAck({seq:item.seq,workspace:item.workspace,
          rejected:[{why:'Слишком большая правка. Сохраните изменения меньшими частями.'}],local:true});
        onpFlushOutbox();
      });
      return;
    }
    const ids=onpMediaCandidates(item.ops,item.workspace);
    if(ids.length){
      item.uploading=true;
      const finish=result=>{
        item.uploading=false;
        if(result.error&&onp.outbox.includes(item))
          onpAck({seq:item.seq,workspace:item.workspace,rejected:[{why:result.error}],local:true});
        if(!result.interrupted||onp.ws!==ws||onp.world?.id!==item.workspace)onpFlushOutbox();
      };
      onpUploadFiles(ids,item.workspace,ws).then(finish,error=>finish({error:error.message||'Не удалось отправить изображение'}));
      return;
    }
    if(!onpSend(edit,wire))return;
    item.sentOn=ws;item.onSend?.();
  }
}
function onpCreatePaper(scope,workspace,v,at){
  return new Promise(resolve=>{
    if(worldReadOnly()||!onp.ws)return resolve({ok:false,error:'Нет связи с Мастером'});
    let timeout;
    const startTimeout=()=>{
      clearTimeout(timeout);
      timeout=setTimeout(()=>{
        onp.outbox=onp.outbox.filter(entry=>entry.seq!==seq);
        resolve({ok:false,error:'Мастер не ответил. Повторите отправку, когда связь восстановится'});
      },15000);
    };
    const seq=onpSendOps([{c:'e',op:'createPaper',scope,workspace,v,...(at?{at}:{})}],false,null,message=>{
      clearTimeout(timeout);
      const rejection=message.rejected?.[0]?.why;
      const confirmed=message.ok||message.dup&&onp.world?.entities.some(e=>e.id===v.id);
      resolve(rejection||!confirmed?{ok:false,error:rejection||'Мастер не подтвердил создание'}:{ok:true});
    },startTimeout);
  });
}
// after a lost connection: what the Master did not confirm goes again (the Master skips what he already has — same tab and number)
function onpOutboxResend(){onpFlushOutbox()}
// replaces persist() for a player: nothing is stored here, the change goes to the Master
function onpPersist(fromUndo=false){
  const ws=currentWorkspace();if(!ws)return true;onpNotesSync(ws);
  if(onp.copy&&onp.base){if(onpDiff(onp.base,onpCopy(ws)).length){if(!onp.copyNoted){onp.copyNoted=true;toast('Без связи с Мастером мир можно только смотреть. Свои заметки писать можно — они уйдут Мастеру, когда войдёте в игру.','err')}setTimeout(()=>{if(onp.world)onpInstall(clone(onp.world))},0)}return true}
  if(onp.state!=='in'||!onp.base)return true;
  const cur=onpCopy(ws),changes=onpDiff(onp.base,cur);if(!changes.length)return true;
  const ops=onp.boardChanges?udCompactBoardOps(changes):changes;
  if(onp.me?.role==='viewer'){if(!onp.viewerNoted){onp.viewerNoted=true;toast('Вы зритель: менять мир могут только игроки. Изменение не сохранено.','err')}setTimeout(()=>{if(onp.world)onpInstall(clone(onp.world))},0);return true}
  for(const op of ops)if(op.c==='b'&&op.op==='add'){
    const legacy=udPlayerBoardMigrations.get(ws.boards?.[op.v.id]?.placements);
    if(legacy)op.legacy=legacy;
  }
  onp.base=cur;const seq=onpSendOps(ops);
  if(!fromUndo){const inverse=onpInverse(ops);onp.outbox.find(e=>e.seq===seq).undoEntry=inverse;onp.undo.push(inverse);if(onp.undo.length>100)onp.undo.shift();onp.redo=[]}
  if(typeof updateHistoryButtons==='function')updateHistoryButtons();
  return true;
}
// Ctrl+Z / Ctrl+Y of the player: only his own changes, by sending their opposite
function onpUndo(redo=false){
 if(worldReadOnly()){toast('Сейчас изменения недоступны','err');return}
 if(onp.outbox.length){toast('Дождитесь сохранения предыдущей правки','ok');return}
 const from=redo?onp.redo:onp.undo,to=redo?onp.undo:onp.redo,ops=from.at(-1);
 if(!ops){toast(redo?'Повторять нечего':'Отменять нечего','ok');return}
 onpSendOps(ops,false,{from,to,ops});
}
function onpAck(m){
  const seq=Number(m.seq)||0,had=onp.outbox.length;
  const matched=onp.outbox.find(o=>o.seq===seq&&(!m.workspace||o.workspace===m.workspace));if(!matched)return;
  if(m.ok&&matched.undoEntry&&Array.isArray(m.migrationUndo)){
    for(const inverse of m.migrationUndo){
      const i=matched.undoEntry.findIndex(op=>op.c==='b'&&op.op==='del'&&op.id===inverse.id);
      if(i!==-1)matched.undoEntry[i]=inverse;
    }
  }
  if(m.ok&&matched.ops?.[0]?.op==='createPaper'&&m.creationUndo){
    const history=m.workspace&&m.workspace!==onp.world?.id?udPlayerZoneState.get(m.workspace):onp;
    if(history){history.undo.push([m.creationUndo]);if(history.undo.length>100)history.undo.shift();history.redo=[]}
  }
  if(m.workspace&&m.workspace!==onp.world?.id){if(m.rejected?.length&&matched.undoEntry){const undo=udPlayerZoneState.get(m.workspace)?.undo||[],i=undo.indexOf(matched.undoEntry);if(i>=0)undo.splice(i,1)}if(m.ok&&matched.paperHistory){const {from,to,ops}=matched.paperHistory,i=from.indexOf(ops);if(i>=0){from.splice(i,1);to.push(onpInverse(ops))}}onp.outbox=onp.outbox.filter(o=>o!==matched);matched.acknowledge?.(m);return}
  const fix=matched?.recordFix?matched:null;
  const history=matched?.paperHistory;
  if(history&&m.ok){
    const i=history.from.indexOf(history.ops);
    if(i!==-1){history.from.splice(i,1);history.to.push(onpInverse(history.ops));updateHistoryButtons()}
  }
  if(fix&&m.ok){
    onp.undo.push(onpInverse(fix.ops));
    if(onp.undo.length>100)onp.undo.shift();
    onp.redo=[];
    updateHistoryButtons();
  }
  onp.outbox=onp.outbox.filter(o=>o!==matched);
  /* refused: the world the Master sent with the refusal was shown with this change on top — show it as it is now */
  if(had!==onp.outbox.length&&Array.isArray(m.rejected)&&m.rejected.length&&onp.world)onpInstall(clone(onp.world));
  if(m.rejected?.length&&matched.undoEntry){const i=onp.undo.indexOf(matched.undoEntry);if(i>=0)onp.undo.splice(i,1)}if(typeof updateHistoryButtons==='function')updateHistoryButtons();
  const rej=Array.isArray(m.rejected)?m.rejected:[],con=Array.isArray(m.conflicts)?m.conflicts:[];
  matched?.acknowledge?.(m);
  if(rej.length&&!matched?.acknowledge)toast('Мастер не принял: '+rej.slice(0,3).map(r=>(r.what?r.what+' — ':'')+r.why).join('; ')+(rej.length>3?` (и ещё ${rej.length-3})`:''),'err');
  if(con.length)toast('Это только что менял кто-то ещё: '+con.slice(0,3).join(', ')+' — осталось ваше','ok');
}
function onpResetMedia(){
  clearTimeout(onpImages.timer);
  clearTimeout(onp.mediaTimer);onp.mediaTimer=0;onpDirtyMedia.clear();
  if(typeof udNetPlayerReset==='function')udNetPlayerReset();
  Object.assign(onpImages,{workspace:null,ids:new Set(),missing:new Map(),absent:new Set(),version:null,batch:null,timer:0});
}
function onpAskMedia(world){
  if(!world?.id)return;
  if(onpImages.workspace!==world.id){if(!onp.mediaV2)onpResetMedia();onpImages.workspace=world.id;onpImages.absent.clear()}
  if(onpImages.version!==onp.ver){onpImages.version=onp.ver;onpImages.absent.clear()}
  onpImages.ids=new Set(mediaDataIdsFromData(world));
  for(const id of onpImages.missing.keys())if(!onpImages.ids.has(id))onpImages.missing.delete(id);
  if(onp.mediaV2)udNetAskMedia(world);else onpPumpMedia();
}
function onpPumpMedia(){
  if(onpImages.timer||onpImages.batch||onp.state!=='in'||onp.copy||!onp.ws||onp.world?.id!==onpImages.workspace)return;
  const now=Date.now(),ids=[];
  let retryAt=Infinity;
  for(const id of onpImages.ids){
    if(onpImages.absent.has(id)||UniverseGraphStorage.mediaGet(id))continue;
    const next=onpImages.missing.get(id)||0;
    if(next>now){retryAt=Math.min(retryAt,next);continue}
    ids.push(id);
    if(ids.length===(onp.mediaFlow?40:1))break;
  }
  const at=ids.length?onpImages.next:retryAt;
  if(at>now){
    if(Number.isFinite(at))onpImages.timer=setTimeout(()=>{onpImages.timer=0;onpPumpMedia()},at-now);
    return;
  }
  const batch={ids:new Set(ids),request:++onpImages.seq};
  onpImages.batch=batch;
  onpImages.next=now+(onp.mediaFlow?150:1100);
  onpMediaDeadline(batch);
  onpSend({t:'media',ids,...(onp.mediaFlow?{request:batch.request}:{}),...(onp.mediaPull?{pull:1}:{})});
}
function onpMediaDeadline(batch){
  clearTimeout(onpImages.timer);
  onpImages.timer=setTimeout(()=>{
    onpImages.timer=0;
    if(onpImages.batch!==batch)return;
    onpImages.batch=null;
    if(onp.mediaFlow)for(const id of batch.ids)onpImages.missing.set(id,Date.now()+1000);
    onpPumpMedia();
  },12000);
}
function onpImagePending(id){
  return onp.state==='in'&&!onp.copy&&!onpImages.absent.has(id)&&
    (onpImages.workspace!==onp.world?.id||onpImages.ids.has(id));
}
const onpDirtyMedia=new Set();
function onpRefreshImages(ids=[]){
  for(const id of ids)onpDirtyMedia.add(id);
  if(!onp.mediaTimer)onp.mediaTimer=setTimeout(()=>{
    onp.mediaTimer=0;const changed=[...onpDirtyMedia];onpDirtyMedia.clear();
    // Expanded information, articles and the drawing view may contain inline
    // media. Retain their existing rendering path; ordinary photo delivery
    // must not rebuild every paper, thread, or the camera.
    if(typeof udRefreshBoardMedia!=='function'||document.querySelector('#detectiveView .udDetails')||(typeof articleUI!=='undefined'&&(articleUI.id||articleUI.lib||articleUI.subject))||(typeof boardUI!=='undefined'&&boardUI.open)){updateUI();return}
    udRefreshBoardMedia(changed);
    const selected=getEntity(state.selectedId);if(selected?.media?.some(m=>changed.includes(m.id)))renderEntityPanel(selected);
  },120);
}
function onpMediaRecord(batch,item){
  const {id,mime,offset,total,data}=item;
  if(typeof data!=='string')return null;
  if(offset===undefined)return {id,mime,data};
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(total)||
    total>Math.ceil(8*1024*1024/3)*4||data.length>ONH_MEDIA_PART||offset+data.length>total)return null;
  if(offset===0)batch.partial={id,mime,total,length:0,parts:[]};
  const partial=batch.partial;
  if(!partial||partial.id!==id||partial.mime!==mime||partial.total!==total||partial.length!==offset)return null;
  partial.parts.push(data);
  partial.length+=data.length;
  if(partial.length!==total)return null;
  batch.partial=null;
  return {id,mime,data:partial.parts.join('')};
}
function onpReceiveMedia(m){
  const batch=onpImages.batch;
  if(!batch||onp.state!=='in'||onp.world?.id!==onpImages.workspace||
    m.workspace&&m.workspace!==onpImages.workspace||onp.mediaFlow&&m.request!==batch.request)return;
  const saved=[];
  for(const item of m.items){
    const id=item?.id;
    if(!batch.ids.has(id)||!onpImages.ids.has(id))continue;
    try{
      const record=onpMediaRecord(batch,item);
      if(!record||!UniverseGraphStorage.mediaPut(record)?.ok)continue;
      saved.push(id);onp.mediaAsked.add(id);batch.ids.delete(id);onpImages.missing.delete(id);
      onpIdbPut('media',record);
    }catch(e){console.warn('media',e)}
  }
  if(saved.length){
    invalidateMediaCache(saved);onpRefreshImages(saved);
  }
  if(onp.mediaFlow&&!m.done){
    onpMediaDeadline(batch);
    if(onp.mediaPull&&Number.isSafeInteger(m.step)){
      const ws=onp.ws;
      setTimeout(()=>{if(onp.ws===ws&&onpImages.batch===batch)onpSend({t:'mediaNext',request:batch.request,step:m.step})},ONP_PART_INTERVAL);
    }
    return;
  }
  const absent=new Set(onp.mediaFlow&&Array.isArray(m.missing)?m.missing:!onp.mediaFlow&&!m.items.length?[...batch.ids]:[]);
  for(const id of batch.ids){
    if(absent.has(id)){onpImages.absent.add(id);onpRefreshImages([id])}
    else onpImages.missing.set(id,Date.now()+2000);
  }
  clearTimeout(onpImages.timer);onpImages.timer=0;onpImages.batch=null;
  onpPumpMedia();
}
// ---- 0.30.8: свои заметки игрока ----
// the notes as the Master has them, plus what is not sent yet
function onpNotesView(){const list=clone(onp.notes);for(const o of onp.notesPending){const i=list.findIndex(n=>n.id===(o.op==='add'?o.n.id:o.id));
  if(o.op==='add'){if(i<0)list.push({...o.n,owner:onp.me?.id||'me'})}else if(o.op==='del'){if(i>=0)list.splice(i,1)}else if(i>=0){list[i].text=o.text;list[i].edited=o.edited}}return list}
function onpNotesSync(ws){
  const cur=(Array.isArray(ws.myNotes)?ws.myNotes:[]).filter(n=>n&&typeof n.text==='string'),was=onpNotesView(),b=new Map(was.map(n=>[n.id,n])),c=new Map(cur.map(n=>[n.id,n])),ops=[];
  for(const [id,n] of c){const o=b.get(id);if(!o)ops.push({op:'add',n:{id,text:n.text,at:n.at||new Date().toISOString()}});else if(o.text!==n.text)ops.push({op:'set',id,text:n.text,edited:n.edited||new Date().toISOString()})}
  for(const id of b.keys())if(!c.has(id))ops.push({op:'del',id});
  if(!ops.length)return;onp.notesPending.push(...ops);onpNotesFlush();onpCopySave(true);if(onp.copy)onpCopyBar();
}
function onpResetNotesFlight(){
  clearTimeout(onp.notesTimer);onp.notesTimer=0;onp.notesFlight=null;
}
function onpRestoreNotesQueues(copy,workspace){
  const zones=Array.isArray(copy.pendingByZone)?copy.pendingByZone:[[copy.world?.id,copy.pending]];
  for(const entry of zones){
    if(!Array.isArray(entry))continue;
    const [id,pending]=entry;
    if(typeof id!=='string'||!Array.isArray(pending)||!pending.length)continue;
    if(workspace===id)onp.notesPending=pending.concat(onp.notesPending);
    else{
      const saved=udPlayerZoneState.get(id)||{};
      if(!saved.pending?.length)udPlayerZoneState.set(id,{...saved,pending});
    }
  }
}
function onpRestorePendingNotes(){
  const ws=onp.ws,me=onp.me?.id;
  const load={ws,me};onp.notesLoading=load;
  const finish=copy=>{
    if(onp.notesLoading!==load)return;
    onp.notesLoading=null;
    if(onp.ws!==ws||onp.me?.id!==me)return;
    if(me&&copy?.me?.id===me){
      onpRestoreNotesQueues(copy,onp.world?.id);
      onpRefreshNotes();
    }
    onpCopySave(true);onpNotesFlush(true);
  };
  onpCopyLoad().then(finish,error=>{console.warn('copy read',error);finish(null)});
}
function onpNotesFlush(announce=false){
  if(!onp.notesPending.length)return;
  if(onp.state!=='in'){if(!onp.notesWaitNoted){onp.notesWaitNoted=true;toast('Заметка ждёт отправки. Она уйдёт Мастеру после входа в игру','ok')}return}
  if(onp.notesLoading||onp.notesTimer||onp.notesFlight||!onp.ws)return;
  const seq=++onp.notesSeq,workspace=onp.world?.id,ops=[];
  const packet={t:'notes',seq,workspace,ops};
  let length=onpMessage(packet).length;
  for(const op of onp.notesPending.slice(0,ONH_NOTES.opsPerMsg)){
    length+=JSON.stringify(op).length+(ops.length?1:0);
    if(length>ONH_MESSAGE_CHAR_LIMIT)break;
    ops.push(op);
  }
  if(!ops.length)return;
  if(onpSend(packet)===false)return;
  onp.notesFlight={seq,count:ops.length,announce};
  onp.notesTimer=setTimeout(()=>{onpResetNotesFlight();onpNotesFlush(announce)},15000);
}
function onpRefreshNotes(){
  const ws=currentWorkspace();
  if(ws&&onp.base&&ws.id===onp.world?.id){ws.myNotes=onpNotesView();if(typeof renderMyNotes==='function')renderMyNotes()}
}
function onpNotesTake(list,seq,receipt={}){
  let announce=false;
  if(seq!==undefined){
    const flight=onp.notesFlight;
    if(!flight||Number(seq)!==flight.seq)return;
    onpResetNotesFlight();announce=flight.announce;
    if(receipt.ok===false){
      toast((receipt.error||'Мастер не сохранил заметки.')+' Они остались в очереди, отправлю их снова.','err');
      onp.notesTimer=setTimeout(()=>{onp.notesTimer=0;onpNotesFlush(announce)},8000);
      return;
    }
    onp.notesPending.splice(0,flight.count);
    if(receipt.rejected)toast(`Мастер отклонил операций с заметками: ${receipt.rejected}. Проверьте лимит заметок и их содержимое.`,'err');
    if(!onp.notesPending.length){
      if(announce&&!receipt.rejected)toast('Заметки, написанные без связи, ушли Мастеру','ok');
      onp.notesWaitNoted=false;
    }
  }
  if(Array.isArray(list))onp.notes=list.filter(n=>n&&typeof n.id==='string'&&typeof n.text==='string').map(n=>({id:n.id,owner:onp.me?.id||'me',text:n.text.slice(0,4000),at:String(n.at||''),...(n.edited?{edited:String(n.edited)}:{})}));
  onpRefreshNotes();onpCopySave(true);
  if(seq!==undefined)onpNotesFlush(announce);
}
// ---- 0.30.8: копия мира в этом браузере (только смотреть, когда нет связи) ----
let onpIdb=null;
function onpIdbOpen(){
  if(onpIdb)return onpIdb;if(typeof indexedDB==='undefined')return Promise.resolve(null);
  onpIdb=new Promise(res=>{try{const r=indexedDB.open('ug-online-copy',3);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('copy'))db.createObjectStore('copy',{keyPath:'room'});if(!db.objectStoreNames.contains('media'))db.createObjectStore('media',{keyPath:'id'});for(const name of ['mediaV2','mediaPartialV2'])if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'key'})};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();onpIdb=null};res(r.result)};r.onerror=r.onblocked=()=>{onpIdb=null;res(null)}}catch{res(null)}});return onpIdb;
}
async function onpIdbPut(store,v){const db=await onpIdbOpen();if(!db)return false;return new Promise(res=>{try{const t=db.transaction(store,'readwrite');t.objectStore(store).put(v);t.oncomplete=()=>res(true);t.onerror=t.onabort=()=>res(false)}catch{res(false)}})}
async function onpIdbDelete(store,key){const db=await onpIdbOpen();if(!db)return false;return new Promise(res=>{try{const t=db.transaction(store,'readwrite');t.objectStore(store).delete(key);t.oncomplete=()=>res(true);t.onerror=t.onabort=()=>res(false)}catch{res(false)}})}
async function onpIdbGet(store,key){const db=await onpIdbOpen();if(!db)return null;return new Promise(res=>{try{
  const t=db.transaction(store),s=t.objectStore(store);
  const r=key===undefined?s.getAll():s.get(key);
  r.onsuccess=()=>res(r.result||null);r.onerror=t.onabort=()=>res(null);
}catch{res(null)}})}
async function onpIdbClear(mediaOnly=false){const db=await onpIdbOpen();if(!db)return false;return new Promise(res=>{try{const names=['media','mediaV2','mediaPartialV2'];if(!mediaOnly)names.unshift('copy');const t=db.transaction(names,'readwrite');for(const name of names)t.objectStore(name).clear();t.oncomplete=()=>res(true);t.onerror=t.onabort=()=>res(false)}catch{res(false)}})}
// at most once in 15 s while playing (a big world, many edits — the player's browser is not kept busy), at once when the tab
// is hidden or closed; in the copy mode (notes waiting) — right away
const ONP_COPY_EVERY=15000;
function onpCopySave(now=false){
  if(!onpActive()||!onp.world||!onp.me||onp.notesLoading)return;clearTimeout(onp.saveTimer);
  const wait=now||onp.copy?(onp.copy?100:0):Math.max(0,(onp.copyLast||0)+ONP_COPY_EVERY-Date.now(),1200);
  const go=()=>{
    if(!onp.world||!onp.me||onp.notesLoading)return;
    onp.copyLast=Date.now();
    const pendingByZone=[...udPlayerZoneState].filter(([id,value])=>id!==onp.world.id&&value.pending?.length).map(([id,value])=>[id,value.pending]);
    if(onp.notesPending.length)pendingByZone.push([onp.world.id,onp.notesPending]);
    onpIdbPut('copy',{room:window.UG_ONLINE_PLAYER.room,at:onp.copy?onp.copyAt:new Date().toISOString(),nick:onp.me.name,me:onp.me,gm:onp.gm,world:onp.world,ver:onp.ver,notes:onp.notes,pending:onp.notesPending,pendingByZone,...(onp.mediaV2?{mediaCatalog:udNetCopyCatalog()}:{})})
      .then(ok=>{onp.copySaved=ok});
  };
  if(!wait){go();return}onp.saveTimer=setTimeout(go,wait);
}
async function onpCopyLoad(){return onpIdbGet('copy',window.UG_ONLINE_PLAYER.room)}
async function onpCopyGateRender(){
  const box=$('#onpCopy');if(!box)return;const c=await onpCopyLoad();box.hidden=!c;if(!c)return;
  const when=new Date(c.at);$('#onpCopyWhen').textContent=`${c.nick||''} · ${Number.isFinite(when.getTime())?when.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}`;
}
async function onpCopyOpen(){
  const c=await onpCopyLoad();if(!c?.world){toast('Копии мира в этом браузере нет','err');onpCopyGateRender();return}
  if(onp.state==='in')return;
  const media=Array.isArray(c.mediaCatalog)?[]:await onpIdbGet('media');
  if(onp.state==='in')return;
  const allowed=new Set(mediaDataIdsFromData(c.world));for(const m of media||[]){if(allowed.has(m.id))try{UniverseGraphStorage.mediaPut(m)}catch{}}
  if(Array.isArray(c.mediaCatalog))await udNetLoadCopyMedia(c);if(onp.state==='in')return;
  onp.copy=true;onp.copyAt=c.at;onp.copyMe=c.me?.id||'';onp.me=c.me;onp.gm=c.gm;
  onp.notes=Array.isArray(c.notes)?c.notes:[];onp.notesPending=[];
  onpRestoreNotesQueues(c,c.world.id);
  onpTake(c.world,c.ver);onpGate(false);onpCopyBar();
}
function onpCopyBar(){
  let bar=$('#onpCopyBar');if(!onp.copy){bar?.remove();document.documentElement.classList.remove('ugOnlineCopy');return}
  document.documentElement.classList.add('ugOnlineCopy');
  if(!bar){bar=document.createElement('div');bar.id='onpCopyBar';bar.className='onpCopyBar';bar.setAttribute('role','status');document.body.appendChild(bar);
    bar.addEventListener('click',ev=>{if(ev.target instanceof Element&&ev.target.closest('[data-onp-gate]')){onpGate(true);onpMsg(onp.state==='hello'?'Мастер в сети — впишите пароль.':'Мастер пока не в сети. Пробую подключиться…',onp.state==='hello'?'':'Bad');if(!onp.ws)onpConnect()}})}
  const d=new Date(onp.copyAt),when=Number.isFinite(d.getTime())?d.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
  const live=onp.state==='hello',n=onp.notesPending.length;
  bar.classList.toggle('isLive',live);
  bar.innerHTML=`<span>📴 Копия мира от ${escapeHtml(when)} — без связи с Мастером: только смотреть.${n?` Заметок ждут отправки: ${n}.`:' Свои заметки писать можно — уйдут Мастеру при входе.'}</span><button type="button" class="btn${live?' primary':''}" data-onp-gate>${live?'Мастер в сети — войти':'Войти в игру'}</button>`;
}
// Publish the offline pointer only after the whole script/style set has been staged.
async function onpSwSetup(){
  if(onp.swBusy)return;onp.swBusy=true;
  try{if(!navigator.serviceWorker||!window.isSecureContext||typeof caches==='undefined')return;
    if(window.UG_ONLINE_PLAYER?.stable){await navigator.serviceWorker.register('stable-sw.js');const ready=await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),20000))]);onp.swReady=!!ready;return}
    const {scope}=await navigator.serviceWorker.register('play-sw.js');
    const prefix='ud-play-v2-'+scope,index=scope+'index.html',pointer=scope+'__cached_build__';
    const options={cache:'no-cache',signal:AbortSignal.timeout(20000)};
    const head=await fetch(index,{...options,method:'HEAD'}),version=head.headers.get('X-UD-Build');
    if(!head.ok||!(/^[a-f0-9]{16}$/.test(version||'')))return;
    const meta=await caches.open(prefix),cached=await meta.match(pointer);
    if(cached&&await cached.text()===version){onp.swReady=true;return}
    const cache=await caches.open(prefix+':'+version);
    const fetchBuild=async key=>{
      const url=new URL(key);url.searchParams.set('ud-build',version);
      const response=await fetch(url,options);
      if(!response.ok||response.headers.get('X-UD-Build')!==version)throw new Error('Версия комнаты изменилась при сохранении автономной копии');
      return response;
    };
    const response=await fetchBuild(index);
    const page=new DOMParser().parseFromString(await response.clone().text(),'text/html');
    const urls=new Set([...page.querySelectorAll('script[src],link[rel="stylesheet"][href]')].map(el=>el.getAttribute('src')||el.getAttribute('href')));
    for(const {name} of performance.getEntriesByType('resource')){
      if(/\.(woff2?|ttf|otf)(?:[?]|$)/i.test(name))urls.add(name);
    }
    const todo=[...new Set([...urls].map(u=>new URL(u,scope).href.split(/[?#]/)[0]).filter(u=>u.startsWith(scope)))];
    const stage=async()=>{for(let key;(key=todo.shift());){if(!await cache.match(key))await cache.put(key,await fetchBuild(key))}};
    const results=await Promise.allSettled(Array.from({length:6},stage));
    const failure=results.find(result=>result.status==='rejected');
    if(failure)throw failure.reason;
    const current=await fetch(index,{...options,method:'HEAD'});
    if(!current.ok||current.headers.get('X-UD-Build')!==version)return;
    await cache.put(index,response);
    await meta.put(pointer,new Response(version));onp.swReady=true;
  }catch(e){console.warn('sw',e)}finally{onp.swBusy=false}
}
function onpLeave(){onpResetMedia();onpResetNotesFlight();onpUploadReceipt?.finish(null);onp.outbox=[];onp.me=null;onp.pass='';onp.avatarPending=false;onp.first=true;$('#onpPass').value='';const ws=onp.ws;onp.ws=null;try{ws?.close()}catch{}onp.state='off';onpGate(true);onpMsg('Вы вышли из игры.');onpConnect()}
{
  if(onpActive()){
    const nick=(()=>{try{return localStorage.getItem(ONP_NICK_KEY)||''}catch{return ''}})();if($('#onpNick'))$('#onpNick').value=nick;
    $('#onpForm')?.addEventListener('submit',ev=>{ev.preventDefault();onpLogin($('#onpNick').value,$('#onpPass').value,false,onp.partId)});
    $('#onpAvatars')?.addEventListener('click',ev=>{
      const id=ev.target.closest?.('[data-onp-avatar]')?.dataset.onpAvatar;
      if(!id||!['off','hello'].includes(onp.state))return;
      if(onp.partId!==id)$('#onpPass').value='';
      onp.partId=id;
      onpRenderAvatars();
      onpMsg('Введите пароль выбранного аватара.');
      $('#onpPass').focus();
    });
    $('#onpCopyGo')?.addEventListener('click',()=>onpCopyOpen());
    $('#onpCopyDrop')?.addEventListener('click',async()=>{if(await onpIdbClear()){udNetClearMemory();onpCopyGateRender();toast('Копия мира удалена из этого браузера','ok')}else toast('Не удалось удалить копию','err')});
    $('#onpMediaClear')?.addEventListener('click',async()=>{if(await onpIdbClear(true)){udNetClearMemory();toast('Кеш фотографий очищен, копия мира сохранена','ok')}else toast('Не удалось очистить кеш','err')});
    onpGate(true);onpConnect();onpCopyGateRender();setInterval(onpWatch,2000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&onp.state==='in'){onp.lastMsg=performance.now();onpSend({t:'ping'})}if(document.hidden&&onp.state==='in')onpCopySave(true)});window.addEventListener('pagehide',()=>{if(onp.state==='in')onpCopySave(true)});
    /* after the whole page is in: run during parsing, the list of files would stop at this script */
    if(document.readyState==='complete')onpSwSetup();else window.addEventListener('load',()=>onpSwSetup(),{once:true});
  }
}

