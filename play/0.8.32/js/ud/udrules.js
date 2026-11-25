// Настройки рабочей зоны в панели над доской.
'use strict';
const UD_SET = {
  types:{title:'Типы',add:'Тип сущности',list:()=>data.entityTypes,count:t=>countByType(t.id),icon:t=>t.icon||'◆',remove:deleteEntityType},
  relations:{title:'Связи',add:'Тип связи',list:()=>data.relationTypes,count:t=>countByRelationType(t.id),icon:()=>'━',remove:deleteRelationType},
  statuses:{title:'Статусы',add:'Группа статусов',list:()=>data.statusGroups,count:g=>g.options.length,icon:g=>g.kind==='flags'?'⚑':'◐',remove:deleteStatusGroup},
  tags:{title:'Теги',list:allTags,count:t=>t.count,icon:()=>'#'},
};
let udSetState=null;
const udSetEl=$('#udSet');
const udSetForm=$('#udSetForm');
const udSetList=$('#udSetList');
const udSetSearch=$('#udSetSearch');
const udSetGroupForm=$('#udSetGroupForm');
let udSetDrag=null;

function udSetClose(restoreFocus=false){
  const tab=udSetState?.tab;
  udSetState=null;udSetDrag=null;udSetGroupForm.hidden=true;udSetGroupForm.reset();
  udSetEl.hidden=true;
  udSetForm.hidden=true;
  udSetForm.replaceChildren();
  for(const button of document.querySelectorAll('[data-ud-rules]')){
    button.classList.remove('active');
    button.setAttribute('aria-expanded','false');
  }
  if(restoreFocus&&tab)$(`[data-ud-rules="${tab}"]`)?.focus();
}

function udSetShow(tab,{edit,tag,toggle=false}={}){
  if(!UD_SET[tab]||!rulesTabAllowed(tab)||!udSetFinish())return false;
  if(toggle&&udSetState?.tab===tab){udSetClose(true);return true}
  if($('#modalBack').classList.contains('open')&&!closeModal())return false;
  udSetClose();
  udPeopleSetOpen(false);
  udSetState={tab,workspace:state.workspaceId,player:rulesPlayerMode(),edit:null,tag:tag||null};
  const button=$(`[data-ud-rules="${tab}"]`);
  button.classList.add('active');
  button.setAttribute('aria-expanded','true');
  $('#udSetTitle').textContent=UD_SET[tab].title;
  $('#udSetAdd').hidden=!UD_SET[tab].add;
  $('#udSetAdd').textContent='＋ '+(UD_SET[tab].add||'');
  $('#udSetAddGroup').hidden=!udSetCanGroup(tab);
  $('#udSetAddGroup').textContent=tab==='statuses'?'＋ Раздел':'＋ Группа';
  $('#udSetPresets').hidden=udSetState.player;
  udSetSearch.value='';
  udSetEl.hidden=false;
  const anchor=button.getBoundingClientRect();
  const parent=udSetEl.offsetParent.getBoundingClientRect();
  const maxLeft=parent.width-udSetEl.getBoundingClientRect().width-8;
  udSetEl.style.left=zpx(Math.max(8,Math.min(maxLeft,anchor.left-parent.left)))+'px';
  udSetRefresh();
  if(edit)udSetEdit(edit);
  else udSetSearch.focus();
  return true;
}

function udSetRowId(item){return item.id??item.key}
function udSetFind(id){return UD_SET[udSetState.tab].list().find(x=>udSetRowId(x)===id)}

