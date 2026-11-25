// Universe Detective — общая перерисовка интерфейса (updateUI). Вид один — доска (js/views/detective.js).
// В Universe Graph здесь же переключались семь видов, панель видов, авто-раскладка Graph/Galaxy/Tree/Outline и сброс вида
// для каждого из них; в UD от этого остались «Разложить» и «Сбросить вид» доски.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули делят одно глобальное пространство имён.
'use strict';
function updateVisualMode(){viewStripSoon();$('.main')?.classList.add('detectiveMode')}
// Height of the floating HUD (the board strip) measured from the top of a view, so the board's «fit» keeps cards out from under it.
// returns SCREEN px (callers outside the counter-zoomed views convert with zpx)
function hudOffsetWithin(view){const h=document.querySelector('.hud');if(!view||!h)return 120;let bottom=Math.max(h.getBoundingClientRect().bottom,$('#udTop')?.getBoundingClientRect().bottom||0);for(const c of h.querySelectorAll('.modeBar,.pill')){const r=c.getBoundingClientRect();if(r.width&&r.height&&getComputedStyle(c).display!=='none')bottom=Math.max(bottom,r.bottom)}const off=bottom-view.getBoundingClientRect().top+10;return Number.isFinite(off)&&off>0?Math.round(off):120}
// UD: whatever is asked for, the board is shown (a world or a preference from Universe Graph may name another view).
function setVisualMode(){state.visualMode='detective';state.treeRootCollapsed=false;updateVisualMode();boardQueueCamera(boardEnsureVisible);renderDetective();updateZoom();saveUIPrefs()}
function updateUI(mode){
  document.body.classList.toggle('udReadOnly',worldReadOnly());return guard('обновление интерфейса',()=>updateUIUnsafe(mode==='selection'))}
function updateUIUnsafe(selectionOnly=false){
  if(typeof viewAsPlayer==='function'&&viewAsPlayer()&&data.entities===currentWorkspace()?.entities)playerReproject(); /* 0.28: safety net — the player's view never shows the real arrays */
  allRecSync();if(typeof updateTrashButton==='function')updateTrashButton();if(typeof boardUI!=='undefined'&&boardUI.open)boardRender();
  const sel=getEntity(state.selectedId);
  $('#scopeBack').disabled=state.historyIndex<=0;
  $('#breadcrumbs').innerHTML=buildBreadcrumbs();
  renderEntityPanel(sel);renderRelationPanel(state.selectedRelationId?data.relations.find(r=>r.id===state.selectedRelationId):null);renderActions(sel);
  updateZoom();updateVisualMode();renderDetective(selectionOnly);linkKnobSoon();if(articleUI.id||articleUI.lib||articleUI.subject)renderArticles();udSetRefresh();udPeopleRefresh();if(rulesPlayerMode())hideWorkspacePopup();
}
function autoLayout(){boardArrange()}
function resetView(){boardResetView()}
