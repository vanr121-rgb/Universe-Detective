// Universe Graph — Навигация и поиск: вход/выход из пространств, зум, крошки, фильтры, результаты поиска.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
function setScope(id,{push=true,center=true,paperId=null,context=undefined}={}){
  if(id!==state.scopeId&&!udFinishDescription(true))return false;
  const e=getEntity(id);if(!e)return false;
  let next=context;
  if(udUsesSharedLayout()){
    if(id===currentRootId())next=null;
    else if(paperId){
      const paper=udSharedBoard()?.items.find(p=>p.id===paperId&&p.entityId===id);
      if(!paper||!boardLayout().keys?.has(paperId))return false;
      next=udSharedPaperContext(paper);
    }else{
      const previous=next===undefined&&!push?state.udContextHistory?.[state.historyIndex]:next;
      next=udSharedResolveContext(id,previous);
    }
    if(id!==currentRootId()&&!next){toast('В этой раскладке нет бумажки контейнера. Верните её через «Состав».','err');return false}
    if(!udSharedPrepareContext(next))return false;
  }else if(next===undefined){
    if(paperId)next=udContainerContextFromPaper(id,paperId);
    else if(!push&&state.udContextHistory?.[state.historyIndex]!==undefined)next=state.udContextHistory[state.historyIndex];
    else if(state.udContainerContext?.returnScope===id)next=state.udContainerContext.previous;
    else next=id===state.scopeId?state.udContainerContext:udAdoptedContainerContext(id);
  }
  next=udBoundContainerContext(next);
  if(paperId&&!next)return false;
  const changed=id!==state.scopeId||next?.paperId!==state.udContainerContext?.paperId;
  if(changed&&state.boardDrag){udDragEnd(state.boardDrag);state.boardDrag=null}
  if(changed)boardCancelQueuedCamera();
  state.udContainerContext=next;
  if(id===state.scopeId&&push&&!changed){
    state.selectedId=id;state.selectedIds=new Set([id]);state.selectedRelationId=null;
    if(center){state.panX=-(e.style.x||0);state.panY=-(e.style.y||0)}
    state.zoom=.92;state.isolate=false;updateUI();scheduleViewPersist();return false;
  }
  state.scopeId=id;state.udPaperReveal=null;state.galaxyExpanded=new Set();state.galaxyRootCollapsed=false;
  state.selectedId=id;state.selectedIds=new Set([id]);state.selectedRelationId=null;
  if(!(state.mode==='trace'&&state.traceStart&&!state.traceEnd)){
    state.traceStart=null;state.traceEnd=null;state.focusedPath=[];
  }
  if(push){
    state.history=state.history.slice(0,state.historyIndex+1);
    state.udContextHistory=(state.udContextHistory||[]).slice(0,state.historyIndex+1);
    if(state.history[state.history.length-1]!==id||changed&&paperId)state.history.push(id);
    state.historyIndex=state.history.length-1;
  }
  (state.udContextHistory??=[])[state.historyIndex]=next?clone(next):null;
  if(center){state.panX=-(e.style.x||0);state.panY=-(e.style.y||0)}
  state.zoom=.92;state.isolate=false;udPrepareOpenContainerLayouts();updateUI();scheduleViewPersist();return true;
}
function enterSelected(){const e=getEntity(state.selectedId);if(!e)return;if(!isSpace(e)){toast('Эта сущность не является пространством','err');return}if(e.id===state.scopeId){toast('Вы уже находитесь внутри этого пространства','err');return}setScope(e.id,{paperId:udSelectedPaperId()});state.mode='dive';updateModes();toast('Погружение: '+e.name,'ok')}
function goUp(){const context=udContainerContext();if(context){setScope(context.returnScope,{context:context.previous});return}if(scopeIdIsRoot()){toast('Вы на самом верху — выше этого пространства ничего нет','ok');return}const p=containmentParent(state.scopeId);if(p)setScope(p);else goHome()}
function goHome(){const root=getEntity(currentRootId())||data.entities.find(e=>e.style?.space)||data.entities[0];if(root&&udFinishDescription(true)){state.history=[root.id];state.historyIndex=0;state.showExternal=false;setScope(root.id,{push:false,center:true,context:null});const ws=currentWorkspace();if(ws&&!viewAsPlayer())persist()}}
function back(){if(state.historyIndex<=0||!udFinishDescription(true))return;state.historyIndex--;setScope(state.history[state.historyIndex],{push:false,center:true})}
function forward(){if(state.historyIndex>=state.history.length-1||!udFinishDescription(true))return;state.historyIndex++;setScope(state.history[state.historyIndex],{push:false,center:true})}
function fitViewPressed(){fitView()}
function resetViewPressed(){resetView()}
function fitView(){boardFit()} /* UD: the board is the only view */
let viewPersistTimer=0;
function scheduleViewPersist(delay=180){clearTimeout(viewPersistTimer);viewPersistTimer=setTimeout(()=>{viewPersistTimer=0;persistWorkspaceView()},delay)}
function updateZoom(){const z=$('#zoomText');if(z)z.textContent=Math.round((Number(state.boardZoom)||1)*100)+'%'}
function updateModes(){$$('.modeBtn[data-mode]').forEach(b=>{const active=b.dataset.mode==='dive'?state.enterOnClick:b.dataset.mode===state.mode;b.classList.toggle('active',active);if(b.dataset.mode==='dive'){b.setAttribute('aria-pressed',String(state.enterOnClick));b.textContent='Dive · '+(state.enterOnClick?'ON':'OFF');b.title=state.enterOnClick?'ЛКМ по Space — войти внутрь':'ЛКМ + drag — перемещать узлы; двойной клик/Enter — войти'}})}
// 0.15.22: the trail is the real path root → … → current space. It used to be the
// browsing history, so after a jump from search it skipped the spaces in between.
function buildBreadcrumbs(){let arr=getEntity(state.scopeId)?findAncestorPath(state.scopeId):[];const html=[];if(udUsesSharedLayout()&&udContainerContext()){arr=[];for(let c=udContainerContext();c;c=c.previous)arr.unshift(c.entityId);arr.unshift(currentRootId())}arr.forEach((id,i)=>{const e=getEntity(id);if(!e)return;html.push(`<span class="crumb" data-id="${escapeHtml(e.id)}" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>`);if(i<arr.length-1)html.push('<span class="slash">/</span>')});return html.join('')}
function searchResults(q){const low=searchFold(q);if(!low)return{entities:[],relations:[]};const entities=data.entities.filter(e=>entitySearchText(e).includes(low));const relations=data.relations.filter(r=>relationSearchText(r).includes(low));return{entities,relations}}
function renderSearch(q){const el=$('#searchResults');if(!q){el.classList.remove('open');el.innerHTML='';return}const r=searchResults(q);let html='';if(r.entities.length){html+='<div class="searchGroup">Сущности</div>'+r.entities.slice(0,10).map(e=>`<div class="searchItem" data-search-entity="${escapeHtml(e.id)}"><div class="mini" style="color:${escapeHtml(safeCssValue(e.style?.color||getET(e.type).color,'#74b8ff'))}">${escapeHtml(getET(e.type).icon||'•')}</div><div><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.type?getET(e.type).name:'Без типа')}${entityOffBoard(e)?' · вне доски':''}</small>${searchSnippetHtml(searchSnippet(e,q.toLowerCase()))}</div></div>`).join('')}if(r.relations.length){html+='<div class="searchGroup">Связи</div>'+r.relations.slice(0,10).map(r=>{const a=getEntity(r.from),b=getEntity(r.to);return `<div class="searchItem" data-search-relation="${escapeHtml(r.id)}"><div class="mini">↔</div><div><b>${escapeHtml(a?.name||'?')} · ${escapeHtml(getRT(r.type).name)}</b><small>${escapeHtml(b?.name||'?')}</small>${searchSnippetHtml(searchSnippet(r,q.toLowerCase()))}</div></div>`}).join('')}if(typeof articleSearch==='function'){const arts=articleSearch(q);if(arts.length)html+='<div class="searchGroup">Статьи</div>'+arts.slice(0,8).map(a=>`<div class="searchItem" data-search-article="${escapeHtml(a.id)}"><div class="mini">${escapeHtml(a.icon||'📖')}</div><div><b>${escapeHtml(a.title)}</b><small>${escapeHtml(plainExcerpt(a.body,80)||'статья')}</small></div></div>`).join('')}if(!html)html='<div class="searchGroup" style="padding:14px">Ничего не найдено</div>';el.innerHTML=html;$$('[data-search-article]').forEach(b=>b.onclick=()=>{clearSearchQuery();el.classList.remove('open');$('#globalSearch').blur();openArticle(b.dataset.searchArticle)});el.classList.add('open');$$('[data-search-entity]').forEach(b=>b.onclick=()=>{clearSearchQuery();if(revealEntity(b.dataset.searchEntity)){$('#globalSearch').blur();el.classList.remove('open')}});$$('[data-search-relation]').forEach(b=>b.onclick=()=>{const r=data.relations.find(x=>x.id===b.dataset.searchRelation);if(r){const localIds=new Set(scopeMembers().map(e=>e.id));state.selectedRelationId=r.id;state.selectedId=null;state.selectedIds=new Set();state.showExternal=!(localIds.has(r.from)&&localIds.has(r.to));updateUI();el.classList.remove('open')}})}
// Path root → … → id. 0.15.21: the check used to look at the wrong end of the
// array, so every nested entity resolved to just [root].
// The query doubles as a graph filter; after a result is chosen the filter is
// lifted so the chosen entity is shown together with its surroundings.
function clearSearchQuery(){state.search='';const gs=$('#globalSearch');if(gs)gs.value=''}
// Opens the space that contains an entity, selects it and centres the camera on it.
function revealEntity(id){
  const e=getEntity(id);if(!e)return false;
  const showOffBoard=!uiIsPlayer()&&entityOffBoard(e);
  const parent=containmentParent(id);
  if(parent&&parent!==state.scopeId){if(!setScope(parent,{push:true,center:false}))return false}
  else if(!parent&&!scopeIdIsRoot()){if(!setScope(currentRootId(),{push:true,center:false}))return false}
  if(showOffBoard&&!state.showHidden){state.showHidden=true;state.viewVersion++}
  setSelected(id,false);
  state.showExternal=state.showExternal&&!scopeMembers().some(x=>x.id===id);
  updateZoom();updateUI();
  boardCenterOn([id]); // UD: the board moves so that the card is in the middle of the screen
  return true;
}

