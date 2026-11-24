// Universe Graph — «глазами игрока» (0.28). Меню в правом верхнем углу: Мастер / Игрок / Зритель.
// В режиме игрока программа показывает не мир, а его «проекцию» — копию, где:
//   нет записей «только Мастер», убранных с доски и всего, что лежит внутри них;
//   серые записи — «Неизвестный персонаж» со значком типа, без имени, описания, анкеты, статусов, картинок;
//   нити — только между известными записями; жёлтый глаз скрывает подробности нити;
//   блоки страницы «только Мастер» убраны, серые — «Что-то есть, но подробностей нет».
// Все режимы, поиск, Мех смотрят в эту копию, поэтому ничего лишнего не просачивается. Изменения в режиме игрока
// не сохраняются (это просмотр); вернуться — «Мастер». Та же проекция пойдёт игрокам по сети в 0.30.
// Модуль загружается обычным <script> после visibility.js.
'use strict';
const VIEW_ROLES=[['gm','👑','Мастер','видит всё и меняет мир'],['player','🎲','Игрок','видит то, что Мастер открыл игрокам'],['viewer','👁','Зритель','пока — как игрок']];
let playerViewSaveNoted=false,playerArticles=null,playerPaperBoards=null;
// «глазами игрока» у Мастера — просмотр копии; 0.30.4: у игрока по сети мир уже его (прислан Мастером) и он его правит,
// поэтому viewAsPlayer() там ложно, а «спрятать кнопки Мастера» — uiIsPlayer()
function viewAsPlayer(){return !!state.viewAs&&state.viewAs!=='gm'&&!window.UG_ONLINE_PLAYER}
function worldReadOnly(){
  if(viewAsPlayer())return true;
  if(!window.UG_ONLINE_PLAYER)return false;
  return typeof onp==='undefined'||onp.state!=='in'||onp.me?.role!=='player'||!!onp.copy||!!(onp.world&&typeof currentWorkspace==='function'&&currentWorkspace()?.id!==onp.world.id);
}
function uiIsPlayer(){return viewAsPlayer()||!!window.UG_ONLINE_PLAYER}
// «Неизвестный персонаж», «Неизвестная гильдия», «Неизвестное место»
function unknownName(typeId){
  const t=typeId?getET(typeId):null,w=String(t?.name||'').split('/')[0].trim().toLowerCase();if(!w)return 'Неизвестная сущность';
  const last=w.split(/\s+/)[0],adj=/[ая]$/.test(last)?'Неизвестная':/[оеё]$/.test(last)?'Неизвестное':/ь$/.test(last)?'Неизвестная':'Неизвестный';
  return adj+' '+w;
}
// 0.28 (идея Claude): names of what the player must not know are masked in the texts he can see — «торгует с Испанией» → «торгует с ???»
function secretNameRe(names){
  const full=names.map(n=>String(n||'').trim()).filter(n=>n.length>=3),first=full.filter(n=>/\s/.test(n)).map(n=>n.split(/\s+/)[0]).filter(w=>w.length>=4); /* «Маркус» alone is Маркус Аркен too */
  const parts=[...new Set([...full,...first])].map(n=>n.split(/\s+/).map(w=>{w=w.toLowerCase();const st=w.length>4?w.replace(/(ами|ями|ов|ев|ей|ом|ем|ой|ую|ая|ое|ий|ый|а|я|у|ю|е|ы|и|о)$/,''):w;return st.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[её]/g,'[её]')+'[а-яёa-z]{0,4}'}).join('\\s+'));
  if(!parts.length)return null;parts.sort((a,b)=>b.length-a.length);
  return new RegExp('(^|[^а-яёa-z0-9])('+parts.join('|')+')(?![а-яёa-z0-9])','gi');
}
function maskDeep(v,re,d=0){if(d>8)return v;if(typeof v==='string')return maskSecrets(v,re);if(Array.isArray(v))return v.map(x=>maskDeep(x,re,d+1));if(isRecord(v)){const o={};for(const [k,x] of Object.entries(v))o[k]=/^(id|type|from|to|url|src|ref|key)$/.test(k)?x:maskDeep(x,re,d+1);return o}return v}
function maskSecrets(text,re){return re&&typeof text==='string'?text.replace(re,(m,pre)=>pre+'???'):text}
function inheritedHidden(parentOf,isHidden){
  const memo=new Map();
  return item=>{
    if(!item)return false;
    if(memo.has(item.id))return memo.get(item.id);
    const path=new Set();
    let hidden=false;
    for(let node=item;node;node=parentOf(node)){
      if(memo.has(node.id)){hidden=memo.get(node.id);break}
      if(path.has(node.id))break;
      path.add(node.id);
      if(isHidden(node)){hidden=true;break}
    }
    for(const id of path)memo.set(id,hidden);
    return hidden;
  };
}
function playerProjection(ws){
  const ents=ws.entities||[],rels=ws.relations||[],contain=new Set((ws.relationTypes||[]).filter(t=>t.containment).map(t=>t.id)),root=ws.rootId;
  const byId=new Map(ents.map(e=>[e.id,e])),parent=new Map();for(const r of rels)if(contain.has(r.type)&&!r.udMembership)parent.set(r.to,r.from);
  const parentOf=e=>e.id===root?null:byId.get(parent.get(e.id));
  const hidden=inheritedHidden(parentOf,e=>e.id!==root&&(
    !!e.offBoard||e.vis==='gm'&&!entityNamedVisibility(e)||(!e.onBoard&&!!parentOf(e)?.contentOffBoard)));
  // articles: hidden ones (and everything inside a hidden one) are gone, grey ones keep only «there is an article»
  const arts=Array.isArray(ws.articles)?ws.articles:[],artById=new Map(arts.map(a=>[a.id,a]));
  const artHidden=inheritedHidden(a=>artById.get(a.parentId),a=>a.vis==='gm');
  const unknown=ents.filter(e=>hidden(e)||e.vis==='hint');
  const privateAliases=ents.filter(e=>hidden(e)||e.vis==='hint'||entityNamedVisibility(e)).flatMap(e=>e.aliases||[]);
  const secretRe=secretNameRe([...unknown.map(e=>e.name),...privateAliases,...arts.filter(a=>artHidden(a)||a.vis==='hint').map(a=>a.title)]);
  const out=[],hint=new Set(),named=new Set();
  for(const e of ents){if(hidden(e))continue;
    if(entityNamedVisibility(e)&&e.id!==root){
      named.add(e.id);
      const style={x:e.style?.x,y:e.style?.y};
      const c={id:e.id,type:e.type,name:e.name,description:'',properties:{},tags:[],media:[],widgets:[],style,hint:'named'};
      if(e.board){
        const {x,y,at,lock,fixed}=e.board;
        c.board=clone({x,y,at,lock,fixed});
      }
      out.push(c);continue;
    }
    if(e.vis==='hint'){hint.add(e.id);out.push({id:e.id,type:e.type,name:unknownName(e.type),description:'',properties:{},tags:[],media:[],widgets:[],style:{...clone(e.style||{}),icon:undefined,color:undefined},...(e.board?{board:clone(e.board)}:{}),hint:true});continue}
    const c=clone(e);delete c.vis;delete c.namedVisibility;
    if(secretRe)for(const k of ['description','note','properties','sectionData','widgets','tags','aliases'])if(c[k]!==undefined)c[k]=maskDeep(c[k],secretRe);
    if(isRecord(c.blockVis)){for(const [sec,v] of Object.entries(c.blockVis))playerStripBlock(c,sec,v,ws);delete c.blockVis}
    out.push(c)}
  const ids=new Set(out.map(e=>e.id)),rOut=[];
  const stripLink=(text)=>typeof text==='string'?text.replace(WIKI_LINK_RE,(token,target)=>{
    const m=target.trim().match(/^(карточка|статья-id):([A-Za-z0-9_-]+)$/i);
    if(!m)return token;
    const article=m[1].toLowerCase()==='статья-id';
    const accessible=article?artById.has(m[2])&&!artHidden(artById.get(m[2]))&&artById.get(m[2]).vis!=='hint':ids.has(m[2])&&!hint.has(m[2]);
    return accessible?token:'Ссылка недоступна';
  }):text;
  for(const e of out){
    for(const field of ['description','note'])if(e[field]!==undefined)e[field]=stripLink(e[field]);
    if(e.hint&&e.board?.photo)delete e.board.photo;
    if(e.board?.lock?.parent&&!ids.has(e.board.lock.parent))delete e.board.lock;
    if(e.board?.at)for(const key of Object.keys(e.board.at))if(!ids.has(key))delete e.board.at[key];
    if(e.board?.fixed)for(const key of Object.keys(e.board.fixed))if(!ids.has(key))delete e.board.fixed[key];
  }
  for(const r of rels){if(!ids.has(r.from)||!ids.has(r.to)||r.properties?.secret)continue;
    const contains=contain.has(r.type);
    if(!contains&&(hint.has(r.from)||hint.has(r.to)))continue;
    if(named.has(r.from)||named.has(r.to)){
      rOut.push({id:r.id,from:r.from,to:r.to,type:contains?PLAYER_MASKED_MEMBERSHIP.id:PLAYER_MASKED_THREAD.id,
        labelMode:'never',properties:{},style:{},
        ...(contains&&r.udMembership?{udMembership:true}:{})});
      continue;
    }
    // 0.29 (аудит 2.5): the relation's own words — its name on the line, description, fields — were copied as they are,
    // and the Master's text about a hidden record («Тут замешан Зорг») reached the player
    const c=clone(r);if(secretRe){for(const k of ['label','description'])if(typeof c[k]==='string')c[k]=maskSecrets(c[k],secretRe);if(c.properties!==undefined)c.properties=maskDeep(c.properties,secretRe)}
    rOut.push(c)}
  const artOut=[];
  for(const a of arts){if(artHidden(a))continue;
    if(a.vis==='hint'){artOut.push({id:a.id,title:'Неизвестная статья',icon:'📖',body:'',parentId:a.parentId||null,...(ids.has(a.primaryFor)&&!hint.has(a.primaryFor)?{primaryFor:a.primaryFor}:{}),links:(a.links||[]).filter(l=>l.kind==='entity'&&ids.has(l.id)&&!hint.has(l.id)),collect:{entTypes:[],statuses:[],tags:[]},tags:[],order:a.order||0,createdAt:a.createdAt,updatedAt:a.updatedAt,hint:true});continue}
    const c=clone(a);delete c.vis;
    if(c.primaryFor&&(!ids.has(c.primaryFor)||hint.has(c.primaryFor)))delete c.primaryFor;
    if(secretRe){
      c.body=maskSecrets(c.body,secretRe);
      for(const image of c.media||[])for(const k of ['name','caption','alt'])image[k]=maskSecrets(image[k],secretRe);
      for(const box of c.infoboxes||[]){box.title=maskSecrets(box.title,secretRe);box.rows=maskDeep(box.rows,secretRe)}
    }
    c.body=stripLink(c.body);
    for(const image of c.media||[])image.caption=stripLink(image.caption);
    for(const box of c.infoboxes||[])for(const row of box.rows)row.value=stripLink(row.value);
    c.links=(c.links||[]).filter(l=>l.kind==='entity'?ids.has(l.id):l.kind==='article'?!artHidden(artById.get(l.id)):true);artOut.push(c)}
  return {entities:out,relations:rOut,articles:artOut};
}
// a block «only the Master» is removed from the copy; a grey one keeps its place with no contents
function udDescriptionRestricted(e,ws=currentWorkspace(),hidden=e?.blockVis){
  const type=(ws?.entityTypes||[]).find(t=>t.id===e?.type);
  return [...typePage(type,'entity'),...(e?.page?.add||[])].some(sec=>sec.kind==='description'&&['gm','hint'].includes(hidden?.[sec.id]));
}
function playerStripBlock(e,sec,v,ws){
  const typeDef=(ws?.entityTypes||[]).find(t=>t.id===e.type)||null,tpl=typeof typePage==='function'?typePage(typeDef,'entity'):[],own=e.page?.add||[];
  const kind=[...tpl,...own].find(x=>x&&x.id===sec)?.kind||(sec==='auto-map'?'map':'');const fieldNames=new Set((typeDef?.fields||[]).map(f=>f.name));
  if(kind==='description'){e.description='';if(e.note!==undefined)e.note=''}
  else if(kind==='fields'){for(const k of Object.keys(e.properties||{}))if(fieldNames.has(k))delete e.properties[k]}
  else if(kind==='properties'){for(const k of Object.keys(e.properties||{}))if(!fieldNames.has(k))delete e.properties[k]}
  else if(kind==='gallery')e.media=[];
  else if(kind==='tags')e.tags=[];
  else if(kind==='blocks')e.widgets=[];
  if(isRecord(e.sectionData))delete e.sectionData[sec];
  e.blockHidden=e.blockHidden||{};e.blockHidden[sec]=v;
}
// swap the arrays the views read; the world itself (the workspaces) stays as it is
function playerReproject(){
  const ws=currentWorkspace();if(!ws||!viewAsPlayer())return;
  const p=playerProjection(ws);data.entities=p.entities;data.relations=p.relations;playerArticles=p.articles;playerPaperBoards=udProjectPaperBoards(ws,p);previewBoards.clear();
  if(typeof invalidateContainmentIndex==='function')invalidateContainmentIndex();
  if(state.scopeId&&!getEntity(state.scopeId))state.scopeId=ws.rootId;
  if(typeof udRestoreSharedContext==='function')udRestoreSharedContext();
}
function setViewAs(role,who=''){
  if(!VIEW_ROLES.some(r=>r[0]===role))return false;const was=state.viewAs||'gm';
  /* 0.30.1: «глазами Борна» — a participant of this role; the picture is the same as for the role, the banner names him */
  const p=role!=='gm'&&who&&typeof partGet==='function'?partGet(who):null;who=p?p.id:'';
  if(was===role){if((state.viewAsWho||'')!==who){state.viewAsWho=who;renderRoleMenu();if(typeof renderMyNotes==='function')renderMyNotes();if(p)toast(`Глазами участника «${p.name}»`,'ok')}else renderRoleMenu();return true}
  const rulesWasOpen=$('#modalBack')?.classList.contains('open')&&$('#modalTitle')?.textContent==='Набор правил';
  if($('#modalBack')?.classList.contains('open')&&!closeModal())return false;
  if(was==='gm'&&role!=='gm'){
    if(!udSetFinish())return false;
    if(!udFinishEdit(true)||!udFinishDescription(true))return false;
  }
  hideContextMenu();closeSectionMenu();closeStatusMenu();udCloseMenu();closeLinkPicker();
  linkDragEnd(0,0,true);hideWorkspacePopup();udMenuOpen(false);
  $('#paperPop')?.remove();
  const drag=state.boardDrag;
  if(drag){udDragEnd(drag);clearTimeout(drag.nestTimer);state.boardDrag=null;$('#detectiveView')?.classList.remove('moving','panning')}
  previewBoards.clear();
  state.boardLastTap=null;state.udPaperOpen=null;state.udPaperReveal=null;
  state.viewAs=role;state.viewAsWho=who;state.selectedId=null;state.selectedIds=new Set();state.selectedRelationId=null;state.showHidden=false;
  if(role==='gm'){
    playerArticles=null;playerPaperBoards=null;
    const ws=currentWorkspace();if(ws)applyWorkspace(ws);
    state.history=state.scopeId?[state.scopeId]:[];state.historyIndex=0;
  }
  else playerReproject();
  playerViewSaveNoted=false;document.body.dataset.viewAs=role;if(rulesWasOpen)rulesSyncViewAccess(rulesWasOpen);state.viewVersion=(state.viewVersion||0)+1;renderRoleMenu();updateUI();if(typeof renderMyNotes==='function')renderMyNotes();
  toast(role==='gm'?'Режим Мастера: видно всё':`Вы смотрите глазами ${p?`участника «${p.name}»`:role==='player'?'игрока':'зрителя'}: только то, что открыто игрокам. Это просмотр — изменения не сохраняются`,'ok');
  return true;
}
function renderRoleMenu(){
  if(typeof udPeopleRefresh==='function')udPeopleRefresh();
  const role=state.viewAs||'gm',r=VIEW_ROLES.find(x=>x[0]===role),btn=$('#roleBtn');
  /* 0.30.3: a player in the game over the network — who he is, who the Master is, «Выйти из игры» */
  if(window.UG_ONLINE_PLAYER){const me=typeof onp!=='undefined'?onp.me:null,gm=typeof onp!=='undefined'?onp.gm:null,ic=me?.role==='viewer'?'👁':'🎲';
    if(btn){btn.innerHTML=`${ic}<span class="tlabel"> ${escapeHtml(me?.name||'Игрок')}</span> ▾`;btn.classList.add('rolePlayer');btn.title='Вы в игре по сети'}
    const menu=$('#roleMenu');if(menu)menu.innerHTML=`<div class="roleItem rolePart on" style="--part-c:${escapeHtml(me?.color||'')}">${me?partAvatarHtml(me,'partAva small'):''}<span><b>${escapeHtml(me?.name||'—')}</b><small>вы — ${me?.role==='viewer'?'зритель':'игрок'}</small></span></div>${gm?`<div class="roleItem rolePart" style="--part-c:${escapeHtml(gm.color||'')}">${partAvatarHtml(gm,'partAva small')}<span><b>${escapeHtml(gm.name)}</b><small>Мастер${(()=>{const v=typeof prs!=='undefined'?prs.list.find(x=>x.gm):null;return v?' · '+escapeHtml(prsPlaceName(v.p)||'в игре'):''})()}</small></span></div>`:''}${typeof prs!=='undefined'?prs.list.filter(v=>v.id!==me?.id&&!v.gm).map(v=>`<div class="roleItem rolePart" style="--part-c:${escapeHtml(v.color||'')}">${partAvatarHtml(v,'partAva small')}<span><b>${escapeHtml(v.name)}</b><small>${v.gm?'Мастер · ':''}${escapeHtml(prsPlaceName(v.p)||'в игре')}${v.ms?` · ${v.ms} мс`:''}</small></span></div>`).join(''):''}<button type="button" role="menuitem" class="roleItem roleParts" data-role-leave><span class="roleIcon">⎋</span><span><b>Выйти из игры</b><small>можно войти снова</small></span></button>`;
    const banner=$('#viewAsBanner');if(banner)banner.hidden=true;return}
  const who=role!=='gm'&&state.viewAsWho&&typeof partGet==='function'?partGet(state.viewAsWho):null;
  if(btn){btn.innerHTML=`${r[1]}<span class="tlabel"> ${escapeHtml(who?who.name:r[2])}</span> ▾`;btn.classList.toggle('rolePlayer',role!=='gm');btn.title=`Режим: ${r[2]}${who?' «'+who.name+'»':''} — ${r[3]}. Нажмите, чтобы переключить`}
  /* 0.30.1: under «Игрок» / «Зритель» — the participants of this world, and «Участники…» at the bottom */
  const parts=typeof partsInWorld==='function'?partsInWorld():[];
  const sub=id=>parts.filter(p=>p.role===id).map(p=>`<button type="button" role="menuitemradio" aria-checked="${role===id&&who?.id===p.id}" class="roleItem rolePart${role===id&&who?.id===p.id?' on':''}" data-role="${id}" data-role-who="${escapeHtml(p.id)}" style="--part-c:${escapeHtml(p.color)}">${partAvatarHtml(p,'partAva small')}<span><b>${escapeHtml(p.name)}</b><small>глазами ${id==='viewer'?'зрителя':'игрока'}</small></span></button>`).join('');
  const menu=$('#roleMenu');if(menu)menu.innerHTML=VIEW_ROLES.map(([id,icon,name,hint])=>`<button type="button" role="menuitemradio" aria-checked="${id===role&&!who}" class="roleItem${id===role&&!who?' on':''}" data-role="${id}"><span class="roleIcon">${icon}</span><span><b>${escapeHtml(name)}</b><small>${escapeHtml(hint)}</small></span></button>${id==='gm'?'':sub(id)}`).join('')
    +(role==='gm'&&typeof openParticipants==='function'?`<button type="button" role="menuitem" class="roleItem roleParts" data-role-parts><span class="roleIcon">👥</span><span><b>Аватары…</b><small>${parts.length?`${parts.length} в этом мире · `:''}ник, цвет, пароль</small></span></button>`:'')
    +(role==='gm'&&typeof openOnline==='function'?`<button type="button" role="menuitem" class="roleItem roleOnline" data-role-online><span class="roleIcon">🌐</span><span><b>Игра по сети…</b><small>открыть мир игрокам по ссылке</small></span></button>`:'');
  const banner=$('#viewAsBanner');if(banner){banner.hidden=role==='gm';banner.style.setProperty('--part-c',who?.color||'');banner.classList.toggle('isWho',!!who);banner.textContent=role==='gm'?'':`${r[1]} Глазами ${who?`«${who.name}» (${role==='player'?'игрок':'зритель'})`:role==='player'?'игрока':'зрителя'} — видно только то, что открыто игрокам. Изменения не сохраняются.`}
}
{
  const btn=$('#roleBtn'),menu=$('#roleMenu');
  // the top bar is its own layer (the side panels lie above it) — the menu lives at the top of the page instead
  if(menu&&menu.parentElement!==document.body)document.body.appendChild(menu);
  const place=()=>{const r=btn.getBoundingClientRect(),z=typeof uiZ==='function'?uiZ():1;menu.style.top=zpx(r.bottom+6)+'px';menu.style.right=zpx(Math.max(8,window.innerWidth-r.right))+'px'};
  btn?.addEventListener('click',e=>{e.stopPropagation();const open=!menu.classList.contains('open');if(open){renderRoleMenu();place()}menu.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open))});
  menu?.addEventListener('click',e=>{const t=e.target instanceof Element?e.target:null;if(!t)return;if(t.closest('[data-role-parts]')){menu.classList.remove('open');btn?.setAttribute('aria-expanded','false');openParticipants();return}if(t.closest('[data-role-leave]')){menu.classList.remove('open');btn?.setAttribute('aria-expanded','false');if(typeof onpLeave==='function')onpLeave();return}if(t.closest('[data-role-online]')){menu.classList.remove('open');btn?.setAttribute('aria-expanded','false');openOnline();return}const b=t.closest('[data-role]');if(!b)return;menu.classList.remove('open');btn?.setAttribute('aria-expanded','false');setViewAs(b.dataset.role,b.dataset.roleWho||'')});
  document.addEventListener('click',e=>{if(menu?.classList.contains('open')&&!(e.target instanceof Element&&e.target.closest('#rolePicker'))){menu.classList.remove('open');btn?.setAttribute('aria-expanded','false')}});
  renderRoleMenu();
}

