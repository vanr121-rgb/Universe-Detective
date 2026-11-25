// 0.23.10: «Связать — быстро». A small window at the mouse to choose the type of a new relation A → B:
// on top — types that fit these two records by the rules and the recently used ones; the rest — in groups by importance
// (I–V, they open on click); typing filters everything; Enter — the first one; ⇄ — swap the direction; «Подробнее…» — the
// full window with A, B and the type already filled in. Used by «потянуть связь» (Graph, Galaxy, Detective), «Связать с…»
// (menu of any record, «Связи» block) and the full window's own type field.
const LINK_RECENT_MAX=6;
let linkPick=null; // {from,to,x,y,q,open:Set(tiers),active,onDone}

function linkRecentTypes(){return (state.recentRelTypes||[]).filter(id=>data.relationTypes.some(t=>t.id===id))}
function linkRemember(typeId){const r=linkRecentTypes().filter(x=>x!==typeId);r.unshift(typeId);state.recentRelTypes=r.slice(0,LINK_RECENT_MAX);saveUIPrefs()}
// Which types to offer for A → B: «fit» — the rules name exactly these kinds of records; «ok» — allowed (no rule against);
// «no» — the rules forbid A → B (they are listed only when searching, greyed, so the person sees why a type is missing).
function linkTypeCandidates(fromId,toId){
  const a=getEntity(fromId),b=getEntity(toId),fit=[],ok=[],no=[];
  for(const t of data.relationTypes){if(t.containment)continue;const allows=relationTypeAllows(t,a,b),specific=(t.fromTypes?.length||0)+(t.toTypes?.length||0)>0;(allows?(specific?fit:ok):no).push(t)}
  const contains=data.relationTypes.find(t=>t.containment);
  return {fit,ok,no,contains};
}
function linkTypeLabel(t){return `<i class="lpDot" style="background:${escapeHtml(safeCssValue(t.color,'#8fb7ff'))}"></i><span class="lpName">${escapeHtml(t.name)}</span>${t.reverseName?`<small>обратно: ${escapeHtml(t.reverseName)}</small>`:''}`}
function linkItem(t,dis){return `<button type="button" class="lpItem${dis?' lpNo':''}" data-lp-type="${escapeHtml(t.id)}"${dis?` title="${escapeHtml('Правила не разрешают: '+relationAllowedText(t))}" aria-disabled="true"`:''}>${linkTypeLabel(t)}</button>`}

