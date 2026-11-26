// Geometry belongs to a paper, while fields and relations belong to its entity.
'use strict';
const UD_PLACEMENT_SCHEMA=1;
const udCoordinate=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7;

// New zones use one authoritative placement forest rooted at the workspace.
// Older saves keep their independent boards until an explicit reconciliation.
const UD_SHARED_LAYOUT='shared-v1';
function udUsesSharedLayout(ws=currentWorkspace()){
  return ws?.udLayoutMode===UD_SHARED_LAYOUT;
}
function udInitSharedLayout(ws){
  if(!ws?.rootId||Object.keys(ws.boards||{}).length)return false;
  ws.udLayoutMode=UD_SHARED_LAYOUT;
  ws.boards={[ws.rootId]:{open:{},rel:{},pins:[],placements:{schema:UD_PLACEMENT_SCHEMA,items:[],routes:[]}}};
  return true;
}
function udSharedBoard(ws=currentWorkspace()){
  if(!udUsesSharedLayout(ws))return null;
  const boards=typeof viewAsPlayer==='function'&&viewAsPlayer()?playerPaperBoards:ws.boards;
  return boards?.[ws.rootId]?.placements||null;
}
// Resolve a physical occurrence, never an entity-wide geometry. Prefer the
// existing branch when navigating, otherwise the primary membership path.
function udSharedFindPaper(entityId,{preferred=null,within=null,ws=currentWorkspace(),board=udSharedBoard(ws)}={}){
  if(!board||!entityId||entityId===ws.rootId)return null;
  const byId=new Map(board.items.map(p=>[p.id,p]));
  const exact=byId.get(preferred);
  if(exact?.entityId===entityId)return exact;
  const candidates=board.items.filter(p=>p.entityId===entityId).sort((a,b)=>Number(!!a.detached)-Number(!!b.detached));
  if(!candidates.length)return null;
  const path=p=>{const ids=[],entities=[],seen=new Set();for(let q=p;q&&!seen.has(q.id);q=byId.get(q.parentId)){seen.add(q.id);ids.unshift(q.id);entities.unshift(q.entityId)}return {ids,entities}};
  // Preserve the identity of a duplicate folder when entering/leaving its branch.
  const current=byId.get(within);
  if(current){
    const trail=path(current).ids;
    const ancestor=candidates.find(p=>trail.includes(p.id));if(ancestor)return ancestor;
    const descendants=candidates.filter(p=>path(p).ids.includes(current.id));
    if(descendants.length)return descendants[0];
  }
  const contain=new Set((ws.relationTypes||[]).filter(t=>t.containment).map(t=>t.id));
  const parents=new Map((ws.relations||[]).filter(r=>contain.has(r.type)&&!r.udMembership).map(r=>[r.to,r.from]));
  const expected=[],seen=new Set();
  for(let id=entityId;id&&id!==ws.rootId&&!seen.has(id);id=parents.get(id)){seen.add(id);expected.unshift(id)}
  return candidates.find(p=>JSON.stringify(path(p).entities)===JSON.stringify(expected))||candidates[0];
}
function udSharedPaperContext(paper,ws=currentWorkspace(),board=udSharedBoard(ws)){
  if(!paper||!board)return null;
  const byId=new Map(board.items.map(p=>[p.id,p])),path=[],seen=new Set();
  for(let p=paper;p;p=byId.get(p.parentId)){
    if(seen.has(p.id)||path.length>=64||!getEntity(p.entityId)||getEntity(p.entityId).hint)return null;
    seen.add(p.id);path.unshift(p);
    if(p.parentId!==null&&!byId.has(p.parentId))return null;
  }
  let previous=null;
  for(const p of path)previous={workspace:ws.id,entityId:p.entityId,sourceScope:ws.rootId,paperId:p.id,
    returnScope:previous?.entityId??ws.rootId,previous};
  return previous;
}
function udSharedResolveContext(entityId,preferred=null){
  const ws=currentWorkspace();if(!udUsesSharedLayout(ws)||entityId===ws.rootId)return null;
  const current=state.udContainerContext;
  return udSharedPaperContext(udSharedFindPaper(entityId,{preferred:preferred?.workspace===ws.id?preferred.paperId:null,
    within:current?.workspace===ws.id?current.paperId:null}));
}
function udRestoreSharedContext(){
  const ws=currentWorkspace();if(!udUsesSharedLayout(ws))return;
  const context=udSharedResolveContext(state.scopeId,state.udContainerContext);
  if(!context){state.scopeId=ws.rootId;state.udContainerContext=null;return}
  state.udContainerContext=context;
}
function udSharedCurrentParent(){return udUsesSharedLayout()?udContainerContext()?.paperId??null:null}
// Move one physical occurrence. Keep an old membership only if another
// occurrence actually remains under that container (including authored legacy
// boards). Never materialize a second paper as a side effect of a move.
function udPaperContainer(board,parentId,scope=boardKey()){
  return parentId===null?scope:board.items.find(p=>p.id===parentId)?.entityId;
}
function udHasPaperInContainer(ws,entityId,containerId){
  return Object.entries(ws.boards||{}).some(([scope,b])=>{
    const board=b.placements;if(!board)return false;
    const parents=new Set(board.items.filter(p=>p.entityId===containerId).map(p=>p.id));
    return board.items.some(p=>p.entityId===entityId&&(p.parentId===null?scope===containerId:parents.has(p.parentId)));
  });
}
function udPaperExclude(board,parentId,entityId,on){
  const parent=parentId===null?board:board.items.find(p=>p.id===parentId);
  if(!parent)return;
  const key=parentId===null?'excludedRoots':'excludedMembers',list=new Set(parent[key]||[]);
  if(on&&!board.items.some(p=>p.parentId===parentId&&p.entityId===entityId))list.add(entityId);else list.delete(entityId);
  if(list.size)parent[key]=[...list];else delete parent[key];
}
function udSyncMovedPaperMembership(paper,source,oldParentId,oldScope,target,newScope,{relationId}={}){
  const ws=currentWorkspace(),child=paper.entityId,oldContainer=udPaperContainer(source,oldParentId,oldScope),newContainer=udPaperContainer(target,paper.parentId,newScope);
  if(!oldContainer||!newContainer||child===currentRootId()||newContainer===child)return null;
  const contains=r=>getRT(r.type).containment&&r.to===child;
  const previous=data.relations.find(r=>contains(r)&&r.from===oldContainer);
  const destination=data.relations.find(r=>contains(r)&&r.from===newContainer);
  const primary=data.relations.find(r=>contains(r)&&!r.udMembership);
  const removeOld=oldContainer!==newContainer&&previous&&!udHasPaperInContainer(ws,child,oldContainer);
  const explicit=relationId&&data.relations.find(r=>r.id===relationId);
  // Reuse the moved membership's identity when possible, rather than losing
  // authored properties. A second real occurrence keeps the old relation.
  const relation=destination||(!destination&&removeOld?previous:null)||explicit||{id:uid('relation'),properties:{},style:{}};
  const makePrimary=!primary||primary===relation||removeOld&&primary===previous||explicit===primary;
  const oldEndpoints={from:relation.from,to:relation.to};
  const rt=ensureContainsType();
  const kept=data.relations.filter(r=>r===relation||(!(removeOld&&r===previous)&&!(explicit&&r===explicit)));
  Object.assign(relation,{from:newContainer,to:child,type:rt.id});relation.properties||={};relation.style||={};
  if(makePrimary)delete relation.udMembership;else relation.udMembership=true;
  if(!kept.includes(relation))kept.push(relation);data.relations=ws.relations=kept;invalidateContainmentIndex();
  const invalidRoutes=new Set();if(removeOld&&previous!==relation)invalidRoutes.add(previous.id);
  if(oldEndpoints.from!==undefined&&(oldEndpoints.from!==newContainer||oldEndpoints.to!==child))invalidRoutes.add(relation.id);
  if(explicit&&explicit!==relation)invalidRoutes.add(explicit.id);
  if(invalidRoutes.size)for(const b of Object.values(ws.boards||{}))if(b.placements)b.placements.routes=b.placements.routes.filter(r=>!invalidRoutes.has(r.relationId));
  if(source!==target||oldParentId!==paper.parentId){
    // Another occurrence of the same folder can still legitimately contain
    // this entity. Suppress automatic or manual resurrection in the source.
    udPaperExclude(source,oldParentId,child,!!previous&&!removeOld);
  }
  udPaperExclude(target,paper.parentId,child,false);
  const entity=getEntity(newContainer);if(entity){entity.style||={};entity.style.space=true}
  return relation;
}
// A relation editor without explicit arrow endpoints still has to move a
// physical occurrence. null means no placement yet (new or legacy entity).
// false means an invalid/unavailable move. The caller owns the save/rollback.
function udReparentForRelation(childId,parentId,{relationId}={}){
  const ws=currentWorkspace();if(!ws)return null;
  const shared=udUsesSharedLayout(ws),scope=boardKey(),home=containmentParent(childId)||ws.rootId;
  const boards=Object.entries(ws.boards||{}).filter(([,b])=>b.placements?.schema===UD_PLACEMENT_SCHEMA);
  const candidates=boards.flatMap(([key,b])=>b.placements.items.filter(p=>p.entityId===childId).map(p=>({scope:key,board:b.placements,paper:p})));
  const selected=state.selectedId===childId?udSelectedPaperId():null;
  const primary=shared?udSharedFindPaper(childId,{preferred:selected}):null;
  const source=candidates.find(x=>x.scope===scope&&x.paper.id===selected)||candidates.find(x=>x.paper===primary)||
    candidates.find(x=>x.scope===scope&&udPaperContainer(x.board,x.paper.parentId,x.scope)===home)||
    candidates.find(x=>udPaperContainer(x.board,x.paper.parentId,x.scope)===home)||candidates.find(x=>x.scope===scope)||candidates[0];
  if(!source)return null;
  const {paper,board}=source,oldParentId=paper.parentId;
  let targetScope=source.scope,target=board,parent=null;
  if(parentId!==source.scope){
    parent=shared?udSharedFindPaper(parentId,{within:udSharedCurrentParent()}):board.items.find(p=>p.entityId===parentId&&!p.detached)||board.items.find(p=>p.entityId===parentId);
    if(!parent){
      if(shared)return false;
      targetScope=parentId;
      // Explicitly moving to a different legacy space is allowed, but never
      // overwrite a previously authored standalone layout.
      const stored=boardState(targetScope,true);
      target=stored.placements||udMigrateLegacyBoard(targetScope,stored,ws);
      if(!target)return false;
      stored.placements=target;
    }
  }
  const next=parent?.id??null,moving=target!==board||oldParentId!==next;
  if(moving&&(paper.locked||!udPaperParentValidator(board,paper.id)(next)))return false;
  if(moving){
    const point=parent?udNestPaperPosition(target,paper,next):udSharedDefaultPoint(target,null);
    if(!udCoordinate(point.x)||!udCoordinate(point.y))return false;
    if(target!==board){
      const ids=udPaperSubtree(board,paper.id);
      if(target.items.some(p=>ids.has(p.id)))return false;
      target.items.push(...board.items.filter(p=>ids.has(p.id)));
      target.routes.push(...board.routes.filter(r=>udThreadRoutePapers(r).every(id=>ids.has(id))));
      board.items=board.items.filter(p=>!ids.has(p.id));board.routes=board.routes.filter(r=>!udThreadRoutePapers(r).some(id=>ids.has(id)));
    }
    Object.assign(paper,{parentId:next,...point});
    delete paper.detached;
  }
  const relation=udSyncMovedPaperMembership(paper,board,oldParentId,source.scope,target,targetScope,{relationId});
  if(!relation)return false;
  if(parent){
    const byId=new Map(target.items.map(p=>[p.id,p])),ancestors=new Set();
    for(let p=parent;p&&!ancestors.has(p.entityId);p=byId.get(p.parentId))ancestors.add(p.entityId);
    if(!udInitializePaperChildren(target,parent,ancestors,udPlacementChildren(target.items),BOARD_LIMIT-1))return false;
    parent.open=parent.open||'one';
  }
  if(!udPaperViewFits(target,parent?{paperId:parent.id}:null)||!udPaperViewFits(target,null))return false;
  return relation;
}
function udSharedDefaultPoint(board,parentId){
  const occupied=new Set(board.items.filter(p=>p.parentId===parentId).map(p=>p.x+'|'+p.y));
  let n=0;const at=()=>parentId===null?{x:0,y:238+n*240}:{x:n*240,y:238};
  while(occupied.has(at().x+'|'+at().y))n++;
  return at();
}
// Bulk creation/import builds only newly introduced physical papers, in
// containment order. It never reconstructs a deliberately removed old paper.
function udSharedPlaceNewEntities(ws,ids){
  if(!udUsesSharedLayout(ws))return true;
  const board=ws.boards?.[ws.rootId]?.placements;if(!board)return false;
  const wanted=new Set(ids),done=new Set(),visiting=new Set();
  const types=new Set(ws.relationTypes.filter(t=>t.containment).map(t=>t.id));
  const parents=new Map(ws.relations.filter(r=>types.has(r.type)&&!r.udMembership).map(r=>[r.to,r.from]));
  const put=id=>{
    if(done.has(id))return true;if(visiting.has(id))return false;visiting.add(id);
    const parentId=parents.get(id)||ws.rootId;
    if(parentId!==ws.rootId&&wanted.has(parentId)&&!put(parentId))return false;
    if(board.items.some(p=>p.entityId===id)){visiting.delete(id);done.add(id);return true}
    if(parentId===ws.rootId){if(!udPlaceAtContext(id,board,null,udSharedDefaultPoint(board,null),true))return false}
    else{
      const parents=board.items.filter(p=>p.entityId===parentId);
      for(const parent of parents){
        if(!parent.childrenReady&&!wanted.has(parentId))continue;
        if(!udPlaceAtContext(id,board,parent.id,udSharedDefaultPoint(board,parent.id),true)&&!parent.excludedMembers?.includes(id))return false;
        if(wanted.has(parentId))parent.childrenReady=true;
      }
    }
    visiting.delete(id);done.add(id);return true;
  };
  for(const id of wanted)if(id!==ws.rootId&&!put(id))return false;
  return true;
}
function udSharedPrepareContext(context){
  if(!context||worldReadOnly())return true;
  const board=udSharedBoard(),paper=board?.items.find(p=>p.id===context.paperId);
  if(!paper)return false;
  if(paper.childrenReady)return true;
  return udCommitPlacementChange(live=>{
    const items=new Map(live.items.map(p=>[p.id,p])),parent=items.get(context.paperId),ancestors=new Set();
    if(!parent)return false;
    for(let p=parent;p&&!ancestors.has(p.entityId);p=items.get(p.parentId))ancestors.add(p.entityId);
    return udInitializePaperChildren(live,parent,ancestors,udPlacementChildren(live.items),BOARD_LIMIT-1)&&udPaperViewFits(live,context);
  });
}

