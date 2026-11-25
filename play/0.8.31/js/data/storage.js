// Universe Graph — Сохранение и загрузка мира: запись только при изменениях, индикатор «Сохранено», плашка при ошибке, слияние правок из двух вкладок браузера, блокировка, загрузка при старте.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
function currentWorkspace(){return data.workspaces?.find(w=>w.id===state.workspaceId)||data.workspaces?.[0]||null}
// UD: keys of ws.view that only Universe Graph uses — UD keeps the world's own values (see the end of captureWorkspace).
const UD_KEEP_VIEW_KEYS=['zoom','panX','panY','isolate','graphExpanded','hideFar','focusRadius','galaxyZoom','galaxyPanX','galaxyPanY','galaxyRootCollapsed','galaxyExpanded','treeZoom','treeRootCollapsed','treeExpanded','outlineExpanded','outlineCollapsedRoots','outlineZoom','galaxyOrbit','galaxyOrbitOpacity','relTiersHidden','visualStyle','records','g3','gx3'];
function captureWorkspace(){
  if(viewAsPlayer())return;
  const ws=currentWorkspace();if(!ws)return;
  // Preserve the active workspace/data object identity. Cloning here could make
  // an open modal keep references to orphaned entities after the 12s autosave.
  ws.entities=Array.isArray(data.entities)?data.entities:[];ws.relations=Array.isArray(data.relations)?data.relations:[];
  // 0.21: while an article fills the work area the map is a small window with its own camera — save the big map's camera instead.
  const cam=(typeof articleUI!=='undefined'&&articleUI.mode==='full'&&articleUI.prevCam)||state;
  const prevView=isRecord(ws.view)?ws.view:null;
  ws.view={udContainerContext:state.udContainerContext?clone(state.udContainerContext):null,zoom:cam.zoom,panX:cam.panX,panY:cam.panY,scopeId:state.scopeId,showExternal:!!state.showExternal,isolate:!!state.isolate,showHidden:!!state.showHidden,graphExpanded:graphExpandedSaved(),hideFar:!!state.hideFar,focusRadius:clamp(Number(state.focusRadius)||2,1,4),galaxyZoom:clamp(Number(state.galaxyZoom)||1,.25,4),galaxyPanX:Number(state.galaxyPanX)||0,galaxyPanY:Number(state.galaxyPanY)||0,galaxyRootCollapsed:!!state.galaxyRootCollapsed,galaxyExpanded:[...state.galaxyExpanded].filter(Boolean),treeZoom:clamp(Number(state.treeZoom)||1,.5,2.4),treeRootCollapsed:!!state.treeRootCollapsed,treeExpanded:[...state.treeExpanded].filter(Boolean),outlineExpanded:[...state.outlineExpanded].filter(Boolean),outlineCollapsedRoots:[...state.outlineCollapsedRoots].filter(Boolean),outlineZoom:clamp(Number(state.outlineZoom)||1,.6,2.2),galaxyOrbit:Object.fromEntries(Object.entries(state.galaxyOrbit||{}).filter(([id])=>getEntity(id))),galaxyOrbitOpacity:clamp(Number(state.galaxyOrbitOpacity) || .62,.15,1),boardZoom:clamp(Number(state.boardZoom)||1,typeof BOARD_ZOOM_MIN==='number'?BOARD_ZOOM_MIN:.04,2.5),boardPanX:Number(state.boardPanX)||0,boardPanY:Number(state.boardPanY)||0,boardRed:!!state.boardRed,boardContain:state.boardContain!==false,boardTypeColors:!!state.boardTypeColors,udHiddenTiers:[...(state.hiddenTiers||[])].filter(n=>Number.isInteger(n)&&n>=1&&n<=5),relTiersHidden:[...(state.hiddenTiers||[])].filter(n=>n>=1&&n<=5),visualStyle:isVisualStyle(state.visualStyle)?state.visualStyle:'classic',records:typeof tvSaved==='function'?tvSaved():undefined,...(typeof view3dSaved==='function'?view3dSaved():{})};
  // UD: what only Universe Graph shows (its style, the table, 3D, the cameras of other views) is kept as the world had it —
  // UD does not show these, so it must not overwrite them with its own defaults (a world goes UG → UD → UG without losses).
  if(prevView)for(const k of UD_KEEP_VIEW_KEYS)if(k in prevView)ws.view[k]=prevView[k];
  if(!prevView||!Object.hasOwn(prevView,'relTiersHidden'))delete ws.view.relTiersHidden;
  ws.positions={};for(const e of ws.entities){ws.positions[e.id]={x:Number(e.style?.x)||0,y:Number(e.style?.y)||0}}
}
// 0.15.21: timestamps are excluded from the change check. Before this fix every
// 12-second autosave rewrote the whole world because updatedAt always changed,
// which flooded the 50-entry version history within ~10 minutes.
let lastPersistedSignature=null;
let autosaveTimer=0;
let persistenceLocked=false;
// Text of a stored world that could not be used (kept for «Сохранить копию в файл»).
let lockedRawWorld=null;
// data.entities / data.relations are live aliases of the active workspace's
// arrays. They used to be serialized too, so every file held the active
// workspace twice. They are skipped at the top level only.
// Top-level entities/relations and (0.17) entityTypes/relationTypes/statusGroups only point at the
// active workspace's own lists; the stored world keeps them inside each workspace.
const ACTIVE_ALIASES=new Set(['entities','relations','entityTypes','relationTypes','statusGroups']);
function worldReplacer(skipTimestamps){return function(k,v){if(this===data&&ACTIVE_ALIASES.has(k))return undefined;if(skipTimestamps&&(k==='updatedAt'||k==='syncRev'||k==='syncParent'))return undefined;return v}}
function serializeWorld(space){return JSON.stringify(data,worldReplacer(false),space)}
function persistenceSignature(){return JSON.stringify(data,worldReplacer(true))}
function writeWorld({sharedUpdate=false,autosave=false}={}){
  if(persistenceLocked)return false;
  if(viewAsPlayer()&&!sharedUpdate)return 'unchanged';
  // Another tab saved while a dialog was open here: merge its work first, so this save does not erase it.
  // Browser tab: read what is stored right now; if another tab wrote since this tab last
  // read or wrote, merge that first (covers both tabs saving at nearly the same moment).
  if(UniverseGraphStorage.backend!=='sqlite'&&syncBase!==null){
    pendingExternalWorld=null;
    const stored=UniverseGraphStorage.getItem(STORAGE);
    if(stored&&stored!==syncBase){mergeExternalWorld(stored);mergedSinceHistory=true}
  }
  // Network edits already update the canonical workspace. Preview aliases and
  // camera state must never be copied back, even during a network write.
  captureWorkspace();
  // An idle timer tick should keep the active arrays and board placements
  // that the current render uses. Real edits still go through normalization.
  if(autosave&&lastPersistedSignature!==null&&persistenceSignature()===lastPersistedSignature)return 'unchanged';
  normalize();
  captureWorkspace();
  const signature=persistenceSignature();
  if(signature===lastPersistedSignature)return 'unchanged';
  const now=new Date().toISOString(),ws=currentWorkspace(),prevMeta=data.metadata.updatedAt,prevWs=ws?.updatedAt,prevRev=data.metadata.syncRev,prevParent=data.metadata.syncParent;
  data.metadata.updatedAt=now;if(ws)ws.updatedAt=now;
  // Browser tab (0.17.5): every saved version names the version it was built on, so a merge can find the real common ancestor.
  const browserSync=UniverseGraphStorage.backend!=='sqlite';if(browserSync){data.metadata.syncParent=syncBaseRev||'';data.metadata.syncRev=newSyncRev()}
  try{
    const serialized=serializeWorld();
    // setItem reports true only after the database committed the write; the
    // full read-back that used to follow doubled the traffic of every save.
    if(UniverseGraphStorage.setItem(STORAGE,serialized)===true){lastPersistedSignature=signature;syncBase=serialized;if(browserSync){syncBaseRev=data.metadata.syncRev;rememberSyncVersion(syncBaseRev,serialized)}setSaveStatus('saved');return true}
    setSaveStatus('error',UniverseGraphStorage.backend==='sqlite'?'база данных не приняла запись':'хранилище браузера переполнено или недоступно');
  }catch(e){console.warn('save',e);setSaveStatus('error',e?.message||String(e))}
  data.metadata.updatedAt=prevMeta;if(ws)ws.updatedAt=prevWs;if(browserSync){data.metadata.syncRev=prevRev;data.metadata.syncParent=prevParent}
  return false;
}
function persistWorkspaceView(){
  if(window.UG_ONLINE_PLAYER){if(typeof udKeepPlayerZone==='function')udKeepPlayerZone();return true}
  if(typeof viewAsPlayer==='function'&&viewAsPlayer())return true; /* 0.28: nothing is written while looking as a player */
  try{return !!writeWorld()}catch(e){console.warn('save workspace view',e);return false}
}
function persist({autosave=false}={}){
  if(window.UG_ONLINE_PLAYER)return typeof onpPersist==='function'?onpPersist():true; /* 0.30.4: a player's change goes to the Master */
  if(persistenceLocked)return false;
  // 0.28: «глазами игрока» is a look at a copy — nothing is saved from it
  if(viewAsPlayer()){if(!playerViewSaveNoted){playerViewSaveNoted=true;toast('Это просмотр глазами игрока — изменения не сохраняются. Чтобы менять мир, вернитесь в «Мастер» (меню справа вверху)','err')}return false}
  // 0.29: renamed records keep their [[links]]; article links to deleted things are dropped (wiki.js). Not while undoing.
  try{if(typeof wikiBeforeSave==='function')wikiBeforeSave({rewrite:!(typeof historyApplying!=='undefined'&&historyApplying)})}catch(e){console.warn('wiki before save',e)}
  let result=false;
  try{result=writeWorld({autosave})}catch(e){console.warn('save',e)}
  // Only durable changes enter the undo baseline. A failed write must not
  // make an in-memory change appear persisted; an unchanged world needs no
  // (expensive) undo snapshot at all.
  // After a merge with another tab, undo must not step back over that tab's work.
  if(result===true&&!persistenceLocked){if(mergedSinceHistory){mergedSinceHistory=false;initEditHistory()}else recordPersistedChange()}
  if(result===true&&typeof onhWorldChanged==='function')onhWorldChanged(); /* 0.30.3: players see the change */
  return !!result;
}
function persistOnTimer(){if(!udUpdateLocked&&!viewAsPlayer())persist({autosave:true})}
// Safety copy of the whole database before destructive whole-world operations.
// In the browser fallback (no desktop bridge) there is nothing to back up.
function createSafetyBackup(reason){
  // Browser tab: the pre-change world goes into the IndexedDB history instead.
  if(UniverseGraphStorage.backend!=='sqlite'){persist();UniverseGraphStorage.snapshotNow?.();return true}
  try{persist();const r=UniverseGraphStorage.backup(null,reason);if(r?.path)return true}catch(e){console.warn('safety backup',e)}
  return confirm('Не удалось создать резервную копию перед операцией. Продолжить без неё?');
}
function save(){if(worldReadOnly())return;if(persistenceLocked){toast('Сохранение отключено: сохранённый мир не удалось прочитать','err');return}const ok=persist();toast(ok?'Мир сохранён':'Не удалось сохранить — см. сообщение вверху окна',ok?'ok':'err')}

