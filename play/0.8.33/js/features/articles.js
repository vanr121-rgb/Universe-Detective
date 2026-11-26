// Universe Graph — статьи (0.20.5). Статья — страница вики, а не запись мира: «Система НРИ», «Бестиарий»,
// «Хроника войны». Она живёт отдельно (в пространстве: ws.articles), но привязывается к записям, связям,
// типам и другим статьям. У статьи может быть родитель (Бестиарий → Волколак) и «подборка» — записи по правилу
// (все «Монстры»). Читается в трёх видах: блоком справа, окошком поверх карты и на всю рабочую зону —
// тогда карта сворачивается в подвижное окошко справа снизу.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';

const ARTICLE_ICONS=['📖','📜','📚','🐉','⚔','🛡','🗺','🏰','👑','✨','⚗','🕯','🧭','🎲','☠','🌿'];
const ARTICLE_LINK_KINDS=[['entity','Сущность'],['relation','Связь'],['type','Тип сущностей'],['reltype','Тип связей'],['article','Статья']];
const articleOnBoard=()=>!!document.querySelector('.app.ud');
const ARTICLE_UI_KEY='universe-graph-ui-articles';

// ---- Данные ----
function wsArticles(ws=currentWorkspace()){if(!ws)return [];if(typeof viewAsPlayer==='function'&&viewAsPlayer())return playerArticles||[]; /* 0.28.1: the player sees the articles the Master opened (green eye) */if(!Array.isArray(ws.articles))ws.articles=[];return ws.articles}
function getArticle(id){return id?wsArticles().find(a=>a.id===id)||null:null}
function articleSort(a,b){return (Number(a.order)||0)-(Number(b.order)||0)||String(a.title).localeCompare(String(b.title),'ru')}
function articleChildren(id){return wsArticles().filter(a=>(a.parentId||null)===(id||null)).sort(articleSort)}
function articlePath(a){const out=[],seen=new Set();let p=getArticle(a?.parentId);while(p&&!seen.has(p.id)){seen.add(p.id);out.unshift(p);p=getArticle(p.parentId)}return out}
function articleDescendantIds(id,seen=new Set()){for(const c of wsArticles())if(c.parentId===id&&!seen.has(c.id)){seen.add(c.id);articleDescendantIds(c.id,seen)}return seen}
// Called by normalize.js for every workspace: keeps only sound articles and links.
function articlePlayerMode(){return viewAsPlayer()||!!window.UG_ONLINE_PLAYER}
function articleCanEdit(a){return !a?.hint&&!worldReadOnly()}
function normalizeArticles(ws){
  if(ws.articleTemplates!==undefined)ws.articleTemplates=articleNormalizeTemplates(ws.articleTemplates);
  if(!Array.isArray(ws.articles))ws.articles=[];
  // 0.21.5: the tutorial world made before articles gets the example article «Вселенная» once (it can be deleted).
  if(!ws.exampleArticle){ws.exampleArticle=true;const ents=Array.isArray(ws.entities)?ws.entities:[];if(ws.rootId==='e-world'&&ents.some(e=>e&&e.id==='e-world'&&e.name==='Вселенная')&&!ws.articles.some(a=>a&&String(a.title).trim().toLowerCase()==='вселенная'))ws.articles.unshift(exampleUniverseArticle())}
  const ids=new Set(),now=new Date().toISOString();
  ws.articles=ws.articles.filter(isRecord).map(a=>{
    let id=String(a.id||'');if(!id||ids.has(id))id=uid('art');ids.add(id);
    const links=(Array.isArray(a.links)?a.links:[]).filter(l=>isRecord(l)&&ARTICLE_LINK_KINDS.some(([k])=>k===l.kind)&&l.id).map(l=>({kind:l.kind,id:String(l.id)})).slice(0,200);
    const c=isRecord(a.collect)?a.collect:{};const arr=v=>(Array.isArray(v)?v:[]).map(String).slice(0,50);
    return {id,...(typeof a.primaryFor==='string'&&a.primaryFor?{primaryFor:a.primaryFor}:{}),title:String(a.title||'Без названия').slice(0,160),icon:String(a.icon||'📖').slice(0,8),body:String(a.body||'').slice(0,200000),parentId:a.parentId?String(a.parentId):null,links,collect:{entTypes:arr(c.entTypes),statuses:arr(c.statuses),tags:arr(c.tags)},tags:arr(a.tags),order:Number(a.order)||0,createdAt:a.createdAt||now,updatedAt:a.updatedAt||now,...articleNormalizeExtras(a),...(a.hint===true?{hint:true}:{}),...(isRecord(a.by)?{by:a.by}:{}),...(a.vis==='gm'||a.vis==='hint'?{vis:a.vis}:{})}; /* 0.28.1: who sees the article */
  });
  const usedOwners=new Set();
  for(const a of ws.articles){
    if(!a.primaryFor)continue;
    if(usedOwners.has(a.primaryFor)){
      if(!a.links.some(l=>l.kind==='entity'&&l.id===a.primaryFor))a.links.push({kind:'entity',id:a.primaryFor});
      delete a.primaryFor;
    }else usedOwners.add(a.primaryFor);
  }
  const known=new Set(ws.articles.map(a=>a.id));
  for(const a of ws.articles){if(a.parentId&&(!known.has(a.parentId)||a.parentId===a.id))a.parentId=null}
  // A parent chain must not loop.
  for(const a of ws.articles){const seen=new Set([a.id]);let p=ws.articles.find(x=>x.id===a.parentId);while(p){if(seen.has(p.id)){a.parentId=null;break}seen.add(p.id);p=ws.articles.find(x=>x.id===p.parentId)}}
}
function articleNorm(s){return wikiNormName(s)}
function articleResolve(name){const n=articleNorm(String(name||'').replace(/^статья\s*:\s*/i,''));return n?wsArticles().find(a=>articleNorm(a.title)===n)||null:null}
function articleSearch(q){const low=String(q||'').toLowerCase();if(!low)return [];return wsArticles().filter(a=>(a.title+' '+a.body+' '+(a.tags||[]).join(' ')).toLowerCase().includes(low)).sort((a,b)=>(a.title.toLowerCase().includes(low)?0:1)-(b.title.toLowerCase().includes(low)?0:1)||articleSort(a,b))}
// What a link points to (for chips and for the «Статьи» section of a record).
function articleLinkInfo(l){
  if(l.kind==='entity'){const e=getEntity(l.id);return e?{label:e.name,icon:getET(e.type).icon||'•',attr:`data-related="${escapeHtml(e.id)}"`,hint:getET(e.type).name}:null}
  if(l.kind==='relation'){const r=data.relations.find(x=>x.id===l.id);if(!r)return null;const a=getEntity(r.from),b=getEntity(r.to);return {label:`${a?.name||'?'} — ${getRT(r.type).name} — ${b?.name||'?'}`,icon:'↔',attr:`data-article-relation="${escapeHtml(r.id)}"`,hint:'связь'}}
  if(l.kind==='type'){const t=data.entityTypes.find(x=>x.id===l.id);return t?{label:t.name,icon:t.icon||'◆',attr:'',hint:'все сущности типа'}:null}
  if(l.kind==='reltype'){const t=data.relationTypes.find(x=>x.id===l.id);return t?{label:t.name,icon:'↔',attr:'',hint:'все связи типа'}:null}
  if(l.kind==='article'){const a=getArticle(l.id);return a?{label:a.title,icon:a.icon,attr:`data-article-open="${escapeHtml(a.id)}"`,hint:'статья'}:null}
  return null;
}
// Records chosen by the article's «подборка»: types, statuses, tags (all that are set must match).
function articleCollectMatches(a,e){
  const {entTypes=[],statuses=[],tags=[]}=a.collect||{};
  return !!(entTypes.length||statuses.length||tags.length)&&
    (!entTypes.length||entTypes.includes(e.type))&&
    (!statuses.length||statuses.some(k=>{const [g,o]=k.split(':');const v=e.status?.[g];return Array.isArray(v)?v.includes(o):v===o}))&&
    (!tags.length||tags.some(t=>(e.tags||[]).includes(t)));
}
function articleCollect(a){return data.entities.filter(e=>articleCollectMatches(a,e)).sort((x,y)=>x.name.localeCompare(y.name,'ru'))}