function udPlacementChildren(items){
  const children=new Map();
  for(const item of items){
    if(!children.has(item.parentId))children.set(item.parentId,[]);
    children.get(item.parentId).push(item);
  }
  return children;
}

// Negative membership is local to one occurrence. Keep owner tombstones while
// an entity is in trash; projections may retain only explicitly public members.
function udPaperExclusions(values,entityIds){
  return [...new Set((Array.isArray(values)?values:[]).filter(id=>typeof id==='string'&&id.length>0&&id.length<=180&&(!entityIds||entityIds.has(id))))].slice(0,10000);
}
function udNormalizePlacements(raw,entityIds,relations,options={}){
  if(raw?.schema!==UD_PLACEMENT_SCHEMA)return null;
  const items=new Map();
  for(const r of Array.isArray(raw.items)?raw.items:[]){
    if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,180}$/.test(r.id)||items.has(r.id)||
      !entityIds.has(r.entityId)||!udCoordinate(r.x)||!udCoordinate(r.y)||(r.parentId!==null&&typeof r.parentId!=='string'))continue;
    const item={id:r.id,entityId:r.entityId,parentId:r.parentId,x:r.x,y:r.y};
    if(Number.isFinite(r.w)&&r.w>=110&&r.w<=640)item.w=r.w;
    if(Number.isFinite(r.h)&&r.h>=50&&r.h<=800)item.h=r.h;
    if(r.locked===true&&item.w!=null&&item.h!=null)item.locked=true;
    if(r.autoHeight===true&&item.locked)item.autoHeight=true;
    if(r.open==='one'||r.open==='all')item.open=r.open;
    if(r.childrenReady===true)item.childrenReady=true;
    if(r.adoptedLayout===true&&item.childrenReady)item.adoptedLayout=true;
    if(r.detached===true)item.detached=true;
    const excluded=udPaperExclusions(r.excludedMembers,options.projected?entityIds:null);
    if(excluded.length)item.excludedMembers=excluded;
    items.set(item.id,item);
  }
  const children=udPlacementChildren(items.values()),queue=[...(children.get(null)||[])],reachable=new Set();
  for(let i=0;i<queue.length;i++){
    const item=queue[i];
    if(reachable.has(item.id))continue;
    reachable.add(item.id);
    for(const child of children.get(item.id)||[])queue.push(child);
  }
  const exclusions=(values,parentId)=>udPaperExclusions(values,options.projected?entityIds:null)
    .filter(id=>!(children.get(parentId)||[]).some(p=>reachable.has(p.id)&&p.entityId===id));
  for(const item of items.values())if(item.excludedMembers){
    item.excludedMembers=exclusions(item.excludedMembers,item.id);
    if(!item.excludedMembers.length)delete item.excludedMembers;
  }
  const excludedRoots=exclusions(raw.excludedRoots,null);
  const routes=[],contexts=new Set();
  for(const route of Array.isArray(raw.routes)?raw.routes:[]){
    const r=route&&relations.get(route.relationId);
    if(!r||r.from===r.to||!entityIds.has(r.from)||!entityIds.has(r.to))continue;
    const contextual=udIsContextThread(route);
    let fromParent,toParent,entry;
    if(contextual){
      ({fromParent,toParent}=route);
      if(fromParent===toParent||[fromParent,toParent].some(id=>id!==null&&!reachable.has(id)))continue;
      entry={relationId:r.id,fromParent,toParent};
    }else{
      if(!reachable.has(route.from)||!reachable.has(route.to))continue;
      const a=items.get(route.from),b=items.get(route.to);
      if(r.from!==a.entityId||r.to!==b.entityId)continue;
      fromParent=a.parentId;
      toParent=b.parentId;
      entry={relationId:r.id,from:a.id,to:b.id};
    }
    const key=JSON.stringify([r.id,fromParent,toParent,contextual]);
    if(contexts.has(key))continue;
    contexts.add(key);routes.push(entry);
  }
  return {schema:UD_PLACEMENT_SCHEMA,items:[...items.values()].filter(item=>reachable.has(item.id)),routes,...(excludedRoots.length?{excludedRoots}:{})};
}

function udMergePlacements(local,incoming,entities,relations){
  if(incoming?.schema!==UD_PLACEMENT_SCHEMA)return local;
  const items=new Map((local?.items||[]).map(p=>[p.id,p]));
  const sourceIds=new Set(incoming.items.map(p=>p.id));
  const ids=new Map(),children=udPlacementChildren(incoming.items),queue=[...(children.get(null)||[])];
  for(let i=0;i<queue.length;i++){
    const p=queue[i],entityId=entities.get(p.entityId);
    if(!entityId)continue;
    const parentId=p.parentId===null?null:ids.get(p.parentId);
    let id=p.id,suffix=0;
    const conflicts=id=>items.has(id)&&(items.get(id).entityId!==entityId||items.get(id).parentId!==parentId);
    if(conflicts(id))do{id=p.id.slice(0,150)+'-import-'+(++suffix)}while(sourceIds.has(id)||conflicts(id));
    if(!items.has(id)){
      const mapped={...p,id,entityId,parentId};
      if(p.excludedMembers)mapped.excludedMembers=udPaperExclusions(p.excludedMembers).map(id=>entities.get(id)).filter(Boolean);
      items.set(id,mapped);
    }
    ids.set(p.id,id);
    for(const child of children.get(p.id)||[])queue.push(child);
  }
  const routes=[...(local?.routes||[])];
  for(const r of incoming.routes){
    const relationId=relations.get(r.relationId);
    if(!relationId)continue;
    const [from,to]=udThreadRoutePapers(r).map(id=>id===null?null:ids.get(id));
    if(udIsContextThread(r)){
      if(from!==undefined&&to!==undefined)routes.push({relationId,fromParent:from,toParent:to});
    }else if(from&&to)routes.push({relationId,from,to});
  }
  const excludedRoots=udPaperExclusions([...(local?.excludedRoots||[]),...udPaperExclusions(incoming.excludedRoots).map(id=>entities.get(id)).filter(Boolean)]);
  return {schema:UD_PLACEMENT_SCHEMA,items:[...items.values()],routes,...(excludedRoots.length?{excludedRoots}:{})};
}

function udPlacementsFromLegacy(layout,board,scope,nextId){
  const ids=new Map(layout.nodes.filter(e=>e.id!==scope&&layout.positions.has(e.id)).map(e=>[e.id,nextId()]));
  const items=[];
  for(const [entityId,id] of ids){
    const p=layout.positions.get(entityId),v=layout.via.get(entityId);
    const parentId=v?.related?null:ids.get(v?.parent)||null;
    const origin=parentId?layout.positions.get(v.parent):null;
    const item={id,entityId,parentId,x:p.x-(origin?.x??0),y:p.y-(origin?.y??0)};
    for(const dim of ['w','h'])if(p[dim]!=null)item[dim]=p[dim];
    if(p.fixed)item.locked=true;
    const mode=layout.expanded?.get(entityId)||board.open[entityId];
    if(mode)item.open=mode;
    if(layout.expanded?.has(entityId))item.childrenReady=true;
    items.push(item);
  }
  return {schema:UD_PLACEMENT_SCHEMA,items,routes:[]};
}

const udPlayerBoardMigrations=new WeakMap();
function udMigrateLegacyBoard(scope,board,ws,{adoptLayouts=false}={}){
  const raw=udPlacementsFromLegacy(boardLayout({forMigration:true,scope}),board,scope,()=>uid('paper'));
  // For the current board keep only connections actually drawn by the old view.
  // For a transfer destination use the open branches of that board.
  const visibleRelations=scope===boardKey()?boardLayout().relations:activeRelations([
    getEntity(scope),...[...udVisiblePlacements(raw,p=>visibleByFilters(getEntity(p.entityId))).values()]
      .map(({item})=>getEntity(item.entityId))
  ]);
  const parents=new Map([[scope,null],...raw.items.map(p=>[p.entityId,p.parentId])]);
  for(const r of visibleRelations){
    if(getRT(r.type).containment||!parents.has(r.from)||!parents.has(r.to))continue;
    const fromParent=parents.get(r.from),toParent=parents.get(r.to);
    if(fromParent!==toParent)raw.routes.push({relationId:r.id,fromParent,toParent});
  }
  if(adoptLayouts){
    const children=udPlacementChildren(raw.items);
    for(const paper of children.get(null)||[]){
      if(!paper.open||containmentParent(paper.entityId)!==scope)continue;
      const source=ws.boards?.[paper.entityId]?.placements;
      if(source&&!udAdoptContainerLayout(raw,paper,source,children,{legacy:true}))return null;
    }
  }
  const ids=new Set(ws.entities.map(e=>e.id)),relations=new Map(ws.relations.map(r=>[r.id,r]));
  const placements=udNormalizePlacements(raw,ids,relations);
  if(placements.items.length!==raw.items.length)return null;
  if(window.UG_ONLINE_PLAYER)udPlayerBoardMigrations.set(placements,clone(placements));
  return placements;
}

