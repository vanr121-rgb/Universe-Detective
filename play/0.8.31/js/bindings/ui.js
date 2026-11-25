// Universe Graph — Привязки: общий маршрутизатор кликов, панели, кнопки видов, поиск, правая панель.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
document.addEventListener('click',e=>{const t=e.target instanceof Element?e.target:null;if(!t)return;if(!t.closest('#contextMenu')&&!t.closest('#workspacePop')&&!t.closest('#workspaceBtn')){hideContextMenu();if(!t.closest('#workspacePop'))hideWorkspacePopup()}if(t.closest('#workspaceBtn')){e.preventDefault();toggleWorkspacePopup();return}if(t.closest('#contextMenu')){const cm=t.closest('[data-cm]');if(!cm)return;const menu=$('#contextMenu'),kind=menu.dataset.kind,id=menu.dataset.id,boardAt=contextMenuBoardAt;hideContextMenu();if(worldReadOnly()&&!READ_ONLY_CONTEXT_ACTIONS.has(cm.dataset.cm))return;if(kind==='entity'){const ent=getEntity(id);if(!ent)return;switch(cm.dataset.cm){case'space':{const paperId=menu.dataset.paperId;if(paperId&&menu.dataset.paperScope===boardKey()&&menu.dataset.paperWorkspace===currentWorkspace()?.id)setScope(id,{paperId});else{setSelected(id,false);enterSelected()}break;}case'edit':openEntityModal(id);break;case'focus':boardCenterOn([id]);break;case'relations':state.showExternal=true;setSelected(id,false);break;case'relation':{const r=menu.getBoundingClientRect();openLinkPicker(id,null,r.left,r.top);break}case'move-paper':{const paperId=menu.dataset.paperId;if(state.visualMode==='detective'&&menu.dataset.paperScope===boardKey()&&menu.dataset.paperWorkspace===currentWorkspace()?.id&&boardState().placements?.items.some(p=>p.id===paperId&&p.entityId===id))udOpenPaperTransfer(paperId);break}case'move':openMoveIntoPicker(id);break;case'duplicate':massDuplicate([id]);break;case'merge':openMergeDialog(id);break;case'merge2':{const o=[...state.selectedIds].find(x=>x!==id);openMergeDialog(id,o);break}case'offboard':toggleOffBoard(id);break;case'id':{const copyPromise=navigator.clipboard?.writeText?.(ent.id);if(copyPromise&&typeof copyPromise.catch==='function')copyPromise.then(()=>toast('ID скопирован','ok')).catch(()=>toast('Не удалось скопировать ID','err'));else toast('Буфер обмена недоступен','err');break;}case'remove-paper':case'delete-paper':{udRemoveAddressedPaper(id,menu.dataset.paperId,menu.dataset.paperScope,menu.dataset.paperWorkspace,cm.dataset.cm==='delete-paper');break}case'delete':if(state.selectedIds.size>1&&state.selectedIds.has(id))deleteEntities([...state.selectedIds]);else confirmDeleteEntity(id);break}}else if(kind==='relation'){const rel=data.relations.find(r=>r.id===id);if(!rel)return;switch(cm.dataset.cm){case'edit':openRelationModal(id);break;case'focus-rel':boardCenterOn([rel.from,rel.to]);break;case'thread-auto':udResetThreadRoutes(id);break;case'from':setSelected(rel.from,false);break;case'to':setSelected(rel.to,false);break;case'duplicate-rel':{const before=clone(data),beforeSelectedRelationId=state.selectedRelationId;const nr=clone(rel);nr.id=uid('relation');data.relations.push(nr);state.selectedRelationId=nr.id;if(!persist()){data=before;state.selectedRelationId=beforeSelectedRelationId;normalize();updateUI();toast('Не удалось сохранить копирование связи — состояние восстановлено','err');return}updateUI();toast('Копия связи создана','ok');break}case'delete-rel':{const before=clone(data);replaceActiveRelations(data.relations.filter(r=>r.id!==id));if(!persist()){data=before;normalize();updateUI();toast('Не удалось удалить связь — состояние восстановлено','err');return}state.selectedRelationId=null;updateUI();toast('Связь удалена','ok');break}}}else{switch(cm.dataset.cm){case'new-entity':openEntityModal(null,{boardAt});break;case'new-relation':openRelationModal();break;case'fit':fitView();break;case'reset':resetView();break}}return}if(t.closest('[data-action]')&&t.closest('#selectionActions')){const a=t.closest('[data-action]');if(['mass-edit','mass-duplicate','mass-delete'].includes(a.dataset.action)){if(a.dataset.action==='mass-edit')openMassEdit();else if(a.dataset.action==='mass-duplicate')massDuplicate([...state.selectedIds]);else deleteEntities([...state.selectedIds]);return;}}if(t.closest('[data-widget-delete]')&&state.selectedId){const wid=t.closest('[data-widget-delete]').dataset.widgetDelete,e=getEntity(state.selectedId);if(e){const before=clone(data);e.widgets=(e.widgets||[]).filter(w=>w.id!==wid);if(!persist()){data=before;normalize();updateUI();toast('Не удалось удалить блок — состояние восстановлено','err');return}updateUI();toast('Блок удалён','ok')}return;}},false);
document.addEventListener('contextmenu',e=>{if(!e.target.closest('#contextMenu')&&!e.target.closest('#graphCanvas')&&!e.target.closest('#outlineView')&&!e.target.closest('#treeView')&&!e.target.closest('#galaxyView')&&!e.target.closest('#detectiveView')&&!e.target.closest('#tableView'))hideContextMenu()});window.addEventListener('resize',()=>{hideWorkspacePopup();hideContextMenu();applyPanelWidths()});
document.addEventListener('click',e=>{if(e.target.closest('.secTool'))return;const head=e.target.closest('.section[data-panel] .sectionToggle');if(head){head.parentElement.classList.toggle('collapsed');saveUIPrefs()}},true);

