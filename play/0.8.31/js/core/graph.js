// Universe Graph — Запросы к графу: поиск сущностей и типов, соседи, пути, иерархия «Содержит», видимые узлы.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
// 0.15.21: id → entity index. getEntity is called thousands of times per frame;
// a linear scan made big worlds slow. The index is rebuilt whenever the entity
// array is replaced or changes length, and every hit is verified, so a stale
// index can only cause a slower fallback scan, never a wrong answer.
let entityIndex={arr:null,len:-1,map:new Map()};
function getEntity(id){
  if(id==null)return undefined;
  // 0.19: a mouse move before start-up finished looked up records in the not yet prepared world
  // (fixed in meh/ui.js). Should anything else do so, the lookup returns nothing and logs one line.
  let arr=data.entities;
  if(!Array.isArray(arr)){if(!getEntity._warned){getEntity._warned=true;console.error('[Universe Graph] data.entities is not a list',Object.prototype.toString.call(arr),Object.keys(data||{}).slice(0,14).join(','),new Error().stack)}arr=[]}
  if(entityIndex.arr!==arr||entityIndex.len!==arr.length){const map=new Map();for(const e of arr)if(e&&!map.has(e.id))map.set(e.id,e);entityIndex={arr,len:arr.length,map}}
  const hit=entityIndex.map.get(id);
  if(hit&&hit.id===id)return hit;
  const found=arr.find(e=>e.id===id);
  if(found)entityIndex.map.set(id,found);
  return found;
}
// An entity without a (known) type is shown as «Без типа» — e.g. after the rule set was reset (0.17).
const UNTYPED={id:'',name:'Без типа',color:'#9aa8c6',size:30,shape:'circle',icon:'•'};
function getET(id){return (id&&data.entityTypes.find(t=>t.id===id))||UNTYPED}
// 0.22: a relation type may have a reverse name (Родитель ↔ Ребёнок): the record at the arrow's end sees the relation by it.
function relationNameFor(r,viewerId){const rt=getRT(r?.type);return r&&viewerId&&r.to===viewerId&&r.from!==viewerId&&rt.reverseName?rt.reverseName:rt.name}
// 0.22: a relation type may allow only some record types at its start and end (empty list = any type).
function relationTypeAllows(rt,fromEnt,toEnt){if(!rt||rt.containment)return true;const ok=(list,e)=>!Array.isArray(list)||!list.length||list.includes(e?.type||'');return ok(rt.fromTypes,fromEnt)&&ok(rt.toTypes,toEnt)}
function relationAllowedText(rt){const names=list=>Array.isArray(list)&&list.length?list.map(id=>getET(id).name).join(', '):'любые сущности';return `откуда — ${names(rt.fromTypes)}; куда — ${names(rt.toTypes)}`}
const PLAYER_MASKED_THREAD={id:'__masked_thread',name:'Связь',color:'#888888',width:2,lineStyle:'solid',containment:false};
const PLAYER_MASKED_MEMBERSHIP={...PLAYER_MASKED_THREAD,id:'__masked_membership',containment:true};
// Older versions interpret the base setting as Master-only, without the narrower exception.
function entityNamedVisibility(e){return e?.vis==='gm'&&e.namedVisibility===true}
function playerRelationMasked(r){return r?.type===PLAYER_MASKED_THREAD.id||r?.type===PLAYER_MASKED_MEMBERSHIP.id}
function getRT(id){
  if(id===PLAYER_MASKED_THREAD.id)return PLAYER_MASKED_THREAD;
  if(id===PLAYER_MASKED_MEMBERSHIP.id)return PLAYER_MASKED_MEMBERSHIP;
  return data.relationTypes.find(t=>t.id===id)||{id:'unknown',name:'Связь',color:'#91a4c7',width:2,arrow:false,lineStyle:'solid',animated:false,containment:false};
}
function ensureGenericRelationType(){let t=data.relationTypes.find(x=>x&&x._systemGeneric);if(!t){t={id:uid('rtype'),name:'Связь',color:'#91a4c7',width:2,lineStyle:'solid',arrow:false,animated:false,containment:false,_systemGeneric:true};data.relationTypes.push(t)}return t}
function degree(id){return data.relations.reduce((n,r)=>n+(r&&(r.from===id||r.to===id)&&!getRT(r.type).containment?1:0),0)}

