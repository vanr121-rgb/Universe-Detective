// Universe Graph — Правая панель: информация о сущности и связи, кнопки действий, выбор.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
function relationRows(e){return e?data.relations.filter(r=>r&&(r.from===e.id||r.to===e.id)&&!getRT(r.type).containment):[]}
// A section remembers being opened AND being closed (0.18: some sections start open).
function toggleInspectorFold(key){
  if(!key)return;
  const panelId=state.selectedRelationId?'#relationPanel':'#entityPanel';
  const el=document.querySelector(`${panelId} [data-fold-panel="${CSS.escape(key)}"]`);
  const subj=state.selectedRelationId?sectionSubject('relation',state.selectedRelationId):sectionSubject('entity',state.selectedId||state.scopeId);
  const open=el?el.classList.contains('isOpen'):sectionIsOpen({id:key},subj);
  setFoldOpen(subj,key,!open);
  updateUIPrefsInspectorFolds();
  if(state.selectedRelationId)renderRelationPanel(data.relations.find(r=>r.id===state.selectedRelationId));
  else renderEntityPanel(state.selectedId?getEntity(state.selectedId):getEntity(state.scopeId));
}
function relationTreeRows(rootId,depth=0,seen=new Set(),limit=Infinity){
  const root=getEntity(rootId);if(!root||seen.has(rootId))return '';const nextSeen=new Set(seen);nextSeen.add(rootId);
  const children=containmentChildren(rootId).slice(0,limit);if(!children.length)return '';
  return children.map(id=>{const child=getEntity(id);if(!child)return '';const et=getET(child.type),open=state.relationTreeExpanded.has(child.id),has=containmentChildren(child.id).length>0;return `<div class="treeRow" style="--depth:${depth}" data-tree-node="${escapeHtml(child.id)}"><button type="button" class="treeToggle ${has?'':'emptyToggle'}" data-tree-toggle="${escapeHtml(child.id)}" ${has?'aria-expanded="'+open+'"':'disabled'}>${has?(open?'▾':'▸'):'·'}</button><div class="listIcon" style="color:${escapeHtml(safeCssValue(child.style?.color||et.color,'#74b8ff'))}">${escapeHtml(child.style?.icon||et.icon||'•')}</div><div class="listMeta"><b>${escapeHtml(child.name)}</b><small>${escapeHtml(et.name)}${has?' · '+containmentChildren(child.id).length+' внутри':''}</small></div></div>${open?relationTreeRows(child.id,depth+1,nextSeen):''}`}).join('')
}