// Stable delegated handlers for the dynamic inspector folds. These survive every innerHTML rebuild.
$('#entityPanel').addEventListener('click',e=>{const fold=e.target.closest('[data-fold]');if(fold){e.preventDefault();e.stopPropagation();toggleInspectorFold(fold.dataset.fold)}},{capture:true});
$('#relationPanel').addEventListener('click',e=>{const fold=e.target.closest('[data-fold]');if(fold){e.preventDefault();e.stopPropagation();toggleInspectorFold(fold.dataset.fold)}},{capture:true});

$('#graphViewBtn').onclick=()=>setVisualMode('graph');$('#outlineViewBtn').onclick=()=>setVisualMode('outline');$('#treeViewBtn').onclick=()=>setVisualMode('tree');$('#galaxyViewBtn').onclick=()=>setVisualMode('galaxy');$('#detectiveViewBtn').onclick=()=>setVisualMode('detective');$('#tableViewBtn').onclick=()=>setVisualMode('table');$('#kanbanViewBtn').onclick=()=>setVisualMode('kanban');$('#relationVisibilityBtn').onclick=()=>{state.showRelations=!state.showRelations;updateUI();saveUIPrefs();};

$('#focusRadius').oninput=e=>{state.focusRadius=Number(e.target.value);state.viewVersion=(state.viewVersion||0)+1;updateUI()};$('#hideFar').onchange=e=>{state.hideFar=e.target.checked;state.viewVersion=(state.viewVersion||0)+1;updateUI()};
$('#globalSearch').addEventListener('input',e=>{state.search=e.target.value.trim();renderSearch(state.search);updateUI()});$('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();state.search='';e.target.value='';renderSearch('');updateUI()}if(e.key==='Enter'){const r=searchResults(state.search);const first=r.entities[0];if(first){clearSearchQuery();if(revealEntity(first.id))$('#searchResults').classList.remove('open')}}});
$$('.modeBtn[data-mode]').forEach(b=>b.onclick=()=>{const mode=b.dataset.mode;if(mode==='dive'){state.enterOnClick=!state.enterOnClick;state.mode='explore';updateModes();updateUI();toast(state.enterOnClick?'Dive включён: ЛКМ по пространству — вход':'Dive выключен: ЛКМ выбирает, drag перемещает','ok');return}state.mode=mode;if(state.mode!=='trace'){state.traceStart=null;state.traceEnd=null;state.focusedPath=[]}updateModes();updateUI();toast(state.mode==='explore'?'Explore':'Trace: Shift+клик по двум узлам','ok')});
$('#breadcrumbs').addEventListener('click',e=>{const c=e.target.closest('[data-id]');if(!c||c.dataset.id===state.scopeId)return;setScope(c.dataset.id,{push:true,center:true})});
  // One robust event router for the entire right inspector. The inspector is
  // frequently rebuilt with innerHTML, so no handler is attached directly to
  // dynamic child buttons. Capture phase also protects the UI from accidental
  // overlays/z-index interactions elsewhere in the canvas.
  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;
    if(!target)return;

    // Right inspector: folds, tree toggles, relation rows and entity actions.
    if(target.closest('.right')){
      const backBtn=target.closest('[data-inspector-back]');
      if(backBtn){e.preventDefault();e.stopPropagation();state.inspectorMode='overview';state.lastInspectorMode='overview';updateUI();return}
      const infoBtn=target.closest('[data-open-info]');
      if(infoBtn){e.preventDefault();e.stopPropagation();state.inspectorMode='info';state.lastInspectorMode='info';updateUI();return}
      const fold=target.closest('[data-fold]');
      if(fold){
        e.preventDefault(); e.stopPropagation();
        toggleInspectorFold(fold.dataset.fold);
        return;
      }
      const tree=target.closest('[data-tree-toggle]');
      if(tree){
        e.preventDefault(); e.stopPropagation();
        if(tree.disabled)return;
        const id=tree.dataset.treeToggle;
        if(id){
          if(state.relationTreeExpanded.has(id))state.relationTreeExpanded.delete(id);else state.relationTreeExpanded.add(id);
          renderEntityPanel(state.selectedId?getEntity(state.selectedId):getEntity(state.scopeId));
        }
        return;
      }
      const relationItem=target.closest('[data-relation-id]');
      if(relationItem){
        e.preventDefault(); e.stopPropagation();
        const rel=data.relations.find(x=>x.id===relationItem.dataset.relationId);
        if(rel){state.selectedRelationId=rel.id;state.selectedId=null;state.inspectorMode='info';state.lastInspectorMode='info';updateUI()}
        return;
      }
      const action=target.closest('[data-action]');
      if(action&&action.closest('#selectionActions')){
        e.preventDefault(); e.stopPropagation();
        if(action.disabled)return;
        const actionName=action.dataset.action;
        if(actionName==='mass-edit'){openMassEdit();return}
        if(actionName==='mass-duplicate'){massDuplicate([...state.selectedIds]);return}
        if(actionName==='mass-offboard'){const ids=[...state.selectedIds],on=!ids.every(id=>entityOffBoard(getEntity(id))),n=setEntitiesOffBoard(ids,on);if(n)toast(on?`Убрано с доски: ${n}. Сущности не удалены`:`Снова на доске: ${n}`,'ok');return}
        if(actionName==='mass-delete'){deleteEntities([...state.selectedIds]);return}
        const sel=state.selectedId?getEntity(state.selectedId):null;
        if(!sel)return;
        switch(actionName){
          case 'enter': enterSelected(); break;
          case 'offboard': toggleOffBoard(sel.id);break;
          case 'focus': boardCenterOn([sel.id]);break;
          case 'edit': openEntityModal(sel.id);break;
          case 'relation': {const r=action.getBoundingClientRect();openLinkPicker(sel.id,null,r.left,r.top);break}
          case 'pin': {
            const before=clone(data);
            sel.style.pinned=!sel.style.pinned;
            if(!persist()){data=before;normalize();updateUI();toast('Не удалось сохранить состояние закрепления — состояние восстановлено','err');return}
            updateUI();
            break;
          }
          case 'delete-paper': udRemoveAddressedPaper(sel.id,udSelectedPaperId(),boardKey(),currentWorkspace()?.id,true);break;
          case 'delete': confirmDeleteEntity(sel.id);break;
        }
        return;
      }
      const relAction=target.closest('[data-relation-action]');
      if(relAction&&relAction.closest('#relationPanel')){
        e.preventDefault(); e.stopPropagation();
        const rel=state.selectedRelationId?data.relations.find(x=>x.id===state.selectedRelationId):null;
        if(!rel)return;
        if(relAction.dataset.relationAction==='edit')openRelationModal(rel.id);
        return;
      }
      const related=target.closest('[data-related]');
      if(related){
        e.preventDefault(); e.stopPropagation();
        const id=related.dataset.related,targetEntity=getEntity(id);
        if(targetEntity){setSelected(id,false)}
        return;
      }
    }
  });

$('#entityPanel').addEventListener('dblclick',e=>{const item=e.target.closest('[data-related]');if(item){const id=item.dataset.related;setSelected(id,false);const target=getEntity(id);if(isSpace(target)){enterSelected()}else{state.showExternal=true;state.panX=-(target.style.x||0);state.panY=-(target.style.y||0);updateUI()}}});
