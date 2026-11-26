// Universe Graph — Рабочие зоны: переключение, создание, копирование, удаление, импорт, окно списка.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
// End the source gesture before captureWorkspace/snapshot and before changing IDs.
// applyWorkspace also handles same-world network snapshots: it must not cancel live drags.
function prepareWorkspaceTransition(){
  if(typeof boardCancelDrag==='function')boardCancelDrag();
  if(typeof boardCancelQueuedCamera==='function')boardCancelQueuedCamera();
  if(typeof viewPersistTimer!=='undefined'){clearTimeout(viewPersistTimer);viewPersistTimer=0}
  state.boardLastTap=null;
}
function applyWorkspace(ws){
  if(!ws)return;
  state.visualStyle=styleForWorld(ws); // 0.25.1: personal, not the world's
  data.entities=ws.entities=Array.isArray(ws.entities)?ws.entities:[];
  data.relations=ws.relations=Array.isArray(ws.relations)?ws.relations:[];
  // 0.17: the rule set belongs to the workspace too.
  data.entityTypes=ws.entityTypes=Array.isArray(ws.entityTypes)?ws.entityTypes:[];
  data.relationTypes=ws.relationTypes=Array.isArray(ws.relationTypes)?ws.relationTypes:[];
  data.statusGroups=ws.statusGroups=Array.isArray(ws.statusGroups)?ws.statusGroups:[];
  state.filtersStatuses=new Set();
  invalidateContainmentIndex();
  // Positions are workspace-local. Legacy position maps are applied only when
  // the entity itself does not already contain the preferred coordinates.
  for(const e of data.entities){const pos=ws.positions?.[e.id];if(pos){e.style=e.style||{};if(Number.isFinite(pos.x))e.style.x=pos.x;if(Number.isFinite(pos.y))e.style.y=pos.y}}
  const v=ws.view||{};state.scopeId=getEntity(v.scopeId)?.id||getEntity(ws.rootId)?.id||data.entities.find(e=>e.style?.space)?.id||data.entities[0]?.id||null;
  state.udContainerContext=typeof udBoundContainerContext==='function'?udBoundContainerContext(v.udContainerContext):null;state.udContextHistory=[];
  state.zoom=clamp(Number(v.zoom)||1,.06,5);state.panX=Number(v.panX)||0;state.panY=Number(v.panY)||0;
  state.treeZoom=clamp(Number(v.treeZoom)||1,.5,2.4);state.treeRootCollapsed=!!v.treeRootCollapsed;state.outlineZoom=clamp(Number(v.outlineZoom)||1,.6,2.2);state.treeExpanded=new Set(Array.isArray(v.treeExpanded)?v.treeExpanded.filter(Boolean):[]);state.outlineExpanded=new Set(Array.isArray(v.outlineExpanded)?v.outlineExpanded.filter(Boolean):[]);state.outlineCollapsedRoots=new Set(Array.isArray(v.outlineCollapsedRoots)?v.outlineCollapsedRoots.filter(Boolean):[]);
  state.galaxyZoom=clamp(Number(v.galaxyZoom)||1,.25,4);state.galaxyPanX=Number(v.galaxyPanX)||0;state.galaxyPanY=Number(v.galaxyPanY)||0;state.galaxyRootCollapsed=!!v.galaxyRootCollapsed;state.galaxyOrbit=(v.galaxyOrbit&&typeof v.galaxyOrbit==='object')?clone(v.galaxyOrbit):{};state.galaxyOrbitOpacity=clamp(Number(v.galaxyOrbitOpacity)||.62,.15,1);state.galaxyExpanded=new Set(Array.isArray(v.galaxyExpanded)?v.galaxyExpanded.filter(Boolean):[]);
  state.boardZoom=clamp(Number(v.boardZoom)||1,typeof BOARD_ZOOM_MIN==='number'?BOARD_ZOOM_MIN:.04,2.5);state.boardPanX=Number(v.boardPanX)||0;state.boardPanY=Number(v.boardPanY)||0;state.boardRed=!!v.boardRed;state.boardContain=v.boardContain!==false;state.boardTypeColors=!!v.boardTypeColors;state.hiddenTiers=new Set((Array.isArray(v.udHiddenTiers)?v.udHiddenTiers:[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=5));
  state.selectedId=null;state.selectedRelationId=null;state.selectedIds=new Set();state.traceStart=null;state.traceEnd=null;state.focusedPath=[];state.search='';{const gs=document.getElementById('globalSearch');if(gs)gs.value=''}state.filtersEntities=new Set();state.filtersRelations=new Set();state.showExternal=!!v.showExternal;state.isolate=false/* UD: «Изолировать» is a Graph thing — UD has no button to turn it off; the world keeps its value (UD_KEEP_VIEW_KEYS) */;state.showHidden=!!v.showHidden;state.graphExpanded=(v.graphExpanded&&typeof v.graphExpanded==='object'&&!Array.isArray(v.graphExpanded))?clone(v.graphExpanded):{};state.hideFar=false/* UD: as isolate */;state.focusRadius=clamp(Number(v.focusRadius)||2,1,4);state.viewVersion++;
  if(typeof viewAsPlayer==='function'&&viewAsPlayer())playerReproject();
  if(typeof udRestoreSharedContext==='function')udRestoreSharedContext();
  if(typeof udPrepareOpenContainerLayouts==='function')udPrepareOpenContainerLayouts();
}
function snapshotMutationState(){
  return {
    udContainerContext:clone(state.udContainerContext||null),udContextHistory:clone(state.udContextHistory||[]),
    workspaceId:state.workspaceId,scopeId:state.scopeId,selectedId:state.selectedId,selectedRelationId:state.selectedRelationId,
    traceStart:state.traceStart,traceEnd:state.traceEnd,focusedPath:[...state.focusedPath],
    zoom:state.zoom,panX:state.panX,panY:state.panY,showExternal:state.showExternal,showRelations:state.showRelations,
    isolate:state.isolate,showHidden:state.showHidden,search:state.search,focusRadius:state.focusRadius,hideFar:state.hideFar,
    hiddenTiers:new Set(state.hiddenTiers||[]),filtersEntities:new Set(state.filtersEntities),filtersRelations:new Set(state.filtersRelations),
    history:[...state.history],historyIndex:state.historyIndex,selectedIds:new Set(state.selectedIds),
    workspaceRecent:[...state.workspaceRecent],relationTreeExpanded:new Set(state.relationTreeExpanded),
    inspectorMode:state.inspectorMode,lastInspectorMode:state.lastInspectorMode,mode:state.mode,enterOnClick:state.enterOnClick,
    visualMode:state.visualMode,visualStyle:state.visualStyle,
    outlineExpanded:new Set(state.outlineExpanded),outlineCollapsedRoots:new Set(state.outlineCollapsedRoots),outlineZoom:state.outlineZoom,
    treeExpanded:new Set(state.treeExpanded),treeRootCollapsed:state.treeRootCollapsed,treeZoom:state.treeZoom,
    galaxyExpanded:new Set(state.galaxyExpanded),galaxyRootCollapsed:state.galaxyRootCollapsed,galaxyLayoutVersion:state.galaxyLayoutVersion,
    galaxyZoom:state.galaxyZoom,galaxyPanX:state.galaxyPanX,galaxyPanY:state.galaxyPanY,galaxyOrbit:clone(state.galaxyOrbit||{}),galaxyOrbitOpacity:state.galaxyOrbitOpacity,
    boardZoom:state.boardZoom,boardPanX:state.boardPanX,boardPanY:state.boardPanY,boardRed:state.boardRed,boardContain:state.boardContain,boardTypeColors:!!state.boardTypeColors,
    udPaperReveal:state.udPaperReveal,
    loadedSavedWorld
  };
}
function restoreMutationState(snapshot){
  state.udContainerContext=clone(snapshot.udContainerContext||null);state.udContextHistory=clone(snapshot.udContextHistory||[]);
  state.workspaceId=snapshot.workspaceId;state.scopeId=snapshot.scopeId;state.selectedId=snapshot.selectedId;state.selectedRelationId=snapshot.selectedRelationId;
  state.traceStart=snapshot.traceStart;state.traceEnd=snapshot.traceEnd;state.focusedPath=[...snapshot.focusedPath];
  state.zoom=snapshot.zoom;state.panX=snapshot.panX;state.panY=snapshot.panY;state.showExternal=snapshot.showExternal;state.showRelations=snapshot.showRelations;
  state.isolate=snapshot.isolate;state.showHidden=!!snapshot.showHidden;state.search=snapshot.search;state.focusRadius=snapshot.focusRadius;state.hideFar=snapshot.hideFar;
  state.hiddenTiers=new Set(snapshot.hiddenTiers||[]);state.filtersEntities=new Set(snapshot.filtersEntities);state.filtersRelations=new Set(snapshot.filtersRelations);
  state.history=[...snapshot.history];state.historyIndex=snapshot.historyIndex;state.selectedIds=new Set(snapshot.selectedIds);state.workspaceRecent=[...snapshot.workspaceRecent];
  state.relationTreeExpanded=new Set(snapshot.relationTreeExpanded);state.inspectorMode=snapshot.inspectorMode;state.lastInspectorMode=snapshot.lastInspectorMode;
  state.mode=snapshot.mode;state.enterOnClick=snapshot.enterOnClick;state.visualMode=VIEW_MODES.includes(snapshot.visualMode)?snapshot.visualMode:'detective';
  state.outlineExpanded=new Set(snapshot.outlineExpanded);state.outlineCollapsedRoots=new Set(snapshot.outlineCollapsedRoots);state.outlineZoom=snapshot.outlineZoom;
  state.treeExpanded=new Set(snapshot.treeExpanded);state.treeRootCollapsed=snapshot.treeRootCollapsed;state.treeZoom=snapshot.treeZoom;
  state.galaxyExpanded=new Set(snapshot.galaxyExpanded);state.galaxyRootCollapsed=snapshot.galaxyRootCollapsed;state.galaxyLayoutVersion=snapshot.galaxyLayoutVersion;
  state.galaxyZoom=snapshot.galaxyZoom;state.galaxyPanX=snapshot.galaxyPanX;state.galaxyPanY=snapshot.galaxyPanY;state.galaxyOrbit=clone(snapshot.galaxyOrbit||{});state.galaxyOrbitOpacity=snapshot.galaxyOrbitOpacity;
  state.boardZoom=snapshot.boardZoom;state.boardPanX=snapshot.boardPanX;state.boardPanY=snapshot.boardPanY;state.boardRed=snapshot.boardRed;state.boardContain=snapshot.boardContain;state.boardTypeColors=!!snapshot.boardTypeColors;
  state.udPaperReveal=snapshot.udPaperReveal;
  loadedSavedWorld=snapshot.loadedSavedWorld;
}
function restoreWorkspaceMutation(snapshot,stateSnapshot){
  // 0.25.3: the world's locked style is a setting, not an edit — undoing an earlier edit must not take it back
  const before=data;data=snapshot;keepStyleLocks(before,data);
  restoreMutationState(stateSnapshot);
  normalize();
  applyWorkspace(currentWorkspace());
  applyVisualStyle(state.visualStyle,{shouldPersist:false});
}
function snapshotWorkspaceMutation(){
  return {data:clone(data),state:snapshotMutationState()};
}
function switchWorkspace(id,{recordRecent=true}={}){
  if(window.UG_ONLINE_PLAYER)return udPlayerSelectZone(id);
  if(!udFinishDescription(true))return false;
  const target=data.workspaces.find(w=>w.id===id),current=currentWorkspace();if(!target)return false;
  // Clicking the workspace you are already in used to reset selection, filters and history.
  if(current&&current.id===target.id){hideWorkspacePopup();return true}
  prepareWorkspaceTransition();
  if(current&&current.id!==target.id)captureWorkspace();
  const snap=snapshotWorkspaceMutation();
  state.workspaceId=target.id;
  normalize();
  applyWorkspace(currentWorkspace());
  applyVisualStyle(state.visualStyle,{shouldPersist:false});
  state.history=state.scopeId?[state.scopeId]:[];
  state.historyIndex=Math.max(0,state.history.length-1);
  if(recordRecent)state.workspaceRecent=[target.id,...state.workspaceRecent.filter(x=>x!==target.id)].slice(0,8);
  if(!viewAsPlayer()&&!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateWorkspacePopup();updateUI();toast('Не удалось сохранить переключение рабочей зоны — состояние восстановлено','err');return false}
  updateWorkspacePopup();updateUI();toast('Рабочая зона: '+target.name,'ok');return true;
}
// 0.17: a new workspace starts from a rule set the person picks — a preset, an empty set,
// or a copy of the current workspace's rules.
function rulesForNewWorkspace(choice){
  if(choice==='empty')return {entityTypes:[],relationTypes:[containmentTypeTemplate()],statusGroups:[],rulesPreset:null,skin:null};
  if(choice==='copy'){const ws=currentWorkspace();return {entityTypes:clone(ws?.entityTypes||[]),relationTypes:clone(ws?.relationTypes||[]),statusGroups:clone(ws?.statusGroups||[]),rulesPreset:ws?.rulesPreset||null,skin:null}}
  return presetRules(choice)||presetRules('medieval');
}
function createWorkspace(){
  if(worldReadOnly())return;

  const options=[...PRESET_ORDER.map(id=>[id,RULE_PRESETS[id].name,RULE_PRESETS[id].description]),['empty','Пустой набор','Ни одного типа, связи или статуса — всё создаётся с нуля.'],['copy','Как в текущей рабочей зоне','Копия типов, связей, статусов и полей текущей рабочей зоны.']];
  openModal('Новая рабочая зона',`<div class="form"><div><label>Название</label><input id="wsName" value="Новая вселенная" placeholder="Название"></div><div><label>Набор правил</label><div class="presetChoice">${options.map(([id,name,desc],i)=>`<label class="presetOption"><input type="radio" name="wsPreset" value="${escapeHtml(id)}" ${i===0?'checked':''}><span><b>${escapeHtml(name)}</b><small>${escapeHtml(desc)}</small></span></label>`).join('')}</div></div><div class="widgetHint">Набор правил — это типы сущностей, связи, статусы и поля анкет. Его можно менять в любой момент кнопкой «Правила».</div></div>`,`<button class="btn" id="cancelModal">Отмена</button><button class="btn primary" id="saveWorkspaceName">Создать</button>`);
  $('#cancelModal').onclick=closeModal;
  $('#wsName').select();
  $('#saveWorkspaceName').onclick=()=>{
    const choice=document.querySelector('input[name="wsPreset"]:checked')?.value||'medieval';
    const name=$('#wsName').value.trim()||'Новая вселенная';
    if(makeWorkspace(name,choice))closeModal();
  };
}
// 0.28.2: a new workspace in one call (the window above and Meh: «создай рабочую зону Аркадия»); switches to it. → the workspace or null
function makeWorkspace(name,choice='copy',{legacyLayout=false}={}){
  if(window.UG_ONLINE_PLAYER)return udZoneCommand('create',{name,choice});
  if(worldReadOnly())return null;

  {name=String(name||'').trim().slice(0,80)||'Новая вселенная';
    prepareWorkspaceTransition();
    const src=currentWorkspace();if(src)captureWorkspace();
    const snap=snapshotWorkspaceMutation();
    const rules=rulesForNewWorkspace(choice);
    const worldType=rules.entityTypes.find(t=>/^(мир|вселенная)$/i.test(t.name))?.id||'';
    const root={id:uid('entity'),name,type:worldType,description:'',properties:{},widgets:[],tags:[],style:{x:0,y:0,pinned:true,space:true}};
    const view={zoom:1,panX:0,panY:0,scopeId:root.id};if(rules.skin)view.visualStyle=rules.skin;else if(src?.view?.visualStyle)view.visualStyle=src.view.visualStyle;
    const ws={id:uid('ws'),rootId:root.id,name,favorite:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),rulesPreset:rules.rulesPreset||null,entityTypes:rules.entityTypes,relationTypes:rules.relationTypes,statusGroups:rules.statusGroups,view,positions:{[root.id]:{x:0,y:0}},entities:[root],relations:[]};
    if(!legacyLayout)udInitSharedLayout(ws);
    data.workspaces.push(ws);state.workspaceId=ws.id;normalize();applyWorkspace(currentWorkspace());applyVisualStyle(state.visualStyle,{shouldPersist:false});state.history=state.scopeId?[state.scopeId]:[];state.historyIndex=Math.max(0,state.history.length-1);
    if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateWorkspacePopup();updateUI();toast('Не удалось создать рабочую зону — состояние восстановлено','err');return null}
    updateWorkspacePopup();updateUI();fitView();toast('Создана рабочая зона «'+name+'»','ok');return ws;
  }
}
function openWorkspaceRename(id){
  if(window.UG_ONLINE_PLAYER){const ws=onp.zones?.find(w=>w.id===id);if(!ws||worldReadOnly())return;openModal('Переименовать рабочую зону',`<div class="form"><label>Название<input id="udZoneName" value="${escapeHtml(ws.name)}"></label></div>`,`<button class="btn primary" id="udZoneRename">Сохранить</button>`);$('#udZoneRename').onclick=()=>{udZoneCommand('rename',{id,name:$('#udZoneName').value});closeModal()};return}

  if(worldReadOnly())return;
const ws=data.workspaces.find(w=>w.id===id);if(!ws)return;openModal('Переименовать рабочую зону',`<div class="form"><div><label>Название</label><input id="wsName" value="${escapeHtml(ws.name)}" placeholder="Название рабочей зоны"></div></div>`,`<button class="btn" id="cancelModal">Отмена</button><button class="btn primary" id="saveWorkspaceName">Сохранить</button>`);$('#cancelModal').onclick=closeModal;$('#saveWorkspaceName').onclick=()=>{const snap=clone(data);ws.name=$('#wsName').value.trim()||'Безымянная рабочая зона';ws.updatedAt=new Date().toISOString();if(!persist()){data=snap;normalize();updateWorkspacePopup();updateUI();toast('Не удалось переименовать рабочую зону — состояние восстановлено','err');return}closeModal();updateWorkspacePopup();toast('Рабочая зона переименована','ok')}}
function duplicateWorkspace(id){
  if(window.UG_ONLINE_PLAYER)return udZoneCommand('duplicate',{id});
  if(worldReadOnly())return;

  const src=data.workspaces.find(w=>w.id===id);if(!src)return;
  prepareWorkspaceTransition();
  captureWorkspace();
  const snap=snapshotWorkspaceMutation();
  const createdMediaIds=[];
  try{
    const sourceEntities=src.entities||[];
    const ws=clone(src);
    ws.id=uid('ws');ws.name=src.name+' — копия';ws.favorite=false;
    ws.createdAt=new Date().toISOString();ws.updatedAt=new Date().toISOString();
    data.workspaces.push(ws);
    state.workspaceId=ws.id;
    applyWorkspace(ws);
    for(let i=0;i<ws.entities.length;i++){
      const source=sourceEntities[i];
      const target=ws.entities[i];
      if(source&&target)cloneEntityMediaBindings(source,target,createdMediaIds);
    }
    if(!persist()){
      restoreWorkspaceMutation(snap.data,snap.state);
      for(const mediaId of createdMediaIds){try{UniverseGraphStorage.mediaDelete(mediaId);invalidateMediaCache(mediaId)}catch{}}
      updateWorkspacePopup();updateUI();
      toast('Не удалось скопировать рабочую зону — состояние восстановлено','err');
      return;
    }
    updateWorkspacePopup();updateUI();toast('Рабочая зона скопирована','ok');
  }catch(error){
    restoreWorkspaceMutation(snap.data,snap.state);
    for(const mediaId of createdMediaIds){try{UniverseGraphStorage.mediaDelete(mediaId);invalidateMediaCache(mediaId)}catch{}}
    updateWorkspacePopup();updateUI();
    toast(error?.message||'Не удалось скопировать рабочую зону — состояние восстановлено','err');
  }
}
function deleteWorkspace(id){
  if(window.UG_ONLINE_PLAYER){if(confirm('Удалить эту рабочую зону для всех участников?'))udZoneCommand('delete',{id});return}
  if(worldReadOnly())return;
if(data.workspaces.length<=1){toast('Последнюю рабочую зону удалить нельзя','err');return}const ws=data.workspaces.find(w=>w.id===id);if(!ws)return;const game=typeof onh!=='undefined'&&onh.open&&onh.wsId===id; /* 0.30.9: the online game is played in it */
  if(!confirm(`Удалить рабочую зону «${ws.name}»?${game?'\nВ ней сейчас идёт игра по сети — игра закроется, игроки будут отключены.':''}`))return;if(state.workspaceId===id){prepareWorkspaceTransition();captureWorkspace()}const snap=snapshotWorkspaceMutation();data.workspaces=data.workspaces.filter(w=>w.id!==id);state.workspaceRecent=state.workspaceRecent.filter(x=>x!==id);if(state.workspaceId===id){state.workspaceId=data.workspaces[0].id;normalize();applyWorkspace(currentWorkspace());state.history=state.scopeId?[state.scopeId]:[];state.historyIndex=Math.max(0,state.history.length-1)}if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateWorkspacePopup();updateUI();fitView();toast('Не удалось удалить рабочую зону — состояние восстановлено','err');return}deferObsoleteMedia(snap.data);flushDeferredMediaDeletes();if(game&&typeof onhClose==='function')onhClose();updateWorkspacePopup();updateUI();fitView();toast(game?'Рабочая зона удалена, игра по сети закрыта':'Рабочая зона удалена','ok')}
