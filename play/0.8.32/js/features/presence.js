// Universe Graph — присутствие в игре по сети (0.30.5): мышки участников и «здесь же».
// Каждый сообщает, где он (место: пространство графа, доска Detective, карта сущности, лист рисовальной доски, режим) и где
// мышка — в координатах этого места (у каждого свой масштаб и сдвиг, поэтому не в точках экрана). Мастер собирает и рассылает
// всем; каждый рисует стрелки тех, кто смотрит туда же. В режимах без общей системы координат (таблица, канбан, дерево,
// Outline, Galaxy, 3D, статья) — значки «здесь же». Пинг игрока — раз в 5 секунд.
// Модуль загружается обычным <script> после onlineplayer.js; имена — с приставкой prs.
'use strict';
const PRS_SEND_MS=90,PRS_STALE_MS=20000;
const prs={mx:null,my:null,last:'',lastAt:0,lastChannel:null,list:[],pending:null,timer:0,ping:0,pingAt:0,me:'',layer:null,tick:0,cursors:new Map(),frame:0,scene:null,channel:null,chips:'',rosterWorkspace:null,rosterChannel:null};
const PRS_MODES={graph:'Граф',outline:'Outline',tree:'Дерево',galaxy:'Galaxy',detective:'Detective',table:'Таблица',kanban:'Канбан'};
function prsOn(){return (!!window.UG_ONLINE_PLAYER&&typeof onp!=='undefined'&&onp.state==='in')||(typeof onh!=='undefined'&&onh.open&&onh.ready)}
// where am I: {p: place key, k: kind}
function prsPlace(){
  if(typeof boardUI!=='undefined'&&boardUI.open){const sh=(typeof boardRO==='function'&&boardRO()?boardReadSheet():boardSheet());return {p:'s:'+(sh?.id||'-'),k:'sketch'}}
  if(typeof mapUI!=='undefined'&&mapUI.ownerId&&$('#mapView')&&!$('#mapView').hidden&&$('#mapView').offsetParent)return {p:'m:'+mapUI.ownerId,k:'map'};
  if(typeof articleUI!=='undefined'&&articleUI.mode==='full'&&articleUI.id)return {p:'a:'+articleUI.id,k:'chip'};
  const m=state.visualMode;
  if(m==='graph'&&!(typeof graph3dOn==='function'&&graph3dOn()))return {p:'g:'+state.scopeId,k:'graph'};
  if(m==='detective')return {p:'d:'+state.scopeId,k:'board'};
  return {p:'v:'+m+':'+state.scopeId,k:'chip'};
}
function prsPlaceName(p){
  const [kind,...parts]=String(p||'').split(':'),id=parts.join(':');
  if(kind==='d'){
    const entity=getEntity(id);
    return entity&&!entity.hint?`«${entity.name}»`:'Другое дело';
  }
  if(kind==='s')return 'Рисовалка';
  if(kind==='a')return 'Статья';
  if(kind==='g')return 'Граф';
  if(kind==='m')return 'Карта';
  if(kind==='v')return PRS_MODES[parts[0]]||'';
  return '';
}
function prsSketchBox(){const svg=boardUI?.surface?.svg;if(!svg)return null;const vb=String(svg.getAttribute('viewBox')||'').split(/\s+/).map(Number);if(vb.length!==4||vb.some(v=>!Number.isFinite(v)))return null;return {r:svg.getBoundingClientRect(),vb}}
// screen → coordinates of the place, and back
function prsToPlace(k,cx,cy){
  if(k==='board'){const v=$('#detectiveView');if(!v)return null;const r=v.getBoundingClientRect();if(cx<r.left||cx>r.right||cy<r.top||cy>r.bottom)return null;const p=boardWorldPoint(cx,cy);return [p.x,p.y]}
  if(k==='map'){const p=typeof mapPointAt==='function'?mapPointAt(cx,cy):null;return p?[p[0],p[1]]:null}
  if(k==='sketch'){const b=prsSketchBox();if(!b||cx<b.r.left||cx>b.r.right||cy<b.r.top||cy>b.r.bottom)return null;return [b.vb[0]+(cx-b.r.left)*b.vb[2]/b.r.width,b.vb[1]+(cy-b.r.top)*b.vb[3]/b.r.height]}
  return null;
}
function prsToScreen(k,x,y){
  if(k==='board'){const v=$('#detectiveView');if(!v)return null;const r=v.getBoundingClientRect(),z=state.boardZoom||1;return {x:r.left+r.width/2+(state.boardPanX||0)+x*z,y:r.top+r.height/2+(state.boardPanY||0)+y*z,r}}
  if(k==='map'){const st=$('#mapView [data-map-stage]'),img=typeof mapImage==='function'?mapImage(getEntity(mapUI.ownerId)):null,cam=typeof mapCam==='function'?mapCam():null;if(!st||!img||!cam)return null;const r=st.getBoundingClientRect();return {x:r.left+cam.x+x*img.width*cam.z,y:r.top+cam.y+y*img.height*cam.z,r}}
  if(k==='sketch'){const b=prsSketchBox();if(!b)return null;return {x:b.r.left+(x-b.vb[0])*b.r.width/b.vb[2],y:b.r.top+(y-b.vb[1])*b.r.height/b.vb[3],r:b.r}}
  return null;
}
// ---- отправка своего положения ----
function prsReport(cx,cy){
  if(!prsOn()||(!window.UG_ONLINE_PLAYER&&viewAsPlayer()))return;const pl=prsPlace(),pt=cx==null?null:prsToPlace(pl.k,cx,cy);
  const msg={p:pl.p,k:pl.k,x:pt?Math.round(pt[0]*1000)/1000:null,y:pt?Math.round(pt[1]*1000)/1000:null};
  const key=JSON.stringify([state.workspaceId,msg]),channel=window.UG_ONLINE_PLAYER?onp.ws:onh.session;
  if(key===prs.last&&channel===prs.lastChannel&&Date.now()-prs.lastAt<5000)return;
  prs.pending={msg,key,workspace:state.workspaceId,channel};if(prs.timer)return;
  prs.timer=setTimeout(()=>{prs.timer=0;const pending=prs.pending;prs.pending=null;
    if(!pending||!prsOn()||pending.workspace!==state.workspaceId)return;
    if(window.UG_ONLINE_PLAYER?pending.channel!==onp.ws:pending.channel!==onh.session||viewAsPlayer())return;
    const m=pending.msg;prs.last=pending.key;prs.lastChannel=pending.channel;prs.lastAt=Date.now();
    if(window.UG_ONLINE_PLAYER)onpSend({t:'cur',...m,ms:prs.ping||0});else prsHostSelf(m)},PRS_SEND_MS);
}
// ---- у Мастера: собрать и разослать ----
function prsHostSelf(m){const gm=partGm();prsHostSet('gm',{id:'gm',name:gm.name,color:gm.color,gm:true,workspace:state.workspaceId,...m})}
function prsHostSet(key,v){if(!onh.pres)onh.pres=new Map();if(v)onh.pres.set(key,{...v,at:Date.now()});else onh.pres.delete(key);prsHostSchedule()}
function prsHostSchedule(){if(onh.presTimer)return;onh.presTimer=setTimeout(()=>{onh.presTimer=0;prsHostSend()},PRS_SEND_MS)}
function prsHostSend(){
 const list=[...(onh.pres||new Map()).values()].filter(v=>Date.now()-v.at<PRS_STALE_MS*3);
 const byZone=new Map();
 const publicList=(zone)=>{if(byZone.has(zone))return byZone.get(zone);const projection=udInZone(zone,()=>JSON.parse(onhSnapText()||'null'));
  const known=new Set((projection?.entities||[]).filter(e=>!e.hint).map(e=>e.id));
  const result=list.map(v=>{const same=(v.workspace||onh.wsId)===zone,visible=same&&(!v.p.startsWith('d:')||known.has(v.p.slice(2)));
   return {id:v.id,name:v.name,color:v.color,gm:!!v.gm,p:visible?v.p:'d:',k:v.k,x:visible?v.x:null,y:visible?v.y:null,ms:v.ms||0};
  });
  byZone.set(zone,result);return result;
 };
 if(typeof udInZone!=='function')return;
 prsTake(publicList(state.workspaceId).filter(v=>v.id!=='gm'));
 for(const [c,x] of onh.conns)if(x.state==='in')onhSend(c,{t:'pres',list:publicList(udZoneOf(x))});
}
function prsHostFrom(c,x,q){
  const p=partGet(x.partId);if(!p)return;const num=v=>v===null||v===undefined?null:(Number.isFinite(Number(v))?Number(v):null);
  prsHostSet(p.id,{id:p.id,name:p.name,color:p.color,workspace:x.workspace||onh.wsId,p:String(q.p||'').slice(0,120),k:['graph','board','map','sketch','chip'].includes(q.k)?q.k:'chip',x:num(q.x),y:num(q.y),ms:Math.max(0,Math.min(99999,Number(q.ms)||0))});
}
// ---- показ ----
function prsTake(list){prs.list=Array.isArray(list)?list:[];prs.rosterWorkspace=state.workspaceId;prs.rosterChannel=window.UG_ONLINE_PLAYER?onp.ws:onh.session;prs.tick++;prsRender();if(typeof udPeopleRefresh==='function')udPeopleRefresh();if(typeof onlRender==='function'&&$('#onlBody')&&prs.tick%10===1)onlRender()}
function prsMeId(){return window.UG_ONLINE_PLAYER?onp.me?.id:'gm'}
// Interpolate in world coordinates, not screen coordinates. The viewer may
// zoom or pan while another participant is moving. Retarget from the current
// interpolated point, avoid extrapolation, and stop the frame loop at rest.
function prsCursorPoint(c,now){const t=c.duration?Math.max(0,Math.min(1,(now-c.start)/c.duration)):1;return {x:c.x0+(c.x1-c.x0)*t,y:c.y0+(c.y1-c.y0)*t,moving:t<1}}
function prsCursorTarget(c,x,y,now){
  if(c.x1===x&&c.y1===y)return;
  const p=prsCursorPoint(c,now);const interval=now-c.last;
  Object.assign(c,{x0:p.x,y0:p.y,x1:x,y1:y,start:now,last:now,duration:Math.max(80,Math.min(200,interval||110))});
}
function prsClearCursors(){for(const c of prs.cursors.values())c.el.remove();prs.cursors.clear();if(prs.frame)cancelAnimationFrame(prs.frame);prs.frame=0;prs.scene=null;prs.channel=null}
function prsSyncScene(){
 const pl=prsPlace(),scene=JSON.stringify([state.workspaceId,pl.p,pl.k]),channel=window.UG_ONLINE_PLAYER?onp.ws:onh.session;
 if(prs.scene!==scene||prs.channel!==channel){prsClearCursors();prs.scene=scene;prs.channel=channel}
 return pl;
}
function prsCursorFrame(now){
 prs.frame=0;if(!prsOn()){prsClearCursors();return}
 const pl=prsSyncScene();let moving=false;
 // One layout read for all board cursors; do not read the moving paper DOM.
 const rect=pl.k==='board'?$('#detectiveView')?.getBoundingClientRect():null,z=state.boardZoom||1;
 for(const c of prs.cursors.values()){
  const point=prsCursorPoint(c,now);moving||=point.moving;
  const s=rect?{x:rect.left+rect.width/2+(state.boardPanX||0)+point.x*z,y:rect.top+rect.height/2+(state.boardPanY||0)+point.y*z,r:rect}:prsToScreen(pl.k,point.x,point.y);
  const visible=!!s&&s.x>=s.r.left&&s.x<=s.r.right&&s.y>=s.r.top&&s.y<=s.r.bottom;
  if(c.el.hidden===visible)c.el.hidden=!visible;if(visible){const transform=`translate3d(${s.x.toFixed(2)}px,${s.y.toFixed(2)}px,0)`;if(c.el.style.transform!==transform)c.el.style.transform=transform}
 }
 if(moving&&!prs.frame)prs.frame=requestAnimationFrame(prsCursorFrame);
}
function prsCameraMoved(){if(prs.cursors.size&&!prs.frame)prs.frame=requestAnimationFrame(prsCursorFrame)}
function prsRender(){
  let layer=prs.layer;if(!layer){layer=document.createElement('div');layer.id='prsLayer';layer.className='prsLayer';layer.setAttribute('aria-hidden','true');document.body.appendChild(layer);prs.layer=layer}
  if(!prsOn()){prsClearCursors();const c=$('#prsHere');if(c)c.hidden=true;return}
  const me=prsMeId(),pl=prsSyncScene();
  if(prs.rosterWorkspace!==state.workspaceId||prs.rosterChannel!==prs.channel)prs.list=[];
  const here=prs.list.filter(v=>v.id!==me&&v.p===pl.p),live=new Set(),now=performance.now();
  for(const v of here){
    if(pl.k==='chip'||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;live.add(v.id);
    let c=prs.cursors.get(v.id);
    if(!c){const el=document.createElement('div');el.className='prsCur';el.innerHTML='<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M1 1l13 9-6 1 3 7-3 1-3-7-4 4z"/></svg>';layer.append(el);c={el,x0:v.x,y0:v.y,x1:v.x,y1:v.y,start:now,last:now,duration:0};prs.cursors.set(v.id,c)}
    c.el.style.setProperty('--part-c',v.color||'#7aa7ff');prsCursorTarget(c,v.x,v.y,now);
  }
  for(const [id,c] of prs.cursors)if(!live.has(id)){c.el.remove();prs.cursors.delete(id)}
  if(prs.frame)cancelAnimationFrame(prs.frame);prsCursorFrame(now);
  let chips=$('#prsHere');if(!chips){chips=document.createElement('div');chips.id='prsHere';chips.className='prsHere';document.body.appendChild(chips)}
  chips.hidden=!here.length;const html=here.length?`<small>Здесь же:</small>${here.map(v=>`<span class="prsChip" style="--part-c:${escapeHtml(v.color||'')}" title="${escapeHtml(v.name)}${v.ms?` · ${v.ms} мс`:''}">${escapeHtml(v.name)}</span>`).join('')}`:'';
  if(html!==prs.chips){chips.innerHTML=html;prs.chips=html}
}
{
  window.addEventListener('mousemove',e=>{prs.mx=e.clientX;prs.my=e.clientY;if(prsOn())prsReport(e.clientX,e.clientY)},{passive:true});
  // where I am changes without the mouse (another mode, a map opened) — and the others' arrows move with my camera
  setInterval(()=>{if(!prsOn()){if(prs.layer?.innerHTML)prsRender();return}prsReport(prs.mx,prs.my);prsRender()},400);
  setInterval(()=>{if(window.UG_ONLINE_PLAYER&&typeof onp!=='undefined'&&onp.state==='in'){prs.pingAt=performance.now();onpSend({t:'ping'})}},5000);
}

