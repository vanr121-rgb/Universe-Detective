// Мастер задаёт видимость сущности для игроков:
//   зелёный глаз — видно всем (так по умолчанию, и у старых миров);
//   жёлтый — имя, тип и наличие нитей к известным сущностям;
//   серый — игроки видят, что «что-то есть»: «Неизвестный персонаж» со значком типа, без имени и сведений;
//   чёрный — видит только Мастер;
//   закрытый — не на доске вообще (это «вне доски» из 0.27).
// Жёлтый режим хранится как «только Мастер» с дополнительным признаком. У блоков страницы свои режимы.
// Модуль загружается обычным <script> после entities.js.
'use strict';
const VIS_STATES=[
  ['all','Видно всем','игроки видят всё'],
  ['named','Видны имя и тип','игроки видят серые нити без подписей к известным сущностям'],
  ['hint','Игроки видят, что что-то есть','без имени и сведений — «Неизвестный…» со значком типа'],
  ['gm','Только Мастер','игроки не видят совсем'],
  ['off','Не на доске','убрана с доски и для Мастера (вне доски)']
];
function entityVis(e){if(!e)return 'all';if(entityOffBoard(e))return 'off';if(entityNamedVisibility(e))return 'named';return e.vis==='gm'||e.vis==='hint'?e.vis:'all'}
function blockVis(e,secId){const v=e?.blockVis?.[secId];return v==='gm'||v==='hint'?v:'all'}
function visEyeSvg(v){
  const shut=v==='off';
  return `<svg class="visEye v-${v}" viewBox="0 0 24 16" aria-hidden="true">${shut?'<path d="M2 8c3 4 7 6 10 6s7-2 10-6" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M5 11l-2 2M12 14v3M19 11l2 2" stroke-width="1.6" stroke-linecap="round"/>':'<path d="M1.5 8C4.5 3 8 1.5 12 1.5S19.5 3 22.5 8C19.5 13 16 14.5 12 14.5S4.5 13 1.5 8Z" stroke-width="1.5"/><circle cx="12" cy="8" r="3.4"/>'}</svg>`;
}
// data-vis-set="<ids>|<state>" — one handler for every place
function visRowHtml(ids,cur,{label=true}={}){
  // 0.28.2: the root of the world is seen by everyone — its eyes used to be shown but did nothing (screenshot 4, 21.10.2026)
  const root=typeof currentRootId==='function'?currentRootId():null;ids=ids.filter(id=>id!==root);
  if(!ids.length)return `<div class="visRow visRoot" role="note">${visEyeSvg('all')}<span class="visNow">Корень мира видят все</span></div>`;
  const key=escapeHtml(ids.join(','));
  return `<div class="visRow" role="group" aria-label="Кто видит">${label?'<span class="visLabel">Кто видит:</span>':''}${VIS_STATES.map(([v,name,hint])=>`<button type="button" class="visBtn${v===cur?' on':''}" data-vis-set="${key}|${v}" aria-pressed="${v===cur}" title="${escapeHtml(name+' — '+hint)}">${visEyeSvg(v)}</button>`).join('')}${label?`<span class="visNow">${escapeHtml(VIS_STATES.find(s=>s[0]===cur)?.[1]||'')}</span>`:''}</div>`;
}
// one edit — one Ctrl+Z
function setEntitiesVis(ids,v){
  if(uiIsPlayer())return 0;

  if(!VIS_STATES.some(s=>s[0]===v))return 0;
  const list=[...new Set(ids||[])].map(getEntity).filter(e=>e&&e.id!==currentRootId()&&entityVis(e)!==v);if(!list.length)return 0;
  const snap=snapshotWorkspaceMutation();
  for(const e of list){
    if(v==='off'){e.offBoard=true;delete e.onBoard;continue}
    entityBackOnBoard(e);
    if(v==='named'){e.vis='gm';e.namedVisibility=true;continue}
    delete e.namedVisibility;
    if(v==='all')delete e.vis;else e.vis=v;
  }
  state.viewVersion=(state.viewVersion||0)+1;
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return 0}
  updateUI();return list.length;
}
function setBlockVis(id,secId,v){
  if(uiIsPlayer())return false;

  const e=getEntity(id);if(!e||!['all','hint','gm'].includes(v)||blockVis(e,secId)===v)return false;const snap=snapshotWorkspaceMutation();
  e.blockVis=isRecord(e.blockVis)?e.blockVis:{};if(v==='all')delete e.blockVis[secId];else e.blockVis[secId]=v;if(!Object.keys(e.blockVis).length)delete e.blockVis;
  state.viewVersion=(state.viewVersion||0)+1;
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return false}
  updateUI();return true;
}
function visToastText(n,v,e){const name=VIS_STATES.find(s=>s[0]===v)?.[1]||'';return n===1&&e?`«${e.name}»: ${name.toLowerCase()}`:`${name}: ${n}`}
document.addEventListener('click',ev=>{
  const sv=ev.target instanceof Element?ev.target.closest('[data-sec-vis]'):null;
  if(sv){ev.preventDefault();ev.stopPropagation();const [id,sec]=sv.dataset.secVis.split('|'),e=getEntity(id);if(!e)return;const order=['all','hint','gm'],next=order[(order.indexOf(blockVis(e,sec))+1)%3];if(setBlockVis(id,sec,next))toast(`Блок: ${(VIS_STATES.find(s=>s[0]===next)?.[1]||'').toLowerCase()}`,'ok');return}
  const b=ev.target instanceof Element?ev.target.closest('[data-vis-set]'):null;if(!b)return;ev.preventDefault();ev.stopPropagation();
  const [ids,v]=b.dataset.visSet.split('|'),list=ids.split(',').filter(Boolean);
  if(b.dataset.visBlock){if(setBlockVis(list[0],b.dataset.visBlock,v))toast(`Блок: ${(VIS_STATES.find(s=>s[0]===v)?.[1]||'').toLowerCase()}`,'ok');return}
  const n=setEntitiesVis(list,v);if(n)toast(visToastText(n,v,getEntity(list[0])),'ok');
  if(b.closest('#contextMenu'))hideContextMenu();
},true);
