// Route one logical relation over the visible paper instances on a board.
// Manual endpoints are stored by occurrence ID, outside the logical relation.
'use strict';

function udIsContextThread(route){
  return route?.fromParent!==undefined&&route?.toParent!==undefined;
}

function udThreadRoutePapers(route){
  return udIsContextThread(route)?[route.fromParent,route.toParent]:[route.from,route.to];
}

function udIndexThreadBoard(items,positions,routes,rootId=null){
  const known=new Map(items.map(item=>[item.id,item]));
  if(rootId&&positions.has(rootId))known.set(rootId,{id:rootId,entityId:rootId,parentId:null});
  const groups=new Map(),visible=new Map(),manual=new Map(),contexts=new Map();
  for(const item of known.values()){
    const p=positions.get(item.id);
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
    if(!visible.has(item.entityId))visible.set(item.entityId,[]);
    visible.get(item.entityId).push(item);
    if(!groups.has(item.entityId))groups.set(item.entityId,new Map());
    const contexts=groups.get(item.entityId);
    if(!contexts.has(item.parentId))contexts.set(item.parentId,[]);
    contexts.get(item.parentId).push(item);
  }
  for(const route of routes){
    const index=udIsContextThread(route)?contexts:manual;
    if(!index.has(route.relationId))index.set(route.relationId,[]);
    index.get(route.relationId).push(route);
  }
  return {known,groups,visible,manual,contexts,positions,rootId};
}

function udThreadPairsFromIndex(relation,{known,groups,visible,manual,contexts,positions,rootId},containment=false,previous=new Map(),next=new Map(),movingByContext=new Map()){
  if(relation.from===relation.to)return [];
  const sources=groups.get(relation.from),targets=groups.get(relation.to);
  if(!sources||!targets)return [];
  const allSources=visible.get(relation.from),allTargets=visible.get(relation.to);
  const explicit=manual.get(relation.id)||[],contextsForRelation=contexts.get(relation.id)||[];
  const key=(fromParent,toParent)=>JSON.stringify([fromParent,toParent]);
  // A unique visible endpoint has no alternative to rank or retain.
  if(allSources.length===1&&allTargets.length===1){
    const [from]=allSources,[to]=allTargets;
    const pair={from:from.id,to:to.id};
    if(containment)return to.parentId===(from.id===rootId?null:from.id)?[pair]:[];
    if(!explicit.length&&!contextsForRelation.length){
      next.set(from.parentId===to.parentId?key(from.parentId,to.parentId):'visible',pair);
      return [pair];
    }
  }
  const selected=new Map();
  // Keep one presentation per existing context, but either visible end may be
  // in an expanded container. Do not multiply every copy by every other copy.
  const moving=[...movingByContext.values()].some(ids=>ids.has(relation.from)||ids.has(relation.to));
  const prior=context=>previous.get(context)||(previous.size===1?[...previous.values()][0]:null);
  function best(fromItems,toItems,previousPair=null,hold=false,alternatives=[]){
    const choices=[[fromItems,toItems],...alternatives];
    const previousAllowed=previousPair&&choices.some(([froms,tos])=>
      froms.some(p=>p.id===previousPair.from)&&tos.some(p=>p.id===previousPair.to));
    if(hold&&previousAllowed)return previousPair;
    let picked=null,distance=Infinity,tie='';
    for(const [froms,tos] of choices)for(const from of froms)for(const to of tos){
      const a=positions.get(from.id),b=positions.get(to.id);
      const d=(a.x-b.x)**2+(a.y-b.y)**2;
      const t=from.id+'|'+to.id;
      if(d<distance||d===distance&&(!picked||t<tie)){
        picked={from:from.id,to:to.id};distance=d;tie=t;
      }
    }
    // Compare lengths, not squared lengths: a 10% improvement is 0.9².
    if(picked&&previousAllowed){
      const a=positions.get(previousPair.from),b=positions.get(previousPair.to);
      const oldDistance=(a.x-b.x)**2+(a.y-b.y)**2;
      if(oldDistance===0||distance/oldDistance>0.81)return {from:previousPair.from,to:previousPair.to};
    }
    return picked;
  }

  for(const route of containment?[]:explicit){
    const from=known.get(route.from),to=known.get(route.to);
    if(from?.entityId!==relation.from||to?.entityId!==relation.to)continue;
    const fromChoices=sources.get(from.parentId),toChoices=targets.get(to.parentId);
    if(!fromChoices?.length||!toChoices?.length)continue;
    const chosen=best(
      fromChoices.includes(from)?[from]:fromChoices,
      toChoices.includes(to)?[to]:toChoices
    );
    if(chosen)selected.set(key(from.parentId,to.parentId),chosen);
  }

  function selectAutomatic(fromParent,toParent,fromItems=[],toItems=[]){
    const context=key(fromParent,toParent);
    if(selected.has(context)||!fromItems.length&&!toItems.length)return;
    const old=prior(context);
    const chosen=fromItems.length===allSources.length?best(fromItems,allTargets,old,moving):
      toItems.length===allTargets.length?best(allSources,toItems,old,moving):
      best(fromItems,allTargets,old,moving,[[allSources,toItems]]);
    if(chosen){selected.set(context,chosen);next.set(context,chosen)}
  }

  if(!containment)for(const {fromParent,toParent} of contextsForRelation){
    selectAutomatic(fromParent,toParent,sources.get(fromParent),targets.get(toParent));
  }

  for(const [parent,fromItems] of sources){
    if(containment){
      for(const from of fromItems){
        const childContext=from.id===rootId?null:from.id;
        const chosen=best([from],targets.get(childContext)||[]);
        if(chosen)selected.set(key(parent,childContext),chosen);
      }
    }else if(targets.has(parent)){
      selectAutomatic(parent,parent,fromItems,targets.get(parent));
    }
  }
  // No shared local context is required when both entities are actually visible.
  // An explicitly selected manual route remains scoped, including while hidden.
  if(!containment&&!selected.size&&!explicit.length){
    const chosen=best(allSources,allTargets,prior('visible'),moving);
    if(chosen){selected.set('visible',chosen);next.set('visible',chosen)}
  }
  const unique=new Map();
  for(const pair of selected.values())unique.set(JSON.stringify([pair.from,pair.to]),pair);
  return [...unique.values()];
}

function udPickThreadPairs(relation,items,positions,routes,{containment=false,rootId=null,previous,next}={}){
  return udThreadPairsFromIndex(relation,udIndexThreadBoard(items,positions,routes,rootId),containment,previous,next);
}

// Store one manual route per ordered pair of contexts. A missing or stale
// endpoint never replaces a valid route.
function udStoreThreadPair(board,relation,fromId,toId) {
  const byId=new Map(board.items.map(item=>[item.id,item]));
  const from=byId.get(fromId),to=byId.get(toId);
  if(!from||!to||from.entityId===to.entityId||from.entityId!==relation.from||to.entityId!==relation.to)return false;
  board.routes=board.routes.filter(route=>udIsContextThread(route)||route.relationId!==relation.id||
    byId.get(route.from)?.parentId!==from.parentId||byId.get(route.to)?.parentId!==to.parentId);
  board.routes.push({relationId:relation.id,from:fromId,to:toId});
  return true;
}
