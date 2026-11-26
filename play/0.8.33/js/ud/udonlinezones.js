// A network connection is a transport, not a GM role. Each connection has a zone.
'use strict';
const udZoneCacheKeys=['lastSnap','last','lastObj','ver','paperBindings','paperBoards','dragVisible','mediaText','mediaIds'];
const udZoneCaches=new Map();let udZoneDepth=0;
function udPruneZoneCaches(){
 const live=new Set((data.workspaces||[]).map(w=>w.id));
 for(const id of udZoneCaches.keys())if(!live.has(id))udZoneCaches.delete(id);
}
function udClearZoneCaches(){
 udZoneCaches.clear();
 for(const key of udZoneCacheKeys)delete onh[key];
 Object.assign(onh,{lastSnap:null,last:'',lastObj:null,ver:0});
}
function udInZone(id,fn){
 // Reentrant dispatch in the same zone must use the current working version.
 if(udZoneDepth&&onh.wsId===id)return fn();
 const saved={wsId:onh.wsId};for(const k of udZoneCacheKeys)saved[k]=onh[k];
 const cached=udZoneCaches.get(id)||{lastSnap:null,last:'',lastObj:null,ver:0};
 onh.wsId=id;for(const k of udZoneCacheKeys)onh[k]=cached[k];udZoneDepth++;
 try{return fn()}finally{
  if((data.workspaces||[]).some(w=>w.id===id)){
   const next={};for(const k of udZoneCacheKeys)next[k]=onh[k];udZoneCaches.set(id,next);
  }else udZoneCaches.delete(id);
  udZoneDepth--;onh.wsId=saved.wsId;for(const k of udZoneCacheKeys)onh[k]=saved[k];
 }
}
function udZoneList(p){return (data.workspaces||[]).filter(w=>partAllowed(p,w.id)).map(w=>({id:w.id,name:w.name,favorite:!!w.favorite}))}
function udSendZones(c){const x=onh.conns.get(c),p=partGet(x?.partId);if(x?.state==='in'&&p)onhSend(c,{t:'zones',zones:udZoneList(p)})}
function udZoneOf(x){return x?.workspace||onh.wsId}
function udWithWorkspace(ws,fn){
 const fields=['workspaceId','scopeId','udContainerContext','filtersEntities','filtersRelations','showHidden','showExternal'];
 const saved=Object.fromEntries(fields.map(k=>[k,state[k]])),aliases=Object.fromEntries([...ACTIVE_ALIASES].map(k=>[k,data[k]]));
 state.workspaceId=ws.id;state.scopeId=ws.rootId;state.udContainerContext=null;state.filtersEntities=new Set();state.filtersRelations=new Set();state.showHidden=true;state.showExternal=false;
 for(const k of ACTIVE_ALIASES)data[k]=ws[k];invalidateContainmentIndex();
 try{return fn()}finally{for(const k of ACTIVE_ALIASES)data[k]=aliases[k];Object.assign(state,saved);invalidateContainmentIndex()}
}
const udBaseSend=onhSend;
onhSend=function(c,msg){const x=onh.conns.get(c);return udBaseSend(c,{...msg,...(x?.workspace&&!Object.hasOwn(msg,'workspace')?{workspace:x.workspace}:{})})};
const udBaseBroadcast=onhBroadcast;
onhBroadcast=function(){
 // Flush the edited zone before acknowledging it. Otherwise an optimistic add
 // and an immediate undo can coalesce to an unchanged snapshot, leaving the
 // author with the optimistic add forever. Admission uses the same version.
 if(udZoneDepth){udBaseBroadcast();for(const [c,x] of onh.conns)if(x.state==='in')udSendZones(c);return}
 clearTimeout(onh.timer);onh.timer=0;
 const ids=new Set([...onh.conns.values()].filter(x=>x.state==='in').map(udZoneOf));ids.add(onh.wsId);
 for(const id of ids)udInZone(id,()=>udBaseBroadcast());
 for(const [c,x] of onh.conns)if(x.state==='in')udSendZones(c);
};
onhWorldChanged=function(){
 udPruneZoneCaches();
 onh.lastSnap=null;for(const v of udZoneCaches.values())v.lastSnap=null;
 if(!onh.open||!onh.conns.size)return;onhNotesPush();clearTimeout(onh.timer);onh.timer=setTimeout(onhBroadcast,ONH_BCAST_MS);
};
onhSendWorld=function(c){const x=onh.conns.get(c);if(!x)return;
 return udInZone(udZoneOf(x),()=>{const text=onhSnapText();if(!text||text==='null')return;
  if(onh.last!==text)udBaseBroadcast();
  onhSendState(c,JSON.stringify({t:'world',workspace:onh.wsId,ver:onh.ver,world:onh.lastObj,notes:onhNotesOf(x.partId)}));
 });
};
const udBaseAdmit=onhAdmit;
onhAdmit=function(c){const x=onh.conns.get(c),p=partGet(x?.partId);if(!x||!p)return;
 const zones=udZoneList(p);x.workspace=zones.some(w=>w.id===x.workspace)?x.workspace:zones[0]?.id;
 if(!x.workspace){onhSend(c,{t:'denied',why:'world'});return}
 if(state.boardDrag||typeof linkDrag!=='undefined'&&linkDrag){setTimeout(()=>{if(onh.conns.get(c)===x)onhAdmit(c)},250);return}
 // Admission only reads the workspace; the first placement edit can migrate its board.
 udInZone(x.workspace,()=>udBaseAdmit(c));udSendZones(c);
};
const udBaseHandle=onhHandle;
onhHandle=async function(c,x,q){
 if(q.t==='login'&&x.state==='new'){const p=q.partId?partGet(q.partId):partFind(q.nick);const zones=p?udZoneList(p):[];
  x.workspace=zones.find(w=>w.id===q.workspace)?.id||zones.find(w=>w.id===onh.wsId)?.id||zones[0]?.id;
 }
 if(x.state!=='in')return udBaseHandle(c,x,q);
 if(q.t==='zone'){return udHostSelectZone(c,q.id)}
 if(q.t==='zoneCommand'){if(q.workspace&&q.workspace!==udZoneOf(x)){onhSend(c,{t:'zoneError',error:'Рабочая зона уже изменилась'});return}return onhOthers(()=>{if(q.action==='trashRestore'||q.action==='trashForget')return udHostTrash(c,x,q);if(q.action==='import')return udHostImport(c,x,q);return udHostZoneCommand(c,x,q)})}
 if(['edit','notes','boardDrag','media','mediaNext','mediaPut','worldNext','cur','resync','mediaCatalog2','mediaGet2','mediaNext2'].includes(q.t)){
  const id=udZoneOf(x),p=partGet(x.partId);
  if(!partAllowed(p,id))return onhKick(c,'gone');
  if(q.workspace&&q.workspace!==id){if(q.t==='edit')onhSend(c,{t:'ack',workspace:q.workspace,seq:q.seq,ok:0,rejected:[{why:'Рабочая зона уже изменилась'}],conflicts:[]});else if(q.t==='notes')onhSend(c,{t:'zoneError',error:'Заметка относится к прежней зоне. Вернитесь в неё для отправки.'});return}
  // These legacy dispatch branches are synchronous (no await before their return).
  return udInZone(id,()=>udBaseHandle(c,x,q));
 }
 return udBaseHandle(c,x,q);
};
function udHostSelectZone(c,id){
 const x=onh.conns.get(c),p=partGet(x?.partId),ws=data.workspaces.find(w=>w.id===id);
 if(x?.state!=='in'||!ws||!partAllowed(p,id)){onhSend(c,{t:'zoneError',error:'Рабочая зона недоступна'});return false}
 if(udUsesSharedLayout(ws)&&x.sharedLayout!==1){onhSend(c,{t:'zoneError',error:'Для этой раскладки нужна новая версия Universe Detective.'});return false}
 if(state.boardDrag||typeof linkDrag!=='undefined'&&linkDrag){onhSend(c,{t:'zoneError',error:'Мастер завершает действие на доске. Повторите переход.'});return false}
 udDragClear(c);
 if(x.workspace!==id){x.mediaTransfer=null;x.worldTransfer=null;x.worldRefresh=false}
 x.workspace=id;x.notesSig='';onhSendWorld(c);udSendZones(c);prsHostSet(x.partId,null);udPeopleRefresh();return true;
}
onhPartsChanged=function(){
 for(const [c,x] of [...onh.conns])if(x.state==='in'||x.state==='wait'){
  const p=partGet(x.partId);if(!partAllowed(p,udZoneOf(x))||(p?.pass?.hash||'')!==x.passHash)onhKick(c,'gone');else udSendZones(c);
 }onh.asks=onh.asks.filter(a=>onh.conns.has(a.c));onhAskRender();onhChanged();
};
onhNotesPush=function(){for(const [c,x] of onh.conns){if(x.state!=='in')continue;udInZone(udZoneOf(x),()=>{const list=onhNotesOf(x.partId),sig=JSON.stringify(list);if(sig!==x.notesSig){x.notesSig=sig;onhSend(c,{t:'notes',list})}})}};
// Private, per-participant view state; never part of a shared edit transaction.
const udPlayerZoneState=new Map();
function udKeepPlayerZone(){if(!onp.world)return;captureWorkspace();const view=currentWorkspace()?.view;if(view)view.udPlayerFilters={search:state.search,entities:[...state.filtersEntities],relations:[...state.filtersRelations],statuses:[...state.filtersStatuses]};udPlayerZoneState.set(onp.world.id,{view:clone(currentWorkspace()?.view||{}),scope:state.scopeId,
 notes:clone(onp.notes),pending:clone(onp.notesPending),undo:onp.undo,redo:onp.redo});
 try{localStorage.setItem('ud-online-view:'+window.UG_ONLINE_PLAYER.room+':'+onp.me?.id,JSON.stringify([...udPlayerZoneState].map(([id,v])=>[id,{view:v.view,scope:v.scope}])))}catch{}
}
function udApplyPlayerFilters(view){
 const f=view?.udPlayerFilters;if(!f)return;state.search=typeof f.search==='string'?f.search:'';
 state.filtersEntities=new Set(f.entities||[]);state.filtersRelations=new Set(f.relations||[]);state.filtersStatuses=new Set(f.statuses||[]);
 const search=$('#globalSearch');if(search)search.value=state.search;
}
function udEnteringZone(id,notes=[]){
 udKeepPlayerZone();let saved=udPlayerZoneState.get(id);
 if(!saved)try{const list=JSON.parse(localStorage.getItem('ud-online-view:'+window.UG_ONLINE_PLAYER.room+':'+onp.me?.id)||'[]');saved=list.find(v=>v[0]===id)?.[1]}catch{}
 onpResetNotesFlight();
 onp.undo=saved?.undo||[];onp.redo=saved?.redo||[];onp.notes=notes;onp.notesPending=saved?.pending||[];
 onp.first=true;onp.pendingWorld=null;udDragClear();state.udSelectedPaper=null;
 if(saved)udPlayerZoneState.set(id,{...saved,notes});
 try{localStorage.setItem('ud-online-zone:'+window.UG_ONLINE_PLAYER.room,id)}catch{}
}
function udPlayerSelectZone(id){
 if(id===onp.world?.id){hideWorkspacePopup();return false}
 if(onp.outbox.length||onp.notesPending.length){toast('Дождитесь сохранения изменений перед переходом','ok');return false}
 if(!udFinishDescription(true)||!udSetFinish()||!closeModal())return false;
 if(onp.state!=='in'||onp.copy)return false;
 onpSend({t:'zone',id});hideWorkspacePopup();return true;
}
function udZoneCommand(action,extra={}){
 if(worldReadOnly())return null;
 const command={t:'zoneCommand',action,...extra};
 if(JSON.stringify(command).length>900000){toast('Слишком большой запрос для сетевой отправки. Разделите импорт на несколько файлов.','err');return null}
 const workspace=onp.world?.id,ws=onp.ws,ids=onpMediaCandidates(command,workspace);
 if(!ids.length)onpSend(command);
 else onpUploadFiles(ids,workspace,ws).then(result=>{
  if(result.ok&&onp.ws===ws&&onp.world?.id===workspace)onpSend({...command,workspace});
  else toast(result.error||'Импорт прерван. Повторите после восстановления связи.','err');
 }).catch(error=>toast(error.message||'Не удалось отправить изображения','err'));
 return {pending:true};
}
function udHostZoneCommand(c,x,q){
 const p=partGet(x.partId),src=data.workspaces.find(w=>w.id===(q.id||udZoneOf(x)));
 if(p?.role!=='player'||!src||!partAllowed(p,src.id)){onhSend(c,{t:'zoneError',error:'Изменение зоны недоступно'});return}
 if(state.boardDrag||typeof linkDrag!=='undefined'&&linkDrag||$('#modalBack')?.classList.contains('open')){onhSend(c,{t:'zoneError',error:'Мастер завершает действие или редактирование. Повторите позже.'});return}
 const name=String(q.name||'').trim().slice(0,80),snap=snapshotWorkspaceMutation();let saved=false;
 try{
  let target=src;
  if(q.action==='create'){
   if(x.sharedLayout!==1)throw Error('Для создания новой раскладки обновите Universe Detective.');
   const rules=q.choice==='copy'?{entityTypes:clone(src.entityTypes),relationTypes:clone(src.relationTypes),statusGroups:clone(src.statusGroups)}:
    q.choice==='empty'?{entityTypes:[],relationTypes:[containmentTypeTemplate()],statusGroups:[]}:presetRules(q.choice)||presetRules('medieval');
   const root={id:uid('entity'),name:name||'Новая вселенная',type:'',style:{space:true},properties:{}};
   target={id:uid('ws'),name:root.name,rootId:root.id,entities:[root],relations:[],...rules,boards:{},createdAt:new Date().toISOString()};udInitSharedLayout(target);data.workspaces.push(target);
  }else if(q.action==='duplicate'){
   // Duplicate only the participant's public workspace, never hidden entities.
   target=clone(onhSnapshot(src));target.id=uid('ws');target.name=src.name+' — копия';target.createdAt=new Date().toISOString();delete target.view;
   data.workspaces.push(target);
  }else if(q.action==='rename'){if(!name)throw Error('Введите название зоны');src.name=name}
  else if(q.action==='favorite')src.favorite=!src.favorite;
  else if(q.action==='delete'){
   if(data.workspaces.length<=1)throw Error('Последнюю рабочую зону удалить нельзя');
   data.workspaces=data.workspaces.filter(w=>w.id!==src.id);
   if(state.workspaceId===src.id){state.workspaceId=data.workspaces[0].id;applyWorkspace(currentWorkspace());state.scopeId=currentRootId()}
  }else throw Error('Неизвестное действие зоны');
  if(!onhSave())throw Error('Не удалось сохранить рабочую зону');saved=true;
  if(target!==src&&p.worlds!=='all'){
   udGrantCreatedZones(p,[...p.worlds,target.id]);
  }
  for(const [oc,ox] of onh.conns){if(ox.state!=='in')continue;
   if(!data.workspaces.some(w=>w.id===udZoneOf(ox))){const fallback=udZoneList(partGet(ox.partId))[0]?.id;if(fallback)udHostSelectZone(oc,fallback);else onhKick(oc,'gone')}
   udSendZones(oc);
  }
  if(target!==src)udHostSelectZone(c,target.id);else onhBroadcast();
 }catch(e){restoreWorkspaceMutation(snap.data,snap.state);if(saved)onhSave();onh.lastSnap=null;for(const z of udZoneCaches.values())z.lastSnap=null;updateUI();onhSend(c,{t:'zoneError',error:e.message||'Не удалось изменить зону'})}
}
function udLastPlayerZone(){try{return localStorage.getItem('ud-online-zone:'+window.UG_ONLINE_PLAYER.room)||undefined}catch{return undefined}}
function udOpenPlayerZoneTransfer(partId){
 if(window.UG_ONLINE_PLAYER||viewAsPlayer())return;const p=partGet(partId);if(!p)return;
 const zones=udZoneList(p);openModal('Перевести «'+p.name+'» в зону',`<div class="form"><label>Рабочая зона<select id="udTransferZone">${zones.map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join('')}</select></label></div>`, '<button type="button" class="btn primary" id="udTransferZoneGo">Перевести</button>');
 $('#udTransferZoneGo').onclick=()=>{const id=$('#udTransferZone').value;for(const [c,x] of onh.conns)if(x.state==='in'&&x.partId===partId)udHostSelectZone(c,id);closeModal()};
}
function udHostImport(c,x,q){
 const p=partGet(x.partId);if(p?.role!=='player'||!q.document||!udOnlineSafe(q.document)){onhSend(c,{t:'zoneError',error:'Импорт недоступен'});return}
 const snapshot=snapshotWorkspaceMutation(),allowed=new Set(udZoneList(p).map(w=>w.id));let saved=false;
 try{
  const added=mergeImportedWorkspaces(clone(q.document));if(!added.length)throw Error('В файле нет рабочих зон');
  for(const w of added)udValidateOnlineWorld(w);
  if(q.mode==='replace'){
   if(!createSafetyBackup('before-online-import'))throw Error('Не удалось создать резервную копию');
   data.workspaces=data.workspaces.filter(w=>!allowed.has(w.id));
  }
  if(!data.workspaces.some(w=>w.id===state.workspaceId)){state.workspaceId=data.workspaces[0].id;applyWorkspace(currentWorkspace())}
  if(!onhSave())throw Error('Не удалось сохранить импорт');saved=true;
  if(p.worlds!=='all')udGrantCreatedZones(p,[...p.worlds,...added.map(w=>w.id)]);
  for(const [oc,ox] of onh.conns){if(ox.state!=='in')continue;
   if(!data.workspaces.some(w=>w.id===udZoneOf(ox))){const next=udZoneList(partGet(ox.partId))[0]?.id;if(next)udHostSelectZone(oc,next);else onhKick(oc,'gone')}
   udSendZones(oc);
  }
  udHostSelectZone(c,added[0].id);onhWorldChanged();
 }catch(e){restoreWorkspaceMutation(snapshot.data,snapshot.state);if(saved)onhSave();for(const z of udZoneCaches.values())z.lastSnap=null;onh.lastSnap=null;updateUI();onhSend(c,{t:'zoneError',error:e.message||'Не удалось импортировать файл'})}
}
function udGrantCreatedZones(p,worlds){partUpdate(p.id,{worlds}).catch(error=>console.warn('participant zones',error));if(!worlds.every(id=>partAllowed(partGet(p.id),id)))throw Error('Не удалось сохранить доступ к новой зоне')}

