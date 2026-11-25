// Bounded overview raster for big boards. SVG remains authoritative for
// geometry, picking, selected threads and all close-up/focus rendering.
'use strict';
let udInkEnabled=true;
const UD_INK_PAD=192,UD_INK_MAX_PIXELS=4*1024*1024,UD_INK_ZOOM_RESERVE=.85;
function udInkBounds(d){
  const values=(d.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);if(values.length!==6||values.some(v=>!Number.isFinite(v)))return null;
  return {minX:Math.min(values[0],values[2],values[4]),minY:Math.min(values[1],values[3],values[5]),maxX:Math.max(values[0],values[2],values[4]),maxY:Math.max(values[1],values[3],values[5]),values};
}
function udInkArc(values){
  const [ax,ay,cx,cy,bx,by]=values,cumulative=[0];let x=ax,y=ay,length=0;
  for(let i=1;i<=24;i++){const t=i/24,u=1-t,nx=u*u*ax+2*u*t*cx+t*t*bx,ny=u*u*ay+2*u*t*cy+t*t*by;length+=Math.hypot(nx-x,ny-y);cumulative.push(length);x=nx;y=ny}return {length,cumulative,values};
}
function udInkLength(values){return udInkArc(values).length}
function udInkArcT(arc,distance){
  if(distance<=0)return 0;if(distance>=arc.length)return 1;
  const sums=arc.cumulative;let a=0,b=sums.length-1;
  while(b-a>1){const m=(a+b)>>1;if(sums[m]<distance)a=m;else b=m}
  return (a+(distance-sums[a])/(sums[b]-sums[a]||1))/(sums.length-1);
}
function udInkSegments(motion,length){
  const segments=[];let start=-motion.offset;
  for(let i=0;i<motion.dash.length;i+=2){
    const a=((start%length)+length)%length,b=a+motion.dash[i];
    if(b>length){segments.push([a,length],[0,b-length])}else segments.push([a,b]);
    start+=motion.dash[i]+motion.dash[i+1];
  }return segments;
}
function udInkMotionPath(ctx,arc,motion){
  const [ax,ay,cx,cy,bx,by]=arc.values;
  const point=(t,a,c,b)=>(1-t)**2*a+2*(1-t)*t*c+t*t*b;
  ctx.beginPath();
  // Only the small illuminated pieces are stroked; a long dashed quadratic
  // would otherwise be tessellated again for every phase of every thread.
  for(const [a,b] of udInkSegments(motion,arc.length)){
    if(b<=a)continue;
    const t=udInkArcT(arc,a),u=udInkArcT(arc,b),dt=u-t,x=point(t,ax,cx,bx),y=point(t,ay,cy,by);
    ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x+dt*((1-t)*(cx-ax)+t*(bx-cx)),y+dt*((1-t)*(cy-ay)+t*(by-cy)),point(u,ax,cx,bx),point(u,ay,cy,by));
  }
  ctx.stroke();
}
function udInkRef(width,height,z,x,y,dpr=1){
  const w=width+2*UD_INK_PAD,h=height+2*UD_INK_PAD,ratio=Math.min(dpr||1,1.5,Math.sqrt(UD_INK_MAX_PIXELS/(w*h)));
  const minX=(-width/2-UD_INK_PAD-x)/z,minY=(-height/2-UD_INK_PAD-y)/z;
  return {z,x,y,width,height,w,h,ratio,minX,minY,maxX:minX+w/z,maxY:minY+h/z};
}
function udInkCovered(ref,z,x,y){
  if(!ref)return false;
  return (-ref.width/2-x)/z>=ref.minX&&(-ref.height/2-y)/z>=ref.minY&&
    (ref.width/2-x)/z<=ref.maxX&&(ref.height/2-y)/z<=ref.maxY;
}
function udInkCameraRef(width,height,z,x,y,dpr){
  // Reserve world coverage for a subsequent zoom-out as well as panning.
  const s=UD_INK_ZOOM_RESERVE;return udInkRef(width,height,z*s,x*s,y*s,dpr);
}
function udInkIntersects(bounds,ref,pad){return bounds.maxX+pad>=ref.minX&&bounds.minX-pad<=ref.maxX&&bounds.maxY+pad>=ref.minY&&bounds.minY-pad<=ref.maxY}
function udInkMotion(kind,now,duration,delay,length,dim){
  const phase=((now-delay)%duration+duration)%duration/duration;
  const dash=kind==='trail'?[.8,99.2]:kind==='comet'?[1.2,98.8]:kind==='pulse'?[3,97]:kind==='spark'?[.25,1,.25,98.5]:[.45,99.55];
  let offset=-phase*length,opacity=dim?.14:1;
  if(kind==='reverse')offset=-(1-phase)*length;
  if(kind==='pulse'){offset=-.485*length;opacity=.25+.75*(1-Math.abs(2*phase-1))}
  if(kind==='spark'){const p=((now-delay)%230+230)%230/230;opacity=.25+.75*(1-Math.cos(2*Math.PI*p))/2}
  return {dash:dash.map(v=>v*length/100),offset,opacity};
}
function udInkEntry(ink,node){
  const old=ink.entries.get(node);if(old&&!ink.dirtyNodes.has(node))return old;
  const d=node.getAttribute('d'),classes=node.getAttribute('class')||'',style=node.getAttribute('style')||'';
  if(old&&old.d===d&&old.classes===classes&&old.style===style)return old;
  if(!d||node.classList.contains('boardStringShadow'))return null;
  const bounds=udInkBounds(d);if(!bounds)throw Error('Unsupported board ink geometry');
  const arrow=node.classList.contains('boardStringArrow'),motion=node.classList.contains('boardStringMotion'),dim=node.classList.contains('dim');
  const color=node.getAttribute(arrow?'fill':'stroke'),alpha=Number(node.getAttribute(arrow?'fill-opacity':'stroke-opacity'));
  const w=parseFloat(node.style.getPropertyValue('--sw'))||2.4,cap=node.style.strokeLinecap||'round';
  const dash=(node.style.strokeDasharray||'').split(/[\s,]+/).filter(v=>v&&v!=='none').map(parseFloat);
  if(!color||!CSS.supports('color',color)||/var\(/i.test(color)||!Number.isFinite(alpha)||dash.some(v=>!Number.isFinite(v)))throw Error('Unsupported board ink style');
  const kind=motion?['trail','comet','pulse','spark','reverse'].find(k=>node.classList.contains(k))||'flow':null;
  const arc=motion?(old?.d===d&&old.arc?old.arc:udInkArc(bounds.values)):null;
  const value={node,d,classes,style,shape:old?.d===d?old.shape:new Path2D(d),bounds,arrow,motion,dim,color,alpha,w,cap,dash,kind,arc,
    opacity:arrow?(dim?.14:1):(node.classList.contains('mine')||node.classList.contains('selected')?1:.28),
    length:arc?.length||0,
    duration:Math.max(10,(parseFloat(node.style.getPropertyValue('--thread-duration'))||2.2)*1000),delay:(parseFloat(node.style.getPropertyValue('--thread-delay'))||0)*1000};
  ink.entries.set(node,value);return value;
}
function udInkDispose(stage){
  const ink=stage?._udInk;if(!ink)return;
  clearTimeout(ink.timer);clearTimeout(ink.liveTimer);cancelAnimationFrame(ink.raf);ink.observer?.disconnect();ink.reduce.removeEventListener?.('change',ink.motionChanged);ink.canvas.remove();ink.motionCanvas.remove();stage.classList.remove('udRasterInk');delete stage._udInk;
}
function udInkShowSvg(ink){ink.canvas.hidden=ink.motionCanvas.hidden=true;ink.stage.classList.remove('udRasterInk')}
function udInkSchedule(ink,immediate=false){
  if(immediate&&ink.timer){clearTimeout(ink.timer);ink.timer=0}
  if(ink.raf||ink.timer)return;
  ink.raf=requestAnimationFrame(now=>{ink.raf=0;udInkDraw(ink,now)});
}
function udInkSizeCanvas(canvas,ref,quality){
  const w=Math.max(1,Math.floor(ref.w*ref.ratio*quality)),h=Math.max(1,Math.floor(ref.h*ref.ratio*quality));
  if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  // The intrinsic CSS box is screen-sized too. A giant world-sized canvas
  // element can make the compositor resample/rasterize a huge texture even
  // when its backing bitmap is small.
  canvas.style.left=ref.minX+'px';canvas.style.top=ref.minY+'px';canvas.style.width=ref.w+'px';canvas.style.height=ref.h+'px';canvas.style.transform='scale('+1/ref.z+')';
}
function udInkPaint(canvas,ctx,ref,list,bk,elapsed,animated,clear=true,skip=null){
  const scaleX=ref.z*canvas.width/ref.w,scaleY=ref.z*canvas.height/ref.h;
  if(clear){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)}
  ctx.setTransform(scaleX,0,0,scaleY,-ref.minX*scaleX,-ref.minY*scaleY);
  let rendered=0,alpha,stroke,fill,width,cap,dash,offset;
  const empty=[];ctx.lineJoin='miter';
  // Each static stroke and arrow is painted in original relative SVG order.
  // Traveling highlights have their own surface under the cards. This avoids
  // repainting the immutable ink on every animation frame in the overview.
  for(const e of list){
    const w=e.w*bk;if(skip?.has(e.node)||!udInkIntersects(e.bounds,ref,w+3)||animated&&!e.length)continue;
    const motion=animated?udInkMotion(e.kind,elapsed,e.duration,e.delay,e.length,e.dim):null;
    const a=e.alpha*(motion?.opacity??e.opacity);
    if(alpha!==a)ctx.globalAlpha=alpha=a;
    if(e.arrow){if(fill!==e.color)ctx.fillStyle=fill=e.color;ctx.fill(e.shape)}
    else{
      const c=animated?'round':e.cap,d=animated?empty:(e.dash.length?e.dash:empty),o=0;
      if(stroke!==e.color)ctx.strokeStyle=stroke=e.color;
      if(width!==w)ctx.lineWidth=width=w;
      if(cap!==c)ctx.lineCap=cap=c;
      if(dash!==d){ctx.setLineDash(d);dash=d}
      if(offset!==o)ctx.lineDashOffset=offset=o;
      if(animated)udInkMotionPath(ctx,e.arc,motion);else ctx.stroke(e.shape);
    }rendered++;
  }return rendered;
}
function udInkDraw(ink,now){
  const {stage,view,canvas,ctx,motionCanvas,motionCtx}=ink;
  if(!stage.isConnected||stage._udInk!==ink){udInkDispose(stage);return}
  if(document.hidden){ink.timer=setTimeout(()=>{ink.timer=0;udInkSchedule(ink)},250);return}
  try{
    const start=performance.now();
    const geometryDirty=ink.dirtyNodes.size>0;
    let staticDirty=ink.staticDirty||ink.listDirty;
    if(ink.listDirty){ink.list=[];ink.staticList=[];ink.motionList=[];ink.slots=new WeakMap();for(const node of ink.layer.children){const entry=udInkEntry(ink,node);if(entry){const list=entry.motion?ink.motionList:ink.staticList;ink.slots.set(node,{all:ink.list.length,index:list.length,motion:entry.motion});ink.list.push(entry);list.push(entry)}}ink.listDirty=false}
    else for(const node of ink.dirtyNodes){const slot=ink.slots.get(node);if(slot){const old=ink.list[slot.all],entry=ink.list[slot.all]=udInkEntry(ink,node);(slot.motion?ink.motionList:ink.staticList)[slot.index]=entry;if(!slot.motion&&old!==entry&&!ink.liveNodes.has(node))staticDirty=true}}
    ink.dirtyNodes.clear();
    if(ink.sizeDirty||!ink.width){ink.width=view.clientWidth;ink.height=view.clientHeight;ink.sizeDirty=false;ink.rebase=true}
    const z=state.boardZoom||1,x=state.boardPanX||0,y=state.boardPanY||0;
    if(ink.rebase||!udInkCovered(ink.ref,z,x,y)){
      const ref=ink.ref=udInkCameraRef(ink.width,ink.height,z,x,y,devicePixelRatio||1);ink.rebase=false;ink.metrics.rebases++;staticDirty=true;
      udInkSizeCanvas(canvas,ref,1);
    }
    const ref=ink.ref,reduced=ink.reduce.matches,bk=parseFloat(ink.layer.style.getPropertyValue('--bk'))||1,elapsed=now-ink.started;
    if(staticDirty||ink.bk!==bk){ink.metrics.staticPaths=udInkPaint(canvas,ctx,ref,ink.staticList,bk,elapsed,false,true,ink.liveNodes);ink.metrics.staticDraws++;ink.staticDirty=false;ink.bk=bk}
    const animate=ink.motionList.length&&!reduced,live=ink.liveNodes.size>0;
    if(animate||live){
      const moved=ink.motionRef!==ref;
      if(moved){udInkSizeCanvas(motionCanvas,ref,.5);ink.motionRef=ref}
      if(moved||staticDirty||geometryDirty||!ink.zooming){
        const liveList=live?[...ink.liveNodes].sort((a,b)=>(ink.slots.get(a)?.all??0)-(ink.slots.get(b)?.all??0)).map(n=>ink.entries.get(n)).filter(Boolean):[];
        ink.metrics.livePaths=live?udInkPaint(motionCanvas,motionCtx,ref,liveList,bk,elapsed,false):0;
        ink.metrics.motionPaths=animate?udInkPaint(motionCanvas,motionCtx,ref,ink.motionList,bk,elapsed,true,!live):0;
        ink.metrics.motionDraws++;
      }
    }else if(ink.motionRef){motionCanvas.width=motionCanvas.height=1;ink.motionRef=null;ink.metrics.motionPaths=ink.metrics.livePaths=0}
    motionCanvas.hidden=!(animate||live);canvas.hidden=false;stage.classList.add('udRasterInk');ink.metrics.draws++;const ms=performance.now()-start;ink.metrics.totalMs+=ms;ink.metrics.maxMs=Math.max(ink.metrics.maxMs,ms);ink.metrics.rendered=ink.metrics.staticPaths+ink.metrics.motionPaths+ink.metrics.livePaths;ink.metrics.bytes=(canvas.width*canvas.height+motionCanvas.width*motionCanvas.height)*4;
    if(animate&&!ink.zooming){ink.timer=setTimeout(()=>{ink.timer=0;udInkSchedule(ink)},stage._boardMoving?100:66)}
  }catch(error){stage._udInkFailed=true;udInkDispose(stage);console.warn('Board ink: retaining SVG',error?.message||error)}
}
function udInkCamera(view,stage,z,settled=false){
  if(!stage)return;
  const eligible=udInkEnabled&&typeof Path2D==='function'&&view.classList.contains('bBig')&&state.visualStyle==='classic'&&!state.space&&z<.5&&!stage._udInkFailed;
  if(!eligible){udInkDispose(stage);return}
  let ink=stage._udInk;
  if(!ink){const layer=stage.querySelector(':scope > .boardStrings:not(.boardStringsTop)');if(!layer?.children.length)return;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),motionCanvas=document.createElement('canvas'),motionCtx=motionCanvas.getContext('2d');if(!ctx||!motionCtx)return;
    canvas.className='udBoardInk';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');stage.insertBefore(canvas,layer);
    motionCanvas.className='udBoardInk udBoardMotionInk';motionCanvas.hidden=true;motionCanvas.width=motionCanvas.height=1;motionCanvas.setAttribute('aria-hidden','true');stage.insertBefore(motionCanvas,layer);
    ink=stage._udInk={stage,view,layer,canvas,ctx,motionCanvas,motionCtx,entries:new WeakMap(),dirtyNodes:new Set(),liveNodes:new Set(),liveTimer:0,listDirty:true,staticDirty:true,sizeDirty:true,ref:null,rebase:true,raf:0,timer:0,cameraZ:z,zooming:false,started:performance.now(),reduce:matchMedia('(prefers-reduced-motion: reduce)'),metrics:{draws:0,staticDraws:0,motionDraws:0,staticPaths:0,motionPaths:0,livePaths:0,totalMs:0,maxMs:0,rebases:0,syncRebases:0,rendered:0,bytes:0}};
    ink.motionChanged=()=>udInkSchedule(ink,true);ink.reduce.addEventListener?.('change',ink.motionChanged);
    if(typeof ResizeObserver==='function'){ink.observer=new ResizeObserver(()=>{ink.sizeDirty=true;udInkSchedule(ink,true)});ink.observer.observe(view)}
    udInkSchedule(ink,true);return;
  }
  if(settled&&ink.zooming){ink.zooming=false;udInkSchedule(ink,true)}
  if(ink.cameraZ!==z){ink.cameraZ=z;ink.zooming=!settled}
  if(!udInkCovered(ink.ref,z,state.boardPanX||0,state.boardPanY||0)){
    ink.rebase=true;
    // The cached stroke list is already ready. Refill the bounded surface
    // before the current camera frame paints; do not briefly restart thousands
    // of SVG animations merely because a zoom-out exposed new world pixels.
    if(ink.ref&&stage.classList.contains('udRasterInk')&&!ink.listDirty&&!ink.dirtyNodes.size){
      clearTimeout(ink.timer);cancelAnimationFrame(ink.raf);ink.timer=ink.raf=0;ink.metrics.syncRebases++;udInkDraw(ink,performance.now());
    }else{udInkShowSvg(ink);udInkSchedule(ink,true)}
  }else if(z/ink.ref.z>(settled?2.35:2.75)){
    // Zooming in shrinks the world viewport. Keep an already complete bitmap
    // during the gesture; sharpen once settled without changing paint order.
    ink.rebase=true;udInkSchedule(ink,true)
  }
}
function udInkClearLive(ink){
  clearTimeout(ink.liveTimer);ink.liveTimer=0;
  if(ink.liveNodes.size){ink.liveNodes.clear();ink.staticDirty=true}
}
function udInkSelectionPaths(stage,nodes){const ink=stage?._udInk;if(!ink)return;udInkClearLive(ink);ink.listDirty=true;for(const node of nodes)ink.dirtyNodes.add(node)}
function udInkChangedPaths(stage,nodes){
  const ink=stage?._udInk;if(!ink)return;
  for(const node of nodes)if(node.parentNode===ink.layer){
    const old=ink.entries.get(node);
    if(old?.d===node.getAttribute('d'))continue;
    ink.dirtyNodes.add(node);
    // During a move keep the few changed ordinary paths on the small live
    // surface. The other thousands stay cached, including during repeated
    // updates in a single drag. Merge back into exact static order on settle.
    if(old&&!old.motion&&!ink.listDirty&&!ink.liveNodes.has(node)){
      ink.liveNodes.add(node);ink.staticDirty=true;
    }
  }
}
function udInkFinishPaths(stage){
  const ink=stage?._udInk;if(!ink)return;
  if(ink.liveNodes.size>256)udInkClearLive(ink);
  if(ink.liveNodes.size&&ink.dirtyNodes.size){
    clearTimeout(ink.liveTimer);ink.liveTimer=setTimeout(()=>{ink.liveTimer=0;udInkClearLive(ink);udInkSchedule(ink,true)},300);
  }
  if(ink.listDirty||ink.dirtyNodes.size||ink.staticDirty)udInkSchedule(ink,true);
}
