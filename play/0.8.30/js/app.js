// Universe Graph — запуск приложения: загрузка мира, первая отрисовка, автосохранение,
// сохранение при закрытии. Загружается последним; все остальные модули уже определены.
'use strict';

document.title='Universe Detective · '+APP_VERSION.replace(/^ud-/,'');

// Saves on minimize / tab switch / close. Edits are saved at once anyway; this
// catches the camera position and anything still pending.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(!udUpdateLocked&&!viewAsPlayer()&&currentWorkspace())persist()}else wakeRenderLoop()});
window.addEventListener('beforeunload',e=>{
  if(!udUpdateLocked&&!viewAsPlayer()&&currentWorkspace())persist()
  // Browser tab only: warn when the last change could not be saved. (In the desktop
  // app this would block closing without showing any dialog, so it is not done there.)
  if(UniverseGraphStorage.backend!=='sqlite'&&saveStatus.kind==='error'){e.preventDefault();e.returnValue=''}
});
// Another browser tab added or removed an image.
window.addEventListener('ug-media-changed',e=>{invalidateMediaCache(e.detail);updateUI()});
window.addEventListener('ug-storage-error',e=>toast(String(e.detail||'Ошибка хранилища'),'err'));

function bootApplication(){
  const loadResult=load();
  seedExampleWidgets();initEditHistory();loadUIPrefs();initUiScale();initStylePicker();resize();
  const ws=currentWorkspace();if(ws)applyWorkspace(ws);
  applyVisualStyle(state.visualStyle,{shouldPersist:false});
  // 0.16: the camera (zoom and position) of a saved world is restored; it used to be
  // replaced by «fit everything» on every start.
  const v=ws?.view||{},savedCamera=loadResult.source!=='demo'&&Number.isFinite(Number(v.zoom))&&('panX' in v)?{zoom:state.zoom,panX:state.panX,panY:state.panY,galaxyZoom:state.galaxyZoom,galaxyPanX:state.galaxyPanX,galaxyPanY:state.galaxyPanY}:null;
  state.scopeId=getEntity(state.scopeId)?.id||currentRootId()||'e-world';state.history=[state.scopeId];state.historyIndex=0;
  setScope(state.scopeId,{push:false,center:false});
  if(savedCamera){Object.assign(state,savedCamera);updateZoom()}else fitView();
  updateUI();
  wakeRenderLoop();
  if(persistenceLocked)setSaveStatus('locked',loadResult.detail);
  // One write at start stores any repairs made while loading (the database skips it
  // when nothing really changed).
  else if(persist()&&saveStatus.kind!=='saved')setSaveStatus('saved');
  appBooted=true;
  udInitUpdates();
  if(loadResult.source==='recovered'||loadResult.source==='locked')showStartupNotice(loadResult.source==='recovered'?'Мир восстановлен':'Сохранение выключено',loadResult.detail);
  else reportDataRepairs();
  autosaveTimer=setInterval(persistOnTimer,12000);
}

// Browser mode first loads images and history from IndexedDB; the desktop app is ready at once.
Promise.resolve(UniverseGraphStorage.ready).catch(()=>{}).then(()=>{
  try{bootApplication()}catch(error){showFatalScreen(error,'запуска')}
});