function articleMentionsTitle(text,a){const n=articleNorm(a.title);return wikiLinksIn(text).some(l=>l.target==='статья-id:'+a.id||articleNorm(l.target.replace(/^статья\s*:\s*/i,''))===n)}
// Articles shown on the page of a record or a relation: linked to it, to its type, collecting it, or mentioning it.
function articleBoardButtonHtml(e,selected){
  if(!selected)return '';
  if(e.hint||(!articleCanEdit()&&!articlesForSubject({kind:'entity',obj:e}).length))return '';
  const label=escapeHtml(`Статья о «${e.name}»`);
  return `<button type="button" class="boardArticleButton" data-article-for="entity:${escapeHtml(e.id)}" title="${label}" aria-label="${label}">📖</button>`;
}
function articlesForSubject(subj){
  const o=subj.obj,out=[],seen=new Set();const add=(a,how)=>{if(!seen.has(a.id)){seen.add(a.id);out.push({a,how})}};
  const isRel=subj.kind==='relation';
  for(const a of wsArticles()){
    if(!isRel&&a.primaryFor===o.id)add(a,'основная');
    else if(a.links.some(l=>l.kind===(isRel?'relation':'entity')&&l.id===o.id))add(a,'привязана');
    else if(a.links.some(l=>l.kind===(isRel?'reltype':'type')&&l.id===o.type))add(a,'для всего типа');
  }
  if(!isRel){for(const a of wsArticles())if(!seen.has(a.id)&&articleCollectMatches(a,o))add(a,'в подборке')}
  const name=articleNorm(o.name||'');
  if(!isRel&&name)for(const a of wsArticles())if(!seen.has(a.id)&&wikiLinksIn(a.body).some(l=>articleNorm(l.target)===name))add(a,'упоминает');
  return out.sort((x,y)=>articleSort(x.a,y.a));
}
// Who points at an article: other articles (links or [[ ]]) and records whose texts mention it.
function articleBacklinks(a){
  const arts=wsArticles().filter(x=>x.id!==a.id&&(x.links.some(l=>l.kind==='article'&&l.id===a.id)||articleMentionsTitle(x.body,a)));
  const ents=data.entities.filter(e=>subjectTexts(e).some(t=>articleMentionsTitle(t,a)));
  return {arts,ents};
}
function articleCommit(change,okText){
  if(!articleCanEdit())return false;
  const before=clone(data),bs=snapshotMutationState();let res;
  try{res=change()}catch(e){restoreWorkspaceMutation(before,bs);updateUI();toast('Не получилось: '+(e?.message||e),'err');return false}
  if(res===false){restoreWorkspaceMutation(before,bs);return false}
  state.viewVersion++;
  if(!persist()){restoreWorkspaceMutation(before,bs);updateUI();toast('Не удалось сохранить статью — всё осталось как было','err');return false}
  if(!articlePlayerMode()){deferObsoleteMedia(before);flushDeferredMediaDeletes()}
  updateUI();if(okText)toast(okText,'ok');return res===undefined?true:res;
}

