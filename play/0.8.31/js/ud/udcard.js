// Universe Detective — правка прямо на бумажке (UD 0.2).
// Двойной щелчок по названию или описанию — поле прямо на бумажке (Enter / щелчок мимо — сохранить, Esc — отмена).
// У выбранной бумажки: «📷» — картинка (или перетащить файл на бумажку, или вставить Ctrl+V), щелчок по типу — выбор типа,
// по штампу статуса или «＋ статус» — меню статусов. Строка «▸ Подробнее» удлиняет бумажку вниз: там всё, что в Universe Graph
// было в правой панели (анкета, участники, задачи и награда у квеста…), и правится там же.
'use strict';
const udDetailsOpen=new Set(); // бумажки с открытым «Подробнее» (на время работы программы)
let udEditing=null;             // {id, field, el}

// ---- кусочки разметки бумажки (зовёт boardCardHtml) ----
function udEntityNote(e){return String(e?.note??e?.description??'')}
function udNoteExcerpt(note,max=120){
  const text=String(note??'').split(/\r\n?|\n/).map(line=>plainExcerpt(line,Number.MAX_SAFE_INTEGER)).join('\n').trim();
  return text.length>max?text.slice(0,max-1).trimEnd()+'…':text;
}
function udCardTextHtml(e,note,short,sel){
  const edit=udCanEditText(e,'desc');
  if(short){
    const full=udNoteExcerpt(note,1200);
    const hint=full+(edit?' · Двойной щелчок — изменить заметку':'');
    return `<div class="boardText" title="${escapeHtml(hint)}"${edit?' data-ud-edit="desc"':''}>${escapeHtml(short)}</div>`;
  }
  return sel&&edit?`<button type="button" class="udAddDesc" data-ud-edit-now="desc">＋ заметка</button>`:'';
}
function udCardToolsHtml(e,sel){
  if(!sel||worldReadOnly()||e.hint)return '';
  const id=escapeHtml(e.id);
  return `<button type="button" class="udRenameBtn" data-ud-edit-card="${id}" title="Изменить название и заметку" aria-label="Изменить">✎</button>`+
    (worldReadOnly()?'':`<button type="button" class="udPhotoBtn" data-ud-photo="${id}" title="Картинка" aria-label="Картинка">📷</button>`);
}
function udCardStatusHtml(e,sel,chips){
  const add=sel&&!worldReadOnly()&&statusGroupsForType(e.type).length?`<button type="button" class="udAddStatus" data-ud-status="${escapeHtml(e.id)}" title="Статусы: «Жив», «Пропал», «Утерян»…">${chips?'＋':'＋ статус'}</button>`:'';
  return chips||add?`<div class="boardChips"${chips&&sel&&!worldReadOnly()?` data-ud-status="${escapeHtml(e.id)}" title="Щелчок — изменить статусы"`:''}>${chips}${add}</div>`:'';
}
// UD 0.5: мастер меняет видимость прямо на выбранной бумажке; общие кнопки уже связаны с setEntitiesVis().
function udCardVisibilityHtml(e,sel){
  if(uiIsPlayerSafe()||e.id===currentRootId())return '';
  const v=entityVis(e);
  if(!sel)return v==='all'?'':`<span class="udVisIndicator" title="${escapeHtml(VIS_STATES.find(s=>s[0]===v)?.[1]||'')}">${visEyeSvg(v)}</span>`;
  const ids=state.selectedIds.has(e.id)?[...state.selectedIds]:[e.id];
  return `<div class="udVisibility">${visRowHtml(ids,v,{label:false})}</div>`;
}
function udCardMoreHtml(e,open=udDetailsOpen.has(e.id)){
  let body='';
  if(open){secOpenFilled=true;try{body=`<div class="udDetails">${renderPageHtml(sectionSubject('entity',e.id),{full:true})}</div>`}catch(err){body=`<div class="udDetails"><p class="muted">Не удалось показать подробности: ${escapeHtml(err.message)}</p></div>`}finally{secOpenFilled=false}}
  return `<button type="button" class="udMore${open?' open':''}" data-ud-more="${escapeHtml(e.id)}" aria-expanded="${open}" title="${open?'Свернуть подробности':'Подробнее: анкета, связи, задачи… — всё о сущности прямо на бумажке'}">${open?'▾ Свернуть':'▸ Подробнее'}</button>${body}`;
}
function uiIsPlayerSafe(){return typeof uiIsPlayer==='function'&&uiIsPlayer()}
function udCanEditText(e,field){
  if(!e||e.hint||viewAsPlayer())return false;
  if(!window.UG_ONLINE_PLAYER)return true;
  if(onp.state!=='in'||onp.me?.role!=='player')return false;
  return field==='name'||!udDescriptionRestricted(e,currentWorkspace(),e.blockHidden);
}

