// Universe Graph — важность связей (0.20.5). Пять уровней: 1 «Ключевая» … 5 «Фон».
// Уровень задаётся типу связи (по умолчанию для всех его связей) и, при желании, каждой связи отдельно.
// Уровни можно прятать — во всех видах сразу (graph.js: relationShown). Названия уровней — свои у каждого пространства.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';

const REL_TIER_WIDTH=[1.35,1.15,1,.85,.7];
const REL_TIER_MARK=['I','II','III','IV','V'];
// Called by normalize.js for every workspace.
function normalizeRelationTiers(ws){
  const num=v=>{const n=Math.round(Number(v));return n>=1&&n<=5?n:0};
  if(ws.relationTiers!==undefined){const list=Array.isArray(ws.relationTiers)?ws.relationTiers.slice(0,5).map(x=>String(x??'').trim().slice(0,40)):[];if(list.some(Boolean))ws.relationTiers=list;else delete ws.relationTiers}
  for(const t of Array.isArray(ws.relationTypes)?ws.relationTypes:[]){if(t.tier===undefined)continue;const n=num(t.tier);if(n)t.tier=n;else delete t.tier} /* 0.28.2: «Содержит» has an importance too (decision 21.10.2026) */
  for(const r of Array.isArray(ws.relations)?ws.relations:[]){if(!isRecord(r)||r.tier===undefined)continue;const n=num(r.tier);if(n)r.tier=n;else delete r.tier}
}
function relationTierName(n){return relationTierNames()[n-1]||String(n)}
// <option>s for a tier select. inherit = label of the «as the type says» choice (for a single relation).
function tierOptionsHtml(selected,inherit){
  const names=relationTierNames();
  return (inherit?`<option value="">${escapeHtml(inherit)}</option>`:'')+names.map((n,i)=>`<option value="${i+1}" ${Number(selected)===i+1?'selected':''}>${REL_TIER_MARK[i]} · ${escapeHtml(n)}</option>`).join('');
}
function relationTypeTier(rt){const t=Number(rt?.tier);return t>=1&&t<=5?t:3}
function setTiersHidden(list){state.hiddenTiers=new Set(list);state.viewVersion++;updateUI();scheduleViewPersist()}
function toggleTier(n){const s=new Set(state.hiddenTiers);if(s.has(n))s.delete(n);else s.add(n);if(s.size===5){toast('Все уровни скрыть нельзя — хотя бы один остаётся','err');return}setTiersHidden([...s])}
// Shows tiers 1..n, hides the rest.
function showTiersUpTo(n){setTiersHidden([1,2,3,4,5].filter(x=>x>n))}

function openTierNamesEditor(){
  const names=relationTierNames();
  openModal('Уровни важности связей',`<div class="form"><div class="inlineHelp">Пять уровней — от самых важных связей (I) до фоновых (V). Каждому типу связи можно задать уровень в «Правилах», а каждой связи — свой в её редакторе. Скрытые уровни не видны ни в одном виде.</div>${names.map((n,i)=>`<div class="row tierNameRow"><div><label>&nbsp;</label><b class="tagChip">${REL_TIER_MARK[i]}</b></div><div><label>Уровень ${i+1}</label><input class="tierName" maxlength="40" value="${escapeHtml(n)}" placeholder="${escapeHtml(REL_TIER_DEFAULT_NAMES[i])}"></div></div>`).join('')}</div>`,`<button class="btn" id="tierReset" type="button">Как было</button><button class="btn" id="cancelModal" type="button">Отмена</button><button class="btn primary" id="tierSave" type="button">Сохранить</button>`);
  $('#cancelModal').onclick=closeModal;
  $('#tierReset').onclick=()=>$$('.tierName').forEach((x,i)=>x.value=REL_TIER_DEFAULT_NAMES[i]);
  $('#tierSave').onclick=()=>{
    const list=$$('.tierName').map((x,i)=>x.value.trim()===REL_TIER_DEFAULT_NAMES[i]?'':x.value.trim().slice(0,40));
    const before=clone(data),bs=snapshotMutationState(),ws=currentWorkspace();
    if(list.some(Boolean))ws.relationTiers=list;else delete ws.relationTiers;
    state.viewVersion++;if(!persist()){restoreWorkspaceMutation(before,bs);updateUI();toast('Не удалось сохранить названия','err');return}
    closeModal();updateUI();toast('Названия уровней сохранены','ok');
  };
}
// Quick change from the relation's own panel.
function setRelationTier(id,tier){
  const r=data.relations.find(x=>x.id===id);if(!r)return false;
  const before=clone(data),bs=snapshotMutationState();
  if(tier>=1&&tier<=5)r.tier=tier;else delete r.tier;
  state.viewVersion++;if(!persist()){restoreWorkspaceMutation(before,bs);updateUI();toast('Не удалось сохранить важность','err');return false}
  updateUI();if(tier&&state.hiddenTiers?.has(tier))toast(`Уровень «${relationTierName(tier)}» сейчас скрыт — связь не видна на карте`,'ok');return true;
}
function relationTierControlHtml(r){
  if(!r)return '';
  const own=Number(r.tier)>=1;
  return `<div class="tierControl"><label for="relTierQuick">Важность</label><select id="relTierQuick" data-rel-tier="${escapeHtml(r.id)}">${tierOptionsHtml(own?r.tier:'',`как у типа: ${REL_TIER_MARK[relationTypeTier(getRT(r.type))-1]} · ${relationTierName(relationTypeTier(getRT(r.type)))}`)}</select></div>`;
}

document.addEventListener('click',ev=>{
  const t=ev.target instanceof Element?ev.target:null;if(!t)return;
  const tg=t.closest('[data-tier-toggle]');if(tg){ev.preventDefault();toggleTier(Number(tg.dataset.tierToggle));return}
  const up=t.closest('[data-tier-upto]');if(up){ev.preventDefault();showTiersUpTo(Number(up.dataset.tierUpto));return}
  if(t.closest('[data-tier-rename]')){ev.preventDefault();openTierNamesEditor()}
});
document.addEventListener('change',ev=>{const t=ev.target;if(t instanceof HTMLSelectElement&&t.matches('[data-rel-tier]'))setRelationTier(t.dataset.relTier,Number(t.value)||0)});
