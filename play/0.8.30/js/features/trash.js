// Universe Graph — корзина (0.29.2). Удалённая сущность не исчезает: она ложится в корзину своей рабочей зоны (ws.trash)
// вместе со всем, что её касалось, — связями (и «внутри кого» она была), кто лежал внутри неё, метками и областями на чужих
// картах, ссылками статей. Отсюда её можно вернуть (связи возвращаются, если второй конец жив; родителя нет — в корень),
// удалить навсегда или очистить корзину. Через ws.trashDays дней (30; 0 — «пока не очищу») сущность удаляется сама.
// Картинки сущности в корзине не стираются (media.js считает и их). Ctrl+Z по-прежнему отменяет само удаление.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';
const TRASH_MAX=1000,TRASH_DAYS=[[7,'7 дней'],[30,'30 дней'],[90,'90 дней'],[0,'пока не очищу']];
function wsTrash(ws=currentWorkspace()){if(!ws)return [];if(!Array.isArray(ws.trash))ws.trash=[];return ws.trash}
function trashDays(ws=currentWorkspace()){const d=Number(ws?.trashDays);return Number.isFinite(d)&&d>=0?d:30}
// Called by deleteEntities BEFORE the records are removed: everything needed to put them back.
function trashCapture(ids,{networkShared=false}={}){
  const ws=currentWorkspace();if(!ws)return;const set=new Set(ids),at=new Date().toISOString(),batch=uid('del'),trash=wsTrash(ws);
  for(const id of ids){
    const e=getEntity(id);if(!e)continue;
    const relations=data.relations.filter(r=>r.from===id||r.to===id).map(clone);
    const pins=[],areas=[];
    for(const o of data.entities){if(set.has(o.id))continue;const m=entityMap(o);if(!m)continue;for(const p of m.pins||[])if(p.entityId===id)pins.push({ownerId:o.id,pin:clone(p)});for(const a of m.areas||[])if(a.entityId===id)areas.push({ownerId:o.id,areaId:a.id})}
    const articleLinks=[];for(const a of ws.articles||[])for(const l of a.links||[])if(l.kind==='entity'&&l.id===id)articleLinks.push({articleId:a.id,link:clone(l)});
    trash.push({id:uid('trash'),batch,at,...(networkShared?{networkShared:true}:{}),entity:clone(e),parent:containmentParent(id),children:containmentChildren(id).filter(c=>!set.has(c)&&containmentParent(c)===id),relations,pins,areas,articleLinks,paperBoards:udCapturePaperBoards(ws,id)});
  }
  if(trash.length>TRASH_MAX)trash.splice(0,trash.length-TRASH_MAX);
}
function trashExpire(ws=currentWorkspace()){
  const days=trashDays(ws);if(!ws||!days||!Array.isArray(ws.trash)||!ws.trash.length)return 0;
  const limit=Date.now()-days*86400000,before=ws.trash.length;ws.trash=ws.trash.filter(t=>Date.parse(t.at)>=limit);return before-ws.trash.length;
}

function trashParentFallback(parent,waiting,exclude){
  const seen=new Set([exclude]);
  while(parent&&!seen.has(parent)){
    if(getEntity(parent))return parent;
    seen.add(parent);
    parent=waiting.get(parent)?.parent;
  }
  return currentRootId();
}

function trashKeepRelations(item,waiting){
  const id=item.entity.id;
  for(const relation of item.relations||[]){
    const otherId=relation.from===id?relation.to:relation.to===id?relation.from:null;
    const other=waiting.get(otherId);
    if(!other||other===item)continue;
    if(!other.relations.some(r=>r.id===relation.id))other.relations.push(clone(relation));
    if(relation.udMembership||!getRT(relation.type)?.containment)continue;
    if(relation.to===id&&item.parent===other.entity.id&&!other.children.includes(id)){
      other.children.push(id);
    }else if(relation.from===id&&item.children.includes(other.entity.id)){
      // A later deletion can have saved the temporary parent created by deletion.
      const fallback=trashParentFallback(item.parent,waiting,id);
      if(other.parent!==fallback)continue;
      other.parent=id;
      other.relations=other.relations.filter(r=>r.id===relation.id||r.from!==fallback||
        r.to!==other.entity.id||r.udMembership||!getRT(r.type)?.containment);
    }
  }
}

