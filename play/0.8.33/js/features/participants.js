// Universe Graph — участники (0.30.1). Первая ступень онлайна: кто будет играть вместе с Мастером.
// Мастер (ник, цвет, аватар) и список участников: ник, роль (игрок / зритель), цвет, аватар, пароль, миры (все или выбранные
// рабочие зоны). Хранится в настройках программы, а не в мире: один участник может играть в нескольких мирах.
// Пароль нигде не хранится — только «отпечаток» PBKDF2-SHA-256 с солью; вход проверяет partLogin(ник, пароль) (для 0.30.3).
// Окно «Участники» — из меню «👑 Мастер ▾». Там же, в меню, — «глазами Борна»; в «Моих заметках» — столбик участников.
// Модуль загружается обычным <script> после playerview.js; имена — с приставкой part.
'use strict';
const PART_KEY='ug-participants-v1';
const PART_ROLES=[['player','🎲','Игрок','создаёт и правит вместе со всеми'],['viewer','👁','Зритель','только смотрит']];
const PART_COLORS=['#e5484d','#f76b15','#d9a400','#7cb518','#30a46c','#12a594','#0090ff','#3e63dd','#8e4ec6','#d6409f','#a18072','#6f6e77'];
const PART_GM_COLOR='#c9a227';
const PART_MAX=40,PART_NAME_MAX=32,PART_PASS_MIN=4,PART_PASS_MAX=200,PART_ITER=120000;
const partUI={editing:null,error:'',avatar:null,avatarError:'',color:'',draftName:'',busy:false,upload:null};
let partCache=null;