// ---- «Подробнее» ----
function udToggleDetails(id,on){if(udDescriptionDraft?.key==='entity:'+id&&!udFinishDescription(true))return;const want=on??!udDetailsOpen.has(id);if(want)udDetailsOpen.add(id);else udDetailsOpen.delete(id);state.viewVersion=(state.viewVersion||0)+1;renderDetective()}

// ---- правка названия и описания ----
function udStartEdit(id,field,paper=null){
  if(!udFinishEdit(true))return false;
  const e=getEntity(id),card=paper?$(`#detectiveView [data-ud-paper-id="${CSS.escape(paper)}"]`):$(`#detectiveView [data-board-id="${CSS.escape(id)}"]`);if(!e||!card)return false;
  if(!udCanEditText(e,field))return false;
  const cr=card.getBoundingClientRect(),src=card.querySelector(field==='name'?'.boardName':'.boardText,.udAddDesc')||card.querySelector('.boardName'),r=src.getBoundingClientRect();
  const z=state.boardZoom||1,fs=Math.max(12,parseFloat(getComputedStyle(src).fontSize)*z);
  const el=document.createElement(field==='name'?'input':'textarea');el.className='udEditor udEditor-'+field;el.value=field==='name'?e.name:udEntityNote(e);
  el.setAttribute('aria-label',field==='name'?'Название':'Заметка');if(field==='desc')el.placeholder='Короткая заметка о сущности. Ссылка на другую: [[Название]]';
  Object.assign(el.style,{left:zpx(cr.left+6)+'px',top:zpx(Math.max(4,r.top-3))+'px',width:zpx(Math.max(180,cr.width-12))+'px',fontSize:zpx(fs)+'px'});
  if(field==='desc')el.style.height=zpx(Math.max(90,Math.min(320,r.height+60)))+'px';
  document.body.appendChild(el);udEditing={id,field,el,initial:el.value};el.focus();if(field==='name')el.select();else el.setSelectionRange(el.value.length,el.value.length);
  el.addEventListener('keydown',ev=>{ev.stopPropagation();if(ev.key==='Escape'){ev.preventDefault();udFinishEdit(false)}else if(ev.key==='Enter'&&(field==='name'||ev.ctrlKey||ev.metaKey)){ev.preventDefault();udFinishEdit(true)}});
  el.addEventListener('blur',()=>setTimeout(()=>{if(udEditing?.el===el)udFinishEdit(true)},0));
  return true;
}
function udFinishEdit(save){
  const ed=udEditing;if(!ed)return true;
  const e=getEntity(ed.id),value=ed.el.value;
  if(save&&value!==ed.initial&&udCanEditText(e,ed.field)){
    const name=ed.field==='name';
    const next=name?value.replace(/\s+/g,' ').trim():value.trimEnd();
    if(name&&!next){toast('Введите название или нажмите Esc','err');ed.el.focus();return false}
    if(!boardCommit(()=>{e[name?'name':'note']=next;e.updatedAt=new Date().toISOString()},name?'Название изменено':'Заметка изменена')){
      ed.el.focus();return false;
    }
  }
  udEditing=null;ed.el.remove();return true;
}
// ---- тип ----
function udCloseMenu(){$('#udCardMenu')?.remove()}
function udOpenTypeMenu(id,anchor){
  const e=getEntity(id);if(!e)return;udCloseMenu();
  const m=document.createElement('div');m.id='udCardMenu';m.className='contextMenu open udCardMenu';m.setAttribute('role','menu');
  const option=t=>`<button type="button" role="menuitemradio" aria-checked="${t.id===e.type}" class="${t.id===e.type?'active':''}" data-ud-set-type="${escapeHtml(t.id)}"><span class="cmIcon" style="color:${escapeHtml(safeCssValue(t.color,'#9aa8c6'))}">${escapeHtml(t.icon||'◆')}</span>${escapeHtml(t.name)}</button>`;
  const groups=udTypeGroups('types',data.entityTypes);
  m.innerHTML=`<div class="udMenuHead">Тип «${escapeHtml(e.name)}»</div><input type="search" class="udTypeSearch" placeholder="Найти тип…" aria-label="Поиск типа">`+
    groups.map(([name,types])=>`<details class="udTypeGroup" ${types.some(t=>t.id===e.type)?'open':''}><summary>${escapeHtml(name)}</summary>${types.map(option).join('')}</details>`).join('')+
    '<button type="button" data-ud-set-type="">Без типа</button>';
  const search=m.querySelector('input');
  search.addEventListener('input',ev=>{
    const query=searchFold(ev.target.value.trim());
    for(const group of m.querySelectorAll('details')){
      const inGroup=searchFold(group.querySelector('summary').textContent).includes(query);
      const buttons=[...group.querySelectorAll('button')];
      for(const button of buttons)button.hidden=!inGroup&&!searchFold(button.textContent).includes(query);
      group.hidden=buttons.every(button=>button.hidden);
      if(query&&!group.hidden)group.open=true;
    }
    m.scrollTop=0;
  });
  search.addEventListener('keydown',ev=>{
    if(ev.key!=='Enter')return;
    ev.preventDefault();ev.stopPropagation();
    m.querySelector('details:not([hidden])[open] [data-ud-set-type]:not([hidden])')?.click();
  });
  if(!worldReadOnly()&&data.entityTypes.some(t=>t.id===e.type))m.insertAdjacentHTML('beforeend',`<div class="menuDivider"></div><button type="button" role="menuitem" data-ud-type-settings="${escapeHtml(e.type)}">Настроить тип…</button>`);
  document.body.appendChild(m);
  const r=anchor.getBoundingClientRect();
  function place(){
    const height=Math.min(m.getBoundingClientRect().height,innerHeight-16);
    m.style.left=zpx(Math.max(8,Math.min(innerWidth-m.getBoundingClientRect().width-8,r.left)))+'px';
    m.style.top=zpx(Math.max(8,Math.min(innerHeight-height-8,r.bottom+4+height>innerHeight?r.top-height-4:r.bottom+4)))+'px';
  }
  m.dataset.entity=id;place();
  m.addEventListener('toggle',place,true);
  search.addEventListener('input',place);
  search.focus({preventScroll:true});
}
function udSetType(id,typeId){if(worldReadOnly())return;const e=getEntity(id),t=typeId?data.entityTypes.find(x=>x.id===typeId):UNTYPED;udCloseMenu();if(!e||!t||e.type===typeId)return;
  boardCommit(()=>{e.type=typeId;e.updatedAt=new Date().toISOString()},`«${e.name}» — теперь ${t.name} · Ctrl+Z — вернуть`)}

