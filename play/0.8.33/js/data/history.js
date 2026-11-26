// Universe Graph — Отмена и повтор (Ctrl+Z / Ctrl+Y).
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
// 0.30.9: an entry is a move {from, to} of the whole document (snapshots). Undo moves the world from `from` to `to`:
// if nothing else changed since, the snapshot is put back whole (as before); if others changed things in between (players
// in the online game), only this person's own change is taken back — histMerge3, field by field, record by record —
// and what the others did stays. Changes of others (historyOthers) do not enter the stack, they move the baseline.
let undoStack=[],redoStack=[],historyBaseline=null,historyApplying=false,historyOthers=false;
// three-way: cur — the world now, base — right after the change being taken back, want — right before it
function histMerge3(cur,base,want,stat={kept:0}){
  const J=v=>JSON.stringify(v===undefined?null:v),rec=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const jb=J(base),jw=J(want);if(jb===jw)return cur;const jc=J(cur);if(jc===jb)return clone(want);if(jc===jw)return cur;
  if(rec(cur)&&rec(base)&&rec(want)){const out={...cur};
    for(const k of new Set([...Object.keys(base),...Object.keys(want)])){
      if(!(k in want)){if(k in cur&&J(cur[k])===J(base[k]))delete out[k];else if(k in cur)stat.kept++;continue}
      if(!(k in base)){if(!(k in cur))out[k]=clone(want[k]);else if(J(cur[k])!==J(want[k]))stat.kept++;continue}
      if(!(k in cur)){stat.kept++;continue}
      out[k]=histMerge3(cur[k],base[k],want[k],stat)}
    return out}
  if(Array.isArray(cur)&&Array.isArray(base)&&Array.isArray(want)){const key=['id','lid'].find(k=>[cur,base,want].every(l=>l.every(x=>rec(x)&&typeof x[k]==='string')&&new Set(l.map(x=>x[k])).size===l.length));
    if(key){
      const B=new Map(base.map(x=>[x[key],x])),Wm=new Map(want.map(x=>[x[key],x])),out=[];
      for(const x of cur){const id=x[key],b=B.get(id),w=Wm.get(id);
        if(b&&w){out.push(histMerge3(x,b,w,stat));continue}
        if(b&&!w){if(J(x)===J(b))continue;stat.kept++;out.push(x);continue} /* made by the change — goes, unless changed since */
        out.push(x)}
      const have=new Set(out.map(x=>x[key]));
      want.forEach((w,i)=>{const id=w[key];if(have.has(id)||B.has(id))return; /* back what the change removed, next to its old neighbour */
        let at=0;for(let j=i-1;j>=0;j--){const p=out.findIndex(x=>x[key]===want[j][key]);if(p>=0){at=p+1;break}}out.splice(at,0,clone(w));have.add(id)});
      return out}}
  stat.kept++;return cur;
}
// the world as it should be after moving from `from` to `to`
function histMove(entry){const cur=dataSnapshot();if(cur===entry.from)return {doc:JSON.parse(entry.to),kept:0,cur};const stat={kept:0};return {doc:histMerge3(JSON.parse(cur),JSON.parse(entry.from),JSON.parse(entry.to),stat),kept:stat.kept,cur,merged:true}}
const deferredMediaDeleteIds=new Set();
function mediaHistoryReferencedIds(){
  const ids=new Set();
  for(const {from,to} of [...undoStack,...redoStack])for(const snapshot of [from,to]){
    try{for(const id of mediaDataIdsFromData(JSON.parse(snapshot)))ids.add(id)}catch{}
  }
  return ids;
}
function flushDeferredMediaDeletes(){
  if(!deferredMediaDeleteIds.size)return;
  const referenced=new Set(mediaDataIdsFromData(data));
  for(const id of mediaHistoryReferencedIds())referenced.add(id);
  for(const id of [...deferredMediaDeleteIds]){
    if(referenced.has(id))continue;
    try{UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}catch{}
    deferredMediaDeleteIds.delete(id);
  }
}
function deferObsoleteMedia(beforeDoc,afterDoc=data){
  const afterIds=new Set(mediaDataIdsFromData(afterDoc));
  for(const id of mediaDataIdsFromData(beforeDoc)){
    if(!afterIds.has(id))deferredMediaDeleteIds.add(id);
  }
}
function dataSnapshot(){
  const workspaces=new Set(Array.isArray(data.workspaces)?data.workspaces:[]),worldFields=worldReplacer(false);
  const viewFields=new Set(['updatedAt','view','positions','styleLock']);
  const syncFields=new Set(['updatedAt','syncRev','syncParent']);
  return JSON.stringify(data,function(key,value){
    if(this===data.metadata&&syncFields.has(key)||workspaces.has(this)&&viewFields.has(key))return undefined;
    return worldFields.call(this,key,value);
  });
}
// 0.25.3: the world's locked style is a setting, not an edit — it is not part of the undo history and survives undo/redo
function keepStyleLocks(from,to){const locks=new Map((from?.workspaces||[]).map(w=>[w.id,w.styleLock]));for(const w of to?.workspaces||[]){if(!locks.has(w.id))continue;const l=locks.get(w.id);if(l)w.styleLock=l;else delete w.styleLock}}
function initEditHistory(){historyBaseline=dataSnapshot();undoStack=[];redoStack=[];updateHistoryButtons()}
function updateHistoryButtons(){const on=window.UG_ONLINE_PLAYER&&typeof onp!=='undefined';$('#undoBtn').disabled=on?!onp.undo.length:!undoStack.length;$('#redoBtn').disabled=on?!onp.redo.length:!redoStack.length}
function recordPersistedChange(){const next=dataSnapshot();if(historyBaseline===null){historyBaseline=next;return}if(next===historyBaseline)return;if(historyOthers){historyBaseline=next;return} /* 0.30.9: a player's change — not the Master's to undo */
  if(!historyApplying){undoStack.push({from:next,to:historyBaseline});if(undoStack.length>60)undoStack.shift();redoStack=[]}historyBaseline=next;updateHistoryButtons();if(!historyApplying)flushDeferredMediaDeletes()}
