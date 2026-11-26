// 0.23.7: the strip of a mode's own buttons — one place and one look in every mode, right under the view switcher.
// Main actions are buttons, rare ones live in «⋯», ▴ folds the strip to a small tab (remembered for each mode).
// Table and Kanban keep their own settings row (it holds search and selects) with the same look and the same ▴.
// The strip borrows the skin's look of the Explore/Dive/Trace group (.modeBar/.modeBtn), so every style dresses it.
const VIEW_STRIP_LABEL={graph:'Graph',outline:'Outline',tree:'Tree',galaxy:'Galaxy',detective:'Detective',table:'Таблица',kanban:'Канбан'};
let viewStripMenuOpen=false,viewStripRaf=0;

function viewStripClosed(mode=state.visualMode){return !!state.stripClosed?.has(mode)}
function setViewStripClosed(mode,closed){if(!(state.stripClosed instanceof Set))state.stripClosed=new Set();if(closed)state.stripClosed.add(mode);else state.stripClosed.delete(mode);viewStripMenuOpen=false;saveUIPrefs();renderViewStrip();}

// What a mode shows: a short status and its actions. Each action: [id, label, title, extra-attribute, pressed].
function viewStripSpec(mode){
  const count=(n,a,b,c)=>`${n} ${plural(n,a,b,c)}`;
  if(mode==='detective'){return {status:$('#detectiveView')?.dataset.status||'',main:[['board-threads','Нити'+(state.hiddenTiers?.size?' · '+(5-state.hiddenTiers.size)+'/5':''),'Показать или скрыть уровни важности нитей','',!!state.hiddenTiers?.size],['board-fit','▣ Вписать','Показать всю доску','data-board-fit'],['board-composition','Состав','Посмотреть весь состав текущего контейнера, даже за пределами экрана'],...(!worldReadOnly()?[['board-pin','📌 Прикрепить','Положить на эту доску сущность из любого места мира','data-board-pin-open']]:[]),['board-red','🧶 Красная нить','Все нитки красные, как на настоящей доске следователя','data-board-red',!!state.boardRed],['board-contain','⤓ Содержит','Показать нитки «содержит» — что в чём лежит','data-board-contain',state.boardContain!==false]],more:[['all-records','☰ Все сущности','Все сущности мира — перетащите на доску','',typeof allRec!=='undefined'&&allRec.open],...(!worldReadOnly()?[['board-arrange','⊞ Разложить сеткой','Разложить бумажки ровной сеткой по типам (Ctrl+Z — вернуть)','data-board-arrange']]:[]),['board-types','🎨 Цвет по типам','Бумажки без своего цвета — в оттенок цвета их типа','',!!state.boardTypeColors],['board-links','⇄ Связанные снаружи','Показать и бумажки из других мест, связанные с этими (UD: было «Links» в левой панели)','',!!state.showExternal],...(!uiIsPlayer()?[['hidden-records','◉ Скрытые сущности','Найти скрытые сущности в мире и изменить их видимость','',allRec.open&&!!allRec.visibility]]:[]),['board-hidden','◍ Убранные с доски','Показать доступные бумажки, убранные с доски','',!!state.showHidden]]}}
  return null;
}
const VIEW_STRIP_ACTIONS={
  'snapshot':()=>openSnapshotDialog(), // 0.29.5: «📷 Сохранить картинкой» — in «⋯» of every mode
  'graph-fit':()=>fitView(),'graph-layout':()=>autoLayout(),'graph-reset':()=>resetView(),
  'all-records':()=>toggleAllRecords(),'hidden-records':()=>udShowHiddenRecords(),
  'board-threads':()=>udOpenThreadFilter(),'board-fit':()=>boardFit(),'board-composition':()=>udOpenPaperContents(udContainerContext()?.paperId??null),'board-pin':()=>boardOpenPinPicker(),'board-arrange':()=>boardArrange(),'board-red':()=>boardToggleRed(),'board-types':()=>boardToggleTypeColors(),'board-contain':()=>boardToggleContain(),'board-links':()=>udToggleExternal(),'board-hidden':()=>udToggleHidden(),
};

