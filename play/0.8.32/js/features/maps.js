// Universe Graph — карты записей (0.21). У записи может быть своя картинка-карта: на неё ставятся метки
// других записей (города на карте империи, таверна на карте города) и рисуются области.
// Данные живут в самой записи: e.map = {mediaId, pins:[{id, entityId, x, y}], areas:[{id, name, color, points, entityId?}], links?}.
// Координаты — доли картинки от 0 до 1, поэтому карта не ломается, если картинку заменить на другую того же вида.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';

const MAP_AREA_COLORS=['#e0a84f','#6fb5ff','#7ed6a1','#e57a7a','#b892ff','#e8d36b','#5fd0d0','#d98ac6'];
const MAP_LIMITS={pins:500,areas:120,points:200};

// ---- Данные ----
function entityMap(e){return isRecord(e?.map)?e.map:null}
function mapImage(e){const m=entityMap(e);return m?.mediaId?getMediaMeta(e,m.mediaId):null}
// A record «has a map» once it has a picture, a pin or an area.
function hasEntityMap(e){const m=entityMap(e);return !!(m&&(m.mediaId||m.pins.length||m.areas.length))}
function mapPinOf(e,entityId){return entityMap(e)?.pins.find(p=>p.entityId===entityId)||null}
// Which maps show this record (to go «up» from a city to its empire).
function mapsShowing(entityId){return data.entities.filter(o=>o.id!==entityId&&entityMap(o)?.pins.some(p=>p.entityId===entityId))}
const mapNum=v=>{const n=Number(v);return Number.isFinite(n)?Math.min(1,Math.max(0,n)):null};
// Called by normalize.js for every workspace, after entity ids are repaired.
function normalizeEntityMaps(ws,entityIds){
  for(const e of ws.entities){
    if(e.map===undefined)continue;
    if(!isRecord(e.map)){delete e.map;noteRepair('исправлены повреждённые карты');continue}
    const m=e.map,media=new Set((e.media||[]).map(x=>x.id)),pinIds=new Set(),placed=new Set();
    const pins=(Array.isArray(m.pins)?m.pins:[]).filter(isRecord).map(p=>({id:String(p.id||''),entityId:String(p.entityId||''),x:mapNum(p.x),y:mapNum(p.y)}))
      .filter(p=>{if(!entityIds.has(p.entityId)||p.entityId===e.id||placed.has(p.entityId)||p.x===null||p.y===null)return false;placed.add(p.entityId);return true})
      .slice(0,MAP_LIMITS.pins).map(p=>{if(!p.id||pinIds.has(p.id))p.id=uid('pin');pinIds.add(p.id);return p});
    const areaIds=new Set();
    const areas=(Array.isArray(m.areas)?m.areas:[]).filter(isRecord).map(a=>{
      const pts=(Array.isArray(a.points)?a.points:[]).filter(q=>Array.isArray(q)&&q.length>=2).map(q=>[mapNum(q[0]),mapNum(q[1])]).filter(q=>q[0]!==null&&q[1]!==null).slice(0,MAP_LIMITS.points);
      const out={id:String(a.id||''),name:String(a.name??'').trim().slice(0,80),color:/^#[0-9a-f]{6}$/i.test(String(a.color||''))?String(a.color).toLowerCase():MAP_AREA_COLORS[0],points:pts};
      if(a.entityId&&entityIds.has(String(a.entityId))&&String(a.entityId)!==e.id)out.entityId=String(a.entityId);
      return out;
    }).filter(a=>a.points.length>=3).slice(0,MAP_LIMITS.areas).map(a=>{if(!a.id||areaIds.has(a.id))a.id=uid('area');areaIds.add(a.id);return a});
    const out={mediaId:m.mediaId&&media.has(String(m.mediaId))?String(m.mediaId):null,pins,areas};
    if(m.links===true)out.links=true;
    // 0.29.7: a drawn map keeps its drawing (strokes, sheet size, grid) — it can be drawn on again
    if(isRecord(m.drawing)){const d=m.drawing,num=(v,lo,hi,def)=>{const x=Number(v);return Number.isFinite(x)?Math.min(hi,Math.max(lo,x)):def};out.drawing={w:num(d.w,100,8000,1600),h:num(d.h,100,8000,1000),bg:/^#[0-9a-f]{3,8}$/i.test(String(d.bg||''))?String(d.bg):'#efe4c8',base:d.base&&media.has(String(d.base))?String(d.base):null,mediaId:d.mediaId?String(d.mediaId):null,grid:{kind:['none','square','hex'].includes(d.grid?.kind)?d.grid.kind:'none',size:num(d.grid?.size,10,400,60)},strokes:typeof drawNormStrokes==='function'?drawNormStrokes(d.strokes):(Array.isArray(d.strokes)?d.strokes:[])}}
    e.map=out;
  }
}
// Who can be put on the map of a record: what is inside it first, then what is linked to it.
function mapCandidates(owner,query=''){
  const placed=new Set((entityMap(owner)?.pins||[]).map(p=>p.entityId));placed.add(owner.id);
  const low=String(query||'').trim().toLowerCase(),out=[],seen=new Set();
  const add=(e,why)=>{if(!e||placed.has(e.id)||seen.has(e.id))return;if(low&&!(e.name+' '+(e.aliases||[]).join(' ')).toLowerCase().includes(low))return;seen.add(e.id);out.push({e,why})};
  for(const id of containmentChildren(owner.id))add(getEntity(id),'внутри');
  for(const r of data.relations){if(getRT(r.type).containment)continue;if(r.from===owner.id)add(getEntity(r.to),getRT(r.type).name);else if(r.to===owner.id)add(getEntity(r.from),relationNameFor(r,owner.id))}
  // Deeper levels: what is inside the things inside (a tavern inside a city inside the empire).
  for(const id of containmentChildren(owner.id))for(const k of containmentChildren(id))add(getEntity(k),'глубже');
  if(low)for(const e of data.entities)add(e,'поиск');
  return out;
}
function mapCommit(change,okText){
  const before=clone(data),bs=snapshotMutationState();let res;
  try{res=change()}catch(err){restoreWorkspaceMutation(before,bs);updateUI();toast('Не получилось: '+(err?.message||err),'err');return false}
  if(res===false){restoreWorkspaceMutation(before,bs);return false}
  state.viewVersion++;
  if(!persist()){restoreWorkspaceMutation(before,bs);updateUI();toast('Не удалось сохранить карту — всё осталось как было','err');return false}
  updateUI();if(okText)toast(okText,'ok');return res===undefined?true:res;
}
function mapEnsure(e){if(!isRecord(e.map))e.map={mediaId:null,pins:[],areas:[]};return e.map}
function mapLive(id){return getEntity(id)}
function mapSetImage(ownerId,mediaId){return mapCommit(()=>{const e=mapLive(ownerId);if(!e||!getMediaMeta(e,mediaId))throw new Error('картинка не найдена');mapEnsure(e).mediaId=mediaId;e.updatedAt=new Date().toISOString()},'Картинка карты выбрана')}
function mapAddPin(ownerId,entityId,x,y){
  return mapCommit(()=>{const e=mapLive(ownerId);if(!e||!getEntity(entityId)||entityId===ownerId)return false;const m=mapEnsure(e);
    if(m.pins.length>=MAP_LIMITS.pins)throw new Error(`на одной карте помещается до ${MAP_LIMITS.pins} меток`);
    const old=m.pins.find(p=>p.entityId===entityId);if(old){old.x=mapNum(x);old.y=mapNum(y);return old.id}
    const pin={id:uid('pin'),entityId,x:mapNum(x),y:mapNum(y)};m.pins.push(pin);return pin.id});
}
function mapMovePin(ownerId,pinId,x,y){return mapCommit(()=>{const p=entityMap(mapLive(ownerId))?.pins.find(q=>q.id===pinId);if(!p)return false;p.x=mapNum(x);p.y=mapNum(y)})}
function mapRemovePin(ownerId,pinId){return mapCommit(()=>{const m=entityMap(mapLive(ownerId));const i=m?.pins.findIndex(q=>q.id===pinId);if(!m||i<0)return false;m.pins.splice(i,1)},'Метка снята с карты')}
function mapAddArea(ownerId,area){
  return mapCommit(()=>{const e=mapLive(ownerId);if(!e)return false;const m=mapEnsure(e);if(m.areas.length>=MAP_LIMITS.areas)throw new Error(`на одной карте помещается до ${MAP_LIMITS.areas} областей`);
    const pts=(area.points||[]).map(q=>[mapNum(q[0]),mapNum(q[1])]).filter(q=>q[0]!==null&&q[1]!==null).slice(0,MAP_LIMITS.points);if(pts.length<3)throw new Error('у области должно быть хотя бы 3 точки');
    const a={id:uid('area'),name:String(area.name||'').trim().slice(0,80),color:area.color||MAP_AREA_COLORS[m.areas.length%MAP_AREA_COLORS.length],points:pts};if(area.entityId&&getEntity(area.entityId))a.entityId=area.entityId;
    m.areas.push(a);return a.id},'Область добавлена');
}
function mapUpdateArea(ownerId,areaId,patch){return mapCommit(()=>{const a=entityMap(mapLive(ownerId))?.areas.find(q=>q.id===areaId);if(!a)return false;if(patch.name!==undefined)a.name=String(patch.name).trim().slice(0,80);if(patch.color)a.color=patch.color;if(patch.entityId!==undefined){if(patch.entityId&&getEntity(patch.entityId))a.entityId=patch.entityId;else delete a.entityId}},'Область изменена')}
function mapRemoveArea(ownerId,areaId){return mapCommit(()=>{const m=entityMap(mapLive(ownerId));const i=m?.areas.findIndex(q=>q.id===areaId);if(!m||i<0)return false;m.areas.splice(i,1)},'Область удалена')}
function mapSetLinks(ownerId,on){return mapCommit(()=>{const e=mapLive(ownerId);if(!e)return false;const m=mapEnsure(e);if(on)m.links=true;else delete m.links})}
// A new picture for the map: it goes into the record's gallery (so export and backups carry it) and becomes the map.
async function mapUploadImage(ownerId,file){
  const e=getEntity(ownerId);if(!e)return false;
  if(!UniverseGraphStorage.mediaAvailable){toast('Хранилище картинок сейчас недоступно','err');return false}
  if(entityMedia(e).length>=MEH_MEDIA_MAX_COUNT){toast(`У сущности уже ${MEH_MEDIA_MAX_COUNT} картинок — больше не помещается`,'err');return false}
  let meta;try{const processed=await processImageFile(file,{maxDim:4096,quality:.86});meta=newMediaMeta(processed,e.id);meta.caption='Карта';meta.alt='Карта: '+e.name;mediaPut(meta)}
  catch(err){toast('Картинка не подошла: '+(err?.message||err),'err');return false}
  const ok=mapCommit(()=>{const live=getEntity(ownerId);if(!live)throw new Error('сущность пропала');const {dataUrl,...m}=meta;live.media=[...entityMedia(live),{...m,main:false}];mapEnsure(live).mediaId=meta.id;live.updatedAt=new Date().toISOString()},'Карта загружена');
  if(!ok){try{UniverseGraphStorage.mediaDelete(meta.id);invalidateMediaCache(meta.id)}catch{}}
  return ok;
}

// ---- Окно карты ----
// Открывается на месте рабочей зоны (как статья «на весь экран»). Карта камеры (сдвиг и масштаб) помнится для каждой записи до закрытия программы.
const mapUI={ownerId:null,trail:[],query:'',mode:'view',placing:null,selPin:null,selArea:null,draft:[],cams:new Map()};
const mapCam=()=>mapUI.cams.get(mapUI.ownerId)||null;
function mapIsOpen(){return !!(mapUI.ownerId&&getEntity(mapUI.ownerId))}
// Path of maps above this one (city → empire → world): by how the user came here, else by «which map shows it».
function mapCrumbs(){
  const owner=getEntity(mapUI.ownerId);if(!owner)return [];
  if(mapUI.trail.length)return [...mapUI.trail.map(getEntity).filter(Boolean),owner];
  const out=[owner],seen=new Set([owner.id]);let cur=owner;
  for(let i=0;i<6;i++){const up=mapsShowing(cur.id).find(x=>!seen.has(x.id));if(!up)break;out.unshift(up);seen.add(up.id);cur=up}
  return out;
}
function openEntityMap(id,{from=null}={}){
  const e=getEntity(id);if(!e)return false;
  if(typeof articleUI!=='undefined'&&articleUI.mode==='full'&&typeof setArticleMode==='function')setArticleMode('dock');
  if(from&&from!==id){const i=mapUI.trail.indexOf(id);if(i>=0)mapUI.trail=mapUI.trail.slice(0,i);else if(mapUI.ownerId===from)mapUI.trail.push(from)}
  else if(!from)mapUI.trail=[];
  mapUI.ownerId=id;mapUI.mode='view';mapUI.placing=null;mapUI.selPin=null;mapUI.selArea=null;mapUI.draft=[];mapUI.query='';
  renderMap();return true;
}
// Opens a map with one pin chosen and in the middle of the view.
function mapShowPin(ownerId,entityId){
  const owner=getEntity(ownerId),p=mapPinOf(owner,entityId);if(!p)return openEntityMap(ownerId);
  openEntityMap(ownerId);mapUI.selPin=p.id;mapSelectEntity(entityId);
  requestAnimationFrame(()=>{const st=$('#mapView [data-map-stage]'),img=mapImage(owner);if(!st||!img)return;let cam=mapCam();if(!cam){mapFit(false);cam=mapCam()}const r=st.getBoundingClientRect();cam.x=r.width/2-p.x*img.width*cam.z;cam.y=r.height/2-p.y*img.height*cam.z;mapApplyCam()});
  return true;
}
// Going up by the path line: the maps before the chosen one stay as the path.
function mapGoCrumb(id){const ids=mapCrumbs().map(e=>e.id),i=ids.indexOf(id);if(i<0)return openEntityMap(id);mapUI.trail=ids.slice(0,i);mapUI.ownerId=id;mapUI.mode='view';mapUI.placing=null;mapUI.selPin=null;mapUI.selArea=null;mapUI.draft=[];mapUI.query='';renderMap();return true}
function closeEntityMap(){if(mapUI.cleanByMap){mapUI.cleanByMap=false;if(document.querySelector('.app')?.classList.contains('cleanMode'))setCleanMode(false)}mapUI.ownerId=null;mapUI.trail=[];mapUI.mode='view';mapUI.placing=null;mapUI.draft=[];renderMap();try{requestAnimationFrame(()=>{resize();wakeRenderLoop()})}catch{}}
function mapHost(){
  let el=$('#mapView');const main=document.querySelector('.main');
  if(!el&&main){el=document.createElement('section');el.id='mapView';el.className='mapView';el.setAttribute('aria-label','Карта сущности');el.hidden=true;main.appendChild(el)}
  return el;
}
function mapPinHtml(owner,p,W,H){
  const e=getEntity(p.entityId);if(!e)return '';const t=getET(e.type),v=statusVisual(e),img=boardMainImage(e),url=img?getMediaUrl(img.id):'';
  const color=safeCssValue(e.style?.color||t.color,'#74b8ff'),ring=v?.badges?.[0]?.color?safeCssValue(v.badges[0].color,color):color;
  const cls=['mapPin',v?.fade?'fade':'',v?.gray?'gray':'',mapUI.selPin===p.id?'sel':'',state.selectedId===e.id?'cur':''].filter(Boolean).join(' ');
  const badges=(v?.badges||[]).map(o=>`<i class="mapPinBadge" style="--status:${escapeHtml(safeCssValue(o.color,'#9aa8c6'))}" title="${escapeHtml(o.name)}">${escapeHtml(o.icon||'●')}</i>`).join('');
  return `<div class="${cls}" data-map-pin="${escapeHtml(p.id)}" data-entity="${escapeHtml(e.id)}" style="left:${(p.x*W).toFixed(1)}px;top:${(p.y*H).toFixed(1)}px;--pin:${escapeHtml(color)};--ring:${escapeHtml(ring)}${v?.glow?`;--glow:${escapeHtml(safeCssValue(v.glow,color))}`:''}" title="${escapeHtml(e.name)} · ${escapeHtml(e.type?t.name:'Без типа')}${v?.badges?.length?' · '+escapeHtml(v.badges.map(o=>o.name).join(', ')):''}">
    <span class="mapPinDot">${url?`<img src="${url}" alt="">`:`<b>${escapeHtml(e.style?.icon||t.icon||'•')}</b>`}</span>
    <span class="mapPinLabel">${escapeHtml(e.name)}${badges?`<span class="mapPinBadges">${badges}</span>`:''}</span>
    ${hasEntityMap(e)?`<button type="button" class="mapPinDive" data-map-dive="${escapeHtml(e.id)}" title="Открыть карту «${escapeHtml(e.name)}»">🗺</button>`:''}
  </div>`;
}
function mapSvgHtml(owner,W,H){
  const m=entityMap(owner),pts=a=>a.map(q=>`${(q[0]*W).toFixed(1)},${(q[1]*H).toFixed(1)}`).join(' ');
  const centroid=a=>[a.reduce((s,q)=>s+q[0],0)/a.length*W,a.reduce((s,q)=>s+q[1],0)/a.length*H];
  let out='';
  for(const a of m.areas){const [cx,cy]=centroid(a.points),linked=a.entityId?getEntity(a.entityId):null;
    out+=`<g class="mapArea${mapUI.selArea===a.id?' sel':''}" data-map-area="${escapeHtml(a.id)}"><polygon points="${pts(a.points)}" style="--area:${escapeHtml(a.color)}"/>${a.name||linked?`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" class="mapAreaName">${escapeHtml(a.name||linked.name)}</text>`:''}</g>`}
  if(m.links){const pos=new Map(m.pins.map(p=>[p.entityId,[p.x*W,p.y*H]]));
    for(const r of data.relations){const a=pos.get(r.from),b=pos.get(r.to);if(!a||!b||getRT(r.type).containment||!state.showRelations||!relationShown(r))continue;
      const rt=getRT(r.type),st={...rt,...(r.style||{})},tier=relationTier(r);
      out+=`<line class="mapLink" data-map-link="${escapeHtml(r.id)}" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" style="--link:${escapeHtml(safeCssValue(st.color,'#91a4c7'))};--lw:${(REL_TIER_WIDTH[tier-1]||1)*2}"><title>${escapeHtml(getEntity(r.from)?.name||'')} — ${escapeHtml(rt.name)} — ${escapeHtml(getEntity(r.to)?.name||'')}</title></line>`}}
  if(typeof mapFogSvg==='function')out+=(typeof mapFogSvg==='function'?mapFogSvg:()=>'')(owner,W,H); // 0.29.7: fog — what the players do not see yet
  if(mapUI.mode==='area'&&mapUI.draft.length)out+=`<g class="mapDraft"><polyline points="${pts(mapUI.draft)}"/>${mapUI.draft.map((q,i)=>`<circle cx="${(q[0]*W).toFixed(1)}" cy="${(q[1]*H).toFixed(1)}" r="5" class="${i===0?'first':''}" ${i===0?'data-map-close-area="1"':''}/>`).join('')}</g>`;
  return out;
}
function mapSideHtml(owner){
  const m=entityMap(owner)||{pins:[],areas:[]},cands=mapCandidates(owner,mapUI.query).slice(0,120);
  const placed=m.pins.map(p=>({p,e:getEntity(p.entityId)})).filter(x=>x.e).sort((a,b)=>a.e.name.localeCompare(b.e.name,'ru'));
  const row=(e,extra,attrs)=>`<div class="mapRow" ${attrs}><span class="mapRowIcon">${escapeHtml(getET(e.type).icon||'•')}</span><span class="mapRowMain"><b>${escapeHtml(e.name)}</b><small>${escapeHtml(extra)}</small></span>`;
  return `<div class="mapSideHead"><input class="mapSearch" data-map-search placeholder="Найти сущность…" value="${escapeHtml(mapUI.query)}"></div>
  <div class="mapSideScroll">
    <div class="mapSub">Поставить на карту${cands.length?` — ${cands.length}`:''}</div>
    <div class="mapHint">Перетащите сущность на карту или нажмите на неё, а потом — на место на карте.</div>
    ${cands.length?cands.map(({e,why})=>row(e,why,`data-map-cand="${escapeHtml(e.id)}" tabindex="0" role="button"`)+`${mapUI.placing===e.id?'<span class="mapRowNote">куда?</span>':''}</div>`).join(''):`<div class="empty">${mapUI.query?'Никого не нашлось.':'Все, кто внутри и рядом, уже на карте. Найдите других поиском.'}</div>`}
    <div class="mapSub">На карте — ${placed.length}</div>
    ${placed.length?placed.map(({p,e})=>row(e,getET(e.type).name,`data-map-placed="${escapeHtml(p.id)}"`)+`<button type="button" class="iconBtn mapRowDel" data-map-unpin="${escapeHtml(p.id)}" title="Убрать с карты" aria-label="Убрать с карты">×</button></div>`).join(''):'<div class="empty">Пока никого.</div>'}
    <div class="mapSub">Области — ${m.areas.length}</div>
    ${m.areas.length?m.areas.map(a=>`<div class="mapRow${mapUI.selArea===a.id?' sel':''}" data-map-area-row="${escapeHtml(a.id)}"><span class="mapAreaSwatch" style="--area:${escapeHtml(a.color)}"></span><span class="mapRowMain"><b>${escapeHtml(a.name||'Без названия')}</b><small>${a.entityId&&getEntity(a.entityId)?escapeHtml(getEntity(a.entityId).name):'не привязана к сущности'}</small></span><button type="button" class="iconBtn" data-map-area-edit="${escapeHtml(a.id)}" title="Изменить область" aria-label="Изменить область">✎</button><button type="button" class="iconBtn mapRowDel" data-map-area-del="${escapeHtml(a.id)}" title="Удалить область" aria-label="Удалить область">×</button></div>`).join(''):'<div class="empty">Нажмите «Область» и обведите кликами часть карты.</div>'}
  </div>`;
}
function mapViewHtml(){
  const owner=getEntity(mapUI.ownerId),m=entityMap(owner),img=mapImage(owner),url=img?getMediaUrl(img.id):'';
  const crumbs=mapCrumbs(),W=Math.max(1,img?.width||1600),H=Math.max(1,img?.height||1000);
  const tool=(act,icon,label,on,title)=>`<button type="button" class="btn mapTool${on?' on':''}" data-map-act="${act}" title="${escapeHtml(title||label)}">${icon} <span>${label}</span></button>`;
  const bar=`<div class="mapBar"><div class="mapCrumbs">${crumbs.map((c,i)=>i<crumbs.length-1?`<button type="button" class="linkBtn" data-map-go="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button> ›`:`<b>🗺 ${escapeHtml(c.name)}</b>`).join(' ')}</div>
    <div class="mapTools">${tool('image','🖼','Картинка',false,'Выбрать или загрузить картинку карты')}${img?tool('area','⬠','Область',mapUI.mode==='area','Обвести область кликами; двойной клик или Enter — закончить, Esc — отмена'):''}${img?tool('links','↔','Связи',!!m?.links,'Показать связи между метками'):''}${img?tool('fit','▣','Вписать')+tool('snapshot','📷','Картинкой',false,'Сохранить карту картинкой')+(worldReadOnly()?'':tool('draw','✏️',(typeof mapDrawing==='function'?mapDrawing:()=>'')(getEntity(mapUI.ownerId))?'Дорисовать':'Рисовать',false,'Нарисовать карту или дорисовать поверх картинки')):''}${tool('full','⛶','Весь экран',document.querySelector('.app')?.classList.contains('cleanMode'),'Спрятать все панели — карта на весь экран (Esc — вернуть панели)')}${tool('close','✕','Закрыть',false,'Закрыть карту (Esc)')}</div></div>`;
  const stage=img&&url?`<div class="mapStage${mapUI.mode==='area'?' drawing':''}${mapUI.placing?' placing':''}" data-map-stage><div class="mapWorld" style="width:${W}px;height:${H}px"><img class="mapImg" src="${url}" alt="${escapeHtml(img.alt||'Карта')}" draggable="false"><svg class="mapSvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${mapSvgHtml(owner,W,H)}</svg>${m.pins.map(p=>mapPinHtml(owner,p,W,H)).join('')}</div>${mapUI.mode==='area'?`<div class="mapModeNote">Область: кликайте по карте, чтобы ставить точки. Двойной клик или Enter — закончить, Esc — отмена.${mapUI.draft.length?` Точек: ${mapUI.draft.length}.`:''}</div>`:mapUI.placing?`<div class="mapModeNote">Нажмите на место, куда поставить «${escapeHtml(getEntity(mapUI.placing)?.name||'')}». Esc — отмена.</div>`:''}</div>`
    :`<div class="mapEmpty"><div class="mapEmptyIcon">🗺</div><h3>У «${escapeHtml(owner.name)}» пока нет картинки карты</h3><p>Возьмите картинку из галереи сущности или загрузите новую: нарисованную карту, скан, скриншот из игры.</p><div class="mapEmptyBtns"><button type="button" class="btn primary" data-map-act="draw">✏️ Нарисовать карту</button><button type="button" class="btn" data-map-act="upload">Загрузить картинку</button>${galleryImages(owner).length?'<button type="button" class="btn" data-map-act="image">Выбрать из галереи</button>':''}</div></div>`;
  return bar+`<div class="mapBody">${stage}<aside class="mapSide">${mapSideHtml(owner)}</aside></div>`;
}
function mapApplyCam(){
  const st=$('#mapView [data-map-stage]'),w=st?.querySelector('.mapWorld');if(!st||!w)return;
  let cam=mapCam();if(!cam){mapFit(false);cam=mapCam()}if(!cam)return;
  w.style.transform=`translate(${cam.x}px,${cam.y}px) scale(${cam.z})`;w.style.setProperty('--mz',cam.z);
}
function mapFit(apply=true){
  const st=$('#mapView [data-map-stage]'),img=mapImage(getEntity(mapUI.ownerId));if(!st||!img)return;
  const r=st.getBoundingClientRect();if(!r.width||!r.height)return;
  const z=Math.max(.02,Math.min(r.width/img.width,r.height/img.height)*.94);
  mapUI.cams.set(mapUI.ownerId,{z,x:(r.width-img.width*z)/2,y:(r.height-img.height*z)/2});if(apply)mapApplyCam();
}
function renderMap(){
  const host=mapHost(),main=document.querySelector('.main');if(!host)return;
  const open=mapIsOpen();if(!open&&mapUI.ownerId)mapUI.ownerId=null;
  host.hidden=!open;main?.classList.toggle('mapOpen',open);
  if(!open){if(host.innerHTML)host.innerHTML='';return}
  const side=host.querySelector('.mapSideScroll'),sc=side?.scrollTop||0,focus=document.activeElement?.matches?.('[data-map-search]'),caret=focus?document.activeElement.selectionStart:0;
  host.innerHTML=mapViewHtml();
  const s2=host.querySelector('.mapSideScroll');if(s2)s2.scrollTop=sc;
  if(focus){const inp=host.querySelector('[data-map-search]');if(inp){inp.focus();try{inp.setSelectionRange(caret,caret)}catch{}}}
  mapApplyCam();
}
// Screen point → share of the picture (0..1), or null outside it.
function mapPointAt(clientX,clientY,{clampIn=false}={}){
  const st=$('#mapView [data-map-stage]'),img=mapImage(getEntity(mapUI.ownerId)),cam=mapCam();if(!st||!img||!cam)return null;
  const r=st.getBoundingClientRect(),x=(clientX-r.left-cam.x)/cam.z/img.width,y=(clientY-r.top-cam.y)/cam.z/img.height;
  if(clampIn)return [Math.min(1,Math.max(0,x)),Math.min(1,Math.max(0,y))];
  return x<0||x>1||y<0||y>1?null:[x,y];
}
function mapChooseImage(){
  const owner=getEntity(mapUI.ownerId);if(!owner)return;const imgs=galleryImages(owner),cur=entityMap(owner)?.mediaId;
  openModal('Картинка карты',`<div class="form"><div class="mapPickGrid">${imgs.map(m=>{const url=getMediaUrl(m.id);return `<button type="button" class="mapPick${m.id===cur?' on':''}" data-map-pick="${escapeHtml(m.id)}" title="${escapeHtml(m.caption||m.alt||m.name)}">${url?`<img src="${url}" alt="">`:''}<small>${escapeHtml(m.caption||m.name)}</small></button>`}).join('')||'<div class="empty">В галерее сущности картинок нет.</div>'}</div><div class="inlineHelp">Новая картинка попадёт в галерею сущности — так она сохранится в резервных копиях и при экспорте.</div></div>`,`<button class="btn" id="cancelModal" type="button">Отмена</button><button class="btn primary" id="mapUploadBtn" type="button">Загрузить новую</button><button class="btn" id="mapDrawBtn" type="button">✏️ Нарисовать</button>`);
  $('#cancelModal').onclick=closeModal;
  $('#mapUploadBtn').onclick=()=>{closeModal();mapPickFile()};
  $('#mapDrawBtn').onclick=()=>{closeModal();(typeof openMapDrawer==='function'?openMapDrawer:()=>'')(owner.id)};
  $$('[data-map-pick]').forEach(b=>b.onclick=()=>{closeModal();if(mapSetImage(owner.id,b.dataset.mapPick)){mapUI.cams.delete(owner.id);renderMap()}});
}
function mapPickFile(){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=async()=>{const f=inp.files?.[0];if(!f)return;const id=mapUI.ownerId;if(await mapUploadImage(id,f)){mapUI.cams.delete(id);renderMap()}};
  inp.click();
}
function mapFinishArea(){
  // A double click also leaves one or two clicks in the same spot: drop points that repeat the previous one.
  const pts=[];for(const q of mapUI.draft){const l=pts.at(-1);if(!l||Math.hypot(q[0]-l[0],q[1]-l[1])>.004)pts.push(q)}mapUI.draft=[];mapUI.mode='view';
  if(pts.length<3){toast('Для области нужно хотя бы 3 точки','err');renderMap();return}
  const id=mapAddArea(mapUI.ownerId,{points:pts});renderMap();if(id)mapEditArea(id,{fresh:true});
}
function mapEditArea(areaId,{fresh=false}={}){
  const owner=getEntity(mapUI.ownerId),a=entityMap(owner)?.areas.find(x=>x.id===areaId);if(!a)return;
  const opts=[...containmentChildren(owner.id).map(getEntity).filter(Boolean),...data.entities.filter(e=>e.id!==owner.id&&!containmentChildren(owner.id).includes(e.id)).sort((x,y)=>x.name.localeCompare(y.name,'ru'))];
  openModal(fresh?'Новая область':'Область',`<div class="form"><div><label>Название</label><input id="mapAreaName" maxlength="80" value="${escapeHtml(a.name)}" placeholder="Например: Северные леса"></div>
    <div><label for="mapAreaColor">Цвет</label><input id="mapAreaColor" type="color" class="colorInput" value="${normalizeHex(a.color)}" data-rgb-presets="${MAP_AREA_COLORS.join(',')}"></div>
    <div><label>Сущность этой области (необязательно)</label><select id="mapAreaEntity"><option value="">— нет —</option>${opts.map(e=>`<option value="${escapeHtml(e.id)}" ${a.entityId===e.id?'selected':''}>${escapeHtml(e.name)} · ${escapeHtml(getET(e.type).name)}</option>`).join('')}</select><div class="inlineHelp">Клик по области откроет эту сущность, а её имя станет подписью, если название пустое.</div></div></div>`,
    `<button class="btn" id="cancelModal" type="button">${fresh?'Готово без названия':'Отмена'}</button><button class="btn primary" id="mapAreaSave" type="button">Сохранить</button>`);
  $('#cancelModal').onclick=closeModal;
  $('#mapAreaSave').onclick=()=>{if(mapUpdateArea(owner.id,a.id,{name:$('#mapAreaName').value,color:$('#mapAreaColor').value,entityId:$('#mapAreaEntity').value||null})){closeModal();renderMap()}};
}
function mapSelectEntity(id){if(!getEntity(id))return;state.selectedIds=new Set([id]);state.selectedId=id;state.selectedRelationId=null;state.inspectorMode='overview';updateUI()}

// ---- Мышь и клавиши ----
let mapDrag=null,mapLastClick={key:'',t:0,x:0,y:0};
// Our own «double click»: a click re-draws the map, and the browser's dblclick is lost when the element under the mouse is replaced.
function mapIsDouble(key,ev){const now=performance.now(),l=mapLastClick,dbl=l.key===key&&now-l.t<450&&Math.hypot(ev.clientX-l.x,ev.clientY-l.y)<8;mapLastClick=dbl?{key:'',t:0,x:0,y:0}:{key,t:now,x:ev.clientX,y:ev.clientY};return dbl}
document.addEventListener('pointerdown',ev=>{
  const t=ev.target instanceof Element?ev.target:null;if(!t||ev.button!==0||!mapIsOpen())return;
  const cand=t.closest('#mapView [data-map-cand]');
  if(cand){mapDrag={kind:'cand',id:cand.dataset.mapCand,sx:ev.clientX,sy:ev.clientY,moved:false,ghost:null,pid:ev.pointerId};return}
  const stage=t.closest('#mapView [data-map-stage]');if(!stage)return;
  if(t.closest('.mapPinDive'))return;
  const pin=t.closest('[data-map-pin]');
  if(pin&&mapUI.mode==='view'&&!mapUI.placing){const p=entityMap(getEntity(mapUI.ownerId))?.pins.find(q=>q.id===pin.dataset.mapPin);if(!p)return;mapDrag={kind:'pin',id:p.id,el:pin,sx:ev.clientX,sy:ev.clientY,moved:false,pid:ev.pointerId};ev.preventDefault();return}
  const cam=mapCam();if(!cam)return;
  mapDrag={kind:'pan',sx:ev.clientX,sy:ev.clientY,cx:cam.x,cy:cam.y,moved:false,pid:ev.pointerId,target:t};ev.preventDefault();
});
window.addEventListener('pointermove',ev=>{
  const d=mapDrag;if(!d||ev.pointerId!==d.pid)return;const dx=ev.clientX-d.sx,dy=ev.clientY-d.sy;
  if(!d.moved&&Math.hypot(dx,dy)<5)return;d.moved=true;
  if(d.kind==='pan'){const cam=mapCam();if(!cam)return;cam.x=d.cx+dx;cam.y=d.cy+dy;mapApplyCam()}
  else if(d.kind==='pin'){const q=mapPointAt(ev.clientX,ev.clientY,{clampIn:true}),img=mapImage(getEntity(mapUI.ownerId));if(!q||!img)return;d.to=q;d.el.style.left=(q[0]*img.width)+'px';d.el.style.top=(q[1]*img.height)+'px';d.el.classList.add('dragging')}
  else if(d.kind==='cand'){if(!d.ghost){const e=getEntity(d.id);d.ghost=document.createElement('div');d.ghost.className='mapGhost';d.ghost.textContent=(getET(e?.type).icon||'•')+' '+(e?.name||'');document.body.appendChild(d.ghost)}d.ghost.style.left=zpx(ev.clientX)+'px';d.ghost.style.top=zpx(ev.clientY)+'px'}
});
window.addEventListener('pointerup',ev=>{
  const d=mapDrag;if(!d||ev.pointerId!==d.pid)return;mapDrag=null;
  if(d.kind==='cand'){d.ghost?.remove();
    if(!d.moved){mapUI.placing=mapUI.placing===d.id?null:d.id;mapUI.mode='view';renderMap();return}
    const q=mapPointAt(ev.clientX,ev.clientY);if(q){mapUI.placing=null;if(mapAddPin(mapUI.ownerId,d.id,q[0],q[1]))renderMap()}return}
  if(d.kind==='pin'){if(d.moved&&d.to){mapMovePin(mapUI.ownerId,d.id,d.to[0],d.to[1]);renderMap()}else{const p=entityMap(getEntity(mapUI.ownerId))?.pins.find(q=>q.id===d.id);if(p&&mapIsDouble('pin:'+p.id,ev)){openEntityMap(p.entityId,{from:mapUI.ownerId});return}mapUI.selPin=d.id;mapUI.selArea=null;if(p)mapSelectEntity(p.entityId);else renderMap()}return}
  if(d.kind==='pan'&&!d.moved){
    const q=mapPointAt(ev.clientX,ev.clientY);
    if(mapUI.mode==='area'){if(mapIsDouble('area',ev)&&mapUI.draft.length>=3){mapFinishArea();return}if(d.target?.closest('[data-map-close-area]')&&mapUI.draft.length>=3){mapFinishArea();return}if(q){mapUI.draft.push(q);renderMap()}return}
    if(mapUI.placing){if(q){const id=mapUI.placing;mapUI.placing=null;mapAddPin(mapUI.ownerId,id,q[0],q[1]);renderMap()}return}
    const area=d.target?.closest('[data-map-area]');
    if(area){const a=entityMap(getEntity(mapUI.ownerId))?.areas.find(x=>x.id===area.dataset.mapArea);mapUI.selArea=a?.id||null;mapUI.selPin=null;if(a?.entityId)mapSelectEntity(a.entityId);else renderMap();return}
    if(mapUI.selPin||mapUI.selArea){mapUI.selPin=null;mapUI.selArea=null;renderMap()}
  }
});
document.addEventListener('wheel',ev=>{
  const st=ev.target instanceof Element?ev.target.closest('#mapView [data-map-stage]'):null;if(!st)return;const cam=mapCam();if(!cam)return;ev.preventDefault();
  const r=st.getBoundingClientRect(),k=Math.exp(-ev.deltaY*.0015),z=Math.min(8,Math.max(.02,cam.z*k)),f=z/cam.z,mx=ev.clientX-r.left,my=ev.clientY-r.top;
  cam.x=mx-(mx-cam.x)*f;cam.y=my-(my-cam.y)*f;cam.z=z;mapApplyCam();
},{passive:false});
document.addEventListener('click',ev=>{
  const t=ev.target instanceof Element?ev.target:null;if(!t)return;
  const open=t.closest('[data-map-open]');if(open){ev.preventDefault();openEntityMap(open.dataset.mapOpen);return}
  const show=t.closest('[data-map-show]');if(show){ev.preventDefault();mapShowPin(show.dataset.mapShow,show.dataset.mapShowPin);return}
  if(!mapIsOpen())return;
  const dive=t.closest('[data-map-dive]');if(dive){ev.preventDefault();ev.stopPropagation();openEntityMap(dive.dataset.mapDive,{from:mapUI.ownerId});return}
  const go=t.closest('[data-map-go]');if(go){ev.preventDefault();mapGoCrumb(go.dataset.mapGo);return}
  const un=t.closest('[data-map-unpin]');if(un){ev.preventDefault();mapRemovePin(mapUI.ownerId,un.dataset.mapUnpin);renderMap();return}
  const placed=t.closest('[data-map-placed]');if(placed){const p=entityMap(getEntity(mapUI.ownerId))?.pins.find(q=>q.id===placed.dataset.mapPlaced);if(p){mapUI.selPin=p.id;mapSelectEntity(p.entityId)}return}
  const ae=t.closest('[data-map-area-edit]');if(ae){ev.preventDefault();mapEditArea(ae.dataset.mapAreaEdit);return}
  const ad=t.closest('[data-map-area-del]');if(ad){ev.preventDefault();mapRemoveArea(mapUI.ownerId,ad.dataset.mapAreaDel);mapUI.selArea=null;renderMap();return}
  const ar=t.closest('[data-map-area-row]');if(ar){const a=entityMap(getEntity(mapUI.ownerId))?.areas.find(x=>x.id===ar.dataset.mapAreaRow);mapUI.selArea=a?.id||null;if(a?.entityId)mapSelectEntity(a.entityId);else renderMap();return}
  // 0.23.9: a line between two marks is a relation — a click opens it on the right, like a thread on the board
  const ml=t.closest('#mapView [data-map-link]');if(ml){ev.preventDefault();selectRelationById(ml.dataset.mapLink);return}
  const act=t.closest('#mapView [data-map-act]');if(!act)return;ev.preventDefault();
  const a=act.dataset.mapAct;
  // 0.23.9: the map on the whole screen — the clean canvas; it ends with the map (or with Esc, the map stays)
  if(a==='full'){const on=!document.querySelector('.app').classList.contains('cleanMode');mapUI.cleanByMap=on;setCleanMode(on);renderMap();requestAnimationFrame(()=>mapFit?.());return}
  if(a==='close')closeEntityMap();else if(a==='fit')mapFit();else if(a==='draw')(typeof openMapDrawer==='function'?openMapDrawer:()=>'')(mapUI.ownerId);else if(a==='snapshot')openSnapshotDialog();else if(a==='image')mapChooseImage();else if(a==='upload')mapPickFile();
  else if(a==='links'){mapSetLinks(mapUI.ownerId,!entityMap(getEntity(mapUI.ownerId))?.links);renderMap()}
  else if(a==='area'){mapUI.mode=mapUI.mode==='area'?'view':'area';mapUI.draft=[];mapUI.placing=null;renderMap()}
});
document.addEventListener('keydown',ev=>{
  const cand=ev.target instanceof Element?ev.target.closest('#mapView [data-map-cand]'):null;
  if(cand&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();mapUI.placing=cand.dataset.mapCand;renderMap();return}
});
window.addEventListener('keydown',ev=>{
  if(!mapIsOpen()||$('#modalBack')?.classList.contains('open'))return;
  if(ev.target instanceof HTMLElement&&ev.target.matches('input,textarea,select,[contenteditable]'))return;
  if(ev.key==='Escape'){ev.preventDefault();if(mapUI.mode==='area'){mapUI.mode='view';mapUI.draft=[];renderMap()}else if(mapUI.placing){mapUI.placing=null;renderMap()}else closeEntityMap();return}
  if(ev.key==='Enter'&&mapUI.mode==='area'){ev.preventDefault();mapFinishArea();return}
  if((ev.key==='Delete'||ev.key==='Backspace')&&(mapUI.selPin||mapUI.selArea)){ev.preventDefault();ev.stopImmediatePropagation();if(mapUI.selPin)mapRemovePin(mapUI.ownerId,mapUI.selPin);else mapRemoveArea(mapUI.ownerId,mapUI.selArea);mapUI.selPin=null;mapUI.selArea=null;renderMap()}
},true);
document.addEventListener('input',ev=>{const t=ev.target;if(t instanceof HTMLElement&&t.matches('#mapView [data-map-search]')){mapUI.query=t.value;renderMap()}});
window.addEventListener('resize',()=>{if(mapIsOpen())mapApplyCam()});

// ---- Раздел «Карта» на странице записи ----
SECTION_KINDS.map={name:'Карта',icon:'🗺',group:'data',subjects:['entity'],unique:true,hint:'Картинка-карта сущности с метками других сущностей',settings:[]};
function mapSectionBody(subj){
  const e=subj.obj,m=entityMap(e),img=mapImage(e),url=img?getMediaUrl(img.id):'';
  const on=mapsShowing(e.id),onHtml=on.length?`<div class="mapOnOther">На картах: ${on.map(o=>`<button type="button" class="tagChip secChip" data-map-show="${escapeHtml(o.id)}" data-map-show-pin="${escapeHtml(e.id)}" title="Открыть карту и показать метку"><i>📍</i>${escapeHtml(o.name)}</button>`).join('')}</div>`:'';
  if(!hasEntityMap(e))return `${onHtml}<div class="mapThumbFoot"><span>Своей карты пока нет.</span><button type="button" class="btn" data-map-open="${escapeHtml(e.id)}">🗺 Сделать карту</button></div>`;
  const dots=url?m.pins.map(p=>{const pe=getEntity(p.entityId);return pe?`<i class="mapThumbDot" style="left:${(p.x*100).toFixed(2)}%;top:${(p.y*100).toFixed(2)}%;--pin:${escapeHtml(safeCssValue(pe.style?.color||getET(pe.type).color,'#74b8ff'))}" title="${escapeHtml(pe.name)}"></i>`:''}).join(''):'';
  return `${url?`<button type="button" class="mapThumb" data-map-open="${escapeHtml(e.id)}" title="Открыть карту"><span class="mapThumbBox"><img src="${url}" alt="">${dots}</span></button>`:''}<div class="mapThumbFoot"><span>${m.pins.length?`Меток: ${m.pins.length}`:'Меток пока нет'}${m.areas.length?` · областей: ${m.areas.length}`:''}</span><button type="button" class="btn" data-map-open="${escapeHtml(e.id)}">🗺 Открыть карту</button></div>${onHtml}`;
}