// An old surrounding board can already be open when a save is restored.
// Convert only when an opened primary container has a saved board of its own.
function udPrepareOpenContainerLayouts(){
  if(udUsesSharedLayout())return true;
  if(state.visualMode!=='detective'||uiIsPlayer()||worldReadOnly()||persistenceLocked||udPlacementsAreShared())return true;
  const scope=boardKey(),ws=currentWorkspace(),legacy=ws?.boards?.[scope];
  if(!legacy||legacy.placements||!Object.keys(legacy.open||{}).some(id=>
    containmentParent(id)===scope&&ws.boards[id]?.placements))return true;
  const placements=udMigrateLegacyBoard(scope,legacy,ws,{adoptLayouts:true});
  if(!placements||!udPaperViewFits(placements,null))return false;
  legacy.placements=placements;
  return true;
}

function udPlacementsAreShared(){
  return typeof onh!=='undefined'&&onh.open&&onh.wsId===currentWorkspace()?.id&&
    [...onh.conns.values()].some(c=>c.state==='in'&&c.papers!==1);
}

function udWorkspaceHasPlacements(ws){
  return Object.values(ws?.boards||{}).some(b=>b?.placements?.schema===UD_PLACEMENT_SCHEMA)||
    (ws?.relations||[]).some(r=>r.udMembership===true);
}

function udBoardUsesPlacements(){
  return !!getEntity(boardKey())&&boardState().placements?.schema===UD_PLACEMENT_SCHEMA;
}

function udCommitPlacementChange(change,message,afterSave){
  if(worldReadOnly()||persistenceLocked||udPlacementsAreShared())return false;
  return boardCommit(()=>{
    const scope=boardKey(),ws=currentWorkspace(),old=boardState(scope);
    if(!ws||!getEntity(scope))return false;
    let placements=old.placements;
    if(!placements){
      placements=udMigrateLegacyBoard(scope,old,ws);
      if(!placements)return false;
      boardState(scope,true).placements=placements;
    }
    if(placements.schema!==UD_PLACEMENT_SCHEMA)return false;
    const context=udContainerContext();
    const count=()=>udVisiblePlacements(placements,p=>visibleByFilters(getEntity(p.entityId)),undefined,{limit:BOARD_LIMIT}).size;
    const before=context?count():0;
    const innerFit=udUsesSharedLayout(ws)&&udPaperViewFits(placements,context);
    if(change(placements)===false)return false;
    if(innerFit&&!udPaperViewFits(placements,context)){
      toast('Лимит доски. Сверните контейнер перед добавлением бумажек.','err');return false;
    }
    if(context&&before<BOARD_LIMIT&&count()>=BOARD_LIMIT){
      toast('Лимит внешней доски. Сверните контейнер перед добавлением бумажек.','err');return false;
    }

  },message,afterSave);
}

function udVisiblePlacements(board,visible,isOpen=p=>p.open,{extraChildren,limit=Infinity,rootPaper=null}={}){
  const children=udPlacementChildren(board.items),shown=new Map(),queue=[];
  function enqueue(items,x,y){
    for(const item of items)queue.push({item,x:x+item.x,y:y+item.y});
  }
  let originX=0,originY=0;
  if(rootPaper){
    const byId=new Map(board.items.map(p=>[p.id,p])),seen=new Set([rootPaper.id]);
    for(let parent=byId.get(rootPaper.parentId);parent&&!seen.has(parent.id);parent=byId.get(parent.parentId)){
      seen.add(parent.id);originX+=parent.x;originY+=parent.y;
    }
  }
  enqueue(rootPaper?[rootPaper]:children.get(null)||[],originX,originY);
  for(let i=0;i<queue.length&&shown.size<limit;i++){
    const {item,x,y}=queue[i];
    if(shown.has(item.id)||item.detached&&item.id!==rootPaper?.id||!visible(item))continue;
    shown.set(item.id,{item,x,y});
    const mode=isOpen(item);
    if(mode){
      const placed=children.get(item.id)||[];
      enqueue(placed,x,y);
      if(extraChildren)enqueue(extraChildren(item,placed,mode,limit-shown.size),x,y);
    }
  }
  return shown;
}

// Ephemeral view cache: never exported, never shared between board objects.
const udAutomaticThreadChoices=new WeakMap();
function udExternalPaperPreviews(root,keys,visibleEntities,room){
  if(!state.showExternal||room<=0)return [];
  const local=new Set(scopeMembers(root.id).map(e=>e.id));
  const sources=new Set([root.id]);
  for(const paper of keys.values()){
    if(paper.parentId===null)sources.add(paper.entityId);
  }
  const previews=new Map();
  for(const relation of data.relations){
    if(!relationPassesFilter(relation))continue;
    const entityId=sources.has(relation.from)?relation.to:sources.has(relation.to)?relation.from:null;
    if(!entityId||local.has(entityId)||visibleEntities.has(entityId)||previews.has(entityId))continue;
    const entity=getEntity(entityId);
    if(!entity||entity.hint===true||!visibleByFilters(entity))continue;
    previews.set(entityId,{id:':ext:'+entityId,entityId,parentId:null});
    if(previews.size===room)break;
  }
  return [...previews.values()];
}

function udBoardRootPoint(root){
  return boardPlace(root,root.id)??{x:(Number(root.style?.x)||0)*1.2,y:(Number(root.style?.y)||0)*1.15};
}

function udPlacementLayout(root,board,drag=null){
  const context=udContainerContext(root.id),rootPaper=context&&board.items.find(p=>p.id===context.paperId);
  const nodes=rootPaper?[]:[root],positions=new Map(),keys=new Map(),via=new Map();
  const size=boardSize(root),fixed=boardFixed(root);
  if(!rootPaper)positions.set(root.id,{...udBoardRootPoint(root),
    kind:'case',w:fixed?.lock.w??size?.w,h:fixed?.lock.h??size?.h,fixed});
  const selectedReveal=state.udPaperReveal&&state.udPaperReveal.scope===boardKey()&&state.udPaperReveal?.workspace===currentWorkspace()?.id&&
    state.udPaperReveal?.id===udSelectedPaperId()?state.udPaperReveal.id:null;
  const reveal=new Set(),byId=new Map(board.items.map(p=>[p.id,p]));
  for(let p=byId.get(byId.get(selectedReveal)?.parentId);p&&!reveal.has(p.id);p=byId.get(p.parentId))reveal.add(p.id);
  const player=typeof uiIsPlayer!=='undefined'&&uiIsPlayer();
  let generated=0;
  const shown=udVisiblePlacements(board,p=>{const e=getEntity(p.entityId);return !!e&&visibleByFilters(e)},
    p=>p.id===rootPaper?.id?'one':(player?udPaperPlayerOpen(boardKey(),p):p.open)||(reveal.has(p.id)?'one':false),
    {rootPaper,limit:player?BOARD_LIMIT-(rootPaper?0:1):Infinity,...(player?{extraChildren(item,placed,mode,room){
      const extra=udPlayerPaperChildren(item,placed,mode,Math.min(room,BOARD_LIMIT-1-generated),byId);
      generated+=extra.length;
      for(const child of extra)byId.set(child.id,child);
      return extra;
    }}:{})});
  const entityIds=new Set([root.id]);
  const movingByContext=new Map(),previewStarts=new Map();
  const movingRoot=shown.get(drag?.id)?.item;
  const preview=drag?.delta&&movingRoot&&!movingRoot.locked?drag.delta:null;
  for(const [id,{item,x,y}] of shown){
    if(nodes.length>=BOARD_LIMIT)break;
    const e=getEntity(item.entityId);
    nodes.push(e);entityIds.add(e.id);keys.set(id,item);
    const moves=preview&&(id===drag.id||previewStarts.has(item.parentId));
    const position={x,y,w:item.w,h:item.h,kind:id===rootPaper?.id?'case':boardCardKind(e,root.id),fixed:!!item.locked};
    if(moves){
      previewStarts.set(id,{...position});
      position.x+=preview.x;position.y+=preview.y;
      if(!movingByContext.has(item.parentId))movingByContext.set(item.parentId,new Set());
      movingByContext.get(item.parentId).add(item.entityId);
    }
    positions.set(id,position);
  }
  if(typeof udDragPreviews!=='undefined')for(const remote of udDragPreviews.values()){
    if(remote.scope!==boardKey()||!keys.has(remote.paper)||remote.expires<=performance.now())continue;
    const ids=udPaperSubtree(board,remote.paper);
    for(const id of ids){
      const item=keys.get(id);
      if(!item)continue;
      if(!movingByContext.has(item.parentId))movingByContext.set(item.parentId,new Set());
      movingByContext.get(item.parentId).add(item.entityId);
    }
  }
  // Related previews fill spare slots after real papers. Their IDs never enter saves.
  const external=new Map();
  const previews=udExternalPaperPreviews(root,keys,entityIds,BOARD_LIMIT-nodes.length);
  if(previews.length){
    let right=-Infinity,top=Infinity;
    for(const [id,p] of positions){
      const stable=previewStarts.get(id)||p;
      right=Math.max(right,stable.x+(stable.w??BOARD_CARD_W[stable.kind])/2);
      top=Math.min(top,stable.y);
    }
    for(const [index,paper] of previews.entries()){
      const e=getEntity(paper.entityId);
      external.set(paper.id,e);
      nodes.push(e);
      entityIds.add(e.id);
      positions.set(paper.id,{x:right+200+Math.floor(index/8)*250,y:top+index%8*320,
        kind:boardCardKind(e,root.id),external:true});
    }
  }
  const relations=[];
  const previousChoices=udAutomaticThreadChoices.get(board)||new Map(),nextChoices=new Map();
  const placed=player?[...byId.values()]:board.items;
  const routing=udIndexThreadBoard(previews.length?placed.concat(previews):placed,positions,board.routes,root.id);
  for(const r of data.relations){
    if(!entityIds.has(r.from)||!entityIds.has(r.to)||!relationShown(r))continue;
    const containment=getRT(r.type).containment;
    if(!containment&&state.showRelations===false)continue;
    if(containment&&(state.boardContain===false||(nodes.length>=BOARD_BIG&&r.from===root.id)))continue;
    const next=new Map();
    const pairs=udThreadPairsFromIndex(r,routing,containment,previousChoices.get(r.id),next,movingByContext);
    if(next.size)nextChoices.set(r.id,next);
    for(const pair of pairs){
      if(containment&&(external.has(pair.from)||external.has(pair.to)))continue;
      relations.push({...r,entityFrom:r.from,entityTo:r.to,...pair});
    }
  }
  udAutomaticThreadChoices.set(board,nextChoices);
  return {nodes,positions,keys,via,relations,previewStarts,external};
}

function udSelectedPaperId(){
  const selected=state.udSelectedPaper;
  return selected?.scope===boardKey()&&selected.workspace===currentWorkspace()?.id&&selected.entityId===state.selectedId?selected.id:null;
}

function udSelectPaper(entityId,id){
  setSelected(entityId,false,{scope:boardKey(),workspace:currentWorkspace()?.id,entityId,id});
}