function viewStripButton([act,label,title,attr,pressed],cls='modeBtn'){return `<button type="button" class="${cls}${pressed?' active':''}" data-act="${act}" ${attr||''} title="${escapeHtml(title||'')}"${pressed!==undefined?` aria-pressed="${pressed?'true':'false'}"`:''}>${escapeHtml(label)}</button>`}
// The folded tab — also used by the Table/Kanban row.
function viewStripTabHtml(mode,status){return `<button type="button" class="modeBtn vsTab" data-strip-open="${mode}" title="Показать кнопки режима">▾ ${escapeHtml(VIEW_STRIP_LABEL[mode]||mode)}${status?` <small>${escapeHtml(status)}</small>`:''}</button>`}
function viewStripFoldHtml(mode){return `<button type="button" class="modeBtn vsFold" data-strip-close="${mode}" title="Свернуть строку (запоминается для этого режима)" aria-label="Свернуть строку">▴</button>`}

function renderViewStrip(keep){
  if(typeof allRecSync==='function')allRecSync();
  const el=$('#viewStrip');if(!el)return;const mode=state.visualMode,full=isRecordsMode()?null:viewStripSpec(mode);
  // 0.23.8: in a narrow window the last main buttons move into «⋯» until the strip fits (none is cut off)
  // 0.29: «keep» is a count of buttons; requestAnimationFrame(renderViewStrip) used to pass the frame time here (thousands)
  if(full&&!full.more.some(a=>a[0]==='snapshot'))full.more=[...full.more,['snapshot','📷 Сохранить картинкой','Вид целиком или то, что на экране, — файлом PNG или в буфер обмена']];
  const n=full?.main.length||0,k=Number.isInteger(keep)?Math.max(0,Math.min(keep,n)):n,spec=full&&{...full,main:full.main.slice(0,k),more:[...full.main.slice(k),...full.more]};
  if(!spec){el.hidden=true;el.innerHTML='';return}
  el.hidden=false;const closed=viewStripClosed(mode);el.classList.toggle('closed',closed);el.dataset.mode=mode;
  if(closed){el.innerHTML=viewStripTabHtml(mode,spec.status)}
  else{
    const more=spec.more.length||spec.extra?`<div class="vsMore"><button type="button" class="modeBtn vsMoreBtn" data-strip-more aria-expanded="${viewStripMenuOpen}" title="Ещё действия">⋯</button><div class="modeBar vsMenu"${viewStripMenuOpen?'':' hidden'}>${spec.more.map(a=>viewStripButton(a,'modeBtn vsItem')).join('')}${spec.extra||''}</div></div>`:'';
    el.innerHTML=`<span class="modeBtn vsTitle"><b>${escapeHtml(VIEW_STRIP_LABEL[mode])}</b>${spec.status?`<small>${escapeHtml(spec.status)}</small>`:''}</span>${spec.main.map(a=>viewStripButton(a)).join('')}${more}${viewStripFoldHtml(mode)}`;
  }
  viewStripPlace();
  // 0.29: the strip is capped by max-width:100%, so in a narrow work area (Windows 150 %) its buttons spilled out of it under the record panel
  // while its own box still «fitted» — the overflow is measured too.
  if(!closed&&k>0){const main=document.querySelector('.main');if(main&&(el.scrollWidth>el.clientWidth+1||el.getBoundingClientRect().width>main.getBoundingClientRect().width-24))renderViewStrip(k-1)}
}
// Right under the view switcher (it can wrap or fold, so the place is measured).
// --strip-bottom on .main tells page-like views (Outline) where their content may start.
// 0.23.10 / 0.24: the top of the work area fits its width (the side panels change it, not only the window).
// Row 1 (pills «Контекст» / «Выбрано», Explore/Dive/Trace, zoom): if it does not fit in one line, the pills go first —
// they repeat what the side panels show. The view switcher: no «Обычные связи» caption → smaller buttons → a second line.
// It always stands under row 1, so it can never cover the zoom buttons (it did on a 1366 px laptop).
function viewBarFit(){const bar=document.querySelector('.viewBar'),hud=document.querySelector('.hud'),main=document.querySelector('.main');if(!bar||!hud||!main)return;
  const wasBar=bar.className,wasMain=main.className;const room=hud.clientWidth;if(!room)return;
  const row1=()=>[...hud.children].filter(x=>x!==bar&&x.offsetParent!==null&&getComputedStyle(x).position!=='absolute'&&x.getBoundingClientRect().width>0); // the switcher and the strip stand apart (absolute)
  const wraps=()=>{const r=row1().map(x=>x.getBoundingClientRect()).filter(q=>q.height>0);if(r.length<2)return false;const firstBottom=Math.min(...r.map(q=>q.bottom));return r.some(q=>q.top>=firstBottom-2)};
  main.classList.remove('hudNoPills');if(wraps())main.classList.add('hudNoPills');
  bar.classList.remove('vbTight','vbSmall','vbWrap');
  for(const c of ['vbTight','vbSmall','vbWrap'])if(bar.scrollWidth>room)bar.classList.add(c);
  const h=hud.getBoundingClientRect(),bottom=Math.max(0,...row1().map(x=>x.getBoundingClientRect().bottom-h.top));
  bar.style.top=bottom?Math.round(zpx(bottom+6))+'px':'';
  // Table/Kanban and Tree measured the switcher's height when drawn; a second line moves their start down
  if(bar.className!==wasBar||main.className!==wasMain){const tv=$('#tableView');if(tv&&typeof hudOffsetWithin==='function'&&main.classList.contains('recordsMode'))tv.style.setProperty('--hud-top',zpx(hudOffsetWithin(tv))+'px')}}
