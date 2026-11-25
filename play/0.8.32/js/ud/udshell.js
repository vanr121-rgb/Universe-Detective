// Universe Detective — свой каркас (UD 0.1): кнопки настроек внизу, меню «Файл» сверху справа.
// Кнопки, перенесённые из Universe Graph (сохранить, экспорт, импорт, резервные копии, корзина, рабочие зоны), сохранили свои id —
// их действия привязаны в своих модулях; здесь только новое: нижние кнопки «Типы / Связи / Статусы / Теги / Сеть» и само меню.
'use strict';
// «Связанные снаружи» и «Убранные с доски» — в Universe Graph это кнопки левой панели (Links, «Скрытые»); в UD — в «⋯» полоски доски.
function udToggleExternal(){setConnectionView(!state.showExternal)}
function udToggleHidden(){state.showHidden=!state.showHidden;state.viewVersion=(state.viewVersion||0)+1;updateUI();persistWorkspaceView();toast(state.showHidden?'Убранные с доски видны бледно. Вернуть можно через правый клик или «Скрытые сущности»':'Убранные с доски снова не видны','ok')}
// «Центрировать»: доска сдвигается так, чтобы бумажка (или середина между двумя) оказалась посреди экрана. В UG это делала
// камера Graph (state.panX/panY) — у доски своя камера (boardPanX/boardPanY), и в UD «Центрировать» молчало бы.
function boardCenterOn(ids){boardQueueCamera(()=>{const v=$('#detectiveView');if(!v)return;const rs=ids.map(id=>v.querySelector(`[data-board-id="${CSS.escape(id)}"]`)?.getBoundingClientRect()).filter(Boolean);if(!rs.length){toast('Этой бумажки нет на доске','err');return}const cx=rs.reduce((a,r)=>a+r.left+r.width/2,0)/rs.length,cy=rs.reduce((a,r)=>a+r.top+r.height/2,0)/rs.length,vr=v.getBoundingClientRect();state.boardPanX=(state.boardPanX||0)-(cx-(vr.left+vr.width/2));state.boardPanY=(state.boardPanY||0)-(cy-(vr.top+vr.height/2));applyBoardTransform();scheduleViewPersist()},{focus:true})}
function udMenuOpen(on){const m=$('#udMenu'),b=$('#udFileBtn');if(!m||!b)return;m.hidden=!on;b.setAttribute('aria-expanded',String(!!on))}
(function bindUdShell(){
  $('#udDock')?.addEventListener('click',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-ud-rules]'):null;if(b)udSetShow(b.dataset.udRules,{toggle:true})});
  $('#udNetBtn')?.addEventListener('click',()=>openOnline());
  $('#udFileBtn')?.addEventListener('click',ev=>{ev.stopPropagation();udMenuOpen($('#udMenu').hidden)});
  // a choice in the menu closes it (the button's own action runs as before)
  $('#udMenu')?.addEventListener('click',ev=>{if(ev.target instanceof Element&&ev.target.closest('.udMenuItem'))udMenuOpen(false)});
  document.addEventListener('pointerdown',ev=>{if(!$('#udMenu')?.hidden&&!(ev.target instanceof Element&&ev.target.closest('#udFile')))udMenuOpen(false)},true);
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('#udMenu')?.hidden){udMenuOpen(false);ev.stopPropagation()}},true);
})();