// Puts one thing back. Returns a short note about what could not come back as it was (or null).
function trashRestoreOne(item,notes,waiting){
  const e=clone(item.entity);if(getEntity(e.id)){notes.push(`«${e.name}» уже в мире`);return false}
  data.entities.push(e);
  const has=id=>id===e.id||!!getEntity(id),contain=ensureContainsType(),isC=r=>!!getRT(r.type)?.containment;
  // the ones that lay inside it were moved to its parent on delete; if they are still there, that move is undone
  const fallback=trashParentFallback(item.parent,waiting,e.id),own=new Set((item.relations||[]).map(r=>r.id)),childBack=new Set();
  for(const c of item.children||[]){
    if(!getEntity(c))continue;const cur=data.relations.filter(x=>isC(x)&&!x.udMembership&&x.to===c);
    if(cur.length===1&&cur[0].from===fallback&&!own.has(cur[0].id)){data.relations.splice(data.relations.indexOf(cur[0]),1);childBack.add(c)}
    else if(!cur.length)childBack.add(c);
  }
  let parentBack=false;
  for(const r of item.relations||[]){
    if(data.relations.some(x=>x.id===r.id))continue;
    if(!has(r.from)||!has(r.to))continue;
    if(isC(r)){
      if(data.relations.some(x=>isC(x)&&x.from===r.from&&x.to===r.to)||wouldCreateContainmentCycle(r.from,r.to))continue;
      if(!r.udMembership){
        if(r.to===e.id){if(data.relations.some(x=>isC(x)&&!x.udMembership&&x.to===e.id))continue;parentBack=true}
        else if(r.from===e.id&&!childBack.has(r.to))continue;
      }
    }
    data.relations.push(clone(r));
  }
  if(item.parent&&!parentBack&&!getEntity(item.parent)&&fallback&&fallback!==e.id&&
     !data.relations.some(x=>isC(x)&&!x.udMembership&&x.to===e.id)){
    data.relations.push({id:uid('relation'),from:fallback,to:e.id,type:contain.id,properties:{},style:{}});
    const parent=getEntity(fallback);
    notes.push(`«${e.name}»: прежний контейнер недоступен · текущее место «${parent?.name||fallback}»`);
  }
  for(const c of childBack)if(!data.relations.some(x=>isC(x)&&!x.udMembership&&x.to===c)&&!wouldCreateContainmentCycle(e.id,c))data.relations.push({id:uid('relation'),from:e.id,to:c,type:contain.id,properties:{},style:{}});
  for(const p of item.pins||[]){const o=getEntity(p.ownerId),m=o&&entityMap(o);if(m&&!m.pins.some(x=>x.entityId===e.id))m.pins.push(clone(p.pin))}
  for(const a of item.areas||[]){const o=getEntity(a.ownerId),ar=o&&entityMap(o)?.areas.find(x=>x.id===a.areaId);if(ar&&!ar.entityId)ar.entityId=e.id}
  const ws=currentWorkspace();for(const l of item.articleLinks||[]){const art=(ws?.articles||[]).find(x=>x.id===l.articleId);if(art){art.links=art.links||[];if(!art.links.some(x=>x.kind==='entity'&&x.id===e.id))art.links.push(clone(l.link))}}
  return true;
}
function trashCommit(fn,okText){
  if(worldReadOnly())return false;
  const ws=currentWorkspace();if(!ws)return false;const before=clone(data),beforeState=snapshotMutationState();
  let r;try{r=fn(ws)}catch(err){restoreWorkspaceMutation(before,beforeState);updateUI();toast('Не получилось: '+(err?.message||err),'err');return false}
  if(r===false){restoreWorkspaceMutation(before,beforeState);return false}
  invalidateContainmentIndex();state.viewVersion++;
  if(!persist()){restoreWorkspaceMutation(before,beforeState);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return false}
  deferObsoleteMedia(before);flushDeferredMediaDeletes();updateUI();if(okText)toast(okText,'ok');return true;
}
function trashRestore(ids,{askName=true}={}){
  if(window.UG_ONLINE_PLAYER){if(worldReadOnly())return 0;udZoneCommand('trashRestore',{ids});return ids.length}
  if(worldReadOnly())return 0;

  const want=new Set(ids),items=wsTrash().filter(t=>want.has(t.id));if(!items.length)return 0;
  if(askName){const clash=items.filter(t=>data.entities.some(x=>x.name===t.entity.name&&x.id!==t.entity.id)).map(t=>t.entity.name);if(clash.length&&!confirm(`Сущность с таким именем уже есть: ${clash.slice(0,5).join(', ')}.\nВернуть всё равно?`))return 0}
  const notes=[];let n=0;
  const ok=trashCommit(ws=>{
    const restored=new Set(),placements=[];
    const waiting=new Map(wsTrash(ws).map(t=>[t.entity.id,t]));
    for(const t of items)if(trashRestoreOne(t,notes,waiting)){
      n++;restored.add(t.id);placements.push(...(t.paperBoards||[]));
      waiting.delete(t.entity.id);
      trashKeepRelations(t,waiting);
      invalidateContainmentIndex();
    }
    udRestorePaperBoards(ws,placements,waiting);
    ws.trash=ws.trash.filter(t=>!restored.has(t.id));
    return n>0;
  },null);
  if(ok){toast(`Возвращено из корзины: ${rulesNum(n,'сущность','сущности','сущностей')}${notes.length?' · '+notes.join('; '):''}`,'ok');if(trashUI.open)renderTrash()}
  return ok?n:0;
}
function trashForget(ids){if(window.UG_ONLINE_PLAYER){if(worldReadOnly())return 0;udZoneCommand('trashForget',{ids});return ids.length}const want=new Set(ids),forgot=wsTrash().filter(t=>want.has(t.id)),n=forgot.length;if(!n)return 0;if(!trashCommit(ws=>{ws.trash=ws.trash.filter(t=>!want.has(t.id))},`Удалено навсегда: ${rulesNum(n,'сущность','сущности','сущностей')}`))return 0;forgetDeletedEntityHistory(currentWorkspace().id,forgot.map(t=>t.entity.id));if(trashUI.open)renderTrash();return n}
function trashEmptyState(){const b=$('#trashEmpty');if(!b)return;const n=wsTrash().length;b.disabled=!n;b.title=n?'Удалить всё из корзины навсегда':'Корзина пуста'} /* 0.30.9: the button did nothing on an empty trash */
function trashEmpty(){const n=wsTrash().length;if(!n)return 0;if(!confirm(`Очистить корзину? ${rulesNum(n,'сущность','сущности','сущностей')} удалятся навсегда.`))return 0;return trashForget(wsTrash().map(t=>t.id))}
function trashSetDays(d){const v=Number(d);if(!Number.isFinite(v)||v<0)return;trashCommit(ws=>{ws.trashDays=v;trashExpire(ws)},v?`Корзина хранит удалённое ${v} дней`:'Корзина хранит удалённое, пока вы её не очистите')}

