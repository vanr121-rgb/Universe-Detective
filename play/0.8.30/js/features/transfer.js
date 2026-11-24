// Universe Graph — Перенос данных: экспорт/импорт JSON, резервные копии, сброс демо, примеры блоков.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
async function buildExportDocument(){
  const doc=JSON.parse(serializeWorld());doc._media=[];
  if(typeof udNetEnsureOriginals==='function')await udNetEnsureOriginals(mediaDataIdsFromData(doc));
  for(const row of udExportMediaRows(doc))doc._media.push(row);
  return doc;
}
function* udExportMediaRows(doc){
  const ids=mediaDataIdsFromData(doc);
  if(ids.length>UD_WORLD_MEDIA_COUNT_MAX)throw Error('В мире слишком много изображений для JSON. Создайте резервную копию базы.');
  for(const id of ids){
    // A single IPC reply must never contain the entire media collection.
    const m=UniverseGraphStorage.mediaGet(id);
    if(m)yield {id:m.id,filename:m.filename,mime:m.mime,width:m.width,height:m.height,size:m.size,data:m.data,metadata:m.metadata||{}};
  }
}
async function udBuildWorldExportBlob(){
  const doc=JSON.parse(serializeWorld()),parts=['{'];delete doc._media;
  if(typeof udNetEnsureOriginals==='function')await udNetEnsureOriginals(mediaDataIdsFromData(doc));
  for(const [key,value] of Object.entries(doc)){
    const text=JSON.stringify(value);if(text.length>UD_WORLD_SECTION_MAX)throw Error('Раздел мира слишком велик для JSON. Создайте резервную копию базы.');
    parts.push(JSON.stringify(key),':',text,',\n');
  }
  parts.push('"_media":[');let first=true;
  for(const row of udExportMediaRows(doc)){
    const text=JSON.stringify(row);if(text.length>UD_WORLD_IMAGE_JSON_MAX)throw Error('Изображение слишком велико для JSON. Создайте резервную копию базы.');
    if(!first)parts.push(',\n');first=false;parts.push(text);
  }
  parts.push(']}');const blob=new Blob(parts,{type:'application/json'});
  if(blob.size>UD_WORLD_FILE_MAX)throw Error('Мир превышает 1 ГБ JSON. Создайте резервную копию базы.');
  return blob;
}
function downloadWorldBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return blob.size}
function downloadText(text,name){return downloadWorldBlob(new Blob([text],{type:'application/json'}),name)}
// Export never depends on a successful save any more: when the save failed, the
// file is the person's way out with their current work (0.16).
async function exportWorldToFile({skipPersist=false}={}){
  if(viewAsPlayer())return;

  const day=new Date().toISOString().slice(0,10);
  try{
    if(persistenceLocked){if(lockedRawWorld){const n=downloadText(lockedRawWorld,`universe-graph-damaged-${day}.json`);toast(`Сохранены исходные (повреждённые) данные · ${formatBytes(n)}`,'ok')}else toast('Исходные данные недоступны для чтения — восстановите резервную копию','err');return}
    if(!skipPersist&&!persist())toast('В базу сохранить не удалось — файл создаётся из текущих данных','err');
    const blob=await udBuildWorldExportBlob();
    toast(`JSON экспортирован · ${formatBytes(downloadWorldBlob(blob,`universe-graph-${day}.json`))}`,'ok');
  }catch(error){console.error('export',error);toast(error?.message||'Не удалось экспортировать JSON','err')}
}
$('#exportBtn').onclick=()=>exportWorldToFile();
$('#backupBtn').onclick=()=>{if(uiIsPlayer())return;try{if(!persist()){toast('Не удалось сначала сохранить текущие данные — резервная копия не создана','err');return}const destination=window.universeDesktop?.storage?.chooseBackupPath?.();if(!destination){toast('Резервная копия отменена','err');return}const result=UniverseGraphStorage.backupToFile(destination);if(!result?.path)throw new Error('Не удалось подтвердить создание резервной копии');toast('Резервная копия создана: '+result.path.split(/[\\/]/).pop(),'ok')}catch(err){console.error('backup',err);toast('Не удалось создать резервную копию: '+(err?.message||'ошибка'),'err')}};
$('#restoreBackupBtn').onclick=()=>{if(uiIsPlayer())return;if(!confirm('Восстановить Universe Graph из резервной копии? Текущая база будет сохранена как pre-restore backup.'))return;try{const source=window.universeDesktop?.storage?.chooseRestoreBackup?.();if(!source){toast('Восстановление отменено','err');return}persist();
  // 0.15.21: from here on the in-memory world is obsolete. Without this lock the
  // reload's beforeunload/visibilitychange autosave wrote the old world back
  // over the freshly restored database.
  persistenceLocked=true;clearInterval(autosaveTimer);
  let restored=false;try{restored=UniverseGraphStorage.restoreBackup(source)}finally{if(restored!==true){persistenceLocked=false;autosaveTimer=setInterval(persistOnTimer,12000)}}
  if(restored!==true)throw new Error('Резервная копия не была восстановлена');toast('Резервная копия восстановлена','ok');setTimeout(()=>location.reload(),250)}catch(err){console.error('restore backup',err);toast('Не удалось восстановить резервную копию: '+(err?.message||'ошибка'),'err')}};