function linkContainItems(p,t,a,b,query=''){
  if(!t)return '';
  if(p.pickType)return !query||searchFold(t.name).includes(searchFold(query))?linkItem(t):'';
  const specs=[['Содержит','out',a,b],['Состоит','in',b,a]];
  if(!worldReadOnly())specs.push(['Также содержит','member-out',a,b],['Также состоит в','member-in',b,a]);
  return specs.filter(([label])=>!query||searchFold(label+' '+t.name+' вложенность').includes(searchFold(query))).map(([label,dir,from,to])=>
    `<button type="button" class="lpItem" data-lp-type="${escapeHtml(t.id)}" data-lp-contain="${dir}"><span class="lpName">${label}</span><small>${escapeHtml(dir==='out'||dir==='member-out'?`${from?.name} содержит ${to?.name}`:`${to?.name} состоит в ${from?.name}`)}</small></button>`
  ).join('');
}
// Choosing a record for one end (B for «Связать с…», or A/B after a click on its name): search by name.
function linkEntityListHtml(){
  const p=linkPick,other=p.pickEnt?p.exclude:p.edit==='to'?p.from:p.to,q=searchFold((p.q||'').trim()),scope=new Set(scopeMembers().map(e=>e.id));
  let list=data.entities.filter(e=>e.id!==other&&(!q||entitySearchText(e).includes(q)));
  const rank=e=>(q&&String(e.name).toLowerCase().startsWith(q)?0:1)*2+(scope.has(e.id)?0:1);
  list=list.sort((x,y)=>rank(x)-rank(y)||String(x.name).localeCompare(String(y.name),'ru')).slice(0,40);
  return list.length?`<div class="lpGroup">${list.map(e=>{const t=getET(e.type),par=getEntity(containmentParent(e.id));return `<button type="button" class="lpItem" data-lp-ent="${escapeHtml(e.id)}"><i class="lpDot" style="background:${escapeHtml(safeCssValue(e.style?.color||t.color,'#8fb7ff'))}"></i><span class="lpName">${escapeHtml(e.name)}</span><small>${escapeHtml(e.type?t.name:'Без типа')}${par?' · в «'+escapeHtml(par.name)+'»':''}</small></button>`}).join('')}</div>`:'<div class="lpHint">Ничего не найдено.</div>';
}
function linkPickerHtml(){
  const p=linkPick;
  if(p.pickEnt)return `<div class="lpHead lpTitle">${escapeHtml(p.title||'Выберите сущность')}</div><div class="form lpSearchWrap"><input class="lpSearch" placeholder="Название сущности — начните печатать…" value="${escapeHtml(p.q||'')}" aria-label="Сущность" autocomplete="off"></div><div class="lpList" role="listbox">${linkEntityListHtml()}</div><div class="lpFoot"><span>Enter — выбрать · Esc — отмена</span></div>`;
  if(p.edit){const a=getEntity(p.from),b=getEntity(p.to),end=(e,k)=>`<button type="button" class="lpEnd${p.edit===k?' editing':''}" data-lp-end="${k}">${p.edit===k?'?':escapeHtml(e?.name||'?')}</button>`;
    return `<div class="lpHead">${end(a,'from')}<span class="lpArrow">→</span>${end(b,'to')}</div><div class="form lpSearchWrap"><input class="lpSearch" placeholder="${p.edit==='to'?'С кем связать? Начните печатать…':'Кого поставить в начало?'}" title="${p.edit==='to'?'С какой сущностью связать — начните печатать название':'Какую сущность поставить в начало — начните печатать название'}" value="${escapeHtml(p.q||'')}" aria-label="Сущность" autocomplete="off"></div><div class="lpList" role="listbox">${linkEntityListHtml()}</div><div class="lpFoot"><span>Enter — выбрать · Esc — отмена</span></div>`}
  const a=getEntity(p.from),b=getEntity(p.to),c=linkTypeCandidates(p.from,p.to),q=(p.q||'').trim().toLowerCase();
  const recent=linkRecentTypes().map(id=>getRT(id)).filter(t=>t&&!t.containment&&relationTypeAllows(t,a,b));
  let body='';
  const containment=linkContainItems(p,c.contains,a,b,q);
  if(q){
    const match=t=>`${t.name} ${t.reverseName||''} ${t.description||''}`.toLowerCase().includes(q);
    const hits=[...c.fit,...c.ok].filter(match),bad=c.no.filter(match);
    body=hits.length?`<div class="lpGroup">${hits.slice(0,60).map(t=>linkItem(t)).join('')}</div>`:'';
    if(containment)body+=`<div class="lpGroup">${containment}</div>`;
    if(bad.length)body+=`<div class="lpHint">Не подходят этим сущностям: ${bad.slice(0,6).map(t=>`<span title="${escapeHtml(relationAllowedText(t))}">${escapeHtml(t.name)}</span>`).join(', ')}${bad.length>6?` и ещё ${bad.length-6}`:''}</div>`;
    if(!hits.length&&!bad.length&&!containment)body+=`<div class="lpHint">Такого типа нет. <button type="button" class="linkBtn" data-lp-newtype>Создать тип «${escapeHtml(p.q.trim())}»</button></div>`;
  }else{
    const shown=new Set();const sec=(title,list,cls='')=>{list=list.filter(t=>!shown.has(t.id));list.forEach(t=>shown.add(t.id));return list.length?`<div class="lpSec ${cls}">${title}</div><div class="lpGroup">${list.map(t=>linkItem(t)).join('')}</div>`:''};
    body+=sec('Недавние',recent,'recent');
    body+=sec('Подходят этим сущностям',c.fit,'fit');
    if(containment)body+=`<div class="lpSec">Вложенность</div><div class="lpGroup">${containment}</div>`;
    const rest=c.ok.filter(t=>!shown.has(t.id));
    if(p.pickType&&!p.open.size&&!p.tierTouched&&rest.length)p.open.add(udTypeGroups('relations',rest)[0][0]);
    for(const [name,types] of udTypeGroups('relations',rest)){
      const open=p.open.has(name);
      body+=`<button type="button" class="lpTier${open?' open':''}" data-lp-tier="${escapeHtml(name)}" aria-expanded="${open}"><span>${open?'▾':'▸'} ${escapeHtml(name)}</span><small>${types.length}</small></button>`;
      if(open)body+=`<div class="lpGroup">${types.map(t=>linkItem(t)).join('')}</div>`;
    }
    if(c.no.length)body+=`<div class="lpHint">${c.no.length} ${plural(c.no.length,'тип не подходит','типа не подходят','типов не подходят')} этим сущностям по правилам — найдутся поиском.</div>`;
  }
  if(p.pickType)return `<div class="lpHead lpTitle">Тип связи${a&&b?`: ${escapeHtml(a.name)} → ${escapeHtml(b.name)}`:''}</div><div class="form lpSearchWrap"><input class="lpSearch" placeholder="Тип связи — начните печатать…" value="${escapeHtml(p.q||'')}" aria-label="Тип связи" autocomplete="off"></div><div class="lpList" role="listbox">${body}</div><div class="lpFoot"><span>Enter — выбрать · Esc — отмена</span></div>`;
  return `<div class="lpHead"><button type="button" class="lpEnd" data-lp-end="from" title="Другая сущность в начале связи">${escapeHtml(a?.name||'?')}</button><button type="button" class="lpSwap" data-lp-swap title="Поменять направление (Tab)">⇄</button><button type="button" class="lpEnd" data-lp-end="to" title="Другая сущность в конце связи">${escapeHtml(b?.name||'?')}</button></div>
    <div class="form lpSearchWrap"><input class="lpSearch" placeholder="Тип связи — начните печатать…" value="${escapeHtml(p.q||'')}" aria-label="Тип связи" autocomplete="off"></div>
    <div class="lpList" role="listbox">${body||'<div class="lpHint">Типов связей пока нет — создайте первый: «＋» в блоке «Типы связей».</div>'}</div>
    <div class="lpFoot"><button type="button" class="linkBtn" data-lp-more>Подробнее…</button><span>Enter — связать · Esc — отмена</span></div>`;
}
function linkPickerItems(){return [...document.querySelectorAll('#linkPicker .lpItem:not(.lpNo)')]}
function linkPickerTake(b){if(!b)return;if(b.dataset.lpEnt&&linkPick.pickEnt){const f=linkPick.pickEnt;closeLinkPicker();f(b.dataset.lpEnt);return}if(b.dataset.lpEnt){linkPick[linkPick.edit]=b.dataset.lpEnt;linkPick.papers=null;linkPick.legacyArrow=null;linkPick.edit=!linkPick.from?'from':!linkPick.to?'to':null;linkPick.q='';linkPick.active=0;linkPickerRender();return}linkPickerChoose(b.dataset.lpType,b.dataset.lpContain)}
function linkPickerRender(keepFocus=true){
  const el=$('#linkPicker');if(!el||!linkPick)return;el.innerHTML=linkPickerHtml();
  const items=linkPickerItems();linkPick.active=clamp(linkPick.active||0,0,Math.max(0,items.length-1));items[linkPick.active]?.classList.add('active');
  const inp=el.querySelector('.lpSearch');if(keepFocus&&inp){inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)}
  linkPickerPlace();
}
function linkPickerPlace(){const el=$('#linkPicker');if(!el||!linkPick)return;const r=el.getBoundingClientRect(),W=innerWidth,H=innerHeight;let x=linkPick.x+12,y=linkPick.y+12;if(x+r.width>W-8)x=Math.max(8,linkPick.x-r.width-12);if(y+r.height>H-8)y=Math.max(8,H-r.height-8);el.style.left=zpx(x)+'px';el.style.top=zpx(y)+'px'}