function udDuplicatePaper(entityId,paperId){
  const e=getEntity(entityId);
  if(!e||e.hint||entityId===state.scopeId||worldReadOnly()||persistenceLocked||udPlacementsAreShared())return false;
  const checkRoom=()=>{
    const layout=boardLayout();
    if(layout.nodes.length-(layout.external?.size||0)<BOARD_LIMIT)return true;
    toast('Лимит доски достигнут. Сверните контейнер или снимите бумажку, чтобы добавить дубликат.','err');
    return false;
  };
  if(!checkRoom())return false;
  const migrating=!udBoardUsesPlacements();
  if(migrating&&!createSafetyBackup('before-paper-placements'))return false;
  const id=uid('paper');
  const ok=udCommitPlacementChange(board=>{
    if(migrating&&!checkRoom())return false;
    const p=board.items.find(p=>paperId?p.id===paperId:p.entityId===entityId);
    if(!p||p.entityId!==entityId)return false;
    const occupied=new Set(board.items.filter(item=>item.parentId===p.parentId).map(item=>item.x+'|'+item.y));
    let shift=44;
    while(occupied.has((p.x+shift)+'|'+(p.y+shift)))shift+=44;
    if(!udCoordinate(p.x+shift)||!udCoordinate(p.y+shift))return false;
    board.items.push({id,entityId,parentId:p.parentId,x:p.x+shift,y:p.y+shift,w:p.w,h:p.autoHeight?undefined:p.h});
    if(udUsesSharedLayout()){
      const copy=board.items.at(-1),children=udPlacementChildren(board.items),ids=new Map([[p.id,id]]),queue=[p];
      if(p.childrenReady)copy.childrenReady=true;
      if(p.excludedMembers)copy.excludedMembers=[...p.excludedMembers];
      for(let i=0;i<queue.length;i++)for(const child of children.get(queue[i].id)||[]){
        const newId=uid('paper');ids.set(child.id,newId);queue.push(child);
        board.items.push({...clone(child),id:newId,parentId:ids.get(child.parentId)});
      }
      for(const route of board.routes.slice())if(udThreadRoutePapers(route).every(key=>ids.has(key))){
        const copied={...route};for(const key of ['from','to','fromParent','toParent'])if(ids.has(copied[key]))copied[key]=ids.get(copied[key]);board.routes.push(copied);
      }
    }
  },'Создана отдельная бумажка той же сущности');
  if(ok)udSelectPaper(entityId,id);
  return ok;
}

function udPaperParentValidator(board,id){
  const items=new Map(board.items.map(p=>[p.id,p]));
  const subtree=udPaperSubtree(board,id);
  const entities=new Set([...subtree].map(paperId=>items.get(paperId)?.entityId));
  return parentId=>{
    const visited=new Set();
    for(let p=items.get(parentId);p;p=items.get(p.parentId)){
      if(visited.has(p.id)||subtree.has(p.id)||entities.has(p.entityId))return false;
      visited.add(p.id);
    }
    return true;
  };
}

function udPaperNestAllowed(id,parentId,allowSameParent=false){
  if(worldReadOnly()||persistenceLocked||udPlacementsAreShared())return false;
  const board=boardState().placements,p=board?.items.find(p=>p.id===id),parent=board?.items.find(p=>p.id===parentId);
  return !!(p&&parent&&!p.locked&&(allowSameParent||p.parentId!==parentId)&&
    p.entityId!==currentRootId()&&udPaperParentValidator(board,id)(parentId)&&
    !wouldCreateContainmentCycle(parent.entityId,p.entityId));
}

function udNestPaperPosition(board,paper,parentId){
  const y=238;
  const width=p=>p.w??BOARD_CARD_W[boardCardKind(getEntity(p.entityId),boardKey())];
  const height=p=>p.h??BOARD_CARD_H;
  const half=width(paper)/2;
  const occupied=board.items.filter(p=>p.parentId===parentId&&p.y<y+height(paper)+24&&p.y+height(p)+24>y)
    .map(p=>[p.x-width(p)/2,p.x+width(p)/2]);
  // A free slot among siblings can still cover another visible container.
  // In particular, default root cards are stacked 240px apart, so a child
  // dropped 238px below the first card used to land on top of the second.
  const context=udContainerContext(),rootPaper=context&&board.items.find(p=>p.id===context.paperId);
  const shown=udVisiblePlacements(board,()=>true,p=>p.id===rootPaper?.id?'one':p.open,{rootPaper});
  const origin=shown.get(parentId),moving=udPaperSubtree(board,paper.id);
  if(origin)for(const {item:p,x,y:py} of shown.values()){
    if(moving.has(p.id)||p.id===parentId||p.parentId===parentId)continue;
    const localY=py-origin.y,localX=x-origin.x;
    if(localY<y+height(paper)+24&&localY+height(p)+24>y)occupied.push([localX-width(p)/2,localX+width(p)/2]);
  }
  occupied.sort((a,b)=>a[0]-b[0]);
  let x=0;
  for(const [left,right] of occupied){
    if(x+half+24<=left)break;
    if(x-half-24<right)x=Math.ceil(right+half+24);
  }
  return {x,y};
}

function udPlacementOffset(point,origin,{round=false}={}){
  if(!point||!origin)return null;
  const dx=point.x-origin.x,dy=point.y-origin.y;
  const x=round?Math.round(dx):dx,y=round?Math.round(dy):dy;
  return udCoordinate(x)&&udCoordinate(y)?{x,y}:null;
}

function udNestPaper(id,parentId,{keepPosition=false,configureRelation}={}){
  if(!udPaperNestAllowed(id,parentId,true))return false;
  return udCommitPlacementChange(board=>{
    if(!udPaperNestAllowed(id,parentId,true))return false;
    const paper=board.items.find(p=>p.id===id),parent=board.items.find(p=>p.id===parentId);
    const oldParentId=paper.parentId,scope=boardKey();
    if(paper.parentId!==parentId){
      let point;
      if(keepPosition){
        const {positions}=boardLayout();
        point=udPlacementOffset(positions.get(id),positions.get(parentId));
        if(!point){toast('Не удалось сохранить положение бумажки в этом контейнере','err');return false}
      }else point=udNestPaperPosition(board,paper,parentId);
      if(!udCoordinate(point.x))return false;
      // Move this instance before membership materializes children: no extra copy in this parent.
      Object.assign(paper,{parentId,...point});
      if(!udUsesSharedLayout())board.routes=board.routes.filter(r=>r.from!==id&&r.to!==id);
    }
    const relation=udSyncMovedPaperMembership(paper,board,oldParentId,scope,board,scope);
    if(!relation)return false;
    if(configureRelation)configureRelation(relation);
    const entity=getEntity(parent.entityId);entity.style=entity.style||{};entity.style.space=true;
    const items=new Map(board.items.map(p=>[p.id,p])),ancestors=new Set();
    for(let p=parent;p&&!ancestors.has(p.entityId);p=items.get(p.parentId))ancestors.add(p.entityId);
    if(!udInitializePaperChildren(board,parent,ancestors,udPlacementChildren(board.items),BOARD_LIMIT-1))return false;
    parent.open=parent.open||'one';
    if(!udPaperViewFits(board))return false;
  },'Бумажка помещена внутрь · Ctrl+Z — отменить');
}

function udMovePaper(id,x,y){
  if(uiIsPlayer())return udSubmitPaperOp(id,{x:Math.round(x),y:Math.round(y)});
  const lease=typeof udPaperLeases!=='undefined'&&udPaperLeases.get(JSON.stringify([boardKey(),id]));
  if(lease&&lease.actor!=='gm'&&lease.expires>performance.now()){
    toast('Бумажку уже двигает другой участник','err');return false;
  }
  return udCommitPlacementChange(board=>{
    const p=board.items.find(p=>p.id===id);
    if(!p||p.locked||!udCoordinate(x)||!udCoordinate(y))return false;
    p.x=Math.round(x);p.y=Math.round(y);
  },undefined,before=>boardRefreshSavedPositions(before,id));
}

function udResizePaper(id,size,dx=0){
  return udCommitPlacementChange(board=>{
    const p=board.items.find(p=>p.id===id);
    if(!p||p.locked||!udCoordinate(p.x+dx)||(size&&(!Number.isFinite(size.w)||!Number.isFinite(size.h))))return false;
    p.x=Math.round(p.x+dx);
    if(size){
      p.w=Math.round(clamp(size.w,BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w));
      p.h=Math.round(clamp(size.h,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h));
    }else{delete p.w;delete p.h}
  });
}

function udTogglePaperLock(id,card){
  if(uiIsPlayer()){
    const p=boardState().placements?.items.find(p=>p.id===id);
    if(!p)return false;
    return udSubmitPaperOp(id,p.locked?{locked:false,h:p.autoHeight?null:p.h??null,autoHeight:false}:{
      locked:true,
      w:p.w??Math.round(clamp(card.offsetWidth,BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w)),
      h:p.h??Math.round(clamp(card.offsetHeight,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h)),
      autoHeight:p.h==null
    });
  }
  return udCommitPlacementChange(board=>{
    const p=board.items.find(p=>p.id===id);
    if(!p)return false;
    if(p.locked){
      delete p.locked;
      if(p.autoHeight)delete p.h;
      delete p.autoHeight;
    }else{
      if(p.h==null){
        const pos=boardLayout().positions.get(id),e=getEntity(p.entityId);
        const height=pos&&e?boardCompactPhotoHeight(card,e,pos,null):card.offsetHeight;
        p.h=Math.round(clamp(height,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h));p.autoHeight=true;
      }
      p.w??=Math.round(clamp(card.offsetWidth,BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w));
      p.locked=true;
    }
  });
}

function udCanRemovePaper(entityId,paperId){
  if(state.visualMode!=='detective'||worldReadOnly()||persistenceLocked||udPlacementsAreShared())return false;
  if(paperId)return paperId!==udContainerContext()?.paperId&&boardState().placements?.items.some(p=>p.id===paperId&&p.entityId===entityId)&&!getEntity(entityId)?.hint;
  return !udBoardUsesPlacements()&&entityId!==boardKey()&&!!getEntity(entityId)&&!getEntity(entityId).hint;
}

function udErasePaperBranch(board,id,permanent){
  const paper=board.items.find(p=>p.id===id);
  if(!paper||id===udContainerContext()?.paperId||getEntity(paper.entityId)?.hint)return false;
  // Taking a paper off the only layout retains its geometry for restoration.
  if(udUsesSharedLayout()&&!permanent){paper.detached=true;return true}
  const children=udPlacementChildren(board.items),removed=new Set([id]);
  for(const parent of removed)for(const child of children.get(parent)||[])removed.add(child.id);
  board.items=board.items.filter(p=>!removed.has(p.id));
  board.routes=board.routes.filter(r=>!udThreadRoutePapers(r).some(id=>removed.has(id)));
  const parent=paper.parentId===null?board:board.items.find(p=>p.id===paper.parentId);
  if(parent){
    const key=paper.parentId===null?'excludedRoots':'excludedMembers';
    const excluded=new Set(parent[key]||[]);
    if(permanent&&!board.items.some(p=>p.parentId===paper.parentId&&p.entityId===paper.entityId))excluded.add(paper.entityId);
    else excluded.delete(paper.entityId);
    if(excluded.size)parent[key]=[...excluded];else delete parent[key];
  }
  return true;
}

function udRemovePaper(id,permanent=false){
  if(id===udContainerContext()?.paperId)return false;
  const selected=udSelectedPaperId();
  const ok=udCommitPlacementChange(board=>udErasePaperBranch(board,id,permanent),permanent?
    'Удалена только эта бумажка с её вложенными бумажками · Ctrl+Z — отменить':
    'Бумажка снята. Состав контейнера сохранён; вернуть её можно через «Состав»');
  if(ok&&selected&&!boardState().placements.items.some(p=>p.id===selected&&!p.detached))clearSelection();
  return ok;
}

// A legacy board has one occurrence per entity. Resolve it only during the first
// migration; a stale legacy menu must never pick a duplicate on a migrated board.
function udRemoveLegacyPapers(entityIds,permanent=false){
  if(udBoardUsesPlacements())return false;
  const ids=new Set(entityIds.filter(id=>udCanRemovePaper(id,null)));
  if(!ids.size)return false;
  const ok=udCommitPlacementChange(board=>{
    const papers=board.items.filter(p=>ids.has(p.entityId));
    if(!papers.length)return false;
    for(const p of papers)if(board.items.some(item=>item.id===p.id))udErasePaperBranch(board,p.id,permanent);
  },permanent?'Удалена только эта бумажка · Ctrl+Z — отменить':'Бумажка снята с доски · Ctrl+Z — отменить');
  if(ok&&ids.has(state.selectedId))clearSelection();
  return ok;
}
function udRemoveAddressedPaper(entityId,paperId,scope,workspace,permanent=false){
  if(scope!==boardKey()||workspace!==currentWorkspace()?.id||!udCanRemovePaper(entityId,paperId))return false;
  return paperId?udRemovePaper(paperId,permanent):udRemoveLegacyPapers([entityId],permanent);
}

