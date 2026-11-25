// Universe Graph — рисование (0.29.6): общий «движок» для рисовальной доски и (0.29.7) карт. Рисунок — набор штрихов
// (вектор: не мутнеет при приближении, лёгкий, по сети пересылается по одному штриху). Инструменты: выбор и перенос,
// карандаш, маркер, ластик (стирает штрих целиком), линия, стрелка, прямоугольник, круг (можно залить), текст, картинка,
// карточка сущности, кубик. Колёсико — приближение, правая/средняя кнопка или пробел + мышь — сдвиг. Перо планшета — нажим.
// Каждое законченное действие сохраняется в мир — Ctrl+Z отменяет его, как любую правку.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';
const DRAW_COLORS=['#1b1f2a','#f4f1e8','#e53935','#fb8c00','#fdd835','#43a047','#1e88e5','#8e24aa','#6d4c41','#90a4ae'];
const DRAW_TERRAIN={land:{name:'Суша',base:'#dcc999',coast:'#8a6d3b'},water:{name:'Вода',base:'#8fb8d8',coast:'#4a7aa6'},forest:{name:'Лес',base:'#9cbc84',coast:'#5a7d45'},mountains:{name:'Горы',base:'#bcae93',coast:'#7a6a50'},swamp:{name:'Болото',base:'#97a274',coast:'#5f6a43'},desert:{name:'Пустыня',base:'#ead39a',coast:'#b08f48'},snow:{name:'Снег',base:'#f1f4f7',coast:'#9aa7b4'}};
function drawMapDefs(){return `<defs><pattern id="drwPat-land" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="8" cy="9" r=".9" fill="#a18a5a" opacity=".5"/><circle cx="28" cy="27" r=".9" fill="#a18a5a" opacity=".5"/></pattern><pattern id="drwPat-water" width="44" height="22" patternUnits="userSpaceOnUse"><path d="M2 11 q5 -5 10 0 t10 0" fill="none" stroke="#4a7aa6" stroke-width="1.2" opacity=".55"/></pattern><pattern id="drwPat-forest" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M13 4 L19 16 H7 Z" fill="#4f7a3c" opacity=".85"/><rect x="12" y="16" width="2" height="4" fill="#5d4a2c"/></pattern><pattern id="drwPat-mountains" width="38" height="30" patternUnits="userSpaceOnUse"><path d="M3 24 L13 8 L23 24" fill="#a89878" stroke="#6b5b40" stroke-width="1.3"/><path d="M13 8 L16 13 L11 13 Z" fill="#fff" opacity=".8"/></pattern><pattern id="drwPat-swamp" width="30" height="20" patternUnits="userSpaceOnUse"><path d="M3 12 h9 M17 6 h8" stroke="#55603b" stroke-width="1.4"/><path d="M8 12 v-5 M10 12 v-4" stroke="#55603b" stroke-width="1"/></pattern><pattern id="drwPat-desert" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="5" cy="6" r="1" fill="#b08f48"/><circle cx="17" cy="15" r="1" fill="#b08f48"/><path d="M2 20 q4 -3 8 0" fill="none" stroke="#b08f48" stroke-width=".8"/></pattern><pattern id="drwPat-snow" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M12 6 v8 M8 10 h8" stroke="#9aa7b4" stroke-width="1"/></pattern></defs>`}
const DRAW_TOOLS=[['select','🖐','Выбрать и подвинуть (Delete — удалить)'],['pen','✏️','Карандаш'],['marker','🖍','Маркер — широкий и полупрозрачный'],['eraser','🧽','Ластик — стирает штрих целиком'],['line','／','Линия'],['arrow','➜','Стрелка'],['rect','▭','Прямоугольник'],['ellipse','◯','Круг'],['text','T','Текст'],['image','🖼','Картинка с компьютера'],['card','🃏','Карточка сущности'],['dice','🎲','Бросить кубик на доску: d20 (Shift — d6)']];
function drawEsc(s){return escapeHtml(String(s??''))}
function drawPathD(pts){if(!pts.length)return '';if(pts.length===1){const [x,y]=pts[0];return `M${x} ${y}l0.01 0`}let d=`M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;for(let i=1;i<pts.length-1;i++){const [x1,y1]=pts[i],[x2,y2]=pts[i+1];d+=` Q${x1.toFixed(1)} ${y1.toFixed(1)} ${((x1+x2)/2).toFixed(1)} ${((y1+y2)/2).toFixed(1)}`}const l=pts[pts.length-1];return d+` L${l[0].toFixed(1)} ${l[1].toFixed(1)}`}
// fewer points, same line (Ramer–Douglas–Peucker)
function drawSimplify(pts,eps){if(pts.length<3)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];while(st.length){const [a,b]=st.pop();let md=0,mi=-1;const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy)||1;for(let i=a+1;i<b;i++){const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/L;if(d>md){md=d;mi=i}}if(md>eps&&mi>0){keep[mi]=1;st.push([a,mi],[mi,b])}}return pts.filter((_,i)=>keep[i])}
function drawBox(s){if(s.points){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of s.points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}const p=(s.width||2)/2;return {x:x0-p,y:y0-p,w:x1-x0+2*p,h:y1-y0+2*p}}if(s.t==='text'){const fs=s.size||22,lines=String(s.text||'').split('\n');return {x:s.x,y:s.y-fs,w:Math.max(...lines.map(l=>l.length))*fs*.55+4,h:lines.length*fs*1.25}}return {x:Math.min(s.x,s.x+(s.w||0)),y:Math.min(s.y,s.y+(s.h||0)),w:Math.abs(s.w||0),h:Math.abs(s.h||0)}}
function drawStrokeSvg(s,{sel=false}={}){
  const c=drawEsc(s.color||'#1b1f2a'),w=Number(s.width)||3,id=drawEsc(s.id);
  let out='';
  if(s.t==='pen'||s.t==='marker'){out=`<path d="${drawPathD(s.points||[])}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${s.t==='marker'?' stroke-opacity=".45"':''}/>`}
  else if(s.t==='line'||s.t==='arrow'){const [[x1,y1],[x2,y2]]=s.points;out=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;if(s.t==='arrow'){const a=Math.atan2(y2-y1,x2-x1),L=Math.max(10,w*4);out+=`<path d="M${x2} ${y2} L${(x2-L*Math.cos(a-.45)).toFixed(1)} ${(y2-L*Math.sin(a-.45)).toFixed(1)} M${x2} ${y2} L${(x2-L*Math.cos(a+.45)).toFixed(1)} ${(y2-L*Math.sin(a+.45)).toFixed(1)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`}}
  else if(s.t==='rect'){const b=drawBox(s);out=`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4" fill="${s.fill?c:'none'}" fill-opacity="${s.fill?.35:0}" stroke="${c}" stroke-width="${w}"/>`}
  else if(s.t==='ellipse'){const b=drawBox(s);out=`<ellipse cx="${b.x+b.w/2}" cy="${b.y+b.h/2}" rx="${b.w/2}" ry="${b.h/2}" fill="${s.fill?c:'none'}" fill-opacity="${s.fill?.35:0}" stroke="${c}" stroke-width="${w}"/>`}
  else if(s.t==='text'){const fs=Number(s.size)||22;out=`<text x="${s.x}" y="${s.y}" font-size="${fs}" fill="${c}" font-family="inherit" style="white-space:pre">${String(s.text||'').split('\n').map((l,i)=>`<tspan x="${s.x}" dy="${i?fs*1.25:0}">${drawEsc(l)}</tspan>`).join('')}</text>`}
  else if(s.t==='image'){const m=s.media?.[0]?.id,url=m?getMediaUrl(m):'';out=url?`<image href="${drawEsc(url)}" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" preserveAspectRatio="xMidYMid meet"/>`:`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="none" stroke="#999" stroke-dasharray="6 4"/>`}
  else if(s.t==='card'){const e=getEntity(s.entityId),et=e?getET(e.type):null;out=`<g class="drwCard" data-drw-card="${drawEsc(s.entityId)}"><rect x="${s.x}" y="${s.y}" width="${s.w||200}" height="${s.h||64}" rx="10" fill="#fffef8" stroke="${drawEsc(et?.color||'#999')}" stroke-width="2.5"/><text x="${s.x+14}" y="${s.y+27}" font-size="18" font-weight="700" fill="#1b1f2a">${drawEsc((et?.icon||'•')+' '+(e?.name||'— сущности нет —'))}</text><text x="${s.x+14}" y="${s.y+49}" font-size="13" fill="#5c6270">${drawEsc(et?.name||'')}</text></g>`}
  else if(s.t==='terrain'||s.t==='fog'){const d=drawPathD(s.points||[])+' Z';const T=DRAW_TERRAIN[s.kind]||DRAW_TERRAIN.land;out=s.t==='fog'?`<path class="drwFog" d="${d}" fill="#6b7280" fill-opacity=".55" stroke="#4b5563" stroke-dasharray="8 5" stroke-width="2"/>`:`<path d="${d}" fill="${T.base}"/><path d="${d}" fill="url(#drwPat-${drawEsc(s.kind||'land')})" stroke="${T.coast}" stroke-width="${s.kind==='water'?2.5:1.5}" stroke-linejoin="round"/>`}
  else if(s.t==='road'||s.t==='border'||s.t==='wall'){const k={road:['#7a5a32',w,'10 6'],border:['#a3262a',w,'14 6 3 6'],wall:['#3f3f46',Math.max(6,w*2),'']}[s.t];out=`<path d="${drawPathD(s.points||[])}" fill="none" stroke="${s.color&&s.color!=='#1b1f2a'?c:k[0]}" stroke-width="${k[1]}" stroke-linecap="round" stroke-linejoin="round"${k[2]?` stroke-dasharray="${k[2]}"`:''}/>`}
  else if(s.t==='river'){const pts=s.points||[];if(pts.length>1){const L=[],R=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,ww=w*(.2+.8*i/(pts.length-1))/2;L.push([pts[i][0]-dy/l*ww,pts[i][1]+dx/l*ww]);R.push([pts[i][0]+dy/l*ww,pts[i][1]-dx/l*ww])}out=`<path d="M${[...L,...R.reverse()].map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L')} Z" fill="#5d93c4" stroke="#3f6f9c" stroke-width="1"/>`}}
  else if(s.t==='stamp'){const fs=Number(s.size)||36;out=`<text x="${s.x}" y="${s.y}" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${drawEsc(s.glyph||'🏠')}</text>${s.text?`<text x="${s.x}" y="${s.y+fs*.85}" font-size="${Math.max(11,fs*.38)}" text-anchor="middle" fill="${c}" font-weight="700" paint-order="stroke" stroke="#f4ecd8" stroke-width="3">${drawEsc(s.text)}</text>`:''}`}
  else if(s.t==='label'){const [[x1,y1],[x2,y2]]=s.points,mx=(x1+x2)/2,my=(y1+y2)/2,L=Math.hypot(x2-x1,y2-y1)||1,b=(Number(s.bend)||.18)*L,cx=mx+(y2-y1)/L*b,cy=my-(x2-x1)/L*b,pid='lbl-'+id,fs=Number(s.size)||28;out=`<path id="${pid}" d="M${x1} ${y1} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2} ${y2}" fill="none"/><text font-size="${fs}" fill="${c}" font-style="italic" letter-spacing="2" paint-order="stroke" stroke="#f4ecd8" stroke-width="4"><textPath href="#${pid}" startOffset="50%" text-anchor="middle">${drawEsc(s.text||'')}</textPath></text>`}
  if(!out)return '';
  if(sel){const b=drawBox(s);out+=`<rect class="drwSelBox" x="${b.x-4}" y="${b.y-4}" width="${b.w+8}" height="${b.h+8}" fill="none" stroke="#1e88e5" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>`}
  return `<g class="drwStroke" data-drw-id="${id}">${out}</g>`;
}
// strokes from a file are checked: known kinds, numbers, short texts (a hostile file must not bring junk or scripts)
const DRAW_KINDS=new Set(['pen','marker','line','arrow','rect','ellipse','text','image','card','terrain','fog','road','border','wall','river','stamp','label']);
function drawNormStrokes(list){if(!Array.isArray(list))return [];const n=v=>{const x=Number(v);return Number.isFinite(x)?Math.max(-1e6,Math.min(1e6,x)):0};const out=[];for(const s of list){if(!isRecord(s)||!DRAW_KINDS.has(s.t))continue;const o={id:String(s.id||uid('stroke')).slice(0,60),t:s.t};
  if(/^#[0-9a-f]{3,8}$/i.test(String(s.color||'')))o.color=String(s.color);if(s.width!=null)o.width=Math.max(.5,Math.min(200,n(s.width)));
  if(Array.isArray(s.points))o.points=s.points.filter(p=>Array.isArray(p)&&p.length>=2).slice(0,5000).map(p=>[n(p[0]),n(p[1])]);
  for(const k of ['x','y','w','h','size','bend'])if(s[k]!=null)o[k]=n(s[k]);
  if(s.text!=null)o.text=String(s.text).slice(0,500);if(s.kind!=null)o.kind=String(s.kind).slice(0,20);if(s.glyph!=null)o.glyph=String(s.glyph).slice(0,8);if(s.fill)o.fill=true;if(s.entityId)o.entityId=String(s.entityId).slice(0,80);
  if(Array.isArray(s.media))o.media=s.media.filter(isRecord).slice(0,1).map(m=>({id:String(m.id||''),name:String(m.name||'').slice(0,80),mime:String(m.mime||''),width:n(m.width),height:n(m.height)}));
  if(typeof s.by==='string'&&s.by.trim())o.by=s.by.trim().slice(0,40); /* 0.30.5: the player's nick in the game over the network */if(typeof s.byId==='string'&&/^[A-Za-z0-9_-]{3,60}$/.test(s.byId))o.byId=s.byId;if(typeof s.at==='string')o.at=s.at.slice(0,40);out.push(o);if(out.length>=20000)break}return out}
function drawDistToSeg(px,py,[x1,y1],[x2,y2]){const dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;let t=L?((px-x1)*dx+(py-y1)*dy)/L:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))}
function drawHit(s,x,y,r){if(s.points&&s.points.length>1){for(let i=1;i<s.points.length;i++)if(drawDistToSeg(x,y,s.points[i-1],s.points[i])<=r+(s.width||2)/2)return true;return false}if(s.points?.length===1)return Math.hypot(x-s.points[0][0],y-s.points[0][1])<=r+(s.width||2);const b=drawBox(s);return x>=b.x-r&&x<=b.x+b.w+r&&y>=b.y-r&&y<=b.y+b.h+r}
function drawMove(s,dx,dy){if(s.points)s.points=s.points.map(([x,y,p])=>p==null?[x+dx,y+dy]:[x+dx,y+dy,p]);if(Number.isFinite(s.x))s.x+=dx;if(Number.isFinite(s.y))s.y+=dy}
// The surface: host — an element; opts.get() → the sheet {strokes,…}; opts.commit(fn, okText) — change and save; opts.readOnly()
function createDrawSurface(host,opts){
  const S={tool:'pen',color:DRAW_COLORS[0],width:3,fill:false,view:{x:0,y:0,z:1},sel:new Set(),live:null,space:false,pan:null};
  host.classList.add('drwHost');
  host.innerHTML=`<div class="drwBar" role="toolbar">${(opts.tools||DRAW_TOOLS).map(([t,i,title])=>`<button type="button" class="drwTool" data-drw-tool="${t}" title="${drawEsc(title)}" aria-label="${drawEsc(title)}">${i}</button>`).join('')}<span class="drwSep"></span><input type="color" class="drwColorAny" title="Цвет" aria-label="Цвет" value="${S.color}" data-rgb-apply-same data-rgb-presets="${DRAW_COLORS.join(',')}"><label class="drwWidth" title="Толщина"><input type="range" min="1" max="40" value="3" aria-label="Толщина"></label><label class="drwFill" title="Залить фигуру"><input type="checkbox"> залить</label><span class="drwSep"></span><button type="button" class="drwTool" data-drw-act="fit" title="Вписать всё">▣</button>${opts.barExtra||''}</div><div class="drwStage"><svg class="drwSvg" xmlns="http://www.w3.org/2000/svg"><g class="drwBack"></g><g class="drwLayer"></g><g class="drwFront"></g><g class="drwLive"></g></svg><div class="drwHint" hidden></div></div>`;
  const svg=host.querySelector('.drwSvg'),layer=svg.querySelector('.drwLayer'),live=svg.querySelector('.drwLive'),stage=host.querySelector('.drwStage');
  const ro=()=>!!opts.readOnly?.();
  const strokes=()=>opts.get()?.strokes||[];
  const applyView=()=>{const r=stage.getBoundingClientRect(),v=S.view;svg.setAttribute('viewBox',`${v.x} ${v.y} ${(r.width||800)/v.z} ${(r.height||600)/v.z}`)};
  const toWorld=ev=>{const r=stage.getBoundingClientRect();return [S.view.x+(ev.clientX-r.left)/S.view.z,S.view.y+(ev.clientY-r.top)/S.view.z]};
  const render=()=>{const list=strokes();layer.innerHTML=list.map(s=>drawStrokeSvg(s,{sel:S.sel.has(s.id)})).join('');opts.back&&(svg.querySelector('.drwBack').innerHTML=opts.back(S));opts.front&&(svg.querySelector('.drwFront').innerHTML=opts.front(S));
    host.querySelectorAll('[data-drw-tool]').forEach(b=>b.classList.toggle('on',b.dataset.drwTool===S.tool));
    host.classList.toggle('drwRO',ro());applyView()};
  const fit=()=>{const list=strokes();const r=stage.getBoundingClientRect();if(!list.length){S.view={x:-r.width/2,y:-r.height/2,z:1};applyView();return}let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const s of list){const b=drawBox(s);x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h)}const z=Math.min(4,Math.max(.1,Math.min((r.width-60)/Math.max(1,x1-x0),(r.height-60)/Math.max(1,y1-y0))));S.view={x:(x0+x1)/2-r.width/2/z,y:(y0+y1)/2-r.height/2/z,z};applyView()};
  const add=(s,text)=>{s.id=uid('stroke');s.by=window.UG_ONLINE_PLAYER&&typeof onp!=='undefined'&&onp.me?onp.me.name:typeof viewAsPlayer==='function'&&viewAsPlayer()?'player':'gm';s.at=new Date().toISOString();return opts.commit(sh=>{sh.strokes=sh.strokes||[];sh.strokes.push(s)},text)};
  const removeIds=ids=>{if(!ids.size)return;opts.commit(sh=>{sh.strokes=(sh.strokes||[]).filter(s=>!ids.has(s.id))},null);S.sel.clear();render()};
  const hint=(t)=>{const h=host.querySelector('.drwHint');h.textContent=t||'';h.hidden=!t};
  // ---- pointer ----
  stage.addEventListener('pointerdown',ev=>{
    if(ev.target.closest('.drwTextBox'))return;
    const [x,y]=toWorld(ev);
    if(ev.button===1||ev.button===2||S.space){S.pan={sx:ev.clientX,sy:ev.clientY,v:{...S.view}};stage.setPointerCapture(ev.pointerId);ev.preventDefault();return}
    if(ro()||ev.button!==0)return;stage.setPointerCapture(ev.pointerId);ev.preventDefault();
    const t=S.tool,p=ev.pressure&&ev.pointerType==='pen'?ev.pressure:null;
    const spec=opts.toolSpec?.(t);if(spec){if(spec.mode==='click'){add(spec.make({x,y},S),null);render()}else S.live={t:'spec',spec,points:[[x,y]],x,y};return}
    if(t==='pen'||t==='marker'){S.live={t,color:S.color,width:t==='marker'?Math.max(10,S.width*3):Math.max(1,S.width*(p?(.4+p*1.2):1)),points:[[x,y]]};}
    else if(t==='eraser'){S.live={t:'erase',hit:new Set()};const r=8/S.view.z;for(const s of strokes())if(drawHit(s,x,y,r))S.live.hit.add(s.id)}
    else if(['line','arrow','rect','ellipse'].includes(t)){S.live={t,color:S.color,width:S.width,fill:S.fill,x,y,w:0,h:0,points:t==='line'||t==='arrow'?[[x,y],[x,y]]:undefined}}
    else if(t==='select'){const r=6/S.view.z,hit=[...strokes()].reverse().find(s=>drawHit(s,x,y,r));if(hit){if(!S.sel.has(hit.id)){if(!ev.shiftKey)S.sel.clear();S.sel.add(hit.id)}S.live={t:'move',x0:x,y0:y,dx:0,dy:0}}else{S.sel.clear()}render()}
    else if(t==='text'){drawTextBox(x,y,ev)}
    else if(t==='image'){drawPickImage(x,y)}
    else if(t==='card'){drawPickCard(x,y)}
    else if(t==='dice'){const d=ev.shiftKey?6:20,n=1+Math.floor(Math.random()*d);add({t:'text',x,y,color:S.color,size:30,text:`🎲 d${d}: ${n}`},`Кубик: ${n}`);render()}
  });
  stage.addEventListener('pointermove',ev=>{
    if(S.pan){S.view.x=S.pan.v.x-(ev.clientX-S.pan.sx)/S.view.z;S.view.y=S.pan.v.y-(ev.clientY-S.pan.sy)/S.view.z;applyView();return}
    const L=S.live;if(!L)return;const [x,y]=toWorld(ev);
    if(L.t==='spec'){if(L.spec.mode==='free'){const evs=ev.getCoalescedEvents?.()||[ev];for(const e of evs)L.points.push(toWorld(e))}else L.points=[L.points[0],[x,y]];live.innerHTML=drawStrokeSvg({...L.spec.make({points:L.points,x:L.x,y:L.y,w:x-L.x,h:y-L.y},S),id:'live'})}
    else if(L.points&&(L.t==='pen'||L.t==='marker')){const evs=ev.getCoalescedEvents?.()||[ev];for(const e of evs){const [a,b]=toWorld(e);L.points.push([a,b])}live.innerHTML=drawStrokeSvg({...L,id:'live'})}
    else if(L.t==='erase'){const r=8/S.view.z;for(const s of strokes())if(drawHit(s,x,y,r))L.hit.add(s.id);layer.querySelectorAll('[data-drw-id]').forEach(g=>g.classList.toggle('drwErasing',L.hit.has(g.dataset.drwId)))}
    else if(L.t==='line'||L.t==='arrow'){L.points[1]=[x,y];live.innerHTML=drawStrokeSvg({...L,id:'live'})}
    else if(L.t==='rect'||L.t==='ellipse'){L.w=x-L.x;L.h=y-L.y;live.innerHTML=drawStrokeSvg({...L,id:'live'})}
    else if(L.t==='move'){L.dx=x-L.x0;L.dy=y-L.y0;layer.querySelectorAll('[data-drw-id]').forEach(g=>{if(S.sel.has(g.dataset.drwId))g.setAttribute('transform',`translate(${L.dx} ${L.dy})`)})}
  });
  const end=ev=>{
    if(S.pan){S.pan=null;return}const L=S.live;S.live=null;live.innerHTML='';if(!L)return;
    if(L.t==='spec'){const pts=L.spec.mode==='free'?drawSimplify(L.points,.8/S.view.z).map(([x,y])=>[+x.toFixed(1),+y.toFixed(1)]):L.points;const ok=L.spec.mode==='free'?pts.length>1:Math.hypot(pts[1]?.[0]-pts[0][0],pts[1]?.[1]-pts[0][1])>4;if(ok){const st=L.spec.make({points:pts,x:L.x,y:L.y,w:(pts[1]?.[0]??L.x)-L.x,h:(pts[1]?.[1]??L.y)-L.y},S);if(L.spec.after)L.spec.after(st,add);else add(st,null)}}
    else if(L.t==='pen'||L.t==='marker'){const pts=drawSimplify(L.points,.6/S.view.z).map(([x,y])=>[+x.toFixed(1),+y.toFixed(1)]);add({t:L.t,color:L.color,width:+L.width.toFixed(1),points:pts},null)}
    else if(L.t==='erase'){removeIds(L.hit);return}
    else if(L.t==='line'||L.t==='arrow'){if(Math.hypot(L.points[1][0]-L.points[0][0],L.points[1][1]-L.points[0][1])>3)add({t:L.t,color:L.color,width:L.width,points:L.points},null)}
    else if(L.t==='rect'||L.t==='ellipse'){if(Math.abs(L.w)>3&&Math.abs(L.h)>3){const b=drawBox(L);add({t:L.t,color:L.color,width:L.width,fill:L.fill,x:b.x,y:b.y,w:b.w,h:b.h},null)}}
    else if(L.t==='move'){if(Math.abs(L.dx)+Math.abs(L.dy)>.5){const ids=new Set(S.sel);opts.commit(sh=>{for(const s of sh.strokes||[])if(ids.has(s.id))drawMove(s,L.dx,L.dy)},null)}}
    render();
  };
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  stage.addEventListener('contextmenu',ev=>ev.preventDefault());
  stage.addEventListener('wheel',ev=>{ev.preventDefault();const [x,y]=toWorld(ev),k=Math.exp(-ev.deltaY*.0015),z=Math.min(8,Math.max(.08,S.view.z*k)),r=stage.getBoundingClientRect();S.view={x:x-(ev.clientX-r.left)/z,y:y-(ev.clientY-r.top)/z,z};applyView()},{passive:false});
  stage.addEventListener('dblclick',ev=>{const c=ev.target.closest?.('[data-drw-card]');if(c&&getEntity(c.dataset.drwCard)){opts.onOpenEntity?.(c.dataset.drwCard)}});
  host.addEventListener('keydown',ev=>{if(ev.target.closest('input,textarea'))return;if(ev.key===' '){S.space=true;ev.preventDefault()}if((ev.key==='Delete'||ev.key==='Backspace')&&S.sel.size&&!ro()){ev.preventDefault();removeIds(new Set(S.sel))}});
  host.addEventListener('keyup',ev=>{if(ev.key===' ')S.space=false});
  host.tabIndex=-1;
  // ---- toolbar ----
  host.querySelector('.drwBar').addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;if(b.dataset.drwTool){S.tool=b.dataset.drwTool;S.sel.clear();hint(S.tool==='text'?'Нажмите, где писать':S.tool==='card'?'Нажмите, куда положить карточку':S.tool==='image'?'Нажмите, куда поставить картинку':'');render()}
    if(b.dataset.drwAct==='fit')fit();opts.onBar?.(b,S)});
  host.querySelector('.drwColorAny').addEventListener('change',ev=>{
    if(ro())return;
    S.color=ev.target.value;
    if(S.sel.size){
      const ids=new Set(S.sel);
      opts.commit(sh=>{for(const s of sh.strokes||[])if(ids.has(s.id))s.color=S.color},null);
    }
    render();
  });
  host.querySelector('.drwWidth input').addEventListener('input',ev=>{S.width=Number(ev.target.value)||3});
  host.querySelector('.drwFill input').addEventListener('change',ev=>{S.fill=ev.target.checked});
  // ---- text, image, card ----
  function drawTextBox(x,y,ev){const r=stage.getBoundingClientRect();const box=document.createElement('div');box.className='drwTextBox';box.style.left=(ev.clientX-r.left)+'px';box.style.top=(ev.clientY-r.top-14)+'px';box.innerHTML='<textarea rows="2" placeholder="Текст… (Enter — готово, Shift+Enter — новая строка)" aria-label="Текст на доске"></textarea>';stage.appendChild(box);const ta=box.querySelector('textarea');setTimeout(()=>ta.focus(),0);
    let fin=false;const done=ok=>{if(fin)return;fin=true;const v=ta.value.trim();box.remove();if(ok&&v)add({t:'text',x,y,color:S.color,size:Math.max(14,S.width*6),text:v},null);render()};
    ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();done(true)}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(false)}});ta.addEventListener('blur',()=>done(true))}
  function drawPickImage(x,y){const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.onchange=async()=>{const f=inp.files?.[0];if(!f)return;try{const m=await drawStoreImage(f);if(!m)return;const k=Math.min(1,480/Math.max(m.width,m.height,1));add({t:'image',x,y,w:Math.round(m.width*k),h:Math.round(m.height*k),media:[{id:m.id,name:m.filename||'картинка',mime:m.mime,width:m.width,height:m.height}]},null);render()}catch(err){toast('Картинку не вставить: '+(err?.message||err),'err')}};inp.click()}
  function drawPickCard(x,y){const list=data.entities.filter(e=>e.id!==currentRootId());const r=stage.getBoundingClientRect();const box=document.createElement('div');box.className='drwTextBox drwCardPick';box.style.left='20px';box.style.top='20px';box.innerHTML=`<input list="drwCardList" placeholder="Какая сущность?" aria-label="Сущность для карточки"><datalist id="drwCardList">${list.slice(0,500).map(e=>`<option value="${drawEsc(e.name)}">`).join('')}</datalist>`;stage.appendChild(box);const inp=box.querySelector('input');setTimeout(()=>inp.focus(),0);
    let fin=false;const done=()=>{if(fin)return;fin=true;const n=searchFold(inp.value.trim());box.remove();const e=list.find(x=>searchFold(x.name)===n);if(e){add({t:'card',x,y,w:220,h:64,entityId:e.id},null);render()}};inp.addEventListener('change',done);inp.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();done()}if(ev.key==='Escape'){ev.stopPropagation();box.remove()}})}
  new ResizeObserver(()=>applyView()).observe(stage);
  return {S,render,fit,setTool:t=>{S.tool=t;render()},add,svg,host};
}
async function drawStoreImage(file){
  if(!/^image\//.test(file.type))throw new Error('это не картинка');
  const url=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(file)});
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('картинка не открылась'));i.src=url});
  let data=url,w=img.naturalWidth,h=img.naturalHeight;const max=1600;if(Math.max(w,h)>max){const k=max/Math.max(w,h);w=Math.round(w*k);h=Math.round(h*k);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);data=c.toDataURL('image/jpeg',.88)}
  const m={id:uid('media'),filename:file.name,mime:data.startsWith('data:image/jpeg')?'image/jpeg':file.type,width:w,height:h,data};
  mediaPut({id:m.id,name:m.filename,mime:m.mime,width:w,height:h,dataUrl:data,entityId:null}); // the store keeps base64 without «data:…,» (media.js)
  return m;
}
// the whole drawing as a picture
async function drawToCanvas(svgEl,{scale=2,bg='#ffffff'}={}){
  const g=svgEl.querySelector('.drwLayer');const bb=g.getBBox();const pad=20,w=Math.max(10,bb.width+pad*2),h=Math.max(10,bb.height+pad*2);
  const src=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x-pad} ${bb.y-pad} ${w} ${h}" width="${w}" height="${h}">${svgEl.querySelector('.drwBack').outerHTML}${g.outerHTML}${svgEl.querySelector('.drwFront').outerHTML}</svg>`;
  const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('не собралось'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(src)});
  const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const x=c.getContext('2d');if(bg){x.fillStyle=bg;x.fillRect(0,0,c.width,c.height)}x.drawImage(img,0,0,c.width,c.height);return c;
}