// Open the picker for A → B at the screen point (x, y). onDone(relation) after a relation is made.
// toId may be empty («Связать с…»): then the picker first asks which record.
function openLinkPicker(fromId,toId,x,y,{onDone=null,papers=null,legacyArrow=null}={}){
  if(worldReadOnly())return false;

  if((fromId&&!getEntity(fromId))||(toId&&!getEntity(toId)))return false;
  if(fromId&&fromId===toId){toast('Нельзя связать сущность саму с собой','err');return false}
  closeLinkPicker();
  linkPick={from:fromId||null,to:toId||null,edit:!fromId?'from':toId?null:'to',x:x??innerWidth/2-160,y:y??innerHeight/3,q:'',open:new Set(),active:0,onDone,papers,legacyArrow,at:performance.now()};
  const el=document.createElement('div');el.id='linkPicker';el.className='linkPicker';el.setAttribute('role','dialog');el.setAttribute('aria-label','Новая связь');document.body.appendChild(el);
  linkPickerRender();if(papers)linkPickerPreview(linkPick);return true;
}
function closeLinkPicker(){
  $('#linkPicker')?.remove();
  linkPick?.preview?.remove();
  linkPick=null;
}
function linkPickerPreview(picker){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','linkDragLayer onTarget');
  svg.setAttribute('aria-hidden','true');
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('class','linkDragLine');
  svg.append(line);document.body.append(svg);picker.preview=svg;
  function draw(){
    if(linkPick!==picker)return;
    const ends=picker.papers;
    if(!ends){svg.remove();return}
    if(ends.scope!==boardKey()||ends.workspace!==currentWorkspace()?.id||state.visualMode!=='detective'||worldReadOnly()){ 
      closeLinkPicker();return;
    }
    const point=id=>{
      const card=document.querySelector(`#detectiveView [data-ud-paper-id="${CSS.escape(id)}"]`);
      if(!card?.getClientRects().length)return null;
      const pin=card.querySelector('.boardPin'),pinVisible=!!pin?.getClientRects().length;
      // At the smallest zoom the pin is intentionally hidden. The addressed
      // paper is still valid; anchor the preview to the card itself.
      const r=(pinVisible?pin:card).getBoundingClientRect();
      return [zpx(r.left+r.width/2),zpx(r.top+(pinVisible?r.height/2:Math.min(r.height/2,12)))];
    };
    const a=point(ends.from),b=point(ends.to);
    // The board may replace its DOM while the picker is open. Do not turn a
    // temporarily absent preview into a cancelled relation. The final action
    // still verifies that both addressed papers exist on the same scene.
    if(!a||!b){line.setAttribute('visibility','hidden');requestAnimationFrame(draw);return}
    line.removeAttribute('visibility');
    line.setAttribute('x1',a[0]);line.setAttribute('y1',a[1]);
    line.setAttribute('x2',b[0]);line.setAttribute('y2',b[1]);
    requestAnimationFrame(draw);
  }
  draw();
}