// Composition is semantic membership; removing a paper must not silently undo it.
// Recovery is an explicit placement action, never a render-time repair of an old save.
function udPaperMissingMembers(paper,board=boardState().placements,index=null){
  if(!paper||!board||worldReadOnly()||getEntity(paper.entityId)?.hint)return [];
  const members=containmentChildren(paper.entityId);
  if(!members.length)return [];
  const ancestors=new Set(),items=index?.byId||new Map(board.items.map(p=>[p.id,p]));
  for(let p=paper;p&&!ancestors.has(p.entityId);p=items.get(p.parentId))ancestors.add(p.entityId);
  const children=index?(index.children.get(paper.id)||[]):board.items.filter(p=>p.parentId===paper.id);
  const present=new Set(children.filter(p=>!p.detached).map(p=>p.entityId));
  return members.filter(id=>!ancestors.has(id)&&!present.has(id)&&!paper.excludedMembers?.includes(id)&&getEntity(id)&&!getEntity(id).hint);
}

function udRestorePaperMember(parentId,entityId){
  return udCommitPlacementChange(board=>{
    const parent=board.items.find(p=>p.id===parentId);
    if(parentId===null){
      if(!scopeMembers(boardKey()).some(e=>e.id===entityId&&!e.hint)||board.excludedRoots?.includes(entityId)||board.items.some(p=>p.parentId===null&&p.entityId===entityId&&!p.detached))return false;
    }else if(!parent||!udPaperMissingMembers(parent,board).includes(entityId))return false;
    const detached=board.items.find(p=>p.parentId===parentId&&p.entityId===entityId&&p.detached);
    if(detached&&udUsesSharedLayout()){
      delete detached.detached;if(parent)parent.open=parent.open||'one';return udPaperViewFits(board);
    }
    const paper={id:uid('paper'),entityId,parentId};
    const point=parent?udNestPaperPosition(board,paper,parentId):udSharedDefaultPoint(board,null);
    if(!udCoordinate(point.x))return false;
    board.items.push({...paper,...point});
    if(parent)parent.open=parent.open||'one';
    if(!udPaperViewFits(board)){
      toast('Лимит доски. Сверните другие контейнеры или войдите внутрь.','err');return false;
    }
  },'Бумажка возвращена на эту доску · Ctrl+Z — отменить');
}

// Inspect the storage, not the visible/filtered canvas. The structural root
// has no paper ID; its direct items have parentId=null.
function udCompositionRows(board,scope,parentId=null){
  const parent=parentId===null?null:board?.items.find(p=>p.id===parentId);
  if(parentId!==null&&!parent)return [];
  const container=parent?.entityId??scope;
  const members=new Set((parent?containmentChildren(container):scopeMembers(container).map(e=>e.id)).filter(id=>getEntity(id)&&!getEntity(id).hint));
  const exclusions=new Set(parent?parent.excludedMembers:board?.excludedRoots);
  const items=board?board.items.filter(p=>p.parentId===parentId&&getEntity(p.entityId)&&!getEntity(p.entityId).hint):[...new Set([...members,...boardState(scope).pins])].filter(id=>getEntity(id)&&!getEntity(id).hint).map(entityId=>({entityId,legacy:true}));
  const counts=new Map();for(const p of items)counts.set(p.entityId,(counts.get(p.entityId)||0)+1);
  const rows=items.map(p=>({entityId:p.entityId,paperId:p.id,legacy:!!p.legacy,detached:!!p.detached,locked:!!p.locked,
    member:members.has(p.entityId),copies:counts.get(p.entityId),missing:false}));
  for(const entityId of members)if(!counts.has(entityId)&&!exclusions.has(entityId))rows.push({entityId,missing:true,member:true,copies:0});
  return rows;
}
function udOpenPaperContents(id=null){
  const board=boardState().placements,scope=boardKey(),workspace=currentWorkspace()?.id,scene=boardCameraKey();
  const paper=id===null?null:board?.items.find(p=>p.id===id);
  if(id!==null&&(!paper||!boardLayout().keys?.has(id)))return false;
  const container=paper?.entityId??scope,entity=getEntity(container);
  if(!entity||entity.hint)return false;
  const editable=!worldReadOnly()&&!persistenceLocked&&!udPlacementsAreShared(),rows=udCompositionRows(board,scope,id);
  const valid=()=>scene===boardCameraKey()&&scope===boardKey()&&workspace===currentWorkspace()?.id&&(id===null||boardState().placements?.items.some(p=>p.id===id&&p.entityId===container));
  const labels=r=>[r.missing?'без бумажки':r.detached?'снята':'на доске',r.copies>1?`${r.copies} экземпляра`:null,!r.member?'дополнительная бумажка':null,r.locked?'закреплена':null].filter(Boolean).join(' · ');
  const choices=rows.map((r,i)=>{
    const name=getEntity(r.entityId).name;
    const restore=r.missing||r.detached;
    return `<div class="udCompositionRow" data-ud-composition-row="${i}"><div><b>${escapeHtml(name)}</b><small>${escapeHtml(labels(r))}</small></div><div class="udCompositionActions">${editable?(restore?`<button type="button" class="btn tiny" data-ud-paper-choice="${i}" title="Вернуть бумажку">${escapeHtml(name)} · вернуть</button>`:'')+(!restore&&!r.legacy?`<button type="button" class="btn tiny" data-ud-contents-remove="${i}">Снять</button>`:'')+(!r.missing?`<button type="button" class="btn tiny danger" data-ud-contents-delete="${i}">Удалить бумажку</button>`:''):''}</div></div>`;
  }).join('');
  openModal('Состав: '+entity.name,`<div class="form"><div class="inlineHelp">Позиций в составе: ${rows.length}. Здесь показаны и скрытые фильтрами бумажки. Удаление бумажки не удаляет сущность из мира; перенос в другой контейнер меняет её состав.</div><input id="udContentsSearch" placeholder="Найти бумажку…" autocomplete="off"><div id="udPaperChoices" class="boardPinList udCompositionList">${choices||'<div class="inlineHelp">Состав пуст.</div>'}</div></div>`,'<button type="button" class="btn" id="udClosePaperChoices">Закрыть</button>');
  $('#udClosePaperChoices').onclick=()=>closeModal();
  $('#udContentsSearch').oninput=e=>{const q=searchFold(e.target.value);for(const el of $('#udPaperChoices').querySelectorAll('[data-ud-composition-row]')){const r=rows[Number(el.dataset.udCompositionRow)];el.hidden=!!q&&!searchFold(getEntity(r.entityId)?.name||'').includes(q)}};
  $('#udPaperChoices').onclick=e=>{
    const button=e.target.closest('[data-ud-paper-choice],[data-ud-contents-remove],[data-ud-contents-delete]');if(!button||!editable||!valid())return;
    const r=rows[Number(button.dataset.udPaperChoice??button.dataset.udContentsRemove??button.dataset.udContentsDelete)];if(!r)return;
    const restore=button.hasAttribute('data-ud-paper-choice'),permanent=button.hasAttribute('data-ud-contents-delete');
    if(permanent&&!confirm(`Удалить только бумажку «${getEntity(r.entityId)?.name}» и её вложенные размещения? Сама сущность и её связи останутся в мире. Ctrl+Z — отменить.`))return;
    if(!closeModal())return;
    const ok=restore?(r.detached?udCommitPlacementChange(b=>{const p=b.items.find(p=>p.id===r.paperId&&p.parentId===id&&p.detached);if(!p)return false;delete p.detached;return udPaperViewFits(b)}):udRestorePaperMember(id,r.entityId)):
      r.legacy?udRemoveLegacyPapers([r.entityId],permanent):udRemoveAddressedPaper(r.entityId,r.paperId,scope,workspace,permanent);
    if(!ok)toast('Бумажка больше недоступна','err');
  };
  return true;
}

function udPlaceAtContext(entityId,board,parentId=null,point,automatic=false){
  const excluded=parentId===null?board.excludedRoots:board.items.find(p=>p.id===parentId)?.excludedMembers;
  if(automatic&&excluded?.includes(entityId))return null;
  const siblings=board.items.filter(p=>p.parentId===parentId);
  const existing=siblings.find(p=>p.entityId===entityId&&!p.detached)||siblings.find(p=>p.entityId===entityId);
  if(existing){if(existing.detached&&!automatic)delete existing.detached;return existing.id}
  const used=new Set(siblings.map(p=>p.x+'|'+p.y));
  let slot=0;
  const shared=typeof currentWorkspace==='function'&&udSharedBoard()===board;
  const position=()=>parentId===null?{x:0,y:slot*240+(shared?238:0)}:{x:slot*240,y:238};
  while(used.has(position().x+'|'+position().y))slot++;
  const p=udCoordinate(point?.x)&&udCoordinate(point?.y)?{x:Math.round(point.x),y:Math.round(point.y)}:position();
  const id=uid('paper');
  board.items.push({id,entityId,parentId,...p});
  return id;
}

// Adopt an authored standalone board once, under its primary occurrence.
// Root positions are relative to the case card in that standalone view.
function udAdoptContainerLayout(board,paper,source,children,{legacy=false,room=Infinity}={}){
  const sourceTree=udPlacementChildren(source.items);
  const origin=udBoardRootPoint(getEntity(paper.entityId));
  const previous=legacy?udPaperSubtree(board,paper.id):new Set([paper.id]);
  previous.delete(paper.id);
  if(source.items.length-previous.size>room)return false;
  const ids=new Map([[null,paper.id]]),copied=[],reused=new Set();
  const queue=[...(sourceTree.get(null)||[])];
  for(let i=0;i<queue.length;i++){
    const old=queue[i],parentId=ids.get(old.parentId);
    const point=old.parentId===null?udPlacementOffset(old,origin):old;
    if(!point)return false;
    // The legacy board had one occurrence per entity. Retain its ID only
    // when the entity and its parent path both match.
    const match=legacy&&children.get(parentId)?.find(p=>p.entityId===old.entityId&&!reused.has(p.id));
    const id=match?.id||uid('paper');
    if(match)reused.add(id);
    ids.set(old.id,id);
    const item={...old,id,parentId,x:point.x,y:point.y};
    if(old.excludedMembers)item.excludedMembers=[...old.excludedMembers];
    delete item.adoptedLayout;
    if(paper.open==='all'&&sourceTree.has(old.id))item.open='all';
    copied.push(item);
    for(const child of sourceTree.get(old.id)||[])queue.push(child);
  }
  const routes=source.routes.map(route=>{
    const [from,to]=udThreadRoutePapers(route).map(id=>ids.get(id));
    return udIsContextThread(route)?{relationId:route.relationId,fromParent:from,toParent:to}:
      {relationId:route.relationId,from,to};
  }).filter(route=>udThreadRoutePapers(route).every(id=>id!==undefined));
  for(const id of previous)children.delete(id);
  children.delete(paper.id);
  for(const item of copied){
    if(!children.has(item.parentId))children.set(item.parentId,[]);
    children.get(item.parentId).push(item);
  }
  if(previous.size)board.items=board.items.filter(p=>!previous.has(p.id));
  for(const item of copied)board.items.push(item);
  board.routes=[...routes,...board.routes.filter(route=>udThreadRoutePapers(route)
    .every(id=>!previous.has(id)||reused.has(id)))];
  if(source.excludedRoots?.length)paper.excludedMembers=[...source.excludedRoots];
  paper.childrenReady=true;
  paper.adoptedLayout=true;
  return true;
}

function udInitializePaperChildren(board,paper,ancestors,children,room=Infinity){
  if(paper.childrenReady)return true;
  const siblings=children.get(paper.id)||[];
  if(!udUsesSharedLayout()&&paper.parentId===null&&!siblings.length&&!paper.excludedMembers?.length&&containmentParent(paper.entityId)===boardKey()&&
    board.items.filter(p=>p.entityId===paper.entityId&&p.parentId===null).length===1){
    const source=currentWorkspace()?.boards?.[paper.entityId]?.placements;
    if(source&&source!==board)return udAdoptContainerLayout(board,paper,source,children,{room});
  }
  const present=new Set(siblings.map(p=>p.entityId));
  const missing=[];
  for(const entityId of containmentChildren(paper.entityId)){
    if(ancestors.has(entityId)||present.has(entityId)||paper.excludedMembers?.includes(entityId))continue;
    if(missing.length>=room)return false;
    missing.push(entityId);
    present.add(entityId);
  }
  const used=new Set(siblings.map(p=>p.x+'|'+p.y));
  let slot=0;
  for(const entityId of missing){
    while(used.has(slot*240+'|238'))slot++;
    const child={id:uid('paper'),entityId,parentId:paper.id,x:slot++*240,y:238};
    siblings.push(child);
    board.items.push(child);
  }
  if(siblings.length)children.set(paper.id,siblings);
  paper.childrenReady=true;
  return true;
}