// ---- картинка ----
function udBoardPhotoHtml(e,img,selected){
  const photo=e.board?.photo,ratio=Number(img.width)/Number(img.height);
  const height=photo?.height;
  const size=`--ud-photo-ratio:${Number.isFinite(ratio)&&ratio>0?ratio:4/3}${height?';--ud-photo-h:'+clamp(Number(height),UD_PHOTO_MIN_H,UD_PHOTO_MAX_H)+'px':''}`;
  const canResize=selected&&!worldReadOnly()&&!e.hint;
  const picture=`<img data-ud-photo-image hidden alt="${escapeHtml(img.alt||e.name)}" draggable="false"><span data-ud-photo-message>${window.UG_ONLINE_PLAYER&&onpImagePending(img.id)?'Снимок загружается…':'Подготовка фото…'}</span>`;
  return `<div class="boardPhoto${photo?.fit==='cover'?' udPhotoCover':''}" data-ud-board-media="${escapeHtml(img.id)}" data-ud-photo-width="${Number(img.width)||0}" data-ud-photo-height="${Number(img.height)||0}" style="${size}">${picture}
    ${canResize?`<span class="udPhotoResize" hidden data-ud-photo-resize="${escapeHtml(e.id)}" aria-hidden="true" title="Потяните нижний край фото, чтобы изменить высоту"></span>`:''}
  </div>`;
}
function udSavePhotoFrame(e,{height,fit}){
  if(worldReadOnly()||getEntity(e.id)!==e||!boardMainImage(e))return false;
  const photo=normalizeBoardPhoto({height,fit});
  return boardCommit(()=>{
    if(photo){e.board=e.board||{};e.board.photo=photo}
    else if(e.board)delete e.board.photo;
  });
}
function udOpenPhotoOptions(id){
  const e=getEntity(id);
  if(!e||e.hint||worldReadOnly())return;
  if(!boardMainImage(e)){udPickPhoto(id);return}
  const photo=e.board?.photo;
  openModal('Фото на бумажке',`<div class="form">
    <label for="udPhotoFit">Отображение</label>
    <select id="udPhotoFit"><option value="contain">Целиком</option><option value="cover" ${photo?.fit==='cover'?'selected':''}>Заполнить рамку</option></select>
    <label for="udPhotoHeight">Высота фото</label>
    <input id="udPhotoHeight" type="number" min="${UD_PHOTO_MIN_H}" max="${UD_PHOTO_MAX_H}" placeholder="Автоматически" value="${photo?.height||''}">
    <button type="button" class="btn" id="udPhotoAutoHeight">Автоматическая высота</button>
  </div>`,`<button type="button" class="btn" id="udPhotoReplace">Загрузить изображение</button>
  <button type="button" class="btn" id="udPhotoCancel">Отмена</button>
  <button type="button" class="btn primary" id="udPhotoSave">Сохранить</button>`);
  const height=$('#udPhotoHeight');
  $('#udPhotoAutoHeight').onclick=()=>{height.value='';height.focus()};
  $('#udPhotoReplace').onclick=()=>{if(closeModal())udPickPhoto(id)};
  $('#udPhotoCancel').onclick=()=>closeModal();
  $('#udPhotoSave').onclick=()=>{
    if(height.reportValidity()&&udSavePhotoFrame(e,{height:height.valueAsNumber,fit:$('#udPhotoFit').value}))closeModal();
  };
}
async function udSetPhoto(id,file){
  const e=getEntity(id);if(worldReadOnly()||!e||!file)return false;if(!/^image\//.test(file.type||'')){toast('Это не картинка — нужен файл изображения (jpg, png, webp…)','err');return false}
  if(entityMedia(e).length>=MEH_MEDIA_MAX_COUNT){toast(`У одной сущности не больше ${MEH_MEDIA_MAX_COUNT} картинок`,'err');return false}
  let meta;try{const processed=await processImageFile(file);if(worldReadOnly()||getEntity(id)!==e)return false;meta=newMediaMeta(processed,e.id);mediaPut(meta)}catch(err){toast(`${file.name||'Картинка'}: ${err?.message||'не удалось обработать'}`,'err');return false}
  const ok=boardCommit(()=>{const list=entityMedia(e).map(m=>{const c={...m};delete c.main;return c});e.media=[...list,{...meta,main:true}];e.updatedAt=new Date().toISOString()},`Картинка на бумажке «${e.name}» · Ctrl+Z — вернуть`);
  if(!ok){UniverseGraphStorage.mediaDelete(meta.id);invalidateMediaCache(meta.id)}
  return ok;
}
function udPickPhoto(id){let inp=$('#udPhotoInput');if(!inp){inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.id='udPhotoInput';inp.className='hidden';document.body.appendChild(inp);inp.addEventListener('change',()=>{const f=inp.files?.[0],to=inp.dataset.entity;inp.value='';if(f&&to)udSetPhoto(to,f)})}inp.dataset.entity=id;inp.click()}

// ---- привязки ----
(function bindUdCard(){
  const view=$('#detectiveView');if(!view)return;
  const freshDetailsButton=id=>view.querySelector(`[data-ud-more="${CSS.escape(id)}"]`);
  view.addEventListener('click',ev=>{
    const t=ev.target instanceof Element?ev.target:null;if(!t)return;let b;
    const stop=()=>{ev.preventDefault();ev.stopPropagation()};
    if((b=t.closest('[data-ud-more]'))){
      stop();
      const id=b.dataset.udMore;
      udToggleDetails(id);
      if(state.selectedId!==id)setSelected(id);
      freshDetailsButton(id)?.focus({preventScroll:true});
      return;
    }
    if((b=t.closest('[data-ud-edit-card]'))){stop();openEntityModal(b.dataset.udEditCard,{compact:true});return}
    if((b=t.closest('[data-ud-edit-now]'))){stop();const card=b.closest('[data-board-id]');udStartEdit(card?.dataset.boardId,b.dataset.udEditNow,card?.dataset.udPaperId);return}
    if((b=t.closest('[data-ud-photo]'))){stop();udOpenPhotoOptions(b.dataset.udPhoto);return}
    // the card may have been redrawn between press and release (selection) — the anchor is looked up again
    const fresh=(id,sel)=>$(`#detectiveView [data-board-id="${CSS.escape(id)}"] ${sel}`);
    if((b=t.closest('[data-ud-status]'))){stop();const id=b.dataset.udStatus;openStatusMenu(id,fresh(id,'[data-ud-status]')||b);return}
    const card=t.closest('[data-board-id]');
    if(card&&(b=t.closest('.boardKind,.boardFolderTab'))&&(state.selectedId===card.dataset.boardId)&&!worldReadOnly()){stop();const id=card.dataset.boardId;udOpenTypeMenu(id,fresh(id,'.boardKind,.boardFolderTab')||b);return}
    // inside «Подробнее»: fold a section; a related record — go to its card
    if(t.closest('.udDetails')){
      if((b=t.closest('[data-fold]'))){stop();if(udDescriptionDraft?.form.isConnected&&!udFinishDescription(true))return;const id=card?.dataset.boardId,subj=sectionSubject('entity',id),open=!!t.closest('[data-fold-panel]')?.classList.contains('isOpen');setFoldOpen(subj,b.dataset.fold,!open);if(typeof updateUIPrefsInspectorFolds==='function')updateUIPrefsInspectorFolds();renderDetective();return}
      if((b=t.closest('[data-related]'))&&!t.closest('button:not([data-related])')){stop();revealEntity(b.dataset.related);return}
    }
  },true);
  document.addEventListener('click',ev=>{
    const t=ev.target instanceof Element?ev.target:null;
    const menu=$('#udCardMenu');
    if(!menu)return;
    if(!menu.contains(t)){udCloseMenu();return}
    const settings=t?.closest('[data-ud-type-settings]');
    if(settings){ev.preventDefault();udCloseMenu();udSetShow('types',{edit:settings.dataset.udTypeSettings});return}
    const option=t?.closest('[data-ud-set-type]');
    if(option){ev.preventDefault();udSetType(menu.dataset.entity,option.dataset.udSetType)}
  },true);
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&$('#udCardMenu')){ev.stopPropagation();udCloseMenu()}},true);
  view.addEventListener('pointerdown',ev=>{
    const handle=ev.target.closest?.('[data-ud-photo-resize]');
    if(!handle||ev.button!==0||worldReadOnly())return;
    const entity=getEntity(handle.dataset.udPhotoResize);
    if(!entity||entity.hint)return;
    ev.preventDefault();ev.stopImmediatePropagation();
    const frame=handle.closest('.boardPhoto'),start=ev.clientY,original=frame.offsetHeight;
    const zoom=zsc(state.boardZoom||1);
    let height=original;
    handle.setPointerCapture(ev.pointerId);
    const move=event=>{
      if(event.pointerId!==ev.pointerId)return;
      height=clamp(original+(event.clientY-start)/zoom,UD_PHOTO_MIN_H,UD_PHOTO_MAX_H);
      frame.style.setProperty('--ud-photo-h',height+'px');
    };
    const finish=event=>{
      if(event.pointerId!==ev.pointerId)return;
      handle.removeEventListener('pointermove',move);
      handle.removeEventListener('pointerup',finish);
      handle.removeEventListener('lostpointercapture',finish);
      if(event.type==='pointerup'&&Math.abs(event.clientY-start)>3){
        if(!udSavePhotoFrame(entity,{height,fit:entity.board?.photo?.fit}))renderDetective();
      }else frame.style.setProperty('--ud-photo-h',entity.board?.photo?.height?entity.board.photo.height+'px':'');
    };
    handle.addEventListener('pointermove',move);
    handle.addEventListener('pointerup',finish);
    handle.addEventListener('lostpointercapture',finish);
  },true);
  // a picture file dropped on a card — it becomes the card's picture
  view.addEventListener('dragover',ev=>{if([...(ev.dataTransfer?.types||[])].includes('Files')&&ev.target instanceof Element&&ev.target.closest('[data-board-id]')){ev.preventDefault();ev.dataTransfer.dropEffect='copy'}});
  view.addEventListener('drop',ev=>{const f=[...(ev.dataTransfer?.files||[])].find(x=>/^image\//.test(x.type));const card=ev.target instanceof Element?ev.target.closest('[data-board-id]'):null;if(!f||!card)return;ev.preventDefault();ev.stopPropagation();if(worldReadOnly())return;udSetPhoto(card.dataset.boardId,f)});
  // Ctrl+V with a picture in the clipboard and a card selected
  document.addEventListener('paste',ev=>{const tg=document.activeElement;if(tg&&['INPUT','TEXTAREA'].includes(tg.tagName)||tg?.isContentEditable)return;if($('#modalBack')?.classList.contains('open'))return;const id=state.selectedId;if(!id||!getEntity(id)||worldReadOnly())return;
    const f=[...(ev.clipboardData?.items||[])].find(i=>i.kind==='file'&&/^image\//.test(i.type))?.getAsFile();if(!f)return;ev.preventDefault();udSetPhoto(id,f)});
  // the board moves or zooms — an open field saves and closes (it would float away from its card)
  view.addEventListener('wheel',()=>{if(udEditing)udFinishEdit(true)},{passive:true});
})();