function udSetCanGroup(tab){return ['types','relations','statuses'].includes(tab)&&!rulesPlayerMode()}
function udSetGroups(tab,items){
  const groups=new Map(tab==='statuses'?[['Шкалы',[]],['Метки',[]]]:udTypeGroups(tab,items));
  if(tab==='statuses')for(const item of items){
    const name=item.group||(item.kind==='flags'?'Метки':'Шкалы');
    if(!groups.has(name))groups.set(name,[]);
    groups.get(name).push(item);
  }
  if(tab!=='statuses'&&!groups.has('Другое'))groups.set('Другое',[]);
  for(const name of currentWorkspace()?.udRuleGroups?.[tab]||[])if(!groups.has(name))groups.set(name,[]);
  return [...groups];
}
function udSetMoveToGroup(tab,id,group){
  if(!udSetCanGroup(tab))return false;
  const items=UD_SET[tab].list(),item=items.find(row=>row.id===id);
  if(!item||item.containment||tab==='relations'&&group==='Вложенность')return false;
  const groups=udSetGroups(tab,items);
  const target=groups.find(([name])=>name===group);
  if(!target||target[1].includes(item))return false;
  const origin=groups.find(([,rows])=>rows.includes(item))?.[0];
  return commitRulesChange(()=>{
    const ws=currentWorkspace();
    ws.udRuleGroups??={};
    ws.udRuleGroups[tab]=[...new Set([...(ws.udRuleGroups[tab]||[]),group,...(origin?[origin]:[])])];
    item.group=group;
  },'Перемещено в «'+group+'»');
}
function udSetRefresh(){
  const panel=udSetState;
  if(!panel)return;
  if(panel.workspace!==state.workspaceId||panel.player!==rulesPlayerMode()||!rulesTabAllowed(panel.tab)){
    udSetClose();
    return;
  }
  const spec=UD_SET[panel.tab],query=searchFold(udSetSearch.value.trim());
  const grouped=['types','relations','statuses'].includes(panel.tab);
  const groups=grouped?udSetGroups(panel.tab,spec.list()):[['',spec.list()]];
  const items=groups.flatMap(([group,rows])=>rows.filter(x=>searchFold(x.name+' '+(x.reverseName||'')+' '+group).includes(query)));
  const isTags=panel.tab==='tags';
  const rowHtml=item=>{
    const id=escapeHtml(udSetRowId(item)),name=escapeHtml(item.name);
    const color=escapeHtml(safeCssValue(isTags?tagColor(item.name):item.color,'var(--skin-text)'));
    const label=isTags?`data-ud-set-tag="${id}" aria-expanded="${panel.tag===item.key}"`:
      `data-ud-set-edit="${id}" aria-expanded="${panel.edit===item.id}"`;
    const tagEdit=isTags&&!panel.player?`<button type="button" class="iconBtn" data-ud-set-edit="${id}" aria-label="Изменить тег ${name}" aria-expanded="${panel.edit===item.key}">✎</button>`:'';
    const tagList=isTags&&panel.tag===item.key?`<div class="udSetTagCards">${item.ids.map(getEntity).filter(Boolean).map(e=>`<button type="button" class="linkBtn" data-ud-set-card="${escapeHtml(e.id)}">${escapeHtml(e.name)}</button>`).join('')}<button type="button" class="btn tiny" data-ud-set-select="${id}">Выделить все</button></div>`:'';
    const countLabel=panel.tab==='relations'?'Связей':panel.tab==='statuses'?'Вариантов':'Карточек';
    const grip=grouped&&!panel.player&&!item.containment?'<span class="udSetGrip" draggable="true" title="Перетащить в другую группу">⠿</span>':'';
    return `<div class="udSetRow" data-ud-set-row="${id}"><button type="button" class="udSetRowName" ${label}><span style="color:${color}">${escapeHtml(spec.icon(item))}</span><span>${name}</span><small title="${countLabel}">${spec.count(item)}</small></button>${tagEdit}${grip}</div>${tagList}`;
  };
  const openGroups=new Set([...udSetList.querySelectorAll('[data-ud-type-group][open]')].map(el=>el.dataset.udTypeGroup));
  const html=(grouped&&!query?groups.map(([name,rows])=>`<details data-ud-type-group="${escapeHtml(name)}" class="udTypeGroup"${openGroups.has(name)||panel.tab==='statuses'&&panel.listHtml===undefined||rows.some(row=>row.id===panel.edit)?' open':''}><summary>${escapeHtml(name)} <small>${rows.length}</small></summary>${rows.map(rowHtml).join('')}</details>`).join(''):items.map(rowHtml).join(''))||`<div class="empty">${query?'Ничего не найдено.':'Список пуст.'}</div>`;
  if(html===panel.listHtml)return;
  panel.listHtml=html;
  const focused=udSetForm.contains(document.activeElement)?document.activeElement:null;
  if(!udSetForm.hidden)udSetList.before(udSetForm);
  udSetList.innerHTML=html;
  if(panel.edit!==null){
    const row=udSetList.querySelector(`[data-ud-set-row="${CSS.escape(panel.edit)}"]`);
    row?.after(udSetForm);
  }
  focused?.focus({preventScroll:true});
}