// Make the relation (one Ctrl+Z). Same checks as the full window: not with itself, the rules of the type, no twin.
function quickCreateRelation(fromId,toId,typeId,{membership=false,papers=null,legacyArrow=null}={}){
  if(worldReadOnly())return null;

  const t=getRT(typeId),a=getEntity(fromId),b=getEntity(toId);if(!t||!a||!b)return null;
  if(fromId===toId){toast('Нельзя связать сущность саму с собой','err');return null}
  if(papers&&!udLinkPapersAvailable(papers,fromId,toId)){toast('Выбранные бумажки больше не видны','err');return null}
  if(t.containment&&membership){
    const existing=data.relations.find(r=>r.from===fromId&&r.to===toId&&getRT(r.type).containment);
    if(existing){toast('Сущность уже в составе');return existing}
    if(!boardCommit(()=>!!udAddMembership(fromId,toId),'Членство сохранено · Ctrl+Z — отменить'))return null;
    updateUI();
    return data.relations.find(r=>r.from===fromId&&r.to===toId&&getRT(r.type).containment)||null;
  }
  if(t.containment){
    // A board arrow addresses paper instances. Entity-only movement leaves the
    // explicit placement outside and can detach unrelated memberships.
    if(legacyArrow)return boardNestLegacyArrow(fromId,toId,legacyArrow);
    const saved=papers?udNestPaper(papers.to,papers.from,{keepPosition:true}):
      typeof moveIntoCommit==='function'&&moveIntoCommit([toId],fromId);
    if(!saved){toast('Не удалось переместить бумажку. Проверьте вложенность, закрепление и доступность контейнера.','err');return null}
    return saved?data.relations.find(r=>getRT(r.type).containment&&r.from===fromId&&r.to===toId)||true:null;
  }
  if(!relationTypeAllows(t,a,b)){toast(`«${t.name}» соединяет только так: ${relationAllowedText(t)}`,'err');return null}
  const dup=data.relations.find(x=>x.from===fromId&&x.to===toId&&x.type===typeId);
  if(dup){
    if(papers&&confirm('Такая связь уже есть. Закрепить её нить на этих бумажках?')){
      udCommitPlacementChange(board=>udStoreThreadPair(board,dup,papers.from,papers.to),'Концы нити закреплены');
    }else if(!papers)toast('Такая связь уже есть','err');
    return dup;
  }
  const obj={id:uid('relation'),from:fromId,to:toId,type:typeId,properties:{},style:{}};
  if(papers){
    if(!udCommitPlacementChange(board=>{
      if(!udStoreThreadPair(board,obj,papers.from,papers.to))return false;
      data.relations.push(obj);
    },'Связь и концы нити сохранены · Ctrl+Z — отменить'))return null;
    linkRemember(typeId);updateUI();return obj;
  }
  const before=clone(data);data.relations.push(obj);state.viewVersion++;
  if(!persist()){data=before;normalize();updateUI();toast('Не удалось сохранить связь — ничего не изменилось','err');return null}
  linkRemember(typeId);updateUI();toast(`${a.name} → ${b.name}: «${relationNameFor(obj,a.id)}» · Ctrl+Z — отменить`,'ok');return obj;
}
function linkPickerChoose(typeId,direction){
  if(!linkPick)return;
  if(linkPick.pickType){const action=linkPick.pickType;closeLinkPicker();action(typeId);return}
  const {from,to,onDone,papers,legacyArrow}=linkPick;
  closeLinkPicker();
  const reverse=direction==='in'||direction==='member-in';
  const ends=reverse&&papers?{...papers,from:papers.to,to:papers.from}:papers;
  const r=quickCreateRelation(reverse?to:from,reverse?from:to,typeId,{membership:direction?.startsWith('member-'),papers:ends,legacyArrow});
  if(r&&onDone)onDone(r);
}
function linkPickerSwap(){
  [linkPick.from,linkPick.to]=[linkPick.to,linkPick.from];
  if(linkPick.papers)[linkPick.papers.from,linkPick.papers.to]=[linkPick.papers.to,linkPick.papers.from];
}