function related(id){const s=new Set();for(const r of data.relations){if(getRT(r.type).containment)continue;if(r.from===id)s.add(r.to);else if(r.to===id)s.add(r.from)}return [...s]}
// Memoised per relations-array/length/viewVersion: drawNode asked for the same
// neighbourhood once per node per frame, i.e. thousands of BFS runs a second.
let neighborCache={key:'',map:null};
function neighbors(id,depth=1){if(!id)return new Map();const key=`${id}|${depth}|${state.viewVersion}|${data.relations.length}`;if(neighborCache.key===key&&neighborCache.arr===data.relations)return neighborCache.map;const result=neighborsUncached(id,depth);neighborCache={key,arr:data.relations,map:result};return result}
function neighborsUncached(id,depth){const d=new Map([[id,0]]),q=[id];while(q.length){const cur=q.shift(),dist=d.get(cur);if(dist>=depth)continue;for(const n of related(cur))if(!d.has(n)){d.set(n,dist+1);q.push(n)}}return d}
// Neighbours including the "Содержит" hierarchy (parent and children).
function relatedWithHierarchy(id){const s=new Set(related(id));for(const r of data.relations)if(r.to===id&&getRT(r.type).containment)s.add(r.from);for(const c of containmentChildren(id))s.add(c);return [...s]}
// Prefers ordinary relations; falls back to paths that also walk the hierarchy
// (0.15.21 — before, a character and its own city were "not connected").
function shortestPath(a,b){const direct=shortestPathBy(a,b,related);if(direct.length)return direct;const viaHierarchy=shortestPathBy(a,b,relatedWithHierarchy);state.lastTraceUsedHierarchy=viaHierarchy.length>0;return viaHierarchy}
function shortestPathBy(a,b,next){if(!a||!b)return [];if(a===b)return [a];const prev=new Map([[a,null]]),q=[a];while(q.length){const cur=q.shift();for(const n of next(cur)){if(prev.has(n))continue;prev.set(n,cur);if(n===b){q.length=0;break}q.push(n)}}if(!prev.has(b))return [];const path=[];let x=b;while(x!==null){path.push(x);x=prev.get(x)}return path.reverse()}
let containmentIndex={version:-1,children:new Map(),parent:new Map()};
function invalidateContainmentIndex(){containmentIndex.version=-1;containmentIndex.children.clear();containmentIndex.parent.clear()}
function rebuildContainmentIndex(){const children=new Map(),parent=new Map();const sourceArr=data.relations,sourceLen=data.relations.length;for(const r of data.relations){if(!getRT(r.type).containment)continue;if(!getEntity(r.from)||!getEntity(r.to))continue;if(!children.has(r.from))children.set(r.from,[]);children.get(r.from).push(r.to);if(!r.udMembership&&!parent.has(r.to))parent.set(r.to,r.from)}containmentIndex={version:state.viewVersion,arr:sourceArr,len:sourceLen,children,parent}}
// The index is valid for one viewVersion AND one relations array of one length;
// a push without a viewVersion bump used to leave it stale.
function containmentIndexStale(){return containmentIndex.version!==state.viewVersion||containmentIndex.arr!==data.relations||containmentIndex.len!==data.relations.length}
function containmentChildren(scopeId){if(!scopeId)return [];if(containmentIndexStale())rebuildContainmentIndex();return containmentIndex.children.get(scopeId)||[]}
function containmentParent(id){if(containmentIndexStale())rebuildContainmentIndex();return containmentIndex.parent.get(id)||null}
function isSpace(e){return !!e && (!!e.style?.space || containmentChildren(e.id).length>0)}
function udContainmentReaches(parents,start,target){
  const stack=[start],seen=new Set();
  while(stack.length){
    const id=stack.pop();
    if(id===target)return true;
    if(seen.has(id))continue;
    seen.add(id);
    for(const parent of parents.get(id)||[])stack.push(parent);
  }
  return false;
}
function wouldCreateContainmentCycle(parentId,childId,excludeRelationId=null){
  if(!parentId||!childId)return true;
  const parents=new Map();
  for(const r of data.relations){
    if(r.id===excludeRelationId||!getRT(r.type).containment)continue;
    if(!parents.has(r.to))parents.set(r.to,[]);
    parents.get(r.to).push(r.from);
  }
  return udContainmentReaches(parents,parentId,childId);
}
// The nesting relation of the active rule set: found by its flag; its name is the person's choice (0.17).
function ensureContainsType(){let rt=data.relationTypes.find(t=>t?.containment===true);if(!rt){rt=containmentTypeTemplate();if(data.relationTypes.some(t=>t.id===rt.id))rt.id=uid('rtype');data.relationTypes.unshift(rt)}return rt}
// ---- Statuses (0.17) ----
// Groups of the active rule set that apply to a type (an empty appliesTo = every type).
function statusGroupsForType(typeId){return (data.statusGroups||[]).filter(g=>!g.appliesTo?.length||g.appliesTo.includes(typeId))}
// The entity's current statuses as [{group, option}], only for groups that apply to its type.
function entityStatuses(e){const out=[];if(!e?.status)return out;for(const g of statusGroupsForType(e.type)){const v=e.status[g.id];if(v==null)continue;for(const id of (Array.isArray(v)?v:[v])){const o=g.options.find(x=>x.id===id);if(o)out.push({group:g,option:o})}}return out}
function statusKey(groupId,optionId){return groupId+':'+optionId}
// Sets (scale) or toggles (flags) one status on an entity. Returns true when something changed.
function applyEntityStatus(e,groupId,optionId){const g=(data.statusGroups||[]).find(x=>x.id===groupId);if(!e||!g)return false;e.status=isRecord(e.status)?e.status:{};const cur=e.status[groupId];if(g.kind==='flags'){const list=new Set(Array.isArray(cur)?cur:[]);if(list.has(optionId))list.delete(optionId);else list.add(optionId);if(list.size)e.status[groupId]=[...list];else delete e.status[groupId]}else{if(cur===optionId)delete e.status[groupId];else e.status[groupId]=optionId}if(!Object.keys(e.status).length)delete e.status;return true}
// Visual effect of statuses on a node: faded, grey, glow colour and up to 3 badges.
function statusVisual(e){const list=entityStatuses(e);if(!list.length)return null;const v={fade:false,gray:false,glow:null,badges:[]};for(const {option:o} of list){if(o.effect==='fade')v.fade=true;else if(o.effect==='gray')v.gray=true;else if(o.effect==='glow'&&!v.glow)v.glow=o.color;if(v.badges.length<3)v.badges.push(o)}return v}
function statusChipsHtml(e,{clickable=false}={}){return entityStatuses(e).map(({group:g,option:o})=>`<span class="statusChip" style="--status:${escapeHtml(safeCssValue(o.color,'#9aa8c6'))}" title="${escapeHtml(g.name)}: ${escapeHtml(o.name)}"${clickable?` data-status-group="${escapeHtml(g.id)}"`:''}>${o.icon?`<i>${escapeHtml(o.icon)}</i>`:''}${escapeHtml(o.name)}</span>`).join('')}
function scopeMembers(scope=state.scopeId){
  if(!scope)return [];
  const root=currentRootId();
  const rootId=scope===root||!getEntity(scope)?root:null;
  const direct=containmentChildren(scope).map(getEntity).filter(Boolean);
  const seen=new Set(direct.map(e=>e.id));
  // Local means the current container's immediate contents. In the root workspace,
  // genuinely unattached entities are also local so they cannot disappear behind Links.
  if(rootId){
    for(const e of data.entities){
      if(!e||e.id===rootId||seen.has(e.id))continue;
      if(isTopLevel(e.id)){direct.push(e);seen.add(e.id)}
    }
  }
  return direct;
}
function scopeIdIsRoot(){return state.scopeId===currentRootId()||!getEntity(state.scopeId)}
function isTopLevel(id){return !containmentParent(id)}
// 0.20.5: importance of relations — 5 levels. A relation has its own level or takes its type's (default 3).
// Hidden levels disappear from every view; «Содержит» (structure) is never hidden by importance.
const REL_TIER_DEFAULT_NAMES=['Ключевая','Важная','Обычная','Второстепенная','Фон'];
function relationTierNames(){const ws=currentWorkspace();const n=Array.isArray(ws?.relationTiers)?ws.relationTiers:[];return REL_TIER_DEFAULT_NAMES.map((d,i)=>String(n[i]||'').trim().slice(0,40)||d)}
function relationTier(r){const own=Number(r?.tier);if(own>=1&&own<=5)return Math.round(own);const t=Number(getRT(r?.type).tier);return t>=1&&t<=5?Math.round(t):3}
// 0.28.3: the name of a relation on the line — for each relation on its own (user, 21.10.2026): «always» — always, «hover» — when
// the mouse is on it or it is selected, «never»; nothing chosen — as its type says («Показывать подпись» on — when zoomed in or hovered).
const REL_LABEL_MODES=[['','как у типа'],['always','всегда'],['hover','при наведении'],['never','никогда']];
function relationLabelMode(r){const m=r?.labelMode;if(m==='always'||m==='hover'||m==='never')return m;if(r?.style?.labelVisible===false)return 'never';return getRT(r?.type).labelVisible===false?'never':'auto'}
function relationLabelShown(r,{zoomed=false,hover=false}={}){const m=relationLabelMode(r);return m==='always'||(m!=='never'&&(hover||(m==='auto'&&zoomed)))}
function setRelationLabelMode(ids,mode){
  if(mode&&!REL_LABEL_MODES.some(x=>x[0]===mode))return 0;const list=[...new Set(ids||[])].map(id=>data.relations.find(r=>r.id===id)).filter(r=>r&&(r.labelMode||'')!==(mode||''));if(!list.length)return 0;
  const snap=snapshotWorkspaceMutation();for(const r of list){if(mode)r.labelMode=mode;else delete r.labelMode}state.viewVersion=(state.viewVersion||0)+1;
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return 0}
  renderDetective();updateUI();return list.length;
}
function relationLabelRowHtml(id){const r=data.relations.find(x=>x.id===id);const cur=r?.labelMode||'';return `<div class="labelModeRow" role="group" aria-label="Название связи"><span>Название:</span>${REL_LABEL_MODES.map(([v,n])=>`<button type="button" class="labelModeBtn${v===cur?' on':''}" data-rel-label="${escapeHtml(id)}|${v}" aria-pressed="${v===cur}">${escapeHtml(n)}</button>`).join('')}</div>`}
document.addEventListener('click',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-rel-label]'):null;if(!b)return;ev.preventDefault();ev.stopPropagation();const [id,m]=b.dataset.relLabel.split('|');if(setRelationLabelMode([id],m))toast('Название связи: '+(REL_LABEL_MODES.find(x=>x[0]===m)?.[1]||''),'ok');if(b.closest('#contextMenu'))hideContextMenu()},true);
function relationShown(r){if(!r)return false;if(state.filtersRelations.size&&!state.filtersRelations.has(r.type))return false;return !(state.hiddenTiers&&state.hiddenTiers.has(relationTier(r)))} /* 0.28.2: nesting lines obey importance too; the record stays inside */
function relationPassesFilter(r){if(!r||getRT(r.type).containment)return false;return relationShown(r)}
function externalNeighborIds(){const local=new Set(scopeMembers().map(e=>e.id));if(state.scopeId&&getEntity(state.scopeId))local.add(state.scopeId);const ext=new Set();for(const r of data.relations){if(!relationPassesFilter(r))continue;if(local.has(r.from)&&!local.has(r.to))ext.add(r.to);if(local.has(r.to)&&!local.has(r.from))ext.add(r.from)}return [...ext].map(getEntity).filter(Boolean)}
// Text a search looks through: name, other names, type, statuses, fields, description, tags.
// 0.29: search ignores ё/е («Королев» finds «Королёв») — both sides go through searchFold.
function searchFold(s){return String(s??'').toLowerCase().replace(/ё/g,'е')}
function entitySearchText(e){return searchFold(e.name+' '+(e.aliases||[]).join(' ')+' '+getET(e.type).name+' '+entityStatuses(e).map(x=>x.option.name).join(' ')+' '+JSON.stringify(e.properties||{})+' '+String([e.note,e.description].filter(Boolean).join(' ')).replace(/\{\{image:[^}]+\}\}/g,'')+' '+(e.tags||[]).join(' ')+' '+(typeof collectStrings==='function'?collectStrings(e.sectionData).join(' '):''))}
// 0.27: a record may live off the board (bestiary, archive, someone no longer in the story) — hidden from Graph, Galaxy, Tree,
// Outline, Detective and 3D, but kept in data, search, Table/Kanban, Meh, articles and links. «Показать скрытые» brings them back faintly.
// A folder may keep its contents off the board («Содержимое — вне доски»: bestiary, archive): everything inside it is off the board
// unless brought back one by one (e.onBoard). Inside such a folder its own contents are shown (faintly).
function entityOffBoard(e){if(!e)return false;if(e.offBoard)return true;if(e.onBoard)return false;const p=containmentParent(e.id);return !!(p&&getEntity(p)?.contentOffBoard)}
function offBoardHidden(e){return entityOffBoard(e)&&!state.showHidden&&!(state.scopeId&&containmentParent(e.id)===state.scopeId&&getEntity(state.scopeId)?.contentOffBoard)}
// bring back on the board — inside a folder «вне доски» it stays as an exception
function entityBackOnBoard(e){if(!e)return;delete e.offBoard;const p=containmentParent(e.id);if(p&&getEntity(p)?.contentOffBoard)e.onBoard=true;else delete e.onBoard}
function offBoardCount(){let n=0;for(const e of data.entities)if(entityOffBoard(e))n++;return n}
function visibleByFilters(e,opt){if(e&&!(opt&&opt.keepHidden)&&offBoardHidden(e))return false;if(state.filtersEntities.size&&!state.filtersEntities.has(e.type||''))return false;if(state.filtersStatuses?.size&&!entityStatuses(e).some(x=>state.filtersStatuses.has(statusKey(x.group.id,x.option.id))))return false;if(state.search){if(!entitySearchText(e).includes(state.search.toLowerCase()))return false}return true}
// 0.27: «раскрыть на месте» in Graph — the contents of a record lie in a ring around it on the same board, one level per click
// (an opened child can be opened further). Positions are for the screen only: the records keep their places in their own space.
let graphInnerPos=new Map(),graphInnerMore=new Map();
function graphExpandedIds(scope=state.scopeId){const m=state.graphExpanded;return new Set(m&&Array.isArray(m[scope])?m[scope]:[])}
function graphExpandedSaved(){const ids=new Set(data.entities.map(e=>e.id)),out={};for(const [k,a] of Object.entries(state.graphExpanded||{})){if(!ids.has(k)||!Array.isArray(a))continue;const l=a.filter(x=>ids.has(x));if(l.length)out[k]=l}return out}
function graphIsExpanded(id){return graphExpandedIds().has(id)}
const GRAPH_RING_MAX=30;
function graphAddExpanded(nodes){
  graphInnerPos=new Map();graphInnerMore=new Map();if(state.visualMode!=='graph')return nodes;const ex=graphExpandedIds();if(!ex.size)return nodes;
  const have=new Set(nodes.map(e=>e.id)),out=[...nodes],base=nodes.map(e=>({id:e.id,x:Number(e.style?.x)||0,y:Number(e.style?.y)||0}));
  const ring=(parent,px,py,depth)=>{
    if(!ex.has(parent.id)||parent.id===state.scopeId||depth>5)return;
    let kids=containmentChildren(parent.id).map(getEntity).filter(k=>k&&!have.has(k.id)&&visibleByFilters(k));
    graphInnerMore.set(parent.id,Math.max(0,kids.length-GRAPH_RING_MAX));kids=kids.slice(0,GRAPH_RING_MAX);const n=kids.length;if(!n)return;
    // face away from the nearest neighbour, the ring grows with the number of records so cards do not overlap
    let near=null,best=Infinity;for(const b of base){if(b.id===parent.id)continue;const d=Math.hypot(b.x-px,b.y-py);if(d<best){best=d;near=b}}
    const away=near?Math.atan2(py-near.y,px-near.x):-Math.PI/2,R=Math.max(depth?78:110,(depth?46:58)*n/(2*Math.PI)+(depth?48:70)),span=n===1?0:n<5?Math.PI*.9:Math.PI*2;
    kids.forEach((k,i)=>{const t=n===1?away:span<Math.PI*2?away-span/2+span*i/(n-1):away+Math.PI*2*i/n,x=px+Math.cos(t)*R,y=py+Math.sin(t)*R;graphInnerPos.set(k.id,{x,y,parent:parent.id,depth:depth+1});have.add(k.id);out.push(k)});
    for(const k of kids){const p=graphInnerPos.get(k.id);ring(k,p.x,p.y,depth+1)}
  };
  for(const e of nodes)ring(e,Number(e.style?.x)||0,Number(e.style?.y)||0,0);
  return out;
}
function setGraphExpanded(id,on){const m=state.graphExpanded&&typeof state.graphExpanded==='object'?state.graphExpanded:(state.graphExpanded={});const s=new Set(Array.isArray(m[state.scopeId])?m[state.scopeId]:[]);
  if(on)s.add(id);else{const drop=[id],seen=new Set();while(drop.length){const x=drop.pop();if(seen.has(x))continue;seen.add(x);s.delete(x);for(const c of containmentChildren(x))drop.push(c)}} /* folding closes what was opened inside */
  if(s.size)m[state.scopeId]=[...s];else delete m[state.scopeId];state.viewVersion=(state.viewVersion||0)+1;updateUI();persistWorkspaceView()}