// Guarded (0.16): if this view throws, it shows a short note instead of going blank.
function renderEntityPanel(e){return guard('Информацию о сущности',()=>renderEntityPanelUnsafe(e),viewFailed($('#entityPanel'),'Информацию о сущности'))}
// 0.18: the page of a record = a header that is always visible + sections (ui/sections.js).
function entityPortraitHtml(e,t){
  const m=boardMainImage(e),url=m?getMediaUrl(m.id):'',color=escapeHtml(safeCssValue(e.style?.color||t.color,'#74b8ff'));
  return url?`<button type="button" class="pagePortrait" data-gallery-open="${escapeHtml(m.id)}" title="Открыть картинку" style="--portrait:${color}"><img src="${url}" alt="${escapeHtml(m.alt||e.name)}"></button>`:`<div class="nodePreview pageIcon" style="color:${color};box-shadow:0 0 20px ${color}33">${escapeHtml(e.style?.icon||t.icon||'•')}</div>`;
}
// 0.21.5: «Карта» and «Статья» stand next to the name of the record (the relation has only «Статья»).
function pageToolsHtml(subj){
  const o=subj.obj,isRel=subj.kind==='relation',key=escapeHtml(subjectKey(subj));
  const own=typeof articlesForSubject==='function'?articlesForSubject(subj).filter(x=>x.how==='привязана'):[];
  // 0.23.9: two big tiles instead of small buttons — what it is and what is inside
  const has=!isRel&&typeof hasEntityMap==='function'&&hasEntityMap(o),pins=has?(entityMap(o)?.pins?.length||0):0;
  const map=!isRel&&typeof hasEntityMap==='function'?`<button type="button" class="btn pageTool" data-map-open="${escapeHtml(o.id)}" title="${has?'Открыть карту сущности':'Сделать карту: картинка, на которую ставятся другие сущности'}"><i>🗺</i><b>Карта</b><small>${has?(pins?`${pins} ${plural(pins,'метка','метки','меток')}`:'без меток'):'сделать'}</small></button>`:'';
  const art=typeof openArticleEditor==='function'?`<button type="button" class="btn pageTool" data-article-for="${key}" title="${own.length?'Открыть статью о сущности':'Написать статью о сущности: страница вики, которую можно развернуть на весь экран'}"><i>📖</i><b>${own.length>1?'Статьи':'Статья'}</b><small>${own.length?(own.length>1?`${own.length} ${plural(own.length,'статья','статьи','статей')}`:'открыть'):'написать'}</small></button>`:'';
  return map||art?`<div class="pageTools">${map}${art}</div>`:'';
}
function renderEntityPanelUnsafe(e){
  const el=$('#entityPanel');
  if(!e){el.innerHTML='<h3>Информация</h3><div class="empty">Выберите сущность или связь. Здесь появится подробная информация.</div>';return}
  const t=getET(e.type),full=state.inspectorMode==='info',subj=sectionSubject('entity',e.id),esc=v=>escapeHtml(v);
  const groups=statusGroupsForType(e.type),sts=entityStatuses(e);
  el.innerHTML=`<div class="infoBackRow"><div><div class="infoModeLabel">${full?'Информация о сущности':'Сущность'}</div></div>${full?'<button type="button" class="btn infoBackBtn" data-inspector-back>← Назад</button>':''}</div>
  <div class="pageHeader secPage" data-subject="${esc(subjectKey(subj))}"><div class="cardHeader">${entityPortraitHtml(e,t)}<div class="cardTitle"><h2>${esc(e.name)}</h2><div class="subtle">${esc(e.type?t.name:'Без типа')} · ${degree(e.id)} связей${e.aliases?.length?' · он же '+esc(e.aliases.slice(0,2).join(', ')):''}${entityOffBoard(e)?' · <span class="offBoardTag" title="Сущность убрана с доски (не удалена). Вернуть — кнопкой в «Действиях» или клавишей H">◌ вне доски</span>':''}</div></div></div>${(state.viewAs&&state.viewAs!=='gm')||e.id===currentRootId()?'':visRowHtml([e.id],entityVis(e))}${pageToolsHtml(subj)}
  ${groups.length||sts.length?`<div class="statusRow">${statusChipsHtml(e,{clickable:!!groups.length})}${groups.length?`<button type="button" class="statusAddBtn" data-status-menu="${esc(e.id)}" title="Изменить статусы">${sts.length?'✎':'＋ Статус'}</button>`:''}</div>`:''}
  ${isSpace(e)||e.style?.pinned?`<div class="tagRow">${isSpace(e)?'<span class="tag">space / контейнер</span>':''}${e.style?.pinned?'<span class="tag">закреплён</span>':''}</div>`:''}
  </div>
  ${renderPageHtml(subj,{full})}`;
}
// Guarded (0.16): if this view throws, it shows a short note instead of going blank.
function renderRelationPanel(r){return guard('Информацию о связи',()=>renderRelationPanelUnsafe(r),viewFailed($('#relationPanel'),'Информацию о связи'))}
function renderRelationPanelUnsafe(r){
  const el=$('#relationPanel');
  if(!r){el.innerHTML='';return}
  const a=getEntity(r.from),b=getEntity(r.to),rt=getRT(r.type),st={...rt,...(r.style||{})},full=state.inspectorMode==='info',subj=sectionSubject('relation',r.id);
  const end=(o)=>o?`<button type="button" class="linkBtn" data-related="${escapeHtml(o.id)}">${escapeHtml(o.name)}</button>`:'?';
  el.innerHTML=`<div class="infoBackRow"><div><div class="infoModeLabel">${full?'Информация о связи':'Связь'}</div><h3 style="margin:3px 0 0">${escapeHtml(rt.name)}</h3></div>${full?'<button type="button" class="btn infoBackBtn" data-inspector-back>← Назад</button>':''}</div>
  <div class="relationEnds">${end(a)} <span style="color:${escapeHtml(safeCssValue(st.color||rt.color,'#8fb7ff'))}">${rt.arrow?'→':'—'}</span> ${end(b)}</div>${pageToolsHtml(subj)}${typeof relationTierControlHtml==='function'?relationTierControlHtml(r):''}
  <div class="tagRow"><span class="tag">${escapeHtml(rt.name)}</span>${rt.containment?'<span class="tag">принадлежность</span>':''}${r.properties?.secret?'<span class="tag">секрет</span>':''}</div>
  ${subj?renderPageHtml(subj,{full}):''}
  <div class="buttonGrid" style="margin-top:10px"><button class="btn" type="button" data-open-info>ⓘ Информация</button><button class="btn" type="button" data-relation-action="edit">✎ Редактировать</button><button class="btn" type="button" data-relation-action="trace">⌁ Trace</button></div>`;
}

