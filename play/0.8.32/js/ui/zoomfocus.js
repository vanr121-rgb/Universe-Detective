// Universe Detective — приближение «к месту» (из Universe Graph 0.23.5): колесо приближает доску к тому, на что наведена мышь.
// Мышь над бумажкой — приближаем именно к ней: бумажка остаётся под курсором и слегка подтягивается к середине.
// Над пустым местом — к точке под курсором. Кнопки «＋/−» — к выбранной бумажке, если она на доске.
// (В UG здесь же — Graph 2D/3D, Galaxy, Tree, Outline; в UD их нет.)
'use strict';

const ZOOM_PULL=.2; // share of the way to the middle a card makes on each step in

function boardCardAt(clientX,clientY){return document.elementFromPoint(clientX,clientY)?.closest?.('#detectiveView [data-board-id]')||null}
function boardZoomFocus(factor,clientX,clientY,{card=null}={}){
  const v=$('#detectiveView');if(!v)return;const r=v.getBoundingClientRect();
  boardCancelQueuedCamera();
  const previous=state.boardZoom||1,z=clamp(previous*factor,BOARD_ZOOM_MIN,BOARD_ZOOM_MAX);
  if(z===previous)return; // A clamped wheel step must not keep pulling the paper.
  const drag=state.boardDrag;
  const active=boardGestureActive();
  const pointer=active&&drag.pointer;
  // WheelEvent coordinates can be rounded while PointerEvent coordinates
  // retain their fractional position at the same spot.
  const samePointer=pointer&&Math.abs(pointer.x-clientX)<1&&Math.abs(pointer.y-clientY)<1;
  if(samePointer){clientX=pointer.x;clientY=pointer.y}
  // During a gesture the hand anchors the zoom at the exact pointer.
  const c=active?null:card||(Number.isFinite(clientX)?boardCardAt(clientX,clientY):null);
  let ax=Number.isFinite(clientX)?clientX:r.left+r.width/2,ay=Number.isFinite(clientY)?clientY:r.top+r.height/2;
  if(c){const b=c.getBoundingClientRect();ax=b.left+b.width/2;ay=b.top+b.height/2}
  const before=boardWorldPoint(ax,ay);
  const tx=c&&factor>1?ax+(r.left+r.width/2-ax)*ZOOM_PULL:ax,ty=c&&factor>1?ay+(r.top+r.height/2-ay)*ZOOM_PULL:ay;
  const oldPanX=state.boardPanX||0,oldPanY=state.boardPanY||0;
  state.boardZoom=z;state.boardPanX=tx-r.left-r.width/2-before.x*z;state.boardPanY=ty-r.top-r.height/2-before.y*z;
  if(active&&drag.kind==='pan'){
    drag.panX+=state.boardPanX-oldPanX;drag.panY+=state.boardPanY-oldPanY;
  }
  applyBoardTransform();updateZoom();scheduleViewPersist();
}

function zoomButton(dir){
  const sel=getEntity(state.selectedId),c=sel&&$(`#detectiveView [data-board-id="${CSS.escape(sel.id)}"]`);
  if(c){const b=c.getBoundingClientRect();boardZoomFocus(dir>0?1.12:1/1.12,b.left+b.width/2,b.top+b.height/2,{card:c});return}
  boardZoomFocus(dir>0?1.12:1/1.12);
}