function udSetOptions(entries,value){
  return entries.map(([id,label])=>`<option value="${escapeHtml(id)}"${id===value?' selected':''}>${escapeHtml(label)}</option>`).join('');
}

function udSetSectionRow(section){
  return `<label><input type="checkbox" name="section" value="${escapeHtml(section.id)}" checked> ${escapeHtml(sectionIcon(section))} ${escapeHtml(sectionTitle(section))}</label>`;
}

function udSetSectionChoices(){
  const selected=new Set(new FormData(udSetForm).getAll('section'));
  const existing=new Set(udSetState.page.filter(sec=>selected.has(sec.id)).map(sec=>sec.kind));
  const choices=Object.entries(SECTION_KINDS).filter(([id,kind])=>kind.subjects.includes('entity')&&!UD_NO_SECTIONS.has(id)&&!(kind.unique&&existing.has(id)));
  const select=udSetForm.elements.sectionKind;
  const previous=select.value;
  select.innerHTML=udSetOptions(choices.map(([id,kind])=>[id,kind.name]),previous);
  udSetForm.querySelector('[data-ud-set-add-section]').disabled=!choices.length;
}

const UD_THREAD_NUMBERS=[
  ['width','Толщина',2],['opacity','Непрозрачность',1],['curve','Изгиб',0],
  ['dashSize','Длина штриха',7],['dashGap','Промежуток',7],['arrowSize','Размер стрелки',8],
  ['animationSpeed','Скорость анимации',1],['labelSize','Размер подписи',11],
];
function udThreadNumber(item,[key,label,base]){
  const [min,max]=RELATION_NUMBERS[key];
  return `<label>${label}<input name="${key}" type="number" min="${min}" max="${max}" step="any" inputmode="decimal" value="${escapeHtml(item?.[key]??base)}"></label>`;
}
function udReadThreadType(values,item){
  const next={};
  for(const [key] of UD_THREAD_NUMBERS){
    const field=udSetForm.elements.namedItem(key),value=Number(field.value||field.defaultValue);
    if(!item||value!==Number(field.defaultValue))next[key]=clamp(value,...RELATION_NUMBERS[key]);
  }
  for(const [key,invert] of [['arrow',false],['animated',false],['labelVisible',true]]){
    const field=udSetForm.elements.namedItem(key),value=invert?!field.checked:field.checked;
    if(!item||field.checked!==field.defaultChecked)next[key]=value;
  }
  for(const [key,base] of [['lineStyle','solid'],['animationStyle','dot']]){
    const field=udSetForm.elements.namedItem(key),value=values.get(key);
    if(!item||value!==(Array.from(field.options).find(option=>option.defaultSelected)?.value||base))next[key]=value;
  }
  const color=udSetForm.elements.namedItem('color');
  if(!item||color.value!==color.defaultValue)next.color=color.value;
  return next;
}