function bindLinkPicker(){
  // A pointerup that opened a picker may be followed by a click even after a
  // slow render. Ignore that exact completion click, not the user's next click.
  document.addEventListener('pointerdown',()=>{if(linkPick)delete linkPick.releaseClick},true);
  document.addEventListener('input',e=>{if(!e.target.closest?.('#linkPicker .lpSearch'))return;linkPick.q=e.target.value;linkPick.active=0;linkPickerRender()});
  document.addEventListener('keydown',e=>{if(!linkPick)return;const items=linkPickerItems();
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeLinkPicker();return}
    if(e.key==='Tab'&&!linkPick.edit){e.preventDefault();e.stopImmediatePropagation();linkPickerSwap();linkPickerRender();return}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();linkPick.active=clamp((linkPick.active||0)+(e.key==='ArrowDown'?1:-1),0,Math.max(0,items.length-1));items.forEach((b,i)=>b.classList.toggle('active',i===linkPick.active));items[linkPick.active]?.scrollIntoView({block:'nearest'});return}
    if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();linkPickerTake(items[linkPick.active||0]);return}
    if(['z','я','y','н'].includes(e.key.toLowerCase())&&(e.ctrlKey||e.metaKey))return;e.stopPropagation()},true);
  document.addEventListener('click',e=>{const t=e.target instanceof Element?e.target:null;if(!linkPick)return;const el=t?.closest('#linkPicker');
    if(linkPick.releaseClick){delete linkPick.releaseClick;return}
    // the click that ends a drag («потянуть связь») comes right after the picker opened — it is not «a click outside»
    if(!el){if(performance.now()-linkPick.at>250)closeLinkPicker();return}
    const it=t.closest('[data-lp-type],[data-lp-ent]');if(it){if(it.classList.contains('lpNo')){toast(it.title,'err');return}linkPickerTake(it);return}
    const end=t.closest('[data-lp-end]');if(end){if(linkPick.edit===end.dataset.lpEnd&&linkPick.from&&linkPick.to)linkPick.edit=null;else{linkPick.edit=end.dataset.lpEnd;linkPick.q=''}linkPick.active=0;linkPickerRender();return}
    const tier=t.closest('[data-lp-tier]');if(tier){const n=tier.dataset.lpTier;linkPick.tierTouched=true;linkPick.open.has(n)?linkPick.open.delete(n):linkPick.open.add(n);linkPickerRender();return}
    if(t.closest('[data-lp-swap]')){linkPickerSwap();linkPickerRender();return}
    if(t.closest('[data-lp-more]')){const {from,to,papers,legacyArrow}=linkPick,first=linkPickerItems()[linkPick.active||0]?.dataset.lpType;closeLinkPicker();openRelationModal(null,from,{to,type:first,papers,legacyArrow});return}
    if(t.closest('[data-lp-newtype]')){const name=(linkPick.q||'').trim();closeLinkPicker();rulesFromLeft(()=>openTypeEditor('relation'));setTimeout(()=>{const n=$('#tName');if(n&&!n.value)n.value=name},0);return}
  },true);
  window.addEventListener('resize',()=>{if(linkPick)linkPickerPlace()});
}
bindLinkPicker();