// ---- Состояние окна статьи ----
const articleUI={id:null,subject:null,workspace:null,lib:false,mode:'dock',query:'',float:{x:null,y:null,w:520,h:560},map:{x:null,y:null,w:340,h:230},prevVisual:null,prevCam:null};
(function loadArticleUI(){try{const s=JSON.parse(UniverseGraphStorage.getItem(ARTICLE_UI_KEY)||'{}');if(['dock','float','full'].includes(s.mode))articleUI.mode=s.mode==='full'?'dock':s.mode;for(const k of ['float','map'])if(isRecord(s[k]))for(const p of ['x','y','w','h'])if(Number.isFinite(s[k][p]))articleUI[k][p]=s[k][p]}catch{}})();
function saveArticleUI(){try{UniverseGraphStorage.setItem(ARTICLE_UI_KEY,JSON.stringify({mode:articleUI.mode,float:articleUI.float,map:articleUI.map}))}catch{}}
function articleIsOpen(){return !!(articleUI.id?getArticle(articleUI.id):articleUI.subject&&subjectFromKey(articleUI.subject))||articleUI.lib}
function articleBoardDefault(){if(articleOnBoard()&&articleUI.mode==='dock')setArticleMode('float',{render:false})}
function openArticle(id,{mode}={}){if(!getArticle(id))return;articleUI.workspace=state.workspaceId;articleUI.id=id;articleUI.lib=false;if(mode)setArticleMode(mode,{render:false});articleBoardDefault();renderArticles();const host=articleHost();host?.querySelector('.articleScroll')?.scrollTo?.(0,0)}
function openArticleLibrary(){articleBoardDefault();articleUI.workspace=state.workspaceId;articleUI.subject=null;articleUI.lib=true;articleUI.id=null;renderArticles();setTimeout(()=>articleHost()?.querySelector('[data-article-search]')?.focus(),30)}
function closeArticle(){articleUI.subject=null;if(articleUI.mode==='full')setArticleMode('dock',{render:false});articleUI.id=null;articleUI.lib=false;renderArticles()}
// dock — a block in the right panel; float — a window over the map; full — the whole work area (the map shrinks to a window).
function setArticleMode(mode,{render=true}={}){
  const prev=articleUI.mode;if(!['dock','float','full'].includes(mode))mode='dock';articleUI.mode=mode;
  if(!articleOnBoard()&&mode==='full'&&prev!=='full'){articleUI.prevVisual=state.visualMode;articleUI.prevCam={zoom:state.zoom,panX:state.panX,panY:state.panY};if(state.visualMode!=='graph')setVisualMode('graph');setTimeout(articleFitMap,140)}
  if(!articleOnBoard()&&prev==='full'&&mode!=='full'){const pv=articleUI.prevVisual,cam=articleUI.prevCam;articleUI.prevVisual=null;articleUI.prevCam=null;document.querySelector('.main')?.classList.remove('articleFull');requestAnimationFrame(()=>{try{resize();if(cam){Object.assign(state,cam);updateZoom();scheduleViewPersist()}if(pv&&pv!=='graph')setVisualMode(pv);wakeRenderLoop()}catch{}})}
  saveArticleUI();if(render)renderArticles();
}

// UD: articles are kept (worlds from Universe Graph), but there is no Graph map beside them — nothing to fit.
function articleFitMap(){}