function udSetEdit(id){
  const panel=udSetState,tab=panel.tab,item=id?udSetFind(id):null;
  if(panel.player||(id&&!item)||(!id&&tab==='tags'))return;
  panel.edit=id;
  panel.listHtml=null;
  const isTag=tab==='tags',color=isTag?tagColor(item.name):item?.color;
  const name=`<label>Название <input name="name" required maxlength="80" value="${escapeHtml(item?.name||'')}"></label>`;
  const colorInput=`<label>Цвет <input name="color" type="color" value="${cssRgbHex(color,'#8fb7ff')}"></label>`;
  let fields=name;
  if(udSetCanGroup(tab)&&!item?.containment){
    const choices=udSetGroups(tab,UD_SET[tab].list()).filter(([n])=>tab!=='relations'||n!=='Вложенность');
    fields+=`<label>Группа <select name="ruleGroup">${udSetOptions([['','Автоматически'],...choices.map(([n])=>[n,n])],item?.group||'')}</select></label>`;
  }
  if(tab==='types'){
    panel.page=clone(typePage(item,'entity'));
    fields+=`<label>Значок <input name="icon" maxlength="8" value="${escapeHtml(item?.icon||'✦')}"></label>${colorInput}`;
    fields+=`<details class="udSetDetails"><summary>Анкета <small>${item?.fields?.length||0}</small></summary>${fieldsEditorHtml(item?.fields)}</details>
      <details class="udSetDetails"><summary>Разделы «Подробнее»</summary><div class="udSetChecks" id="udSetSections">${panel.page.filter(sec=>!UD_NO_SECTIONS.has(sec.kind)).map(udSetSectionRow).join('')}</div><div class="udSetActions"><select name="sectionKind" aria-label="Вид раздела"></select><button type="button" class="btn tiny" data-ud-set-add-section>＋ Раздел</button></div></details>`;
  }else if(tab==='relations'){
    fields+=`${colorInput}<label>Линия <select name="lineStyle">${udSetOptions(Object.entries(RULES_LINE_NAMES),item?.lineStyle||'solid')}</select></label>
      ${udThreadNumber(item,UD_THREAD_NUMBERS[0])}
      <label>Обратное название <input name="reverseName" maxlength="80" value="${escapeHtml(item?.reverseName||'')}"></label>
      <label class="udSetCheck"><input name="arrow" type="checkbox"${item?.arrow?' checked':''}> Стрелка</label>
      <details class="udSetDetails"><summary>Оформление нити</summary><div class="udThreadFields">
        ${UD_THREAD_NUMBERS.slice(1).map(field=>udThreadNumber(item,field)).join('')}
        <label>Вид анимации<select name="animationStyle">${udSetOptions(Object.entries(THREAD_ANIMATION_NAMES),item?.animationStyle||'dot')}</select></label>
        <label class="udSetCheck"><input name="animated" type="checkbox"${item?.animated?' checked':''}> Анимация</label>
        <label class="udSetCheck"><input name="labelVisible" type="checkbox"${item?.labelVisible===false?' checked':''}> Скрывать подпись</label>
      </div></details>`;
  }else if(tab==='statuses'){
    fields+=`<label>Вид <select name="kind">${udSetOptions([['scale','Шкала'],['flags','Метки']],item?.kind||'scale')}</select></label>
      <details class="udSetDetails"><summary>Типы карточек</summary><small>Без выбора группа доступна всем типам.</small><div class="udSetChecks">${data.entityTypes.map(t=>`<label><input name="appliesTo" type="checkbox" value="${escapeHtml(t.id)}"${item?.appliesTo?.includes(t.id)?' checked':''}> ${escapeHtml((t.icon||'◆')+' '+t.name)}</label>`).join('')}</div></details>
      <details class="udSetDetails" open><summary>Варианты статуса</summary><div id="udSetStatusOptions">${(item?.options||[{}]).map(statusOptionRow).join('')}</div><button type="button" class="btn tiny" data-ud-set-add-status>＋ Вариант</button></details>`;
  }else{
    fields+=colorInput+`<label class="udSetCheck"><input name="customColor" type="checkbox"${color?' checked':''}> Свой цвет</label><small class="udSetDetails" id="udSetTagHint"></small>`;
  }
  udSetForm.innerHTML=`<div class="udSetFields">${fields}</div><div class="udSetActions">
    <small class="udSetSaveNote">Правка сохранится при выходе из редактора</small><button class="btn tiny" type="submit">Сохранить сейчас</button><button type="button" class="btn tiny" data-ud-set-cancel>Отмена</button>
    ${item&&!item.containment?`<button type="button" class="btn tiny danger" data-ud-set-delete="${escapeHtml(id)}">Удалить</button>`:''}</div>`;
  udSetForm.hidden=false;
  udSetList.before(udSetForm);
  if(tab==='types'){bindFieldsEditor(udSetForm);udSetSectionChoices()}
  if(tab==='statuses')bindStatusOptionOrder($('#udSetStatusOptions'));
  if(isTag)udSetTagHint();
  panel.originalForm=udSetFormSnapshot();
  udSetRefresh();
  udSetForm.elements.namedItem('name').focus();
}