function viewStripPlace(){viewBarFit();const el=$('#viewStrip'),bar=document.querySelector('.app.ud #udTop')||document.querySelector('.viewBar')/* UD: the strip goes under the UD top row */,hud=document.querySelector('.hud'),main=document.querySelector('.main');if(!el||!bar||!hud||!main)return;if(el.hidden){main.style.removeProperty('--strip-bottom');return}const b=bar.getBoundingClientRect(),h=hud.getBoundingClientRect();el.style.top=Math.round(zpx(b.bottom-h.top+6))+'px';main.style.setProperty('--strip-bottom',Math.round(zpx(el.getBoundingClientRect().bottom-main.getBoundingClientRect().top+12))+'px')}
function viewStripSoon(){if(viewStripRaf)return;viewStripRaf=requestAnimationFrame(()=>{viewStripRaf=0;if(viewStripMenuOpen&&document.activeElement?.closest?.('#viewStrip'))return;renderViewStrip()})}

function bindViewStrip(){
  const el=$('#viewStrip');if(!el)return;
  el.addEventListener('click',ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;
    if(t.closest('[data-strip-more]')){viewStripMenuOpen=!viewStripMenuOpen;renderViewStrip();return}
    const b=t.closest('[data-act]');if(!b)return;const fn=VIEW_STRIP_ACTIONS[b.dataset.act];if(!fn)return;ev.preventDefault();
    if(b.closest('.vsMenu'))viewStripMenuOpen=false;fn();renderViewStrip()});
  // Fold and unfold work the same for the strip and for the Table/Kanban row.
  document.addEventListener('click',ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;
    const open=t.closest('[data-strip-open]'),close=t.closest('[data-strip-close]');
    if(open){ev.preventDefault();ev.stopPropagation();setViewStripClosed(open.dataset.stripOpen,false);return}
    if(close){ev.preventDefault();ev.stopPropagation();setViewStripClosed(close.dataset.stripClose,true);return}
    if(viewStripMenuOpen&&!t.closest('.vsMore')){viewStripMenuOpen=false;renderViewStrip()}},true);
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&viewStripMenuOpen){viewStripMenuOpen=false;renderViewStrip()}});
  window.addEventListener('resize',viewStripSoon); /* 0.30.9: a narrower window — the strip is fitted again (it was only moved and ran past the edge) */
  // the side panels change the work area without resizing the window
  const hud=document.querySelector('.hud');if(hud&&typeof ResizeObserver==='function')new ResizeObserver(()=>requestAnimationFrame(viewStripPlace)).observe(hud);
}

// 0.23.9: the screen by chat — «чистый холст», «верни панели», «спрячь верхнюю панель», «сверни кнопки режима»,