// ---- Save status (0.16): a small indicator in the top bar and, after a failed
// write, a banner that stays until a write succeeds. A failed save used to be
// reported only by a toast that disappeared after 2.4 seconds.
const saveStatus={kind:'idle',at:null,detail:''};
function setSaveStatus(kind,detail=''){
  saveStatus.kind=kind;saveStatus.detail=detail;if(kind==='saved')saveStatus.at=new Date();
  const el=document.getElementById('saveStatus');
  if(el){
    const time=saveStatus.at?saveStatus.at.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';
    const where=UniverseGraphStorage.backend==='sqlite'?'в базу на диске':'в хранилище браузера';
    const view={saved:['✓',time?`Сохранено ${time}`:'Сохранено',`Все изменения сохранены ${where}${time?' в '+time:''}`],error:['⚠','Не сохранено',`Последнее изменение НЕ сохранено: ${detail}. Нажмите, чтобы повторить`],locked:['🔒','Сохранение выключено',detail||'Сохранение отключено, чтобы не затереть данные'],idle:['○','','']}[kind]||['○','',''];
    el.dataset.kind=kind;el.querySelector('.saveStatusIcon').textContent=view[0];el.querySelector('.saveStatusText').textContent=view[1];el.title=view[2];
  }
  const banner=document.getElementById('saveBanner');
  if(kind==='error'||kind==='locked'){
    const b=banner||Object.assign(document.createElement('div'),{id:'saveBanner',className:'saveBanner'});
    b.setAttribute('role','alert');
    b.innerHTML=kind==='error'
      ?`<div class="saveBannerText"><b>⚠ Изменения не сохранены</b><span>Причина: ${escapeHtml(detail)}. Пока это сообщение видно, не закрывайте программу — нажмите «Повторить» или сохраните копию в файл.</span></div><div class="saveBannerActions"><button type="button" class="btn" data-save-retry>Повторить</button><button type="button" class="btn primary" data-save-export>Сохранить копию в файл</button></div>`
      :`<div class="saveBannerText"><b>🔒 Сохранение выключено</b><span>${escapeHtml(detail)}</span></div><div class="saveBannerActions"><button type="button" class="btn primary" data-save-export>Сохранить копию в файл</button></div>`;
    if(!banner)document.body.appendChild(b);
  }else banner?.remove();
}
document.addEventListener('click',e=>{
  const t=e.target instanceof Element?e.target:null;if(!t)return;
  if(t.closest('[data-save-retry]')){if(uiIsPlayer())return;lastPersistedSignature=null;if(persist())toast('Сохранено','ok');return}
  if(t.closest('[data-save-export]')){exportWorldToFile({skipPersist:true});return}
  if(t.closest('#saveStatus')){if(saveStatus.kind==='error'){if(uiIsPlayer())return;lastPersistedSignature=null;if(persist())toast('Сохранено','ok')}else toast(document.getElementById('saveStatus')?.title||'','ok')}
});

