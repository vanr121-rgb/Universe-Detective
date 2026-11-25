// Atomic edits of a participant's projection, merged into the canonical workspace.
'use strict';
const UD_ONLINE_COLLECTIONS={et:'entityTypes',rt:'relationTypes',sg:'statusGroups',s:'sketches',b:'boards',m:null};
const UD_ONLINE_META=['name','favorite','tagColors','udRuleGroups','rulesPreset','relationTiers','trashDays'];
ONP_COLLS.push(['et','entityTypes'],['rt','relationTypes'],['sg','statusGroups'],['s','sketches'],['b','boards'],['m','metadata']);
function udOnlineMeta(ws){const x={id:'workspace'};for(const k of UD_ONLINE_META)if(ws?.[k]!==undefined)x[k]=clone(ws[k]);return x}
function udOnlineSafe(v,depth=0){
 if(depth>40)return false;if(v===null||typeof v==='string'||typeof v==='boolean')return true;
 if(typeof v==='number')return Number.isFinite(v);
 if(Array.isArray(v))return v.length<=20000&&v.every(x=>udOnlineSafe(x,depth+1));
 return isRecord(v)&&Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&udOnlineSafe(x,depth+1));
}
const udBaseCopy=onpCopy;
onpCopy=function(ws){const o=udBaseCopy(ws);o.s=(ws?.sketches||[]).map(({strokes,...s})=>clone(s));
 o.b=Object.entries(ws?.boards||{}).filter(([,board])=>board.placements).map(([id,b])=>({id,...clone(b)}));o.m=[udOnlineMeta(ws)];return o;};
