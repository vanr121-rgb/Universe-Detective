// Universe Graph — Редакторы: сущность, связь, типы, массовое редактирование, удаление; живые предпросмотры.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
function openMassEdit(){
  if(worldReadOnly())return;
  const ids=[...state.selectedIds].filter(id=>getEntity(id));
  if(ids.length<2){toast('Выберите несколько сущностей','err');return}
  const tags=[...new Set(ids.flatMap(id=>getEntity(id)?.tags||[]))].sort();
  const parentOptions=data.entities.filter(e=>!ids.includes(e.id)).map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join('');
  openModal('Массовое редактирование',
    `<div class="stack">
      <div class="massSummary">Выбрано: <b>${ids.length}</b> сущностей. Пустые поля ничего не меняют.</div>
      <div class="customizerSection"><h4>Внешний вид</h4><div class="customizerGrid">
        <div><label>Тип</label><select id="massType"><option value="">Не менять</option>${data.entityTypes.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('')}</select></div>
        <div><label>Цвет</label><input id="massColor" class="colorInput" type="color" value="#74b8ff"><label class="toggleRow"><span>Применить цвет</span><input id="massUseColor" class="checkbox" type="checkbox"></label></div>
        <div><label>Размер</label><input id="massSize" type="number" min="10" max="120" placeholder="Не менять"></div>
        <div><label>Прозрачность</label><input id="massOpacity" type="number" min="0.1" max="1" step="0.05" placeholder="Не менять"></div>
      </div></div>
      <div class="customizerSection"><h4>Теги</h4><div class="tagInputWrap"><input id="massTag" placeholder="#важный"><button class="btn" id="massAddTag">＋ Добавить</button></div><div class="quickTagSuggest">${tags.slice(0,8).map(t=>`<button type="button" data-mass-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join('')}</div></div>
      <div class="customizerSection"><h4>Состояние</h4><div class="customizerGrid">
        <div><label>Закрепление</label><select id="massPin"><option value="">Не менять</option><option value="1">Закрепить</option><option value="0">Открепить</option></select></div>
        <div><label>Родитель</label><select id="massParent"><option value="">Не менять</option>${parentOptions}<option value="__current">Текущее пространство</option></select></div>
      </div></div>
    </div>`,
    `<button class="btn" id="massCancel">Отмена</button><button class="btn" id="massDuplicate">Копировать</button><button class="btn danger" id="massDelete">Удалить</button><button class="btn primary" id="massApply">Применить</button>`
  );
  const pendingTags=new Set();
  $('#massAddTag').onclick=()=>{const v=$('#massTag').value.trim().replace(/^#/,'');if(v){pendingTags.add(v);$('#massTag').value='';toast('Тег добавлен в пакет изменений','ok')}else{$('#massTag').focus();toast('Сначала впишите тег в поле рядом','err')}}; /* 0.30.9: an empty press said nothing */
  $$('[data-mass-tag]').forEach(b=>b.onclick=()=>{$('#massTag').value=b.dataset.massTag});
  $('#massCancel').onclick=closeModal;
  $('#massDuplicate').onclick=()=>{closeModal();massDuplicate(ids)};
  $('#massDelete').onclick=()=>{closeModal();deleteEntities(ids)};
  $('#massApply').onclick=()=>{
    const type=$('#massType').value;
    const color=$('#massUseColor').checked?$('#massColor').value:null;
    const size=$('#massSize').value===''?null:clamp(Number($('#massSize').value),10,120);
    const op=$('#massOpacity').value===''?null:clamp(Number($('#massOpacity').value),.1,1);
    const pin=$('#massPin').value;
    const parent=$('#massParent').value;
    closeModal();
    const massResult=commitMassEdit(()=>{
      for(const id of ids){
        const e=getEntity(id);if(!e)continue;
        e.style=e.style||{};
        if(type)e.type=type;
        if(color)e.style.color=color;
        if(size)e.style.size=size;
        if(op)e.style.opacity=op;
        if(pin!=='')e.style.pinned=pin==='1';
        for(const t of pendingTags){e.tags=e.tags||[];if(!e.tags.includes(t))e.tags.push(t)}
        if(parent){const pid=parent==='__current'?state.scopeId:parent;if(pid!==e.id&&!wouldCreateContainmentCycle(pid,e.id))addContainmentSilent(e.id,pid)}
      }
    });
    if(massResult==='failed')return;
    state.selectedId=ids[0]||null;
    state.selectedIds=new Set(ids);
    updateUI();
    toast(massResult==='saved'?'Массовое редактирование применено':'Изменений нет — поля оставлены пустыми','ok');
  };
}

function drawPreviewShape(c,x,y,r,shape,fill,stroke,glow,borderWidth,rotation=0,opacity=1,fillOpacity=1){c.save();c.translate(x,y);c.rotate(rotation);c.globalAlpha=opacity;c.shadowBlur=Math.max(0,glow||0);c.shadowColor=fill;c.fillStyle=fill;c.globalAlpha*=fillOpacity;c.strokeStyle=stroke;c.lineWidth=Math.max(.5,borderWidth||1.3);c.beginPath();if(shape==='square')c.roundRect(-r*.78,-r*.78,r*1.56,r*1.56,r*.25);else if(shape==='diamond'){c.moveTo(0,-r);c.lineTo(r,0);c.lineTo(0,r);c.lineTo(-r,0);c.closePath()}else if(shape==='triangle'){c.moveTo(0,-r);c.lineTo(r*.92,r*.72);c.lineTo(-r*.92,r*.72);c.closePath()}else if(shape==='hex'){for(let i=0;i<6;i++){const a=i*Math.PI/3,px=Math.cos(a)*r,py=Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py)}c.closePath()}else if(shape==='star'){for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r:r*.45,px=Math.cos(a)*rr,py=Math.sin(a)*rr;i?c.lineTo(px,py):c.moveTo(px,py)}c.closePath()}else c.arc(0,0,r,0,Math.PI*2);c.fill();c.globalAlpha=opacity;c.stroke();c.restore()}
function previewDash(lineStyle,dashSize,dashGap){const a=Math.max(1,Number(dashSize)||7),g=Math.max(1,Number(dashGap)||a);switch(lineStyle){case 'dash':return[a,g];case 'dot':return[Math.max(1,a*.28),g];case 'longdash':return[a*2.1,g];case 'dashdot':return[a,g,Math.max(1,a*.25),g];case 'dense':return[Math.max(1,a*.7),Math.max(1,g*.55)];default:return[]}}
// 0.28.2: a relation look window shows «dash size / gap» only for a dashed line (they were shown for a solid one too, screenshot 8),
// and the relation preview has one caption (the name was written on the line and once more under it).
const EDITOR_DASHED=new Set(['dash','dot','longdash','dashdot','dense']);
function editorSyncLine(){for(const [line,ids] of [['tLine',['tDash','tDashGap']],['rLine',['rDash','rDashGap']]]){const sel=document.getElementById(line);if(!sel)continue;const on=EDITOR_DASHED.has(sel.value);for(const id of ids){const box=document.getElementById(id)?.closest('div');if(box)box.hidden=!on}}
  for(const id of ['relPreviewLabel'])document.getElementById(id)?.setAttribute('hidden','');const tl=document.getElementById('typePreviewLabel');if(tl&&document.getElementById('tLine'))tl.hidden=true}
document.addEventListener('change',e=>{if(['tLine','rLine','rType'].includes(e.target?.id))queueMicrotask(editorSyncLine)});
function drawPreviewRelation(c,w,h,spec,now){c.clearRect(0,0,w,h);const midY=h*.48,left=w*.12,right=w*.88,color=spec.color||'#91a4c7',opacity=Number(spec.opacity??1),width=Math.max(1,Number(spec.width)||2),dx=right-left,bend=Math.min(80,dx*.30)*(Number(spec.curve)||0),p1={x:left,y:midY},p2={x:right,y:midY},cp={x:(left+right)/2,y:midY+bend},dash=previewDash(spec.lineStyle,spec.dashSize,spec.dashGap);const path=()=>{c.beginPath();c.moveTo(p1.x,p1.y);c.quadraticCurveTo(cp.x,cp.y,p2.x,p2.y)};c.save();c.globalAlpha=opacity;c.strokeStyle=color;c.lineCap='round';c.lineWidth=width;c.shadowBlur=Number(spec.glow)||0;c.shadowColor=color;c.setLineDash(dash);path();c.stroke();if(spec.lineStyle==='double'){c.globalAlpha*=.55;c.lineWidth=Math.max(1,width*.42);path();c.stroke()}c.setLineDash([]);const arrowSize=Math.max(5,Number(spec.arrowSize)||8);if(spec.arrow){const t=.94,tx=(1-t)*(1-t)*p1.x+2*(1-t)*t*cp.x+t*t*p2.x,ty=(1-t)*(1-t)*p1.y+2*(1-t)*t*cp.y+t*t*p2.y,ang=Math.atan2(p2.y-ty,p2.x-tx);c.fillStyle=color;c.beginPath();c.moveTo(p2.x,p2.y);c.lineTo(p2.x-Math.cos(ang-.52)*arrowSize,p2.y-Math.sin(ang-.52)*arrowSize);c.lineTo(p2.x-Math.cos(ang+.52)*arrowSize,p2.y-Math.sin(ang+.52)*arrowSize);c.closePath();c.fill()}if(spec.animated){const speed=Number(spec.animationSpeed??1),t=(now/2200*speed)%1,style=spec.animationStyle||'dot';c.fillStyle=color;if(style==='pulse'){const q=pointOnQuad(p1,cp,p2,.5);c.globalAlpha=Math.min(1,opacity+.25)*(0.35+0.65*Math.abs(Math.sin(now*.004*speed)));c.beginPath();c.arc(q.x,q.y,Math.max(3,width*2.2),0,Math.PI*2);c.fill()}else if(style==='comet'||style==='trail'){for(let i=0;i<5;i++){const tt=(t-i*.055+1)%1,q=pointOnQuad(p1,cp,p2,tt);c.globalAlpha=Math.max(.04,opacity*(1-i*.18));c.beginPath();c.arc(q.x,q.y,Math.max(1.5,width*(1-i*.12)),0,Math.PI*2);c.fill()}}else{const tt=style==='reverse'?1-t:t,q=pointOnQuad(p1,cp,p2,tt);c.globalAlpha=Math.min(1,opacity+.25);c.shadowBlur=0;c.beginPath();c.arc(q.x,q.y,Math.max(2,width*1.35),0,Math.PI*2);c.fill();if(style==='spark'){for(let i=0;i<3;i++){const ang=now*.004*speed+i*2.1,rr=5+i*2;c.globalAlpha*=.55;c.beginPath();c.arc(q.x+Math.cos(ang)*rr,q.y+Math.sin(ang)*rr,1.2,0,Math.PI*2);c.fill()}}}}if(spec.labelVisible!==false&&spec.label){c.globalAlpha=1;c.fillStyle=spec.labelColor||color;c.font=`${Math.max(8,Number(spec.labelSize)||10)}px Inter,sans-serif`;c.textAlign='center';c.textBaseline='alphabetic';const q=pointOnQuad(p1,cp,p2,.5);c.fillText(spec.label,q.x,q.y-7)}c.restore()}
function mountEntityPreview(canvas,getSpec){let dead=false,raf=0,lastW=0,lastH=0,lastDpr=0;const resize=()=>{const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(w===lastW&&h===lastH&&dpr===lastDpr)return false;lastW=w;lastH=h;lastDpr=dpr;canvas.width=w;canvas.height=h;return true};const draw=(now,s)=>{const c=canvas.getContext('2d'),cw=canvas.clientWidth,ch=canvas.clientHeight,dpr=canvas.width/Math.max(1,cw);c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,cw,ch);const size=Math.max(10,Number(s.size)||30),speed=Number(s.animationSpeed??1),phase=Number(s.animationPhase||0),anim=s.animation||'none';let x=cw/2,y=ch*.40,rot=(Number(s.rotation)||0)*Math.PI/180,scale=1;if(anim==='float'){y+=Math.sin(now*.0012*speed+phase)*6;x+=Math.cos(now*.0009*speed+phase)*3}else if(anim==='orbit'){const rr=5,a=now*.0008*speed+phase;x+=Math.cos(a)*rr;y+=Math.sin(a)*rr}else if(anim==='pulse'){scale=1+Math.sin(now*.003*speed+phase)*.08}else if(anim==='breathe'){scale=1+Math.sin(now*.0017*speed+phase)*.055}const r=size*.5*scale;let glow=Math.max(0,Number(s.glow)||0);if(anim==='flicker')glow*=.55+.45*(0.5+0.5*Math.sin(now*.013*speed+phase));const alpha=Number(s.opacity??1);c.globalAlpha=alpha;drawPreviewShape(c,x,y,r,s.shape||'circle',s.color||'#74b8ff',s.borderColor||'#ffffff',glow,Number(s.borderWidth)||1.3,rot,1,1);c.shadowBlur=0;c.fillStyle='rgba(255,255,255,.78)';c.beginPath();c.arc(x-r*.28,y-r*.28,Math.max(1.7,r*.11),0,Math.PI*2);c.fill();c.fillStyle=s.iconColor||'#eef6ff';c.font=`${Math.max(10,Math.min(24,r*(s.iconScale||.62)))}px serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(s.icon||'•',x,y+1);if(anim==='rotate'){c.save();c.translate(x,y);c.rotate(now*.0008*speed);c.strokeStyle=s.color||'#74b8ff';c.globalAlpha=alpha*.5;c.lineWidth=1;c.setLineDash([3,4]);c.beginPath();c.arc(0,0,r+7,0,Math.PI*1.5);c.stroke();c.restore()}c.globalAlpha=1};const frame=now=>{if(dead||document.visibilityState==='hidden'){raf=0;return}resize();const s=getSpec();draw(now,s);if(s.animation&&s.animation!=='none')raf=requestAnimationFrame(frame);else raf=0};const wake=()=>{if(dead)return;resize();if(!raf&&document.visibilityState!=='hidden')frame(performance.now())};resize();wake();const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>wake()):null;ro?.observe(canvas);const cleanup=()=>{dead=true;cancelAnimationFrame(raf);ro?.disconnect()};cleanup.wake=wake;return cleanup}
function mountRelationPreview(canvas,getSpec){let dead=false,raf=0,lastW=0,lastH=0,lastDpr=0;const resize=()=>{const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.floor(canvas.clientWidth*dpr)),h=Math.max(1,Math.floor(canvas.clientHeight*dpr));if(w===lastW&&h===lastH&&dpr===lastDpr)return false;lastW=w;lastH=h;lastDpr=dpr;canvas.width=w;canvas.height=h;return true};const frame=now=>{if(dead||document.visibilityState==='hidden'){raf=0;return}resize();const c=canvas.getContext('2d'),dpr=canvas.width/Math.max(1,canvas.clientWidth);c.setTransform(dpr,0,0,dpr,0,0);const spec=getSpec();drawPreviewRelation(c,canvas.clientWidth,canvas.clientHeight,spec,now);if(spec.animated)raf=requestAnimationFrame(frame);else raf=0};const wake=()=>{if(dead)return;resize();if(!raf&&document.visibilityState!=='hidden')frame(performance.now())};resize();wake();const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>wake()):null;ro?.observe(canvas);const cleanup=()=>{dead=true;cancelAnimationFrame(raf);ro?.disconnect()};cleanup.wake=wake;return cleanup}
let activePreviewCleanup=null;let activePreviewWake=null;let activeModalCleanup=null;let activeModalCloseGuard=null;function replacePreviewLoop(fn){if(activePreviewCleanup)activePreviewCleanup();activePreviewCleanup=fn;activePreviewWake=fn?.wake||null}function wakePreviewLoop(){activePreviewWake?.()}