// ---- Рисование ----
function articleToolbarHtml(){
  const m=articleUI.mode;const b=(act,icon,title,on)=>`<button type="button" class="iconBtn articleTool${on?' on':''}" data-article-act="${act}" title="${title}" aria-label="${title}">${icon}</button>`;
  const article=getArticle(articleUI.id),board=articleOnBoard();
  return `<div class="articleTools">${articleUI.subject&&article?b('subject','‹','Статьи сущности'):''}${b('library','☰','Все статьи')}${article&&articleCanEdit(article)?b('edit','✎','Изменить статью'):''}${board?'':b('dock','▤','В панель справа',m==='dock')}${b('float','❐',board?'Поверх доски':'Окошком поверх карты',m==='float')}${b('full','⤢',board?'На весь экран':'На всю рабочую зону (карта — окошком)',m==='full')}${b('close','×','Закрыть')}</div>`;
}
function articleCardRow(a,extra=''){return `<button type="button" class="articleRow" data-article-open="${escapeHtml(a.id)}">${(a.vis==='gm'||a.vis==='hint')&&!(typeof viewAsPlayer==='function'&&viewAsPlayer())&&typeof visEyeSvg==='function'?`<span class="articleVisMark" title="${a.vis==='gm'?'Только Мастер':'Игроки видят, что статья есть'}">${visEyeSvg(a.vis)}</span>`:''}<span class="articleRowIcon">${escapeHtml(a.icon||'📖')}</span><span class="articleRowMain"><b>${escapeHtml(a.title)}</b>${extra?`<small>${escapeHtml(extra)}</small>`:''}</span></button>`}
function articleViewHtml(a){
  const path=articlePath(a),kids=articleChildren(a.id),coll=articleCollect(a),back=articleBacklinks(a);
  const links=a.links.map(articleLinkInfo).filter(Boolean);
  const canEdit=articleCanEdit(a),hasContent=!!(a.body.trim()||a.infoboxes?.length||a.media?.length);
  const body=hasContent?articleDocumentHtml(a):'';
  return `<div class="articleHead">${path.length?`<div class="articleCrumbs">${path.map(p=>`<button type="button" class="linkBtn" data-article-open="${escapeHtml(p.id)}">${escapeHtml(p.icon)} ${escapeHtml(p.title)}</button>`).join(' › ')}</div>`:''}<h2 class="articleTitle"><span>${escapeHtml(a.icon||'📖')}</span> ${escapeHtml(a.title)}</h2>${articlePlayerMode()?'':articleVisRowHtml(a)}${a.tags?.length?`<div class="tagChips">${a.tags.map(t=>`<span class="tagChip">#${escapeHtml(t)}</span>`).join('')}</div>`:''}</div>
  <div class="articleScroll">
    ${body?`<article class="articleBody">${body}</article>`:`<div class="empty">${a.hint?'Мастер пока скрыл содержание.':`Текста пока нет.${canEdit?' <button type="button" class="linkBtn" data-article-act="edit">Написать</button>':''}`}</div>`}
    ${coll.length?`<div class="articleSub">Подборка — ${coll.length}</div><div class="articleCards">${coll.slice(0,200).map(e=>`<button type="button" class="articleCard" data-related="${escapeHtml(e.id)}"><b>${escapeHtml(getET(e.type).icon||'•')} ${escapeHtml(e.name)}</b><small>${escapeHtml(plainExcerpt(e.description,90)||getET(e.type).name)}</small></button>`).join('')}</div>`:''}
    ${kids.length?`<div class="articleSub">Статьи раздела — ${kids.length}</div><div class="articleList">${kids.map(k=>articleCardRow(k,plainExcerpt(k.body,80))).join('')}</div>`:''}
    ${links.length?`<div class="articleSub">Связано</div><div class="secChips">${links.map(l=>`<button type="button" class="tagChip secChip" ${l.attr} title="${escapeHtml(l.hint)}"><i>${escapeHtml(l.icon)}</i>${escapeHtml(l.label)}</button>`).join('')}</div>`:''}
    ${back.arts.length||back.ents.length?`<div class="articleSub">Упоминается</div><div class="secChips">${back.arts.map(x=>`<button type="button" class="tagChip secChip" data-article-open="${escapeHtml(x.id)}"><i>${escapeHtml(x.icon)}</i>${escapeHtml(x.title)}</button>`).join('')}${back.ents.map(e=>`<button type="button" class="tagChip secChip" data-related="${escapeHtml(e.id)}"><i>${escapeHtml(getET(e.type).icon||'•')}</i>${escapeHtml(e.name)}</button>`).join('')}</div>`:''}
    ${canEdit?'<div class="articleFooter"><button type="button" class="btn" data-article-act="child">＋ Статья внутри</button></div>':''}
  </div>`;
}
function articleLibraryHtml(){
  const q=articleUI.query.trim(),list=q?articleSearch(q):null;
  const tree=(parent,depth)=>articleChildren(parent).map(a=>`<div class="articleTreeRow" style="--depth:${depth}">${articleCardRow(a,articleChildren(a.id).length?`статей внутри: ${articleChildren(a.id).length}`:'')}</div>${depth<6?tree(a.id,depth+1):''}`).join('');
  const n=wsArticles().length;
  return `<div class="articleHead"><h2 class="articleTitle"><span>📚</span> Статьи</h2><div class="articleLibBar"><input class="articleSearch" data-article-search placeholder="Найти статью…" value="${escapeHtml(articleUI.query)}">${articleCanEdit()?'<button type="button" class="btn primary" data-article-act="new">＋ Статья</button>':''}</div></div>
  <div class="articleScroll">${n?(list?(list.length?`<div class="articleList">${list.map(a=>articleCardRow(a,articlePath(a).map(p=>p.title).join(' › '))).join('')}</div>`:'<div class="empty">Ничего не найдено.</div>'):`<div class="articleList">${tree(null,0)}</div>`):'<div class="empty">Статей пока нет. Статья — страница вики: «Система правил», «Бестиарий», «Хроника войны». Её можно привязать к сущностям, связям и типам.</div>'}</div>`;
}
function articleInnerHtml(){
  if(articleUI.lib)return articleToolbarHtml()+articleLibraryHtml();
  if(articleUI.subject&&!articleUI.id)return articleToolbarHtml()+articleSubjectHtml();
  const a=getArticle(articleUI.id);return a?articleToolbarHtml()+articleViewHtml(a):'';
}
function articleHost(){return articleUI.mode==='full'?$('#articleFull'):articleUI.mode==='float'?$('#articleFloat'):$('#articlePanel')}
function ensureArticleHosts(){
  if(!$('#articleFloat')){const f=document.createElement('section');f.id='articleFloat';f.className='articleFloat articleHost';f.setAttribute('aria-label','Статья');f.hidden=true;document.body.appendChild(f)}
  const main=document.querySelector('.main');
  if(main&&!$('#articleFull')){const f=document.createElement('section');f.id='articleFull';f.className='articleFullPane articleHost';f.setAttribute('aria-label','Статья');f.hidden=true;main.appendChild(f);const bar=document.createElement('div');bar.id='articleMapBar';bar.className='articleMapBar';bar.innerHTML='<span>🗺 Карта</span><button type="button" class="iconBtn" data-article-act="dock" title="Вернуть карту (статья — в панель)">⤡</button>';bar.hidden=true;main.appendChild(bar);const rz=document.createElement('div');rz.id='articleMapResize';rz.className='articleMapResize';rz.title='Потяните, чтобы изменить размер карты';rz.hidden=true;main.appendChild(rz)}
}
function clampRect(r,maxW,maxH,minW,minH){const w=Math.min(Math.max(minW,r.w),maxW),h=Math.min(Math.max(minH,r.h),maxH);const x=Math.min(Math.max(0,r.x??(maxW-w-16)),Math.max(0,maxW-w)),y=Math.min(Math.max(0,r.y??(maxH-h-16)),Math.max(0,maxH-h));return {x,y,w,h}}
function applyArticleGeometry(){
  const fl=$('#articleFloat');if(fl&&!fl.hidden){const f0=articleUI.float;if(f0.x==null||f0.y==null){const mr=document.querySelector('.main')?.getBoundingClientRect();if(mr){f0.x=mr.right-Math.min(f0.w,innerWidth)-24;f0.y=mr.top+70}}const r=clampRect(articleUI.float,innerWidth,innerHeight,300,220);Object.assign(articleUI.float,r);fl.style.left=r.x+'px';fl.style.top=r.y+'px';fl.style.width=r.w+'px';fl.style.height=r.h+'px'}
  const main=document.querySelector('.main');if(main?.classList.contains('articleFull')){const mr=main.getBoundingClientRect();const m0=articleUI.map;
    // Default place: bottom right, above Meh and his corner buttons.
    if(m0.x==null||m0.y==null){m0.w=Math.min(m0.w,Math.max(200,Math.round(mr.width*.45)));m0.h=Math.min(m0.h,Math.max(140,Math.round(mr.height*.4)));m0.x=mr.width-m0.w-16;m0.y=mr.height-m0.h-104}
    const r=clampRect(articleUI.map,mr.width,mr.height,200,140);r.y=Math.max(30,r.y);r.h=Math.min(r.h,mr.height-30);Object.assign(articleUI.map,r);for(const [k,v] of Object.entries({'--amap-x':r.x+'px','--amap-y':r.y+'px','--amap-w':r.w+'px','--amap-h':r.h+'px'}))main.style.setProperty(k,v)}
}
function renderArticles(){
  if((articleUI.id||articleUI.subject||articleUI.lib)&&articleUI.workspace&&articleUI.workspace!==state.workspaceId){articleUI.id=null;articleUI.subject=null;articleUI.lib=false}
  ensureArticleHosts();
  const open=articleIsOpen(),mode=articleUI.mode;
  const dock=$('#articlePanel'),fl=$('#articleFloat'),full=$('#articleFull'),main=document.querySelector('.main');
  for(const [el,m] of [[dock,'dock'],[fl,'float'],[full,'full']]){if(!el)continue;const on=open&&mode===m;el.hidden=!on;if(!on&&el.innerHTML){el.innerHTML='';delete el.articleRenderedHtml}}
  main?.classList.toggle('articleFull',open&&mode==='full');
  for(const id of ['articleMapBar','articleMapResize']){const el=$('#'+id);if(el)el.hidden=!(open&&mode==='full'&&!articleOnBoard())}
  const btn=$('#articlesBtn');if(btn)btn.classList.toggle('active',open);
  if(!open){articleUI.id=null;articleUI.subject=null;return}
  const host=articleHost();if(!host)return;
  const sc=host.querySelector('.articleScroll')?.scrollTop||0,focusSearch=document.activeElement?.matches?.('[data-article-search]'),caret=focusSearch?document.activeElement.selectionStart:0;
  const html=articleInnerHtml()+(mode==='float'?'<div class="articleFloatResize" title="Потяните, чтобы изменить размер" aria-hidden="true"></div>':'');
  if(host.articleRenderedHtml===html){applyArticleGeometry();return}
  host.articleRenderedHtml=html;host.innerHTML=html;host.dataset.mode=mode;
  const s2=host.querySelector('.articleScroll');if(s2)s2.scrollTop=sc;
  if(focusSearch){const inp=host.querySelector('[data-article-search]');if(inp){inp.focus();try{inp.setSelectionRange(caret,caret)}catch{}}}
  applyArticleGeometry();
}