// 0.27: what is inside a record, in words — «2 персонажа, 1 гильдия» — the most important first (more relations, then more records)
function countNoun(n,name){
  const w=String(name||'').split('/')[0].trim();const low=w.toLowerCase() /* «Дом / семья» → «дом» */,a=Math.abs(n)%100,b=a%10,form=a>10&&a<20?2:b===1?0:b>=2&&b<=4?1:2;
  if(!w||/[\s/]/.test(w)||!/^[а-яё]+$/.test(low))return `${n} · ${w||'без типа'}`;
  let one=low,few,many;
  if(/ец$/.test(low)){few=low.slice(0,-2)+'ца';many=low.slice(0,-2)+'цев'}
  else if(/ие$/.test(low)){few=low.slice(0,-1)+'я';many=low.slice(0,-1)+'й'}
  else if(/ия$/.test(low)){few=low.slice(0,-1)+'и';many=low.slice(0,-1)+'й'}
  else if(/[гкхжшчщ]а$/.test(low)){few=low.slice(0,-1)+'и';many=low.slice(0,-1)}
  else if(/а$/.test(low)){few=low.slice(0,-1)+'ы';many=low.slice(0,-1)}
  else if(/я$/.test(low)){few=low.slice(0,-1)+'и';many=low.slice(0,-1)+'ь'}
  else if(/о$/.test(low)){few=low.slice(0,-1)+'а';many=low.slice(0,-1)}
  else if(/ь$/.test(low)){few=low.slice(0,-1)+'и';many=low.slice(0,-1)+'ей'}
  else if(/й$/.test(low)){few=low.slice(0,-1)+'я';many=low.slice(0,-1)+'ев'}
  else if(/[жшчщ]$/.test(low)){few=low+'а';many=low+'ей'}
  else if(/[бвгдзклмнпрстфхц]$/.test(low)){few=low+'а';many=low+'ов'}
  else return `${n} · ${w}`;
  return `${n} ${[one,few,many][form]}`;
}
const insideSummaryCache=new Map();
function insideSummary(id,max=2){const key=(state.viewVersion||0)+'|'+data.entities.length+'|'+data.relations.length+'|'+id+'|'+max;const hit=insideSummaryCache.get(key);if(hit)return hit;if(insideSummaryCache.size>4000)insideSummaryCache.clear();const r=insideSummaryRaw(id,max);insideSummaryCache.set(key,r);return r}
function insideSummaryRaw(id,max){
  const kids=containmentChildren(id).map(getEntity).filter(Boolean);const groups=new Map(),deg=new Map();
  if(kids.length>1){const ids=new Set(kids.map(k=>k.id));for(const r of data.relations){if(getRT(r.type).containment)continue;if(ids.has(r.from))deg.set(r.from,(deg.get(r.from)||0)+1);if(ids.has(r.to))deg.set(r.to,(deg.get(r.to)||0)+1)}} /* one pass over relations, not one per record */
  for(const k of kids){const t=k.type||'';const g=groups.get(t)||{type:t,n:0,score:0};g.n++;g.score+=deg.get(k.id)||0;groups.set(t,g)}
  const list=[...groups.values()].sort((a,b)=>b.score-a.score||b.n-a.n);const shown=list.slice(0,max);
  return {total:kids.length,parts:shown.map(g=>{const t=getET(g.type);return {icon:t.icon||'•',label:countNoun(g.n,g.type?t.name:'Без типа'),n:g.n}}),rest:list.slice(max).reduce((s,g)=>s+g.n,0)};
}
function insideSummaryText(id,max=3){const s=insideSummary(id,max);return s.parts.map(p=>p.label).join(', ')+(s.rest?`, …ещё ${s.rest}`:'')}
function activeNodes(){let nodes=scopeMembers().filter(visibleByFilters);if(getEntity(state.scopeId)&&!state.isolate&&!nodes.some(e=>e.id===state.scopeId))nodes=[getEntity(state.scopeId),...nodes];if(state.showExternal)nodes=nodes.concat(externalNeighborIds().filter(e=>visibleByFilters(e)&&!nodes.some(n=>n.id===e.id)));if(state.isolate&&state.selectedId){const d=neighbors(state.selectedId,state.focusRadius);nodes=nodes.filter(e=>d.has(e.id))}if(state.hideFar&&state.selectedId){const d=neighbors(state.selectedId,state.focusRadius);nodes=nodes.filter(e=>d.has(e.id))}if(state.focusedPath.length){nodes=state.focusedPath.map(getEntity).filter(Boolean);graphInnerPos=new Map();return nodes}return graphAddExpanded(nodes)}
// Containment is a real relation. It remains visible in the Graph; the toggle below
// only hides ordinary non-hierarchical relations.
function activeRelations(nodes){
  const ids=new Set(nodes.map(e=>e.id));
  return data.relations.filter(r=>{
    if(!r||!ids.has(r.from)||!ids.has(r.to))return false;
    const containment=!!getRT(r.type).containment;
    // Hierarchy links are not hidden by the «relations» toggle or the type filter — only by their importance (0.28.2).
    if(!containment&&!state.showRelations)return false;
    if(containment?(state.hiddenTiers&&state.hiddenTiers.has(relationTier(r))):!relationShown(r))return false; // 0.28.2: a hidden tier hides the nesting line, not the record
    return true;
  });
}
function findAncestorPath(id){const path=[],seen=new Set();let cur=id;while(cur&&!seen.has(cur)){path.unshift(cur);seen.add(cur);if(cur===currentRootId())break;cur=containmentParent(cur)}return path.length&&path[0]===currentRootId()?path:[currentRootId(),id].filter(Boolean)}