function udSetCancel(){
  udSetState.edit=null;
  udSetForm.hidden=true;
  udSetForm.replaceChildren();
  udSetList.before(udSetForm);
  udSetRefresh();
}

function udSetTagHint(){
  const key=tagKey(udSetForm.elements.namedItem('name').value);
  const match=key!==udSetState.edit&&udSetFind(key);
  $('#udSetTagHint').textContent=match?`Теги объединятся в «${match.name}».`:'';
}

function udSetFormSnapshot(){
  return JSON.stringify([...udSetForm.querySelectorAll('input,select,textarea')].filter(el=>el.name!=='sectionKind')
    .map(el=>el.type==='checkbox'?el.checked:el.value));
}
function udSetFinish(){
  if(!udSetState||udSetState.edit===null)return true;
  if(udSetState.originalForm===udSetFormSnapshot()){udSetCancel();return true}
  if(!udSetForm.reportValidity())return false;
  return udSetSave();
}
function udSetSave(){
  const panel=udSetState;
  if(!panel||panel.edit===null||panel.workspace!==state.workspaceId||rulesPlayerMode())return false;
  const tab=panel.tab,values=new FormData(udSetForm),item=panel.edit?udSetFind(panel.edit):null;
  if(panel.edit&&!item){toast('Этот элемент уже удалён','err');udSetCancel();return false}
  const name=String(values.get('name')).trim();
  if(!name){toast('Введите название','err');return false}
  const color=values.get('color');
  if(tab==='tags'){
    const match=udSetFind(tagKey(name)),next=match&&match.key!==item.key?match.name:name.replace(/^#/, '').trim();
    if(!tagKey(next)){toast('Введите название тега','err');return false}
    const colorChanged=color!==udSetForm.elements.color.defaultValue||
      udSetForm.elements.customColor.checked!==udSetForm.elements.customColor.defaultChecked;
    const ok=tagCommit(ws=>{
      if(next!==item.name&&!renameTagInWorkspace(ws,item.name,next))return false;
      if(colorChanged){
        ws.tagColors={...tagColors(ws)};
        if(values.has('customColor'))ws.tagColors[tagKey(next)]=color;
        else delete ws.tagColors[tagKey(next)];
      }
    },`Тег «${next}» сохранён`);
    if(ok){panel.tag=tagKey(next);udSetCancel()}
    return ok;
  }
  const next={id:item?.id||uid({types:'etype',relations:'rtype',statuses:'sg'}[tab]),name};
  let removed=[];
  if(tab==='types'){
    const fieldNames=[...udSetForm.querySelectorAll('.fdName')].map(input=>input.value.trim().toLowerCase()).filter(Boolean);
    if(new Set(fieldNames).size!==fieldNames.length){toast('Укажите разные названия полей анкеты','err');return false}
    const selected=new Set(values.getAll('section'));
    const page=panel.page.filter(sec=>UD_NO_SECTIONS.has(sec.kind)||selected.has(sec.id));
    const before=typePage(item,'entity');
    removed=before.filter(sec=>!page.some(kept=>kept.id===sec.id));
    Object.assign(next,{icon:values.get('icon').trim()||'✦',color,fields:readFieldsEditor(udSetForm)});
    if(JSON.stringify(before)!==JSON.stringify(page))next.page=page;
  }else if(tab==='relations'){
    Object.assign(next,udReadThreadType(values,item),{reverseName:values.get('reverseName').trim()||undefined});
  }else{
    const options=readStatusOptions($('#udSetStatusOptions'));
    if(!options.length){toast('Добавьте хотя бы один вариант','err');return false}
    Object.assign(next,{kind:values.get('kind'),appliesTo:values.getAll('appliesTo'),options});
  }
  const ok=commitRulesChange(()=>{
    if(tab==='types'&&item){
      if(!applyFieldRenames(item.id,item.fields,next.fields)){
        throw new Error('У карточки уже есть ответ с таким названием. Выберите другое имя поля.');
      }
      for(const sec of removed)keepRemovedTypeSection(data.entities,item.id,sec);
    }
    if(values.has('ruleGroup')){
      const group=values.get('ruleGroup');
      if(group)next.group=group;
      else if(item)delete item.group;
    }
    if(item)Object.assign(item,next);
    else UD_SET[tab].list().push(next);
  },`«${name}» сохранено · Ctrl+Z — вернуть`);
  if(ok)udSetCancel();
  return ok;
}

udSetEl.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||!udSetState)return;
  const a=button.dataset;
  const edit=button.dataset.udSetEdit,tag=button.dataset.udSetTag,card=button.dataset.udSetCard;
  const select=button.dataset.udSetSelect,remove=button.dataset.udSetDelete;
  if(button.id==='udSetClose'){if(udSetFinish())udSetClose(true)}
  else if(button.id==='udSetAddGroup'){
    if(udSetCanGroup(udSetState.tab)&&udSetFinish()){
      udSetGroupForm.hidden=!udSetGroupForm.hidden;
      if(!udSetGroupForm.hidden)udSetGroupForm.elements.groupName.focus();
    }
  }
  else if(button.id==='udSetAdd'){if(udSetFinish())udSetEdit('')}
  else if(button.id==='udSetPresets'){if(udSetFinish()){udSetClose();openRulesModal('presets')}}
  else if(a.udSetCancel!==undefined)udSetCancel();
  else if(edit!==undefined){const same=udSetState.edit===edit;if(udSetFinish()&&!same)udSetEdit(edit)}
  else if(tag!==undefined){
    if(!udSetFinish())return;
    udSetState.tag=udSetState.tag===tag?null:tag;
    udSetRefresh();
  }else if(card){if(udSetFinish()){udSetClose();revealEntity(card)}}
  else if(select){
    const item=udSetFind(select);
    if(!item||!udSetFinish())return;
    udSetClose();
    state.selectedIds=new Set(item.ids);
    state.selectedId=item.ids[0]||null;
    updateUI();
  }else if(remove&&!rulesPlayerMode()){
    const {tab}=udSetState,item=udSetFind(remove);
    if(!item)return;
    if(tab==='tags'){
      if(confirm(`Убрать тег «${item.name}» у всех карточек?`)&&deleteTag(item.name))udSetCancel();
    }else UD_SET[tab].remove(item.id,udSetCancel);
  }else if(a.udSetAddSection!==undefined){
    const kind=udSetForm.elements.sectionKind.value;
    if(!kind)return;
    const section={id:uid('sec'),kind};
    udSetState.page.push(section);
    $('#udSetSections').insertAdjacentHTML('beforeend',udSetSectionRow(section));
    udSetSectionChoices();
  }else if(a.udSetAddStatus!==undefined){
    $('#udSetStatusOptions').insertAdjacentHTML('beforeend',statusOptionRow());
    $('#udSetStatusOptions').lastElementChild.querySelector('.soName').focus();
  }else if(button.classList.contains('soDel'))button.closest('.statusOptionRow').remove();
});
udSetForm.addEventListener('submit',event=>{event.preventDefault();udSetFinish()});
udSetForm.addEventListener('input',event=>{
  if(udSetState?.tab!=='tags')return;
  if(event.target.name==='name')udSetTagHint();
  if(event.target.name==='color')udSetForm.elements.customColor.checked=true;
});
udSetForm.addEventListener('change',event=>{if(event.target.name==='section')udSetSectionChoices()});
udSetSearch.addEventListener('input',udSetRefresh);
document.addEventListener('pointerdown',event=>{
  const panel=udSetState,target=event.target;
  if(!panel||target.closest?.('#udSet,[data-ud-rules],#detectiveView,#viewStrip,.rgbDialog'))return;
  if(udSetFinish())udSetClose();
},true);
document.addEventListener('click',event=>{
  const panel=udSetState,edit=panel?.edit;
  if(!panel||!event.target.closest?.('#detectiveView,#viewStrip'))return;
  // Saving can redraw the board tools, so their click runs first.
  setTimeout(()=>{if(udSetState===panel&&panel.edit===edit&&udSetFinish())udSetClose()},0);
},true);
document.addEventListener('keydown',event=>{
  if(!udSetState)return;
  if(event.key==='Tab'&&udSetForm.contains(event.target)){
    const panel=udSetState,edit=panel.edit;
    setTimeout(()=>{if(udSetState===panel&&panel.edit===edit&&!udSetForm.contains(document.activeElement))udSetFinish()},0);
    return;
  }
  if(event.key!=='Escape')return;
  event.stopImmediatePropagation();
  if(udSetState.edit!==null){udSetCancel();udSetSearch.focus()}
  else udSetClose(true);
},true);