// ---- Редактор ----
function articleLinkOptions(kind){
  if(kind==='entity')return data.entities.slice().sort((a,b)=>a.name.localeCompare(b.name,'ru')).map(e=>[e.id,`${e.name} · ${getET(e.type).name}`]);
  if(kind==='relation')return data.relations.filter(r=>!getRT(r.type).containment).map(r=>[r.id,`${getEntity(r.from)?.name||'?'} — ${getRT(r.type).name} — ${getEntity(r.to)?.name||'?'}`]);
  if(kind==='type')return data.entityTypes.map(t=>[t.id,t.name]);
  if(kind==='reltype')return data.relationTypes.map(t=>[t.id,t.name]);
  return wsArticles().map(a=>[a.id,a.title]);
}
function openArticleEditor(id,{link=null,parentId=null,title='',primaryFor=''}={}){
  const a=getArticle(id),openedA=a?clone(a):null;
  if((id&&!a)||!articleCanEdit(a))return;
  const workspace=state.workspaceId,canEditExtras=!worldReadOnly();
  const canManageTemplates=canEditExtras&&!window.UG_ONLINE_PLAYER;
  const templates=canManageTemplates?clone(currentWorkspace()?.articleTemplates||[]):[];
  const w=a?clone(a):{id:null,...(primaryFor?{primaryFor}:{}),title:(title&&(primaryFor||!articleResolve(title)))?title:'',icon:'📖',body:'',parentId,links:link?[link]:[],collect:{entTypes:[],statuses:[],tags:[]},tags:[]};
  const banned=a?articleDescendantIds(a.id):new Set();if(a)banned.add(a.id);
  const parents=wsArticles().filter(x=>!banned.has(x.id)).sort(articleSort);
  const chips=()=>w.links.map((l,i)=>{const info=articleLinkInfo(l);return info?`<span class="tagChip">${escapeHtml(info.icon)} ${escapeHtml(ARTICLE_LINK_KINDS.find(k=>k[0]===l.kind)[1])}: ${escapeHtml(info.label)} <button type="button" class="linkBtn" data-art-unlink="${i}" aria-label="Убрать">×</button></span>`:''}).join('')||'<span class="inlineHelp">Пока ни к чему не привязана.</span>';
  const statusOpts=data.statusGroups.flatMap(g=>g.options.map(o=>[statusKey(g.id,o.id),`${escapeHtml(g.name)}: ${escapeHtml(o.name)}`]));
  openModal(a?'Статья':'Новая статья',`<div class="form articleEditor">
    <div class="row"><div style="flex:3"><label>Название</label><input id="artTitle" maxlength="160" value="${escapeHtml(w.title)}" placeholder="Например: Бестиарий"></div><div style="flex:1"><label>Значок</label><input id="artIcon" maxlength="8" value="${escapeHtml(w.icon)}"></div></div>
    <div class="artIcons">${ARTICLE_ICONS.map(i=>`<button type="button" class="iconBtn${i===w.icon?' active':''}" data-art-icon="${i}" title="Значок ${i}" aria-pressed="${i===w.icon}">${i}</button>`).join('')}</div>
    <div><label>Раздел (статья-родитель)</label><select id="artParent"><option value="">— верхний уровень —</option>${parents.map(p=>`<option value="${escapeHtml(p.id)}" ${p.id===w.parentId?'selected':''}>${escapeHtml(p.icon)} ${escapeHtml(p.title)}</option>`).join('')}</select></div>
    <div><label for="artBody">Текст статьи</label>${articleWikiEditorHtml(w)}</div>
    ${canEditExtras?articleExtrasEditorHtml(templates,canManageTemplates):''}
    <div><label>Привязана к</label><div class="tagChips" id="artLinks">${chips()}</div>
      <div class="row artLinkAdd"><select id="artLinkKind">${ARTICLE_LINK_KINDS.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select><select id="artLinkItem"></select><button type="button" class="btn" id="artLinkAdd">Привязать</button></div></div>
    <details ${w.collect.entTypes.length||w.collect.statuses.length||w.collect.tags.length?'open':''}><summary>Подборка сущностей в статье (например, все «Монстры» — для бестиария)</summary>
      <label>Типы сущностей</label>${typeChecks(data.entityTypes.map(t=>[t.id,escapeHtml(t.name)]),w.collect.entTypes,'artCollType')}
      <label>Статусы (любой из отмеченных)</label>${typeChecks(statusOpts,w.collect.statuses,'artCollStatus')}
      <label>Теги (через запятую)</label><input id="artCollTags" value="${escapeHtml(w.collect.tags.join(', '))}"></details>
    <div><label>Теги статьи (через запятую)</label><input id="artTags" value="${escapeHtml(w.tags.join(', '))}"></div>
  </div>`,`${a?'<button class="btn danger" id="artDelete" type="button">Удалить</button>':''}<button class="btn" id="cancelModal" type="button">Отмена</button><button class="btn primary" id="artSave" type="button">Сохранить</button>`);
  const wiki=bindArticleWikiEditor(w,templates);
  const fillItems=()=>{$('#artLinkItem').innerHTML=articleLinkOptions($('#artLinkKind').value).filter(([id])=>!(($('#artLinkKind').value==='article')&&id===w.id)).map(([id,l])=>`<option value="${escapeHtml(id)}">${escapeHtml(l)}</option>`).join('')||'<option value="">— нет —</option>'};
  const redraw=()=>{$('#artLinks').innerHTML=chips();$$('[data-art-unlink]').forEach(b=>b.onclick=()=>{w.links.splice(Number(b.dataset.artUnlink),1);redraw()})};
  $('#artLinkKind').onchange=fillItems;fillItems();redraw();
  $('#artLinkAdd').onclick=()=>{const kind=$('#artLinkKind').value,id=$('#artLinkItem').value;if(!id)return;if(!w.links.some(l=>l.kind===kind&&l.id===id))w.links.push({kind,id});redraw()};
  const iconMarks=()=>{const v=$('#artIcon').value.trim();$$('[data-art-icon]').forEach(x=>{x.classList.toggle('active',x.dataset.artIcon===v);x.setAttribute('aria-pressed',String(x.dataset.artIcon===v))})}; /* 0.30.9: the chosen icon is seen */
  $$('[data-art-icon]').forEach(b=>b.onclick=()=>{$('#artIcon').value=b.dataset.artIcon;iconMarks()});$('#artIcon').addEventListener('input',iconMarks);
  $('#cancelModal').onclick=closeModal;
  if(a)$('#artDelete').onclick=()=>{closeModal();deleteArticle(a.id)};
  $('#artSave').onclick=()=>{
    if(wiki.busy()||workspace!==state.workspaceId||!articleCanEdit(getArticle(id)))return;
    const title=$('#artTitle').value.trim();if(!title){toast('Нужно название статьи','err');$('#artTitle').focus();return}
    const clash=wsArticles().find(x=>x.id!==w.id&&articleNorm(x.title)===articleNorm(title)&&(!w.primaryFor||x.primaryFor===w.primaryFor));if(clash){toast(`Статья «${clash.title}» уже есть — выберите другое название`,'err');return}
    const list=s=>s.split(',').map(x=>x.trim().replace(/^#/,'')).filter(Boolean);
    if(w.primaryFor&&(!getEntity(w.primaryFor)||wsArticles().some(x=>x.id!==w.id&&x.primaryFor===w.primaryFor))){
      toast('Основная статья этой бумажки уже изменилась. Откройте её снова.','err');return;
    }
    const next={...w,title,icon:$('#artIcon').value.trim()||'📖',body:$('#artBody').value,parentId:$('#artParent').value||null,tags:list($('#artTags').value),
      collect:{entTypes:$$('.artCollType:checked').map(c=>c.value),statuses:$$('.artCollStatus:checked').map(c=>c.value),tags:list($('#artCollTags').value)},updatedAt:new Date().toISOString()};
    const extras=wiki.read(),written=[];
    if(extras)for(const key of ['media','infoboxes']){delete next[key];if(extras[key])next[key]=extras[key]}
    let savedId=null,kept=[];
    const ok=articleCommit(()=>{
      for(const img of extras?.media||[]){
        const pending=wiki.pending.get(img.id);
        if(pending){mediaPut(pending);written.push(img.id)}
      }
      if(canManageTemplates&&JSON.stringify(wiki.templates)!==JSON.stringify(wiki.templatesOriginal)){
        const ws=currentWorkspace(),old=new Map(wiki.templatesOriginal.map(t=>[t.id,t]));
        const ids=new Set(wiki.templates.map(t=>t.id));
        const live=(ws.articleTemplates||[]).filter(t=>!old.has(t.id)||ids.has(t.id)||JSON.stringify(t)!==JSON.stringify(old.get(t.id)));
        const liveIds=new Set(live.map(t=>t.id));
        ws.articleTemplates=articleNormalizeTemplates([...live,...wiki.templates.filter(t=>!old.has(t.id)&&!liveIds.has(t.id))]);
      }
      const arr=wsArticles();
      if(a){
        const i=arr.findIndex(x=>x.id===a.id);
        if(i<0)throw new Error('Статья больше недоступна');
        const live=clone(arr[i]),m={...arr[i],...next};
        if(extras)for(const key of ['media','infoboxes'])if(!extras[key])delete m[key];
        if(typeof keepTheirChanges==='function')kept=keepTheirChanges(m,openedA,live);
        arr[i]=m;savedId=a.id;
      }else{
        next.id=uid('art');next.createdAt=next.updatedAt;arr.push(next);savedId=next.id;
      }
    },a?'Статья сохранена':'Статья создана');
    if(!ok)for(const mediaId of written){try{UniverseGraphStorage.mediaDelete(mediaId);invalidateMediaCache(mediaId)}catch{}}
    if(ok){closeModal();openArticle(savedId);if(typeof keptChangesToast==='function')keptChangesToast(kept)}
  };
}
function deleteArticle(id){
  const a=getArticle(id);if(!a||!articleCanEdit(a))return;const kids=articleChildren(id).length,wasOpen=articleUI.id===id;
  if(!confirm(`Удалить статью «${a.title}»?${kids?`\nСтатьи внутри (${kids}) останутся и поднимутся на уровень выше.`:''}\nСущности и связи не изменятся.`))return;
  const ok=articleCommit(()=>{const arr=wsArticles();for(const c of arr)if(c.parentId===id)c.parentId=a.parentId||null;for(const c of arr)c.links=c.links.filter(l=>!(l.kind==='article'&&l.id===id));arr.splice(arr.findIndex(x=>x.id===id),1)},'Статья удалена');
  if(ok&&wasOpen)openArticleLibrary();
}
// The «📖 Статья» button next to the name: opens the article written about this record, or starts a new one (titled by the record).
function articleDirectCandidates(subject){
  const own=wsArticles().filter(a=>a.primaryFor===subject.id);
  if(own.length)return own.sort(articleSort);
  return wsArticles().filter(a=>!a.primaryFor&&a.links.some(l=>l.kind==='entity'&&l.id===subject.id)).sort(articleSort);
}
function articleSetPrimary(subject,articleId){
  const a=getArticle(articleId);
  if(!subject||subject.kind!=='entity'||!articleCanEdit(a)||!a||
      (a.primaryFor&&a.primaryFor!==subject.id)||!articleDirectCandidates(subject).includes(a))return false;
  const ok=articleCommit(()=>{
    for(const old of wsArticles())if(old.primaryFor===subject.id&&old.id!==a.id)delete old.primaryFor;
    a.primaryFor=subject.id;
    if(!a.links.some(l=>l.kind==='entity'&&l.id===subject.id))a.links.push({kind:'entity',id:subject.id});
  },'Основная статья выбрана');
  if(ok)openArticle(a.id);
  return ok;
}
function articleForSubject(subjKey){
  const subject=subjectFromKey(subjKey);if(!subject||subject.obj.hint)return;
  articleUI.subject=subjKey;articleUI.workspace=state.workspaceId;
  if(subject.kind!=='entity'){
    const own=articlesForSubject(subject).filter(x=>x.how==='привязана');
    if(own.length===1)openArticle(own[0].a.id);else if(own.length)articleShowSubject();else newArticleFor(subjKey);
    return;
  }
  const direct=articleDirectCandidates(subject);
  const one=direct[0];
  const isLegacyExample=one?.title==='Вселенная'&&subject.id!==currentRootId()&&one.links.some(l=>l.kind==='entity'&&l.id===currentRootId());
  if(direct.length===1&&(one.primaryFor===subject.id||!isLegacyExample&&one.links.filter(l=>l.kind==='entity').length===1)){
    openArticle(one.id);return;
  }
  if(direct.length||!articleCanEdit()){articleShowSubject();return}
  newArticleFor(subjKey,{useName:true,primary:true});
}
// The «＋ Статья» button in the «Статьи» section of a record or a relation.
function newArticleFor(subjKey,{useName=false,primary=false}={}){
  const s=subjectFromKey(subjKey);
  if(!s||s.obj.hint||!articleCanEdit())return;
  openArticleEditor(null,{link:{kind:s.kind==='relation'?'relation':'entity',id:s.id},title:useName&&s.kind==='entity'?s.obj.name:'',primaryFor:primary&&s.kind==='entity'?s.id:''});
}
function articleShowSubject(){
  articleBoardDefault();articleUI.id=null;articleUI.lib=false;renderArticles();
}
function articleSubjectHtml(){
  const subject=subjectFromKey(articleUI.subject);
  if(!subject)return '';
  const direct=subject.kind==='entity'?articleDirectCandidates(subject):[];
  const choices=articleCanEdit()&&direct.length?`<div class="articleSub">Выбрать основную статью</div><div class="articleList">${direct.map(a=>`<button type="button" class="articleRow" data-article-primary="${escapeHtml(a.id)}">${escapeHtml(a.title)}</button>`).join('')}</div>`:'';
  const create=articleCanEdit()&&subject.kind==='entity'&&!direct.some(a=>a.primaryFor===subject.id)?`<button type="button" class="btn" data-article-new-primary="${escapeHtml(subjectKey(subject))}">＋ Собственная статья</button>`:'';
  return `<div class="articleHead"><h2 class="articleTitle">Статьи о «${escapeHtml(subject.obj.name)}»</h2></div>
    <div class="articleScroll">${choices}${create}${articlesSectionBody(subject)}</div>`;
}

// ---- Раздел «Статьи» на странице записи ----
SECTION_KINDS.articles={name:'Статьи',icon:'📖',group:'data',subjects:['entity','relation'],unique:true,hint:'Статьи вики, привязанные к сущности, её типу или упоминающие её',settings:[]};
function articlesSectionBody(subj){
  const list=articlesForSubject(subj);
  return `${list.length?`<div class="articleList">${list.map(({a,how})=>articleCardRow(a,how+(plainExcerpt(a.body,70)?' · '+plainExcerpt(a.body,70):''))).join('')}</div>`:'<div class="empty">Статей пока нет.</div>'}${articleCanEdit()&&!subj.obj.hint?`<div class="articleSecFoot"><button type="button" class="linkBtn" data-article-new-for="${escapeHtml(subjectKey(subj))}">＋ Статья</button></div>`:''}`;
}

// ---- Перетаскивание окошек и изменение размера ----
let articleDrag=null;
function articleDragStart(ev,kind,mode){const r=kind==='float'?articleUI.float:articleUI.map;articleDrag={kind,mode,sx:ev.clientX,sy:ev.clientY,r:{...r},id:ev.pointerId};ev.preventDefault();try{ev.target.setPointerCapture?.(ev.pointerId)}catch{}}
window.addEventListener('pointermove',ev=>{const d=articleDrag;if(!d||ev.pointerId!==d.id)return;const dx=ev.clientX-d.sx,dy=ev.clientY-d.sy;const t=d.kind==='float'?articleUI.float:articleUI.map;
  if(d.mode==='move'){t.x=d.r.x+dx;t.y=d.r.y+dy}else if(d.kind==='float'){t.w=d.r.w+dx;t.h=d.r.h+dy}else{t.x=d.r.x+dx;t.y=d.r.y+dy;t.w=d.r.w-dx;t.h=d.r.h-dy}
  applyArticleGeometry()});
window.addEventListener('pointerup',ev=>{if(articleDrag&&ev.pointerId===articleDrag.id){articleDrag=null;saveArticleUI()}});
window.addEventListener('resize',()=>{if(articleIsOpen())applyArticleGeometry()});

// ---- Клики ----
document.addEventListener('pointerdown',ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t||ev.button!==0)return;
  if(t.closest('#articleFloat .articleHead, #articleFloat .articleTools')&&!t.closest('button,input,a,select,textarea')){articleDragStart(ev,'float','move');return}
  if(t.closest('#articleFloat')&&t.closest('.articleFloatResize')){articleDragStart(ev,'float','size');return}
  if(t.closest('#articleMapBar')&&!t.closest('button')){articleDragStart(ev,'map','move');return}
  if(t.closest('#articleMapResize')){articleDragStart(ev,'map','size')}});