function mediaEditorListHtml(media){
  if(!media.length)return `<div class="mediaEmpty">Пока нет изображений. Можно загрузить ${supportedImageFormatsText()}. U.G. сохранит обработанную копию отдельно от JSON документа.</div>`;
  return media.map(m=>`<div class="entityMediaItem" data-media-editor="${escapeHtml(m.id)}"><img class="entityMediaThumb" src="${getMediaUrl(m.id)}" alt="${escapeHtml(m.alt||m.name||'Изображение')}"><div class="entityMediaMeta"><b>${escapeHtml(m.name||'image')}</b><div class="mediaMetaLine"><span>${m.width||0}×${m.height||0}</span><span>${formatBytes(m.size||0)}</span>${m.main?'<span>главное</span>':''}</div><div class="mediaResolutionGrid" style="margin-top:6px"><div><label>Ширина отображения</label><input type="number" min="120" max="1400" value="${clamp(Number(m.displayWidth)||720,120,1400)}" data-media-width="${escapeHtml(m.id)}"></div><div><label>Подпись</label><input value="${escapeHtml(m.caption||'')}" data-media-caption="${escapeHtml(m.id)}" placeholder="Необязательно"></div></div></div><div class="entityMediaActions"><button type="button" class="iconBtn" data-media-main="${escapeHtml(m.id)}" title="Сделать главным">★</button><button type="button" class="iconBtn" data-media-resize="${escapeHtml(m.id)}" title="Изменить разрешение">↕</button><button type="button" class="iconBtn" data-media-delete="${escapeHtml(m.id)}" title="Удалить">×</button></div></div>`).join('');
}
function formatBytes(bytes){const n=Number(bytes)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`;return `${(n/1024/1024).toFixed(2)} MB`}
function udEntityTypePickerHtml(selected){
  const option=type=>`<button type="button" data-ud-form-type="${escapeHtml(type.id)}" aria-pressed="${type.id===selected}">${escapeHtml(type.name)}</button>`;
  const current=data.entityTypes.find(type=>type.id===selected);
  return `<input type="hidden" id="mType" value="${escapeHtml(selected)}">
    <details id="udEntityTypePicker" class="udEntityTypePicker">
      <summary>Тип · <span id="udEntityTypeName">${escapeHtml(current?.name||'Без типа')}</span></summary>
      <input id="udTypeFilter" type="search" aria-label="Поиск типа" placeholder="Найти тип…">
      <div class="udEntityTypeChoices">
        ${option({id:'',name:'Без типа'})}
        ${udTypeGroups('types',data.entityTypes).map(([group,types])=>`<details class="udTypeGroup"><summary>${escapeHtml(group)}</summary>${types.map(option).join('')}</details>`).join('')}
        <p id="udTypeEmpty" role="status" hidden>Ничего не найдено</p>
      </div>
    </details>`;
}
function openEntityModal(id,{compact=false,boardAt=null}={}){
  if(worldReadOnly())return;
  const playerCreate=!id&&!!window.UG_ONLINE_PLAYER;
  const e=id?getEntity(id):null;
  if(id&&(!e||e.hint))return;
  if(!udFinishEdit(true)||!udFinishDescription(true))return;
  const opened=e?clone(e):null, typeId=e?.type??data.entityTypes[0]?.id??'';
  const name=e?.name||'', note=udEntityNote(e);
  const noteEditable=!e||udCanEditText(e,'desc');
  const workingMedia=clone(entityMedia(e)), pendingMediaIds=new Set(), removedMediaIds=new Set(), mediaReplacements=new Map();
  const widgetsDraft=clone(e?.widgets||[]);
  const fieldDraft=clone(e?.properties||{});
  let statusDraft=e?.status?clone(e.status):undefined;
  const canManageMedia=!worldReadOnly();
  const fieldNames=tid=>(getET(tid).fields||[]).map(f=>f.name);
  const freeProps=Object.fromEntries(Object.entries(fieldDraft).filter(([k])=>!fieldNames(typeId).includes(k)));
  const scope=state.scopeId;
  const workspace=currentWorkspace()?.id;
  const draftId=playerCreate?uid('entity'):null;
  const createAt=!id?boardAt:null;
  const stillOnBoard=()=>{
    if(!createAt||boardCreationAvailable(createAt))return true;
    toast('Исходная доска изменилась. Выберите точку заново.','err');return false;
  };
  if(!stillOnBoard())return;
  openModal(e?'Изменить бумажку':'Новая бумажка',`
    <form id="udEntityForm" class="form udEntityForm">
      <label for="mName">Название</label><input id="mName" value="${escapeHtml(name)}" placeholder="Например, Письмо с печатью" required>
      ${compact?'':udEntityTypePickerHtml(typeId)}
      ${noteEditable?`<label for="mNote">Заметка</label><textarea id="mNote" rows="3" data-wiki placeholder="Короткий текст на бумажке">${escapeHtml(note)}</textarea>`:''}
      ${compact||playerCreate?'':`<details class="udEntityExtras"><summary>Дополнительно</summary>
        <label class="toggleRow"><span>Контейнер</span><input id="mSpace" type="checkbox" ${isSpace(e)?'checked':''}></label>
        <label for="mTags">Теги</label><input id="mTags" value="${escapeHtml((e?.tags||[]).join(', '))}" placeholder="Через запятую">
        <div id="mStatusHost" class="statusEditor">${entityStatusEditorHtml(typeId,statusDraft)}</div>
        <section id="mFieldsSection" ${fieldNames(typeId).length?'':'hidden'}><label>Анкета</label><div id="mFieldsHost" class="fieldForm">${entityFieldsFormHtml(typeId,fieldDraft,e?.id)}</div></section>
        ${e?`<section><label>Дополнительные свойства</label><div id="propRows" class="stack">${propRows(freeProps)}</div><button type="button" class="btn tiny" id="addProp">＋ Поле</button></section>`:''}
        ${canManageMedia?`<section><label>Изображения</label><div class="entityMediaEditor"><div class="mediaToolbar"><input id="mMediaInput" type="file" accept="${MEH_MEDIA_ACCEPT_ATTR}" multiple><button type="button" class="btn" id="mMediaUpload">＋ Загрузить</button></div><div id="mMediaList" class="entityMediaList">${mediaEditorListHtml(workingMedia)}</div></div></section>`:''}
      </details>`}
      ${playerCreate?'<p id="udPaperCreateStatus" role="status"></p>':''}
    </form>`,`<button class="btn" id="cancelModal">Отмена</button>${e&&!compact&&e.id!==currentRootId()?'<button class="btn danger" id="deleteFromEditor">Удалить</button>':''}<button class="btn primary" id="saveEntity">${e?'Сохранить':'Создать'}</button>`);
  const nameInput=$('#mName'), noteInput=$('#mNote'), typeInput=$('#mType'), form=$('#udEntityForm');
  const fields=$('#mFieldsHost'), statuses=$('#mStatusHost');
  const initialProperties={...readEntityFieldsForm(fields),...readPropsRows()};
  const picker=$('#udEntityTypePicker'),typeSearch=$('#udTypeFilter');
  let groupsBeforeSearch=null;
  typeSearch?.addEventListener('input',()=>{
    const query=searchFold(typeSearch.value.trim());
    const groups=[...picker.querySelectorAll('.udTypeGroup')];
    if(query&&!groupsBeforeSearch)groupsBeforeSearch=new Set(groups.filter(group=>group.open));
    for(const group of groups){
      const inGroup=searchFold(group.querySelector('summary').textContent).includes(query);
      const buttons=[...group.querySelectorAll('button')];
      for(const button of buttons)button.hidden=!inGroup&&!searchFold(button.textContent).includes(query);
      group.hidden=buttons.every(button=>button.hidden);
      group.open=query?!group.hidden:!!groupsBeforeSearch?.has(group);
    }
    const noType=picker.querySelector('[data-ud-form-type=""]');
    noType.hidden=!searchFold(noType.textContent).includes(query);
    $('#udTypeEmpty').hidden=!noType.hidden||groups.some(group=>!group.hidden);
    if(!query)groupsBeforeSearch=null;
  });
  picker?.addEventListener('click',ev=>{
    const button=ev.target.closest('[data-ud-form-type]');
    if(!button)return;
    typeInput.value=button.dataset.udFormType;
    typeInput.dispatchEvent(new Event('change'));
    $('#udEntityTypeName').textContent=button.textContent;
    for(const option of picker.querySelectorAll('[data-ud-form-type]'))option.setAttribute('aria-pressed',String(option===button));
    typeSearch.value='';typeSearch.dispatchEvent(new Event('input'));
    picker.open=false;
    picker.querySelector('summary').focus();
  });
  picker?.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'&&picker.open){
      ev.preventDefault();ev.stopPropagation();
      picker.open=false;picker.querySelector('summary').focus();
    }else if(ev.key==='Enter'&&ev.target===typeSearch){
      ev.preventDefault();ev.stopPropagation();
      picker.querySelector('.udEntityTypeChoices>button:not([hidden]),.udTypeGroup[open]:not([hidden]) button:not([hidden])')?.click();
    }
  });
  tagSuggestBind($('#mTags'));
  bindEntityStatusEditor(statuses);
  let shownType=typeId;
  const readAnswers=()=>{
    for(const key of fieldNames(shownType))delete fieldDraft[key];
    Object.assign(fieldDraft,readEntityFieldsForm(fields));
    statusDraft=readEntityStatusEditor(statuses,statusDraft);
  };
  typeInput?.addEventListener('change',()=>{
    if(playerCreate)return;
    readAnswers();shownType=typeInput.value;
    statuses.innerHTML=entityStatusEditorHtml(shownType,statusDraft);
    fields.innerHTML=entityFieldsFormHtml(shownType,fieldDraft,id);
    $('#mFieldsSection').hidden=!fieldNames(shownType).length;
  });
  let mediaBusy=false;
  const setMediaBusy=busy=>{mediaBusy=!!busy;for(const id of ['mMediaUpload','saveEntity','cancelModal','modalClose']){const el=$('#'+id);if(el)el.disabled=mediaBusy}$('#mMediaInput')?.toggleAttribute('disabled',mediaBusy);$('#mMediaList')?.querySelectorAll('button,input').forEach(el=>{el.disabled=mediaBusy})};
  activeModalCloseGuard=()=>!mediaBusy;
  const renderMediaList=()=>{const host=$('#mMediaList');if(host)host.innerHTML=mediaEditorListHtml(workingMedia);if(!mediaBusy)host?.querySelectorAll('button,input').forEach(el=>{el.disabled=false})};
  const uploadFiles=async files=>{const list=[...(files||[])];if(!list.length||mediaBusy)return;if(workingMedia.length+list.length>MEH_MEDIA_MAX_COUNT){toast(`Можно хранить не более ${MEH_MEDIA_MAX_COUNT} изображений у одной сущности`,'err');return}const maxDim=clamp(Number($('#mImageMaxDim')?.value)||2200,256,5000),quality=clamp(Number($('#mImageQuality')?.value)||.84,.5,1);setMediaBusy(true);try{for(const file of list){try{const processed=await processImageFile(file,{maxDim,quality}),meta=newMediaMeta(processed,e?.id||null);mediaPut(meta);workingMedia.push(meta);pendingMediaIds.add(meta.id)}catch(error){toast(`${file?.name||'Изображение'}: ${error?.message||'не удалось обработать'}`,'err')}}renderMediaList();if(list.length)toast('Изображения обработаны и добавлены','ok')}finally{setMediaBusy(false);renderMediaList()}};
  $('#mMediaInput')?.addEventListener('change',e=>{uploadFiles(e.target.files);e.target.value=''});$('#mMediaUpload')?.addEventListener('click',()=>$('#mMediaInput')?.click());
  $('#mMediaList')?.addEventListener('input',ev=>{const id=ev.target.dataset.mediaWidth||ev.target.dataset.mediaCaption;if(!id)return;const m=workingMedia.find(x=>x.id===id);if(!m)return;if(ev.target.dataset.mediaWidth)m.displayWidth=clamp(Number(ev.target.value)||720,120,1400);else m.caption=ev.target.value});
  $('#mMediaList')?.addEventListener('click',async ev=>{const t=ev.target.closest('button');if(!t)return;const id=t.dataset.mediaMain||t.dataset.mediaDescription||t.dataset.mediaResize||t.dataset.mediaDelete;if(!id)return;const m=workingMedia.find(x=>x.id===id);if(!m)return;if(t.dataset.mediaMain){workingMedia.forEach(x=>x.main=false);m.main=true;renderMediaList();return}if(t.dataset.mediaDelete){const i=workingMedia.findIndex(x=>x.id===id);if(i>=0){workingMedia.splice(i,1);removedMediaIds.add(id);for(const w of widgetsDraft){if(w?.kind==='image'&&String(w?.config?.mediaId||'')===id)w.config.mediaId=''}renderMediaList()}return}if(t.dataset.mediaResize){if(mediaBusy)return;setMediaBusy(true);try{const src=getMediaUrl(id);if(!src)throw new Error('Файл изображения недоступен.');const blob=await fetch(src).then(r=>r.blob());const processed=await processImageFile(blob,{maxDim:clamp(Number($('#mImageMaxDim')?.value)||2200,256,5000),quality:clamp(Number($('#mImageQuality')?.value)||.84,.5,1)});const nextId=uid('media');const updated={...m,...processed,id:nextId,name:m.name,entityId:e?.id||null,dataUrl:processed.dataUrl};mediaPut(updated);pendingMediaIds.add(nextId);const idx=workingMedia.findIndex(x=>x.id===id);if(idx>=0)workingMedia[idx]={...m,...processed,id:nextId,name:m.name,entityId:e?.id||null,dataUrl:processed.dataUrl};mediaReplacements.set(id,nextId);removedMediaIds.add(id);for(const w of widgetsDraft){if(w?.kind==='image'&&String(w?.config?.mediaId||'')===id)w.config.mediaId=nextId}invalidateMediaCache(id);renderMediaList();toast('Картинка уменьшена и сжата','ok')}catch(error){toast(error?.message||'Не удалось переразрешить изображение','err')}finally{setMediaBusy(false);renderMediaList()}}});
  renderMediaList();
  activeModalCleanup=()=>{for(const id of pendingMediaIds){try{UniverseGraphStorage.mediaDelete(id);invalidateMediaCache(id)}catch{}}pendingMediaIds.clear()};
  $('#cancelModal').onclick=closeModal;
  $('#addProp')?.addEventListener('click',()=>$('#propRows').insertAdjacentHTML('beforeend',
    '<div class="propGrid"><input class="propKey" placeholder="Название"><input class="propVal" placeholder="Значение"><button class="iconBtn removeProp" type="button">×</button></div>'));
  $('#propRows')?.addEventListener('click',ev=>{
    const row=ev.target.closest('.removeProp')?.parentElement;
    if(!row)return;
    ev.preventDefault();
    row.remove();
  });
  const remove=$('#deleteFromEditor');
  if(remove)remove.onclick=()=>{if(closeModal())confirmDeleteEntity(id)};
  async function submit(){
    const live=id?getEntity(id):null;
    if(worldReadOnly()||mediaBusy||!stillOnBoard())return;
    if(id&&(!live||live.hint)){
      const inTrash=currentWorkspace()?.trash?.some(item=>item.entity?.id===id);
      toast(inTrash?'Пока окно было открыто, бумажку удалили — она в корзине.':'Бумажка больше недоступна','err');
      return;
    }
    const newName=nameInput.value.trim();
    if(!newName){nameInput.setCustomValidity('Введите название');nameInput.reportValidity();return}
    if(playerCreate){
      const status=$('#udPaperCreateStatus');
      const point=createAt&&boardCreationOffset(createAt);
      if(createAt&&!point){status.textContent='Выбранная точка вне доступных координат доски';return}
      const at=point?{board:createAt.board,parentId:createAt.parentId,...point}:udUsesSharedLayout()?{board:boardKey(),parentId:udSharedCurrentParent(),auto:true}:undefined;
      status.textContent='Сохраняю бумажку…';
      setMediaBusy(true);
      const result=await onpCreatePaper(scope,workspace,{id:draftId,name:newName,type:typeInput?.value??typeId,note:noteInput?.value.trimEnd()??''},at);
      if($('#udEntityForm')!==form)return;
      setMediaBusy(false);
      if(!result.ok){status.textContent=result.error;return}
      closeModal();
      if(getEntity(draftId)){setSelected(draftId,false);if(!createAt)boardCenterOn([draftId])}
      toast('Бумажка создана','ok');
      return;
    }
    const obj=live||{id:uid('entity'),name:newName,type:typeId,description:'',style:{},properties:{}};
    const nextNote=noteInput?.value.trimEnd();
    const before=live?clone(live):null;
    const kept=[];
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const selectedBefore=state.selectedId;
    let placement;
    if(createAt){
      if(persistenceLocked){toast('Сохранение мира отключено','err');return}
      if(!udBoardUsesPlacements()&&boardLayout().nodes.length>=BOARD_LIMIT){
        toast('Лимит доски. Освободите место для бумажки.','err');return;
      }
      boardCancelQueuedCamera();
      // The rollback reloads the saved workspace view. Include the latest
      // pan and zoom even if their normal deferred save has not run yet.
      captureWorkspace();
    }
    const ok=boardCommit(()=>{
      if(!live||newName!==name)obj.name=newName;
      if(noteInput&&(!live||nextNote!==note))obj.note=nextNote;
      if(!compact){
        readAnswers();
        if(!live||typeInput.value!==typeId)obj.type=typeInput.value;
        const originalTags=(opened?.tags||[]).join(', '),tags=$('#mTags').value;
        if(!live||tags!==originalTags)obj.tags=tags.split(',').map(x=>x.trim().replace(/^#/, '')).filter(Boolean);
        const currentFields=new Set(data.entityTypes.flatMap(type=>fieldNames(type.id)));
        const authored={...Object.fromEntries(Object.entries(fieldDraft).filter(([key])=>currentFields.has(key))),...readPropsRows()};
        if(!id)Object.assign(authored,fieldDraft);
        if(id){
          // Compare like with like: an untouched text input may parse a number.
          // Leave live values alone unless the form value actually changed.
          obj.properties={...obj.properties};
          for(const key of new Set([...Object.keys(initialProperties),...Object.keys(authored)])){
            if(same(initialProperties[key],authored[key]))continue;
            if(authored[key]===undefined)delete obj.properties[key];else obj.properties[key]=authored[key];
          }
        }else obj.properties=authored;
        if(JSON.stringify(statusDraft)!==JSON.stringify(opened?.status)){
          if(statusDraft)obj.status=statusDraft;else delete obj.status;
        }
        const isContainer=$('#mSpace').checked;
        if(!live||isContainer!==isSpace(opened))obj.style={...obj.style,space:isContainer||containmentChildren(id).length>0};
        if(canManageMedia&&JSON.stringify(workingMedia)!==JSON.stringify(entityMedia(opened))){
          obj.media=clone(workingMedia);obj.widgets=clone(widgetsDraft);
          if(removedMediaIds.size){
            obj.description=String(obj.description||'').replace(/\{\{image:([^}]+)\}\}/g,(match,key)=>{
              let id=key;
              while(mediaReplacements.has(id))id=mediaReplacements.get(id);
              return removedMediaIds.has(id)?'':`{{image:${id}}}`;
            });
          }
        }
      }
      if(before){
        for(const key of ['name','description','note','type','tags','status','media','widgets']){
          if(!same(opened[key],before[key])&&same(before[key],obj[key]))kept.push(key);
        }
        const prior=opened.properties||{}, incoming=before.properties||{}, result=obj.properties||{};
        const keys=new Set([...Object.keys(prior),...Object.keys(incoming)]);
        if([...keys].some(key=>!same(prior[key],incoming[key])&&same(incoming[key],result[key])))kept.push('properties');
      }
      obj.updatedAt=new Date().toISOString();
      if(!live){
        obj.createdAt=obj.updatedAt;
        obj.style={...obj.style,x:(Number(getEntity(scope)?.style?.x)||0)+Math.cos(data.entities.length*.9)*190,
          y:(Number(getEntity(scope)?.style?.y)||0)+Math.sin(data.entities.length*.9)*150};
        data.entities.push(obj);
        if(scope&&getEntity(scope)&&!addContainment(obj.id,scope,{persist:false}))return false;
        if(createAt){
          placement=boardPlaceNewAt(obj,createAt);
          if(!placement)return false;
        }else if(scope&&!worldReadOnly()){
          udAddMemberPlacements(scope,obj.id);
          if(udUsesSharedLayout()&&(!udPaperViewFits(boardState().placements)||!udPaperViewFits(boardState().placements,null))){toast('Лимит доски. Освободите место для бумажки.','err');return false}
        }
      }
    });
    if(!ok)return;
    const liveIds=new Set(entityMedia(getEntity(obj.id)).map(m=>m.id));
    for(const mediaId of pendingMediaIds)if(!liveIds.has(mediaId)){UniverseGraphStorage.mediaDelete(mediaId);invalidateMediaCache(mediaId)}
    for(const m of before?.media||[])if(!liveIds.has(m.id))deferredMediaDeleteIds.add(m.id);
    pendingMediaIds.clear();activeModalCleanup=null;
    flushDeferredMediaDeletes();
    closeModal();
    if(placement?.paperId)udSelectPaper(obj.id,placement.paperId);else setSelected(obj.id,false);
    if(!createAt&&(!id||!selectedBefore))boardCenterOn([obj.id]);
    if(kept.length)keptChangesToast(kept);
    else toast(id?'Бумажка изменена':'Бумажка создана','ok');
  }
  nameInput.addEventListener('input',()=>nameInput.setCustomValidity(''));
  form.addEventListener('submit',ev=>{ev.preventDefault();submit()});
  $('#saveEntity').onclick=submit;
  nameInput.focus();
  if(e)nameInput.select();
}
function entityOptions(selected){return data.entities.map(e=>`<option value="${escapeHtml(e.id)}" ${e.id===selected?'selected':''}>${escapeHtml(e.name)} · ${escapeHtml(getET(e.type).name)}</option>`).join('')}
function openRelationModal(id,defaultFrom,pre={}){
  if(worldReadOnly())return;
  if(id&&playerRelationMasked(data.relations.find(r=>r.id===id)))return;

  const beforeData=clone(data);
  // 0.23.10: «Подробнее…» of the quick picker hands over both records and the chosen type
  const r=id?data.relations.find(x=>x.id===id):null,from=r?.from||defaultFrom,to=r?.to||pre.to||data.entities.find(e=>e.id!==from)?.id,type=r?.type||(pre.type&&getRT(pre.type)?.id===pre.type?pre.type:null)||relDefaultType(from,to),rt=getRT(type),st=r?.style||{};
  const openedR=r?clone(r):null; /* 0.30.9: what the relation was when the window opened — see keepTheirChanges */
  const typeOptions=data.relationTypes.map(t=>`<option value="${escapeHtml(t.id)}" ${t.id===type?'selected':''}>${escapeHtml(t.name)}</option>`).join('');
  openModal(r?'Редактировать связь':'Новая связь',`<div class="customizer"><div class="customizerGrid"><div class="customizerSection"><h4>Маршрут</h4><div class="form"><div class="row"><div><label>Объект A</label><select id="rFrom">${entityOptions(from)}</select></div><div><label>Объект B</label><select id="rTo">${entityOptions(to)}</select></div></div><div class="row"><div style="flex:2"><label>Тип связи</label><select id="rType">${typeOptions}</select><div class="relTypeHint" id="rTypeHint"></div></div><div style="flex:1"><label>Важность</label><select id="rTier">${tierOptionsHtml(r?.tier,'как у типа')}</select></div><div style="flex:1"><label>Название на линии</label><select id="rLabelMode">${REL_LABEL_MODES.map(([v,n])=>`<option value="${v}" ${(r?.labelMode||'')===v?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></div></div><div><label>Описание связи</label><textarea id="rDesc" rows="3" data-wiki placeholder="Как и почему они связаны. [[Имя]] — ссылка на сущность.">${escapeHtml(r?.description||'')}</textarea></div><div id="rFieldsHost" class="stack"></div><div><label>Свойства JSON</label><textarea id="rProps" class="jsonArea">${escapeHtml(JSON.stringify(Object.fromEntries(Object.entries(r?.properties||{}).filter(([k])=>!(rt.fields||[]).some(f=>f.name===k))),null,2))}</textarea></div></div></div><div class="customizerSection"><h4>Предпросмотр</h4><div class="previewBox"><div style="width:100%"><canvas id="relPreviewCanvas" class="previewCanvas"></canvas><div id="relPreviewLabel" class="previewLabel">${escapeHtml(rt.name)}</div></div></div><div class="inlineHelp" style="margin-top:8px">Настройки ниже переопределяют внешний вид только этой связи. По умолчанию они наследуются от типа.</div></div></div><div class="customizerSection"><h4>Стиль линии</h4><div class="customizerGrid"><div><label>Цвет</label><input id="rColor" class="colorInput" type="color" value="${cssRgbHex(st.color||rt.color)}"></div><div><label>Толщина</label><div class="rangeRow"><input id="rWidth" type="range" min=".5" step="any" max="20" value="${escapeHtml(st.width||rt.width||2)}"><input id="rWidthNum" type="number" min=".5" step="any" max="20" value="${escapeHtml(st.width||rt.width||2)}"></div></div><div><label>Прозрачность</label><input id="rOpacity" type="range" min="0.05" max="1" step="any" value="${escapeHtml(st.opacity??rt.opacity??1)}"></div><div><label>Тип линии</label><select id="rLine"><option value="solid">Сплошная</option><option value="dash">Пунктир</option><option value="dot">Точки</option><option value="longdash">Длинный пунктир</option><option value="dashdot">Штрих-точка</option><option value="dense">Плотный пунктир</option><option value="double">Двойная линия</option></select></div><div><label>Кривизна</label><input id="rCurve" type="range" min="-1" max="1" step="0.05" value="${escapeHtml(st.curve??0)}"></div><div><label>Размер штриха</label><input id="rDash" type="number" min="2" max="30" value="${escapeHtml(st.dashSize??7)}"></div><div><label>Разрыв штриха</label><input id="rDashGap" type="number" min="1" max="40" value="${escapeHtml(st.dashGap??7)}"></div></div></div><div class="customizerSection"><h4>Стрелка и подпись</h4><div class="customizerGrid"><label class="toggleRow"><span>Показывать стрелку</span><input id="rArrow" class="checkbox" type="checkbox" ${st.arrow??rt.arrow?'checked':''}></label><div><label>Размер стрелки</label><input id="rArrowSize" type="range" min="5" max="18" value="${escapeHtml(st.arrowSize??8)}"></div><label class="toggleRow"><span>Показывать подпись</span><input id="rLabel" class="checkbox" type="checkbox" ${st.labelVisible??true?'checked':''}></label><div><label>Размер подписи</label><input id="rLabelSize" type="range" min="6" max="24" step="any" value="${escapeHtml(st.labelSize??10)}"></div></div></div><div class="customizerSection"><h4>Анимация</h4><div class="customizerGrid"><label class="toggleRow"><span>Анимация</span><input id="rAnimated" class="checkbox" type="checkbox" ${st.animated??rt.animated?'checked':''}></label><div><label>Режим</label><select id="rAnimStyle"><option value="dot">Поток точки</option><option value="reverse">Обратный поток</option><option value="pulse">Пульсация в центре</option><option value="comet">Комета</option><option value="trail">След</option><option value="spark">Искры</option></select></div><div><label>Скорость</label><input id="rAnimSpeed" type="range" min="0.1" max="4" step="0.1" value="${escapeHtml(st.animationSpeed??rt.animationSpeed??1)}"></div><label class="toggleRow"><span>Секретная связь</span><input id="rSecret" class="checkbox" type="checkbox" ${r?.properties?.secret?'checked':''}></label></div></div></div>`,`<button class="btn" id="cancelModal">Отмена</button>${r?'<button class="btn danger" id="deleteRelation">Удалить</button>':''}<button class="btn primary" id="saveRelation">${r?'Сохранить':'Создать'}</button>`);
  $('#rLine').value=st.lineStyle||rt.lineStyle||'solid';$('#rAnimStyle').value=st.animationStyle||rt.animationStyle||'dot';
  const getRelationPreviewSpec=()=>({color:$('#rColor').value,width:Number($('#rWidthNum').value)||2,opacity:Number($('#rOpacity').value)||1,lineStyle:$('#rLine').value,arrow:$('#rArrow').checked,arrowSize:Number($('#rArrowSize').value)||8,animated:$('#rAnimated').checked,animationStyle:$('#rAnimStyle').value,animationSpeed:Number($('#rAnimSpeed').value)||1,curve:Number($('#rCurve').value)||0,dashSize:Number($('#rDash').value)||7,dashGap:Number($('#rDashGap').value)||7,labelVisible:$('#rLabel').checked,labelSize:Number($('#rLabelSize').value)||10,label:$('#rType').selectedOptions[0]?.textContent||rt.name});
  const sync=()=>{$('#relPreviewLabel').textContent=$('#rType').selectedOptions[0]?.textContent||rt.name;wakePreviewLoop()};
  $('#rWidth').oninput=e=>{$('#rWidthNum').value=e.target.value;sync()};$('#rWidthNum').oninput=e=>{$('#rWidth').value=clamp(Number(e.target.value)||2,.5,20);sync()};['rColor','rOpacity','rLine','rType','rCurve','rDash','rDashGap','rArrow','rArrowSize','rLabel','rLabelSize','rAnimated','rAnimStyle','rAnimSpeed'].forEach(x=>$('#'+x).addEventListener('input',sync));['rType','rLine','rAnimStyle'].forEach(x=>$('#'+x).addEventListener('change',sync));
  replacePreviewLoop(mountRelationPreview($('#relPreviewCanvas'),getRelationPreviewSpec));
  // 0.18: the relation type's questionnaire; answers live in properties like a record's.
  const relProps=clone(r?.properties||{});const renderRelFields=()=>{const fields=getRT($('#rType').value).fields||[];$('#rFieldsHost').innerHTML=fields.length?`<label>Анкета связи</label><div class="stack">${fieldsFormHtml(fields,relProps,null)}</div>`:''};renderRelFields();$('#rType').addEventListener('change',()=>{Object.assign(relProps,readEntityFieldsForm($('#rFieldsHost')));renderRelFields()});
  // 0.23.10: A, B and the type are chosen with the same search as the quick picker (the selects stay, hidden — all the
  // logic of this window keeps reading them); the look of the line, the preview and JSON fold into «Оформление».
  relModalSimplify(r);
  $('#cancelModal').onclick=closeModal;// Fields the person touched in this dialog; the rest follow the chosen type.
  const relDirty=new Set();const relFieldKey={rColor:'color',rWidth:'width',rWidthNum:'width',rOpacity:'opacity',rArrow:'arrow',rArrowSize:'arrowSize',rAnimated:'animated',rLine:'lineStyle',rAnimStyle:'animationStyle',rAnimSpeed:'animationSpeed',rCurve:'curve',rDash:'dashSize',rDashGap:'dashGap',rLabel:'labelVisible',rLabelSize:'labelSize'};
  for(const [id,key] of Object.entries(relFieldKey)){const el=$('#'+id);if(el){el.addEventListener('input',()=>relDirty.add(key));el.addEventListener('change',()=>relDirty.add(key))}}
  // 0.22: a live note under the type — its reverse name, or why these two records cannot be joined by it.
  const syncTypeHint=()=>{const x=getRT($('#rType').value),a=getEntity($('#rFrom').value),b=getEntity($('#rTo').value),h=$('#rTypeHint');if(!h)return;const ok=relationTypeAllows(x,a,b);h.classList.toggle('bad',!ok);h.textContent=!ok?`Эти сущности так не соединить: ${relationAllowedText(x)}`:x.reverseName&&b?`У «${b.name}» связь будет называться «${x.reverseName}»`:''};
  ['rType','rFrom','rTo'].forEach(id=>$('#'+id)?.addEventListener('change',syncTypeHint));syncTypeHint();
  $('#rType').onchange=()=>{const x=getRT($('#rType').value);
    // 0.16: an existing relation used to keep the previous type's look in these
    // fields, so saving stored it as an override and the line kept its old colour.
    const follow=k=>!r||(r.style?.[k]===undefined&&!relDirty.has(k));
    if(r){if(follow('color'))$('#rColor').value=cssRgbHex(x.color);if(follow('width')){$('#rWidth').value=x.width??2;$('#rWidthNum').value=x.width??2}if(follow('opacity'))$('#rOpacity').value=x.opacity??1;if(follow('arrow'))$('#rArrow').checked=!!x.arrow;if(follow('arrowSize'))$('#rArrowSize').value=x.arrowSize??8;if(follow('animated'))$('#rAnimated').checked=!!x.animated;if(follow('lineStyle'))$('#rLine').value=x.lineStyle||'solid';if(follow('animationStyle'))$('#rAnimStyle').value=x.animationStyle||'dot';if(follow('animationSpeed'))$('#rAnimSpeed').value=x.animationSpeed??1;if(follow('curve'))$('#rCurve').value=x.curve??0;if(follow('dashSize'))$('#rDash').value=x.dashSize??7;if(follow('dashGap'))$('#rDashGap').value=x.dashGap??7;if(follow('labelVisible'))$('#rLabel').checked=x.labelVisible??true;if(follow('labelSize'))$('#rLabelSize').value=x.labelSize??10}
    if(!r){$('#rColor').value=cssRgbHex(x.color);$('#rWidth').value=x.width??2;$('#rWidthNum').value=x.width??2;$('#rOpacity').value=x.opacity??1;$('#rArrow').checked=!!x.arrow;$('#rArrowSize').value=x.arrowSize??8;$('#rAnimated').checked=!!x.animated;$('#rLine').value=x.lineStyle||'solid';$('#rAnimStyle').value=x.animationStyle||'dot';$('#rAnimSpeed').value=x.animationSpeed??1;$('#rCurve').value=x.curve??x.curvature??0;$('#rDash').value=x.dashSize??x.dashLength??7;$('#rDashGap').value=x.dashGap??7;$('#rLabel').checked=x.labelVisible??true;$('#rLabelSize').value=x.labelSize??10;}sync()};
  $('#saveRelation').onclick=()=>{
    const liveRelation=r?data.relations.find(x=>x.id===r.id):null;
    if(r&&!liveRelation){toast('Пока окно было открыто, эту связь удалили.','err');return}
    const liveR=liveRelation?clone(liveRelation):null;let keptR=[];
    let props={};
    try{props=JSON.parse($('#rProps').value||'{}')}catch{toast('Свойства JSON заполнены некорректно','err');return}
    if(!props||typeof props!=='object'||Array.isArray(props)){toast('Свойства JSON должны быть объектом','err');return}
    if($('#rSecret').checked)props.secret=true;else delete props.secret;
    {const fields=getRT($('#rType').value).fields||[];for(const f of fields)delete props[f.name];Object.assign(props,readEntityFieldsForm($('#rFieldsHost')));for(const [k,v] of Object.entries(r?.properties||{}))if(!(k in props)&&!fields.some(f=>f.name===k)&&(data.relationTypes.some(t=>(t.fields||[]).some(f=>f.name===k))))props[k]=v}
    const relDesc=$('#rDesc').value;
    const f=$('#rFrom').value,t=$('#rTo').value;
    if(!f||!t||f===t){toast('Нельзя связать объект сам с собой','err');return}
    const chosenType=getRT($('#rType').value);
    if(!relationTypeAllows(chosenType,getEntity(f),getEntity(t))){toast(`«${chosenType.name}» соединяет только так: ${relationAllowedText(chosenType)}`,'err');return}
    const style={color:normalizeHex($('#rColor').value),width:clamp(Number($('#rWidthNum').value)||2,.5,20),opacity:clamp(Number($('#rOpacity').value)||1,.05,1),lineStyle:$('#rLine').value,arrow:$('#rArrow').checked,arrowSize:Number($('#rArrowSize').value)||8,animated:$('#rAnimated').checked,animationStyle:$('#rAnimStyle').value,animationSpeed:Number($('#rAnimSpeed').value)||1,curve:clamp(Number($('#rCurve').value)||0,-1,1),dashSize:clamp(Number($('#rDash').value)||7,2,30),dashGap:clamp(Number($('#rDashGap').value)||7,1,40),labelVisible:$('#rLabel').checked,labelSize:clamp(Number($('#rLabelSize').value)||11,6,24)};
    // Keep only the settings that differ from the relation type, so editing the
    // type later restyles every relation that was not customised (0.15.21).
    {const defaults={opacity:1,arrow:false,arrowSize:8,animated:false,animationStyle:'dot',animationSpeed:1,curve:0,dashSize:7,dashGap:7,labelVisible:true,labelSize:11,lineStyle:'solid',width:2};const lean={};for(const [k,v] of Object.entries(r?.style||{}))if(!(k in style))lean[k]=v;for(const [k,v] of Object.entries(style)){const base=chosenType[k]??defaults[k];const equal=typeof v==='number'?Number(base)===v:String(base??'').toLowerCase()===String(v).toLowerCase();if(!equal)lean[k]=v}for(const k of Object.keys(style))delete style[k];Object.assign(style,lean)}
    // «Подробнее» keeps the addressed instances, including a deliberate reversal.
    const papers=!r&&pre.papers?(f===from&&t===to?pre.papers:
      f===to&&t===from?{...pre.papers,from:pre.papers.to,to:pre.papers.from}:null):null;
    if(papers&&!udLinkPapersAvailable(papers,f,t)){toast('Выбранные бумажки больше не видны','err');return}
    const legacyArrow=!r&&((f===from&&t===to)||(f===to&&t===from))?pre.legacyArrow:null;
    if((papers||legacyArrow)&&chosenType.containment){
      const configureRelation=relation=>{
        relation.properties=props;relation.style=style;
        if(relDesc.trim())relation.description=relDesc;else delete relation.description;
      };
      const saved=papers?udNestPaper(papers.to,papers.from,{keepPosition:true,configureRelation}):
        boardNestLegacyArrow(f,t,legacyArrow,configureRelation);
      if(!saved){toast('Не удалось переместить бумажку. Проверьте вложенность, закрепление и доступность контейнера.','err');return}
      closeModal();updateUI();return;
    }
    // An imported parallel relation can keep its route while its appearance is edited.
    const typeId=$('#rType').value,routeChanged=!liveRelation||liveRelation.from!==f||liveRelation.to!==t||liveRelation.type!==typeId;
    if(!chosenType.containment&&routeChanged){
      const dup=data.relations.find(x=>x.id!==liveRelation?.id&&x.from===f&&x.to===t&&x.type===typeId);
      if(dup){toast('Такая связь уже есть — открываю её','err');closeModal();state.selectedRelationId=dup.id;state.selectedId=null;updateUI();return}
    }
    let saved;
    if(chosenType.containment){
      saved=liveRelation?.udMembership?udAddMembership(f,t,liveRelation.id):addContainment(t,f,{force:true,relationId:r?.id,persist:false});
      if(!saved)return;
      saved.properties=props;saved.style=style;if(relDesc.trim())saved.description=relDesc;else delete saved.description;
    }else{
      const obj={id:r?.id||uid('relation'),from:f,to:t,type:$('#rType').value,properties:props,style};
      if(relDesc.trim())obj.description=relDesc;
      const tier=Number($('#rTier')?.value)||0;if(tier)obj.tier=tier;
      const lm=$('#rLabelMode')?.value||'';if(lm)obj.labelMode=lm; /* 0.28.3 */
      if(liveRelation){
        Object.assign(liveRelation,obj);delete liveRelation.udMembership;
        if(!relDesc.trim())delete liveRelation.description;
        if(!tier)delete liveRelation.tier;
        if(!lm)delete liveRelation.labelMode;
        keptR=keepTheirChanges(liveRelation,openedR,liveR);
      }else data.relations.push(obj);
      saved=liveRelation||obj;
    }
    state.viewVersion++;if(!persist()){data=clone(beforeData);normalize();updateUI();toast('Не удалось сохранить связь — состояние восстановлено','err');return}closeModal();state.selectedRelationId=saved.id;state.selectedId=null;updateUI();toast(r?'Связь обновлена':'Связь создана','ok');keptChangesToast(keptR)
  };
  if(r)$('#deleteRelation').onclick=()=>{const before=clone(data);replaceActiveRelations(data.relations.filter(x=>x.id!==r.id));state.viewVersion++;if(!persist()){data=before;normalize();updateUI();toast('Не удалось удалить связь — состояние восстановлено','err');return}state.selectedRelationId=null;closeModal();updateUI();toast('Связь удалена','ok')};sync()
}
// 0.17: the old «Схема и типы» window is now the «Набор правил» window (features/rules.js).
function openTypeModal(){openRulesModal('types')}
// 0.22: reverse name of a relation type and which record types it may join (empty = any).
function relationDirectionHtml(rt){
  const chips=(cls,list)=>`<div class="relTypeChips">${data.entityTypes.map(t=>`<label class="relTypeChip"><input type="checkbox" class="${cls}" value="${escapeHtml(t.id)}" ${Array.isArray(list)&&list.includes(t.id)?'checked':''}> ${escapeHtml((t.icon||'•')+' '+t.name)}</label>`).join('')}</div>`;
  return `<div class="customizerSection relDirection"><h4>Направление</h4><div class="form"><div><label>Обратное название</label><input id="tReverse" value="${escapeHtml(rt?.reverseName||'')}" placeholder="Например, «Ребёнок» для «Родитель»" maxlength="80"><div class="inlineHelp">Так связь называется у сущности на конце стрелки. Пусто — у обеих сущностей одно название.</div></div>
  <div><label>Откуда — только эти типы</label>${chips('tRelFrom',rt?.fromTypes)}</div><div><label>Куда — только эти типы</label>${chips('tRelTo',rt?.toTypes)}</div><div class="inlineHelp">Ничего не отмечено — любые сущности. Уже созданные связи не удаляются, новые неподходящие создать не получится.</div></div></div>`;
}
function readRelationDirection(){const pick=cls=>[...document.querySelectorAll('.'+cls+':checked')].map(x=>x.value);const rev=$('#tReverse')?.value.trim()||'',from=pick('tRelFrom'),to=pick('tRelTo');return {reverseName:rev||undefined,fromTypes:from.length?from:undefined,toTypes:to.length?to:undefined}}
function openTypeEditor(kind,id){
  const isE=kind==='entity',obj=isE?data.entityTypes.find(x=>x.id===id):data.relationTypes.find(x=>x.id===id),title=isE?'Тип сущности':'Тип связи';
  // The nesting relation (one per rule set) can be renamed and restyled but not removed (0.17).
  const isCanonicalContains=!isE&&!!obj&&obj.containment===true;
  const lineOptions=`<option value="solid">Сплошная</option><option value="dash">Пунктир</option><option value="dot">Точки</option><option value="longdash">Длинный пунктир</option><option value="dashdot">Штрих-точка</option><option value="dense">Плотный пунктир</option><option value="double">Двойная линия</option>`;
  const entityAnim=`<option value="none">Нет</option><option value="pulse">Пульсация</option><option value="breathe">Дыхание</option><option value="float">Плавание</option><option value="orbit">Орбита</option><option value="rotate">Вращение обода</option><option value="flicker">Мерцание</option>`;
  const relAnim=`<option value="dot">Поток точки</option><option value="reverse">Обратный поток</option><option value="pulse">Пульсация центра</option><option value="comet">Комета</option><option value="trail">След</option><option value="spark">Искры</option>`;
  openModal(title,`<div class="customizer"><div class="customizerGrid"><div class="customizerSection"><h4>Основные параметры</h4><div class="customizerGrid"><div><label>Название</label><input id="tName" value="${escapeHtml(obj?.name||'')}" placeholder="${isE?'Династия':'Ненавидит'}"></div>${isE?`<div><label>Группа в «Наборе правил»</label><input id="tGroup" list="tGroupList" maxlength="40" value="${escapeHtml(obj?.group||'')}" placeholder="сама: ${escapeHtml(typeof entityTypeGroup==='function'?entityTypeGroup(obj||{name:''}):'')}"><datalist id="tGroupList">${[...new Set(data.entityTypes.map(t=>typeof entityTypeGroup==='function'?entityTypeGroup(t):'').filter(Boolean))].map(g=>`<option value="${escapeHtml(g)}"></option>`).join('')}</datalist></div>`:''}${!isE?`<div><label>Важность связей этого типа</label><select id="tTier">${tierOptionsHtml(relationTypeTier(obj))}</select></div>`:''}<div><label>Цвет</label><input id="tColor" class="colorInput" type="color" value="${cssRgbHex(obj?.color)}"></div><div><label>${isE?'Размер':'Толщина'}</label><input id="tSize" type="range" min="${isE?10:.5}" step="${isE?1:'any'}" max="${isE?120:20}" value="${escapeHtml(obj?.[isE?'size':'width']||(isE?30:2))}"></div>${isE?'<div><label>Иконка</label><input id="tIcon" value="'+escapeHtml(obj?.icon||'✦')+'" maxlength="4"></div><div><label>Форма</label><select id="tShape"><option value="circle">Круг</option><option value="square">Квадрат</option><option value="diamond">Ромб</option><option value="triangle">Треугольник</option><option value="hex">Шестиугольник</option><option value="star">Звезда</option></select></div>':'<div><label>Тип линии</label><select id="tLine">'+lineOptions+'</select></div><div><label>Кривизна</label><input id="tCurve" type="range" min="-1" max="1" step="0.05" value="'+escapeHtml(obj?.curve??0)+'"></div><div><label>Размер штриха</label><input id="tDash" type="number" min="2" max="30" value="'+escapeHtml(obj?.dashSize??7)+'"></div><div><label>Разрыв штриха</label><input id="tDashGap" type="number" min="1" max="40" value="'+escapeHtml(obj?.dashGap??7)+'"></div>'}</div></div><div class="customizerSection"><h4>Предпросмотр</h4><div class="previewBox"><div style="width:100%"><canvas id="typePreviewCanvas" class="previewCanvas"></canvas><div id="typePreviewLabel" class="previewLabel">Новый тип</div></div></div></div></div>${isE?`<div class="customizerSection"><h4>Внешний вид</h4><div class="customizerGrid"><div><label>Анимация</label><select id="tAnimation">${entityAnim}</select></div><div><label>Скорость</label><input id="tAnimSpeed" type="range" min="0.1" max="4" step="0.1" value="${escapeHtml(obj?.animationSpeed||1)}"></div><div><label>Свечение</label><input id="tGlow" type="range" min="0" max="60" value="${escapeHtml(obj?.glow??17)}"></div><div><label>Толщина обводки</label><input id="tBorderWidth" type="range" min="0.5" max="8" step="0.5" value="${escapeHtml(obj?.borderWidth??1.3)}"></div></div></div>`:`<div class="customizerSection"><h4>Линия и движение</h4><div class="customizerGrid"><label class="toggleRow"><span>Стрелка по умолчанию</span><input id="tArrow" class="checkbox" type="checkbox" ${obj?.arrow?'checked':''}></label><div><label>Размер стрелки</label><input id="tArrowSize" type="range" min="5" max="22" value="${escapeHtml(obj?.arrowSize||8)}"></div><label class="toggleRow"><span>Анимация по умолчанию</span><input id="tAnimated" class="checkbox" type="checkbox" ${obj?.animated?'checked':''}></label><div><label>Режим анимации</label><select id="tAnimStyle">${relAnim}</select></div><div><label>Скорость</label><input id="tAnimSpeed" type="range" min="0.1" max="4" step="0.1" value="${escapeHtml(obj?.animationSpeed||1)}"></div>${isCanonicalContains?'<div class="inlineHelp">Это связь вложенности: она делает одну сущность «внутри» другой. Название и вид можно менять, удалить её нельзя.</div>':''}</div></div><div class="customizerSection"><h4>Подпись</h4><div class="customizerGrid"><label class="toggleRow"><span>Показывать подпись</span><input id="tLabel" class="checkbox" type="checkbox" ${obj?.labelVisible??true?'checked':''}></label><div><label>Размер подписи</label><input id="tLabelSize" type="range" min="8" max="20" value="${escapeHtml(obj?.labelSize||10)}"></div></div></div>`}${!isE&&!isCanonicalContains?relationDirectionHtml(obj):''}${fieldsEditorHtml(obj?.fields)}</div>`,`<button class="btn" id="cancelModal">Назад</button>${obj&&!isCanonicalContains?'<button class="btn danger" id="deleteType">Удалить</button>':''}${obj?`<button class="btn" id="applyTypeToAll" title="Убрать индивидуальные настройки внешнего вида у всех объектов этого типа в текущей рабочей зоне">Применить ко всем ${isE?'сущностям':'связям'} типа</button>`:''}<button class="btn primary" id="saveType">Сохранить тип</button>`);
  const backToRules=()=>rulesBack(isE?'types':'relations');
  $('#cancelModal').onclick=backToRules;
  bindFieldsEditor();
  if($('#deleteType'))$('#deleteType').onclick=()=>isE?deleteEntityType(obj.id):deleteRelationType(obj.id);
  if(obj)$('#applyTypeToAll').onclick=()=>{const keys=isE?['color','shape','size','icon','borderColor','borderWidth','glow','animation','animationSpeed']:['color','width','lineStyle','arrow','arrowSize','animated','animationStyle','animationSpeed','curve','dashSize','dashGap','labelVisible','labelSize','opacity'];const list=isE?data.entities.filter(e=>e.type===obj.id):data.relations.filter(r=>r.type===obj.id);if(!list.length){toast('В этой рабочей зоне нет объектов этого типа','err');return}if(!confirm(`Сбросить индивидуальное оформление у ${list.length} объектов? Они примут вид типа «${obj.name}».`))return;if(!saveTypeNow())return;const before=clone(data);for(const x of list){x.style=x.style||{};for(const k of keys)delete x.style[k]}state.viewVersion++;if(!persist()){data=before;normalize();updateUI();toast('Не удалось применить стиль типа — состояние восстановлено','err');return}updateUI();toast(`Стиль типа применён: ${list.length}`,'ok');backToRules()};
  if(isE){$('#tShape').value=obj?.shape||'circle';$('#tAnimation').value=obj?.animation||'none'}else{$('#tLine').value=obj?.lineStyle||'solid';$('#tAnimStyle').value=obj?.animationStyle||'dot'}
  const typeEntitySpec=()=>({color:$('#tColor').value,shape:$('#tShape').value,size:Number($('#tSize').value)||30,icon:$('#tIcon').value||'✦',borderColor:'rgba(255,255,255,.22)',borderWidth:Number($('#tBorderWidth').value)||1.3,glow:Number($('#tGlow').value)||17,opacity:1,animation:$('#tAnimation').value,animationSpeed:Number($('#tAnimSpeed').value)||1,iconColor:'#eef6ff'});
  const typeRelationSpec=()=>({color:$('#tColor').value,width:Number($('#tSize').value)||2,opacity:1,lineStyle:$('#tLine').value,arrow:$('#tArrow').checked,arrowSize:Number($('#tArrowSize').value)||8,animated:$('#tAnimated').checked,animationStyle:$('#tAnimStyle').value,animationSpeed:Number($('#tAnimSpeed').value)||1,curve:Number($('#tCurve').value)||0,dashSize:Number($('#tDash').value)||7,dashGap:Number($('#tDashGap').value)||7,labelVisible:$('#tLabel').checked,labelSize:Number($('#tLabelSize').value)||10,label:$('#tName').value.trim()||'Новый тип'});
  $('#typePreviewLabel').textContent=$('#tName').value.trim()||'Новый тип';
  ['tName','tColor','tSize','tIcon','tShape','tAnimation','tAnimSpeed','tGlow','tBorderWidth','tLine','tCurve','tDash','tDashGap','tArrow','tArrowSize','tAnimated','tAnimStyle','tLabel','tLabelSize'].forEach(id=>{const x=$('#'+id);if(x){const syncTypePreview=()=>{$('#typePreviewLabel').textContent=$('#tName')?.value.trim()||'Новый тип';wakePreviewLoop()};x.addEventListener('input',syncTypePreview);x.addEventListener('change',syncTypePreview)}});
  if(isE)replacePreviewLoop(mountEntityPreview($('#typePreviewCanvas'),typeEntitySpec));else replacePreviewLoop(mountRelationPreview($('#typePreviewCanvas'),typeRelationSpec));
  // Saves the type; returns true on success (used by «Сохранить» and «Применить ко всем»).
  const saveTypeNow=()=>{
    const o=isE?{id:obj?.id||uid('etype'),name:$('#tName').value.trim()||'Новый тип',color:normalizeHex($('#tColor').value),size:clamp(Number($('#tSize').value)||(obj?.size||30),10,120),shape:$('#tShape').value,icon:$('#tIcon').value||'✦',animation:$('#tAnimation').value,animationSpeed:Number($('#tAnimSpeed').value)||1,glow:Number($('#tGlow').value)||17,borderWidth:Number($('#tBorderWidth').value)||1.3}:{id:obj?.id||uid('rtype'),name:$('#tName').value.trim()||(isCanonicalContains?'Содержит':'Новая связь'),color:normalizeHex($('#tColor').value),width:clamp(Number($('#tSize').value)||(obj?.width||2),.5,20),lineStyle:$('#tLine').value,arrow:$('#tArrow').checked,arrowSize:Number($('#tArrowSize').value)||8,animated:$('#tAnimated').checked,animationStyle:$('#tAnimStyle').value,animationSpeed:Number($('#tAnimSpeed').value)||1,containment:isCanonicalContains,curve:clamp(Number($('#tCurve').value)||0,-1,1),dashSize:clamp(Number($('#tDash').value)||7,2,30),dashGap:clamp(Number($('#tDashGap').value)||7,1,40),labelVisible:$('#tLabel').checked,labelSize:Number($('#tLabelSize').value)||10};
    const before=clone(data);
    {const fields=readFieldsEditor();if(obj&&!applyFieldRenames(obj.id,obj.fields,fields,isE?data.entities:data.relations)){toast('У сущности уже есть ответ с таким названием. Выберите другое имя поля.','err');return false}o.fields=fields.length?fields:undefined}
    if(!isE&&!o.containment)delete o.containment;
    if(!isE&&$('#tTier'))o.tier=Number($('#tTier').value)||3;
    const ownGroup=isE?String($('#tGroup')?.value||'').trim().slice(0,40):'';if(ownGroup)o.group=ownGroup; /* 0.28.3: the type's own group in the rules list */
    if(!isE&&$('#tReverse'))Object.assign(o,readRelationDirection());
    if(obj){Object.assign(obj,o);if(isE&&!ownGroup)delete obj.group}else(isE?data.entityTypes:data.relationTypes).push(o);for(const k of ['reverseName','fromTypes','toTypes']){const t=obj||o;if(t[k]===undefined)delete t[k]}if(!o.fields&&obj)delete obj.fields;state.viewVersion++;if(!persist()){data=before;normalize();updateUI();toast('Не удалось сохранить тип — состояние восстановлено','err');return false}updateUI();toast('Тип сохранён','ok');return true
  };
  $('#saveType').onclick=()=>{if(saveTypeNow())backToRules()}
}
function confirmDeleteEntity(id){
  if(worldReadOnly())return;
  const e=getEntity(id);if(!e||id===currentRootId()){toast('Корневую вселенную удалить нельзя','err');return}
  openModal('Удалить сущность везде',`<div class="empty" style="font-size:12px;line-height:1.55">Удалить «<strong>${escapeHtml(e.name)}</strong>», все её бумажки и связи в этой рабочей зоне? Вложенные будут перенесены к родителю. Сущность попадёт в корзину — оттуда её можно вернуть.</div>`,`<button type="button" class="btn" id="cancelDelete">Отмена</button><button type="button" class="btn danger" id="confirmDelete">Удалить</button>`);
  $('#cancelDelete').onclick=closeModal;
  $('#confirmDelete').onclick=()=>{closeModal();deleteEntity(id,true)};
}
// Single delete = the multi-delete with the confirmation dialog already shown.
// (A second, slightly different implementation used to live here.)
function deleteEntity(id,confirmed=false){const e=getEntity(id);if(!e||id===currentRootId()){toast('Корневую вселенную удалить нельзя','err');return}if(!confirmed){confirmDeleteEntity(id);return}deleteEntities([id],{confirm:false})}

function relModalSimplify(r){
  const box=$('#modal')||document.querySelector('.modal');if(!box)return;
  const pick=(id,kind)=>{const sel=$('#'+id);if(!sel)return;sel.classList.add('relHiddenSelect');sel.tabIndex=-1;
    const b=document.createElement('button');b.type='button';b.className='relPick';b.dataset.relPick=kind;const label=()=>{b.innerHTML=`<span>${escapeHtml(sel.selectedOptions[0]?.textContent||'—')}</span><i>▾</i>`};label();sel.after(b);
    sel.addEventListener('change',label);
    b.onclick=()=>{const rc=b.getBoundingClientRect(),set=v=>{sel.value=v;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));label()};
      if(kind==='type')openTypeChooser($('#rFrom').value,$('#rTo').value,rc.left,rc.bottom,set);
      else openRecordChooser(rc.left,rc.bottom,{exclude:kind==='from'?$('#rTo').value:$('#rFrom').value,title:kind==='from'?'Откуда связь (сущность A)':'Куда связь (сущность B)',onPick:set})}};
  pick('rFrom','from');pick('rTo','to');pick('rType','type');
  const grid=box.querySelector('.customizerGrid');if(!grid)return;
  const det=document.createElement('details');det.className='relMore';const custom=r&&Object.keys(r.style||{}).length;
  det.innerHTML=`<summary>Оформление линии и свойства${custom?' · есть свои настройки':''}</summary><div class="relMoreBody"></div>`;
  const body=det.querySelector('.relMoreBody');
  for(const sec of [...box.querySelectorAll('.customizerSection')]){const h=sec.querySelector('h4')?.textContent||'';if(/Маршрут/.test(h))continue;body.appendChild(sec)}
  const json=$('#rProps')?.closest('div');if(json)body.prepend(json);
  grid.after(det);grid.classList.add('relSimple');
}

// 0.23.10: a new relation starts with the type used last (if it fits A → B), else the first ordinary type that fits — not «Содержит»
function relDefaultType(from,to){const a=getEntity(from),b=getEntity(to),fits=t=>t&&!t.containment&&relationTypeAllows(t,a,b);
  for(const id of (typeof linkRecentTypes==='function'?linkRecentTypes():[])){const t=getRT(id);if(fits(t))return t.id}
  return (data.relationTypes.find(fits)||data.relationTypes.find(t=>!t.containment)||data.relationTypes[0])?.id}

