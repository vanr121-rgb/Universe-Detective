// Universe Graph — сохранить вид картинкой (0.29.5). «📷 Сохранить картинкой» в «⋯» строки каждого режима, у карты, в таблице
// и Мехом. «Что на экране» или «весь вид целиком» (вид сначала вписывается, потом камера возвращается); ×1 или ×2 (чётко для
// печати); фон стиля или прозрачный; «для игроков» — снимок «глазами игрока» (скрытого нет). PNG — файлом или в буфер обмена.
// Graph рисуется заново в отдельный холст нужного размера; остальные виды — копия страницы с готовыми стилями внутри SVG
// (foreignObject), которая рисуется в холст: вектор, поэтому ×2 — чёткий. Псевдоэлементы (::before/::after) не переносятся.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';
let snapshotDpr=null,snapLastMarkup=''; // graph.js reads it instead of devicePixelRatio while a snapshot is drawn
const snapUI={full:true,scale:2,bg:true,player:false};
function snapViewEl(){const m=state.visualMode;if(typeof mapIsOpen==='function'&&mapIsOpen())return $('#mapView');return m==='graph'?$('#graphCanvas'):m==='outline'?$('#outlineView'):m==='tree'?$('#treeView'):m==='galaxy'?$('#galaxyView'):m==='detective'?$('#detectiveView'):$('#tableView')}
function snapBg(){const el=document.querySelector('.canvasWrap')||document.body;for(let e=el;e;e=e.parentElement){const c=getComputedStyle(e).backgroundColor;if(c&&!/rgba\(0, 0, 0, 0\)|transparent/.test(c))return c}return getComputedStyle(document.documentElement).getPropertyValue('--skin-bg').trim()||'#0b1020'}
function snapName(){const ws=currentWorkspace(),scope=getEntity(state.scopeId),mode=typeof mapIsOpen==='function'&&mapIsOpen()?'карта':state.visualMode,day=new Date().toISOString().slice(0,10);return `${asciiFileName((ws?.name||'мир')+'-'+(scope?.name||'')+'-'+mode)}-${day}.png`}
// ---- other views: a copy with the styles baked in, drawn through SVG ----
const SNAP_SKIP_PROPS=/^(transition|animation|cursor|pointer-events|will-change|caret|outline-offset|-webkit-tap|user-select|scroll)/;
function snapInline(src,dst){
  const cs=getComputedStyle(src);let css='';for(let i=0;i<cs.length;i++){const p=cs[i];if(SNAP_SKIP_PROPS.test(p))continue;css+=`${p}:${cs.getPropertyValue(p)};`}
  dst.setAttribute('style',css+'animation:none;transition:none;');
  if(src instanceof HTMLCanvasElement){try{const img=document.createElement('img');img.src=src.toDataURL();img.setAttribute('style',css);dst.replaceWith(img);return}catch{}}
  if(src instanceof HTMLInputElement||src instanceof HTMLTextAreaElement)dst.setAttribute('value',src.value);
  const a=src.children,b=dst.children;for(let i=0;i<a.length&&i<b.length;i++)snapInline(a[i],b[i]);
}
async function snapFonts(){
  const out=[];for(const sh of document.styleSheets){let rules;try{rules=sh.cssRules}catch{continue}for(const r of rules){if(!(r instanceof CSSFontFaceRule))continue;let css=r.cssText;const urls=[...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1]);
    for(const u of urls){try{const abs=new URL(u,sh.href||location.href).href;const resp=await fetch(abs);const buf=await resp.blob();const data=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(buf)});css=css.split(u).join(data)}catch{}}
    out.push(css)}}
  return out.join('\n');
}
let snapFontCache=null;
async function snapDom(el,{scale,full,bg}){
  // appearing cards fade in: the picture is taken at their end, not half-transparent in the middle
  try{for(const a of el.getAnimations({subtree:true}))a.finish()}catch{}
  // a scrolled view: the copy is laid out whole (scroll size) and, for «что на экране», shifted by the scroll and cut to the window
  const sw=Math.max(el.scrollWidth,el.clientWidth),sh=Math.max(el.scrollHeight,el.clientHeight),sl=el.scrollLeft,st=el.scrollTop;
  const w=full?sw:el.clientWidth,h=full?sh:el.clientHeight;
  const clone=el.cloneNode(true);snapInline(el,clone);
  Object.assign(clone.style,{width:sw+'px',height:sh+'px',overflow:'visible',position:'relative',left:'0',top:'0',transform:'none',margin:'0',marginLeft:full?'0':(-sl)+'px',marginTop:full?'0':(-st)+'px',inset:'auto',isolation:'isolate'});
  if(!bg)clone.style.background='transparent';
  if(snapFontCache==null)snapFontCache=await snapFonts().catch(()=>'');
  const html=new XMLSerializer().serializeToString(clone);
  snapLastMarkup=html; // what went into the picture (the tests read it: nothing hidden «для игроков»)
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><style>${snapFontCache.replace(/<\//g,'<\\/')}</style><foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden">${html}</div></foreignObject></svg>`;
  const img=new Image();img.decoding='sync';
  await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('картинка не собралась'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
  const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const x=c.getContext('2d');
  if(bg){x.fillStyle=snapBg();x.fillRect(0,0,c.width,c.height)}
  x.scale(scale,scale);x.drawImage(img,0,0,w,h);return c;
}
// fit the transformed views so «весь вид целиком» is all of it; returns a function that puts the camera back
function snapFitWhole(){
  const m=state.visualMode,keep={boardZoom:state.boardZoom,boardPanX:state.boardPanX,boardPanY:state.boardPanY,galaxyZoom:state.galaxyZoom,galaxyPanX:state.galaxyPanX,galaxyPanY:state.galaxyPanY};
  if(typeof mapIsOpen==='function'&&mapIsOpen()){const cam=mapUI.cams?.get(mapUI.ownerId);const kc=cam?{...cam}:null;mapFit?.();return ()=>{if(kc){mapUI.cams.set(mapUI.ownerId,kc);mapApplyCam?.()}}}
  if(m==='detective'){boardFit();return ()=>{Object.assign(state,{boardZoom:keep.boardZoom,boardPanX:keep.boardPanX,boardPanY:keep.boardPanY});applyBoardTransform?.()}}
  return ()=>{};
}
async function makeSnapshot(opts={}){
  const o={...snapUI,...opts};
  const playerView=()=>viewAsPlayer()||!!window.UG_ONLINE_PLAYER;
  let switched=false;
  let back=()=>{};
  try{
    if(o.player&&!playerView()){
      switched=setViewAs('player');
      if(!switched)throw new Error('не удалось включить просмотр глазами игрока');
    }
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    if(o.full){back=snapFitWhole();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}
    if(o.player&&!playerView())throw new Error('просмотр глазами игрока закрыт');
    const el=snapViewEl();if(!el)throw new Error('нечего снимать');
    return await snapDom(el,o);
  }finally{try{back()}finally{if(switched&&viewAsPlayer())setViewAs('gm')}}
}
function snapBlob(c){return new Promise(res=>c.toBlob(res,'image/png'))}
async function saveSnapshot(opts={},{copy=false}={}){
  let c;try{c=await makeSnapshot(opts)}catch(err){toast('Не получилось сохранить картинкой: '+(err?.message||err),'err');return null}
  const blob=await snapBlob(c);if(!blob){toast('Картинка не собралась (слишком большая?) — попробуйте ×1 или «что на экране»','err');return null}
  if(copy){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast(`Картинка в буфере обмена (${c.width}×${c.height}) — вставьте в мессенджер`,'ok')}catch(err){toast('Скопировать не вышло — сохраните файлом','err')}return c}
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=snapName();document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
  toast(`Картинка сохранена: ${a.download} (${c.width}×${c.height})`,'ok');return c;
}
function openSnapshotDialog(){
  const opt=(name,v,label,checked)=>`<label class="snapOpt"><input type="radio" name="${name}" value="${v}"${checked?' checked':''}> ${label}</label>`;
  openModal('Сохранить картинкой',`<div class="form snapForm">
    <div><label>Что</label>${opt('snapFull','1','весь вид целиком',snapUI.full)}${opt('snapFull','0','что на экране',!snapUI.full)}</div>
    <div><label>Размер</label>${opt('snapScale','1','обычный',snapUI.scale===1)}${opt('snapScale','2','крупно ×2 — для печати',snapUI.scale===2)}</div>
    <div><label>Фон</label>${opt('snapBg','1','как в стиле',snapUI.bg)}${opt('snapBg','0','прозрачный',!snapUI.bg)}</div>
    <label class="snapOpt"><input type="checkbox" id="snapPlayer"${snapUI.player?' checked':''}> для игроков — без скрытого (как «глазами игрока»)</label></div>`,
    `<button type="button" class="btn" id="snapCancel">Отмена</button><button type="button" class="btn" id="snapCopy">Скопировать</button><button type="button" class="btn primary" id="snapSave">Сохранить файл</button>`);
  const read=()=>{snapUI.full=$('input[name=snapFull]:checked').value==='1';snapUI.scale=Number($('input[name=snapScale]:checked').value);snapUI.bg=$('input[name=snapBg]:checked').value==='1';snapUI.player=$('#snapPlayer').checked};
  $('#snapCancel').onclick=closeModal;
  $('#snapSave').onclick=()=>{read();closeModal();saveSnapshot()};
  $('#snapCopy').onclick=()=>{read();closeModal();saveSnapshot({},{copy:true})};
}