function udPaperOpenKey(scope,id){
  return JSON.stringify([currentWorkspace()?.id,scope,id]);
}

function udPaperPlayerOpen(scope,paper){
  return state.udPaperOpen?.get(udPaperOpenKey(scope,paper.id))??paper.open;
}

function udVirtualPaperPrefix(paper){
  return (paper.virtual?paper.id:'~'+encodeURIComponent(paper.id))+'/';
}

// A player's unprepared branch is a view of their allowed entities and relations.
// These placements are regenerated from the current projection, never saved.
function udPlayerPaperChildren(parent,placed,mode,limit,known){
  if(limit<=0||parent.childrenReady||getEntity(parent.entityId)?.hint)return [];
  const ancestors=new Set();
  for(let paper=parent;paper&&!ancestors.has(paper.entityId);paper=known.get(paper.parentId)){
    ancestors.add(paper.entityId);
  }
  const entities=new Set(placed.map(p=>p.entityId));
  const positions=new Set(placed.map(p=>p.x+'|'+p.y));
  const children=[],prefix=udVirtualPaperPrefix(parent);
  let slot=0;
  for(const id of containmentChildren(parent.entityId)){
    const entity=getEntity(id);
    if(!entity||entity.hint===true||ancestors.has(id)||entities.has(id)||parent.excludedMembers?.includes(id)||!visibleByFilters(entity))continue;
    while(positions.has(slot*240+'|238'))slot++;
    children.push({id:prefix+encodeURIComponent(id),entityId:id,parentId:parent.id,x:slot++*240,y:238,
      virtual:true,open:mode==='all'?'all':undefined});
    if(children.length>=limit)break;
  }
  return children;
}
function udPaperRevealed(id){
  const r=state.udPaperReveal;
  if(!r||r.scope!==boardKey()||r.workspace!==currentWorkspace()?.id||r.id!==udSelectedPaperId())return false;
  const items=new Map((boardState().placements?.items||[]).map(p=>[p.id,p])),seen=new Set();
  for(let p=items.get(items.get(r.id)?.parentId);p&&!seen.has(p.id);p=items.get(p.parentId)){
    if(p.id===id)return true;seen.add(p.id);
  }
  return false;
}
function udExpandPaper(id,mode){
  if(!['close','one','all'].includes(mode))return false;
  if(uiIsPlayer()){
    const layout=boardLayout(),paper=layout.keys?.get(id);
    if(!paper)return false;
    const scope=boardKey(),board=boardState().placements;
    if(!board)return false;
    const opened=state.udPaperOpen??=new Map();
    const items=new Map(board.items.map(p=>[p.id,p]));
    for(const p of layout.keys.values())items.set(p.id,p);
    const ids=udPaperSubtree({items:items.values()},id);
    // The selected copy may only be visible because navigation opened its path.
    for(let ancestor=items.get(paper.parentId);ancestor;ancestor=items.get(ancestor.parentId)){
      if(!udPaperPlayerOpen(scope,ancestor))opened.set(udPaperOpenKey(scope,ancestor.id),'one');
    }
    const workspace=currentWorkspace()?.id;
    const virtualPrefixes=[...ids].map(paperId=>udVirtualPaperPrefix(items.get(paperId)));
    for(const key of opened.keys()){
      const [openWorkspace,openScope,paperId]=JSON.parse(key);
      if(openWorkspace!==workspace||openScope!==scope)continue;
      if(paperId.startsWith('~')&&virtualPrefixes.some(path=>paperId.startsWith(path)))opened.delete(key);
    }
    for(const paperId of ids){
      if(paperId!==id&&items.get(paperId).virtual)continue;
      const value=mode==='all'?'all':paperId===id&&mode==='one'?'one':false;
      opened.set(udPaperOpenKey(scope,paperId),value);
    }
    state.udPaperReveal=null;
    renderDetective();return true;
  }
  const overflow=()=>{
    toast('Лимит доски. Сверните другие контейнеры, откройте один уровень или войдите внутрь контейнера.','err');
    return false;
  };
  return udCommitPlacementChange(board=>{
    const items=new Map(board.items.map(p=>[p.id,p])),first=items.get(id);
    if(!first)return false;
    const children=udPlacementChildren(board.items);
    if(udPaperRevealed(first.parentId)){
      for(let p=items.get(first.parentId);p;p=items.get(p.parentId))p.open||='one';
    }
    state.udPaperReveal=null;
    if(mode!=='all')for(const childId of udPaperSubtree(board,id))delete items.get(childId).open;
    if(mode==='close')return;
    const ancestors=new Set();
    for(let p=items.get(first.parentId);p;p=items.get(p.parentId))ancestors.add(p.entityId);
    const queue=[{item:first,ancestors}];
    const initialCount=board.items.length;
    for(let i=0;i<queue.length;i++){
      const {item,ancestors}=queue[i];
      const branch=new Set([...ancestors,item.entityId]);
      const room=BOARD_LIMIT-1-(board.items.length-initialCount);
      // Older saves may contain a repeated entity in this branch. Keep its
      // stored children accessible, without generating new membership copies.
      if(!ancestors.has(item.entityId)&&!udInitializePaperChildren(board,item,branch,children,room))return overflow();
      item.open=mode;
      if(mode==='all')for(const p of children.get(item.id)||[]){
        if(children.has(p.id)||containmentChildren(p.entityId).length)queue.push({item:p,ancestors:branch});
      }
    }
    if(!udPaperViewFits(board))return overflow();
  });
}

function udAddMembership(parentId,childId,relationId,{placeCopies=true}={}){
  if(worldReadOnly()||persistenceLocked||udPlacementsAreShared())return null;
  if(!getEntity(parentId)||!getEntity(childId)||childId===currentRootId()||wouldCreateContainmentCycle(parentId,childId,relationId)){
    toast('Нельзя создать циклическую или корневую вложенность','err');return null;
  }
  const duplicate=data.relations.find(r=>r.id!==relationId&&r.from===parentId&&r.to===childId&&getRT(r.type).containment);
  if(duplicate)return relationId?null:duplicate;
  const old=data.relations.find(r=>r.id===relationId),r=old||{id:uid('relation'),properties:{},style:{}};
  const changed=!old||r.from!==parentId||r.to!==childId;
  Object.assign(r,{from:parentId,to:childId,type:ensureContainsType().id,udMembership:true});
  if(!old)data.relations.push(r);
  invalidateContainmentIndex();
  if(changed&&placeCopies)udAddMemberPlacements(parentId,childId);
  return r;
}

function udAddMemberPlacements(parentId,childId,ws=currentWorkspace()){
  for(const [scope,{placements:board}] of Object.entries(ws?.boards||{})){
    if(udUsesSharedLayout(ws)&&scope!==ws.rootId)continue;
    if(board?.schema!==UD_PLACEMENT_SCHEMA)continue;
    if(scope===parentId)udPlaceAtContext(childId,board,null,udUsesSharedLayout(ws)?udSharedDefaultPoint(board,null):undefined,true);
    for(const paper of board.items.slice()){
      if(paper.entityId===parentId&&paper.childrenReady)udPlaceAtContext(childId,board,paper.id,undefined,true);
    }
  }
}

function udLinkPapersAvailable(papers,fromEntity,toEntity){
  if(!udBoardUsesPlacements()||state.visualMode!=='detective'||papers.scope!==boardKey()||papers.workspace!==currentWorkspace()?.id||
    (papers.scene&&papers.scene!==boardCameraKey()))return false;
  const layout=boardLayout();
  return layout.keys?.get(papers.from)?.entityId===fromEntity&&layout.keys?.get(papers.to)?.entityId===toEntity;
}


function udResetThreadRoutes(relationId){
  if(!udBoardUsesPlacements()||!boardState().placements.routes.some(route=>route.relationId===relationId&&!udIsContextThread(route)))return false;
  return udCommitPlacementChange(board=>{
    board.routes=board.routes.filter(route=>route.relationId!==relationId||udIsContextThread(route));
  },'Автоматический выбор концов на этой доске включён');
}

function udPaperSubtree(board,id){
  const children=udPlacementChildren(board.items),ids=new Set([id]);
  for(const parent of ids)for(const child of children.get(parent)||[])ids.add(child.id);
  return ids;
}

function udPaperTransferTargets(entityId){
  const root=currentRootId(),scope=state.scopeId;
  return data.entities.filter(e=>e.id!==entityId&&e.id!==scope&&!e.hint&&
    (isSpace(e)||e.id===root)&&visibleByFilters(e));
}

function udTransferPaper(id,targetScope){
  const sourceScope=boardKey(),ws=currentWorkspace();
  const item=ws?.boards?.[sourceScope]?.placements?.items.find(p=>p.id===id);
  if(!item||item.locked||worldReadOnly()||persistenceLocked||udPlacementsAreShared()||
     !udPaperTransferTargets(item.entityId).some(e=>e.id===targetScope))return false;
  if(udUsesSharedLayout(ws)){
    const parent=targetScope===ws.rootId?null:udSharedFindPaper(targetScope);
    if(targetScope!==ws.rootId&&!parent){toast('У целевого контейнера нет бумажки в общей раскладке.','err');return false}
    const parentId=parent?.id??null;
    if(item.parentId===parentId)return false;
    const saved=udCommitPlacementChange(board=>{
      const paper=board.items.find(p=>p.id===id),target=parentId&&board.items.find(p=>p.id===parentId);
      if(!paper||paper.locked||parentId&&!target||!udPaperParentValidator(board,id)(parentId)||wouldCreateContainmentCycle(targetScope,paper.entityId))return false;
      const oldParentId=paper.parentId;
      const point=target?udNestPaperPosition(board,paper,parentId):{x:Math.ceil((board.items.filter(p=>p.parentId===null).reduce((max,p)=>Math.max(max,p.x+(p.w||270)/2),0)+300)/10)*10,y:180};
      if(!udCoordinate(point.x)||!udCoordinate(point.y))return false;
      Object.assign(paper,{parentId,...point});
      if(!udSyncMovedPaperMembership(paper,board,oldParentId,sourceScope,board,sourceScope))return false;
      if(target){
        const byId=new Map(board.items.map(p=>[p.id,p])),ancestors=new Set();
        for(let p=target;p&&!ancestors.has(p.entityId);p=byId.get(p.parentId))ancestors.add(p.entityId);
        if(!udInitializePaperChildren(board,target,ancestors,udPlacementChildren(board.items),BOARD_LIMIT-1))return false;
        target.open=target.open||'one';
      }
      return udPaperViewFits(board,target?{paperId:target.id}:null);
    },'Бумажка перенесена в общей раскладке · Ctrl+Z — отменить');
    if(saved)udGoToPaper(ws.rootId,item.entityId,id);
    return saved;
  }
  if(!ws.boards[targetScope]?.placements&&!createSafetyBackup('before-paper-transfer'))return false;
  const saved=udCommitPlacementChange(source=>{
    const ids=udPaperSubtree(source,id);
    const papers=source.items.filter(p=>ids.has(p.id));
    if(papers.some(p=>p.entityId===targetScope)||wouldCreateContainmentCycle(targetScope,item.entityId))return false;
    const target=boardState(targetScope,true);
    if(!target.placements){
      target.placements=udMigrateLegacyBoard(targetScope,target,ws);
      if(!target.placements)return false;
    }
    if(target.placements.schema!==UD_PLACEMENT_SCHEMA||target.placements.items.some(p=>ids.has(p.id)))return false;
    const roots=target.placements.items.filter(p=>p.parentId===null);
    const x=Math.ceil((roots.reduce((max,p)=>Math.max(max,p.x+(p.w||270)/2),0)+300)/10)*10;
    if(!udCoordinate(x))return false;
    target.placements.items.push(...papers.map(p=>p.id===id?{...p,parentId:null,x,y:180}:p));
    target.placements.routes.push(...source.routes.filter(r=>udThreadRoutePapers(r).every(id=>ids.has(id))));
    source.items=source.items.filter(p=>!ids.has(p.id));
    source.routes=source.routes.filter(r=>!udThreadRoutePapers(r).some(id=>ids.has(id)));
    const moved=target.placements.items.find(p=>p.id===id);
    if(!udSyncMovedPaperMembership(moved,source,item.parentId,sourceScope,target.placements,targetScope))return false;
  },'Бумажка перенесена · Ctrl+Z — отменить');
  if(saved)udGoToPaper(targetScope,item.entityId,id);
  return saved;
}

