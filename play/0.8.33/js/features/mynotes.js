// Universe Graph — личные заметки (0.28): «чатик с самим собой». Кнопка внизу слева рабочей зоны — свиток с пером.
// Короткие записи с датой: написать (Enter), поправить (✎), удалить (×), найти. Живут в мире (ws.myNotes) — переживают
// перезапуск, экспорт и отмену. Слева — столбик «чьи заметки»: Мастер, участники этого мира (0.30.1) и «Все»; сами
// игроки пишут свои заметки, когда играют по сети (0.30.8): у игрока столбика нет — только его заметки, они уходят Мастеру.
// В режиме «глазами игрока» кнопка спрятана — это заметки Мастера.
// Модуль загружается обычным <script> перед app.js.
'use strict';
const MY_NOTES_MAX=2000;
const myNotes={open:false,q:'',editing:null,owner:'gm'};
function myNotesList(){const ws=currentWorkspace();if(!ws)return [];if(!Array.isArray(ws.myNotes))return [];return ws.myNotes.filter(n=>n&&typeof n.text==='string')}
function myNotesCommit(fn,okText){
  const ws=currentWorkspace();if(!ws)return false;const snap=snapshotWorkspaceMutation();
  if(!Array.isArray(ws.myNotes))ws.myNotes=[];fn(ws.myNotes);if(ws.myNotes.length>MY_NOTES_MAX)ws.myNotes=ws.myNotes.slice(-MY_NOTES_MAX);
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить заметку — всё как было','err');return false}
  if(okText)toast(okText,'ok');renderMyNotes();return true;
}
function myNotesNet(){return !!window.UG_ONLINE_PLAYER}
function myNoteAdd(text){const t=String(text||'').trim().slice(0,4000);if(!t)return false;return myNotesCommit(list=>list.push({id:uid('note'),owner:myNotesNet()?(typeof onp!=='undefined'&&onp.me?.id)||'me':myNotes.owner==='all'?'gm':myNotes.owner,text:t,at:new Date().toISOString()}))}
function myNoteEdit(id,text){const t=String(text||'').trim().slice(0,4000);if(!t)return myNoteDelete(id);return myNotesCommit(list=>{const n=list.find(x=>x.id===id);if(n&&n.text!==t){n.text=t;n.edited=new Date().toISOString()}})}
function myNoteDelete(id){return myNotesCommit(list=>{const i=list.findIndex(x=>x.id===id);if(i>=0)list.splice(i,1)},myNotesNet()?'Заметка удалена':'Заметка удалена · Ctrl+Z — вернуть')}
function myNoteWhen(iso){const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';const now=new Date(),same=d.toDateString()===now.toDateString();
  return same?d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' '+d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
function myNotesScrollSvg(){return '<svg class="myNotesIcon" viewBox="0 0 28 28" aria-hidden="true"><path d="M6 6.5h11.5a2.5 2.5 0 0 1 0 5H8.5v8.5a2.5 2.5 0 0 1-5 0V9a2.5 2.5 0 0 1 2.5-2.5Z" class="scroll"/><path d="M8.5 11.5h9.5v9a2.5 2.5 0 0 1-2.5 2.5H6" class="scroll"/><path d="M25 3.5c-4.2 1-7.4 4.4-9.2 9.4l1.6 1.2c3.2-3.8 6.2-6.7 7.6-10.6Z" class="quill"/><path d="M15.8 12.9l-1.6 4" class="quill-line"/></svg>'}
function renderMyNotes(){
  const btn=$('#myNotesBtn'),box=$('#myNotes'),net=myNotesNet();const player=!net&&typeof uiIsPlayer==='function'&&uiIsPlayer();
  if(btn){btn.hidden=player;btn.classList.toggle('on',myNotes.open);btn.setAttribute('aria-expanded',String(myNotes.open));const n=myNotesList().length;btn.title=`Мои заметки${n?` (${n})`:''} — чатик с самим собой`}
  if(!box)return;box.hidden=!myNotes.open||player;if(box.hidden)return;
  box.classList.toggle('isNet',net);if(net){myNotes.owner='all';$('#myNotesOwners').innerHTML=''}
  /* 0.30.1: the column of owners — «Я», every participant of this world, and «Все» */
  const parts=typeof partsInWorld==='function'?partsInWorld():[];if(myNotes.owner!=='gm'&&myNotes.owner!=='all'&&!parts.some(p=>p.id===myNotes.owner))myNotes.owner='gm';
  const own=myNotes.owner,mine=n=>!n.owner||n.owner==='gm';
  const q=myNotes.q.trim().toLowerCase(),all=myNotesList().filter(n=>own==='all'||(own==='gm'?mine(n):n.owner===own)),list=q?all.filter(n=>n.text.toLowerCase().includes(q)):all;
  const ob=(id,inner,title)=>`<button type="button" class="myOwner${own===id?' on':''}" data-my-owner="${escapeHtml(id)}" title="${escapeHtml(title)}" aria-pressed="${own===id}">${inner}</button>`;
  if(!net)$('#myNotesOwners').innerHTML=ob('gm',`${myNotesScrollSvg()}<small>Я</small>`,'Мои заметки (Мастер)')+parts.map(p=>ob(p.id,`${partAvatarHtml(p,'partAva small')}<small>${escapeHtml(p.name)}</small>`,`Заметки участника «${p.name}»`)).join('')
    +(parts.length?ob('all','👥<small>Все</small>','Заметки всех: и ваши, и участников'):`<button type="button" class="myOwner" data-my-owner-add title="Добавить участников — у каждого будут свои заметки">👥<small>Игроки</small></button>`);
  const who=own!=='gm'&&own!=='all'?parts.find(p=>p.id===own):null;
  const inp=$('#myNotes .myNotesInput');if(inp)inp.hidden=own!=='gm'&&!net;
  const author=n=>{if(own!=='all'||net)return '';const p=mine(n)?null:parts.find(x=>x.id===n.owner)||(typeof partGet==='function'?partGet(n.owner):null);return `<span class="myNoteBy" style="--part-c:${escapeHtml(p?.color||'')}">${escapeHtml(p?p.name:mine(n)?'Я':'удалённый участник')}</span> `};
  $('#myNotesList').innerHTML=list.length?list.map(n=>myNotes.editing===n.id?`<div class="myNote editing" data-my-note="${escapeHtml(n.id)}"><textarea class="myNoteEdit" aria-label="Изменить заметку">${escapeHtml(n.text)}</textarea><div class="myNoteBtns"><button type="button" class="btn" data-my-save="${escapeHtml(n.id)}">Сохранить</button><button type="button" class="btn" data-my-cancel>Отмена</button></div></div>`
    :`<div class="myNote" data-my-note="${escapeHtml(n.id)}"><div class="myNoteText">${author(n)}${escapeHtml(n.text)}</div><div class="myNoteMeta"><small>${escapeHtml(myNoteWhen(n.at))}${n.edited?' · изменено':''}</small><button type="button" class="myNoteBtn" data-my-edit="${escapeHtml(n.id)}" title="Изменить" aria-label="Изменить заметку">✎</button><button type="button" class="myNoteBtn" data-my-del="${escapeHtml(n.id)}" title="Удалить" aria-label="Удалить заметку">×</button></div></div>`).join('')
    :`<div class="myNotesEmpty">${q?'Ничего не нашлось.':who?`Здесь будут личные заметки «${escapeHtml(who.name)}» — он пишет их сам, когда играет по сети.`:net?'Здесь — ваши личные заметки: мысли по ходу игры, «не забыть». Их видите вы и Мастер. Напишите внизу и нажмите Enter.':own==='all'?'Заметок пока нет.':'Здесь — ваши заметки для себя: мысли по ходу игры, «не забыть», идеи. Напишите внизу и нажмите Enter.'}</div>`;
  if(!myNotes.editing){const l=$('#myNotesList');l.scrollTop=l.scrollHeight}else $('#myNotesList .myNoteEdit')?.focus();
}
function toggleMyNotes(on=!myNotes.open){myNotes.open=!!on;myNotes.editing=null;renderMyNotes();if(myNotes.open)setTimeout(()=>$('#myNoteInput')?.focus(),0)}
{
  $('#myNotesBtn')?.addEventListener('click',e=>{e.stopPropagation();toggleMyNotes()});
  $('#myNotesClose')?.addEventListener('click',()=>toggleMyNotes(false));
  $('#myNotesSearch')?.addEventListener('input',e=>{myNotes.q=e.target.value;renderMyNotes()});
  const send=()=>{const inp=$('#myNoteInput');if(inp&&myNoteAdd(inp.value)){inp.value='';inp.focus()}};
  $('#myNoteSend')?.addEventListener('click',send);
  $('#myNoteInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
  $('#myNotes')?.addEventListener('click',e=>{const t=e.target instanceof Element?e.target:null;if(!t)return;let b;
    if((b=t.closest('[data-my-edit]'))){myNotes.editing=b.dataset.myEdit;renderMyNotes();return}
    if((b=t.closest('[data-my-del]'))){myNoteDelete(b.dataset.myDel);return}
    if((b=t.closest('[data-my-save]'))){const v=$('#myNotesList .myNoteEdit')?.value;myNotes.editing=null;myNoteEdit(b.dataset.mySave,v);return}
    if(t.closest('[data-my-cancel]')){myNotes.editing=null;renderMyNotes();return}
    if(t.closest('[data-my-owner-add]')){if(typeof openParticipants==='function')openParticipants({add:true});return}
    if((b=t.closest('[data-my-owner]'))&&!b.disabled){myNotes.owner=b.dataset.myOwner;myNotes.editing=null;renderMyNotes()}});
  $('#myNotes')?.addEventListener('keydown',e=>{const ta=e.target instanceof Element&&e.target.closest('.myNoteEdit');if(!ta)return;
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const id=ta.closest('[data-my-note]').dataset.myNote;myNotes.editing=null;myNoteEdit(id,ta.value)}else if(e.key==='Escape'){e.stopPropagation();myNotes.editing=null;renderMyNotes()}});
  renderMyNotes();
}