function partColorOk(c){return typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)}
function partAvatarOk(a){return typeof a==='string'&&a.length<200000&&/^data:image\/(png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(a)}
function partCleanName(n){return String(n??'').replace(/[\u0000-\u001f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,PART_NAME_MAX)}
function partCleanPass(p){if(!isRecord(p))return null;const ok=s=>typeof s==='string'&&/^[a-z0-9+/=]{8,200}$/i.test(s);return ok(p.salt)&&ok(p.hash)&&Number.isInteger(p.iter)&&p.iter>=10000&&p.iter<=2000000?{salt:p.salt,hash:p.hash,iter:p.iter}:null}
function partClean(p){
  if(!isRecord(p))return null;const name=partCleanName(p.name);if(!name)return null;
  const id=typeof p.id==='string'&&/^[a-z0-9_-]{3,60}$/i.test(p.id)?p.id:uid('part');
  const worlds=p.worlds==='all'||!Array.isArray(p.worlds)?'all':[...new Set(p.worlds.filter(w=>typeof w==='string'&&w.length<80))].slice(0,200);
  return {id,name,role:p.role==='viewer'?'viewer':'player',color:partColorOk(p.color)?p.color.toLowerCase():PART_COLORS[0],avatar:partAvatarOk(p.avatar)?p.avatar:'',pass:partCleanPass(p.pass),worlds,created:typeof p.created==='string'?p.created.slice(0,40):new Date().toISOString()};
}
function partLoad(){
  if(partCache)return partCache;let raw={};
  try{raw=JSON.parse(UniverseGraphStorage.getSetting(PART_KEY)||'{}')||{}}catch{raw={}}
  const gm=isRecord(raw.gm)?raw.gm:{};const seen=new Set();
  const list=(Array.isArray(raw.list)?raw.list:[]).map(partClean).filter(p=>{if(!p)return false;const k=searchFold(p.name);if(seen.has(k)||seen.has('id:'+p.id))return false;seen.add(k);seen.add('id:'+p.id);return true}).slice(0,PART_MAX);
  partCache={gm:{name:partCleanName(gm.name)||'Мастер',color:partColorOk(gm.color)?gm.color.toLowerCase():PART_GM_COLOR,avatar:partAvatarOk(gm.avatar)?gm.avatar:''},list};
  return partCache;
}
function partSave(d){
  try{
    if(UniverseGraphStorage.setSetting(PART_KEY,JSON.stringify(d))===false)throw new Error('Не удалось сохранить аватары игроков');
    partCache=d;
    return true;
  }catch(e){settingSaveFailed(e);return false}
}
function partList(){return partLoad().list}
function partGm(){return partLoad().gm}
function partGet(id){return partList().find(p=>p.id===id)||null}
function partFind(name){const k=searchFold(partCleanName(name));return k?partList().find(p=>searchFold(p.name)===k)||null:null}
function partAllowed(p,wsId=state.workspaceId){return !!p&&(p.worlds==='all'||p.worlds.includes(wsId))}
function partsInWorld(wsId=state.workspaceId){return partList().filter(p=>partAllowed(p,wsId))}
function partPublic(p){if(!p)return null;const {pass,...rest}=p;return {...rest,hasPassword:!!pass}}
function partInitial(name){return (String(name||'?').trim()[0]||'?').toUpperCase()}
function partAvatarHtml(p,cls='partAva'){
  const c=partColorOk(p?.color)?p.color:PART_COLORS[0];
  return p?.avatar?`<span class="${cls}" style="--part-c:${c}"><img src="${escapeHtml(p.avatar)}" alt=""></span>`:`<span class="${cls}" style="--part-c:${c}"><b>${escapeHtml(partInitial(p?.name))}</b></span>`;
}

// ---- пароль: только отпечаток ----
function partB64(buf){let s='';const a=new Uint8Array(buf);for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)}
function partUnB64(s){const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
function partCryptoOk(){return !!window.crypto?.getRandomValues}
async function partHash(password,salt=null,iter=PART_ITER){
  if(!partCryptoOk())throw new Error('В этом окне нет защищённого хранения паролей');
  const s=salt?partUnB64(salt):crypto.getRandomValues(new Uint8Array(16));
  const bytes=new TextEncoder().encode(String(password));
  if(!crypto.subtle){
    return {salt:partB64(s),hash:partB64(UDOnlineCrypto.derive(bytes,s,iter)),iter};
  }
  const key=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:s,iterations:iter},key,256);
  return {salt:partB64(s),hash:partB64(bits),iter};
}
function partSameText(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function partCheckPassword(id,password){const p=partGet(id);if(!p?.pass||typeof password!=='string')return false;try{const h=await partHash(password,p.pass.salt,p.pass.iter);return partSameText(h.hash,p.pass.hash)}catch{return false}}
// for 0.30.3: the player types his nick and password — the participant (without the password print) or null
async function partLogin(name,password){const p=partFind(name);if(!p)return null;return await partCheckPassword(p.id,password)?partPublic(p):null}
function partPassError(pw){const s=String(pw??'');if(s.length<PART_PASS_MIN)return `Пароль — не короче ${PART_PASS_MIN} знаков`;if(s.length>PART_PASS_MAX)return 'Слишком длинный пароль';return ''}

// ---- изменения ----
function partNameError(name,exceptId=''){
  const n=partCleanName(name);if(!n)return 'Впишите ник';
  if(searchFold(n)===searchFold(partGm().name)&&exceptId!=='gm')return 'Такой ник у Мастера';
  const same=partList().find(p=>searchFold(p.name)===searchFold(n)&&p.id!==exceptId);return same?`Ник «${same.name}» уже занят`:'';
}
async function partAdd({name,role='player',color='',avatar='',worlds='all',password=''}={}){
  if(partList().length>=PART_MAX)return {ok:false,error:`Участников не больше ${PART_MAX}`};
  const ne=partNameError(name);if(ne)return {ok:false,error:ne};const pe=partPassError(password);if(pe)return {ok:false,error:pe};
  if(avatar!==''&&!partAvatarOk(avatar))return {ok:false,error:'Не удалось прочитать картинку аватара'};
  let pass;try{pass=await partHash(password)}catch(e){return {ok:false,error:String(e.message||e)}}
  // Other players can update their avatars while the password is hashing.
  const d=partLoad();
  if(d.list.length>=PART_MAX)return {ok:false,error:`Участников не больше ${PART_MAX}`};
  const conflict=partNameError(name);if(conflict)return {ok:false,error:conflict};
  const used=new Set(d.list.map(p=>p.color));const p=partClean({id:uid('part'),name,role,color:partColorOk(color)?color:PART_COLORS.find(c=>!used.has(c))||PART_COLORS[d.list.length%PART_COLORS.length],avatar,worlds,pass});
  const next={...d,list:[...d.list,p]};if(!partSave(next))return {ok:false,error:'Не удалось сохранить'};partChanged();return {ok:true,part:partPublic(p)};
}
async function partUpdate(id,patch={}){
  if(!partGet(id))return {ok:false,error:'Нет такого участника'};
  let newPass=null;
  if(patch.password){
    const pe=partPassError(patch.password);if(pe)return {ok:false,error:pe};
    try{newPass=await partHash(patch.password)}catch(e){return {ok:false,error:String(e.message||e)}}
  }
  const d=partLoad(),i=d.list.findIndex(p=>p.id===id);if(i<0)return {ok:false,error:'Нет такого участника'};
  if(patch.name!==undefined){const ne=partNameError(patch.name,id);if(ne)return {ok:false,error:ne}}
  const cur=d.list[i],pass=newPass||cur.pass;const p=partClean({...cur,...('name' in patch?{name:patch.name}:{}),...('role' in patch?{role:patch.role}:{}),...('color' in patch?{color:patch.color}:{}),...('avatar' in patch?{avatar:patch.avatar}:{}),...('worlds' in patch?{worlds:patch.worlds}:{}),id:cur.id,created:cur.created,pass});
  const list=d.list.slice();list[i]=p;if(!partSave({...d,list}))return {ok:false,error:'Не удалось сохранить'};partChanged();return {ok:true,part:partPublic(p)};
}
function partRemove(id){const d=partLoad();if(!d.list.some(p=>p.id===id))return false;if(!partSave({...d,list:d.list.filter(p=>p.id!==id)}))return false;
  if(state.viewAsWho===id)state.viewAsWho='';if(typeof myNotes!=='undefined'&&myNotes.owner===id)myNotes.owner='gm';partChanged();return true}
function partSetGm(patch={}){const d=partLoad();if(patch.name!==undefined){const n=partCleanName(patch.name);if(!n)return {ok:false,error:'Впишите ник'};if(partFind(n))return {ok:false,error:`Ник «${n}» уже у участника`}}
  const gm={name:partCleanName(patch.name??d.gm.name)||'Мастер',color:partColorOk(patch.color)?patch.color.toLowerCase():d.gm.color,avatar:'avatar' in patch?(partAvatarOk(patch.avatar)?patch.avatar:''):d.gm.avatar};
  if(!partSave({...d,gm}))return {ok:false,error:'Не удалось сохранить'};partChanged();return {ok:true}}
function partChanged(){if(typeof renderRoleMenu==='function')renderRoleMenu();if(typeof renderMyNotes==='function')renderMyNotes();if(typeof onhPartsChanged==='function')onhPartsChanged()}

// square 96×96 picture from a file — the middle of the picture
async function partAvatarFromFile(file){
  const img=await processImageFile(file,{maxDim:384});const im=new Image();im.src=img.dataUrl;await im.decode();
  const side=Math.min(im.naturalWidth,im.naturalHeight),c=document.createElement('canvas');c.width=c.height=96;
  c.getContext('2d').drawImage(im,(im.naturalWidth-side)/2,(im.naturalHeight-side)/2,side,side,0,0,96,96);
  return c.toDataURL('image/webp',.86);
}

// ---- окно «Участники» ----
function partWorldsHtml(sel){
  const all=sel==='all',list=Array.isArray(data.workspaces)?data.workspaces:[];
  return `<label class="partCheck"><input type="checkbox" id="partWorldsAll"${all?' checked':''}> Во всех мирах</label><div class="partWorlds"${all?' hidden':''}>${list.map(w=>`<label class="partCheck"><input type="checkbox" data-part-world="${escapeHtml(w.id)}"${!all&&sel.includes(w.id)?' checked':''}> ${escapeHtml(w.name||'Без названия')}</label>`).join('')||'<small>Рабочих зон нет</small>'}</div>`;
}
function partRowHtml(p){
  const role=PART_ROLES.find(r=>r[0]===p.role);const worlds=p.worlds==='all'?'все миры':(()=>{const names=p.worlds.map(id=>(data.workspaces||[]).find(w=>w.id===id)?.name).filter(Boolean);return names.length?names.join(', '):'ни одного мира'})();
  return `<div class="partRow">${partAvatarHtml(p)}<div class="partWho"><b>${escapeHtml(p.name)}</b><small>${role[1]} ${escapeHtml(role[2])} · ${escapeHtml(worlds)}${p.pass?'':' · <span class="partWarn">нет пароля</span>'}</small></div>
    <button type="button" class="btn" data-part-edit="${escapeHtml(p.id)}" title="Изменить">✎</button><button type="button" class="btn danger" data-part-del="${escapeHtml(p.id)}" title="Удалить участника" aria-label="Удалить ${escapeHtml(p.name)}">×</button></div>`;
}
function partFormHtml(){
  const ed=partUI.editing,isGm=ed==='gm',isNew=ed==='new',p=isGm?{...partGm(),id:'gm'}:isNew?{name:partUI.draftName||'',role:'player',color:PART_COLORS.find(c=>!partList().some(x=>x.color===c))||PART_COLORS[0],avatar:'',worlds:'all'}:partGet(ed);
  if(!p)return '';const ava=partUI.avatar!==null?partUI.avatar:p.avatar;const color=partUI.color||p.color;
  return `<div class="form partForm"><h4>${isGm?'Вы — Мастер':isNew?'Новый участник':'Участник «'+escapeHtml(p.name)+'»'}</h4>
    <div class="row"><div style="flex:2"><label for="partName">Ник</label><input id="partName" maxlength="${PART_NAME_MAX}" value="${escapeHtml(p.name)}" placeholder="Например, Борн" autocomplete="off"></div>
    ${isGm?'':`<div style="flex:1"><label for="partRole">Роль</label><select id="partRole">${PART_ROLES.map(([id,ic,n])=>`<option value="${id}"${id===p.role?' selected':''}>${ic} ${n}</option>`).join('')}</select></div>`}</div>
    <div><label for="partColor">Цвет</label><input id="partColor" class="colorInput" type="color" value="${color}" data-rgb-presets="${PART_COLORS.concat(PART_GM_COLOR).join(',')}"></div>
    <div class="partAvaRow">${partAvatarHtml({...p,avatar:ava,color},'partAva big')}<label class="btn partAvaPick">Картинка…<input type="file" id="partAvaFile" accept="image/*" hidden></label>${ava||partUI.avatarError?'<button type="button" class="btn" data-part-noavatar>Без картинки</button>':''}</div>
    ${isGm?'':`<div><label for="partPass">${isNew?'Пароль':'Новый пароль'}</label><input id="partPass" type="password" maxlength="${PART_PASS_MAX}" autocomplete="new-password" placeholder="${isNew?`не короче ${PART_PASS_MIN} знаков`:'оставьте пустым — пароль не меняется'}"><small class="partHint">Сообщите пароль участнику сами. Программа хранит не пароль, а только его «отпечаток» — подсмотреть его нельзя.</small></div>
    <div><label>Где играет</label>${partWorldsHtml(p.worlds)}</div>`}
    <div class="partErr" role="alert">${escapeHtml(partUI.error)}</div>
    <div class="partActs"><button type="button" class="btn primary" data-part-save>${isNew?'Добавить':'Сохранить'}</button><button type="button" class="btn" data-part-cancel>Отмена</button></div></div>`;
}
function partBodyHtml(){
  if(partUI.editing)return partFormHtml();
  const gm=partGm(),list=partList();
  return `<div class="partRow partGmRow">${partAvatarHtml(gm)}<div class="partWho"><b>${escapeHtml(gm.name)}</b><small>👑 Мастер — это вы</small></div><button type="button" class="btn" data-part-edit="gm" title="Изменить ник, цвет, картинку">✎</button></div>
  <div class="partList">${list.length?list.map(partRowHtml).join(''):'<div class="empty">Пока никого. Добавьте игроков — у каждого будет свой ник, цвет и пароль. Играть по сети можно будет с онлайном (0.30).</div>'}</div>
  <div class="partActs"><button type="button" class="btn primary" data-part-add>＋ Добавить участника</button></div>`;
}
function partRender(){
  const box=$('#partBody');if(!box)return;
  box.innerHTML=partBodyHtml();
  $('#partClose').textContent=partUI.editing?'Сохранить и закрыть':'Готово';
  if(partUI.editing)setTimeout(()=>box.querySelector('#partName')?.focus(),0);
}
function partEdit(id){partUI.editing=id;partUI.error='';partUI.avatar=null;partUI.avatarError='';partUI.color='';partRender()}
function openParticipants(opts={}){
  openModal('Аватары игроков','<div id="partBody"></div>','<button type="button" class="btn primary" id="partClose">Готово</button>');
  partUI.draftName=opts.name||'';
  partEdit(opts.add?'new':null);
  const box=$('#partBody');
  let active=true;
  activeModalCleanup=()=>{active=false;partUI.upload=null;partUI.busy=false;partUI.editing=null};
  activeModalCloseGuard=()=>{
    if(partUI.busy||partUI.upload)return false;
    return !partUI.editing||confirm('Закрыть форму без сохранения аватара?');
  };
  const save=async close=>{
    if(partUI.busy)return;
    partUI.busy=true;
    let saved=false;
    try {
      if(partUI.upload&&!(await partUI.upload))return;
      if(active)saved=await partSaveForm(box);
    } finally {
      if(active)partUI.busy=false;
    }
    if(active&&saved&&close)closeModal();
  };
  $('#partClose').onclick=()=>partUI.editing?save(true):closeModal();
  box.addEventListener('click',async ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t||partUI.busy)return;
    if(t.closest('[data-part-save]')){await save(false);return}
    if(partUI.upload)return;
    if(t.closest('[data-part-add]')){partEdit('new');return}
    const ed=t.closest('[data-part-edit]');if(ed){partEdit(ed.dataset.partEdit);return}
    const del=t.closest('[data-part-del]');if(del){const p=partGet(del.dataset.partDel);if(p&&confirm(`Удалить участника «${p.name}»? Его заметки останутся в мире.`)){partRemove(p.id);partRender();toast(`Участник «${p.name}» удалён`,'ok')}return}
    if(t.closest('[data-part-noavatar]')){partUI.avatar='';partUI.avatarError='';partUI.error='';partKeepForm(()=>partRender());return}
    if(t.closest('[data-part-cancel]')){partEdit(null);return}
  });
  box.addEventListener('change',ev=>{const t=ev.target;
    if(t.id==='partColor'){
      partUI.color=t.value;
      box.querySelector('.partAva.big')?.style.setProperty('--part-c',partUI.color);
      return;
    }
    if(t.id==='partWorldsAll'){const w=box.querySelector('.partWorlds');if(w)w.hidden=t.checked;return}
    if(t.id!=='partAvaFile'||!t.files?.[0]||partUI.busy||partUI.upload)return;
    const file=t.files[0];
    t.disabled=true;
    const message=box.querySelector('.partErr');
    if(message)message.textContent='Подготавливаю картинку…';
    const apply=(avatar,error)=>{
      if(!active)return false;
      partUI.upload=null;
      if(!error)partUI.avatar=avatar;
      partUI.avatarError=error;
      partUI.error=error;
      partKeepForm(()=>partRender());
      return !error;
    };
    partUI.upload=partAvatarFromFile(file).then(
      a=>partAvatarOk(a)?apply(a,''):apply(null,'Не удалось прочитать картинку аватара'),
      e=>apply(null,String(e.message||e))
    );
  });
  box.addEventListener('input',ev=>{if(ev.target.id!=='partName')return;const b=box.querySelector('.partAva.big b');if(b)b.textContent=partInitial(ev.target.value)});
  box.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.matches?.('#partName,#partPass')){ev.preventDefault();ev.stopPropagation();box.querySelector('[data-part-save]')?.click()}});
}
// re-render the form without losing what was typed
function partKeepForm(fn){const v={name:$('#partName')?.value,role:$('#partRole')?.value,pass:$('#partPass')?.value,worlds:partReadWorlds()};fn();
  if(v.name!==undefined&&$('#partName'))$('#partName').value=v.name;if(v.role&&$('#partRole'))$('#partRole').value=v.role;if(v.pass&&$('#partPass'))$('#partPass').value=v.pass;
  if($('#partWorldsAll')){const all=v.worlds==='all';$('#partWorldsAll').checked=all;const w=$('#partBody .partWorlds');if(w)w.hidden=all;$$('#partBody [data-part-world]').forEach(c=>{c.checked=!all&&v.worlds.includes(c.dataset.partWorld)})}}