function toggleWorkspaceFavorite(id){if(window.UG_ONLINE_PLAYER)return udZoneCommand('favorite',{id});const ws=data.workspaces.find(w=>w.id===id);if(!ws)return;const snap=clone(data);ws.favorite=!ws.favorite;if(!persist()){data=snap;normalize();updateWorkspacePopup();toast('Не удалось изменить избранное — состояние восстановлено','err');return}updateWorkspacePopup()}

function toggleSpaceFavorite(id){if(!id)return;const has=state.spaceFavorites.has(id);if(has)state.spaceFavorites.delete(id);else state.spaceFavorites.add(id);saveUIPrefs();updateWorkspacePopup();toast(has?'Убрано из избранного':'Добавлено в избранное','ok')}
function copyImportedEntityTree(sourceEntities,sourceRelations,selectedIds,createdMediaIds=[]){
  const ids=new Set(selectedIds);const entityMap=new Map();const outEntities=[];
  for(const e of sourceEntities){
    if(!ids.has(e.id))continue;
    const c=clone(e);const old=c.id;c.id=uid('entity');entityMap.set(old,c.id);c.style=c.style||{};c.style.x=Number(c.style.x)||0;c.style.y=Number(c.style.y)||0;
    cloneEntityMediaBindings(e,c,createdMediaIds);
    outEntities.push(c);
  }
  const outRelations=[];
  for(const r of sourceRelations){const both=entityMap.has(r.from)&&entityMap.has(r.to);if(!both)continue;const nr=clone(r);nr.id=uid('relation');nr.from=entityMap.get(r.from);nr.to=entityMap.get(r.to);outRelations.push(nr)}
  return {entities:outEntities,relations:outRelations,map:entityMap};
}
// 0.29 (аудит, находка 41): since 0.17 every workspace has its own rules, so records brought from another one need their
// types, relation types and statuses too — otherwise they all arrived «Без типа». A rule with the same id or name is reused,
// a missing one is copied; returns how source ids map to ids here.
function importRulesFromWorkspace(src,target=data){
  const same=(list,x)=>list.find(y=>y.id===x.id)||list.find(y=>String(y.name||'').trim().toLowerCase()===String(x.name||'').trim().toLowerCase());
  const et=new Map(),rt=new Map(),sg=new Map(),opt=new Map();let added=0;
  for(const t of src.entityTypes||[]){let m=same(target.entityTypes,t);if(!m){m=clone(t);if(target.entityTypes.some(y=>y.id===m.id))m.id=uid('type');target.entityTypes.push(m);added++}et.set(t.id,m.id)}
  const contain=target.relationTypes.find(t=>t.containment);
  for(const t of src.relationTypes||[]){if(t.containment&&contain){rt.set(t.id,contain.id);continue}let m=same(target.relationTypes,t);if(!m){m=clone(t);if(target.relationTypes.some(y=>y.id===m.id))m.id=uid('rtype');target.relationTypes.push(m);added++}rt.set(t.id,m.id)}
  for(const g of src.statusGroups||[]){let m=same(target.statusGroups,g);
    if(!m){m=clone(g);if(target.statusGroups.some(y=>y.id===m.id))m.id=uid('status');m.appliesTo=(m.appliesTo||[]).map(id=>et.get(id)||id);target.statusGroups.push(m);added++}
    else for(const o of g.options||[]){if(!same(m.options,o)){const c=clone(o);if(m.options.some(y=>y.id===c.id))c.id=uid('opt');m.options.push(c)}}
    sg.set(g.id,m.id);for(const o of g.options||[])opt.set(g.id+':'+o.id,same(m.options,o)?.id||o.id)}
  return {et,rt,sg,opt,added};
}
function remapImportedRules(entities,relations,map){
  for(const e of entities){if(e.type)e.type=map.et.get(e.type)||e.type;
    if(isRecord(e.status)){const st={};for(const [g,v] of Object.entries(e.status)){const ng=map.sg.get(g)||g;st[ng]=Array.isArray(v)?v.map(o=>map.opt.get(g+':'+o)||o):(map.opt.get(g+':'+v)||v)}e.status=st}}
  for(const r of relations)r.type=map.rt.get(r.type)||r.type;
}
function openWorkspaceImport(){
  const current=currentWorkspace();if(!current)return;
  const sources=data.workspaces.filter(w=>w.id!==current.id);
  if(!sources.length){toast('Нет других рабочих зон для импорта','err');return}
  openModal('Импорт из другой рабочей зоны',`<div class="form"><div><label>Источник</label><select id="wiSource">${sources.map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)} · ${w.entities?.length||0} сущ. · ${w.relations?.length||0} связ.</option>`).join('')}</select></div><div><label>Что импортировать</label><select id="wiMode"><option value="all">Сущности и связи</option><option value="entities">Только сущности</option><option value="relations">Только связи (только если оба конца уже есть)</option></select></div><div class="widgetHint">Импорт создаёт копии. Исходная рабочая зона не изменяется. Связи между импортированными сущностями переносятся автоматически.</div></div>`,`<button class="btn" id="wiCancel">Отмена</button><button class="btn primary" id="wiImport">Импортировать</button>`);
  $('#wiCancel').onclick=closeModal;
  $('#wiImport').onclick=()=>{
    const before=clone(data);
    const beforeState=snapshotMutationState();
    const createdMediaIds=[];
    try{
      const src=data.workspaces.find(w=>w.id===$('#wiSource').value);if(!src)throw new Error('Рабочая зона-источник не найдена.');
      const mode=$('#wiMode').value;let imported=0,relImported=0;
      const ruleMap=importRulesFromWorkspace(src);
      if(mode==='relations'){
        const existing=new Set(data.entities.map(e=>e.id));
        for(const r of src.relations||[]){const type=ruleMap.rt.get(r.type)||r.type;if(existing.has(r.from)&&existing.has(r.to)&&!data.relations.some(x=>x.from===r.from&&x.to===r.to&&x.type===type)){const nr=clone(r);nr.id=uid('relation');nr.type=type;data.relations.push(nr);relImported++}}
      }else{
        // the source's own root («Вселенная» there) is not a record to bring: what was inside it lands in the current space
        const srcRoot=src.rootId&&(src.entities||[]).some(e=>e.id===src.rootId)?src.rootId:null;
        const result=copyImportedEntityTree(src.entities||[],(src.relations||[]).filter(r=>r.from!==srcRoot&&r.to!==srcRoot),(src.entities||[]).filter(e=>e.id!==srcRoot).map(e=>e.id),createdMediaIds);
        remapImportedRules(result.entities,result.relations,ruleMap);
        data.entities.push(...result.entities);imported=result.entities.length;
        if(mode==='all'){data.relations.push(...result.relations);relImported=result.relations.length}
        const importedIds=new Set(result.entities.map(e=>e.id));
        const importedChildren=new Set((mode==='all'?result.relations:[]).filter(r=>getRT(r.type).containment&&importedIds.has(r.from)&&importedIds.has(r.to)).map(r=>r.to));
        const attachTo=state.scopeId||currentRootId();
        for(const e of result.entities){
          if(!attachTo||e.id===attachTo||importedChildren.has(e.id))continue;
          if(!data.relations.some(r=>getRT(r.type).containment&&r.from===attachTo&&r.to===e.id))addContainmentSilent(e.id,attachTo);
        }
        if(!udSharedPlaceNewEntities(currentWorkspace(),importedIds))throw Error('Не удалось разместить импортированные бумажки в общей раскладке');
      }
      state.viewVersion++;
      if(!persist()){
        restoreWorkspaceMutation(before,beforeState);
        for(const mediaId of createdMediaIds){try{UniverseGraphStorage.mediaDelete(mediaId);invalidateMediaCache(mediaId)}catch{}}
        updateUI();fitView();toast('Не удалось сохранить импорт — состояние восстановлено','err');return;
      }
      closeModal();updateUI();fitView();toast(`Перенесено: ${rulesNum(imported,'сущность','сущности','сущностей')}${relImported?`, ${rulesNum(relImported,'связь','связи','связей')}`:''}${ruleMap.added?`, правил добавлено: ${ruleMap.added}`:''}`,'ok');
    }catch(error){
      restoreWorkspaceMutation(before,beforeState);
      for(const mediaId of createdMediaIds){try{UniverseGraphStorage.mediaDelete(mediaId);invalidateMediaCache(mediaId)}catch{}}
      updateUI();fitView();
      toast(error?.message||'Не удалось импортировать данные','err');
    }
  };
}
let wsActionsFor=null;
function renderWorkspacePopup(){
  const popup=$('#workspacePop');
  const rows=[...(window.UG_ONLINE_PLAYER?(onp.zones||[]):data.workspaces)].sort((a,b)=>Number(b.favorite)-Number(a.favorite)).map(ws=>{
    const id=escapeHtml(ws.id),name=escapeHtml(ws.name),active=ws.id===state.workspaceId,expanded=ws.id===wsActionsFor;
    return `<div class="udZoneRow">
      <button type="button" class="udSetRowName" data-ws-id="${id}"${active?' aria-current="true"':''}>
        <span>${ws.favorite?'★':'▦'}</span><span>${name}</span><small>${active?'Открыта':''}</small>
      </button>
      <button type="button" class="iconBtn" data-ws-actions="${id}" aria-label="Действия для зоны ${name}" aria-expanded="${expanded}">⋯</button>
    </div>${expanded?`<div class="udZoneActions">
      <button type="button" class="btn tiny" data-ws-fav="${id}">${ws.favorite?'Убрать из избранного':'В избранное'}</button>
      <button type="button" class="btn tiny" data-ws-rename="${id}"${active?' id="wsCurrentRename"':''}>Переименовать</button>
      <button type="button" class="btn tiny" data-ws-dup="${id}">Копия</button>
      <button type="button" class="btn tiny danger" data-ws-del="${id}"${data.workspaces.length<=1?' disabled':''}>Удалить</button>
    </div>`:''}`;
  }).join('');
  popup.innerHTML=`<div class="workspacePopHead"><h2 id="wsTitle">Рабочие зоны</h2><button type="button" class="iconBtn" id="wsClose" aria-label="Закрыть список зон">×</button></div>
    <div class="udZoneList">${rows}</div>
    <div class="udZoneActions"><button type="button" class="btn tiny primary" id="wsNew">＋ Новая рабочая зона</button>
    <button type="button" class="btn tiny" id="wsImport">Взять из другой зоны…</button></div>`;
}
function updateWorkspacePopup(){
  if(rulesPlayerMode()){hideWorkspacePopup();return}
  if($('#workspacePop').classList.contains('open'))renderWorkspacePopup();
}
function hideWorkspacePopup(restoreFocus=false){
  $('#workspacePop').classList.remove('open');
  $('#workspaceBtn').setAttribute('aria-expanded','false');
  wsActionsFor=null;
  if(restoreFocus)$('#workspaceBtn').focus();
}
function toggleWorkspacePopup(){
  if(rulesPlayerMode())return;
  const popup=$('#workspacePop'),button=$('#workspaceBtn');
  if(popup.classList.contains('open')){hideWorkspacePopup(true);return}
  renderWorkspacePopup();
  const rect=button.getBoundingClientRect();
  popup.style.top='auto';
  popup.style.right='auto';
  popup.style.bottom=zpx(innerHeight-rect.top+8)+'px';
  popup.classList.add('open');
  popup.style.left=zpx(Math.max(8,Math.min(rect.left,innerWidth-popup.getBoundingClientRect().width-8)))+'px';
  button.setAttribute('aria-expanded','true');
  popup.querySelector('[aria-current=true]')?.focus();
}
$('#workspacePop').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||rulesPlayerMode())return;
  event.stopPropagation();
  const id=button.dataset.wsId,actions=button.dataset.wsActions;
  if(id){if(switchWorkspace(id))hideWorkspacePopup(true);return}
  if(actions){
    wsActionsFor=wsActionsFor===actions?null:actions;
    renderWorkspacePopup();
    $(`#workspacePop [data-ws-actions="${CSS.escape(actions)}"]`)?.focus();
    return;
  }
  const favorite=button.dataset.wsFav,rename=button.dataset.wsRename;
  const duplicate=button.dataset.wsDup,remove=button.dataset.wsDel;
  if(favorite){toggleWorkspaceFavorite(favorite);return}
  hideWorkspacePopup(button.id==='wsClose');
  if(rename)openWorkspaceRename(rename);
  else if(duplicate)duplicateWorkspace(duplicate);
  else if(remove)deleteWorkspace(remove);
  else if(button.id==='wsNew')createWorkspace();
  else if(button.id==='wsImport')openWorkspaceImport();
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||!$('#workspacePop').classList.contains('open'))return;
  event.stopImmediatePropagation();
  hideWorkspacePopup(true);
},true);

