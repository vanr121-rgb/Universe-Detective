// Universe Graph — менеджер тегов (0.29.4). Все теги рабочей зоны со счётчиком: переименовать (везде — у сущностей, статей,
// в правилах подборок), слить два в один, удалить везде, цвет тега; нажал на тег — его сущности. Вкладка «Теги» в «Наборе
// правил» и кнопка в левой панели. Подсказка при вводе тега — из уже существующих (чтобы не плодить «маг» и «Маги»).
// Теги одинаковые без учёта больших букв и е/ё: «Маг» и «маг» — один тег (показывается самым частым написанием).
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';
function tagKey(t){return searchFold(String(t||'').trim().replace(/^#/,''))}
function tagColors(ws=currentWorkspace()){return isRecord(ws?.tagColors)?ws.tagColors:{}}
function tagColor(t){return tagColors()[tagKey(t)]||''}
// every «tags» list in the workspace: records (and those in the trash), articles, collection rules of article sections
function tagLists(ws=currentWorkspace(),fn){
  const walk=(v,d=0)=>{if(d>8||!v||typeof v!=='object')return;if(Array.isArray(v)){for(const x of v)walk(x,d+1);return}for(const [k,x] of Object.entries(v)){if(k==='tags'&&Array.isArray(x)){const r=fn(x,v);if(Array.isArray(r))v.tags=r}else walk(x,d+1)}};
  walk(ws?.entities);walk(ws?.articles);walk(ws?.trash);
}
function allTags(){
  const m=new Map();
  for(const e of data.entities)for(const t of e.tags||[]){const k=tagKey(t);if(!k)continue;let x=m.get(k);if(!x)m.set(k,x={key:k,spell:new Map(),ids:[]});x.spell.set(t,(x.spell.get(t)||0)+1);if(!x.ids.includes(e.id))x.ids.push(e.id)}
  return [...m.values()].map(x=>({key:x.key,name:[...x.spell].sort((a,b)=>b[1]-a[1])[0][0],ids:x.ids,count:x.ids.length,spellings:[...x.spell.keys()]})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ru'));
}
function tagCommit(fn,okText){if(rulesPlayerMode())return false;const ws=currentWorkspace();if(!ws)return false;const snap=snapshotWorkspaceMutation();let r;try{r=fn(ws)}catch(err){restoreWorkspaceMutation(snap.data,snap.state);toast('Не получилось: '+(err?.message||err),'err');return false}if(r===false){restoreWorkspaceMutation(snap.data,snap.state);return false}if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё как было','err');return false}updateUI();if(okText)toast(okText,'ok');if(tagsUI.open)renderTagsTab();return true}
// rename = merge when the new name is an existing tag
function renameTagInWorkspace(ws,from,name){
  const key=tagKey(from),nextKey=tagKey(name);
  let changed=0;
  tagLists(ws,list=>{
    if(!list.some(t=>tagKey(t)===key))return;
    changed++;
    const unique=new Map();
    for(const tag of list){
      const value=tagKey(tag)===key?name:tag;
      if(!unique.has(tagKey(value)))unique.set(tagKey(value),value);
    }
    return [...unique.values()];
  });
  const colors=tagColors(ws);
  if(colors[key]&&!colors[nextKey])ws.tagColors={...colors,[nextKey]:colors[key]};
  if(key!==nextKey&&ws.tagColors)delete ws.tagColors[key];
  return changed;
}
function renameTag(from,to){
  const name=String(to||'').trim().replace(/^#/,'');
  if(!tagKey(from)||!tagKey(name))return false;
  return tagCommit(ws=>renameTagInWorkspace(ws,from,name)>0,`Тег «${from}» → «${name}»`);
}
function deleteTag(tag){const k=tagKey(tag);let n=0;return tagCommit(ws=>{tagLists(ws,list=>{if(!list.some(t=>tagKey(t)===k))return;n++;return list.filter(t=>tagKey(t)!==k)});if(ws.tagColors)delete ws.tagColors[k];return n>0},`Тег «${tag}» убран отовсюду`)}
function setTagColor(tag,color){const k=tagKey(tag);return tagCommit(ws=>{ws.tagColors={...tagColors(ws)};if(color)ws.tagColors[k]=String(color).slice(0,20);else delete ws.tagColors[k]},null)}

// ---- вкладка «Теги» ----
const tagsUI={open:false,q:'',openKey:null};
function tagsTabHtml(){
  const all=allTags(),q=searchFold(tagsUI.q.trim()),list=q?all.filter(t=>t.key.includes(q)):all,editable=!rulesPlayerMode();
  if(!all.length)return '<div class="rulesIntro">Тегов пока нет. Теги можно добавить при редактировании карточки.</div>';
  return `<div class="rulesIntro">Все теги этой рабочей зоны. ${editable?'Переименовать — везде сразу. Если имя уже есть, теги объединятся. ':''}Нажмите на тег, чтобы увидеть его сущности.</div>
  <input type="search" class="rulesSearch" id="tagsSearch" placeholder="Найти тег…" value="${escapeHtml(tagsUI.q)}" autocomplete="off">
  <div class="tagsList">${list.map(t=>`<div class="tmRow${tagsUI.openKey===t.key?' open':''}">${editable?`<input type="color" class="tagColor" data-tag-color="${escapeHtml(t.key)}" value="${cssRgbHex(tagColor(t.name),'#8fb7ff')}" title="Цвет тега">`:``}<button type="button" class="tagName" data-tag-open="${escapeHtml(t.key)}" title="Показать сущности с этим тегом"><span class="tagChip"${tagColor(t.name)?` style="--tag-color:${escapeHtml(tagColor(t.name))}"`:''}>#${escapeHtml(t.name)}</span><small>${rulesNum(t.count,'сущность','сущности','сущностей')}${t.spellings.length>1?` · пишется по-разному: ${escapeHtml(t.spellings.join(', '))}`:''}</small></button>${editable?`<button type="button" class="iconBtn" data-tag-rename="${escapeHtml(t.key)}" title="Переименовать или слить с другим">✎</button><button type="button" class="iconBtn" data-tag-del="${escapeHtml(t.key)}" title="Убрать тег отовсюду">×</button>`:``}${tagsUI.openKey===t.key?`<div class="tagEnts">${t.ids.map(getEntity).filter(Boolean).map(e=>`<button type="button" class="linkBtn" data-tag-ent="${escapeHtml(e.id)}">${escapeHtml(e.name)}</button>`).join('')}<button type="button" class="btn tiny" data-tag-select="${escapeHtml(t.key)}">Выделить все</button></div>`:''}</div>`).join('')||'<div class="empty">Ничего не нашлось.</div>'}</div>`;
}
function renderTagsTab(){const b=document.querySelector('.rulesBody');if(!b||rulesTab!=='tags')return;b.innerHTML=tagsTabHtml();bindTagsTab()}
function bindTagsTab(){
  tagsUI.open=true;const b=document.querySelector('.rulesBody');if(!b)return;const find=k=>allTags().find(t=>t.key===k);
  const s=$('#tagsSearch');if(s)s.oninput=()=>{tagsUI.q=s.value;const pos=s.selectionStart;renderTagsTab();const n=$('#tagsSearch');n.focus();try{n.setSelectionRange(pos,pos)}catch{}};
  b.onclick=ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;
    const o=t.closest('[data-tag-open]');if(o){tagsUI.openKey=tagsUI.openKey===o.dataset.tagOpen?null:o.dataset.tagOpen;renderTagsTab();return}
    // 0.29.4: rename in the row itself — the program (Electron) has no prompt() window
    const r=t.closest('[data-tag-rename]');if(r){const x=find(r.dataset.tagRename);if(!x)return;const row=r.closest('.tmRow'),nameBtn=row.querySelector('.tagName');
      const box=document.createElement('span');box.className='tagRenameBox';box.innerHTML=`<input class="tagRenameInput" value="${escapeHtml(x.name)}" aria-label="Новое имя тега" title="Новое имя (имя другого тега — сольются)"><button type="button" class="btn tiny" data-tag-ok>✓</button>`;nameBtn.replaceWith(box);
      const inp=box.querySelector('input');inp.focus();inp.select();const done=()=>{const v=inp.value.trim().replace(/^#/,'');if(v&&v!==x.name)renameTag(x.name,v);else renderTagsTab()};
      inp.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();done()}if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();renderTagsTab()}};box.querySelector('[data-tag-ok]').onclick=done;return}
    const d=t.closest('[data-tag-del]');if(d){const x=find(d.dataset.tagDel);if(x&&confirm(`Убрать тег «${x.name}» у ${rulesNum(x.count,'сущности','сущностей','сущностей')}?`))deleteTag(x.name);return}
    const e=t.closest('[data-tag-ent]');if(e){closeModal();revealEntity(e.dataset.tagEnt);return} /* UD: open its place on the board and centre the card */
    const a=t.closest('[data-tag-select]');if(a){const x=find(a.dataset.tagSelect);if(!x)return;closeModal();state.selectedIds=new Set(x.ids);state.selectedId=x.ids[0]||null;updateUI();toast(`Выделено: ${rulesNum(x.ids.length,'сущность','сущности','сущностей')} с тегом «${x.name}»`,'ok')}};
  b.onchange=ev=>{const c=ev.target.closest?.('[data-tag-color]');if(c){const x=find(c.dataset.tagColor);if(x)setTagColor(x.name,c.value)}};
}

// ---- подсказка при вводе тегов (поле «Теги» через запятую) ----
function tagSuggestBind(input){
  if(!input||input.dataset.tagSuggest)return;input.dataset.tagSuggest='1';
  const box=document.createElement('div');box.className='tagSuggest';box.hidden=true;input.insertAdjacentElement('afterend',box);
  const draw=()=>{const parts=input.value.split(','),last=parts[parts.length-1].trim().replace(/^#/,''),k=tagKey(last),used=new Set(parts.slice(0,-1).map(tagKey));
    if(!k){box.hidden=true;return}const hits=allTags().filter(t=>!used.has(t.key)&&t.key!==k&&t.key.includes(k)).slice(0,8);const exact=allTags().find(t=>t.key===k&&t.name!==last);
    const list=exact?[exact,...hits]:hits;if(!list.length){box.hidden=true;return}
    box.innerHTML=(exact?'<small>Уже есть:</small>':'')+list.map(t=>`<button type="button" class="tagChip" data-tag-pick="${escapeHtml(t.name)}">#${escapeHtml(t.name)} <small>${t.count}</small></button>`).join('');box.hidden=false};
  input.addEventListener('input',draw);input.addEventListener('focus',draw);input.addEventListener('blur',()=>setTimeout(()=>{box.hidden=true},150));
  box.addEventListener('mousedown',ev=>{const b=ev.target.closest('[data-tag-pick]');if(!b)return;ev.preventDefault();const parts=input.value.split(',');parts[parts.length-1]=' '+b.dataset.tagPick;input.value=parts.join(',').replace(/^\s+/,'')+', ';input.dispatchEvent(new Event('input'));input.focus()});
}


$('#tagsBtn')?.addEventListener('click',()=>{tagsUI.q='';tagsUI.openKey=null;openRulesModal('tags')});
// a tag chip on a record's page → the manager with that tag open
document.addEventListener('click',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-tag-goto]'):null;if(!b)return;ev.preventDefault();udSetShow('tags',{tag:tagKey(b.dataset.tagGoto)})},true); // capture: the page's own click handlers must not swallow it
