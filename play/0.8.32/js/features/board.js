// Universe Graph — общая рисовальная доска (0.29.6). Кнопка рядом с «Моими заметками» (внизу слева). Доска открывается поверх
// рабочей зоны (⛶ — на весь экран); несколько листов («Бой в таверне», «План крепости»). Рисунок хранится в мире (ws.sketches) —
// виден «глазами игрока» (там — только смотреть); с игрой по сети (0.30) рисовать смогут все, каждый своим цветом, а Мастер —
// запретить. Каждый штрих отдельный — его можно будет переслать по сети. «Сохранить картинкой» — PNG.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';
const boardUI={open:false,sheet:null,surface:null,full:false};
// ws.sketches — not ws.boards: that name already holds the Detective board of each space (detective.js)
function wsBoards(ws=currentWorkspace()){if(!ws)return [];if(!Array.isArray(ws.sketches))ws.sketches=[];return ws.sketches}
// 0.30.5: who may draw — the Master; a player in the game over the network, unless the Master forbade it; «глазами игрока» — nobody
function boardRO(){if(typeof viewAsPlayer==='function'&&viewAsPlayer())return true;if(window.UG_ONLINE_PLAYER)return !(typeof onp!=='undefined'&&onp.me?.role==='player'&&currentWorkspace()?.sketchPlayers!==false);return false}
function boardSheet(){const list=wsBoards();let s=list.find(x=>x.id===boardUI.sheet);if(!s)s=list[0]||null;if(s)boardUI.sheet=s.id;return s}
function sheetCommit(fn,okText){
  if(boardRO()){toast(window.UG_ONLINE_PLAYER?(onp.me?.role==='viewer'?'Зритель только смотрит на доску':'Мастер не разрешил игрокам рисовать на доске'):'Глазами игрока доску можно только смотреть','err');return false}
  const ws=currentWorkspace();if(!ws)return false;const snap=snapshotWorkspaceMutation();
  let sh=boardSheet();if(!sh){sh={id:uid('sheet'),name:'Лист 1',strokes:[],createdAt:new Date().toISOString()};wsBoards(ws).push(sh);boardUI.sheet=sh.id}
  try{if(fn(sh,ws)===false){restoreWorkspaceMutation(snap.data,snap.state);return false}}catch(err){restoreWorkspaceMutation(snap.data,snap.state);toast('Не получилось: '+(err?.message||err),'err');return false}
  sh.updatedAt=new Date().toISOString();
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);toast('Не удалось сохранить рисунок — всё как было','err');boardRender();return false}
  if(okText)toast(okText,'ok');boardSheetsRender();return true;
}
// the sheet the player sees: the copy keeps ws.sketches, so the board is read from the real workspace (nothing on it is secret)
function boardReadSheet(){const real=data.workspaces?.find(w=>w.id===state.workspaceId)||currentWorkspace();const list=Array.isArray(real?.sketches)?real.sketches:[];return list.find(x=>x.id===boardUI.sheet)||list[0]||null}
function boardSheetsRender(){
  const box=$('#drawSheets');if(!box)return;if(boardUI.renaming&&box.querySelector('.drwRename'))return; /* 0.30.9: typing a new name — a player's stroke must not sweep the field away */const list=wsBoards(),cur=boardSheet(),ro=boardRO();
  box.innerHTML=`${list.map(s=>`<button type="button" class="drwSheet${s.id===cur?.id?' on':''}" data-sheet="${escapeHtml(s.id)}" title="${escapeHtml(s.name)} — штрихов: ${(s.strokes||[]).length}">${escapeHtml(s.name)}</button>`).join('')}${ro?'':`<button type="button" class="drwSheet drwSheetAdd" data-sheet-add title="Новый лист">＋</button>`}${!window.UG_ONLINE_PLAYER&&!(typeof viewAsPlayer==='function'&&viewAsPlayer())?`<button type="button" class="drwSheet drwPlayers${currentWorkspace()?.sketchPlayers===false?'':' on'}" data-board-players title="Игра по сети: могут ли игроки рисовать на доске">✋ Игроки рисуют: ${currentWorkspace()?.sketchPlayers===false?'нет':'да'}</button>`:''}`;
}
function boardRender(){if(!boardUI.open)return;boardSheetsRender();boardUI.surface?.render();const n=$('#drawBoard .drwRONote');if(n){const ro=window.UG_ONLINE_PLAYER&&boardRO();n.hidden=!ro;n.textContent=ro?(onp.me?.role==='viewer'?'Зритель только смотрит':'Мастер не разрешил игрокам рисовать'):''}}
function openBoard(sheetId){
  const main=document.querySelector('.main');if(!main)return;let el=$('#drawBoard');
  if(!el){el=document.createElement('section');el.id='drawBoard';el.className='drawBoard';el.setAttribute('aria-label','Рисовальная доска');main.appendChild(el)}
  if(sheetId)boardUI.sheet=sheetId;boardUI.open=true;boardUI.renaming=false;el.hidden=false;$('#boardBtn')?.classList.add('on');
  el.innerHTML=`<div class="drwHead"><b>🖌 Доска</b><div class="drwSheets" id="drawSheets"></div><span class="drwRONote" hidden></span><span class="drwHeadActs"><button type="button" class="iconBtn tiny" data-board-act="rename" title="Переименовать лист">✎</button><button type="button" class="iconBtn tiny" data-board-act="clear" title="Очистить лист">🧹</button><button type="button" class="iconBtn tiny" data-board-act="delsheet" title="Удалить лист">🗑</button><button type="button" class="iconBtn tiny" data-board-act="png" title="Сохранить лист картинкой">📷</button><button type="button" class="iconBtn tiny" data-board-act="full" title="На весь экран">⛶</button><button type="button" class="iconBtn tiny" data-board-act="close" title="Закрыть доску (Esc)" aria-label="Закрыть доску">×</button></span></div><div class="drwBody" id="drawBody"></div>`;
  boardUI.surface=createDrawSurface($('#drawBody'),{get:()=>(boardRO())?boardReadSheet():boardSheet(),commit:sheetCommit,readOnly:()=>boardRO(),onOpenEntity:id=>{setSelected(id);updateUI()}});
  el.onclick=ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;
    if(t.closest('[data-board-players]')){const ws=currentWorkspace();if(!ws)return;const snap=snapshotWorkspaceMutation();ws.sketchPlayers=ws.sketchPlayers===false;if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);return}toast(ws.sketchPlayers?'Игроки могут рисовать на доске':'Игроки только смотрят на доску','ok');boardRender();return}
    const sh=t.closest('[data-sheet]');if(sh){boardUI.sheet=sh.dataset.sheet;boardRender();boardUI.surface?.fit();return}
    if(t.closest('[data-sheet-add]')){const n=wsBoards().length+1;const ws=currentWorkspace();const snap=snapshotWorkspaceMutation();const s={id:uid('sheet'),name:'Лист '+n,strokes:[],createdAt:new Date().toISOString()};wsBoards(ws).push(s);if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);return}boardUI.sheet=s.id;boardRender();boardUI.surface.fit();return}
    const a=t.closest('[data-board-act]')?.dataset.boardAct;if(!a)return;
    if(a==='close')closeBoard();
    else if(a==='full'){boardUI.full=!boardUI.full;el.classList.toggle('drwFull',boardUI.full);setTimeout(()=>boardUI.surface.render(),50)}
    else if(a==='png')boardSavePng();
    else if(a==='clear'){const s=boardSheet();if(s&&(s.strokes||[]).length&&confirm(`Очистить лист «${s.name}»? (Ctrl+Z вернёт)`))sheetCommit(x=>{x.strokes=[]},'Лист очищен');boardRender()}
    else if(a==='delsheet'){const s=boardSheet();if(s&&confirm(`Удалить лист «${s.name}»? (Ctrl+Z вернёт)`)){const ws=currentWorkspace(),snap=snapshotWorkspaceMutation();ws.sketches=wsBoards(ws).filter(x=>x.id!==s.id);if(!persist())restoreWorkspaceMutation(snap.data,snap.state);boardUI.sheet=null;boardRender()}}
    else if(a==='rename'){const s=boardSheet();if(!s)return;const hd=el.querySelector('.drwSheets');hd.innerHTML=`<input class="drwRename" value="${escapeHtml(s.name)}" aria-label="Название листа" maxlength="40"><button type="button" class="btn tiny" data-rename-ok>✓</button>`;const inp=hd.querySelector('input');inp.focus();inp.select();boardUI.renaming=true;const done=()=>{if(!boardUI.renaming)return;boardUI.renaming=false;const v=inp.value.trim();if(v&&v!==s.name)sheetCommit(x=>{x.name=v},null);boardRender()};inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();done()}if(e.key==='Escape'){e.stopPropagation();boardUI.renaming=false;boardRender()}};inp.onblur=()=>setTimeout(done,150);hd.querySelector('[data-rename-ok]').onclick=done}};
  boardRender();requestAnimationFrame(()=>{boardUI.surface?.fit();$('#drawBody')?.focus()});
}
function closeBoard(){boardUI.open=false;const el=$('#drawBoard');if(el){el.hidden=true;el.innerHTML='';el.classList.remove('drwFull')}boardUI.surface=null;boardUI.full=false;$('#boardBtn')?.classList.remove('on')}
function toggleBoard(){if(boardUI.open)closeBoard();else openBoard()}
async function boardSavePng(){const s=boardSheet()||boardReadSheet();if(!s||!(s.strokes||[]).length){toast('Лист пустой','err');return}try{const c=await drawToCanvas(boardUI.surface.svg,{scale:2});const blob=await new Promise(r=>c.toBlob(r,'image/png'));const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${asciiFileName('доска-'+s.name)}.png`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);toast(`Лист сохранён картинкой: ${a.download}`,'ok')}catch(err){toast('Не получилось: '+(err?.message||err),'err')}}
$('#boardBtn')?.addEventListener('click',e=>{e.stopPropagation();toggleBoard()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&boardUI.open&&!document.getElementById('modalBack')?.classList.contains('open')&&!e.target.closest?.('.drwTextBox')){closeBoard()}});