// ---- Two browser tabs on the same world (0.16). localStorage tells every other
// tab when the world changes. Each tab remembers the version it last read or wrote
// (syncBase). When another tab's version arrives, the two are merged object by
// object: whatever THIS tab changed since syncBase is kept, everything else is
// taken from the other tab. So two tabs editing different characters, links or
// types never erase each other. The desktop app runs a single window; this never fires there.
let syncBase=null,syncBaseRev='',pendingExternalWorld=null,mergedSinceHistory=false;
// 0.17.5: recent versions this tab wrote or merged, by revision. When both tabs save at the same
// moment, each new version is built on the same older one; the merge then uses that older version
// as the base, so both edits survive (before, one of them could be lost).
const syncVersions=new Map();
function rememberSyncVersion(rev,text){if(!rev||!text)return;syncVersions.delete(rev);syncVersions.set(rev,text);while(syncVersions.size>6)syncVersions.delete(syncVersions.keys().next().value)}
function newSyncRev(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
const SYNC_LISTS=['entityTypes','relationTypes','statusGroups','workspaces','entities','relations'];
const sameJson=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function mergeRecords(base=[],mine=[],theirs=[],deep=false){
  const id=r=>r&&typeof r==='object'?String(r.id??''):'';
  const B=new Map(base.map(r=>[id(r),r])),M=new Map(mine.map(r=>[id(r),r])),T=new Map(theirs.map(r=>[id(r),r]));
  const mineChanged=k=>!sameJson(M.get(k),B.get(k));
  const pick=k=>{
    if(!mineChanged(k))return T.get(k);
    if(!M.has(k))return undefined;                       // this tab deleted it
    if(deep&&B.has(k)&&T.has(k))return mergeObjects(B.get(k),M.get(k),T.get(k));
    return M.get(k);                                     // this tab added or edited it
  };
  const out=[];const seen=new Set();
  for(const r of theirs){const k=id(r);seen.add(k);const v=pick(k);if(v!==undefined)out.push(v)}
  for(const r of mine){const k=id(r);if(seen.has(k))continue;seen.add(k);if(!B.has(k)||mineChanged(k))out.push(r)}
  return out;
}
function mergeObjects(base={},mine={},theirs={}){
  const out={};
  for(const k of new Set([...Object.keys(theirs),...Object.keys(mine)])){
    if(SYNC_LISTS.includes(k)&&(Array.isArray(mine[k])||Array.isArray(theirs[k]))){out[k]=mergeRecords(base?.[k]||[],mine[k]||[],theirs[k]||[],k==='workspaces');continue}
    const v=!sameJson(mine[k],base?.[k])?mine[k]:theirs[k];
    if(v!==undefined)out[k]=v;
  }
  return out;
}
// Merges the other tab's world into this one; returns true if this tab had changes of its own.
function mergeExternalWorld(text){
  let theirs,base;try{theirs=JSON.parse(text)}catch{return false}
  if(!theirs||typeof theirs!=='object')return false;
  const parentText=syncVersions.get(String(theirs.metadata?.syncParent||''));
  try{base=parentText?JSON.parse(parentText):syncBase?JSON.parse(syncBase):null}catch{base=null}
  if(currentWorkspace())captureWorkspace();
  const mine=JSON.parse(serializeWorld());
  const merged=base?mergeObjects(base,mine,theirs):theirs;
  const keepWs=state.workspaceId;
  data=merged;state.workspaceId=keepWs;normalize();
  syncBase=text;syncBaseRev=String(theirs.metadata?.syncRev||'');rememberSyncVersion(syncBaseRev,text);
  return !sameJson(JSON.parse(serializeWorld()),theirs);
}
function applyExternalWorld(text){
  if(document.getElementById('modalBack')?.classList.contains('open')){pendingExternalWorld=text;return}
  pendingExternalWorld=null;
  const keepScope=state.scopeId,keepSel=state.selectedId,keepMode=state.visualMode;
  const ownChanges=mergeExternalWorld(text);
  applyWorkspace(currentWorkspace());
  if(getEntity(keepScope))state.scopeId=keepScope;if(getEntity(keepSel)){state.selectedId=keepSel;state.selectedIds=new Set([keepSel])}
  state.visualMode=keepMode;state.viewVersion++;
  if(ownChanges)persist();else lastPersistedSignature=persistenceSignature();
  initEditHistory();
  applyVisualStyle(state.visualStyle,{shouldPersist:false});updateUI();
  toast('Мир обновлён: изменения из другой вкладки','ok');
}
// The event can arrive after this tab already wrote a newer version; so the CURRENT stored value is merged, not e.newValue.
function currentExternalWorld(){const cur=UniverseGraphStorage.getItem(STORAGE);return cur&&cur!==syncBase?cur:null}
window.addEventListener('storage',e=>{if(e.key!==STORAGE||persistenceLocked)return;const cur=currentExternalWorld();if(cur)applyExternalWorld(cur)});
// A dialog was open when the other tab saved: merge when it closes. If this tab
// saved meanwhile, writeWorld() has already merged it.
function flushExternalWorld(){if(pendingExternalWorld){pendingExternalWorld=null;const cur=currentExternalWorld();if(cur)applyExternalWorld(cur)}}
// Loads the world. Returns what happened so startup can tell the person:
// {source:'saved'|'demo'|'recovered'|'locked', detail}
function load(){
  takeRepairs();
  const stores=[STORAGE,...LEGACY_STORAGES];
  const usable=obj=>{
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return false;
    // An explicitly saved empty workspace is valid data and must survive restart.
    // We only need to reject arbitrary JSON objects that are not recognizably a world.
    return Array.isArray(obj.workspaces)||Array.isArray(obj.entities)||Array.isArray(obj.entityTypes)||Array.isArray(obj.relationTypes)||Array.isArray(obj.relations);
  };
  const lock=detail=>{
    // The real world exists but cannot be used. Showing the demo and letting
    // autosave write it would destroy the real world, so saving is switched off.
    persistenceLocked=true;data=clone(DEMO);loadedSavedWorld=false;normalize();
    return {source:'locked',detail};
  };
  for(const key of stores){
    let raw=null;
    try{raw=UniverseGraphStorage.getItem(key)}catch(e){console.warn('load',key,e)}
    if(!raw&&key===STORAGE&&UniverseGraphStorage.lastReadFailed)return lock('Сохранённый мир не удалось прочитать из базы. Показан демо-мир. Закройте программу и восстановите резервную копию (кнопка ⟳).');
    if(!raw)continue;
    let parsed=null;try{parsed=JSON.parse(raw)}catch(e){console.warn('load',key,e)}
    if(usable(parsed)){data=parsed;loadedSavedWorld=true;syncBase=raw;syncBaseRev=String(parsed.metadata?.syncRev||'');rememberSyncVersion(syncBaseRev,raw);normalize();return {source:'saved'}}
    if(key===STORAGE){
      // The stored world is damaged. Browser mode keeps a history in IndexedDB.
      const copy=UniverseGraphStorage.latestVersionText?.();let back=null;try{back=copy?JSON.parse(copy):null}catch{}
      if(usable(back)){data=back;loadedSavedWorld=true;normalize();return {source:'recovered',detail:'Сохранённый мир был повреждён. Загружена последняя исправная копия из истории.'}}
      lockedRawWorld=raw;
      return lock('Сохранённый мир повреждён, и исправной копии нет. Показан демо-мир; повреждённые данные не тронуты — их можно сохранить кнопкой «Сохранить копию в файл».');
    }
  }
  data=clone(DEMO);loadedSavedWorld=false;normalize();
  return {source:'demo'};
}
