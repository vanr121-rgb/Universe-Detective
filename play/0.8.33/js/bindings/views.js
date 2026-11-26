// Universe Detective — привязки доски: бумажки перекладываются мышью, фон — панорама, колесо — масштаб, правый щелчок — меню.
// (В Universe Graph здесь же — клики, колесо и перетаскивание Outline, Tree и Galaxy; в UD их нет.)
'use strict';
bindViewStrip(); // 0.23.7: the mode strip (Tree's «Развернуть/Свернуть всё» moved there)

// Detective (0.17.5): бумажки перекладываются мышью, фон — панорама, колесо — масштаб.
{
  const view=$('#detectiveView');
  const selectRelation=id=>selectRelationById(id);
  view.addEventListener('click',e=>{
    const action=e.target.closest('[data-ud-duplicate],[data-ud-paper-remove],[data-ud-paper-lock],[data-ud-paper-open],[data-ud-paper-find],[data-ud-paper-transfer],[data-ud-paper-related],[data-ud-paper-contents]');
    if(action){
      e.preventDefault();e.stopPropagation();
      const card=action.closest('[data-board-id]'),id=card?.dataset.udPaperId;
      if(!card)return;
      if(action.hasAttribute('data-ud-duplicate'))udDuplicatePaper(card.dataset.boardId,id);
      else if(id&&action.hasAttribute('data-ud-paper-remove'))udRemovePaper(id);
      else if(id&&action.hasAttribute('data-ud-paper-lock'))udTogglePaperLock(id,card);
      else if(id&&action.hasAttribute('data-ud-paper-find'))udOpenPaperPicker(card.dataset.boardId,id);
      else if(id&&action.hasAttribute('data-ud-paper-related'))udOpenPaperRelated(id);
      else if(id&&action.hasAttribute('data-ud-paper-transfer'))udOpenPaperTransfer(id);
      else if(action.hasAttribute('data-ud-paper-contents'))udOpenPaperContents(id||null);
      else if(id)udExpandPaper(id,action.dataset.udPaperOpen);
      return;
    }
    // 0.23.6: the bar on a folder card — open / close a case, related records, lay out; unpin; pin from elsewhere
    const fixed=e.target.closest('[data-board-fixed]');
    if(fixed){e.preventDefault();e.stopPropagation();const id=fixed.dataset.boardFixed;boardToggleFixed(id);view.querySelector(`[data-board-fixed="${CSS.escape(id)}"]`)?.focus({preventScroll:true});return}
    const cb=e.target.closest('[data-board-open],[data-board-related],[data-board-case-layout],[data-board-unpin],[data-board-pin-open]');
    if(cb){e.preventDefault();e.stopPropagation();if(cb.dataset.boardOpen){const id=cb.dataset.boardOpen;if(boardOpenCase(id,cb.dataset.mode)&&state.selectedId!==id)setSelected(id)}else if(cb.dataset.boardRelated)boardToggleRelated(cb.dataset.boardRelated);else if(cb.dataset.boardCaseLayout)boardLayoutCase(cb.dataset.boardCaseLayout);else if(cb.dataset.boardUnpin)boardUnpin(cb.dataset.boardUnpin);else boardOpenPinPicker();return}
    const b=e.target.closest('[data-board-fit],[data-board-arrange],[data-board-red]');if(!b)return;e.preventDefault();e.stopPropagation();
    if(b.hasAttribute('data-board-fit'))boardFit();else if(b.hasAttribute('data-board-arrange'))boardArrange();else boardToggleRed();
  });
  const knownPaper=element=>element?.closest?.('[data-ud-paper-id][tabindex]');
  function highlightCopies(card){
    const id=card?.dataset.boardId;
    const matches=id?view.querySelectorAll(`[data-ud-paper-id][tabindex][data-board-id="${CSS.escape(id)}"]`):[];
    view.querySelectorAll('.udPaperPeer').forEach(other=>other.classList.remove('udPaperPeer'));
    if(matches.length>1)for(const other of matches)if(other!==card)other.classList.add('udPaperPeer');
  }
  for(const type of ['pointerover','focusin'])view.addEventListener(type,e=>{
    const card=knownPaper(e.target);
    if(card!==knownPaper(e.relatedTarget))highlightCopies(card);
  });
  for(const type of ['pointerout','focusout'])view.addEventListener(type,e=>{
    if(knownPaper(e.target)!==knownPaper(e.relatedTarget))highlightCopies(knownPaper(e.relatedTarget));
  });
  for(const type of ['pointerover','pointerout'])view.addEventListener(type,e=>{
    const hit=e.target.closest?.('.boardStringHit');
    if(!hit||hit===e.relatedTarget?.closest?.('.boardStringHit'))return;
    const label=boardThreadCaption(hit.closest('.boardStage'),hit.dataset.boardThread);
    label?.classList.toggle('threadHovered',type==='pointerover');
  });
  view.addEventListener('wheel',e=>{if(e.target.closest('.udDetails'))return;e.preventDefault();if(state.visualMode!=='detective')return;boardZoomFocus(e.deltaY<0?1.12:1/1.12,e.clientX,e.clientY)},{passive:false});
  const editableTarget=t=>t.closest?.('input,textarea,select,label,[contenteditable]:not([contenteditable=false]),.udEditor');
  const boardResizeHandleAt=e=>{
    if(editableTarget(e.target))return null;
    return e.target.closest?.('[data-board-resize]')||(e.target.closest?.('[data-board-rel]')?
      document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.matches?.('[data-board-resize]')):null);
  };
  // 0.23.8: the corner of a card changes its size on this board (the left edge stays); double click — the usual size again.
  view.addEventListener('pointerdown',e=>{
    // a thread's click area may lie over the corner — the corner under it still wins (like cards since 0.23.6)
    const hd=e.button===0&&!state.space&&state.visualMode==='detective'?boardResizeHandleAt(e):null;if(!hd)return;
    e.preventDefault();e.stopImmediatePropagation();const id=hd.dataset.boardResize,card=hd.closest('.boardCard'),paperId=card?.dataset.udPaperId,ent=getEntity(id),p=boardLayout().positions.get(paperId||id),scope=boardKey(),workspace=currentWorkspace()?.id;if(!card||!ent||!p)return;
    const z=state.boardZoom||1,w0=card.offsetWidth,h0=card.offsetHeight,left=p.x-w0/2,sx=e.clientX,sy=e.clientY;let w=w0,h=h0,moved=false;card.classList.add('resizing');
    const move=ev=>{if(ev.pointerId!==e.pointerId)return;w=clamp(w0+(ev.clientX-sx)/z,BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w);h=clamp(h0+(ev.clientY-sy)/z,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h);moved=moved||Math.hypot(ev.clientX-sx,ev.clientY-sy)>3;card.style.width=w+'px';card.style.minHeight=h+'px';card.style.left=(left+w/2)+'px';card.classList.toggle('small',w<170||h<110)};
    const finish=ev=>{
      if(ev.pointerId!==e.pointerId)return;
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',finish);
      window.removeEventListener('pointercancel',finish);
      card.classList.remove('resizing');
      if(ev.type==='pointercancel'||scope!==boardKey()||workspace!==currentWorkspace()?.id){renderDetective();return}
      if(!moved)return;
      if(paperId){if(!udResizePaper(paperId,{w,h},(w-w0)/2))renderDetective();return}
      boardCommit(()=>{boardSetPlace(ent,{x:left+w/2,y:p.y});boardSetSize(ent,{w,h},{x:left+w/2,y:p.y})},'Размер изменён · Ctrl+Z — вернуть');
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);
  },true);
  view.addEventListener('dblclick',e=>{
    const hd=boardResizeHandleAt(e);if(!hd)return;e.preventDefault();e.stopImmediatePropagation();
    const paperId=hd.closest('[data-ud-paper-id]')?.dataset.udPaperId;
    if(paperId){udResizePaper(paperId,null);return}
    const ent=getEntity(hd.dataset.boardResize),p=boardLayout().positions.get(ent?.id);if(!ent||!p||!boardSize(ent))return;
    boardCommit(()=>boardSetSize(ent,null,{x:p.x,y:p.y}),'Обычный размер · Ctrl+Z — вернуть');
  },true);
  view.addEventListener('pointerdown',e=>{
    if(state.boardDrag||state.visualMode!=='detective')return;
    const spacePan=e.button===0&&state.space&&!boardThreadKeyboardTarget(e.target)&&!editableTarget(e.target);
    if(e.button===1||spacePan){
      e.preventDefault();
      boardCancelQueuedCamera();
      state.boardDrag={kind:'pan',middle:e.button===1,boardKey:boardCameraKey(),pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,
        panX:state.boardPanX||0,panY:state.boardPanY||0,moved:false};
      view.setPointerCapture?.(e.pointerId);
      return;
    }
    if(e.button!==0||editableTarget(e.target)||e.target.closest('button,input,select,textarea,.boardToolbar,.udDetails,a,[data-ud-status],.boardCard.selected :is(.boardKind,.boardFolderTab)'))return; /* UD: these open menus on click — no drag and no pointer capture (a captured click lands on the board, not on them) */
    boardCancelQueuedCamera();
    // 0.23.6: a thread that crosses a card does not steal the card — the card under the thread wins
    const hit=e.target.closest('[data-board-rel]');
    const card=e.target.closest('[data-board-id]')||(hit&&document.elementsFromPoint(e.clientX,e.clientY)
      .map(el=>el.closest?.('[data-board-id]')).find(Boolean));
    if(!card&&hit){selectRelation(hit.dataset.boardRel);return}
    if(card){
      const paperId=card.dataset.udPaperId;
      if(paperId){
        if(worldReadOnly())return;
        const board=boardState().placements,scene=card.parentElement?._boardSelection;
        const layout=scene?.source===board&&scene?.version===state.viewVersion&&scene?.key===boardCameraKey()
          ?scene.layout:boardLayout();
        const paper=layout.keys?.get(paperId);
        if(!paper)return;
        state.boardDrag={kind:'paper',id:paperId,entityId:paper.entityId,scope:boardKey(),workspace:currentWorkspace()?.id,
          board,original:{...paper},locked:paper.virtual||paper.locked,udEdit:e.target.closest('[data-ud-edit]')?.dataset.udEdit,
          world:boardWorldPoint(e.clientX,e.clientY),
          x:paper.x,y:paper.y,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false};
        view.setPointerCapture?.(e.pointerId);return;
      }
      if(udBoardUsesPlacements()){setSelected(card.dataset.boardId);return}
      const id=card.dataset.boardId,layout=boardLayout();
      const ids=state.selectedIds.has(id)&&state.selectedIds.size>1?[...state.selectedIds].filter(x=>layout.positions.has(x)):[id];
      // 0.23.6: an open case is carried together with everything laid out under it
      for(const top of [...ids])if(boardState().open[top])for(const [nid,v] of layout.via){let p=v,guard=0;while(p&&guard++<50){if(p.parent===top||p.top===top){if(!ids.includes(nid))ids.push(nid);break}p=layout.via.get(p.parent)}}
      const initial=ids.filter(id=>!layout.positions.get(id)?.fixed);
      const moving=new Set(initial);
      let added=true;
      while(added){
        added=false;
        for(const [id,p] of layout.positions){
          if(p.fixedParent&&moving.has(p.fixedParent)&&!moving.has(id)){moving.add(id);added=true}
        }
      }
      state.boardDrag={kind:'card',scope:boardKey(),workspace:currentWorkspace()?.id,locked:!!layout.positions.get(id)?.fixed,udEdit:e.target.closest('[data-ud-edit]')?.dataset.udEdit||'',id,ids:[...moving],layout,start:new Map([...moving].map(x=>[x,{...layout.positions.get(x)}])),world:boardWorldPoint(e.clientX,e.clientY),pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false,additive:e.ctrlKey||e.metaKey};
    }else state.boardDrag={kind:'pan',boardKey:boardCameraKey(),pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,panX:state.boardPanX||0,panY:state.boardPanY||0,moved:false};
    view.setPointerCapture?.(e.pointerId);
  });
  view.addEventListener('pointermove',e=>{
    const d=state.boardDrag;if(!d||e.pointerId!==d.pointerId||(d.kind!=='pan'&&(worldReadOnly()||d.locked)))return;
    if(d.kind==='pan'&&d.boardKey!==boardCameraKey()){end(e,true);return}
    if(d.middle&&!(e.buttons&4)){end(e);return}
    if(d.kind==='paper'){
      const board=d.board;
      if(!udRebasePaperDrag(d)){d.invalidated=true;renderDetective();return}
      if(board!==d.board&&d.moved)renderDetective();
      if(d.invalidated)return;
    }
    d.pointer={x:e.clientX,y:e.clientY};
    const dx=e.clientX-d.startX,dy=e.clientY-d.startY;if(!d.moved&&Math.hypot(dx,dy)<4)return;
    const firstMove=!d.moved;
    if(firstMove&&d.kind==='paper'){
      // A tap needs only the rendered paper. Compute a fresh scene and the
      // movable subtree after crossing the drag threshold.
      const layout=boardLayout();
      if(!layout.keys?.has(d.id)){d.invalidated=true;end(e,true);return}
      const children=udPlacementChildren(layout.keys.values()),ids=[d.id];
      for(let i=0;i<ids.length;i++)for(const item of children.get(ids[i])||[])ids.push(item.id);
      d.layout=layout;d.ids=ids;d.start=new Map(ids.map(id=>[id,{...layout.positions.get(id)}]));
    }
    if(firstMove){d.moved=true;view.classList.add(d.kind==='pan'?'panning':'moving');if(d.kind==='card')for(const id of d.ids)view.querySelector(`[data-board-id="${CSS.escape(id)}"]`)?.classList.add('dragging')}
    e.preventDefault();
    if(d.kind==='pan'){state.boardPanX=d.panX+dx;state.boardPanY=d.panY+dy;boardSchedulePanTransform(view,d.boardKey);return}
    const w=boardWorldPoint(e.clientX,e.clientY),mx=w.x-d.world.x,my=w.y-d.world.y;
    // The candidate is a stationary card. Read the hit stack before writing
    // any card or SVG geometry, and skip the whole moving group in either pose.
    const key=d.kind==='paper'?'udPaperId':'boardId';
    const selector=d.kind==='paper'?'[data-ud-paper-id]':'[data-board-id]';
    const over=document.elementsFromPoint(e.clientX,e.clientY).map(el=>el.closest?.(selector))
      .find(c=>c&&!d.ids.includes(c.dataset[key]));
    const oid=over?.dataset[key]||null;
    for(const id of d.ids){const s=d.start.get(id),p=d.layout.positions.get(id);if(s&&p){p.x=s.x+mx;p.y=s.y+my}}
    boardMoveCards(d.layout,d.ids);
    if(d.kind==='paper'){
      d.delta={x:mx,y:my};d.next={x:d.x+mx,y:d.y+my};
      if(firstMove)udDragStart(d);
      const target=oid&&udPaperNestAllowed(d.id,oid)?oid:null;
      if(target!==d.overId){
        d.overId=target;d.nestTarget=null;clearTimeout(d.nestTimer);
        view.querySelectorAll('.nestTarget,.nestArming').forEach(c=>c.classList.remove('nestTarget','nestArming'));
        if(target){over.classList.add('nestArming');d.nestTimer=setTimeout(()=>{
          if(state.boardDrag!==d||d.overId!==target)return;
          d.nestTarget=target;over.classList.remove('nestArming');over.classList.add('nestTarget');
        },BOARD_NEST_DWELL)}
      }
      return;
    }
    if(firstMove)udDragStart(d);
    // 0.23.8: the card under the dragged one shows a ring that fills in 0.4 s and a hint; an open case can go inside too (with its contents);
    // Shift on release puts it inside at once.
    if(oid!==d.overId){d.overId=oid;d.overSince=performance.now();d.nestTarget=null;view.querySelectorAll('.boardCard.nestTarget,.boardCard.nestArming').forEach(c=>c.classList.remove('nestTarget','nestArming'));clearTimeout(d.nestTimer);
      const tc=oid&&view.querySelector(`[data-board-id="${CSS.escape(oid)}"]`);
      if(tc){tc.classList.add('nestArming');d.nestTimer=setTimeout(()=>{if(state.boardDrag!==d||d.overId!==oid)return;d.nestTarget=oid;tc.classList.remove('nestArming');tc.classList.add('nestTarget')},BOARD_NEST_DWELL)}}
  });
  const end=(e,cancelled=false)=>{
    const d=state.boardDrag;if(!d||e.pointerId!==d.pointerId)return;state.boardDrag=null;
    try{view.releasePointerCapture?.(e.pointerId)}catch{}
    view.classList.remove('panning','moving');
    clearTimeout(d.nestTimer);
    view.querySelectorAll('.nestTarget,.nestArming').forEach(c=>c.classList.remove('nestTarget','nestArming'));
    try{
      if(d.kind==='pan'&&d.boardKey!==boardCameraKey()){boardCancelQueuedPan();return}
      if(cancelled||d.kind==='card'&&(d.scope!==boardKey()||d.workspace!==undefined&&d.workspace!==currentWorkspace()?.id)){
        if(d.kind==='pan'){
          state.boardPanX=d.panX;state.boardPanY=d.panY;applyBoardTransform();
          // A wheel's earlier debounce may have saved this pan before cancel.
          const saved=currentWorkspace()?.view;
          if(saved&&((Number(saved.boardPanX)||0)!==d.panX||(Number(saved.boardPanY)||0)!==d.panY))persistWorkspaceView();
        }else renderDetective();
        return;
      }
      if(d.kind==='paper'){
        const stillHere=d.original.virtual?
          d.scope===boardKey()&&d.workspace===currentWorkspace()?.id&&boardLayout().keys?.get(d.id)?.virtual:
          udRebasePaperDrag(d);
        if(!stillHere){renderDetective();return}
        if(d.moved){
          const target=d.nestTarget||(e.shiftKey&&d.overId);
          if(target){if(!udNestPaper(d.id,target))renderDetective();return}
          if(!d.next||!udMovePaper(d.id,d.next.x,d.next.y))renderDetective();return;
        }
        const now=performance.now(),last=state.boardLastTap;
        state.boardLastTap={id:d.id,time:now};
        if(last?.id===d.id&&now-last.time<450){
          state.boardLastTap=null;
          const container=containmentChildren(d.entityId).length>0;
          if(d.udEdit&&!(container&&d.udEdit==='name'))udStartEdit(d.entityId,d.udEdit,d.id);
          else if(container)setScope(d.entityId,{paperId:d.id});
          else udToggleDetails(d.entityId);
        }else udSelectPaper(d.entityId,d.id);
        return;
      }
      if(d.kind==='pan'){if(d.moved){boardFlushPanTransform();persistWorkspaceView()}else if(!d.middle&&(state.selectedIds.size||state.selectedRelationId))clearSelection();return}
      view.querySelectorAll('.boardCard.nestArming').forEach(c=>c.classList.remove('nestArming'));
      if(d.moved&&worldReadOnly()){renderDetective();return}
      if(d.moved&&!d.nestTarget&&e.shiftKey&&d.overId)d.nestTarget=d.overId;
      if(d.moved&&d.nestTarget){const t=getEntity(d.nestTarget),c=getEntity(d.id);if(t&&c){if(boardCommit(()=>{if(!addContainment(c.id,t.id,{force:true,persist:false}))return false;boardClearPlace(c)},`«${c.name}» теперь внутри «${t.name}» · Ctrl+Z — отменить`))return}renderDetective();return}
      if(d.moved){
        // Первое перекладывание закрепляет на доске и все остальные бумажки: дальше доска не зависит от Graph.
        const places=new Map();for(const [id,p] of d.layout.positions)if(!p.fixed&&(!p.saved||d.ids.includes(id)))places.set(id,p);
        if(boardCommitPlaces(places,''))renderDetective();return;
      }
      const now=performance.now(),last=state.boardLastTap;
      if(last&&last.id===d.id&&!d.additive&&now-last.time<450){
        state.boardLastTap=null;const t=getEntity(d.id);
        // UD: on the name or description — edit right on the card; a space — go inside; any other card — «Подробнее» opens/closes
        const edit=d.udEdit,space=t&&t.id!==state.scopeId&&containmentChildren(t.id).length>0;
        // something is inside: double click goes inside (as in Universe Graph) — its name is renamed with «✎»; its description still edits in place.
        // An empty «space» (in the demo every card is one) is a plain card: name — rename, elsewhere — «Подробнее»; inside — E or the menu.
        if(t&&edit&&!(space&&edit==='name')){udStartEdit(t.id,edit)}else if(space){setScope(t.id)}else if(t)udToggleDetails(t.id);
        return;
      }
      state.boardLastTap={id:d.id,time:now};
      setSelected(d.id,d.additive);
    }finally{udDragEnd(d);udDragSchedule()}
  };
  view.addEventListener('pointerup',e=>end(e));view.addEventListener('pointercancel',e=>end(e,true));
  view.addEventListener('lostpointercapture',e=>{if(state.boardDrag&&state.boardDrag.pointerId===e.pointerId)end(e,true)});
  for(const event of ['mousedown','auxclick'])view.addEventListener(event,e=>{if(e.button===1)e.preventDefault()});
  const cancelBoardDrag=()=>{
    const drag=state.boardDrag;
    if(drag)end({pointerId:drag.pointerId},true);
  };
  boardCancelDrag=cancelBoardDrag;
  window.addEventListener('blur',cancelBoardDrag);
  window.addEventListener('keydown',e=>{if(e.key==='Escape')cancelBoardDrag()});
  view.addEventListener('contextmenu',e=>{
    e.preventDefault();e.stopPropagation();
    const card=e.target.closest('[data-board-id]'),hit=e.target.closest('[data-board-rel]');
    if(card){const id=card.dataset.boardId;if(card.dataset.udPaperId)udSelectPaper(id,card.dataset.udPaperId);else if(!state.selectedIds.has(id))setSelected(id,false);showContextMenu(e.clientX,e.clientY,'entity',id)}
    else if(hit){selectRelation(hit.dataset.boardRel);showContextMenu(e.clientX,e.clientY,'relation',hit.dataset.boardRel)}
    else showContextMenu(e.clientX,e.clientY,'canvas',null,e.button===2?boardCreationPoint(e.clientX,e.clientY):null);
  });
}

