// Universe Graph — «Новое от игроков» (0.30.7): разбор после игры по журналу правок игроков (ws.playerLog, только у Мастера).
// Новые сущности — «Объединить с…» (окно объединения 0.29.4), «Оставить», «Скрыть от игроков»; новые связи и статьи —
// «Хорошо» / «Убрать»; изменения — «Вернуть как было» / «Хорошо»; удалённое — «Вернуть» / «Хорошо».
// «За последнюю игру» / «За всё время», «Показать разобранное». Модуль загружается после onlinehost.js; имена — rvw.
'use strict';
const rvwUI={all:false,done:false};
const RVW_FIELD_NAMES={name:'имя',type:'тип',description:'описание',note:'заметка',properties:'свойства',sectionData:'разделы',page:'страница',widgets:'блоки',tags:'теги',aliases:'другие имена',media:'картинки',style:'место и вид',map:'карта',status:'статусы',paper:'бумажка',board:'доска',from:'начало',to:'конец',label:'подпись',tier:'важность',title:'название',body:'текст',icon:'значок',parentId:'место в статьях',primaryFor:'основная статья бумажки',links:'ссылки',collect:'подборка',order:'порядок'};
function rvwLog(ws=currentWorkspace()){return Array.isArray(ws?.playerLog)?ws.playerLog:[]}
function rvwObj(ws,c,id){const list=c==='e'?ws.entities:c==='r'?ws.relations:ws.articles||[];return (list||[]).find(x=>x.id===id)||null}
// what still needs the Master: an entry whose thing is still there (or, for a deletion, still gone)
function rvwOpen(ws,x){if(x.ok)return false;const o=rvwObj(ws,x.c,x.id);if(x.op==='del')return !o;if(x.op==='back')return false;return !!o}
function rvwLastSession(ws=currentWorkspace()){const l=rvwLog(ws);return l.length?l[l.length-1].session:''}
function rvwEntries(ws=currentWorkspace()){const s=rvwLastSession(ws);return rvwLog(ws).filter(x=>(rvwUI.all||!s||x.session===s)&&(rvwUI.done||rvwOpen(ws,x)))}
function rvwCount(ws=currentWorkspace()){return rvwLog(ws).filter(x=>rvwOpen(ws,x)).length}
function rvwWhen(iso){const d=new Date(iso||'');return Number.isFinite(d.getTime())?d.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}
function rvwRow(ws,x,title,acts){return `<div class="rvwRow${x.ok?' isDone':''}"><div class="rvwWhat"><span class="rvwTitle">${title}</span><small>${escapeHtml(x.who||'?')} · ${escapeHtml(rvwWhen(x.at))}${x.ok?' · разобрано':''}</small></div><div class="rvwActs">${x.ok?'':acts}</div></div>`}
function rvwBodyHtml(){
  const ws=currentWorkspace();if(!ws)return '';const list=rvwEntries(ws);
  const news=list.filter(x=>x.op==='add'&&x.c==='e'),others=list.filter(x=>x.op==='add'&&x.c!=='e'),sets=list.filter(x=>x.op==='set'),dels=list.filter(x=>x.op==='del');
  const ent=x=>{const e=rvwObj(ws,'e',x.id);return `<button type="button" class="linkBtn" data-rvw-go="${escapeHtml(x.id)}">${escapeHtml(e?.name||x.name)}</button>${e?` <span class="rvwType">· ${escapeHtml(getET(e.type)?.name||'')}</span>`:''}`};
  const sec=(head,rows,empty)=>`<h4>${head} <small>(${rows.length})</small></h4>${rows.length?rows.join(''):`<div class="empty">${empty}</div>`}`;
  const L=(lid,a,t,cls='')=>`<button type="button" class="btn${cls}" data-rvw="${a}|${escapeHtml(lid)}">${t}</button>`;
  return `<div class="rvwBar"><label class="partCheck"><input type="checkbox" id="rvwAll"${rvwUI.all?' checked':''}> За всё время (а не только за последнюю игру)</label><label class="partCheck"><input type="checkbox" id="rvwDone"${rvwUI.done?' checked':''}> Показать разобранное</label></div>
  ${sec('Новые сущности',news.map(x=>rvwRow(ws,x,ent(x),L(x.lid,'merge','Объединить с…')+L(x.lid,'keep','Оставить',' primary')+L(x.lid,'hide','Скрыть от игроков'))),'Игроки не создавали сущностей.')}
  ${sec('Новые связи и статьи',others.map(x=>rvwRow(ws,x,`${x.c==='r'?'🔗':'📖'} ${escapeHtml(x.name)}`,L(x.lid,'keep','Хорошо',' primary')+L(x.lid,'drop','Убрать'))),'Нет.')}
  ${sec('Изменения',sets.map(x=>rvwRow(ws,x,`${x.c==='e'?ent(x):escapeHtml(x.name)}: ${escapeHtml((x.fields||[]).map(f=>RVW_FIELD_NAMES[f]||f).join(', '))}`,(x.before?L(x.lid,'undo','Вернуть как было'):'')+L(x.lid,'keep','Хорошо',' primary'))),'Игроки ничего не меняли.')}
  ${sec('Удалено игроками',dels.map(x=>rvwRow(ws,x,`🗑 ${escapeHtml(x.name)}`,L(x.lid,'back','Вернуть')+L(x.lid,'keep','Хорошо',' primary'))),'Ничего.')}`;
}
function rvwRender(){const b=$('#rvwBody');if(b)b.innerHTML=rvwBodyHtml()}
function rvwSave(){const ok=persist();updateUI();rvwRender();return ok}
function rvwAct(a,lid){
  const ws=currentWorkspace(),x=rvwLog(ws).find(z=>z.lid===lid);if(!x)return;
  if(a==='keep'){x.ok=true;rvwSave();return}
  if(a==='merge'){closeModal();openMergeDialog(x.id,null,{back:()=>{if(rvwCount())openPlayerReview()}});return} /* 0.30.9: after merging — back to the list while there is something left */
  if(a==='hide'){setEntitiesVis([x.id],'gm');x.ok=true;rvwSave();toast(`«${x.name}» скрыт от игроков`,'ok');return}
  if(a==='drop'){const list=x.c==='r'?ws.relations:ws.articles;const i=list.findIndex(z=>z.id===x.id);if(i>=0)list.splice(i,1);x.ok=true;rvwSave();toast('Убрано','ok');return}
  if(a==='undo'){const o=rvwObj(ws,x.c,x.id);if(!o||!x.before)return;for(const [f,v] of Object.entries(x.before)){if(v===null)delete o[f];else o[f]=clone(v)}x.ok=true;rvwSave();toast(`«${x.name}»: возвращено как было`,'ok');return}
  if(a==='back'){
    if(x.c==='e'){const t=wsTrash(ws).find(z=>z.entity?.id===x.id);if(!t){toast('В корзине этого уже нет','err');return}x.ok=true;trashRestore([t.id],{askName:false});rvwRender();return}
    if(x.old){const list=x.c==='r'?ws.relations:(ws.articles||(ws.articles=[]));if(list.some(z=>z.id===x.old.id)){x.ok=true;rvwSave();toast('Это уже вернули','ok');return} /* 0.30.9: brought back another way (the player undid it) — no twin */
      if(x.c==='r'&&!(getEntity(x.old.from)&&getEntity(x.old.to))){toast('Концов этой связи уже нет','err');return}list.push(clone(x.old));x.ok=true;rvwSave();toast('Возвращено','ok')}
  }
}
function openPlayerReview(){
  openModal('Новое от игроков',`<div id="rvwBody">${rvwBodyHtml()}</div>`,`<button type="button" class="btn primary" id="rvwClose">Готово</button>`);
  $('#rvwClose').onclick=closeModal;const box=$('#rvwBody');
  box.addEventListener('change',ev=>{if(ev.target.id==='rvwAll'){rvwUI.all=ev.target.checked;rvwRender()}if(ev.target.id==='rvwDone'){rvwUI.done=ev.target.checked;rvwRender()}});
  box.addEventListener('click',ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;
    const go=t.closest('[data-rvw-go]');if(go){closeModal();setSelected(go.dataset.rvwGo);updateUI();return}
    const b=t.closest('[data-rvw]');if(!b)return;const [a,lid]=b.dataset.rvw.split('|');rvwAct(a,lid)});
}