function renderActions(e){return guard('панель действий',()=>renderActionsUnsafe(e))}
function renderActionsUnsafe(e){
  const el=$('#selectionActions');
  if(state.selectedIds.size>1){el.innerHTML=`<h3>Выбрано <span class="multiBadge">${state.selectedIds.size}</span></h3><div class="subtle">Групповое редактирование не меняет отдельные значения, пока вы явно не примените их.</div><div class="actionGroup"><div class="actionGroupTitle">Массовые действия</div><div class="actionGrid"><button type="button" class="btn actionBtn primary" data-action="mass-edit"><span class="actionIcon">✎</span><span><b>Массовое редактирование</b><small>тип, цвет, размер, теги, родитель</small></span></button><button type="button" class="btn actionBtn" data-action="mass-duplicate"><span class="actionIcon">＋</span><span><b>Копировать</b><small>создать копии выбранных</small></span></button><button type="button" class="btn actionBtn" data-action="mass-offboard"><span class="actionIcon">◌</span><span><b>${[...state.selectedIds].every(id=>entityOffBoard(getEntity(id)))?'Вернуть на доску':'Убрать с доски'}</b><small>скрыть, не удаляя</small></span></button></div></div>${visRowHtml([...state.selectedIds],(()=>{const v=[...state.selectedIds].map(id=>entityVis(getEntity(id)));return v.every(x=>x===v[0])?v[0]:''})())}<button type="button" class="btn danger full dangerWide" data-action="mass-delete">Удалить выбранные</button>`;return}if(!e){el.innerHTML='<h3>Действия</h3><div class="empty">Выберите сущность или связь. Основные рабочие инструменты находятся в верхней панели.</div>';return}
  const canEnter=isSpace(e),child=containmentChildren(e.id).length>0;
  el.innerHTML=`<h3>Действия</h3><div class="selectionMeta"><span class="tag">${escapeHtml(getET(e.type).name)}</span>${canEnter?'<span class="tag">пространство</span>':''}${e.style?.pinned?'<span class="tag">закреплено</span>':''}</div>
  <div class="actionGrid actionCompact">
    <button type="button" class="btn actionBtn ${canEnter?'primary':''}" data-action="enter" ${canEnter?'':'disabled'} title="Войти — открыть пространство"><span class="actionIcon">◎</span><span><b>Войти</b><small>открыть пространство</small></span></button>
    <button type="button" class="btn actionBtn" data-action="focus" title="Центр — показать выбранную сущность в середине"><span class="actionIcon">◉</span><span><b>Центр</b><small>фокус на выбранном узле</small></span></button>
    <button type="button" class="btn actionBtn" data-action="edit" title="Изменить — сущность и оформление"><span class="actionIcon">✎</span><span><b>Изменить</b><small>сущность и оформление</small></span></button>
    <button type="button" class="btn actionBtn" data-action="relation" title="Связать с… — новая связь от этой сущности"><span class="actionIcon">↔</span><span><b>Связать с…</b><small>из этой сущности</small></span></button>
    <button type="button" class="btn actionBtn" data-action="trace" title="Trace — построить путь до другой сущности"><span class="actionIcon">⌁</span><span><b>Trace</b><small>построить путь</small></span></button>
    <button type="button" class="btn actionBtn" data-action="pin" title="${e.style?.pinned?'Открепить — снова двигается раскладкой':'Закрепить — зафиксировать место'}"><span class="actionIcon">⊙</span><span><b>${e.style?.pinned?'Открепить':'Закрепить'}</b><small>зафиксировать позицию</small></span></button><button type="button" class="btn actionBtn${entityOffBoard(e)?' on':''}" data-action="offboard" aria-pressed="${entityOffBoard(e)?'true':'false'}" title="${entityOffBoard(e)?'Вернуть на доску (H)':'Убрать с доски, не удаляя (H)'}"><span class="actionIcon">${entityOffBoard(e)?'👁':'◌'}</span><span><b>${entityOffBoard(e)?'Вернуть на доску':'Убрать с доски'}</b><small>${entityOffBoard(e)?'сейчас скрыта':'скрыть, не удаляя'}</small></span></button>
    <button type="button" class="btn actionBtn" data-open-info title="Информация — все данные сущности"><span class="actionIcon">ⓘ</span><span><b>Информация</b><small>полный просмотр данных</small></span></button>
    <button type="button" class="btn actionBtn" data-action="widgets" title="Блоки — карточки, метрики, графики"><span class="actionIcon">▦</span><span><b>Блоки</b><small>карточки, метрики, графики</small></span></button>
  </div>
  <div class="subtle actionSummary">${child?'Внутри '+childrenCount(e)+' объектов. Их можно раскрывать по уровням в «Содержании».':'Связанных объектов: '+degree(e.id)+'.'}</div>
  ${child||isSpace(e)?`<label class="contentOffBoard" title="Для бестиария, архива, свалки идей: то, что внутри, не лежит на общей доске. Внутри самой папки всё видно"><input type="checkbox" data-content-offboard="${escapeHtml(e.id)}" ${e.contentOffBoard?'checked':''}> Содержимое — вне доски${child?` <small>(${childrenCount(e)})</small>`:''}</label>`:''}
  ${udCanRemovePaper(e.id,udSelectedPaperId())?'<button type="button" class="btn danger full dangerWide" data-action="delete-paper">Удалить эту бумажку</button>':''}
  <button type="button" class="btn danger full dangerWide" data-action="delete" title="Удалить сущность со всеми бумажками (Ctrl+Z — отменить)">Удалить сущность везде</button>`;
  // Action buttons are handled by delegated listener on #selectionActions.
}
function childrenCount(e){return containmentChildren(e.id).length}
function setSelected(id,add=false,paper=null){if(!id)return;state.udSelectedPaper=paper;if(add){if(state.selectedIds.has(id))state.selectedIds.delete(id);else state.selectedIds.add(id)}else state.selectedIds=new Set([id]);state.selectedId=[...state.selectedIds][0]||null;state.selectedRelationId=null;state.inspectorMode='overview';state.lastInspectorMode='overview';updateUI('selection')}
function clearSelection(){state.udSelectedPaper=null;state.selectedIds=new Set();state.selectedId=null;state.selectedRelationId=null;updateUI('selection')}

// 0.23.9: one way to select a relation (a thread on the board, a line on a map) — its page opens on the right.
function selectRelationById(id){if(!data.relations.some(r=>r.id===id))return false;state.selectedRelationId=id;state.selectedId=null;state.selectedIds=new Set();state.inspectorMode='overview';state.lastInspectorMode='overview';updateUI('selection');return true}
