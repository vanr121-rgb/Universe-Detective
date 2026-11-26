// Universe Graph — объединить двойников (0.29.3). Две сущности про одно и то же («Борн» и «Борн Кузнец») становятся одной:
// окно «что оставить» по каждому различию; к оставшейся переходят связи (одинаковые не удваиваются, связь двойников друг
// с другом убирается), то, что лежало внутри, теги, картинки, метки и области на картах, места на досках, ссылки статей,
// поля-ссылки, память Меха — всё, где стоял номер убранной. Имя убранной становится «другим именем» оставшейся, поэтому
// [[ссылки]] работают. Убранная — в корзине; всё — одна отмена Ctrl+Z. «Найти двойников» — похожие имена.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';
function mergeNorm(s){return searchFold(s).replace(/[«»"'.,!?()\-–—]/g,' ').replace(/\s+/g,' ').trim()}
function mergeDiffers(a,b){
  const out=[];const same=(x,y)=>JSON.stringify(x??null)===JSON.stringify(y??null);
  if(a.name!==b.name)out.push({key:'name',label:'Имя',a:a.name,b:b.name});
  if((a.type||'')!==(b.type||''))out.push({key:'type',label:'Тип',a:getET(a.type).name,b:getET(b.type).name});
  if(String(a.description||'').trim()!==String(b.description||'').trim()&&String(a.description||'').trim()&&String(b.description||'').trim())out.push({key:'description',label:'Описание',a:a.description,b:b.description,both:true});
  const props=new Set([...Object.keys(a.properties||{}),...Object.keys(b.properties||{})]);
  for(const k of props){const x=a.properties?.[k],y=b.properties?.[k];if(x!=null&&x!==''&&y!=null&&y!==''&&!same(x,y))out.push({key:'prop:'+k,label:k,a:typeof x==='string'?x:JSON.stringify(x),b:typeof y==='string'?y:JSON.stringify(y)})}
  const pa=containmentParent(a.id),pb=containmentParent(b.id);if(pa&&pb&&pa!==pb&&pa!==b.id&&pb!==a.id)out.push({key:'parent',label:'Где лежит',a:getEntity(pa)?.name||'?',b:getEntity(pb)?.name||'?'});
  return out;
}
// choice: {keep:'a'|'b' per key; description may be 'both'}. keepId stays, goneId goes to the trash.
function mergeEntities(keepId,goneId,choice={}){
  const keep=getEntity(keepId),gone=getEntity(goneId);if(!keep||!gone||keepId===goneId)return false;
  if(goneId===currentRootId())return mergeEntities(goneId,keepId,mergeFlip(choice));
  const ws=currentWorkspace(),before=clone(data),beforeState=snapshotMutationState();
  try{
    const pick=(key,a,b)=>choice[key]==='b'?b:a; // a = keep's, b = gone's
    const oldName=keep.name,goneName=gone.name;
    keep.name=pick('name',keep.name,gone.name);
    keep.type=pick('type',keep.type,gone.type);
    {const d1=String(keep.description||'').trim(),d2=String(gone.description||'').trim();keep.description=choice.description==='both'?[d1,d2].filter(Boolean).join('\n\n'):choice.description==='b'?d2:(d1||d2)}
    const props={...(gone.properties||{}),...(keep.properties||{})};for(const k of Object.keys(gone.properties||{}))if(choice['prop:'+k]==='b')props[k]=gone.properties[k];keep.properties=props;
    if(isRecord(gone.status)){keep.status=isRecord(keep.status)?keep.status:{};for(const [g,v] of Object.entries(gone.status))if(keep.status[g]==null)keep.status[g]=v}
    keep.tags=[...new Set([...(keep.tags||[]),...(gone.tags||[])])];
    keep.aliases=[...new Set([...(keep.aliases||[]),...(gone.aliases||[]),oldName,goneName].filter(n=>n&&n!==keep.name))];
    {const have=new Set((keep.media||[]).map(m=>m.id));keep.media=[...(keep.media||[]),...(gone.media||[]).filter(m=>!have.has(m.id)).map(m=>({...m,main:false}))]}
    if(!hasEntityMap(keep)&&hasEntityMap(gone))keep.map=clone(gone.map);
    if(isRecord(gone.sectionData)){keep.sectionData=isRecord(keep.sectionData)?keep.sectionData:{};for(const [k,v] of Object.entries(gone.sectionData))if(keep.sectionData[k]==null)keep.sectionData[k]=clone(v)}
    // where it lies: the chosen parent; what lay inside the gone one — inside the kept one
    const parentWanted=choice.parent==='b'?containmentParent(goneId):containmentParent(keepId);
    if(typeof trashCapture==='function')trashCapture([goneId]);
    const isC=r=>!!getRT(r.type)?.containment;
    for(const r of data.relations){
      if(r.from!==goneId&&r.to!==goneId)continue;
      if(isC(r)&&r.to===goneId){r.__drop=true;continue} // its own place — the kept one has (or gets) one
      if(r.from===goneId)r.from=keepId;if(r.to===goneId)r.to=keepId;
    }
    const seen=new Set();
    replaceActiveRelations(data.relations.filter(r=>{if(r.__drop)return false;if(r.from===r.to)return false;const k=isC(r)?'c|'+r.to:r.from+'|'+r.to+'|'+r.type;if(seen.has(k))return false;seen.add(k);return true}));
    if(parentWanted&&parentWanted!==keepId&&parentWanted!==goneId&&containmentParent(keepId)!==parentWanted)addContainmentSilent(keepId,parentWanted);
    // every other place that held the gone one's number (map pins and areas, articles, board cases, Meh memory, «ссылка» fields…)
    const swap=v=>{if(v===goneId)return keepId;if(Array.isArray(v)){for(let i=0;i<v.length;i++)v[i]=swap(v[i]);return v}if(isRecord(v)){for(const k of Object.keys(v))v[k]=swap(v[k]);return v}return v};
    for(const [k,v] of Object.entries(ws))if(!['entities','relations','trash','id','entityTypes','relationTypes','statusGroups','playerLog'].includes(k))ws[k]=swap(v); /* 0.30.7: the journal of the players keeps what really happened */
    for(const e of data.entities)if(e.id!==goneId){swap(e.properties);if(e.map){swap(e.map);const ids=new Set();e.map.pins=(e.map.pins||[]).filter(p=>{if(ids.has(p.entityId))return false;ids.add(p.entityId);return true})}}
    for(const a of ws.articles||[])if(Array.isArray(a.links)){const k=new Set();a.links=a.links.filter(l=>{const x=l.kind+'|'+l.id;if(k.has(x))return false;k.add(x);return true})}
    replaceActiveEntities(data.entities.filter(e=>e.id!==goneId));
    for(const s of [state.selectedIds])if(s.has(goneId)){s.delete(goneId);s.add(keepId)}if(state.selectedId===goneId)state.selectedId=keepId;if(state.scopeId===goneId)state.scopeId=keepId;
    invalidateContainmentIndex();state.viewVersion++;
    if(!persist())throw new Error('не удалось сохранить');
  }catch(err){restoreWorkspaceMutation(before,beforeState);updateUI();toast('Объединить не получилось: '+(err?.message||err)+' — всё как было','err');return false}
  updateUI();toast(`Объединено в «${keep.name}» — второе имя «${gone.name}» осталось другим именем; убранная — в корзине, Ctrl+Z отменяет`,'ok');return true;
}
function mergeFlip(choice){const o={};for(const [k,v] of Object.entries(choice||{}))o[k]=v==='a'?'b':v==='b'?'a':v;return o}

// ---- окно «Объединить» ----
function openMergeDialog(aId,bId=null,opts={}){ /* opts.back — where to return after «Объединить» or «Отмена» (0.30.9: the review of the players' news) */
  const a=getEntity(aId);if(!a)return;
  const others=data.entities.filter(e=>e.id!==aId);
  const render=()=>{
    const b=getEntity(bId);
    const pickRow=d=>`<div class="mergeRow"><div class="mergeLabel">${escapeHtml(d.label)}</div><label class="mergeOpt"><input type="radio" name="mg-${escapeHtml(d.key)}" value="a" checked><span>${escapeHtml(String(d.a).slice(0,160))}</span></label><label class="mergeOpt"><input type="radio" name="mg-${escapeHtml(d.key)}" value="b"><span>${escapeHtml(String(d.b).slice(0,160))}</span></label>${d.both?`<label class="mergeOpt mergeBoth"><input type="radio" name="mg-${escapeHtml(d.key)}" value="both"><span>оба — одно за другим</span></label>`:''}</div>`;
    const sum=e=>`${rulesNum(relationRows(e).length,'связь','связи','связей')}${containmentChildren(e.id).length?` · внутри ${containmentChildren(e.id).length}`:''}${(e.media||[]).length?` · картинок ${(e.media||[]).length}`:''}`;
    $('#mergeBody').innerHTML=`<div class="mergeHead"><div class="mergeSide"><b>${escapeHtml(a.name)}</b><small>${escapeHtml(getET(a.type).name)} · ${escapeHtml(sum(a))}</small></div><div class="mergeArrow">+</div><div class="mergeSide">${b?`<b>${escapeHtml(b.name)}</b><small>${escapeHtml(getET(b.type).name)} · ${escapeHtml(sum(b))}</small>`:''}<input id="mergeWith" list="mergeList" placeholder="С какой сущностью объединить…" value="${escapeHtml(b?.name||'')}" autocomplete="off"><datalist id="mergeList">${others.slice(0,400).map(e=>`<option value="${escapeHtml(e.name)}">${escapeHtml(getET(e.type).name)}</option>`).join('')}</datalist></div></div>
    ${b?(()=>{const ds=mergeDiffers(a,b);return ds.length?`<div class="inlineHelp">Что оставить, где они различаются (остальное сложится само: связи, теги, картинки, метки на картах, статьи):</div>${ds.map(pickRow).join('')}`:'<div class="inlineHelp">Различий нет — всё сложится само.</div>'})():'<div class="inlineHelp">Выберите вторую сущность.</div>'}`;
    $('#mergeGo').disabled=!b;
    $('#mergeWith').onchange=ev=>{const n=mergeNorm(ev.target.value);const f=others.find(e=>mergeNorm(e.name)===n);if(f){bId=f.id;render()}};
  };
  openModal('Объединить двойников','<div id="mergeBody" class="stack"></div>',`<button type="button" class="btn" id="mergeCancel">Отмена</button><button type="button" class="btn primary" id="mergeGo">Объединить</button>`);
  $('#mergeCancel').onclick=()=>{closeModal();opts.back?.()};
  $('#mergeGo').onclick=()=>{const b=getEntity(bId);if(!b)return;const choice={};$$('#mergeBody input[type=radio]:checked').forEach(r=>choice[r.name.slice(3)]=r.value);
    // the one with more ties stays (fewer numbers to move); the choices are flipped to match
    const score=e=>relationRows(e).length+containmentChildren(e.id).length,root=currentRootId();
    const keepA=b.id===root?false:a.id===root?true:score(a)>=score(b);
    closeModal();if(keepA)mergeEntities(a.id,b.id,choice);else mergeEntities(b.id,a.id,mergeFlip(choice));opts.back?.()};
  render();
}

// ---- «Найти двойников» ----
function mergeEdit1(x,y){if(Math.abs(x.length-y.length)>1)return false;let i=0,j=0,d=0;while(i<x.length&&j<y.length){if(x[i]===y[j]){i++;j++;continue}if(++d>1)return false;if(x.length>y.length)i++;else if(y.length>x.length)j++;else{i++;j++}}return d+(x.length-i)+(y.length-j)<=1}
function findDuplicatePairs(){
  const ws=currentWorkspace(),no=new Set((ws?.notDuplicates||[]).map(p=>[...p].sort().join('|'))),root=currentRootId();
  const list=data.entities.filter(e=>e.id!==root).map(e=>({e,n:mergeNorm(e.name),s:mergeNorm(e.name).split(' ').map(w=>typeof ruNameStem==='function'?ruNameStem(w):w).join(' ')}));
  const out=[];
  for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
    const A=list[i],B=list[j];if(no.has([A.e.id,B.e.id].sort().join('|')))continue;
    let why='';
    if(A.n===B.n)why='одинаковые имена';else if(A.s===B.s)why='то же имя в другой форме';
    else if(A.n.length>=5&&B.n.length>=5&&mergeEdit1(A.n,B.n))why='отличаются одной буквой';
    else{const [s,l]=A.n.length<B.n.length?[A.n,B.n]:[B.n,A.n];if(s.length>=3&&(l.startsWith(s+' ')||l.endsWith(' '+s)))why='одно имя — часть другого'}
    if(why)out.push({a:A.e,b:B.e,why});
    if(out.length>=200)return out;
  }
  return out;
}
function openDuplicatesDialog(){
  const draw=()=>{const pairs=findDuplicatePairs();$('#dupBody').innerHTML=pairs.length?pairs.map((p,i)=>`<div class="dupRow"><div><b>${escapeHtml(p.a.name)}</b> <small>${escapeHtml(getET(p.a.type).name)}</small> — <b>${escapeHtml(p.b.name)}</b> <small>${escapeHtml(getET(p.b.type).name)}</small><div class="inlineHelp">${escapeHtml(p.why)}</div></div><div class="dupActs"><button type="button" class="btn primary" data-dup-merge="${i}">Объединить…</button><button type="button" class="btn" data-dup-no="${i}">Это разные</button></div></div>`).join(''):'<div class="empty">Похожих имён не нашлось.</div>';
    $('#dupBody').onclick=ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;const m=t.closest('[data-dup-merge]'),n=t.closest('[data-dup-no]');
      if(m){const p=pairs[Number(m.dataset.dupMerge)];closeModal();openMergeDialog(p.a.id,p.b.id)}
      if(n){const p=pairs[Number(n.dataset.dupNo)];const ws=currentWorkspace();const snap=snapshotWorkspaceMutation();ws.notDuplicates=[...(ws.notDuplicates||[]),[p.a.id,p.b.id]];if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);toast('Не удалось сохранить — всё как было','err')}draw()}}};
  openModal('Найти двойников','<div class="inlineHelp">Сущности с похожими именами. «Это разные» — больше не предлагать эту пару.</div><div id="dupBody" class="stack"></div>','<button type="button" class="btn primary" id="dupClose">Готово</button>');
  $('#dupClose').onclick=closeModal;draw();
}


$('#allRecDup')?.addEventListener('click',()=>openDuplicatesDialog());