// 0.23.10: «потянуть связь» — from a record onto another: a line follows the mouse, the record under it is named;
// released on a record — the quick type picker; released on empty space — «Связать с…» (search for the second record).
// Alt + drag works in every mode; in Graph also the «⟶» knob of the selected record, on the board — the pin.
const LINK_ID_ATTRS=[['data-board-id','boardId'],['data-galaxy-id','galaxyId'],['data-tree-id','treeId'],['data-outline-id','outlineId'],['data-id','id']];
function linkRecordAt(x,y,withPaper=false){
  for(const el of document.elementsFromPoint(x,y)){
    if(el.closest?.('#linkPicker,.linkDragLayer'))continue;
    for(const [attr,key] of LINK_ID_ATTRS){const h=el.closest?.(`.main [${attr}]`);if(h&&getEntity(h.dataset[key]))return withPaper?{entity:h.dataset[key],paper:h.dataset.udPaperId,board:attr==='data-board-id'}:h.dataset[key]}
  }
  return null;
}
let linkDrag=null;
function startLinkDrag(fromId,x,y,knob=false,paper=null,board=false){
  if(worldReadOnly())return false;

  if(!getEntity(fromId))return false;closeLinkPicker();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','linkDragLayer');svg.innerHTML='<line class="linkDragLine"/><circle class="linkDragDot" r="5"/>';document.body.appendChild(svg);
  const tip=document.createElement('div');tip.className='linkDragTip';document.body.appendChild(tip);
  const scene=board&&state.visualMode==='detective'?boardCameraKey():null;
  linkDrag={from:fromId,x0:x,y0:y,svg,tip,to:null,knob,paper,scope:boardKey(),workspace:currentWorkspace()?.id,
    scene,legacyArrow:scene&&!udBoardUsesPlacements()?scene:null};document.body.classList.add('linkDragging');linkDragMove(x,y);return true;
}
function linkDragMove(x,y){const d=linkDrag;if(!d)return;const l=d.svg.querySelector('line'),c=d.svg.querySelector('circle');l.setAttribute('x1',d.x0);l.setAttribute('y1',d.y0);l.setAttribute('x2',x);l.setAttribute('y2',y);c.setAttribute('cx',x);c.setAttribute('cy',y);
  const to=linkRecordAt(x,y),ok=to&&to!==d.from;d.to=ok?to:null;d.svg.classList.toggle('onTarget',!!ok);
  d.tip.textContent=ok?`${getEntity(d.from).name} → ${getEntity(to).name}`:`${getEntity(d.from).name} → …  отпустите на сущности`;d.tip.style.left=zpx(x+14)+'px';d.tip.style.top=zpx(y+14)+'px'}
