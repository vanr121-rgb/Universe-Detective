// Universe Graph — Операции над сущностями: удаление, копирование, вложение, порядок, массовые правки.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
function currentRootId(){const ws=currentWorkspace();if(ws?.rootId){const configured=getEntity(ws.rootId);if(configured&&isTopLevel(configured.id))return configured.id}const candidates=data.entities.filter(e=>e.style?.space&&isTopLevel(e.id));const root=candidates[0]||data.entities.find(e=>isTopLevel(e.id))||data.entities[0];if(ws&&root)ws.rootId=root.id;return root?.id||null}
function replaceActiveEntities(next){const ws=currentWorkspace();data.entities=next||[];if(ws)ws.entities=data.entities;invalidateContainmentIndex()}
function replaceActiveRelations(next){const ws=currentWorkspace();data.relations=next||[];if(ws)ws.relations=data.relations;invalidateContainmentIndex()}
function deleteEntities(ids,{confirm=true,networkShared=false}={}){
  if(worldReadOnly())return;

  const before=clone(data);
  const beforeState=snapshotMutationState();
  const list=[...new Set(ids)].filter(id=>id&&id!==currentRootId()&&getEntity(id));
  if(!list.length)return;
  if(confirm&&!window.confirm(`Удалить выбранные сущности (${list.length})?\nОни попадут в корзину вместе со связями — оттуда их можно вернуть.`))return;
  const set=new Set(list);
  // 0.29.2: into the trash first — with everything needed to put them back (trash.js)
  if(typeof trashCapture==='function')trashCapture(list,{networkShared});
  // Match single-delete semantics: surviving children are reattached instead of orphaned.
  const reattach=new Map();
  for(const id of list){
    const children=containmentChildren(id).filter(childId=>containmentParent(childId)===id);
    if(!children.length)continue;
    let fallback=containmentParent(id);
    while(fallback&&set.has(fallback))fallback=containmentParent(fallback);
    for(const childId of children){
      if(set.has(childId)||!fallback)continue;
      if(getEntity(childId)&&getEntity(fallback))reattach.set(childId,fallback);
    }
  }
  for(const e of data.entities)if(!set.has(e.id)&&set.has(containmentParent(e.id)))boardRebaseFixed(e,reattach.get(e.id)||null);
  replaceActiveEntities(data.entities.filter(e=>!set.has(e.id)));
  replaceActiveRelations(data.relations.filter(r=>!set.has(r.from)&&!set.has(r.to)));
  const containsType=ensureContainsType();
  for(const [childId,parentId] of reattach){
    if(!getEntity(childId)||!getEntity(parentId)||wouldCreateContainmentCycle(parentId,childId))continue;
    if(!data.relations.some(r=>getRT(r.type).containment&&r.from===parentId&&r.to===childId)){
      data.relations.push({id:uid('relation'),from:parentId,to:childId,type:containsType.id,properties:{},style:{}});
    }
  }
  const ws=currentWorkspace();
  if(ws)normalizeBoards(ws,new Set(data.entities.map(e=>e.id)));
  state.selectedIds=new Set();state.selectedId=null;state.selectedRelationId=null;
  if(!getEntity(state.scopeId)){const root=currentRootId();state.scopeId=root;state.history=state.history.filter(id=>getEntity(id));if(root&&!state.history.length)state.history=[root];state.historyIndex=Math.max(0,state.history.length-1)}
  state.viewVersion++;
  if(!persist()){
    restoreWorkspaceMutation(before, beforeState);
    updateUI();
    toast('Не удалось сохранить удаление — состояние восстановлено','err');
    return;
  }
  deferObsoleteMedia(before);
  flushDeferredMediaDeletes();
  updateUI();if(typeof updateTrashButton==='function')updateTrashButton();toast(list.length===1?'Сущность в корзине — вернуть: «🗑 Корзина» или Ctrl+Z; вложенные сохранены':`В корзине: ${rulesNum(list.length,'сущность','сущности','сущностей')} — вернуть: «🗑 Корзина» или Ctrl+Z`,'ok')
}
// 0.27: put records off the board (hide) or back. One edit — one Ctrl+Z.
function setEntitiesOffBoard(ids,on){
  if(window.UG_ONLINE_PLAYER){if(worldReadOnly())return 0;let count=0;for(const id of ids){const selected=udSelectedPaperId(),layout=boardLayout();const paper=layout.keys.get(selected)?.entityId===id?selected:[...layout.keys.values()].find(p=>p.entityId===id)?.id;if(on&&paper&&udRemovePaper(paper))count++;else if(!on&&getEntity(id)&&udCommitPlacementChange(b=>!!udPlaceAtContext(id,b,udSharedCurrentParent())))count++}return count}
  if(viewAsPlayer())return 0;

  const list=[...new Set(ids||[])].map(getEntity).filter(e=>e&&!!entityOffBoard(e)!==!!on);if(!list.length)return 0;
  const snap=snapshotWorkspaceMutation();for(const e of list){if(on){e.offBoard=true;delete e.onBoard}else entityBackOnBoard(e)}
  state.viewVersion=(state.viewVersion||0)+1;
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return 0}
  updateUI();return list.length;
}
// One button «убрать с доски / вернуть»: for the whole selection when the record is part of it.
function toggleOffBoard(id){
  const e=getEntity(id);if(!e)return 0;const ids=state.selectedIds.size>1&&state.selectedIds.has(id)?[...state.selectedIds]:[id],on=!entityOffBoard(e);
  const n=setEntitiesOffBoard(ids,on);if(!n)return 0;
  toast(on?(n===1?`«${e.name}» убрана с доски. Чтобы вернуть, откройте «⋯ → Скрытые сущности».`:`Убрано с доски: ${n}. Сущности не удалены`):(n===1?`«${e.name}» снова на доске`:`Снова на доске: ${n}`),'ok');
  return n;
}
// «👁» on a faint record (Tree, Outline) — back on the board
document.addEventListener('click',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-offboard-back]'):null;if(!b)return;ev.preventDefault();ev.stopPropagation();const e=getEntity(b.dataset.offboardBack);if(e&&setEntitiesOffBoard([e.id],false))toast(`«${e.name}» снова на доске`,'ok')},true);
// «Содержимое — вне доски» on a folder (bestiary, archive): what is inside — now and later — is off the board; one edit, one Ctrl+Z
function setContentOffBoard(id,on){
  if(uiIsPlayer())return false;

  const e=getEntity(id);if(!e||!!e.contentOffBoard===!!on)return false;const snap=snapshotWorkspaceMutation();
  if(on){e.contentOffBoard=true;for(const cid of containmentChildren(id)){const c=getEntity(cid);if(c&&containmentParent(cid)===id)delete c.onBoard}}else{delete e.contentOffBoard;for(const cid of containmentChildren(id)){const c=getEntity(cid);if(c&&containmentParent(cid)===id)delete c.onBoard}}
  state.viewVersion=(state.viewVersion||0)+1;
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return false}
  const n=containmentChildren(id).length;updateUI();
  toast(on?`Всё внутри «${e.name}» (${n}) — вне доски; новые сущности туда тоже сразу вне доски. Внутри «${e.name}» всё видно`:`Содержимое «${e.name}» снова на доске`,'ok');return true;
}
document.addEventListener('change',ev=>{const cb=ev.target instanceof Element?ev.target.closest('[data-content-offboard]'):null;if(cb)setContentOffBoard(cb.dataset.contentOffboard,cb.checked)});
function massDuplicate(ids){
  if(worldReadOnly())return;
  if(typeof udNetPlayerLive==='function'&&udNetPlayerLive()){
    const media=[...ids].flatMap(id=>entityMedia(getEntity(id)).map(m=>m.id)),missing=media.filter(id=>!udNetOriginalAvailable(id));
    if(missing.length){const zone=currentWorkspace()?.id;toast('Загружаются оригиналы для копирования…','ok');return udNetEnsureOriginals(missing).then(()=>{if(currentWorkspace()?.id===zone&&!worldReadOnly())return massDuplicate(ids)}).catch(error=>toast(error.message,'err'))}
  }
const snap=snapshotWorkspaceMutation(),createdMediaIds=[],list=[...new Set(ids)].map(getEntity).filter(Boolean),map=new Map(),selectedOriginalIds=new Set(list.map(e=>e.id)),originalParent=new Map(list.map(e=>[e.id,containmentParent(e.id)]));try{for(const e of list){const c=clone(e);c.id=uid('entity');c.name=(e.name||'Безымянная')+' — копия';c.style=c.style||{};c.style.x=(Number(c.style.x)||0)+55;c.style.y=(Number(c.style.y)||0)+55;cloneEntityMediaBindings(e,c,createdMediaIds);map.set(e.id,c);data.entities.push(c)}const chosen=list.map(e=>map.get(e.id));for(const r of [...data.relations])if(map.has(r.from)&&map.has(r.to)){const nr=clone(r);nr.id=uid('relation');nr.from=map.get(r.from).id;nr.to=map.get(r.to).id;data.relations.push(nr)}for(const original of list){const c=map.get(original.id),parent=originalParent.get(original.id);if(!parent||!selectedOriginalIds.has(parent))addContainmentSilent(c.id,parent||state.scopeId)}udPlaceEntityCopies(map);state.selectedIds=new Set(chosen.map(e=>e.id));state.selectedId=chosen[0]?.id||null;state.viewVersion++;if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);for(const id of createdMediaIds){try{UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}catch{}}updateUI();toast('Не удалось сохранить копирование — состояние восстановлено','err');return}updateUI();toast(`Создано копий: ${chosen.length}`,'ok')}catch(error){restoreWorkspaceMutation(snap.data,snap.state);for(const id of createdMediaIds){try{UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}catch{}}updateUI();toast(error?.message||'Не удалось скопировать сущность','err')}}
function addContainmentSilent(childId,parentId){
  if(worldReadOnly())return false;
const child=getEntity(childId),parent=getEntity(parentId);if(!child||!parent||wouldCreateContainmentCycle(parentId,childId))return false;if(childId===currentRootId()&&parentId!==childId)return false;if(Object.values(currentWorkspace()?.boards||{}).some(b=>b.placements?.items.some(p=>p.entityId===childId)))return !!addContainment(childId,parentId,{force:true,persist:false});boardRebaseFixed(child,parentId);const rt=ensureContainsType();replaceActiveRelations(data.relations.filter(r=>!(getRT(r.type).containment&&r.to===childId&&(!r.udMembership||r.from===parentId))));data.relations.push({id:uid('relation'),from:parentId,to:childId,type:rt.id,properties:{},style:{}});parent.style=parent.style||{};parent.style.space=true;return true}
function commitMassEdit(mutator){
  if(worldReadOnly())return 'failed';
const snap=snapshotWorkspaceMutation(),before=dataSnapshot();mutator();state.viewVersion++;if(dataSnapshot()===before)return 'unchanged';if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить массовое изменение — состояние восстановлено','err');return 'failed'}updateUI();return 'saved'}
function addContainment(childId,parentId,opts={}){
  if(worldReadOnly())return false;

  const child=getEntity(childId),parent=getEntity(parentId);
  if(!child||!parent||childId===parentId){toast('Нельзя поместить объект внутрь самого себя','err');return false}
  // The workspace root is a structural anchor; moving it under another entity
  // would invalidate root navigation and workspace semantics.
  if(childId===currentRootId()&&parentId!==childId){toast('Нельзя вложить корневую сущность в другой объект','err');return false}
  if(wouldCreateContainmentCycle(parentId,childId,opts.excludeRelationId)){toast('Нельзя создать циклическую вложенность','err');return false}
  const current=containmentParent(childId);
  const addressed=Object.values(currentWorkspace()?.boards||{}).some(b=>b.placements?.items.some(p=>p.entityId===childId));
  if(current===parentId&&!opts.force&&!addressed){
    return opts.relationId?data.relations.find(r=>r.id===opts.relationId)||data.relations.find(r=>getRT(r.type).containment&&r.from===parentId&&r.to===childId)||false:false;
  }
  const before=clone(data),snap=snapshotMutationState();
  const revealLegacy=state.visualMode==='detective'&&parentId!==state.scopeId&&!udBoardUsesPlacements()&&boardLayout().positions.has(parentId);
  let moved;
  if(addressed){
    try{moved=udReparentForRelation(childId,parentId,{relationId:opts.relationId})}catch(error){moved=false}
    if(!moved){restoreWorkspaceMutation(before,snap);toast('Не удалось переместить бумажку. Проверьте закрепление и вместимость контейнера.','err');return false}
    state.viewVersion++;
    if(opts.persist!==false&&!persist()){restoreWorkspaceMutation(before,snap);updateUI();return false}
    return moved;
  }
  boardRebaseFixed(child,parentId);
  const rt=ensureContainsType();
  const existing=opts.relationId?data.relations.find(r=>r.id===opts.relationId):null;
  // Remove the child's previous parent link and the edited relation itself, then reinsert one canonical relation.
  const kept=data.relations.filter(r=>{
    if(existing&&r.id===existing.id)return false;
    return !(getRT(r.type).containment&&r.to===childId&&(!r.udMembership||r.from===parentId));
  });
  const rr=existing||{id:uid('relation')};
  delete rr.udMembership;rr.from=parentId;rr.to=childId;rr.type=rt.id;rr.properties=rr.properties||{};rr.style=rr.style||{};
  kept.push(rr);
  // Preserve every non-containment relation verbatim; only the child's parent link changes.
  replaceActiveRelations(kept);
  parent.style=parent.style||{};parent.style.space=true;
  if(revealLegacy)boardState(boardKey(),true).open[parentId]||='one';
  state.viewVersion++;
  if(opts.persist!==false&&!persist()){data=before;normalize();state.viewVersion++;return false}
  return rr;
}
function setContainmentParentForDrag(childId,parentId){
  const child=getEntity(childId);if(!child||childId===currentRootId())return false;
  const current=containmentParent(childId);if(current===parentId)return true;
  if(parentId&&wouldCreateContainmentCycle(parentId,childId))return false;
  if(parentId){return !!addContainment(childId,parentId,{force:true,persist:false});}
  if(udUsesSharedLayout())return !!addContainment(childId,currentRootId(),{force:true,persist:false});
  const kept=data.relations.filter(r=>!(getRT(r.type).containment&&!r.udMembership&&r.to===childId));
  boardRebaseFixed(child,null);
  replaceActiveRelations(kept);state.viewVersion++;return true;
}
function reorderWithinParent(sourceId,targetId,before=true){
  if(!sourceId||!targetId||sourceId===targetId)return false;
  const source=getEntity(sourceId),target=getEntity(targetId);if(!source||!target)return false;
  const sourceParent=containmentParent(sourceId),targetParent=containmentParent(targetId);
  if(sourceParent!==targetParent)return false;
  if(sourceId===currentRootId())return false;
  if(sourceParent){
    const ids=containmentChildren(sourceParent).filter(id=>id!==sourceId);
    const idx=ids.indexOf(targetId);if(idx<0)return false;
    ids.splice(before?idx:idx+1,0,sourceId);
    const idSet=new Set(ids);
    const rels=data.relations.filter(r=>getRT(r.type).containment&&r.from===sourceParent&&idSet.has(r.to));
    const relByChild=new Map(rels.map(r=>[r.to,r]));
    const others=data.relations.filter(r=>!(getRT(r.type).containment&&r.from===sourceParent&&idSet.has(r.to)));
    replaceActiveRelations([...others,...ids.map(id=>relByChild.get(id)).filter(Boolean)]);
  }else{
    const ids=scopeMembers().map(e=>e.id).filter(id=>id!==sourceId);
    const idx=ids.indexOf(targetId);if(idx<0)return false;
    ids.splice(before?idx:idx+1,0,sourceId);
    const idSet=new Set(ids), ordered=ids.map(id=>getEntity(id)).filter(Boolean);
    const slots=[];for(let i=0;i<data.entities.length;i++)if(idSet.has(data.entities[i].id))slots.push(i);
    if(slots.length!==ordered.length)return false;
    const next=data.entities.slice();for(let i=0;i<slots.length;i++)next[slots[i]]=ordered[i];
    replaceActiveEntities(next);
  }
  state.viewVersion++;return true;
}

// 0.23.8: «Положить в…» — put the record (or every selected record) inside another one from any mode, without dragging.
// One Ctrl+Z returns all of them. A record cannot go inside itself or its own contents (the list does not offer them).
function moveIntoTargets(ids){const bad=new Set(ids),stack=[...ids];while(stack.length){const id=stack.pop();for(const c of containmentChildren(id)){if(!bad.has(c)){bad.add(c);stack.push(c)}}}return data.entities.filter(e=>!bad.has(e.id))}
function moveIntoCommit(ids,parentId){
  if(worldReadOnly())return false;

  const parent=getEntity(parentId);if(!parent)return false;const before=clone(data),snap=snapshotMutationState();let moved=0;
  for(const id of ids){if(containmentParent(id)===parentId&&!Object.values(currentWorkspace()?.boards||{}).some(b=>b.placements?.items.some(p=>p.entityId===id)))continue;if(addContainment(id,parentId,{persist:false}))moved++;else{restoreWorkspaceMutation(before,snap);state.viewVersion++;return false}}
  if(!moved){toast('Уже внутри «'+parent.name+'»');return false}
  state.viewVersion++;if(!persist()){restoreWorkspaceMutation(before,snap);toast('Не удалось сохранить — ничего не изменилось','err');return false}
  updateUI();toast(moved===1?`«${getEntity(ids[0])?.name}» теперь внутри «${parent.name}» · Ctrl+Z — отменить`:`${moved} ${plural(moved,'сущность','сущности','сущностей')} теперь внутри «${parent.name}» · Ctrl+Z — отменить`,'ok');return true;
}
function openMoveIntoPicker(id){
  if(worldReadOnly())return;

  const ids=state.selectedIds.has(id)&&state.selectedIds.size>1?[...state.selectedIds]:[id];const first=getEntity(ids[0]);if(!first)return;
  const title=ids.length>1?`Положить ${ids.length} ${plural(ids.length,'сущность','сущности','сущностей')} в…`:`Положить «${first.name}» в…`;
  openModal(title,`<div class="form"><input id="moveIntoSearch" placeholder="Куда положить: название сущности…" autocomplete="off"><div class="boardPinList" id="moveIntoList"></div><div class="inlineHelp">Сущность перейдёт внутрь выбранной вместе со всем, что лежит в ней самой. Ctrl+Z — вернуть.</div></div>`,'<button class="btn" id="cancelModal">Закрыть</button>');
  const targets=moveIntoTargets(ids),cur=ids.length===1?containmentParent(ids[0]):null;
  const draw=()=>{const q=searchFold(($('#moveIntoSearch')?.value||'').trim());const list=targets.filter(e=>!q||entitySearchText(e).includes(q)).sort((a,b)=>(isSpace(b)-isSpace(a))||String(a.name).localeCompare(String(b.name),'ru')).slice(0,50);
    $('#moveIntoList').innerHTML=list.length?list.map(e=>`<button type="button" class="listItem boardPinItem${e.id===cur?' current':''}" data-move-into="${escapeHtml(e.id)}"><span class="listIcon">${escapeHtml(getET(e.type).icon||'•')}</span><span class="listMeta"><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.type?getET(e.type).name:'Заметка')}${containmentParent(e.id)?' · в «'+escapeHtml(getEntity(containmentParent(e.id))?.name||'')+'»':''}${e.id===cur?' · сейчас здесь':''}</small></span></button>`).join(''):'<div class="inlineHelp">Ничего не найдено</div>'};
  draw();$('#moveIntoSearch').addEventListener('input',draw);$('#moveIntoSearch').focus();
  $('#moveIntoList').addEventListener('click',ev=>{const b=ev.target.closest('[data-move-into]');if(!b)return;closeModal();moveIntoCommit(ids,b.dataset.moveInto)});
  $('#cancelModal').onclick=closeModal;
}