udSetGroupForm.addEventListener('submit',event=>{
  event.preventDefault();
  const panel=udSetState;
  if(!panel||!udSetCanGroup(panel.tab)||panel.workspace!==state.workspaceId)return;
  const name=udSetGroupForm.elements.groupName.value.trim().slice(0,40);
  if(!name)return;
  const {tab}=panel;
  if(udSetGroups(tab,UD_SET[tab].list()).some(([group])=>searchFold(group)===searchFold(name))){
    toast('Такая группа уже есть','err');return;
  }
  if(commitRulesChange(()=>{
    const ws=currentWorkspace();
    ws.udRuleGroups??={};
    ws.udRuleGroups[tab]=[...(ws.udRuleGroups[tab]||[]),name];
  },'Группа «'+name+'» создана')){
    udSetGroupForm.reset();
    udSetGroupForm.hidden=true;
    udSetSearch.value='';
    udSetRefresh();
  }
});
udSetList.addEventListener('dragstart',event=>{
  const grip=event.target.closest('.udSetGrip'),panel=udSetState;
  if(!grip||!panel||!udSetCanGroup(panel.tab)||panel.edit!==null){event.preventDefault();return}
  udSetDrag={panel,id:grip.closest('[data-ud-set-row]').dataset.udSetRow};
  event.dataTransfer.setData('text/plain',udSetDrag.id);
  event.dataTransfer.effectAllowed='move';
});
function udSetDropGroup(event){
  const panel=udSetState;
  if(!panel||udSetDrag?.panel!==panel||panel.workspace!==state.workspaceId||!udSetCanGroup(panel.tab))return null;
  const target=event.target.closest('[data-ud-type-group]');
  return target&&!(panel.tab==='relations'&&target.dataset.udTypeGroup==='Вложенность')?target:null;
}
udSetList.addEventListener('dragover',event=>{
  const target=udSetDropGroup(event);
  if(!target)return;
  event.preventDefault();
  event.dataTransfer.dropEffect='move';
  udSetList.querySelector('.udSetDrop')?.classList.remove('udSetDrop');
  target.classList.add('udSetDrop');
});
udSetList.addEventListener('dragleave',event=>{
  const target=event.target.closest('[data-ud-type-group]');
  if(target&&!target.contains(event.relatedTarget))target.classList.remove('udSetDrop');
});
function udSetEndDrag(){
  udSetDrag=null;
  udSetList.querySelector('.udSetDrop')?.classList.remove('udSetDrop');
}
udSetList.addEventListener('dragend',udSetEndDrag);
udSetList.addEventListener('drop',event=>{
  const target=udSetDropGroup(event);
  if(!target)return;
  event.preventDefault();
  const id=udSetDrag.id,tab=udSetState.tab,group=target.dataset.udTypeGroup;
  target.open=true;
  udSetEndDrag();
  udSetMoveToGroup(tab,id,group);
});