function linkDragEnd(x,y,cancel){const d=linkDrag;if(!d)return;linkDrag=null;d.svg.remove();d.tip.remove();document.body.classList.remove('linkDragging');if(cancel)return;
  if(Math.hypot(x-d.x0,y-d.y0)<6){if(d.knob&&openLinkPicker(d.from,null,x,y)&&linkPick)linkPick.releaseClick=true;return} // just a click: Alt+click — nothing; the knob — choose whom to link (0.30.9)
  if(d.scene&&(state.visualMode!=='detective'||d.scene!==boardCameraKey()||d.scope!==boardKey()||d.workspace!==currentWorkspace()?.id))return;
  const target=linkRecordAt(x,y,true);
  const to=target?.entity&&target.entity!==d.from?target.entity:null;
  if(target?.entity===d.from){toast('Нельзя связать сущность саму с собой','err');return}
  const papers=d.paper&&target?.paper?{from:d.paper,to:target.paper,scope:d.scope,workspace:d.workspace,scene:d.scene}:null;
  if(openLinkPicker(d.from,to,x,y,{papers,legacyArrow:to&&target.board?d.legacyArrow:null})&&linkPick)linkPick.releaseClick=true;
}
function bindLinkDrag(){
  // Alt + drag from any record in any mode (capture: before the mode's own dragging)
  document.addEventListener('pointerdown',e=>{if(worldReadOnly()||e.button!==0||!e.altKey||!e.target.closest?.('.main'))return;const hit=linkRecordAt(e.clientX,e.clientY,true);if(!hit)return;e.preventDefault();e.stopImmediatePropagation();startLinkDrag(hit.entity,e.clientX,e.clientY,false,hit.paper,hit.board)},true);
  document.addEventListener('mousedown',e=>{if(linkDrag||(e.altKey&&e.button===0&&e.target.id==='graphCanvas'&&linkRecordAt(e.clientX,e.clientY))){e.preventDefault();e.stopImmediatePropagation()}},true);
  // on the board the pin is where a thread starts
  // threads end exactly at pins — their click area lies over the pin, so the pin is looked for under them (lesson 0.23.6/0.23.8)
  document.addEventListener('pointerdown',e=>{if(worldReadOnly()||e.button!==0||state.visualMode!=='detective'||e.altKey)return;const pin=e.target.closest?.('#detectiveView .boardPin')||(e.target.closest?.('#detectiveView')?document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.matches?.('#detectiveView .boardPin')):null);if(!pin)return;const card=pin.closest('[data-board-id]'),id=card?.dataset.boardId;if(!id)return;e.preventDefault();e.stopImmediatePropagation();const r=pin.getBoundingClientRect();startLinkDrag(id,r.x+r.width/2,r.y+r.height/2,false,card.dataset.udPaperId,true)},true);
  window.addEventListener('pointermove',e=>{if(linkDrag){e.preventDefault();linkDragMove(e.clientX,e.clientY)}},true);
  window.addEventListener('pointercancel',()=>{if(linkDrag)linkDragEnd(0,0,true)},true);
  window.addEventListener('pointerup',e=>{if(linkDrag){e.preventDefault();e.stopImmediatePropagation();linkDragEnd(e.clientX,e.clientY,false)}},true);
  window.addEventListener('keydown',e=>{if(linkDrag&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();linkDragEnd(0,0,true)}},true);
}
bindLinkDrag();

// The «⟶» knob next to the selected record: drag it onto another record. 0.28.3: in every mode, not only Graph (user, 21.10.2026).
// Graph places it every frame (graph.js); other modes — from the record's own element, followed while the view moves.
// [selector, text?] — text: the knob stands right after the name itself (rows of Outline and Table are as wide as the window)
const LINK_KNOB_SEL={detective:id=>[`#detectiveView [data-board-id="${id}"]`],galaxy:id=>[`#galaxyView [data-galaxy-id="${id}"] .galaxyCore`],tree:id=>[`#treeView [data-tree-id="${id}"]`],outline:id=>[`#outlineView [data-outline-id="${id}"] .outlineName`,true],table:id=>[`#tableView tr[data-id="${id}"] td:nth-child(2)`,true],kanban:id=>[`#tableView .kbCard[data-id="${id}"]`]};
function linkKnobRect(el,text){if(!text)return el.getBoundingClientRect();try{const rg=document.createRange();rg.selectNodeContents(el);const r=rg.getBoundingClientRect();if(r.width)return r}catch{}return el.getBoundingClientRect()}
let linkKnobFrame=0,linkKnobObserver=null,linkKnobMain=null,linkKnobCard=null;
function linkKnobSoon(){
  if(linkKnobFrame||!state.selectedId&&!$('#linkKnob'))return;
  linkKnobFrame=requestAnimationFrame(()=>{linkKnobFrame=0;placeLinkKnob()});
}
function linkKnobObserve(main=null,card=null){
  if(main===linkKnobMain&&card===linkKnobCard)return;
  linkKnobObserver?.disconnect();
  linkKnobMain=main;linkKnobCard=card;
  if(!main||typeof ResizeObserver!=='function')return;
  linkKnobObserver??=new ResizeObserver(linkKnobSoon);
  linkKnobObserver.observe(main);
  if(card)linkKnobObserver.observe(card);
}
window.addEventListener('resize',linkKnobSoon);
function linkKnobEl(){let k=$('#linkKnob');if(!k){k=document.createElement('button');k.id='linkKnob';k.type='button';k.className='linkKnob';k.textContent='⟶';k.title='Новая связь: потяните на другую сущность или нажмите и выберите (Alt + потянуть — от любой сущности)';document.querySelector('.main')?.appendChild(k);
    k.addEventListener('pointerdown',ev=>{if(ev.button!==0||!state.selectedId)return;ev.preventDefault();ev.stopPropagation();const r=k.getBoundingClientRect();startLinkDrag(state.selectedId,r.x+r.width/2,r.y+r.height/2,true,udSelectedPaperId(),state.visualMode==='detective')})}return k}