function partReadWorlds(){if(!$('#partWorldsAll'))return 'all';if($('#partWorldsAll').checked)return 'all';return $$('#partBody [data-part-world]').filter(c=>c.checked).map(c=>c.dataset.partWorld)}
async function partSaveForm(box=$('#partBody')){
  if(partUI.avatarError)return false;
  const ed=partUI.editing;const name=$('#partName')?.value||'';const color=partUI.color||undefined;const avatar=partUI.avatar!==null?partUI.avatar:undefined;
  let r;
  if(ed==='gm')r=partSetGm({name,...(color?{color}:{}),...(avatar!==undefined?{avatar}:{})});
  else if(ed==='new')r=await partAdd({name,role:$('#partRole')?.value,color:color||'',avatar:avatar||'',worlds:partReadWorlds(),password:$('#partPass')?.value||''});
  else{const pw=$('#partPass')?.value||'';r=await partUpdate(ed,{name,role:$('#partRole')?.value,worlds:partReadWorlds(),...(color?{color}:{}),...(avatar!==undefined?{avatar}:{}),...(pw?{password:pw}:{})})}
  if($('#partBody')!==box||partUI.editing!==ed)return r.ok;
  if(!r.ok){partUI.error=r.error;partKeepForm(()=>partRender());return false}
  const was=ed;partUI.editing=null;partUI.error='';partUI.avatar=null;partUI.color='';partRender();
  toast(was==='new'?`Участник «${r.part.name}» добавлен`:'Сохранено','ok');return true;
}