// ---- окно «Корзина» ----
const trashUI={open:false,q:''};
function trashWhen(iso){const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`}
function trashRowHtml(t){
  const e=t.entity,et=getET(e.type),rel=(t.relations||[]).filter(r=>!getRT(r.type).containment).length,kids=(t.children||[]).length,pins=(t.pins||[]).length;
  const what=[rel?rulesNum(rel,'связь','связи','связей'):'',kids?`внутри было ${kids}`:'',pins?`меток на картах: ${pins}`:''].filter(Boolean).join(' · ');
  const left=trashDays()?Math.max(0,Math.ceil((Date.parse(t.at)+trashDays()*86400000-Date.now())/86400000)):null;
  const mates=wsTrash().filter(x=>x.batch===t.batch&&x.id!==t.id).length;
  return `<div class="trashRow" data-trash-row="${escapeHtml(t.id)}"><span class="trashIcon" style="color:${escapeHtml(safeCssValue(e.style?.color||et.color,'#8fb7ff'))}">${escapeHtml(e.style?.icon||et.icon||'•')}</span><div class="trashMain"><b>${escapeHtml(e.name)}</b><small>${escapeHtml(et.name)} · удалена ${escapeHtml(trashWhen(t.at))}${left!=null?` · удалится сама через ${rulesNum(left,'день','дня','дней')}`:''}${what?' · '+escapeHtml(what):''}</small></div><div class="trashActs"><button type="button" class="btn" data-trash-back="${escapeHtml(t.id)}">Вернуть</button>${mates?`<button type="button" class="btn" data-trash-back-batch="${escapeHtml(t.batch)}" title="Удалённые одним действием">Вернуть вместе с ещё ${mates}</button>`:''}<button type="button" class="btn danger" data-trash-forget="${escapeHtml(t.id)}" title="Удалить навсегда">×</button></div></div>`;
}
function trashBodyHtml(){
  const all=wsTrash().slice().reverse(),q=searchFold(trashUI.q.trim()),list=q?all.filter(t=>searchFold(t.entity.name+' '+getET(t.entity.type).name).includes(q)):all;
  return `<div class="trashBar"><input type="search" id="trashSearch" placeholder="Найти в корзине…" value="${escapeHtml(trashUI.q)}" autocomplete="off"><label class="trashDays">Хранить <select id="trashDays">${TRASH_DAYS.map(([d,n])=>`<option value="${d}"${d===trashDays()?' selected':''}>${n}</option>`).join('')}</select></label></div>
  <div class="trashList">${list.length?list.map(trashRowHtml).join(''):`<div class="empty">${all.length?'Ничего не нашлось.':'Корзина пуста. Удалённые сущности попадают сюда — их можно вернуть.'}</div>`}</div>`;
}
function renderTrash(){const box=$('#trashBody');if(!box)return;const pos=$('#trashSearch')?.selectionStart;box.innerHTML=trashBodyHtml();const cnt=$('#trashCount');if(cnt)cnt.textContent=String(wsTrash().length);trashEmptyState();const s=$('#trashSearch');if(s&&document.activeElement?.id!=='trashSearch'&&trashUI.q){s.focus();try{s.setSelectionRange(pos??s.value.length,pos??s.value.length)}catch{}}updateTrashButton()}
function openTrash(){
  if(viewAsPlayer())return;

  trashExpire();trashUI.open=true;
  openModal('Корзина',`<div class="trashHead">В корзине: <b id="trashCount">${wsTrash().length}</b></div><div id="trashBody">${trashBodyHtml()}</div>`,`<button type="button" class="btn danger" id="trashEmpty">Очистить корзину</button><button type="button" class="btn primary" id="trashClose">Готово</button>`);
  $('#trashClose').onclick=closeModal;$('#trashEmpty').onclick=()=>trashEmpty();trashEmptyState();
  const box=$('#trashBody');
  box.addEventListener('input',ev=>{if(ev.target.id==='trashSearch'){trashUI.q=ev.target.value;const l=box.querySelector('.trashList');const tmp=document.createElement('div');tmp.innerHTML=trashBodyHtml();l.replaceWith(tmp.querySelector('.trashList'))}});
  box.addEventListener('change',ev=>{if(ev.target.id==='trashDays')trashSetDays(ev.target.value)});
  box.addEventListener('click',ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;
    const b=t.closest('[data-trash-back]');if(b){trashRestore([b.dataset.trashBack]);return}
    const bb=t.closest('[data-trash-back-batch]');if(bb){trashRestore(wsTrash().filter(x=>x.batch===bb.dataset.trashBackBatch).map(x=>x.id));return}
    const f=t.closest('[data-trash-forget]');if(f){const it=wsTrash().find(x=>x.id===f.dataset.trashForget);if(it&&confirm(`Удалить «${it.entity.name}» навсегда?`))trashForget([it.id])}});
}
function updateTrashButton(){const b=$('#trashBtn');if(!b)return;b.hidden=viewAsPlayer();const n=wsTrash().length;const c=b.querySelector('.trashN');if(c)c.textContent=n?String(n):'';b.title=n?`Корзина: ${rulesNum(n,'сущность','сущности','сущностей')} — можно вернуть`:'Корзина — удалённые сущности можно вернуть'}


$('#trashBtn')?.addEventListener('click',()=>openTrash());