function chooseWorldFile(intent='import'){
  if(rulesPlayerMode())return;
  const input=$('#fileInput');
  input.dataset.intent=intent;
  input.click();
}
$('#importBtn').onclick=()=>chooseWorldFile();
let udImportReading=null;
$('#fileInput').onchange=async event=>{
  const input=event.target,file=input.files[0],intent=input.dataset.intent;
  delete input.dataset.intent;
  input.value='';
  if(!file||rulesPlayerMode())return;
  if(udImportReading){toast('Дождитесь чтения текущего файла или отмените его','err');return}
  if(file.size>UD_WORLD_FILE_MAX){toast('Файл слишком большой (максимум 1 ГБ JSON). Используйте резервную копию базы.','err');return}
  const controller=new AbortController(),cancel=()=>controller.abort();udImportReading=controller;
  openModal('Чтение сохранения',`<div class="stack"><div class="massSummary">${escapeHtml(file.name)} · ${formatBytes(file.size)}</div><progress id="udImportProgress" max="${file.size||1}" value="0" style="width:100%"></progress><div class="inlineHelp">Подготовка мира и изображений. Текущие данные пока не изменены.</div></div>`,'<button class="btn" id="udImportReadCancel">Отмена</button>');
  activeModalCleanup=cancel;$('#udImportReadCancel').onclick=closeModal;
  try{
    const parsed=udValidateWorldDocument(await udReadWorldFile(file,{signal:controller.signal,onProgress:done=>{const p=$('#udImportProgress');if(p&&activeModalCleanup===cancel)p.value=done}}));
    if(controller.signal.aborted)return;
    if(activeModalCleanup===cancel){activeModalCleanup=null;closeModal()}
    if(rulesPlayerMode())return;
    if(intent==='merge'){udMergePreview(parsed,file.name);return}
    const count=Array.isArray(parsed.workspaces)?parsed.workspaces.length:1;
    openModal('Импорт мира',`<div class="stack"><div class="massSummary">Файл «${escapeHtml(file.name)}»: рабочих зон — <b>${count}</b>.</div><div class="widgetHint"><b>Добавить</b> — рабочие зоны из файла появятся рядом с вашими, ничего не удаляется.<br><b>Объединить</b> — перенести данные выбранной зоны файла в открытую зону.<br><b>Заменить всё</b> — заменить текущие рабочие зоны (перед этим создаётся резервная копия).</div></div>`,
      '<button class="btn" id="impCancel">Отмена</button><button class="btn danger" id="impReplace">Заменить всё</button><button class="btn" id="impMerge">Объединить с этой зоной</button><button class="btn primary" id="impAdd">Добавить как новые</button>');
    if(window.UG_ONLINE_PLAYER){$('#impReplace').textContent='Заменить доступные зоны';$('#impReplace').title='Заменяются только зоны, доступные вашему аватару';}
    $('#impCancel').onclick=closeModal;
    $('#impMerge').onclick=()=>udMergePreview(parsed,file.name);
    $('#impAdd').onclick=()=>{if(closeModal()&&!rulesPlayerMode())applyImportedWorld(parsed,'add')};
    $('#impReplace').onclick=()=>{if(closeModal()&&!rulesPlayerMode()&&createSafetyBackup('pre-import'))applyImportedWorld(parsed,'replace')};
  }catch(error){
    if(activeModalCleanup===cancel){activeModalCleanup=null;closeModal()}
    if(!controller.signal.aborted)toast('Не удалось импортировать JSON: '+error.message,'err');
  }finally{if(udImportReading===controller)udImportReading=null}
};
function prepareImportedMedia(parsed,{reuseRenamed=false}={}){
  const imported=Array.isArray(parsed?._media)?parsed._media:[];
  delete parsed._media;
  if(imported.length>UD_WORLD_MEDIA_COUNT_MAX)throw new Error('Слишком много изображений в импорте.');
  const incomingIds=new Set(imported.map(m=>String(m?.id||'')));
  const seen=new Set(),reserved=new Set(incomingIds),replacements=new Map(),rows=[];
  for(const image of imported){
    const originalId=String(image?.id||'');
    if(!isRecord(image)||!originalId||!MEH_MEDIA_ACCEPT_MIMES.includes(String(image.mime||'').toLowerCase()))throw new Error('Некорректное изображение в импорте.');
    if(seen.has(originalId))throw new Error(`Повторяющийся ID изображения ${originalId}.`);
    seen.add(originalId);
    if(Number(image.size)>MEH_MEDIA_MAX_BYTES)throw new Error(`Изображение ${image.filename||originalId} превышает 8 МБ.`);
    const bytes=String(image.data||'');
    if(bytes.length>Math.ceil(MEH_MEDIA_MAX_BYTES/3)*4)throw new Error(`Изображение ${image.filename||originalId} превышает 8 МБ.`);
    let id=originalId,reuse=false;
    const current=UniverseGraphStorage.mediaGet(originalId);
    if(current){
      reuse=current.data===bytes;
      if(!reuse&&reuseRenamed){
        // Make the preview repeatable, and compare the actual bytes before reusing an ID.
        const prefix=`media-import-${boardHash(originalId).toString(36)}-${boardHash(bytes).toString(36)}`;
        for(let i=0;;i++){
          const candidate=i?`${prefix}-${i}`:prefix;
          if(reserved.has(candidate))continue;
          const existing=UniverseGraphStorage.mediaGet(candidate);
          if(existing&&existing.data!==bytes)continue;
          id=candidate;reuse=!!existing;break;
        }
      }else if(!reuse)id=uid('media-import');
    }
    if(id!==originalId){reserved.add(id);replacements.set(originalId,id)}
    if(!reuse)rows.push({id,workspaceId:null,entityId:image.entityId||null,filename:String(image.filename||'image'),mime:String(image.mime),
      width:Number(image.width)||0,height:Number(image.height)||0,data:bytes,metadata:image.metadata||{}});
  }
  rewriteImportedMediaRefs(parsed,replacements);
  return {rows,replacements,count:imported.length};
}
function writeImportedMedia(rows,storedMedia){
  for(const row of rows){
    const result=UniverseGraphStorage.mediaPut(row);
    if(!result?.ok)throw new Error(result?.error||'Не удалось восстановить изображение.');
    storedMedia.push(row.id);
  }
}
function storeImportedMedia(parsed,storedMedia){
  const plan=prepareImportedMedia(parsed);
  writeImportedMedia(plan.rows,storedMedia);
  return plan.count;
}
// Normalizes a foreign world in isolation (normalize() works on the global
// `data`), then appends its workspaces with fresh ids. Since 0.17 each workspace
// brings its own rule set (types, relations, statuses), so nothing is merged.
function mergeImportedWorkspaces(parsed){
  const saved=data,savedWs=state.workspaceId;
  let imported;
  try{data=parsed;state.workspaceId=null;normalize();imported=data}finally{data=saved;state.workspaceId=savedWs;normalize()}
  const added=[];
  for(const ws of imported.workspaces){
    const copy=clone(ws);copy.id=uid('ws');copy.name=(ws.name||'Рабочая зона')+' (импорт)';copy.favorite=false;
    data.workspaces.push(copy);added.push(copy);
  }
  return added;
}
function applyImportedWorld(parsed,mode){
  if(window.UG_ONLINE_PLAYER){if(worldReadOnly())return;try{storeImportedMedia(parsed,[]);return udZoneCommand('import',{document:parsed,mode})}catch(e){toast(e.message||'Не удалось импортировать файл','err');return}}
  if(viewAsPlayer())return;

  const before=clone(data),beforeState=snapshotMutationState(),storedMedia=[];
  takeRepairs();
  try{
    const mediaCount=storeImportedMedia(parsed,storedMedia);
    if(mode==='add'){
      const added=mergeImportedWorkspaces(parsed);
      if(!added.length)throw new Error('В файле нет рабочих зон.');
      captureWorkspace();
      state.workspaceId=added[0].id;normalize();applyWorkspace(currentWorkspace());applyVisualStyle(state.visualStyle,{shouldPersist:false});
      state.history=state.scopeId?[state.scopeId]:[];state.historyIndex=0;
      state.workspaceRecent=[added[0].id,...state.workspaceRecent.filter(x=>x!==added[0].id)].slice(0,8);
    }else{
      data=parsed;state.workspaceId=null;state.search='';{const gs=document.getElementById('globalSearch');if(gs)gs.value=''}state.filtersEntities=new Set();state.filtersRelations=new Set();state.showExternal=false;state.isolate=false;state.hideFar=false;state.focusRadius=2;normalize();state.viewVersion=(state.viewVersion||0)+1;state.scopeId=data.entities.find(e=>e.style?.space)?.id||data.entities[0]?.id||currentRootId();state.selectedId=null;state.selectedRelationId=null;state.selectedIds=new Set();state.history=state.scopeId?[state.scopeId]:[];state.historyIndex=0;
    }
    if(!persist())throw new Error('save');
    if(mode==='replace'){deferObsoleteMedia(before);flushDeferredMediaDeletes()}
    updateWorkspacePopup();updateUI();fitView();reportDataRepairs();
    toast(mode==='add'?`Добавлено рабочих зон: ${Array.isArray(parsed.workspaces)?parsed.workspaces.length:1} · изображений: ${mediaCount}`:`Мир заменён из файла · изображений: ${mediaCount}`,'ok');
  }catch(err){
    console.warn('import',err);
    restoreWorkspaceMutation(before,beforeState);
    for(const id of storedMedia){try{if(!mediaDataIdsFromData(data).includes(id))UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}catch{}}
    updateUI();
    toast(err?.message==='save'?'Не удалось сохранить импортированные данные':'Не удалось импортировать JSON: '+(err?.message||'проверьте структуру файла'),'err');
  }
}
$('#resetBtn').onclick=()=>{if(uiIsPlayer())return;const wsCount=data.workspaces.length;if(!confirm(`Заменить ВСЕ рабочие зоны (${wsCount}) демонстрационным миром?\n\nПеред заменой будет создана резервная копия базы. Отменить можно также через Ctrl+Z до закрытия программы.`))return;if(!createSafetyBackup('pre-reset'))return;const before=clone(data),beforeState=snapshotMutationState();data=clone(DEMO);loadedSavedWorld=false;state.workspaceId=null;state.scopeId='e-world';state.selectedId=null;state.selectedRelationId=null;state.selectedIds=new Set();state.history=['e-world'];state.historyIndex=0;state.showExternal=false;state.showRelations=true;state.isolate=false;state.mode='explore';state.enterOnClick=false;state.visualMode='graph';state.zoom=1;state.panX=0;state.panY=0;state.treeZoom=1;state.treeExpanded=new Set();state.treeRootCollapsed=false;state.outlineExpanded=new Set();state.outlineCollapsedRoots=new Set();state.outlineZoom=1;state.galaxyZoom=1;state.galaxyPanX=0;state.galaxyPanY=0;state.galaxyExpanded=new Set();state.galaxyRootCollapsed=false;state.galaxyOrbit={};state.viewVersion=(state.viewVersion||0)+1;normalize();ensureContainsType();seedExampleWidgets();updateVisualMode();fitView();updateUI();if(!persist()){data=before;restoreMutationState(beforeState);normalize();applyWorkspace(currentWorkspace());applyVisualStyle(state.visualStyle,{shouldPersist:false});updateUI();fitView();toast('Не удалось сохранить сброс — текущие данные восстановлены','err');return}deferObsoleteMedia(before);flushDeferredMediaDeletes();toast('Демо-мир восстановлен','ok')};