document.addEventListener('click',ev=>{
  const t=ev.target instanceof Element?ev.target:null;if(!t)return;
  if(t.closest('#articlesBtn')){ev.preventDefault();if(articleUI.lib)closeArticle();else openArticleLibrary();return}
  const open=t.closest('[data-article-open]');if(open){ev.preventDefault();openArticle(open.dataset.articleOpen);return}
  const af=t.closest('[data-article-for]');if(af){ev.preventDefault();articleForSubject(af.dataset.articleFor);return}
  const primary=t.closest('[data-article-primary]');
  if(primary){ev.preventDefault();articleSetPrimary(subjectFromKey(articleUI.subject),primary.dataset.articlePrimary);return}
  const createPrimary=t.closest('[data-article-new-primary]');
  if(createPrimary){ev.preventDefault();newArticleFor(createPrimary.dataset.articleNewPrimary,{useName:true,primary:true});return}
  const nf=t.closest('[data-article-new-for]');if(nf){ev.preventDefault();newArticleFor(nf.dataset.articleNewFor);return}
  const rel=t.closest('[data-article-relation]');if(rel){ev.preventDefault();state.selectedRelationId=rel.dataset.articleRelation;state.selectedId=null;state.selectedIds=new Set();updateUI();return}
  const jump=t.closest('[data-article-jump]');
  if(jump){const heading=jump.closest('.articleHost').querySelector(`[data-article-heading="${Number(jump.dataset.articleJump)}"]`);heading?.scrollIntoView({block:'start'});heading?.focus({preventScroll:true});return}
  const image=t.closest('[data-article-picture]');
  if(image){ev.preventDefault();openModal('Изображение статьи',`<img class="articleEnlarged" src="${escapeHtml(image.href)}" alt="${escapeHtml(image.querySelector('img').alt)}">`,'');return}
  const related=t.closest('.articleHost [data-related]');
  if(related){if(articleOnBoard())closeArticle();revealEntity(related.dataset.related);return}
  const act=t.closest('[data-article-act]');if(!act)return;ev.preventDefault();
  const a=act.dataset.articleAct;
  if(a==='subject')articleShowSubject();else if(a==='library')openArticleLibrary();else if(a==='close')closeArticle();else if(a==='new')openArticleEditor(null);
  else if(a==='edit'){if(articleUI.id)openArticleEditor(articleUI.id)}else if(a==='child'){if(articleUI.id)openArticleEditor(null,{parentId:articleUI.id})}
  else if(['dock','float','full'].includes(a))setArticleMode(a);
});
document.addEventListener('input',ev=>{const t=ev.target;if(t instanceof HTMLElement&&t.matches('[data-article-search]')){articleUI.query=t.value;renderArticles()}});
window.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&articleIsOpen()&&!$('#modalBack')?.classList.contains('open')){
  if(articleOnBoard()){ev.preventDefault();closeArticle()}
  else if(articleUI.mode==='full'){ev.preventDefault();setArticleMode('dock')}
}});