// Small edits on a prepared board carry only the changed rows. Legacy
// migration still uses its complete before-and-after placement snapshots.
function udBoardRowsDiff(before,after,key){
 const old=new Map(before.map(row=>[key(row),row]));
 const next=new Map(after.map(row=>[key(row),row]));
 const removed=[],added=[];
 for(const [id,row] of old)if(onhJ(row)!==onhJ(next.get(id)))removed.push(row);
 for(const [id,row] of next)if(onhJ(row)!==onhJ(old.get(id)))added.push(row);
 const order=[...old.keys()].filter(id=>next.has(id)).concat([...next.keys()].filter(id=>!old.has(id)));
 return order.length===after.length&&order.every((id,i)=>id===key(after[i]))?{removed,added}:null;
}
function udCompactBoardOps(ops){
 return ops.map(op=>{
  const before=op.was?.placements,after=op.f?.placements;
  if(op.c!=='b'||op.op!=='set'||before?.schema!==1||after?.schema!==1)return op;
  const items=udBoardRowsDiff(before.items,after.items,p=>p.id);
  const routes=udBoardRowsDiff(before.routes,after.routes,onhJ);
  if(!items||!routes)return op;
  const f={...op.f},was={...op.was};
  delete f.placements;delete was.placements;
  f.items=items.added;was.items=items.removed;f.routes=routes.added;was.routes=routes.removed;
  if(onhJ(before.excludedRoots)!==onhJ(after.excludedRoots)){
   f.excludedRoots=after.excludedRoots||null;was.excludedRoots=before.excludedRoots||null;
  }
  return {...op,op:'patch',f,was};
 });
}
function udApplyBoardRows(rows,before,after,key,check){
 if(!Array.isArray(before)||!Array.isArray(after)||!before.every(isRecord)||!after.every(isRecord))
  throw Error('Некорректная правка доски');
 const old=new Map(before.map(row=>[key(row),row])),next=new Map(after.map(row=>[key(row),row]));
 const result=new Map(rows.map(row=>[key(row),row]));
 if(old.size!==before.length||next.size!==after.length)throw Error('Повторный ID в правке доски');
 for(const [id,row] of old){
  if(check&&onhJ(result.get(id))!==onhJ(row))throw Error('Доска уже изменилась. Повторите действие');
  if(!next.has(id))result.delete(id);
 }
 for(const [id,row] of next){
  if(check&&!old.has(id)&&result.has(id))throw Error('Доска уже изменилась. Повторите действие');
  result.set(id,clone(row));
 }
 return [...result.values()];
}
function udExpandBoardPatch(base,op,check=false){
 if(!base?.placements||!isRecord(op.f)||!isRecord(op.was))throw Error('Доска недоступна');
 const {items,routes,excludedRoots,...fields}=op.f;
 const {items:beforeItems,routes:beforeRoutes,excludedRoots:beforeRoots,...beforeFields}=op.was;
 if(Object.keys(fields).some(k=>!['open','rel','pins'].includes(k))||
    Object.hasOwn(op.f,'excludedRoots')!==Object.hasOwn(op.was,'excludedRoots')||
    excludedRoots!=null&&!Array.isArray(excludedRoots))
  throw Error('Некорректная правка доски');
 const old=base.placements;
 const placements={...old,items:udApplyBoardRows(old.items,beforeItems,items,row=>row.id,check),
  routes:udApplyBoardRows(old.routes,beforeRoutes,routes,onhJ,check)};
 if(Object.hasOwn(op.f,'excludedRoots')){
  if(check&&onhJ(old.excludedRoots)!==onhJ(beforeRoots))throw Error('Доска уже изменилась. Повторите действие');
  if(excludedRoots===null)delete placements.excludedRoots;else placements.excludedRoots=clone(excludedRoots);
 }
 return {...op,op:'set',f:{...fields,placements},was:{...beforeFields,placements:old}};
}
// The server has already saved these coordinates. Other fields and active
// editing sessions use the normal snapshot install and normalization.
function udApplyRemoteBoardMove(ops){
 if(!Array.isArray(ops)||ops.length!==1||onp.copy||onp.first||onp.pendingWorld||
    onp.outbox.length||currentWorkspace()?.id!==onp.world?.id||
    state.visualMode!=='detective'||$('#modalBack')?.classList.contains('open'))return false;
 const [op]=ops;
 if(op?.c!=='b'||op.op!=='patch'||op.id!==boardKey()||!op.f||!op.was||
    [...Object.keys(op.f),...Object.keys(op.was)].some(key=>key!=='items'&&key!=='routes')||
    op.f.routes?.length||op.was.routes?.length)return false;
 const before=op.was.items,after=op.f.items;
 if(!before?.length||before.length!==after?.length)return false;
 const board=currentWorkspace().boards?.[op.id]?.placements;
 const base=onp.base?.b.find(b=>b.id===op.id)?.placements;
 if(!board||!base)return false;
 const local=new Map(board.items.map(p=>[p.id,p])),stored=new Map(base.items.map(p=>[p.id,p]));
 for(let i=0;i<before.length;i++){
  const prior=before[i],next=after[i],paper=local.get(prior.id);
  if(!paper||!stored.has(prior.id)||!udCoordinate(next.x)||!udCoordinate(next.y)||
     !boardValuesEqual(paper,prior)||!boardValuesEqual({...prior,x:next.x,y:next.y},next)||
     !boardValuesEqual(stored.get(prior.id),prior))return false;
 }
 for(const {id,x,y} of after){
  Object.assign(local.get(id),{x,y});
  Object.assign(stored.get(id),{x,y});
 }
 previewBoards.clear();
 state.viewVersion++;
 if(!boardRefreshSavedPositions())renderDetective();
 onpCopySave();
 return true;
}
const udBaseApplyOps=onlApplyOps;
onlApplyOps=function(ws,ops){const legacy=[];for(const op of ops||[]){
 if(!Object.hasOwn(UD_ONLINE_COLLECTIONS,op.c)){legacy.push(op);continue}
 if(op.c==='m'){for(const [k,v] of Object.entries(op.f||op.v||{}))if(UD_ONLINE_META.includes(k)){if(v===null)delete ws[k];else ws[k]=clone(v)}continue}
 if(op.c==='b'){
  if(op.op==='patch'&&!ws.boards?.[op.id]?.placements)continue;
  const edit=op.op==='patch'?udExpandBoardPatch(ws.boards[op.id],op):op;
  ws.boards??={};
  if(edit.op==='del'){delete ws.boards[edit.id];continue}
  if(edit.op==='add'){
   const {id,...board}=edit.v;
   ws.boards[id]=clone(board);
  }else{
   const board=ws.boards[edit.id]??={};
   for(const [k,v] of Object.entries(edit.f||{})){if(v===null)delete board[k];else board[k]=clone(v)}
  }
  continue;
 }
 const field=UD_ONLINE_COLLECTIONS[op.c],list=ws[field]??=[],id=op.op==='add'?op.v?.id:op.id,i=list.findIndex(v=>v.id===id);
 if(op.op==='del'){if(i>=0)list.splice(i,1)}else if(op.op==='add'){if(i<0)list.push(clone(op.v));else list[i]={...list[i],...clone(op.v)}}
 else if(i>=0)for(const [k,v] of Object.entries(op.f||{})){if(v===null)delete list[i][k];else list[i][k]=clone(v)}
 }return udBaseApplyOps(ws,legacy);
};
// Compare only touched records/fields, preserving concurrent edits to other ones.
function udMergeOnlineCollection(ws,projection,op){
 const field=UD_ONLINE_COLLECTIONS[op.c];if(!field)throw Error('Неизвестный набор');
 const list=ws[field]??=[],seen=projection[field]||[],id=op.op==='add'?op.v?.id:op.id;
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,180}$/.test(id))throw Error('Некорректный ID');
 const base=seen.find(x=>x.id===id),real=list.find(x=>x.id===id);
 if(op.op==='add'){
  if(real){if(onhJ(real)!==onhJ(op.v))throw Error('Этот ID уже занят');return}
  if(!isRecord(op.v))throw Error('Некорректные данные операции');list.push(clone(op.v));return;
 }
 if(!base||!real)throw Error('Объект больше недоступен');
 if(op.op==='del'){
  const ignored=new Set(['createdAt','updatedAt',...(op.c==='s'?['strokes']:[])]);
  if(op.old&&[...new Set([...Object.keys(base),...Object.keys(op.old)])].some(k=>!ignored.has(k)&&onhJ(base[k])!==onhJ(op.old[k])))throw Error('Данные уже изменились');
  if(op.c==='rt'&&real.containment)throw Error('Тип вложенности нельзя удалить');
  if(op.c==='s'&&onhJ(real.strokes)!==onhJ(base.strokes))throw Error('Лист уже изменился');
  list.splice(list.indexOf(real),1);return;
 }
 if(op.op!=='set'||!isRecord(op.f)||!isRecord(op.was))throw Error('Некорректная правка');
 for(const [k,v] of Object.entries(op.f)){
  if(k==='id'||k==='strokes'||ONH_GM_ONLY.has(k))throw Error('Недопустимое поле');
  if(onhJ(base[k])!==onhJ(op.was[k])||onhJ(real[k])!==onhJ(base[k]))throw Error('Это поле уже изменили. Повторите правку');
  if(v===null)delete real[k];else real[k]=clone(v);
 }
}
function udMergeOnlineBoard(ws,projection,op,bindings){
 if(op.op==='patch')op=udExpandBoardPatch(projection.boards?.[op.id],op,true);
 const scope=op.op==='add'?op.v?.id:op.id;
 if(udUsesSharedLayout(ws)&&scope!==ws.rootId)throw Error('Изменять можно только общую раскладку этой рабочей зоны');
 const entity=projection.entities.find(e=>e.id===scope);if(!entity||entity.hint)throw Error('Доска недоступна');
 const base=projection.boards?.[scope],live=(ws.boards??={})[scope]??={open:{},rel:{},pins:[]};
 if(op.op==='del')throw Error('Доску нельзя удалить целиком');
 const incoming=op.op==='add'?op.v:op.f;
 for(const k of Object.keys(incoming||{}))if(!['id','placements','open','rel','pins'].includes(k))throw Error('Недопустимое поле доски');
 if(op.op==='set')for(const k of Object.keys(op.f||{}))if(onhJ(op.was?.[k])!==onhJ(base?.[k]))throw Error('Доска уже изменилась. Повторите действие');
 if(op.op==='add'&&base)throw Error('Доска уже подготовлена. Повторите действие');
 const raw=incoming?.placements;if(!raw)return;
 if(raw.schema!==1||!Array.isArray(raw.items)||!Array.isArray(raw.routes))throw Error('Некорректные размещения');
 const known=new Set(projection.entities.filter(e=>!e.hint).map(e=>e.id));
 const beforeKnown=new Set((projection.beforeEntities||projection.entities).filter(e=>!e.hint).map(e=>e.id));
 const aliases=new Map();for(const [key,id] of bindings){const [b,p]=JSON.parse(key);if(b===scope)aliases.set(p,id)}
 let old=base?.placements||{schema:1,items:[],routes:[]},requested=raw.items,migrationBefore;
 if(new Set(raw.items.map(p=>p.id)).size!==raw.items.length)throw Error('Повторный ID бумажки');
 if(!live.placements){
  // Convert the complete host board, then match the papers the player had before their gesture.
  const migrated=udWithWorkspace(ws,()=>udMigrateLegacyBoard(scope,live,ws));
  if(!migrated)throw Error('Не удалось подготовить доску');
  const visibleEntities=projection.beforeEntities||projection.entities;
  let legacy;
  if(op.legacy){
   const visibleIds=new Set(visibleEntities.map(e=>e.id));
   const visibleRelations=new Map(projection.relations.map(r=>[r.id,r]));
   legacy=udNormalizePlacements(op.legacy,visibleIds,visibleRelations,{projected:true});
   if(!legacy||!Array.isArray(op.legacy.items)||legacy.items.length!==op.legacy.items.length)throw Error('Устаревшая раскладка доски');
   const hints=new Set(visibleEntities.filter(e=>e.hint).map(e=>e.id));
   requested=raw.items.filter(p=>!hints.has(p.entityId)||!legacy.items.some(previous=>
     previous.id===p.id&&onhJ(previous)===onhJ(p)));
  }
  const legacyByEntity=new Map();
  for(const p of legacy?.items||raw.items)if(!legacyByEntity.has(p.entityId))legacyByEntity.set(p.entityId,p);
  const canonicalById=new Map(migrated.items.map(p=>[p.id,p])),ids=new Map();
  for(const paper of migrated.items){
   const match=legacyByEntity.get(paper.entityId);
   if(!match)continue;
   let ancestor=paper;
   while(ancestor&&beforeKnown.has(ancestor.entityId))ancestor=canonicalById.get(ancestor.parentId);
   if(!ancestor)ids.set(paper.id,match.id);
  }
  const matched=new Set(ids.values());
  for(const p of migrated.items){p.id=ids.get(p.id)||p.id;if(p.parentId)p.parentId=ids.get(p.parentId)||p.parentId}
  for(const route of migrated.routes)for(const key of ['from','to','fromParent','toParent'])if(ids.has(route[key]))route[key]=ids.get(route[key]);
  live.placements=migrated;
  if(legacy){
   old={...legacy,items:legacy.items.filter(p=>matched.has(p.id))};
   migrationBefore=onhSnapshot(ws).boards?.[scope]?.placements;
  }
 }
 const before=new Map(old.items.map(p=>[p.id,p])),next=new Map(requested.map(p=>[p.id,p]));
 const canonical=live.placements,originalItems=new Map(canonical.items.map(p=>[p.id,p])),real=new Map(originalItems);
 const editablePapers=new Set(old.items.filter(p=>beforeKnown.has(p.entityId)).map(p=>aliases.get(p.id)||p.id));
 for(const [id,p] of before){if(next.has(id))continue;
  const target=aliases.get(id)||id;if(!beforeKnown.has(p.entityId))throw Error('Неизвестную бумажку нельзя удалить');
  // Removing a visible parent must preserve canonical placements outside the player's projection.
  for(const child of udPaperSubtree(canonical,target)){
   if(!editablePapers.has(child))throw Error('Не удалось удалить эту бумажку. Обратитесь к Мастеру');
   real.delete(child);
  }
 }
 for(const n of requested){
  const oldPaper=before.get(n.id),id=aliases.get(n.id)||n.id,r=real.get(id);
  const copy=()=>{
   const paper=clone(n);
   if(r?.adoptedLayout)paper.adoptedLayout=true;else delete paper.adoptedLayout;
   return paper;
  };
  if(!oldPaper){if(!known.has(n.entityId)||r&&r.entityId!==n.entityId)throw Error('Бумажка недоступна');real.set(id,copy());continue}
  if(onhJ(n)===onhJ(oldPaper))continue;
  if(!r)throw Error('Бумажка уже удалена');
  const moved=n.x!==oldPaper.x||n.y!==oldPaper.y||n.parentId!==oldPaper.parentId;
  if(oldPaper.locked&&(moved||n.w!==oldPaper.w||n.h!==oldPaper.h))throw Error('Бумажка закреплена');
  const lease=typeof udPaperLeases!=='undefined'&&udPaperLeases.get(JSON.stringify([scope,id]));
  if(lease&&lease.actor!==onh.editActor&&lease.expires>performance.now())throw Error('Бумажку уже двигает другой участник');
  if(!known.has(n.entityId)){
   const allowed=new Set(['x','y','w','h','locked','autoHeight']);
   for(const k of new Set([...Object.keys(n),...Object.keys(oldPaper)]))if(onhJ(n[k])!==onhJ(oldPaper[k])&&!allowed.has(k))throw Error('Неизвестную бумажку нельзя изменить');
   for(const k of allowed){if(n[k]===undefined)delete r[k];else r[k]=n[k]}
  }else{if(n.entityId!==oldPaper.entityId||n.id!==oldPaper.id)throw Error('Нельзя подменить сущность бумажки');real.set(id,copy())}
 }
 const items=[...real.values()];for(const p of items)if(p.parentId)p.parentId=aliases.get(p.parentId)||p.parentId;
 // Only routes in the public projection may be removed or replaced.
 const key=r=>JSON.stringify(r),visibleRoutes=new Set(old.routes.map(key));
 const routes=canonical.routes.filter(r=>!visibleRoutes.has(key(r)));
 const routeKeys=new Set(routes.map(key)),relationsForRoutes=new Map(projection.relations.map(r=>[r.id,r]));
 for(const route of raw.routes){const r=clone(route);for(const k of ['from','to','fromParent','toParent'])if(r[k])r[k]=aliases.get(r[k])||r[k];
  const relation=relationsForRoutes.get(r.relationId);if(!relation||relation.hint||playerRelationMasked(relation))throw Error('Нить недоступна');
  const routeKey=key(r);if(!routeKeys.has(routeKey)){routeKeys.add(routeKey);routes.push(r)}
 }
 const allowedExclusions=(values,prior=[])=>[...new Set([...prior.filter(id=>!known.has(id)),...(values||[]).filter(id=>known.has(id))])];
 for(const p of items){const origin=originalItems.get(p.id);if(p.excludedMembers||origin?.excludedMembers)p.excludedMembers=allowedExclusions(p.excludedMembers,origin?.excludedMembers)}
 const board={schema:1,items,routes,excludedRoots:allowedExclusions(raw.excludedRoots,canonical.excludedRoots)};
 const ids=new Set(ws.entities.map(e=>e.id)),rels=new Map(ws.relations.map(r=>[r.id,r]));
 const normalized=udNormalizePlacements(board,ids,rels);
 if(!normalized||normalized.items.length!==items.length)throw Error('Некорректная вложенность или размер бумажки');
 if(normalized.routes.length!==routes.length)throw Error('Некорректные концы нити');
 if(udVisiblePlacements(normalized,()=>true,undefined,{limit:BOARD_LIMIT}).size>=BOARD_LIMIT)throw Error('Лимит доски достигнут');
 live.placements=normalized;
 return migrationBefore?{id:scope,placements:migrationBefore}:null;
}
function udValidateOnlineWorld(ws){
 if(udUsesSharedLayout(ws)&&(!ws.boards?.[ws.rootId]?.placements||Object.keys(ws.boards).some(scope=>scope!==ws.rootId)))throw Error('Общая раскладка неполна');
 const allIds=list=>{const set=new Set();for(const o of list||[]){if(!isRecord(o)||typeof o.id!=='string'||set.has(o.id))throw Error('Повторный ID');set.add(o.id)}return set};
 const e=allIds(ws.entities),et=allIds(ws.entityTypes),rt=allIds(ws.relationTypes);allIds(ws.articles);allIds(ws.statusGroups);allIds(ws.sketches);
 if(!e.has(ws.rootId))throw Error('Корень зоны потерян');
 for(const x of ws.entities)if(x.type&&!et.has(x.type))throw Error('Тип ещё используется. Сначала измените сущности');
 const parents=new Map(),contains=new Set(ws.relationTypes.filter(t=>t.containment).map(t=>t.id));
 for(const r of ws.relations){if(!e.has(r.from)||!e.has(r.to)||!rt.has(r.type)||r.from===r.to)throw Error('Некорректная связь');
  if(contains.has(r.type)){const a=parents.get(r.to)||[];a.push(r.from);parents.set(r.to,a)}}
 const visiting=new Set(),done=new Set();const visit=id=>{if(visiting.has(id))throw Error('Вложенность образует цикл');if(done.has(id))return;visiting.add(id);for(const p of parents.get(id)||[])visit(p);visiting.delete(id);done.add(id)};
 for(const id of e)visit(id);
}
// A player edits a projection. A move must not remove an existing membership
// of another physical occurrence that was absent from that projection.
function udValidateMovedMemberships(before,after){
 const types=new Set(before.relationTypes.filter(t=>t.containment).map(t=>t.id));
 const oldRelations=new Map(before.relations.filter(r=>types.has(r.type)).map(r=>[r.id,r]));
 const nextRelations=new Set(after.relations.filter(r=>types.has(r.type)).map(r=>JSON.stringify([r.from,r.to])));
 for(const r of oldRelations.values()){
  if(nextRelations.has(JSON.stringify([r.from,r.to])))continue;
  // A normal relation edit by itself is still allowed. Check only transactions
  // that physically moved a paper out of this specific container.
  const moved=Object.entries(before.boards||{}).some(([scope,b])=>{
   const old=b.placements;if(!old)return false;
   const current=after.boards?.[scope]?.placements;
   return old.items.some(p=>p.entityId===r.to&&udPaperContainer(old,p.parentId,scope)===r.from&&
    (!current?.items.some(n=>n.id===p.id&&n.parentId===p.parentId))&&Object.values(after.boards||{}).some(n=>n.placements?.items.some(q=>q.id===p.id)));
  });
  if(moved&&udHasPaperInContainer(after,r.to,r.from))throw Error('Состав прежнего контейнера изменился. Обновите доску перед переносом.');
 }
}
const udBaseEdit=onhApplyEdit;
function udApplyOnlineTransaction(c,x,ops){
 const original=onhWorld(),p=partGet(x.partId);
 const refuse=why=>({ok:0,rejected:[{why}],conflicts:[]});
 if(!original||p?.role!=='player'||!partAllowed(p,original.id)||persistenceLocked)return refuse('Редактирование недоступно');
 if(!Array.isArray(ops)||ops.length>ONH_EDIT_LIMITS.opsPerMsg||!udOnlineSafe(ops))return refuse('Некорректная правка');
 const now=Date.now();x.edits=(x.edits||[]).filter(t=>now-t<10000);if(x.edits.length>=ONH_EDIT_LIMITS.msgsPer10s)return refuse('Слишком много изменений');
 const candidate=clone(original),bindings=new Map(),projection=onhSnapshot(original,bindings),meta=udOnlineMeta(projection);
 const candidateAliases=ops.some(op=>op?.c==='b'&&op.legacy)?new Map(udPaperAliasMaps.get(original)):null;
 if(candidateAliases)udPaperAliasMaps.set(candidate,candidateAliases);
 const migratedBoards=[];
 const previous={candidate:onh.candidate,snap:onh.lastSnap,save:onhSave,actor:onh.editActor};onh.editActor=c;let legacyResult={ok:0,rejected:[],conflicts:[]};
 try{
  for(const op of ops){if(onhJ(op).length>ONH_EDIT_LIMITS.fieldBytes)throw Error('Слишком большая правка');
   if(['et','rt','sg','s'].includes(op.c))udMergeOnlineCollection(candidate,projection,op);
   else if(op.c==='m'){
    if(op.op!=='set')throw Error('Некорректная настройка зоны');
    for(const [k,v] of Object.entries(op.f||{})){if(!UD_ONLINE_META.includes(k))throw Error('Настройка недоступна');
     if(onhJ(meta[k])!==onhJ(op.was?.[k]))throw Error('Настройка уже изменилась');
     if(k==='tagColors'){
      const current=candidate.tagColors||{},seen=projection.tagColors||{},next=v||{},merged={...current};
      for(const key of new Set([...Object.keys(seen),...Object.keys(next)])){if(onhJ(seen[key])!==onhJ(current[key])&&!Object.hasOwn(seen,key))throw Error('Цвет недоступного тега нельзя изменить');if(Object.hasOwn(next,key))merged[key]=next[key];else delete merged[key]}candidate.tagColors=merged;
     }else if(v===null)delete candidate[k];else candidate[k]=clone(v);
    }
   }else if(!['e','r','a','k','b'].includes(op.c))throw Error('Неизвестная операция');
  }
  onh.candidate=candidate;onh.lastSnap=null;onhSave=()=>true;
  const removedSheets=new Set(ops.filter(o=>o.c==='s'&&o.op==='del').map(o=>o.id));
  const legacy=ops.filter(op=>['e','r','a','k'].includes(op.c)&&!(op.c==='k'&&op.op==='del'&&removedSheets.has(String(op.id).split('~')[0])));
  if(legacy.length){legacyResult=udBaseEdit(c,x,legacy);if(legacyResult.rejected?.length)throw Error(legacyResult.rejected[0].why)}else x.edits.push(now);
  const publicAfter=onhSnapshot(candidate);
  for(const op of ops.filter(o=>o.c==='b')){
   // Old board state is compared to the pre-transaction projection; endpoints may be newly added relations/entities.
   if(op.op==='del'&&!candidate.entities.some(e=>e.id===op.id)&&projection.entities.some(e=>e.id===op.id&&!e.hint))continue;
   const migration=udMergeOnlineBoard(candidate,{...projection,beforeEntities:projection.entities,entities:publicAfter.entities,relations:publicAfter.relations},op,bindings);
   if(migration)migratedBoards.push(migration);
  }
  udValidateMovedMemberships(original,candidate);udValidateOnlineWorld(candidate);
 }catch(e){return refuse(e.message||'Не удалось применить изменение')}
 finally{onh.editActor=previous.actor;onh.candidate=previous.candidate;onh.lastSnap=previous.snap;onhSave=previous.save}
 const before=clone(original),active=currentWorkspace()?.id===original.id&&!viewAsPlayer();
 try{
  for(const key of Object.keys(original))delete original[key];Object.assign(original,candidate);
  if(active){data.entities=original.entities;data.relations=original.relations;applyWorkspaceRules(original)}
  onh.lastSnap=null;if(!onhSave())throw Error('Не удалось сохранить изменение');
 }catch(e){for(const key of Object.keys(original))delete original[key];Object.assign(original,before);if(active){data.entities=original.entities;data.relations=original.relations;applyWorkspaceRules(original)}onh.lastSnap=null;updateUI();return refuse(e.message)}
 let migrationUndo;
 if(migratedBoards.length){
  udPaperAliasMaps.set(original,candidateAliases);
  const boards=onhSnapshot(original).boards;
  migrationUndo=migratedBoards.map(({id,placements})=>({
   c:'b',op:'set',id,f:{placements},was:{placements:boards[id].placements}
  }));
 }
 onhBroadcast();return {ok:ops.length,rejected:[],conflicts:legacyResult.conflicts||[],...(migrationUndo?{migrationUndo}:{})};
}
onhApplyEdit=function(c,x,ops){if(x.editor===2&&!ops.some(o=>['fix','paper','createPaper'].includes(o.op))){const result=udApplyOnlineTransaction(c,x,ops);if(result.rejected.length)onhSendWorld(c);return result}return udBaseEdit(c,x,ops)};
// Only deletions confirmed through the shared world enter the network trash.
// Keep the display data separate from the complete backup used to restore it.
function udPublicTrash(ws){
 const result=[];
 for(const t of ws.trash||[]){
  if(t?.networkShared!==true||!t.entity||t.entity.vis==='gm'||t.entity.vis==='hint'||t.entity.offBoard)continue;
  const fake={...ws,trash:[],entities:[...ws.entities.filter(e=>e.id!==t.entity.id),t.entity],relations:[...ws.relations,...(t.relations||[]).filter(r=>!ws.relations.some(x=>x.id===r.id))]};
  const p=playerProjection(fake),entity=p.entities.find(e=>e.id===t.entity.id);if(!entity||entity.hint)continue;
  const {id,name,type,style}=entity;
  const known=new Set(p.entities.filter(e=>!e.hint).map(e=>e.id)),relationIds=new Set((t.relations||[]).map(r=>r.id));
  const relations=p.relations.filter(r=>relationIds.has(r.id)).map(({id,from,to,type})=>({id,from,to,type}));
  result.push({id:t.id,batch:t.batch,at:t.at,entity:{id,name,type,style:{color:style?.color,icon:style?.icon}},children:(t.children||[]).filter(id=>known.has(id)),relations});
 }return result;
}
const udBaseSnapshot=onhSnapshot;
onhSnapshot=function(ws,bindings){const p=udBaseSnapshot(ws,bindings);if(p){const trash=udPublicTrash(ws);if(trash.length)p.trash=trash;if(ws.trashDays!==undefined)p.trashDays=ws.trashDays}return p};
function udRunZoneAction(ws,fn){
 const before=snapshotMutationState(),capture=captureWorkspace;
 try{captureWorkspace=()=>{};return udWithWorkspace(ws,fn)}finally{captureWorkspace=capture;restoreMutationState(before);const active=currentWorkspace();if(active){data.entities=active.entities;data.relations=active.relations;applyWorkspaceRules(active)}updateUI()}
}
function udHostTrash(c,x,q){
 const ws=data.workspaces.find(w=>w.id===udZoneOf(x)),p=partGet(x.partId),allowed=new Set(udPublicTrash(ws||{}).map(t=>t.id));
 if(!ws||p?.role!=='player'||!partAllowed(p,ws.id)||!Array.isArray(q.ids)||q.ids.some(id=>!allowed.has(id))){onhSend(c,{t:'zoneError',error:'Элемент корзины недоступен'});return}
 try{
  const ok=udRunZoneAction(ws,()=>q.action==='trashRestore'?trashRestore(q.ids,{askName:false}):trashForget(q.ids));
  if(!ok)throw Error('Не удалось изменить корзину');
  onhWorldChanged();onhSendWorld(c);
 }catch(e){onhSend(c,{t:'zoneError',error:e.message})}
}