function udPaperChoices(entityId,except){
  const entity=getEntity(entityId),ws=currentWorkspace();
  if(!entity||entity.hint||!visibleByFilters(entity))return [];
  const choices=[];
  for(const [scope,boardState] of Object.entries((viewAsPlayer()?playerPaperBoards:ws?.boards)||{})){
    const board=boardState.placements,root=getEntity(scope);
    if(!root||root.hint||!board||!visibleByFilters(root,{keepHidden:scope===currentRootId()}))continue;
    const visible=udVisiblePlacements(board,p=>{
      const e=getEntity(p.entityId);
      return !!e&&!e.hint&&visibleByFilters(e);
    },()=>true);
    let i=1;
    for(const {item} of visible.values()){
      if(!udUsesSharedLayout(ws)&&i>=BOARD_LIMIT)break;
      if(item.entityId===entityId&&item.id!==except)choices.push({scope,id:item.id,label:root.name+' · место '+i});
      i++;
    }
  }
  return choices;
}

function udGoToPaper(scope,entityId,id){
  if(!udPaperChoices(entityId).some(p=>p.scope===scope&&p.id===id))return false;
  // This picker names a physical board and a paper, including an old standalone board.
  if((scope!==boardKey()||udUsesSharedLayout()&&state.scopeId!==scope&&!boardLayout().keys?.has(id))&&!setScope(scope,{context:null}))return false;
  state.udPaperReveal={scope,workspace:currentWorkspace()?.id,id};
  udSelectPaper(entityId,id);
  boardQueueCamera(()=>{
    if(boardKey()!==scope||udSelectedPaperId()!==id)return;
    const view=$('#detectiveView'),paper=view?.querySelector(`[data-ud-paper-id="${CSS.escape(id)}"]`);
    if(!paper)return;
    const r=paper.getBoundingClientRect(),v=view.getBoundingClientRect();
    state.boardPanX=(state.boardPanX||0)+v.left+v.width/2-r.left-r.width/2;
    state.boardPanY=(state.boardPanY||0)+v.top+v.height/2-r.top-r.height/2;
    applyBoardTransform();scheduleViewPersist();
    paper.focus({preventScroll:true});
  },{focus:true});
  return true;
}

function udPaperChoiceModal(title,choices,choose,help=''){
  if(!choices.length){toast('Нет доступных вариантов','ok');return}
  const rows=choices.map(({label},i)=>`<button type="button" class="listItem boardPinItem" data-ud-paper-choice="${i}">${escapeHtml(label)}</button>`).join('');
  openModal(title,`${help?`<p class="inlineHelp">${escapeHtml(help)}</p>`:''}<div id="udPaperChoices" class="boardPinList">${rows}</div>`,'<button type="button" id="udClosePaperChoices">Закрыть</button>');
  $('#udClosePaperChoices').onclick=()=>closeModal();
  $('#udPaperChoices').onclick=e=>{
    const button=e.target.closest('[data-ud-paper-choice]');
    if(!button)return;
    const choice=choices[Number(button.dataset.udPaperChoice)];
    if(choice&&closeModal()&&!choose(choice))toast('Этот вариант больше недоступен','err');
  };
  $('#udPaperChoices button')?.focus();
}

function udOpenPaperPicker(entityId,id){
  udPaperChoiceModal('Другие бумажки',udPaperChoices(entityId,id),p=>udGoToPaper(p.scope,entityId,p.id));
}

function udPaperLocalTargets(id){
  const layout=boardLayout(),source=layout.keys?.get(id);
  const board=boardState().placements;
  if(!source||!board||source.virtual||source.locked||source.id===udContainerContext()?.paperId)return [];
  const allows=udPaperParentValidator(board,id);
  const top=udContainerContext()?.paperId??null;
  const targets=[...layout.keys.values()].filter(p=>!p.virtual&&p.id!==top&&p.id!==source.parentId&&isSpace(getEntity(p.entityId))&&allows(p.id))
    .map(p=>({parentId:p.id,label:getEntity(p.entityId).name+' · на этой доске'}));
  if(source.id!==top&&source.parentId!==top)targets.unshift({parentId:top,label:'На верхний уровень этой доски'});
  return targets;
}

function udTransferPaperLocally(id,parentId){
  if(!udPaperLocalTargets(id).some(p=>p.parentId===parentId))return false;
  const layout=boardLayout(),old=layout.positions.get(id),base=layout.positions.get(parentId)||{x:0,y:0};
  const point=udPlacementOffset(old,base,{round:true});
  if(!point)return false;
  const saved=udCommitPlacementChange(board=>{
    const items=new Map(board.items.map(p=>[p.id,p])),paper=items.get(id),parent=items.get(parentId);
    if(!paper||paper.locked||parentId!==null&&!parent)return false;
    if(!udPaperParentValidator(board,id)(parentId)||wouldCreateContainmentCycle(parent?.entityId??boardKey(),paper.entityId))return false;
    const oldParentId=paper.parentId,scope=boardKey();
    Object.assign(paper,{parentId,...point});
    if(!udSyncMovedPaperMembership(paper,board,oldParentId,scope,board,scope))return false;
    if(parent){
      const ancestors=new Set();
      for(let p=parent;p;p=items.get(p.parentId))ancestors.add(p.entityId);
      if(!udInitializePaperChildren(board,parent,ancestors,udPlacementChildren(board.items),BOARD_LIMIT-1))return false;
      parent.open=parent.open||'one';
    }
    if(!udUsesSharedLayout())board.routes=board.routes.filter(r=>r.from!==id&&r.to!==id);
    if(!udPaperViewFits(board))return false;
  },'Бумажка перенесена · Ctrl+Z — отменить');
  return saved;
}

function udOpenPaperTransfer(id){
  const item=boardState().placements?.items.find(p=>p.id===id);
  if(!item||item.locked||worldReadOnly())return;
  const choices=udPaperLocalTargets(id).concat(udPaperTransferTargets(item.entityId).map(e=>({scope:e.id,label:e.name+' · другая доска'})));
  udPaperChoiceModal('Перенести бумажку',choices,p=>p.scope?udTransferPaper(id,p.scope):udTransferPaperLocally(id,p.parentId));
}

function udOpenPaperRelated(id){
  // Choose already visible paper instances; never create a placement as a side effect.
  if(worldReadOnly()||udPlacementsAreShared())return false;
  const board=boardState().placements,source=board?.items.find(p=>p.id===id),layout=boardLayout();
  if(!source||!layout.keys?.has(id))return false;
  const persistent=new Set(board.items.map(p=>p.id)),choices=[];
  for(const relation of data.relations){
    if(getRT(relation.type).containment||!relationShown(relation))continue;
    const other=relation.from===source.entityId?relation.to:
      relation.to===source.entityId?relation.from:null;
    const entity=other&&getEntity(other);
    if(!entity||entity.hint||!visibleByFilters(entity))continue;
    const targets=[...layout.keys.values()].filter(p=>persistent.has(p.id)&&p.id!==id&&p.entityId===other);
    for(const [i,target] of targets.entries()){
      const parent=target.parentId&&layout.keys.get(target.parentId);
      const parentName=parent&&getEntity(parent.entityId)?.name;
      choices.push({relationId:relation.id,paperId:target.id,
        label:entity.name+' · '+(getRT(relation.type).name||'Связь')+
          (parentName?' · внутри «'+parentName+'»':' · на доске')+
          (targets.length>1?' · экземпляр '+(i+1):'')});
    }
  }
  if(!choices.length){
    toast('На этой доске нет видимой бумажки для связи. Все отношения доступны в разделе «Связи».','ok');
    return false;
  }
  udPaperChoiceModal('Показать нить к существующей бумажке',choices,choice=>udCommitPlacementChange(live=>{
    const a=live.items.find(p=>p.id===id),b=live.items.find(p=>p.id===choice.paperId);
    const relation=data.relations.find(r=>r.id===choice.relationId);
    const visible=boardLayout().keys,target=b&&getEntity(b.entityId);
    if(!a||!b||!relation||!target||getRT(relation.type).containment||!relationShown(relation)||
      !visible.has(a.id)||!visible.has(b.id)||!visibleByFilters(target))return false;
    return udStoreThreadPair(live,relation,relation.from===a.entityId?a.id:b.id,
      relation.to===a.entityId?a.id:b.id);
  },'Нить показана между выбранными бумажками'));
}

// Project hint papers as unrelated cards. Alias maps stay with the authority.
const udPaperAliasMaps=new WeakMap();
function udProjectPaperBoards(ws,projection,bindings=new Map()){
  const entities=new Map(projection.entities.map(e=>[e.id,e]));
  const known=new Set(projection.entities.filter(e=>!e.hint).map(e=>e.id));
  const placed=new Set(projection.entities.filter(e=>!e.hint||e.hint==='named').map(e=>e.id));
  // Hidden relation details include manual routing. Participants see an ordinary grey line.
  const routes=new Map(projection.relations.filter(r=>!playerRelationMasked(r)).map(r=>[r.id,r]));
  const containment=new Set(ws.relationTypes?.filter(t=>t.containment).map(t=>t.id));
  containment.add(PLAYER_MASKED_MEMBERSHIP.id);
  const publicContainment=new Set(projection.relations.filter(r=>containment.has(r.type)).map(r=>JSON.stringify([r.from,r.to])));
  const publicExclusions=(values,parent)=>udPaperExclusions(values,known).filter(id=>publicContainment.has(JSON.stringify([parent,id])));
  const boards=Object.create(null);
  let aliases=udPaperAliasMaps.get(ws);
  if(!aliases){aliases=new Map();udPaperAliasMaps.set(ws,aliases)}
  const liveAliases=new Set();
  for(const [scope,b] of Object.entries(ws.boards||{})){
    if(!known.has(scope)||b.placements?.schema!==UD_PLACEMENT_SCHEMA)continue;
    const keys=new Set(placed),aliasEntities=new Map();
    const items=b.placements.items.flatMap(p=>{
      const hint=entities.get(p.entityId);
      if(hint?.hint==='named'){
        const {id,entityId,parentId,x,y,w,h,locked,autoHeight,detached}=p;
        return [{id,entityId,parentId,x,y,w,h,locked,autoHeight,detached}];
      }
      if(!hint?.hint){
        const {adoptedLayout,...visible}=p;
        return [{...visible,excludedMembers:publicExclusions(p.excludedMembers,p.entityId)}];
      }
      const key=JSON.stringify([scope,p.id]);
      let a=aliases.get(key);
      if(!a){a={paper:uid('paper'),entity:uid('hint')};aliases.set(key,a)}
      liveAliases.add(key);
      keys.add(a.entity);
      aliasEntities.set(a.entity,{id:a.entity,name:hint.name,type:hint.type,hint:true,style:{}});
      bindings.set(JSON.stringify([scope,a.paper]),p.id);
      return [{id:a.paper,entityId:a.entity,parentId:p.parentId,x:p.x,y:p.y,w:p.w,h:p.h,
        locked:p.locked,autoHeight:p.autoHeight,detached:p.detached}];
    });
    const placements=udNormalizePlacements({...b.placements,items,excludedRoots:publicExclusions(b.placements.excludedRoots,scope)},keys,routes,{projected:true});
    for(const p of placements.items)if(aliasEntities.has(p.entityId))projection.entities.push(aliasEntities.get(p.entityId));
    boards[scope]={open:{},rel:{},pins:[],placements};
  }
  for(const key of aliases.keys())if(!liveAliases.has(key))aliases.delete(key);
  return boards;
}