// 0.28.1: the eye of an article — green: players see it, grey: «there is an article», black: the Master only
function articleVisRowHtml(a){const cur=a.vis==='gm'||a.vis==='hint'?a.vis:'all';if(typeof visEyeSvg!=='function')return '';
  return `<div class="visRow articleVis" role="group" aria-label="Кто видит статью"><span class="visLabel">Кто видит:</span>${VIS_STATES.filter(([v])=>['all','hint','gm'].includes(v)).map(([v,name,hint])=>`<button type="button" class="visBtn${v===cur?' on':''}" data-art-vis="${escapeHtml(a.id)}|${v}" aria-pressed="${v===cur}" title="${escapeHtml(name+(v==='hint'?' — «Неизвестная статья», без текста':v==='gm'?' — игроки не видят совсем':' — игроки видят статью целиком'))}">${visEyeSvg(v)}</button>`).join('')}<span class="visNow">${escapeHtml(VIS_STATES.find(s=>s[0]===cur)?.[1]||'')}</span></div>`}
function setArticleVis(id,v){if(articlePlayerMode())return false;const a=getArticle(id);if(!a||!['all','hint','gm'].includes(v))return false;const cur=a.vis==='gm'||a.vis==='hint'?a.vis:'all';if(cur===v)return false;
  return articleCommit(()=>{if(v==='all')delete a.vis;else a.vis=v;a.updatedAt=new Date().toISOString()},`Статья «${a.title}»: ${(VIS_STATES.find(s=>s[0]===v)?.[1]||'').toLowerCase()}`)}
document.addEventListener('click',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-art-vis]'):null;if(!b)return;ev.preventDefault();ev.stopPropagation();const [id,v]=b.dataset.artVis.split('|');if(setArticleVis(id,v))renderArticles()},true);