function seedExampleWidgets(){
  const main=data.workspaces.find(w=>w.id==='ws-main')||data.workspaces[0];if(!main)return;
  const isDemo=data.metadata?.name==='living-world-demo';
  if(!isDemo)return;
  // 0.15.21: seed only once. Before, deleted example blocks came back on every launch.
  if(data.metadata?.exampleWidgetsSeededV3)return;
  const root=main.entities?.find(e=>e.id==='e-world')||main.entities?.find(e=>e.style?.space)||main.entities?.[0];if(!root)return;
  root.widgets=Array.isArray(root.widgets)?root.widgets:[];
  const byId=new Map(root.widgets.map(w=>[w.id,w]));
  const examples=[
    {id:'sample-card',kind:'card',config:{title:'Пример карточки',subtitle:'Произвольные поля и источники',columns:2,fields:[{label:'Название',source:'name',format:'text'},{label:'Тип',source:'type',format:'text'},{label:'Связи',source:'relationCount',format:'number'},{label:'Теги',source:'tagCount',format:'number'}]},style:{span:12,shape:'rounded',radius:11,padding:10,opacity:1}},
    {id:'sample-card-2',kind:'card',config:{title:'Пример свойств',subtitle:'Данные из properties',columns:2,fields:[{label:'Пример поля 1',source:'property.Жанр',format:'text'},{label:'Пример поля 2',source:'property.Режим',format:'text'}]},style:{span:12,shape:'square',radius:8,padding:10,opacity:1}},
    {id:'sample-notebook',kind:'card',config:{title:'Пример блокнота',subtitle:'Свободный текст',mode:'notebook',text:'Здесь можно хранить длинные заметки, описание, хронику или любую другую свободную информацию.\n\nЭтот блок не зависит от типа сущности.',align:'left',fontSize:12,lineHeight:1.6},style:{span:12,shape:'rounded',radius:11,padding:10,opacity:1}},
    {id:'sample-metric',kind:'metric',config:{title:'Пример метрики',subtitle:'Источник: системное значение',source:'relationCount',format:'number',prefix:'',unit:''},style:{span:6,shape:'rounded',radius:11,padding:10,opacity:1}},
    {id:'sample-metric-2',kind:'metric',config:{title:'Пример второй метрики',subtitle:'Любой другой источник',source:'tagCount',format:'number',prefix:'',unit:''},style:{span:6,shape:'pill',radius:18,padding:10,opacity:1}},
    {id:'sample-gauge',kind:'chart',config:{title:'Пример Gauge',subtitle:'Процентный круг',type:'gauge',value:'72',min:0,max:100,displayFormat:'percent',unit:'',color:'#74b8ff',centerText:'',lineWidth:2,showValues:true},style:{span:6,shape:'rounded',radius:11,padding:10,opacity:1}},
    {id:'sample-bar',kind:'chart',config:{title:'Пример столбцов',subtitle:'Произвольные категории',type:'bar',color:'#8d78ff',data:[{label:'A',value:35,color:'#8d78ff'},{label:'B',value:62,color:'#57dfb3'},{label:'C',value:48,color:'#ff6b88'}],showValues:true},style:{span:6,shape:'rounded',radius:11,padding:10,opacity:1}},
    {id:'sample-line',kind:'chart',config:{title:'Пример линии',subtitle:'Произвольная последовательность',type:'line',color:'#54dcff',data:[{label:'1',value:12,color:'#54dcff'},{label:'2',value:28,color:'#54dcff'},{label:'3',value:19,color:'#54dcff'},{label:'4',value:41,color:'#54dcff'}],showValues:true},style:{span:12,shape:'rounded',radius:11,padding:10,opacity:1}},
    {id:'sample-doughnut',kind:'chart',config:{title:'Пример кольцевого графика',subtitle:'Несколько категорий',type:'doughnut',color:'#74b8ff',data:[{label:'A',value:25,color:'#74b8ff'},{label:'B',value:45,color:'#8d78ff'},{label:'C',value:30,color:'#57dfb3'}],showValues:false},style:{span:12,shape:'rounded',radius:11,padding:10,opacity:1}}
  ];
  let added=0;
  for(const example of examples){if(!byId.has(example.id)){root.widgets.push(example);added++;}}
  if(!data.metadata)data.metadata={};
  data.metadata.exampleWidgetsSeeded=true;data.metadata.exampleWidgetsSeededV2=true;data.metadata.exampleWidgetsSeededV3=true;
  if(added>0)persist();
}

