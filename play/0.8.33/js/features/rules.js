// Universe Graph — окно «Набор правил» (0.17): типы записей, типы связей, статусы, поля анкет,
// пресеты, сохранение набора в файл и сброс до нуля. Набор правил у каждого пространства свой.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён.
'use strict';
let rulesTab='types';
// Runs a change to the rule set with the usual safety: on a failed save everything is put back.
function commitRulesChange(change,okText){
  if(worldReadOnly())return false;

  const before=clone(data),beforeState=snapshotMutationState();
  try{change()}catch(error){restoreWorkspaceMutation(before,beforeState);updateUI();toast(error?.message||'Не удалось изменить набор правил','err');return false}
  normalize();takeRepairs();state.viewVersion++;
  if(!persist()){restoreWorkspaceMutation(before,beforeState);updateUI();toast('Не удалось сохранить набор правил — состояние восстановлено','err');return false}
  updateUI();if(okText)toast(okText,'ok');return true;
}
function countByType(typeId){return data.entities.filter(e=>(e.type||'')===typeId).length}
function countByRelationType(typeId){return data.relations.filter(r=>r.type===typeId).length}
function statusGroupApplies(g){return g.appliesTo?.length?g.appliesTo.map(id=>getET(id).name).join(', '):'все типы'}
function rulesPlayerMode(){return worldReadOnly()}
function rulesTabAllowed(tab){return !rulesPlayerMode()||tab==='tags'}
function openRulesModal(tab=rulesTab){
  if(!rulesTabAllowed(tab)){if(rulesPlayerMode())toast('В режиме игрока доступны только теги','err');return false}
  if(typeof rulesFromPanel!=='undefined')rulesFromPanel=false;
  if(tab!==rulesTab)rulesQuery='';rulesTab=tab;
  const ws=currentWorkspace(),preset=RULE_PRESETS[ws?.rulesPreset]?.name;
  const allTabs=[['types','Типы сущностей',data.entityTypes.length],['relations','Связи',data.relationTypes.length],['statuses','Статусы',data.statusGroups.length],...(typeof allTags==='function'?[['tags','Теги',allTags().length]]:[]),['presets','Пресеты и сброс','']];
  const tabs=rulesPlayerMode()?allTabs.filter(([id])=>id==='tags'):allTabs;
  const body=`<div class="rulesHead"><div><b>${escapeHtml(ws?.name||'Пространство')}</b><small>${preset?'Основа: пресет «'+escapeHtml(preset)+'»':'Свой набор правил'} · правила действуют только в этой рабочей зоне</small></div></div>
    <div class="rulesTabs" role="tablist">${tabs.map(([id,name,n])=>`<button type="button" class="rulesTab ${id===tab?'active':''}" data-rules-tab="${id}" role="tab" aria-selected="${id===tab}">${escapeHtml(name)}${n!==''?`<span>${n}</span>`:''}</button>`).join('')}</div>
    <div class="rulesBody">${rulesTabHtml(tab)}</div>`;
  openModal('Набор правил',body,'<button class="btn" id="closeTypes">Закрыть</button>');
  $('#closeTypes').onclick=closeModal;
  bindRulesModal();
  return true;
}
// Rebuild an open rules dialog when switching between the Master's view and the player preview.
function rulesSyncViewAccess(wasOpen=false){
  if(wasOpen)openRulesModal(rulesPlayerMode()?'tags':rulesTab);
}
// 0.28.3: a long list is shown as groups first (user, 21.10.2026, screenshot 10: «слишком много связей, сущностей и статусов —
// сперва распределение по типам/важностям, потом нажать — раскрыть — список»): relation types by importance (I–V), record types by kind
// (or the group set in the type), status groups — scales / marks. A search field finds across all groups. Short lists (≤ 6) stay plain.
// item — the row of one type (the same buttons as before); the result goes inside the list block.
// «1 связь», «3 связи», «14 связей»
function rulesNum(n,one,few,many){const a=Math.abs(n)%100,b=a%10;return `${n} ${a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many}`}
const RULES_LINE_NAMES={solid:'сплошная',dash:'пунктир',dot:'точки',longdash:'длинный пунктир',dashdot:'штрих-точка',dense:'плотный пунктир',double:'двойная'};
const RULES_GROUP_MIN=7;let rulesOpenGroups=new Set(),rulesQuery='';
const RULES_ET_KINDS=[['Люди, семьи, фракции',/персон|торгов|бож|нпс|npc|герой|злоде|сущест|сем|дом(?![а-яё])|род(?![а-яё])|фракц|орден|гильд|организ|народ|раса/i],['Места',/мир|вселен|госуд|город|мест|регион|стран|планет|район|здан|локац|королев|земл/i],['Вещи',/предмет|артефакт|оруж|вещ|ресурс|сокровищ/i],['События и задачи',/событ|квест|задач|мисси|сюжет|сесси|войн|битв/i]];
function entityTypeGroup(t){const own=String(t?.group||'').trim();if(own)return own;const n=String(t?.name||'');for(const [label,re] of RULES_ET_KINDS)if(re.test(n))return label;return 'Другое'}
// relation types: by importance when they have different ones; when all have the same (a fresh set — all «III»), by meaning
const RULES_RT_KINDS=[['Родство и семья',/родств|сем|брат|сестр|отец|мать|брак|супруг|ребен|ребён|дет|потомок|предок/i],['Отношения',/люб|вражд|союз|друж|ненавид|соперн|уваж|боит|довер/i],['Власть и принадлежность',/управл|владе|состо|служ|подчин|прав|глав|член|принадл|вассал/i],['Торговля и дела',/торгу|дела|долж|плат|нанял|контракт|постав/i],['Квесты и события',/квест|выдал|участ|событ|задан|наград|убил|спас/i],['Места',/живёт|живет|находит|расположен|родом|путешеств/i]];
function udTypeGroups(tab,items){
  const groups=new Map();
  for(const item of items){
    const name=String(item.name||'');
    const group=tab==='relations'?(item.containment?'Вложенность':String(item.group||'').trim()||
      RULES_RT_KINDS.find(([,pattern])=>pattern.test(name))?.[0]||'Другое'):entityTypeGroup(item);
    if(!groups.has(group))groups.set(group,[]);
    groups.get(group).push(item);
  }
  return [...groups].sort(([a],[b])=>a==='Вложенность'?-1:b==='Вложенность'?1:a==='Другое'?1:b==='Другое'?-1:a.localeCompare(b,'ru'));
}
function rulesRelByTier(){return new Set(data.relationTypes.map(relationTypeTier)).size>1}
function rulesGroupOf(tab,x){if(tab==='relations'){if(x.containment)return ['contain','Вложенность',0];if(rulesRelByTier()){const n=relationTypeTier(x);return [String(n),`${REL_TIER_MARK[n-1]} · ${relationTierName(n)}`,n]}const n=String(x.name||''),i=RULES_RT_KINDS.findIndex(k=>k[1].test(n));return i<0?['other','Другое',99]:[RULES_RT_KINDS[i][0],RULES_RT_KINDS[i][0],i+1]}if(tab==='statuses')return x.kind==='flags'?['flags','Метки',2]:['scale','Шкалы',1];const g=entityTypeGroup(x),i=RULES_ET_KINDS.findIndex(k=>k[0]===g);return [g,g,i<0?(g==='Другое'?99:50):i]}
function rulesItemText(tab,x){return (tab==='statuses'?[x.name,...(x.options||[]).map(o=>o.name)]:[x.name,tab==='types'?entityTypeGroup(x):'']).join(' ').toLowerCase()}
function rulesGrouped(tab,list,item){
  if(list.length<RULES_GROUP_MIN)return list.map(item).join('');
  const q=rulesQuery.trim().toLowerCase();
  const search=`<input type="search" class="rulesSearch" id="rulesSearch" placeholder="Найти ${tab==='relations'?'тип связи':tab==='statuses'?'статус':'тип сущности'}…" value="${escapeHtml(rulesQuery)}" autocomplete="off">`;
  if(q){const hit=list.filter(x=>rulesItemText(tab,x).includes(q));return search+(hit.length?hit.map(item).join(''):'<div class="empty">Ничего не нашлось.</div>')}
  const groups=new Map();for(const x of list){const [k,label,order]=rulesGroupOf(tab,x);if(!groups.has(k))groups.set(k,{label,order,items:[]});groups.get(k).items.push(x)}
  const sorted=[...groups.entries()].sort((a,b)=>a[1].order-b[1].order||a[1].label.localeCompare(b[1].label,'ru'));
  const more=g=>tab==='relations'?rulesNum(g.items.reduce((n,t)=>n+countByRelationType(t.id),0),'связь','связи','связей'):tab==='types'?rulesNum(g.items.reduce((n,t)=>n+countByType(t.id),0),'сущность','сущности','сущностей'):rulesNum(g.items.reduce((n,x)=>n+(x.options||[]).length,0),'вариант','варианта','вариантов');
  return search+sorted.map(([k,g])=>{const key=tab+':'+k;return `<details class="rulesGroup" data-rules-group="${escapeHtml(key)}"${rulesOpenGroups.has(key)?' open':''}><summary><b>${escapeHtml(g.label)}</b><span class="rulesGroupN">${g.items.length}</span><small>${escapeHtml(more(g))} · ${escapeHtml(g.items.slice(0,4).map(x=>x.name).join(', '))}${g.items.length>4?'…':''}</small></summary><div class="stack">${g.items.map(item).join('')}</div></details>`}).join('');
}
function rulesTabHtml(tab){
  if(tab==='tags'&&typeof tagsTabHtml==='function')return tagsTabHtml(); // 0.29.4
  if(tab==='types')return `<div class="rulesIntro">Типы — это виды сущностей вашего мира: город, персонаж, квест… У каждого типа своё оформление и своя анкета.</div><div class="buttonGrid"><button class="btn primary" id="newET">＋ Тип сущности</button></div><div class="stack typeList">${data.entityTypes.length?rulesGrouped('types',data.entityTypes,t=>`<div class="listItem"><div class="listIcon" style="color:${escapeHtml(safeCssValue(t.color,'#74b8ff'))}">${escapeHtml(t.icon||'•')}</div><div class="listMeta"><b>${escapeHtml(t.name)}</b><small>${rulesNum(countByType(t.id),'сущность','сущности','сущностей')} · полей анкеты: ${(t.fields||[]).length} · статусов: ${statusGroupsForType(t.id).length}</small></div><button class="iconBtn" data-page-et="${escapeHtml(t.id)}" title="Страница сущностей: разделы">▤</button><button class="iconBtn" data-edit-et="${escapeHtml(t.id)}" title="Изменить тип и анкету">✎</button><button class="iconBtn" data-del-et="${escapeHtml(t.id)}" title="Удалить тип">×</button></div>`):'<div class="empty">Типов пока нет. Сущности без типа показываются как «Без типа».</div>'}</div>`;
  if(tab==='relations')return `<div class="rulesIntro">Типы связей — это виды отношений: торгует, враждует, выдал квест… Вложенность («Содержит») есть всегда, но её можно переименовать и оформить по-своему.</div><div class="buttonGrid"><button class="btn primary" id="newRT">＋ Тип связи</button></div><div class="stack typeList">${rulesGrouped('relations',data.relationTypes,t=>`<div class="listItem"><div class="listIcon" style="color:${escapeHtml(safeCssValue(t.color,'#74b8ff'))}">━</div><div class="listMeta"><b>${escapeHtml(t.name)}</b><small>${t.containment?'вложенность · ':''}${rulesNum(countByRelationType(t.id),'связь','связи','связей')} · ${escapeHtml(RULES_LINE_NAMES[t.lineStyle||'solid']||t.lineStyle)}</small></div><button class="iconBtn" data-page-rt="${escapeHtml(t.id)}" title="Страница связей: разделы">▤</button><button class="iconBtn" data-edit-rt="${escapeHtml(t.id)}" title="Изменить">✎</button>${t.containment?'<span class="iconBtn ghostIcon" title="Вложенность нельзя удалить">🔒</span>':`<button class="iconBtn" data-del-rt="${escapeHtml(t.id)}" title="Удалить тип связи">×</button>`}</div>`)}</div>`;
  if(tab==='statuses')return `<div class="rulesIntro"><b>Шкала</b> — один вариант из нескольких (Жив / Ранен / Мёртв). <b>Метки</b> — сколько угодно сразу (Проклят, Отравлен). Группа может действовать на все типы или на выбранные.</div><div class="buttonGrid"><button class="btn primary" id="newSG">＋ Группа статусов</button></div><div class="stack typeList">${data.statusGroups.length?rulesGrouped('statuses',data.statusGroups,g=>`<div class="listItem statusGroupItem"><div class="listIcon">${g.kind==='flags'?'⚑':'◐'}</div><div class="listMeta"><b>${escapeHtml(g.name)}</b><small>${g.kind==='flags'?'метки':'шкала'} · ${escapeHtml(statusGroupApplies(g))}</small><div class="statusPreview">${g.options.map(o=>`<span class="statusChip" style="--status:${escapeHtml(safeCssValue(o.color,'#9aa8c6'))}">${o.icon?`<i>${escapeHtml(o.icon)}</i>`:''}${escapeHtml(o.name)}</span>`).join('')}</div></div><button class="iconBtn" data-edit-sg="${escapeHtml(g.id)}" title="Изменить группу">✎</button><button class="iconBtn" data-del-sg="${escapeHtml(g.id)}" title="Удалить группу">×</button></div>`):'<div class="empty">Статусов пока нет.</div>'}</div>`;
  return `<div class="rulesIntro">Пресет — готовый набор типов, связей, статусов и полей. Его можно <b>добавить</b> к своему набору (появится только недостающее) или <b>заменить</b> им набор целиком.</div><div class="presetCards">${PRESET_ORDER.map(id=>{const p=RULE_PRESETS[id];return `<div class="presetCard"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.description)}</small><small>${p.entityTypes.length} типов · ${p.relationTypes.length} связей · ${p.statusGroups.length} групп статусов</small><div class="presetActions"><button class="btn" data-preset-merge="${id}">Добавить к своему</button><button class="btn" data-preset-replace="${id}">Заменить набор</button></div></div>`}).join('')}</div>
    <div class="divider"></div><div class="presetActions"><button class="btn" id="rulesExport">Сохранить набор в файл</button><button class="btn" id="rulesImport">Загрузить набор из файла</button><input type="file" id="rulesImportFile" accept=".json,application/json" hidden></div>
    <div class="divider"></div><div class="dangerZone"><div><b>Очистить набор правил</b><small>Удалит все типы, связи и статусы этой рабочей зоны. Сущности останутся и станут «Без типа», связи — «Связь». Перед очисткой создаётся резервная копия.</small></div><button class="btn danger" id="rulesReset">Очистить</button></div>`;
}
function bindRulesModal(){
  if(typeof tagsUI!=='undefined')tagsUI.open=false;if(rulesTab==='tags'&&typeof bindTagsTab==='function')bindTagsTab();
  {const inp=$('#rulesSearch');if(inp)inp.oninput=()=>{rulesQuery=inp.value;const body=document.querySelector('.rulesBody');if(!body)return;const pos=inp.selectionStart;body.innerHTML=rulesTabHtml(rulesTab);bindRulesModal();const n=$('#rulesSearch');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch{}}}}
  $$('.rulesGroup').forEach(d=>d.ontoggle=()=>{if(d.open)rulesOpenGroups.add(d.dataset.rulesGroup);else rulesOpenGroups.delete(d.dataset.rulesGroup)});
  $$('[data-rules-tab]').forEach(b=>b.onclick=()=>openRulesModal(b.dataset.rulesTab));
  $('#newET')&&($('#newET').onclick=()=>openTypeEditor('entity'));
  $('#newRT')&&($('#newRT').onclick=()=>openTypeEditor('relation'));
  $('#newSG')&&($('#newSG').onclick=()=>openStatusGroupEditor());
  $$('[data-edit-et]').forEach(b=>b.onclick=()=>openTypeEditor('entity',b.dataset.editEt));
  $$('[data-edit-rt]').forEach(b=>b.onclick=()=>openTypeEditor('relation',b.dataset.editRt));
  $$('[data-edit-sg]').forEach(b=>b.onclick=()=>openStatusGroupEditor(b.dataset.editSg));
  $$('[data-page-et]').forEach(b=>b.onclick=()=>openPageTemplateEditor('entity',b.dataset.pageEt));
  $$('[data-page-rt]').forEach(b=>b.onclick=()=>openPageTemplateEditor('relation',b.dataset.pageRt));
  $$('[data-del-et]').forEach(b=>b.onclick=()=>deleteEntityType(b.dataset.delEt));
  $$('[data-del-rt]').forEach(b=>b.onclick=()=>deleteRelationType(b.dataset.delRt));
  $$('[data-del-sg]').forEach(b=>b.onclick=()=>deleteStatusGroup(b.dataset.delSg));
  $$('[data-preset-merge]').forEach(b=>b.onclick=()=>applyPresetRules(b.dataset.presetMerge,'merge'));
  $$('[data-preset-replace]').forEach(b=>b.onclick=()=>applyPresetRules(b.dataset.presetReplace,'replace'));
  $('#rulesExport')&&($('#rulesExport').onclick=exportRules);
  $('#rulesImport')&&($('#rulesImport').onclick=()=>$('#rulesImportFile').click());
  $('#rulesImportFile')&&($('#rulesImportFile').onchange=ev=>{const f=ev.target.files[0];ev.target.value='';if(f)importRulesFile(f)});
  $('#rulesReset')&&($('#rulesReset').onclick=resetRules);
}
function deleteEntityType(id,onDeleted=()=>openRulesModal('types')){
  const t=data.entityTypes.find(x=>x.id===id);if(!t)return;const n=countByType(id);
  if(!confirm(`Удалить тип «${t.name}»?${n?`\n\n${n} сущностей этого типа останутся и станут «Без типа».`:''}`))return;
  if(commitRulesChange(()=>{data.entityTypes.splice(data.entityTypes.indexOf(t),1);for(const e of data.entities)if(e.type===id)e.type=''},`Тип «${t.name}» удалён`))onDeleted();
}
function deleteRelationType(id,onDeleted=()=>openRulesModal('relations')){
  const t=data.relationTypes.find(x=>x.id===id);if(!t||t.containment)return;const n=countByRelationType(id);
  if(!confirm(`Удалить тип связи «${t.name}»?${n?`\n\n${n} связей этого типа останутся и станут обычной «Связью».`:''}`))return;
  if(commitRulesChange(()=>{data.relationTypes.splice(data.relationTypes.indexOf(t),1);const generic=ensureGenericRelationType();for(const r of data.relations)if(r.type===id)r.type=generic.id},`Тип связи «${t.name}» удалён`))onDeleted();
}
function deleteStatusGroup(id,onDeleted=()=>openRulesModal('statuses')){
  const g=data.statusGroups.find(x=>x.id===id);if(!g)return;const n=data.entities.filter(e=>e.status?.[id]!=null).length;
  if(!confirm(`Удалить группу статусов «${g.name}»?${n?`\n\nУ ${n} сущностей этот статус пропадёт.`:''}`))return;
  if(commitRulesChange(()=>{data.statusGroups.splice(data.statusGroups.indexOf(g),1)},`Группа «${g.name}» удалена`))onDeleted();
}
// merge: adds what is missing (by id and by name); replace: the preset becomes the whole rule set.
function mergeRuleSet(rules,mode){
  const ws=currentWorkspace();
  if(mode==='replace'){
    const contains=data.relationTypes.find(t=>t.containment);
    const presetContains=rules.relationTypes.find(t=>t.containment);
    // Keep the existing nesting relation's id so every «Содержит» link survives.
    if(contains&&presetContains){for(const r of data.relations)if(r.type===contains.id)r.type=presetContains.id}
    ws.udRuleGroups=normalizeUdRuleGroups(rules.udRuleGroups);
    ws.entityTypes=rules.entityTypes;ws.relationTypes=rules.relationTypes;ws.statusGroups=rules.statusGroups;
    applyWorkspaceRules(ws);ws.rulesPreset=rules.rulesPreset||null;
    return;
  }
  const importedGroups=normalizeUdRuleGroups(rules.udRuleGroups);
  if(Object.keys(importedGroups).length){
    const groups=normalizeUdRuleGroups(ws.udRuleGroups);
    for(const [tab,names] of Object.entries(importedGroups))groups[tab]=[...new Set([...(groups[tab]||[]),...names])];
    ws.udRuleGroups=groups;
  }
  const add=(list,items)=>{for(const x of items){if(x.containment)continue;if(list.some(y=>y.id===x.id||String(y.name).toLowerCase()===String(x.name).toLowerCase()))continue;list.push(x)}};
  // 0.18: a type that already exists but still has the default page gets the preset's ready-made page.
  for(const x of rules.entityTypes){if(!Array.isArray(x.page))continue;const y=data.entityTypes.find(t=>t.id===x.id||String(t.name).toLowerCase()===String(x.name).toLowerCase());if(y&&y.page===undefined)y.page=clone(x.page)}
  add(data.entityTypes,rules.entityTypes);add(data.relationTypes,rules.relationTypes);add(data.statusGroups,rules.statusGroups);
  // Fields of types that already exist: add the missing ones.
  for(const t of rules.entityTypes){const mine=data.entityTypes.find(y=>y.id===t.id||String(y.name).toLowerCase()===String(t.name).toLowerCase());if(!mine||mine===t||!t.fields)continue;mine.fields=mine.fields||[];for(const f of t.fields)if(!mine.fields.some(x=>x.name.toLowerCase()===f.name.toLowerCase()))mine.fields.push(clone(f))}
}
function applyWorkspaceRules(ws){data.entityTypes=ws.entityTypes;data.relationTypes=ws.relationTypes;data.statusGroups=ws.statusGroups}
function applyPresetRules(id,mode){
  const p=RULE_PRESETS[id];if(!p)return;
  if(mode==='replace'&&!confirm(`Заменить набор правил пресетом «${p.name}»?\n\nСущности останутся. Те, чьих типов нет в пресете, станут «Без типа»; связи неизвестных типов — «Связью»; статусы, которых нет в пресете, пропадут. Перед заменой создаётся резервная копия.`))return;
  if(mode==='replace'&&!createSafetyBackup('pre-rules'))return;
  if(commitRulesChange(()=>mergeRuleSet(presetRules(id),mode),mode==='replace'?`Набор правил заменён: «${p.name}»`:`Добавлено недостающее из «${p.name}»`))openRulesModal('presets');
}
function resetRules(){
  if(!confirm('Очистить набор правил этой рабочей зоны?\n\nВсе типы, связи и статусы будут удалены. Сущности останутся и станут «Без типа», связи — «Связь». Перед очисткой создаётся резервная копия.'))return;
  if(!createSafetyBackup('pre-rules-reset'))return;
  if(commitRulesChange(()=>{
    const ws=currentWorkspace(),contains=data.relationTypes.find(t=>t.containment)||containmentTypeTemplate();
    const generic={id:uid('rtype'),name:'Связь',color:'#91a4c7',width:2,lineStyle:'solid',arrow:false,animated:false,_systemGeneric:true};
    for(const r of data.relations)if(r.type!==contains.id)r.type=generic.id;
    for(const e of data.entities){e.type='';delete e.status}
    ws.entityTypes=[];ws.relationTypes=data.relations.some(r=>r.type===generic.id)?[contains,generic]:[contains];ws.statusGroups=[];delete ws.udRuleGroups;ws.rulesPreset=null;
    applyWorkspaceRules(ws);
  },'Набор правил очищен — можно собирать свой с нуля'))openRulesModal('types');
}
// File names stay in Latin letters: some browsers replace a Cyrillic download name with «download».
const TRANSLIT={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
function asciiFileName(name){return String(name).toLowerCase().replace(/[а-яё]/g,c=>TRANSLIT[c]??'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'set'}
function exportRules(){
  const ws=currentWorkspace();
  const doc={kind:'universe-graph-rules',version:1,name:ws?.name||'Набор правил',entityTypes:clone(data.entityTypes),relationTypes:clone(data.relationTypes),statusGroups:clone(data.statusGroups),...(ws?.udRuleGroups?{udRuleGroups:clone(ws.udRuleGroups)}:{})};
  downloadText(JSON.stringify(doc,null,2),`universe-graph-rules-${asciiFileName(ws?.name||'set')}.json`);
  toast('Набор правил сохранён в файл','ok');
}
function importRulesFile(file){
  const rd=new FileReader();
  rd.onload=()=>{
    let doc;try{doc=JSON.parse(String(rd.result))}catch{toast('Это не файл набора правил','err');return}
    // A whole world file works too: its first workspace's rules are taken.
    const src=doc?.kind==='universe-graph-rules'?doc:(Array.isArray(doc?.workspaces)&&doc.workspaces[0]?.entityTypes?doc.workspaces[0]:doc);
    if(!Array.isArray(src?.entityTypes)&&!Array.isArray(src?.relationTypes)){toast('В файле нет набора правил','err');return}
    const rules={entityTypes:clone(src.entityTypes||[]),relationTypes:clone(src.relationTypes||[]),statusGroups:clone(src.statusGroups||[]),udRuleGroups:normalizeUdRuleGroups(src.udRuleGroups),rulesPreset:null};
    if(!rules.relationTypes.some(t=>t?.containment))rules.relationTypes.unshift(containmentTypeTemplate());
    const replace=confirm('Заменить свой набор правил набором из файла?\n\nОК — заменить целиком (с резервной копией).\nОтмена — только добавить недостающее.');
    if(replace&&!createSafetyBackup('pre-rules'))return;
    if(commitRulesChange(()=>mergeRuleSet(rules,replace?'replace':'merge'),replace?'Набор правил заменён набором из файла':'Добавлено недостающее из файла'))openRulesModal(rulesTab);
  };
  rd.onerror=()=>toast('Не удалось прочитать файл','err');rd.readAsText(file);
}

// ---- Status group editor ----
function statusOptionRow(o={}){
  const color=o.color||'#9aa8c6';
  return `<div class="statusOptionRow">
    <button type="button" class="iconBtn soGrip" title="Перетащить · Alt+↑/↓" aria-label="Переместить вариант" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">⠿</button>
    <input class="soName" value="${escapeHtml(o.name||'')}" placeholder="Название">
    <input class="soColor colorInput" type="color" value="${cssRgbHex(color)}" data-so-color="${escapeHtml(color)}" title="Цвет">
    <input class="soIcon" value="${escapeHtml(o.icon||'')}" maxlength="4" placeholder="Знак" title="Значок (1–2 символа)">
    <select class="soEffect" title="Как статус меняет узел на карте">${STATUS_EFFECTS.map(([id,name])=>`<option value="${id}" ${id===(o.effect||'none')?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select>
    <input type="hidden" class="soId" value="${escapeHtml(o.id||'')}">
    <button type="button" class="iconBtn soDel" title="Убрать вариант">×</button>
  </div>`;
}

function bindStatusOptionOrder(list){
  const scroll=list.closest('.udSetScroll,.modalBody');
  let drag=null,marked=null,frame=0;
  const clearMark=()=>{
    if(marked)delete marked.dataset.soDrop;
    marked=null;
  };
  const destination=()=>{
    if(!list.contains(document.elementFromPoint(drag.x,drag.y)))return null;
    const rows=[...list.children].filter(row=>row!==drag.row);
    const next=rows.find(row=>{
      const rect=row.getBoundingClientRect();
      return drag.y<rect.top+rect.height/2;
    });
    return {row:next||rows.at(-1),before:!!next};
  };
  const mark=()=>{
    const target=destination();
    clearMark();
    if(!target?.row)return;
    marked=target.row;
    marked.dataset.soDrop=target.before?'before':'after';
  };
  const end=(target=null)=>{
    if(!drag)return;
    const {id,grip,row,keys}=drag;
    drag=null;
    keys.abort();
    cancelAnimationFrame(frame);
    clearMark();
    row.classList.remove('soDragging');
    if(grip.hasPointerCapture(id))grip.releasePointerCapture(id);
    if(target?.row){
      list.insertBefore(row,target.before?target.row:target.row.nextElementSibling);
      grip.focus({preventScroll:true});
    }
  };
  const autoscroll=now=>{
    if(!list.isConnected){end();return}
    // Move by elapsed time so a slow paint does not stall a long drag.
    const elapsed=clamp(now-(drag.scrollAt??now-1000/60),0,50)/(1000/60);
    drag.scrollAt=now;
    if(drag.active&&scroll){
      const {top,bottom,left,right}=scroll.getBoundingClientRect(),{x,y}=drag;
      if(x>=left&&x<=right&&y>=top&&y<=bottom){
        const bounds=list.getBoundingClientRect();
        const down=Math.max(0,bounds.bottom-bottom);
        const up=Math.max(0,top-bounds.top);
        const step=clamp((y-bottom+28)*elapsed/3,0,Math.min(9*elapsed,down))-
          clamp((top+28-y)*elapsed/3,0,Math.min(9*elapsed,up));
        if(Math.abs(step)>.5){scroll.scrollTop+=Math.round(step);mark()}
      }
    }
    frame=requestAnimationFrame(autoscroll);
  };
  list.addEventListener('pointerdown',event=>{
    const grip=event.target.closest('.soGrip');
    if(!grip||drag||event.button!==0||list.childElementCount<2)return;
    event.preventDefault();
    grip.focus({preventScroll:true});
    const {pointerId:id,clientX:x,clientY:y}=event,keys=new AbortController();
    drag={id,x,y,startX:x,startY:y,row:grip.closest('.statusOptionRow'),grip,keys,active:false};
    grip.setPointerCapture(id);
    window.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      event.preventDefault();
      event.stopImmediatePropagation();
      end();
    },{capture:true,signal:keys.signal});
    frame=requestAnimationFrame(autoscroll);
  });
  list.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active){
      if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<4)return;
      drag.active=true;
      drag.row.classList.add('soDragging');
    }
    mark();
  });
  list.addEventListener('pointerup',event=>{
    if(drag?.id!==event.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    end(drag.active?destination():null);
  });
  for(const type of ['pointercancel','lostpointercapture']){
    list.addEventListener(type,event=>{if(drag?.id===event.pointerId)end()});
  }
  list.addEventListener('keydown',event=>{
    if(drag||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!event.target.matches('.soGrip'))return;
    event.preventDefault();
    event.stopPropagation();
    const grip=event.target,row=grip.closest('.statusOptionRow'),up=event.key==='ArrowUp';
    const other=up?row.previousElementSibling:row.nextElementSibling;
    if(!other)return;
    list.insertBefore(row,up?other:other.nextElementSibling);
    grip.focus();
  });
}

function readStatusOptions(list){
  return [...list.children].map(row=>{
    const color=row.querySelector('.soColor');
    return {
      id:row.querySelector('.soId').value||uid('st'),
      name:row.querySelector('.soName').value.trim(),
      color:color.value===color.defaultValue?color.dataset.soColor:color.value,
      icon:row.querySelector('.soIcon').value.trim(),
      effect:row.querySelector('.soEffect').value,
    };
  }).filter(option=>option.name);
}
function openStatusGroupEditor(id){
  const g=id?data.statusGroups.find(x=>x.id===id):null;
  openModal(g?'Группа статусов':'Новая группа статусов',`<div class="form"><div class="customizerGrid"><div><label>Название группы</label><input id="sgName" value="${escapeHtml(g?.name||'')}" placeholder="Например, Жизнь"></div><div><label>Вид</label><div class="segmented"><label><input type="radio" name="sgKind" value="scale" ${g?.kind!=='flags'?'checked':''}> Шкала — один из вариантов</label><label><input type="radio" name="sgKind" value="flags" ${g?.kind==='flags'?'checked':''}> Метки — несколько сразу</label></div></div></div>
    <div><label>Для каких типов</label><div class="typeChecks">${data.entityTypes.map(t=>`<label><input type="checkbox" class="sgType" value="${escapeHtml(t.id)}" ${g?.appliesTo?.includes(t.id)?'checked':''}> ${escapeHtml(t.icon||'•')} ${escapeHtml(t.name)}</label>`).join('')||'<span class="empty">Типов нет — группа будет действовать на все сущности.</span>'}</div><div class="inlineHelp">Ничего не отмечено — группа действует на все типы.</div></div>
    <div><label>Варианты</label><div id="sgOptions" class="stack">${(g?.options||[{},{}]).map(statusOptionRow).join('')}</div><button type="button" class="btn" id="sgAddOption" style="margin-top:7px">＋ Вариант</button></div></div>`,`<button class="btn" id="cancelModal">Отмена</button><button class="btn primary" id="saveStatusGroup">Сохранить</button>`);
  $('#cancelModal').onclick=()=>rulesBack('statuses');
  const list=$('#sgOptions');
  bindStatusOptionOrder(list);
  list.addEventListener('click',event=>event.target.closest('.soDel')?.closest('.statusOptionRow').remove());
  $('#sgAddOption').onclick=()=>list.insertAdjacentHTML('beforeend',statusOptionRow());
  $('#saveStatusGroup').onclick=()=>{
    const name=$('#sgName').value.trim();if(!name){toast('Назовите группу статусов','err');$('#sgName').focus();return}
    const options=readStatusOptions(list);
    if(!options.length){toast('Добавьте хотя бы один вариант','err');return}
    const next={id:g?.id||uid('sg'),name,kind:document.querySelector('input[name="sgKind"]:checked')?.value==='flags'?'flags':'scale',appliesTo:$$('.sgType').filter(x=>x.checked).map(x=>x.value),options};
    if(commitRulesChange(()=>{if(g)Object.assign(g,next);else data.statusGroups.push(next)},`Статусы «${name}» сохранены`))rulesBack('statuses');
  };
}

// ---- Questionnaire fields inside the entity type editor ----
function fieldRowHtml(f={}){
  const kinds=FIELD_KINDS.map(([id,name])=>`<option value="${id}" ${id===(f.kind||'text')?'selected':''}>${escapeHtml(name)}</option>`).join('');
  const refTypes=`<option value="">Любая сущность</option>`+data.entityTypes.map(t=>`<option value="${escapeHtml(t.id)}" ${t.id===f.refType?'selected':''}>${escapeHtml(t.name)}</option>`).join('');
  return `<div class="fieldDefRow" data-kind="${escapeHtml(f.kind||'text')}"><input class="fdName" value="${escapeHtml(f.name||'')}" placeholder="Вопрос анкеты, например «Раса»"><select class="fdKind">${kinds}</select><input class="fdOptions" value="${escapeHtml((f.options||[]).join(', '))}" placeholder="Варианты через запятую"><select class="fdRef">${refTypes}</select><input type="hidden" class="fdId" value="${escapeHtml(f.id||'')}"><button type="button" class="iconBtn fdDel" title="Убрать поле">×</button></div>`;
}
function fieldsEditorHtml(fields){return `<div class="customizerSection"><h4>Анкета типа</h4><div class="inlineHelp">Вопросы, на которые отвечает каждая сущность этого типа. Ответы видны в карточке сущности и в поиске.</div><div id="fieldDefs" class="stack" style="margin-top:8px">${(fields||[]).map(fieldRowHtml).join('')}</div><button type="button" class="btn" id="addFieldDef" style="margin-top:7px">＋ Поле анкеты</button></div>`}
function bindFieldsEditor(root=document){
  const rows=()=>[...root.querySelectorAll('.fieldDefRow')];
  const sync=row=>{row.dataset.kind=row.querySelector('.fdKind').value};
  const bind=()=>rows().forEach(row=>{row.querySelector('.fdDel').onclick=()=>row.remove();row.querySelector('.fdKind').onchange=()=>sync(row)});
  bind();root.querySelector('#addFieldDef').onclick=()=>{root.querySelector('#fieldDefs').insertAdjacentHTML('beforeend',fieldRowHtml());bind();rows().at(-1)?.querySelector('.fdName').focus()};
}
function readFieldsEditor(root=document){
  const seen=new Set();
  return [...root.querySelectorAll('.fieldDefRow')].map(row=>{const name=row.querySelector('.fdName').value.trim();if(!name||seen.has(name.toLowerCase()))return null;seen.add(name.toLowerCase());const kind=row.querySelector('.fdKind').value;const f={id:row.querySelector('.fdId').value||uid('field'),name,kind};if(kind==='choice')f.options=row.querySelector('.fdOptions').value.split(',').map(x=>x.trim()).filter(Boolean);if(kind==='ref')f.refType=row.querySelector('.fdRef').value;return f}).filter(Boolean);
}
// A renamed field keeps its answers: the property is renamed in every record of the type.
function applyFieldRenames(typeId,oldFields,newFields,list=data.entities){
  const byId=new Map((oldFields||[]).map(f=>[f.id,f.name]));
  const moves=newFields.map(f=>[byId.get(f.id),f.name]).filter(([from,to])=>from&&from!==to);
  if(!moves.length)return true;
  const sources=new Set(moves.map(([from])=>from)),changes=[];
  for(const e of list){
    const props=e.properties;
    if(e.type!==typeId||!props)continue;
    const writes=moves.filter(([from])=>Object.hasOwn(props,from));
    if(writes.some(([,to])=>Object.hasOwn(props,to)&&!sources.has(to)))return false;
    if(writes.length)changes.push([e,writes.map(([from,to])=>[to,props[from]])]);
  }
  for(const [e,writes] of changes){
    const kept=Object.entries(e.properties).filter(([name])=>!sources.has(name));
    e.properties=Object.fromEntries([...kept,...writes]);
  }
  return true;
}

// ---- Statuses and questionnaire inside the entity editor ----
function entityStatusEditorHtml(typeId,status){
  const groups=statusGroupsForType(typeId);
  if(!groups.length)return '<div class="inlineHelp">У этого типа нет статусов. Их можно добавить в «Правила → Статусы».</div>';
  return groups.map(g=>{const cur=status?.[g.id];const on=id=>g.kind==='flags'?Array.isArray(cur)&&cur.includes(id):cur===id;return `<div class="statusEditGroup" data-group="${escapeHtml(g.id)}" data-kind="${g.kind}"><small>${escapeHtml(g.name)}${g.kind==='flags'?' · можно несколько':''}</small><div class="statusPick">${g.options.map(o=>`<button type="button" class="statusChip pick ${on(o.id)?'on':''}" style="--status:${escapeHtml(safeCssValue(o.color,'#9aa8c6'))}" data-option="${escapeHtml(o.id)}" aria-pressed="${on(o.id)}">${o.icon?`<i>${escapeHtml(o.icon)}</i>`:''}${escapeHtml(o.name)}</button>`).join('')}</div></div>`}).join('');
}
function bindEntityStatusEditor(host){host?.addEventListener('click',ev=>{const b=ev.target.closest('.statusChip.pick');if(!b)return;const grp=b.closest('.statusEditGroup');if(grp.dataset.kind!=='flags')grp.querySelectorAll('.statusChip.pick').forEach(x=>{if(x!==b){x.classList.remove('on');x.setAttribute('aria-pressed','false')}});b.classList.toggle('on');b.setAttribute('aria-pressed',String(b.classList.contains('on')))})}
function readEntityStatusEditor(host,previous){
  // Statuses of groups that do not apply to the chosen type are kept (they return if the type comes back).
  const out=isRecord(previous)?clone(previous):{};
  host?.querySelectorAll('.statusEditGroup').forEach(grp=>{const on=[...grp.querySelectorAll('.statusChip.pick.on')].map(b=>b.dataset.option);if(grp.dataset.kind==='flags'){if(on.length)out[grp.dataset.group]=on;else delete out[grp.dataset.group]}else{if(on[0])out[grp.dataset.group]=on[0];else delete out[grp.dataset.group]}});
  return Object.keys(out).length?out:undefined;
}
function entityFieldsFormHtml(typeId,props,selfId){return fieldsFormHtml(getET(typeId).fields||[],props,selfId)}
function fieldsFormHtml(fields,props,selfId){
  if(!fields.length)return '';
  return fields.map(f=>{const v=props?.[f.name];const name=escapeHtml(f.name);const attr=`data-field-name="${name}" data-field-kind="${f.kind}"`;let input;
    if(f.kind==='longtext')input=`<textarea class="fieldValue" ${attr} rows="3">${escapeHtml(v??'')}</textarea>`;
    else if(f.kind==='number')input=`<input class="fieldValue" type="number" ${attr} value="${escapeHtml(v??'')}">`;
    else if(f.kind==='choice')input=`<select class="fieldValue" ${attr}><option value="">—</option>${(f.options||[]).map(o=>`<option ${String(v)===o?'selected':''}>${escapeHtml(o)}</option>`).join('')}${v!=null&&v!==''&&!(f.options||[]).includes(String(v))?`<option selected>${escapeHtml(v)}</option>`:''}</select>`;
    else if(f.kind==='ref')input=`<select class="fieldValue" ${attr}><option value="">—</option>${data.entities.filter(e=>e.id!==selfId&&(!f.refType||e.type===f.refType)).map(e=>`<option value="${escapeHtml(e.id)}" ${e.id===v?'selected':''}>${escapeHtml(e.name)}</option>`).join('')}${v&&!getEntity(v)?`<option value="${escapeHtml(v)}" selected>${escapeHtml(v)}</option>`:''}</select>`;
    else if(f.kind==='bool')input=`<label class="toggleRow"><span>Да</span><input class="fieldValue checkbox" type="checkbox" ${attr} ${v===true||v==='true'?'checked':''}></label>`;
    else input=`<input class="fieldValue" ${attr} value="${escapeHtml(v??'')}">`;
    return `<div class="fieldRow"><label>${name}</label>${input}</div>`}).join('');
}
function readEntityFieldsForm(host){
  const out={};
  host?.querySelectorAll('.fieldValue').forEach(el=>{const name=el.dataset.fieldName,kind=el.dataset.fieldKind;if(!name)return;let v;if(kind==='bool')v=el.checked?true:undefined;else if(kind==='number'){v=el.value===''?undefined:Number(el.value);if(!Number.isFinite(v))v=undefined}else{v=el.value.trim()===''?undefined:el.value}if(v!==undefined)out[name]=v});
  return out;
}
// How a field's answer reads in the card: a reference shows the record's name and can be clicked.
function fieldValueHtml(f,v){
  if(v==null||v==='')return '<span class="subtle">—</span>';
  if(f.kind==='ref'){const t=getEntity(v);return t?`<button type="button" class="linkBtn" data-related="${escapeHtml(t.id)}">${escapeHtml(t.name)}</button>`:escapeHtml(v)}
  if(f.kind==='bool')return v===true||v==='true'?'да':'нет';
  return escapeHtml(typeof v==='string'?v:JSON.stringify(v)).replace(/\n/g,'<br>');
}

// ---- Quick status change from the right panel ----
function openStatusMenu(entityId,anchor){
  if(worldReadOnly())return;
  const e=getEntity(entityId);if(!e)return;
  const groups=statusGroupsForType(e.type);
  const pop=$('#statusMenu')||Object.assign(document.createElement('div'),{id:'statusMenu',className:'statusMenu'});
  pop.innerHTML=groups.length?groups.map(g=>`<div class="statusMenuGroup"><small>${escapeHtml(g.name)}${g.kind==='flags'?' · несколько':''}</small><div class="statusPick">${g.options.map(o=>{const cur=e.status?.[g.id],on=g.kind==='flags'?Array.isArray(cur)&&cur.includes(o.id):cur===o.id;return `<button type="button" class="statusChip pick ${on?'on':''}" style="--status:${escapeHtml(safeCssValue(o.color,'#9aa8c6'))}" data-status-set="${escapeHtml(g.id)}" data-option="${escapeHtml(o.id)}">${o.icon?`<i>${escapeHtml(o.icon)}</i>`:''}${escapeHtml(o.name)}</button>`}).join('')}</div></div>`).join(''):'<div class="inlineHelp">У этого типа нет статусов. Добавьте их в «Правила → Статусы».</div>';
  if(!pop.parentNode)document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect();pop.style.top=zpx(Math.min(window.innerHeight-20,r.bottom+6))+'px';pop.style.left=zpx(Math.max(10,Math.min(window.innerWidth-zsc(300),r.left-zsc(200))))+'px';pop.classList.add('open');pop.dataset.entity=entityId;
}
function closeStatusMenu(){$('#statusMenu')?.classList.remove('open')}
document.addEventListener('click',ev=>{
  const t=ev.target instanceof Element?ev.target:null;if(!t)return;
  // 0.23.9: a status chip on the record's page opens the same choice as the ✎ next to it
  const chip=t.closest('#entityPanel .statusRow [data-status-group]');if(chip){const btn=chip.closest('.statusRow')?.querySelector('[data-status-menu]');if(btn){ev.stopPropagation();openStatusMenu(btn.dataset.statusMenu,chip);return}}
  const opener=t.closest('[data-status-menu]');
  if(opener){ev.stopPropagation();const id=opener.dataset.statusMenu;if($('#statusMenu')?.classList.contains('open')&&$('#statusMenu').dataset.entity===id){closeStatusMenu();return}openStatusMenu(id,opener);return}
  const set=t.closest('[data-status-set]');
  if(set){if(worldReadOnly())return;const id=$('#statusMenu')?.dataset.entity,e=getEntity(id);if(!e)return;const before=clone(data);applyEntityStatus(e,set.dataset.statusSet,set.dataset.option);e.updatedAt=new Date().toISOString();state.viewVersion++;if(!persist()){data=before;normalize();toast('Не удалось сохранить статус — состояние восстановлено','err')}updateUI();openStatusMenu(id,$(`[data-status-menu="${CSS.escape(id)}"]`)||set);return}
  if(!t.closest('#statusMenu'))closeStatusMenu();
});

// 0.23.9: types, statuses and relation types are created and edited right from the blocks on the left («＋», «✎», right click on an item).
// An editor opened from there returns to the work, not to the big «Правила» window.
let rulesFromPanel=false;
function rulesBack(tab){if(rulesFromPanel){rulesFromPanel=false;closeModal();updateUI();return}openRulesModal(tab)}
function rulesFromLeft(fn){rulesFromPanel=true;fn()}
function bindRulesPanel(){
  document.addEventListener('click',e=>{const t=e.target instanceof Element?e.target:null;const b=t?.closest('.secTool');if(!b)return;e.preventDefault();e.stopPropagation();
    if(b.dataset.rulesNew==='entity')rulesFromLeft(()=>openTypeEditor('entity'));else if(b.dataset.rulesNew==='relation')rulesFromLeft(()=>openTypeEditor('relation'));else if(b.dataset.rulesNew==='status')rulesFromLeft(()=>openStatusGroupEditor());
    else if(b.dataset.rulesOpen){rulesFromPanel=false;openRulesModal(b.dataset.rulesOpen)}},true);
  document.addEventListener('contextmenu',e=>{const t=e.target instanceof Element?e.target:null;if(!t?.closest('.left'))return;
    const ef=t.closest('#entityFilters label'),rf=t.closest('#relationFilters label'),sg=t.closest('#statusFilters [data-sg]');
    const id=ef?ef.querySelector('input')?.value:rf?rf.querySelector('input')?.value:sg?.dataset.sg;if(id==null)return;
    if(ef&&!id)return;e.preventDefault();e.stopPropagation();
    if(ef)rulesFromLeft(()=>openTypeEditor('entity',id));else if(rf)rulesFromLeft(()=>openTypeEditor('relation',id));else rulesFromLeft(()=>openStatusGroupEditor(id))},true);
}
bindRulesPanel();