function udCapturePaperBoards(ws,id){
  const captured=[];
  const relations=new Set(ws.relations.filter(r=>r.from===id||r.to===id).map(r=>r.id));
  for(const [scope,b] of Object.entries(ws.boards||{})){
    const board=b.placements;
    if(!board)continue;
    const ids=new Set();
    for(const p of board.items)if(scope===id||p.entityId===id)for(const child of udPaperSubtree(board,p.id))ids.add(child);
    const routes=board.routes.filter(r=>udThreadRoutePapers(r).some(paperId=>ids.has(paperId))||
      udIsContextThread(r)&&relations.has(r.relationId));
    if(scope===id||ids.size||routes.length)captured.push({scope,items:board.items.filter(p=>ids.has(p.id)).map(value=>clone(value)),
      routes:routes.map(value=>clone(value)),...(scope===id&&board.excludedRoots?{excludedRoots:clone(board.excludedRoots)}:{})});
  }
  return captured;
}

function udRestorePaperBoards(ws,entries,waiting=new Map()){
  const ids=new Set(ws.entities.map(e=>e.id)),relations=new Map(ws.relations.map(r=>[r.id,r]));
  const boards=new Map();
  for(const {scope,items,routes,excludedRoots} of entries){
    if(!Array.isArray(items)||!Array.isArray(routes))continue;
    const target=boards.get(scope)||{items:[],routes:[]};
    target.items.push(...items);target.routes.push(...routes);target.excludedRoots=udPaperExclusions([...(target.excludedRoots||[]),...(excludedRoots||[])]);boards.set(scope,target);
  }
  const archived=new Map();
  for(const entry of waiting.values())for(const backup of entry.paperBoards||[]){
    if(!boards.has(backup?.scope)||!Array.isArray(backup.items))continue;
    if(!archived.has(backup.scope))archived.set(backup.scope,new Map());
    const items=archived.get(backup.scope);
    for(const paper of backup.items)if(paper?.id)items.set(paper.id,paper);
  }
  for(const [scope,backup] of boards){
    let restored=null;
    if(ids.has(scope)){
      ws.boards??={};
      const target=ws.boards[scope]??=BOARD_EMPTY_STATE(),current=target.placements;
      restored=udNormalizePlacements({schema:UD_PLACEMENT_SCHEMA,
        items:[...(current?.items||[]),...backup.items],routes:[...(current?.routes||[]),...backup.routes],excludedRoots:[...(current?.excludedRoots||[]),...(backup.excludedRoots||[])]},ids,relations);
      target.placements=restored;
    }
    if(waiting.size)udKeepPendingPaperRestore(scope,backup,restored,archived.get(scope),waiting);
  }
}

// Keep fragments with the next entity blocking the restore, using the existing
// trash format. A later restore can pass them on again if another blocker remains.
function udKeepPendingPaperRestore(scope,backup,restored,archived,waiting){
  const scopeEntry=waiting.get(scope);
  if(!restored&&!scopeEntry)return;
  const live=new Set(restored?.items.map(p=>p.id));
  const candidates=new Map(archived);
  for(const paper of backup.items)if(paper?.id)candidates.set(paper.id,paper);
  const deferred=new Map();
  function blocker(id){
    if(scopeEntry)return scopeEntry;
    const seen=new Set();
    for(let paperId=id;paperId&&!live.has(paperId)&&!seen.has(paperId);){
      seen.add(paperId);
      const paper=candidates.get(paperId);
      if(!paper)return null;
      const entry=waiting.get(paper.entityId);
      if(entry)return entry;
      paperId=paper.parentId;
    }
    return null;
  }
  function pending(entry){
    if(!deferred.has(entry))deferred.set(entry,{scope,items:[],routes:[]});
    return deferred.get(entry);
  }
  if(scopeEntry)pending(scopeEntry).excludedRoots=backup.excludedRoots;
  for(const paper of backup.items){
    if(!paper?.id||live.has(paper.id))continue;
    const entry=blocker(paper.id);
    if(entry)pending(entry).items.push(paper);
  }
  for(const route of backup.routes){
    if(!route)continue;
    const [from,to]=udThreadRoutePapers(route);
    const entry=blocker(from)||blocker(to)||(udIsContextThread(route)?
      [...waiting.values()].find(t=>t.relations.some(r=>r.id===route.relationId)):null);
    if(entry)pending(entry).routes.push(route);
  }
  for(const [entry,fragment] of deferred){
    entry.paperBoards??=[];
    const previous=entry.paperBoards.find(b=>b.scope===scope&&Array.isArray(b.items)&&Array.isArray(b.routes));
    if(!previous){
      entry.paperBoards.push(clone(fragment));
      continue;
    }
    if(fragment.excludedRoots)previous.excludedRoots=udPaperExclusions([...(previous.excludedRoots||[]),...fragment.excludedRoots]);
    const ids=new Set(previous.items.filter(Boolean).map(p=>p.id));
    for(const paper of fragment.items)if(!ids.has(paper.id)){previous.items.push(clone(paper));ids.add(paper.id)}
    for(const route of fragment.routes){
      const [from,to]=udThreadRoutePapers(route);
      if(previous.routes.some(r=>{
        if(r?.relationId!==route.relationId||udIsContextThread(r)!==udIsContextThread(route))return false;
        const [a,b]=udThreadRoutePapers(r);
        return a===from&&b===to;
      }))continue;
      previous.routes.push(clone(route));
    }
  }
}

function udRebasePaperDrag(drag){
  if(drag.invalidated||state.visualMode!=='detective'||drag.scope!==boardKey()||
    drag.workspace!==currentWorkspace()?.id||worldReadOnly()||!udBoardUsesPlacements())return false;
  const board=boardState().placements,paper=board.items.find(p=>p.id===drag.id);
  if(!paper||paper.entityId!==drag.original.entityId||paper.parentId!==drag.original.parentId)return false;
  const before=udPaperFields(drag.original),after=udPaperFields(paper);
  if(Object.keys(before).some(k=>before[k]!==after[k]))return false;
  if(board!==drag.board){
    const cached=udAutomaticThreadChoices.get(drag.board);
    if(cached)udAutomaticThreadChoices.set(board,cached);
    drag.board=board;
  }
  return true;
}

function udPaperFields(p){
  return {x:p.x,y:p.y,locked:!!p.locked,w:p.w??null,h:p.h??null,autoHeight:!!p.autoHeight};
}

function udSubmitPaperOp(id,patch){
  if(worldReadOnly()||!window.UG_ONLINE_PLAYER)return false;
  const scope=boardKey(),p=boardState().placements?.items.find(p=>p.id===id);
  if(!p||onp.outbox.some(entry=>entry.ops.some(o=>o.c==='paper'&&o.scope===scope&&o.id===id)))return false;
  const before=udPaperFields(p);
  const next={...before,...patch};
  if(Object.keys(before).every(k=>before[k]===next[k]))return false;
  onpSendOps([{c:'paper',op:'paper',scope,id,was:before,f:next}],true);
  return true;
}

function udPlaceEntityCopies(copies){
  if(!udBoardUsesPlacements()||worldReadOnly())return;
  const board=boardState().placements,visible=boardLayout().keys,created=new Map(),sources=[];
  for(const [original,entity] of copies){
    const source=[...visible.values()].find(p=>p.entityId===original&&p.id===udSelectedPaperId())||[...visible.values()].find(p=>p.entityId===original);
    if(!source){udPlaceAtContext(entity.id,board,udSharedCurrentParent());continue}
    const paper={id:uid('paper'),entityId:entity.id,parentId:source.parentId,x:source.x+44,y:source.y+44};
    if(source.w)paper.w=source.w;
    if(source.h&&!source.autoHeight)paper.h=source.h;
    board.items.push(paper);created.set(source.id,paper);sources.push({source,paper});
  }
  for(const {source,paper} of sources){
    const parent=created.get(source.parentId);
    if(parent){paper.parentId=parent.id;paper.x=source.x;paper.y=source.y;parent.open='one'}
  }
}

// Two views of an addressed container read the same stored paper subtree.
// The view keeps only a reference; no second geometry or lock is serialized.
function udContainerContext(scope=state.scopeId){
  const c=state.udContainerContext;if(!c)return null;
  const ws=currentWorkspace();
  if(c.workspace!==ws?.id||c.entityId!==scope||state.visualMode!=='detective'||
    typeof c.sourceScope!=='string'||typeof c.paperId!=='string')return null;
  if(udUsesSharedLayout(ws)&&c.sourceScope!==ws.rootId)return null;
  const boards=typeof viewAsPlayer==='function'&&viewAsPlayer()?playerPaperBoards:ws.boards;
  const p=boards?.[c.sourceScope]?.placements?.items.find(p=>p.id===c.paperId);
  if(!getEntity(c.sourceScope)||!p||p.entityId!==scope||getEntity(scope)?.hint)return null;
  return c;
}
function udContainerContextFromPaper(entityId,paperId){
  const ws=currentWorkspace(),p=boardState().placements?.items.find(p=>p.id===paperId);
  if(!ws||!p||p.entityId!==entityId||!boardLayout().keys?.has(paperId)||getEntity(entityId)?.hint)return null;
  if(!p.childrenReady&&!worldReadOnly()){
    const initialized=udCommitPlacementChange(board=>{
      const parent=board.items.find(p=>p.id===paperId),items=new Map(board.items.map(p=>[p.id,p])),ancestors=new Set();
      for(let a=parent;a&&!ancestors.has(a.entityId);a=items.get(a.parentId))ancestors.add(a.entityId);
      const ok=parent&&udInitializePaperChildren(board,parent,ancestors,udPlacementChildren(board.items),BOARD_LIMIT-1);
      if(!ok||udVisiblePlacements(board,p=>visibleByFilters(getEntity(p.entityId)),undefined,{limit:BOARD_LIMIT}).size>=BOARD_LIMIT)return false;
    });
    if(!initialized)return null;
  }
  return {workspace:ws.id,entityId,sourceScope:boardKey(),paperId,returnScope:state.scopeId,
    previous:udContainerContext()?clone(state.udContainerContext):null};
}
function udBoundContainerContext(raw){
  if(!raw||typeof raw!=='object')return null;
  const out=[];let c=raw;
  for(let i=0;c&&i<64;i++,c=c.previous){
    if(typeof c!=='object'||['workspace','entityId','sourceScope','paperId','returnScope'].some(k=>
      typeof c[k]!=='string'||c[k].length>180))return null;
    out.push(Object.fromEntries(['workspace','entityId','sourceScope','paperId','returnScope'].map(k=>[k,c[k]])));
  }
  if(c)return null;
  let previous=null;for(const entry of out.reverse())previous={...entry,previous};
  return previous;
}

function udAdoptedContainerContext(entityId){
  if(udUsesSharedLayout())return udSharedResolveContext(entityId);
  if(uiIsPlayer())return null;
  const ws=currentWorkspace(),scope=containmentParent(entityId);
  const papers=ws?.boards?.[scope]?.placements?.items.filter(p=>p.entityId===entityId&&p.parentId===null&&p.adoptedLayout);
  if(papers?.length!==1)return null;
  return {workspace:ws.id,entityId,sourceScope:scope,paperId:papers[0].id,returnScope:scope,previous:null};
}

function udPaperViewFits(board,context=udContainerContext(),visible=p=>visibleByFilters(getEntity(p.entityId))){
 const rootPaper=context&&board.items.find(p=>p.id===context.paperId),limit=BOARD_LIMIT+(rootPaper?1:0);
 return udVisiblePlacements(board,visible,
  p=>p.id===rootPaper?.id?'one':p.open,{rootPaper,limit}).size<limit;
}

