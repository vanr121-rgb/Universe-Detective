// Universe Graph — «Все записи» (0.27): выдвижная панель слева в Graph и Detective — все записи мира с поиском и типом.
// Запись перетаскивают мышью на доску: убранная с доски возвращается и встаёт туда, куда её бросили; запись из другого
// пространства — спросить: перенести сюда или открыть там. «＋» у записи — то же без мыши (в середину экрана).
// Модуль загружается обычным <script> перед app.js; все модули делят одно глобальное пространство имён.
'use strict';
const allRec={open:false,q:'',type:'*',visibility:''};
const ALLREC_LIMIT=200;
function allRecPlace(e){
  if(entityOffBoard(e))return 'вне доски';
  const p=containmentParent(e.id),scope=state.scopeId;
  if(e.id===scope)return 'это пространство';
  if(p===scope||(!p&&scopeIdIsRoot()))return 'на этой доске';
  return p?'в «'+(getEntity(p)?.name||'…')+'»':'в корне';
}
function allRecHiddenParent(id){
  for(const parent of findAncestorPath(id).slice(1,-1).reverse()){
    const e=getEntity(parent),vis=entityVis(e);
    if(vis==='gm'||vis==='off')return e;
  }
  return null;
}
function allRecList(){
  const q=searchFold(allRec.q.trim()),filter=uiIsPlayer()?'':allRec.visibility;
  return data.entities.filter(e=>{
    if(e.id===currentRootId()||(allRec.type!=='*'&&(e.type||'')!==allRec.type)||(q&&!entitySearchText(e).includes(q)))return false;
    const visibility=entityVis(e);
    return !filter||(filter==='hidden'?visibility==='gm'||visibility==='off'||allRecHiddenParent(e.id):visibility===filter);
  }).sort((a,b)=>Number(entityOffBoard(b))-Number(entityOffBoard(a))||String(a.name).localeCompare(String(b.name),'ru'));
}
let allRecSig='';
function allRecAllowed(){return state.visualMode==='graph'||state.visualMode==='detective'}
// called with every redraw of the strip: hides the panel outside Graph/Detective and refreshes the list after a change of the world
function allRecSync(){const box=$('#allRecords');if(!box)return;const show=allRec.open&&allRecAllowed();box.hidden=!show;if(!show)return;const sig=state.workspaceId+'|'+uiIsPlayer()+'|'+state.viewVersion+'|'+data.entities.length+'|'+state.scopeId+'|'+state.visualMode;if(sig!==allRecSig)renderAllRecords()}
function renderAllRecords(){
  const box=$('#allRecords');if(!box)return;box.hidden=!allRec.open||!allRecAllowed();allRecSig=state.workspaceId+'|'+uiIsPlayer()+'|'+state.viewVersion+'|'+data.entities.length+'|'+state.scopeId+'|'+state.visualMode;$$('[data-act="all-records"]').forEach(b=>{b.classList.toggle('active',allRec.open);b.setAttribute('aria-pressed',String(allRec.open))});
  if(!allRec.open)return;
  const sel=$('#allRecType'),types=[['*','Все типы'],...data.entityTypes.map(t=>[t.id,`${t.icon||'•'} ${t.name}`]),...(data.entities.some(e=>!e.type)?[['','• Без типа']]:[])];
  if(sel&&sel.dataset.sig!==types.map(x=>x[0]).join('|')){sel.innerHTML=types.map(([id,l])=>`<option value="${escapeHtml(id)}">${escapeHtml(l)}</option>`).join('');sel.dataset.sig=types.map(x=>x[0]).join('|')}
  if(sel)sel.value=allRec.type;
  const readOnly=worldReadOnly(),master=!uiIsPlayer(),filter=$('#allRecVisibility'),hiddenOnly=master&&allRec.visibility!=='';
  filter.hidden=!master;filter.value=allRec.visibility;
  box.querySelector('.arHead b').textContent=hiddenOnly?'Скрытые сущности':'Все сущности';
  box.setAttribute('aria-label',hiddenOnly?'Скрытые сущности':'Все сущности');
  $('#allRecDup').hidden=!master||hiddenOnly;
  box.querySelector('.arHint').textContent=hiddenOnly?'Нажмите на название, чтобы найти карточку на её доске.' :readOnly?'Нажмите на название, чтобы перейти к карточке.':'Перетащите сущность на доску или нажмите ＋';
  const list=allRecList(),items=list.slice(0,ALLREC_LIMIT);
  const row=e=>{
    const t=getET(e.type),id=escapeHtml(e.id),name=escapeHtml(e.name||'Без названия'),vis=entityVis(e);
    const parent=hiddenOnly&&allRecHiddenParent(e.id);
    const status=vis==='gm'?' · Только Мастер':vis==='off'&&e.vis==='gm'?
      (entityNamedVisibility(e)?' · Видны имя и тип после возврата':' · Только Мастер после возврата'):
      parent?` · Скрыта вместе с «${parent.name}»`:'';
    const details=`<b>${name}</b><small>${escapeHtml(e.type?t.name:'Без типа')} · ${escapeHtml(allRecPlace(e)+status)}</small>`;
    const action=vis==='off'?['back','Вернуть на доску']:vis==='gm'?['show','Показать игрокам']:null;
    const actionHtml=hiddenOnly?(action?`<button type="button" class="btn tiny" data-ar-visibility-action="${action[0]}" aria-label="${action[1]} «${name}»">${action[1]}</button>`:'')
      :readOnly?'':`<button type="button" class="arPut" data-ar-put="${id}" title="Положить на эту доску" aria-label="Положить «${name}» на эту доску">＋</button>`;
    return `<div class="arItem${vis==='off'?' off':''}${hiddenOnly?' arHiddenRow':''}" ${hiddenOnly||readOnly?'':'draggable="true"'} data-ar-id="${id}">
      <span class="arIcon" style="color:${escapeHtml(safeCssValue(e.style?.color||t.color,'#9aa8c6'))}">${escapeHtml(t.icon||'•')}</span>
      ${hiddenOnly||readOnly?`<button type="button" class="arMeta arReveal" data-ar-reveal="${id}">${details}</button>`:`<span class="arMeta">${details}</span>`}
      ${actionHtml}
    </div>`;
  };
  $('#allRecList').innerHTML=items.length?items.map(row).join('')+(list.length>items.length?`<div class="emptyHint">и ещё ${list.length-items.length} — уточните поиск</div>`:''):'<div class="emptyHint">Ничего не нашлось.</div>';
}
function toggleAllRecords(on){
  if(on===undefined){on=!allRec.open||!!allRec.visibility;allRec.visibility=''}
  allRec.open=!!on;renderAllRecords();if(allRec.open)setTimeout(()=>$('#allRecSearch')?.focus(),0);
}
function udShowHiddenRecords(){
  if(uiIsPlayer())return;
  allRec.visibility='hidden';allRec.q='';allRec.type='*';$('#allRecSearch').value='';
  toggleAllRecords(true);
}
function allRecLocate(id){
  if(!getEntity(id))return false;
  if(state.search){clearSearchQuery();renderSearch('')}
  toggleAllRecords(false);
  return revealEntity(id);
}
// Put a record on the current board at a point of the world (Graph) or of the board (Detective).
function allRecPut(id,pt){
  if(worldReadOnly())return false;
  const e=getEntity(id);if(!e||id===currentRootId())return false;
  const scope=state.scopeId,p=containmentParent(id),here=id===scope||p===scope||(!p&&scopeIdIsRoot()),board=state.visualMode==='detective';
  if(board&&udBoardUsesPlacements()&&id!==scope){
    let paper;
    const ok=udCommitPlacementChange(placements=>{
      entityBackOnBoard(e);
      const parentId=udSharedCurrentParent();
      const point=pt&&parentId?udPlacementOffset(pt,boardLayout().positions.get(parentId),{round:true}):pt;
      if(pt&&!point)return false;
      paper=udPlaceAtContext(id,placements,parentId,point);
      return !!paper;
    },`«${e.name}» на доске`);
    if(ok){renderAllRecords();udSelectPaper(id,paper)}
    return ok;
  }
  const place=()=>{if(!pt)return;if(board){if(typeof boardSetPlace==='function')boardSetPlace(e,pt)}else{e.style=e.style||{};e.style.x=Math.round(pt.x);e.style.y=Math.round(pt.y)}};
  const commit=(fn,text)=>{const snap=snapshotWorkspaceMutation();try{fn()}catch(err){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не получилось: '+err.message,'err');return false}
    state.viewVersion=(state.viewVersion||0)+1;if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return false}
    updateUI();renderAllRecords();setSelected(id,false);toast(text+' · Ctrl+Z — отменить','ok');return true};
  if(here||board&&!entityOffBoard(e)&&p!==scope&&boardNodes().some(x=>x.id===id))return commit(()=>{entityBackOnBoard(e);place()},entityOffBoard(e)?`«${e.name}» снова на доске`:`«${e.name}» переставлена`);
  if(board)return commit(()=>{entityBackOnBoard(e);const bs=boardState(boardKey(),true);if(!bs.pins.includes(id))bs.pins.push(id);place()},`«${e.name}» прикреплена к доске 📌, в мире осталась на своём месте`);
  // Graph: the record lives in another space — ask
  const from=p?getEntity(p)?.name:'корне';const scopeName=getEntity(scope)?.name||'сюда';
  openModal('Сущность из другого места',`<div class="form"><p>«${escapeHtml(e.name)}» лежит в «${escapeHtml(from||'…')}». Что сделать?</p><div class="inlineHelp">«Перенести сюда» — сущность будет внутри «${escapeHtml(scopeName)}» (связи сохранятся). «Открыть там» — перейти туда, где она лежит.</div></div>`,`<button class="btn" id="cancelModal">Отмена</button><button class="btn" data-ar-choice="go">Открыть там</button><button class="btn primary" data-ar-choice="move">Перенести сюда</button>`);
  $$('[data-ar-choice]').forEach(b=>b.addEventListener('click',()=>{const c=b.dataset.arChoice;closeModal();
    if(c==='move'){if(!scopeIdIsRoot()&&wouldCreateContainmentCycle(scope,id)){toast('Нельзя положить сущность внутрь её же содержимого','err');return}
      commit(()=>{if(!setContainmentParentForDrag(id,scopeIdIsRoot()?null:scope))throw new Error('не получилось перенести');entityBackOnBoard(e);place()},`«${e.name}» перенесена в «${scopeName}»`)}
    else{if(entityOffBoard(e))setEntitiesOffBoard([id],false);if(typeof revealEntity==='function')revealEntity(id);else{state.scopeId=p||currentRootId();setSelected(id,false);updateUI()}}}));
  return null;
}
function allRecCenterPoint(){if(state.visualMode==='detective'){const v=$('#detectiveView').getBoundingClientRect();return boardWorldPoint(v.left+v.width/2,v.top+v.height/2)}return {x:-state.panX,y:-state.panY}}
{
  const box=$('#allRecords');
  $('#allRecSearch')?.addEventListener('input',ev=>{allRec.q=ev.target.value;renderAllRecords()});
  $('#allRecType')?.addEventListener('change',ev=>{allRec.type=ev.target.value;renderAllRecords()});
  $('#allRecVisibility')?.addEventListener('change',ev=>{if(!uiIsPlayer()){allRec.visibility=ev.target.value;renderAllRecords()}});
  $('#allRecClose')?.addEventListener('click',()=>toggleAllRecords(false));
  box?.addEventListener('click',ev=>{
    const button=ev.target.closest?.('button');
    if(!button)return;
    if(button.dataset.arPut){allRecPut(button.dataset.arPut,allRecCenterPoint());return}
    if(button.dataset.arReveal){allRecLocate(button.dataset.arReveal);return}
    if(uiIsPlayer())return;
    const action=button.dataset.arVisibilityAction;
    if(!action)return;
    const id=button.closest('[data-ar-id]')?.dataset.arId;
    const e=getEntity(id);
    if(!e)return;
    if(action==='back'&&setEntitiesOffBoard([id],false))toast(`«${e.name}» снова на доске. Доступ игрокам сохранён.`,'ok');
    if(action==='show'&&setEntitiesVis([id],'all')){
      const snap=playerProjection(currentWorkspace());
      toast(snap.entities.some(item=>item.id===id)?visToastText(1,'all',e):`«${e.name}»: выставлено «Видно всем». Откройте также родительское дело.`,'ok');
    }
    $('#allRecSearch').focus({preventScroll:true});
  });
  box?.addEventListener('dragstart',ev=>{const it=ev.target instanceof Element?ev.target.closest('[data-ar-id]'):null;if(!it?.draggable)return;ev.dataTransfer.setData('text/ug-entity',it.dataset.arId);ev.dataTransfer.setData('text/plain',getEntity(it.dataset.arId)?.name||'');ev.dataTransfer.effectAllowed='move'});
  const isOurs=ev=>[...(ev.dataTransfer?.types||[])].includes('text/ug-entity');
  for(const el of [$('#detectiveView')]){if(!el)continue;
    el.addEventListener('dragover',ev=>{if(!isOurs(ev))return;ev.preventDefault();ev.dataTransfer.dropEffect='move'});
    el.addEventListener('drop',ev=>{if(!isOurs(ev))return;ev.preventDefault();const id=ev.dataTransfer.getData('text/ug-entity');allRecPut(id,boardWorldPoint(ev.clientX,ev.clientY))})}
}