function historyBlocked(){if(typeof viewAsPlayer==='function'&&viewAsPlayer()){toast('В режиме игрока отмена недоступна — это просмотр','err');return true}if($('#modalBack')?.classList.contains('open')){toast('Сначала закройте открытое окно — отмена изменит данные под ним','err');return true}return false}
// After undo/redo the current space or selection may no longer exist.
function repairStateAfterHistory(){if(!getEntity(state.scopeId)){state.scopeId=currentRootId();state.history=state.scopeId?[state.scopeId]:[];state.historyIndex=0}state.history=state.history.filter(id=>getEntity(id));if(!state.history.length&&state.scopeId)state.history=[state.scopeId];state.historyIndex=clamp(state.historyIndex,0,state.history.length-1);state.selectedIds=new Set([...state.selectedIds].filter(id=>getEntity(id)));if(state.focusedPath.some(id=>!getEntity(id))){state.focusedPath=[];state.traceStart=null;state.traceEnd=null}}
function undoEdit(){
  if(window.UG_ONLINE_PLAYER){if(typeof onpUndo==='function')onpUndo();return} /* 0.30.4: a player undoes only his own changes */
  if(!undoStack.length||historyBlocked())return;
  const entry=undoStack[undoStack.length-1];
  let previousData,mv;
  try { previousData=clone(data); mv=histMove(entry); data=mv.doc; keepStyleLocks(previousData,data); normalize(); state.viewVersion++; }
  catch(error){ console.warn('undo',error); data=previousData||data; toast('Не удалось отменить изменение','err'); return; }
  const current=mv.cur;
  historyApplying=true;
  const ok=persist();
  historyApplying=false;
  if(!ok){ data=previousData; normalize(); state.viewVersion++; updateUI(); updateHistoryButtons(); toast('Не удалось сохранить отмену — текущее состояние восстановлено','err'); return; }
  undoStack.pop(); redoStack.push({from:historyBaseline,to:current});
  flushDeferredMediaDeletes();
  state.selectedId=null;state.selectedRelationId=null;repairStateAfterHistory();updateUI();updateHistoryButtons();toast(mv.merged?'Отменено ваше последнее изменение — то, что после него поменяли игроки, осталось':'Изменение отменено','ok')
}
function redoEdit(){
  if(window.UG_ONLINE_PLAYER){if(typeof onpUndo==='function')onpUndo(true);return} /* 0.30.4: a player undoes only his own changes */
  if(!redoStack.length||historyBlocked())return;
  const entry=redoStack[redoStack.length-1];
  let previousData,mv;
  try { previousData=clone(data); mv=histMove(entry); data=mv.doc; keepStyleLocks(previousData,data); normalize(); state.viewVersion++; }
  catch(error){ console.warn('redo',error); data=previousData||data; toast('Не удалось повторить изменение','err'); return; }
  const current=mv.cur;
  historyApplying=true;
  const ok=persist();
  historyApplying=false;
  if(!ok){ data=previousData; normalize(); state.viewVersion++; updateUI(); updateHistoryButtons(); toast('Не удалось сохранить повтор изменения — текущее состояние восстановлено','err'); return; }
  redoStack.pop(); undoStack.push({from:historyBaseline,to:current});
  flushDeferredMediaDeletes();
  state.selectedId=null;state.selectedRelationId=null;repairStateAfterHistory();updateUI();updateHistoryButtons();toast('Изменение повторено','ok')
}

// Remove only the forgotten records from existing undo and redo snapshots.
function forgetDeletedEntityHistory(workspaceId,ids){
  const forgotten=new Set(ids);
  function scrub(text){
    const document=JSON.parse(text),ws=document.workspaces?.find(w=>w.id===workspaceId);
    if(!ws)return text;
    ws.entities=ws.entities.filter(e=>!forgotten.has(e.id));
    ws.relations=ws.relations.filter(r=>!forgotten.has(r.from)&&!forgotten.has(r.to));
    ws.trash=(ws.trash||[]).filter(t=>!forgotten.has(t.entity.id));
    normalizeBoards(ws,new Set(ws.entities.map(e=>e.id)));
    return JSON.stringify(document);
  }
  const keep=stack=>stack.map(entry=>({from:scrub(entry.from),to:scrub(entry.to)}))
    .filter(entry=>entry.from!==entry.to);
  undoStack=keep(undoStack);redoStack=keep(redoStack);
  updateHistoryButtons();
}
