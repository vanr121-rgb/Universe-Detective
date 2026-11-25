// Universe Detective — привязки: горячие клавиши, кнопки верха и меню (из Universe Graph; мышь холста Graph в UD не нужна —
// мышь на доске — js/bindings/views.js).
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули делят одно глобальное пространство имён.
'use strict';
// Input / navigation
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wakePreviewLoop()});window.addEventListener('resize',()=>{wakePreviewLoop()});
// 0.23: letter shortcuts work in the Russian layout too (the G key gives «п» there) — the key's place is checked as well.
function keyIs(e,letter){return String(e.key||'').toLowerCase()===letter||e.code==='Key'+letter.toUpperCase()}
window.addEventListener('keydown',e=>{const modalOpen=$('#modalBack').classList.contains('open'),target=document.activeElement,isField=['INPUT','TEXTAREA','SELECT'].includes(target.tagName);if((e.ctrlKey||e.metaKey)&&keyIs(e,'z')&&!isField){e.preventDefault();e.shiftKey?redoEdit():undoEdit();return}if((e.ctrlKey||e.metaKey)&&keyIs(e,'y')&&!isField){e.preventDefault();redoEdit();return}if((e.ctrlKey||e.metaKey)&&keyIs(e,'k')){e.preventDefault();$('#globalSearch').focus()}if(e.key==='Escape'){if($('#searchResults').classList.contains('open'))$('#searchResults').classList.remove('open');else closeModal();if(state.mode==='trace'){state.mode='explore';state.traceStart=null;state.traceEnd=null;state.focusedPath=[];updateModes();updateUI();toast('Trace сброшен','ok')}}if(modalOpen)return;const onButton=!!target.closest?.('button,a,[role="button"],summary');if(e.key==='Enter'&&!isField&&!onButton){enterSelected()}if(e.key==='Backspace'&&!isField&&!onButton)back();if(e.key==='ArrowLeft'&&e.altKey)back();if(e.key==='ArrowRight'&&e.altKey)forward();if(isField)return;if(e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='0')fitViewPressed();if(e.key==='1')resetViewPressed();if(keyIs(e,'f')){$('#fitBtn').click()}if(keyIs(e,'e'))enterSelected();if(worldReadOnly())return;if(keyIs(e,'h')&&state.selectedId)toggleOffBoard(state.selectedId);if(keyIs(e,'n'))openEntityModal();if(keyIs(e,'r'))linkFromSelection();if(e.key==='Delete'){
  if(state.visualMode==='detective'){
    e.preventDefault();
    if(!e.repeat){
      const paperId=udSelectedPaperId();
      if(paperId)udRemovePaper(paperId);
      else if(!udBoardUsesPlacements())udRemoveLegacyPapers([...state.selectedIds]);
    }
    return;
  }
  if(e.repeat)return;
  if(state.selectedIds.size>1)deleteEntities([...state.selectedIds]);
  else if(state.selectedId)deleteEntity(state.selectedId);
}});
function boardThreadKeyboardTarget(target){
  return !!target?.closest?.('input,textarea,select,button,summary,a[href],[role="button"],[contenteditable]:not([contenteditable=false]),.udEditor,dialog,.udSet,.contextMenu,.drawBoard');
}
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&state.space){boardSetThreadFocus(false);return}
  if(event.code!=='Space'||state.visualMode!=='detective'||event.ctrlKey||event.altKey||event.metaKey||
    boardThreadKeyboardTarget(event.target)||$('#modalBack')?.classList.contains('open'))return;
  if(event.repeat&&!state.space)return;
  event.preventDefault();
  if(!state.space)boardSetThreadFocus(true);
},true);
window.addEventListener('keyup',event=>{if(event.code==='Space'&&state.space)boardSetThreadFocus(false)});
window.addEventListener('blur',()=>{if(state.space)boardSetThreadFocus(false)});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.space)boardSetThreadFocus(false)});
document.addEventListener('focusin',event=>{if(state.space&&boardThreadKeyboardTarget(event.target))boardSetThreadFocus(false)});


$('#zoomIn').onclick=()=>zoomButton(1);$('#zoomOut').onclick=()=>zoomButton(-1);$('#fitBtn').onclick=fitViewPressed;$('#autoLayoutBtn').onclick=autoLayout;$('#homeBtn').onclick=goHome;$('#upBtn').onclick=goUp;$('#enterBtn').onclick=enterSelected;const setConnectionView=show=>{state.showExternal=!!show;state.viewVersion=(state.viewVersion||0)+1;updateUI();persistWorkspaceView()};
$('#localBtn').onclick=()=>setConnectionView(false);$('#linksBtn').onclick=()=>setConnectionView(true);$('#hiddenBtn').onclick=()=>{state.showHidden=!state.showHidden;state.viewVersion=(state.viewVersion||0)+1;updateUI();persistWorkspaceView();toast(state.showHidden?'Скрытые сущности видны бледно. Глаз 👁 рядом — вернуть на доску':'Скрытые сущности снова не видны','ok')};$('#isolateBtn').onclick=()=>{state.isolate=!state.isolate;state.viewVersion=(state.viewVersion||0)+1;updateUI();persistWorkspaceView();toast(state.isolate?'Изоляция включена':'Изоляция выключена','ok')};
$('#createEntityBtn').onclick=()=>openEntityModal();$('#createRelationBtn').onclick=()=>{const r=$('#createRelationBtn').getBoundingClientRect();linkFromSelection(r.left,r.bottom)};$('#openTypesBtn').onclick=openTypeModal;$('#saveBtn').onclick=save;$('#undoBtn').onclick=undoEdit;$('#redoBtn').onclick=redoEdit;$('#scopeBack').onclick=back;$('#scopeForward').onclick=forward;$('#resetViewBtn').onclick=resetViewPressed;
$('#modalClose').onclick=closeModal;$('#modalBack').addEventListener('click',e=>{if(e.target===$('#modalBack'))closeModal()});