function placeLinkKnob(){
  const mode=state.visualMode,e=state.selectedId&&!state.selectedRelationId&&!document.querySelector('.app.cleanMode')?getEntity(state.selectedId):null;
  let k=$('#linkKnob');const hide=()=>{if(k)k.hidden=true;return false};
  const mainElement=document.querySelector('.main');
  if(!e||!mainElement||worldReadOnly()){linkKnobObserve();return hide()}
  const sel=LINK_KNOB_SEL[mode]?.(CSS.escape(e.id)),paper=mode==='detective'&&udSelectedPaperId();
  const el=(paper&&document.querySelector(`#detectiveView [data-ud-paper-id="${CSS.escape(paper)}"]`))||(sel?document.querySelector(sel[0]):null);
  linkKnobObserve(mainElement,el);
  const main=mainElement.getBoundingClientRect(),r=el?linkKnobRect(el,sel[1]):null;
  if(!r||!r.width||r.right<main.left||r.left>main.right-30||r.bottom<main.top||r.top>main.bottom)return hide();
  const x=r.right+32<=main.right?r.right+6:r.left-32>=main.left?r.left-32:main.right-30; /* right of the record; no room — left of it */
  k=linkKnobEl();k.hidden=false;
  const left=Math.round(zpx(x-main.left))+'px',top=Math.round(zpx(r.top+Math.min(r.height/2,24)-13-main.top))+'px';
  if(k.style.left!==left)k.style.left=left;
  if(k.style.top!==top)k.style.top=top;
  return true;
}

// R, the top «Связь» button: from the selected record (two selected — between them at once; none — choose both by search).
function linkFromSelection(x,y){const ids=[...state.selectedIds].filter(id=>getEntity(id));const sel=state.selectedId&&getEntity(state.selectedId)?state.selectedId:null;
  if(ids.length===2)return openLinkPicker(ids[0],ids[1],x,y);return openLinkPicker(sel,null,x,y)}
document.addEventListener('click',e=>{const b=e.target instanceof Element?e.target.closest('[data-link-from]'):null;if(!b)return;e.preventDefault();e.stopPropagation();const r=b.getBoundingClientRect();openLinkPicker(b.dataset.linkFrom,null,r.left,r.bottom)});

// For the full window: choose only a record or only a type (nothing is created here).
function openRecordChooser(x,y,{exclude=null,title='',onPick}={}){closeLinkPicker();linkPick={pickEnt:onPick,exclude,title,edit:'pick',q:'',open:new Set(),active:0,x,y,at:performance.now()};const el=document.createElement('div');el.id='linkPicker';el.className='linkPicker';el.setAttribute('role','dialog');document.body.appendChild(el);linkPickerRender();return true}
function openTypeChooser(fromId,toId,x,y,onPick){if(!getEntity(fromId)||!getEntity(toId)||fromId===toId){closeLinkPicker();linkPick={pickType:onPick,from:fromId,to:toId,q:'',open:new Set(),active:0,x,y,at:performance.now(),noEnds:true}}else{closeLinkPicker();linkPick={pickType:onPick,from:fromId,to:toId,q:'',open:new Set(),active:0,x,y,at:performance.now()}}const el=document.createElement('div');el.id='linkPicker';el.className='linkPicker';el.setAttribute('role','dialog');document.body.appendChild(el);linkPickerRender();return true}

