// Объединение доски с выбранной зоной из JSON. Предпросмотр строится на копии.
'use strict';
const UD_MERGE_LABELS={
  name:'Название',title:'Название',body:'Текст',type:'Тип',description:'Описание',note:'Заметка',properties:'Анкета',status:'Статусы',
  sectionData:'Разделы',infoboxes:'Инфоблоки',board:'Место на доске',style:'Оформление',vis:'Видимость',
  page:'Страница',map:'Карта',mediaId:'Изображение',widgets:'Блоки',parent:'Вложенность',from:'Источник',
};
function udMergeSource(parsed){
  const {_media:media,...world}=parsed;
  const previous=data,workspace=state.workspaceId,scope=state.scopeId,context=state.udContainerContext;
  const oldRepairs=takeRepairs();
  try{
    data=clone(world);
    state.workspaceId=null;
    normalize();
    return {workspaces:data.workspaces,media:Array.isArray(media)?media:[]};
  }finally{
    data=previous;
    state.workspaceId=workspace;
    state.scopeId=scope;state.udContainerContext=context;
    takeRepairs();
    for(const [label,count] of oldRepairs)noteRepair(label,count);
    invalidateContainmentIndex();
  }
}
function udMergeMatches(incoming,existing){
  const map=new Map(),byId=new Map(existing.map(e=>[e.id,e]));
  const key=e=>JSON.stringify([wikiNormName(e.name),e.type]);
  const index=list=>{
    const groups=new Map();
    for(const e of list){
      const k=key(e);
      groups.set(k,groups.has(k)?null:e);
    }
    return groups;
  };
  const localNames=index(existing),incomingNames=index(incoming);
  const exactIds=new Set(incoming.filter(e=>byId.has(e.id)).map(e=>e.id));
  for(const e of incoming){
    const sameName=localNames.get(key(e));
    const candidate=incomingNames.get(key(e))&&sameName&&!exactIds.has(sameName.id)?sameName:null;
    map.set(e.id,byId.get(e.id)?.id||candidate?.id||e.id);
  }
  return map;
}
function udMergeRecord(local,incoming,group,id,title,conflicts,choices){
  const skip=new Set(['id','createdAt','updatedAt','tags','aliases','media','from','to']);
  const empty=value=>value==null||(typeof value==='string'&&!value.trim())||
    (Array.isArray(value)&&!value.length)||(isRecord(value)&&!Object.keys(value).length);
  const mergeValue=(before,after,path)=>{
    if(empty(after)||JSON.stringify(before)===JSON.stringify(after))return before;
    if(empty(before))return after;
    if(isRecord(before)&&isRecord(after)){
      return Object.fromEntries([...new Set([...Object.keys(before),...Object.keys(after)])].map(key=>
        [key,mergeValue(Object.hasOwn(before,key)?before[key]:undefined,Object.hasOwn(after,key)?after[key]:undefined,[...path,key])]));
    }
    if(path[0]==='style'&&path[1]==='animationPhase')return before;
    if(path[0]==='status'&&Array.isArray(before)&&Array.isArray(after))return [...new Set([...before,...after])];
    const key=JSON.stringify([group,id,path]);
    const label=path.map(part=>Object.hasOwn(UD_MERGE_LABELS,part)?UD_MERGE_LABELS[part]:part).join(' · ');
    conflicts.push({key,title,label,before,after});
    return choices.get(key)==='file'?after:before;
  };
  const merged={...local};
  for(const [key,value] of Object.entries(incoming)){
    if(skip.has(key))continue;
    const old=Object.hasOwn(local,key)?local[key]:undefined;
    Object.defineProperty(merged,key,{value:mergeValue(old,value,[key]),enumerable:true,writable:true,configurable:true});
  }
  if(local.tags||incoming.tags)merged.tags=[...new Map([...(incoming.tags||[]),...(local.tags||[])].map(t=>[tagKey(t),t])).values()];
  if(group==='entity'){
    const aliases=[...(local.aliases||[]),...(incoming.aliases||[]),local.name,incoming.name];
    merged.aliases=[...new Set(aliases.filter(n=>n&&n!==merged.name))];
    const pictures=new Map(entityMedia(local).map(m=>[m.id,m]));
    for(const image of entityMedia(incoming)){
      if(!pictures.has(image.id))pictures.set(image.id,{...image,main:!pictures.size&&!!image.main});
    }
    merged.media=[...pictures.values()];
  }
  return merged;
}
function udMergeReferences(record,fields,ids){
  for(const field of fields||[]){
    if(field.kind!=='ref')continue;
    const ref=record.properties?.[field.name];
    if(ids.has(ref))record.properties[field.name]=ids.get(ref);
  }
  const remapKeys=obj=>Object.fromEntries(Object.entries(obj).map(([key,value])=>[ids.get(key)||key,value]));
  if(record.board?.at)record.board.at=remapKeys(record.board.at);
  if(record.board?.fixed)record.board.fixed=remapKeys(record.board.fixed);
  if(record.board?.lock?.parent&&ids.has(record.board.lock.parent))record.board.lock.parent=ids.get(record.board.lock.parent);
  for(const key of ['description','note'])if(typeof record[key]==='string')record[key]=udRemapWikiCards(record[key],ids);
  for(const mark of [...(record.map?.pins||[]),...(record.map?.areas||[])]){
    if(ids.has(mark.entityId))mark.entityId=ids.get(mark.entityId);
  }
}
function udMergePlan(target,source,choices=new Map()){
  if(udUsesSharedLayout(target)&&Object.keys(source.boards||{}).some(scope=>scope!==source.rootId))
    throw Error('В файле есть отдельные раскладки. Сначала согласуйте их перенос в общую раскладку; исходные доски не будут потеряны.');
  const result=clone(target),incoming=clone(source),conflicts=[];
  const counts={matched:0,added:0,links:0};
  const rules=importRulesFromWorkspace(incoming,result);
  remapImportedRules(incoming.entities,incoming.relations,rules);
  for(const [list,mapping] of [['entityTypes',rules.et],['relationTypes',rules.rt]]){
    const dest=new Map(result[list].map(t=>[t.id,t]));
    for(const sourceType of source[list]){
      const type=dest.get(mapping.get(sourceType.id));
      const added=sourceType.fields?.filter(field=>!type.fields?.some(f=>f.name===field.name))||[];
      if(added.length)type.fields=[...(type.fields||[]),...added.map(f=>({...f,id:type.fields?.some(x=>x.id===f.id)?uid('field'):f.id,refType:rules.et.get(f.refType)||f.refType}))];
      if(!target[list].some(t=>t.id===type.id)){
        for(const f of type.fields||[])if(f.refType)f.refType=rules.et.get(f.refType)||f.refType;
        for(const key of ['fromTypes','toTypes'])if(type[key])type[key]=type[key].map(id=>rules.et.get(id)||id);
      }
    }
  }
  const ids=udMergeMatches(incoming.entities,result.entities);
  const entityTypes=new Map(result.entityTypes.map(t=>[t.id,t]));
  const relationTypes=new Map(result.relationTypes.map(t=>[t.id,t]));
  const sourceET=new Map(source.entityTypes.map(t=>[t.id,t]));
  const sourceRT=new Map(source.relationTypes.map(t=>[t.id,t]));
  const records=new Map(result.entities.map((e,index)=>[e.id,index]));
  const carrySections=(record,sourceType,targetType,kind)=>{
    const definitions=typePage(targetType,kind);
    for(const sec of typePage(sourceType,kind)){
      if(!record.sectionData?.[sec.id]||definitions.some(x=>x.id===sec.id))continue;
      const own=ensureOwnPage(record);
      own.add=own.add||[];
      if(!own.add.some(x=>x.id===sec.id))own.add.push(clone(sec));
    }
  };
  for(let i=0;i<incoming.entities.length;i++){
    const entity=incoming.entities[i],original=source.entities[i],type=entityTypes.get(entity.type);
    udMergeReferences(entity,type?.fields,ids);
    carrySections(entity,sourceET.get(original.type),type,'entity');
    entity.id=ids.get(entity.id);
    const index=records.get(entity.id);
    if(index===undefined){
      result.entities.push(entity);
      if(source.positions?.[original.id])result.positions[entity.id]=clone(source.positions[original.id]);
      counts.added++;
    }else{
      const local=result.entities[index];
      result.entities[index]=udMergeRecord(local,entity,'entity',local.id,local.name,conflicts,choices);
      counts.matched++;
    }
  }
  if(!result.rootId)result.rootId=ids.get(source.rootId)||null;
  const containment=result.relationTypes.find(t=>t.containment)?.id;
  const edgeKey=link=>JSON.stringify([link.from,link.to,link.type]);
  const edges=new Map(),linksById=new Map(),used=new Set(),parents=new Map(),relationIds=new Map();
  const entityNames=new Map(result.entities.map(e=>[e.id,e.name]));
  const relationLabel=link=>`${entityNames.get(link.from)} → ${entityNames.get(link.to)} · ${relationTypes.get(link.type)?.name||'Связь'}`;
  const addLink=link=>{
    if(used.has(link.id))link.id=uid('relation');
    used.add(link.id);
    counts.links++;
    return link;
  };
  result.relations=result.relations.filter(link=>{
    used.add(link.id);
    if(link.type===containment&&!link.udMembership){parents.set(link.to,link);return false}
    return true;
  });
  result.relations.forEach((link,index)=>{
    const key=edgeKey(link);
    edges.set(key,edges.has(key)?null:index);
    linksById.set(link.id,index);
  });
  const incomingEdgeCounts=new Map();
  for(const link of incoming.relations){
    link.from=ids.get(link.from);
    link.to=ids.get(link.to);
    const key=edgeKey(link);
    incomingEdgeCounts.set(key,(incomingEdgeCounts.get(key)||0)+1);
  }
  for(let i=0;i<incoming.relations.length;i++){
    const link=incoming.relations[i],original=source.relations[i];
    if(!link.from||!link.to||link.from===link.to)continue;
    const type=relationTypes.get(link.type);
    udMergeReferences(link,type?.fields,ids);
    carrySections(link,sourceRT.get(original.type),type,'relation');
    if(link.type===containment&&link.to===result.rootId)continue;
    if(link.type===containment&&!link.udMembership){
      const local=parents.get(link.to);
      if(!local)parents.set(link.to,addLink(link));
      else if(local.from!==link.from){
        const key=JSON.stringify(['parent',link.to]);
        conflicts.push({key,title:entityNames.get(link.to),label:'Вложенность',before:entityNames.get(local.from),after:entityNames.get(link.from)});
        if(choices.get(key)==='file')parents.set(link.to,addLink(link));
      }else parents.set(link.to,udMergeRecord(local,link,'link',local.id,relationLabel(link),conflicts,choices));
      relationIds.set(original.id,parents.get(link.to).id);
      continue;
    }
    const key=edgeKey(link),sameId=linksById.get(link.id);
    const exact=sameId!==undefined&&edgeKey(result.relations[sameId])===key;
    const index=exact?sameId:incomingEdgeCounts.get(key)===1?edges.get(key):null;
    if(index==null){
      result.relations.push(addLink(link));
      relationIds.set(original.id,link.id);
    }else{
      const local=result.relations[index];
      result.relations[index]=udMergeRecord(local,link,'link',local.id,relationLabel(link),conflicts,choices);
      relationIds.set(original.id,local.id);
    }
  }
  const redirected=new Map();
  result.relations=result.relations.filter(link=>{
    const home=parents.get(link.to);
    if(link.type!==containment||!link.udMembership||home?.from!==link.from)return true;
    redirected.set(link.id,home.id);return false;
  });
  for(const [id,mapped] of relationIds)if(redirected.has(mapped))relationIds.set(id,redirected.get(mapped));
  result.relations.push(...parents.values());
  const incomingParents=new Map();
  let cyclic=false;
  for(const r of result.relations){
    if(r.type!==containment)continue;
    if(udContainmentReaches(incomingParents,r.from,r.to)){cyclic=true;break}
    if(!incomingParents.has(r.to))incomingParents.set(r.to,[]);
    incomingParents.get(r.to).push(r.from);
  }
  const mergedEntityIds=new Set(result.entities.map(e=>e.id));
  const mergedRelations=new Map(result.relations.map(r=>[r.id,r]));
  if(source.tagColors)result.tagColors={...source.tagColors,...result.tagColors};
  for(const [scope,board] of Object.entries(source.boards||{})){
    const key=ids.get(scope);
    if(!key)continue;
    result.boards=result.boards||{};
    const old=result.boards[key]||BOARD_EMPTY_STATE();
    const remap=obj=>Object.fromEntries(Object.entries(obj).filter(([id])=>ids.has(id)).map(([id,value])=>[ids.get(id),value]));
    const combined=udMergePlacements(old.placements,board.placements,ids,relationIds);
    const placements=udNormalizePlacements(combined,mergedEntityIds,mergedRelations);
    result.boards[key]={...(placements?{placements}:{}),open:{...remap(board.open),...old.open},rel:{...remap(board.rel),...old.rel},
      pins:[...new Set([...old.pins,...board.pins.map(id=>ids.get(id)).filter(Boolean)])]};
  }
  const linkMaps={entity:ids,relation:relationIds,type:rules.et,reltype:rules.rt};
  const articleIndices=new Map((result.articles||[]).map((a,i)=>[a.id,i]));
  for(const article of incoming.articles||[]){
    if(article.primaryFor){const id=ids.get(article.primaryFor);if(id)article.primaryFor=id;else delete article.primaryFor}
    article.body=udRemapWikiCards(article.body,ids);
    for(const img of article.media||[])img.caption=udRemapWikiCards(img.caption,ids);
    for(const box of article.infoboxes||[])for(const row of box.rows)row.value=udRemapWikiCards(row.value,ids);
    article.links=(article.links||[]).flatMap(link=>{
      const map=linkMaps[link.kind];
      return !map?[link]:map.has(link.id)?[{...link,id:map.get(link.id)}]:[];
    });
    if(article.collect){
      article.collect.entTypes=article.collect.entTypes.map(id=>rules.et.get(id)||id);
      article.collect.statuses=article.collect.statuses.map(id=>{const [group,option]=id.split(':');return [rules.sg.get(group)||group,rules.opt.get(id)||option].join(':')});
    }
    const index=articleIndices.get(article.id);
    if(index===undefined)(result.articles||=[]).push(article);
    else{
      const local=result.articles[index];
      const links=[...new Map([...local.links,...article.links].map(link=>[JSON.stringify(link),link])).values()];
      const {links:ignored,infoboxes,media:incomingMedia,...fields}=article;
      const merged=udMergeRecord(local,fields,'article',local.id,local.title,conflicts,choices);
      const media=[...new Map([...(incomingMedia||[]),...(local.media||[])].map(image=>[image.id,image])).values()];
      const boxesById=new Map((local.infoboxes||[]).map(box=>[box.id,box]));
      for(const box of infoboxes||[]){
        const previous=boxesById.get(box.id);
        boxesById.set(box.id,previous?udMergeRecord(previous,box,'infobox',local.id+':'+box.id,local.title+' · '+box.title,conflicts,choices):box);
      }
      result.articles[index]={...merged,links,...articleNormalizeExtras({media,infoboxes:[...boxesById.values()]})};
    }
  }
  if(source.articleTemplates?.length){
    const same=new Set((result.articleTemplates||[]).map(template=>articleNorm(template.title)));
    const ids=new Set((result.articleTemplates||[]).map(template=>template.id));
    result.articleTemplates=articleNormalizeTemplates([...(result.articleTemplates||[]),...source.articleTemplates
      .filter(t=>!same.has(articleNorm(t.title)))
      .map(t=>ids.has(t.id)?{...t,id:uid('art-template')}:t)]);
  }
  return {result,counts,conflicts,cyclic};
}
function udMergeFingerprint(ws){
  return JSON.stringify([ws.id,ws.rootId,ws.entities,ws.relations,ws.entityTypes,ws.relationTypes,ws.statusGroups,ws.positions,ws.boards,ws.tagColors,ws.articles,ws.articleTemplates]);
}
function udMergePrepareMedia(source,media){
  const imported=clone(source);
  const ids=new Set(mediaDataIdsFromData(imported));
  const doc={workspaces:[imported],_media:media.filter(m=>ids.has(String(m?.id)))};
  return {source:imported,...prepareImportedMedia(doc,{reuseRenamed:true})};
}
function udMergeApply(target,prepared,choices){
  if(rulesPlayerMode()||currentWorkspace()?.id!==target.id)return false;
  const snap=snapshotWorkspaceMutation(),storedMedia=[];
  let changed=false;
  try{
    const plan=udMergePlan(currentWorkspace(),prepared.source,choices);
    if(plan.cyclic)throw new Error('Выбранная вложенность образует цикл. Оставьте одно из прежних мест.');
    writeImportedMedia(prepared.rows,storedMedia);
    changed=true;
    const ws=currentWorkspace(),next=plan.result;
    const previousIds=new Set(ws.entities.map(e=>e.id));
    for(const key of ['rootId','entityTypes','relationTypes','statusGroups','positions','tagColors','boards','articles','articleTemplates'])if(next[key]!==undefined)ws[key]=next[key];
    applyWorkspaceRules(ws);
    replaceActiveEntities(next.entities);
    replaceActiveRelations(next.relations);
    if(udUsesSharedLayout(ws)&&!prepared.source.boards?.[prepared.source.rootId]?.placements&&
       !udSharedPlaceNewEntities(ws,next.entities.filter(e=>!previousIds.has(e.id)).map(e=>e.id)))throw Error('Не удалось разместить новые карточки в общей раскладке');
    normalize();
    state.scopeId=state.scopeId||ws.rootId;
    state.viewVersion++;
    if(!persist())throw new Error('Изменения не удалось сохранить. Исходная зона восстановлена.');
    updateUI();
    toast(`Добавлено карточек: ${plan.counts.added}, связей: ${plan.counts.links} · Ctrl+Z — вернуть`,'ok');
    return true;
  }catch(error){
    if(changed)restoreWorkspaceMutation(snap.data,snap.state);
    const retained=new Set(mediaDataIdsFromData(data));
    for(const id of storedMedia)if(!retained.has(id)){
      try{UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}catch{}
    }
    updateUI();
    toast(error.message||'Не удалось объединить миры','err');
    return false;
  }
}
function udMergeValue(value){
  return escapeHtml(typeof value==='string'?value:JSON.stringify(value,null,2));
}
function udMergePreview(parsed,filename){
  if(rulesPlayerMode()||!currentWorkspace())return;
  let doc;
  try{doc=udMergeSource(parsed)}catch(error){toast(error.message||'Не удалось прочитать мир','err');return}
  const sources=doc.workspaces.filter(ws=>ws.entities.length);
  if(!sources.length){toast('В файле нет карточек для объединения','err');return}
  const targetId=currentWorkspace().id,choices=new Map();
  const selectSource=`<label>Зона из файла «${escapeHtml(filename)}» <select id="udMergeSource">${sources.map(ws=>`<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.name)} (${ws.entities.length})</option>`).join('')}</select></label>`;
  openModal('Объединить с миром из файла',`<div class="udMerge">${selectSource}<p>В открытую зону «${escapeHtml(currentWorkspace().name)}» будут перенесены карточки, связи, картинки и недостающие правила.</p><div id="udMergePlan"></div></div>`,
    '<button type="button" class="btn" id="udMergeCancel">Отмена</button><button type="button" class="btn primary" id="udMergeApply">Объединить</button>');
  const source=()=>sources.find(ws=>ws.id===$('#udMergeSource').value);
  let fingerprint,plan,mediaMapping;
  const refresh=()=>{
    try{
      fingerprint=udMergeFingerprint(currentWorkspace());
      const prepared=udMergePrepareMedia(source(),doc.media);
      mediaMapping=JSON.stringify([...prepared.replacements]);
      plan=udMergePlan(currentWorkspace(),prepared.source,choices);
      $('#udMergeApply').disabled=false;
    }catch(error){
      $('#udMergeApply').disabled=true;
      $('#udMergePlan').textContent=error.message||'Не удалось прочитать выбранную зону.';
      return;
    }
    const count=plan.conflicts.length;
    const rows=plan.conflicts.map(({key,title,label,before,after},index)=>`<fieldset><legend>${escapeHtml(title+' · '+label)}</legend><div class="udMergeChoices">${[['local','Было',before],['file','Стало (из файла)',after]].map(([value,name,text])=>`<label><input type="radio" name="udMergeChoice${index}" value="${value}"${(choices.get(key)||'local')===value?' checked':''}><b>${name}</b><span>${udMergeValue(text)}</span></label>`).join('')}</div></fieldset>`).join('');
    const {added,matched,links}=plan.counts;
    $('#udMergePlan').innerHTML=`<p class="udMergeSummary">Новых карточек: ${added} · совпало: ${matched} · новых связей: ${links} · расхождений: ${count}</p><div class="udMergeConflicts">${rows}</div>`;
  };
  $('#udMergeSource').onchange=()=>{choices.clear();refresh()};
  $('#udMergeCancel').onclick=closeModal;
  $('#udMergePlan').onchange=event=>{
    const index=Number(event.target.name.replace('udMergeChoice',''));
    const conflict=plan.conflicts[index];
    if(conflict)choices.set(conflict.key,event.target.value);
  };
  $('#udMergeApply').onclick=()=>{
    const target=currentWorkspace();
    if(rulesPlayerMode()||target?.id!==targetId){closeModal();toast('Открытая зона изменилась. Выберите файл снова.','err');return}
    if(fingerprint!==udMergeFingerprint(target)){refresh();toast('Зона изменилась. Проверьте обновлённые расхождения.','err');return}
    let prepared;
    try{prepared=udMergePrepareMedia(source(),doc.media)}catch{refresh();return}
    if(mediaMapping!==JSON.stringify([...prepared.replacements])){
      refresh();toast('Изображения изменились. Проверьте обновлённые расхождения.','err');return;
    }
    if(udMergeApply(target,prepared,choices))closeModal();
  };
  refresh();
}
$('#udMergeBtn').onclick=()=>chooseWorldFile('merge');

