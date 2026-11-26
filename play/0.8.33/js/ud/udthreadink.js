// Bounded overview raster for big boards. SVG remains authoritative for
// geometry, picking, selected threads and all focused/small-board rendering.
'use strict';
let udInkEnabled=true;
const UD_INK_PAD=192,UD_INK_MAX_PIXELS=4*1024*1024,UD_INK_ZOOM_RESERVE=.85,UD_INK_PREPARE=96;
const UD_INK_CELL=2048,UD_INK_MAX_CELLS=128;
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
function udInkMotionPath(ctx,arc,motion,ref=null,pad=0){
  const [ax,ay,cx,cy,bx,by]=arc.values;
  const point=(t,a,c,b)=>(1-t)**2*a+2*(1-t)*t*c+t*t*b;
  ctx.beginPath();
  // Only the small illuminated pieces are stroked; a long dashed quadratic
  // would otherwise be tessellated again for every phase of every thread.
  let drawn=0;
  for(const [a,b] of udInkSegments(motion,arc.length)){
    if(b<=a)continue;
    const t=udInkArcT(arc,a),u=udInkArcT(arc,b),dt=u-t,x=point(t,ax,cx,bx),y=point(t,ay,cy,by);
    const qx=x+dt*((1-t)*(cx-ax)+t*(bx-cx)),qy=y+dt*((1-t)*(cy-ay)+t*(by-cy)),ex=point(u,ax,cx,bx),ey=point(u,ay,cy,by);
    if(ref&&!udInkIntersects({minX:Math.min(x,qx,ex),minY:Math.min(y,qy,ey),maxX:Math.max(x,qx,ex),maxY:Math.max(y,qy,ey)},ref,pad))continue;
    ctx.moveTo(x,y);ctx.quadraticCurveTo(qx,qy,ex,ey);drawn++;
  }
  if(drawn)ctx.stroke();return drawn>0;
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
function udInkBoxes(bounds,arrow){
  if(arrow)return [bounds];
  const [ax,ay,cx,cy,bx,by]=bounds.values,span=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY),count=Math.max(1,Math.min(32,Math.ceil(span/UD_INK_CELL)));
  const point=(t,a,c,b)=>(1-t)**2*a+2*(1-t)*t*c+t*t*b,boxes=[];
  for(let i=0;i<count;i++){const t=i/count,u=(i+1)/count,dt=u-t,x=point(t,ax,cx,bx),y=point(t,ay,cy,by),qx=x+dt*((1-t)*(cx-ax)+t*(bx-cx)),qy=y+dt*((1-t)*(cy-ay)+t*(by-cy)),ex=point(u,ax,cx,bx),ey=point(u,ay,cy,by);
    boxes.push({minX:Math.min(x,qx,ex),minY:Math.min(y,qy,ey),maxX:Math.max(x,qx,ex),maxY:Math.max(y,qy,ey)})}
  return boxes;
}
function udInkEntryIntersects(e,ref,pad){return udInkIntersects(e.bounds,ref,pad)&&(!e.boxes||e.boxes.some(b=>udInkIntersects(b,ref,pad)))}
// Align the world origin to actual backing pixels. At unchanged scale a pan
// can copy overlapping pixels exactly (no repeated resampling/blur).
function udInkAlignedRef(ref){
  const w=Math.max(1,Math.floor(ref.w*ref.ratio)),h=Math.max(1,Math.floor(ref.h*ref.ratio));
  const sx=ref.z*w/ref.w,sy=ref.z*h/ref.h,minX=Math.round(ref.minX*sx)/sx,minY=Math.round(ref.minY*sy)/sy;
  return {...ref,minX,minY,maxX:minX+w/sx,maxY:minY+h/sy};
}
function udInkEdge(ref,z,x,y){
  if(!ref)return -Infinity;
  return Math.min(-ref.width/2-x-ref.minX*z,-ref.height/2-y-ref.minY*z,ref.maxX*z-ref.width/2+x,ref.maxY*z-ref.height/2+y);
}
// Disjoint dirty strips in backing pixels. No full-copy if the view jumps,
// zooms or changes DPR. The overlap remains a byte-for-byte image of the
// preceding static draw, including transparent pixels and ordered strokes.
function udInkShift(old,ref,w,h){
  if(!old||old.z!==ref.z||old.w!==ref.w||old.h!==ref.h||old.ratio!==ref.ratio)return null;
  const sx=ref.z*w/ref.w,sy=ref.z*h/ref.h,dx=Math.round((old.minX-ref.minX)*sx),dy=Math.round((old.minY-ref.minY)*sy);
  if(Math.abs(dx)>=w||Math.abs(dy)>=h)return null;
  const x=Math.max(0,dx),y=Math.max(0,dy),cw=w-Math.abs(dx),ch=h-Math.abs(dy),rects=[];
  const add=(x,y,w,h)=>{if(w>0&&h>0)rects.push({x,y,w,h})};
  add(0,0,x,h);add(x+cw,0,w-x-cw,h);add(x,0,cw,y);add(x,y+ch,cw,h-y-ch);
  return {srcX:Math.max(0,-dx),srcY:Math.max(0,-dy),x,y,w:cw,h:ch,rects};
}
function udInkWorldRects(ref,canvas,rects){
  const sx=ref.z*canvas.width/ref.w,sy=ref.z*canvas.height/ref.h;
  return rects.map(r=>({minX:ref.minX+r.x/sx,minY:ref.minY+r.y/sy,maxX:ref.minX+(r.x+r.w)/sx,maxY:ref.minY+(r.y+r.h)/sy}));
}
// Conservative spatial index. Very long curves are kept in an overflow set
// instead of allocating thousands of cells; exact drawing order is retained.
function udInkIndexCells(bounds,pad=0){
  const x=Math.floor((bounds.minX-pad)/UD_INK_CELL),y=Math.floor((bounds.minY-pad)/UD_INK_CELL),r=Math.floor((bounds.maxX+pad)/UD_INK_CELL),b=Math.floor((bounds.maxY+pad)/UD_INK_CELL);
  return {x,y,r,b,count:(r-x+1)*(b-y+1)};
}
function udInkIndexRemove(index,id){
  const previous=index.records.get(id);
  if(previous===null)index.overflow.delete(id);
  else if(previous)for(const key of previous){const set=index.cells.get(key);set?.delete(id);if(!set?.size)index.cells.delete(key)}
  index.records.delete(id);index.entries.delete(id);
}
function udInkIndexEntry(index,id,entry){
  if(index.entries.get(id)===entry)return;
  udInkIndexRemove(index,id);if(!entry)return;index.entries.set(id,entry);
  const keys=new Set();
  for(const bounds of entry.boxes||[entry.bounds]){
    const box=udInkIndexCells(bounds,entry.w+3);
    if(box.count>UD_INK_MAX_CELLS){index.overflow.add(id);index.records.set(id,null);return}
    for(let x=box.x;x<=box.r;x++)for(let y=box.y;y<=box.b;y++)keys.add(x+':'+y);
    if(keys.size>UD_INK_MAX_CELLS){index.overflow.add(id);index.records.set(id,null);return}
  }
  for(const key of keys){let set=index.cells.get(key);if(!set)index.cells.set(key,set=new Set());set.add(id)}
  index.records.set(id,keys);
}
function udInkIndexSet(index,i,entry){const id=entry?.node??i,old=index.slots[i];if(old!==undefined&&old!==id){udInkIndexRemove(index,old);index.order.delete(old)}index.slots[i]=id;index.order.set(id,i);udInkIndexEntry(index,id,entry)}
function udInkIndex(list,previous=null){
  const index=previous||{cells:new Map(),overflow:new Set(),records:new Map(),entries:new Map()};index.list=list;index.order=new Map();index.slots=[];
  list.forEach((e,i)=>{const id=e?.node??i;index.slots[i]=id;index.order.set(id,i);udInkIndexEntry(index,id,e)});
  for(const id of index.records.keys())if(!index.order.has(id))udInkIndexRemove(index,id);return index;
}
function udInkQuery(index,refs){
  if(!index)return [];
  const found=new Set(index.overflow);let broad=false;
  for(const ref of refs){const box=udInkIndexCells(ref);if(box.count>Math.max(512,index.cells.size*2)){broad=true;break}
    for(let x=box.x;x<=box.r;x++)for(let y=box.y;y<=box.b;y++){const set=index.cells.get(x+':'+y);if(set)for(const i of set)found.add(i)}
  }
  const list=broad?index.list:[...found].sort((a,b)=>index.order.get(a)-index.order.get(b)).map(id=>index.entries.get(id));
  return list.filter(e=>e&&refs.some(ref=>udInkEntryIntersects(e,ref,e.w+3)));
}
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
  const value={node,d,classes,style,shape:old?.d===d?old.shape:new Path2D(d),bounds,boxes:old?.d===d&&old.boxes?old.boxes:udInkBoxes(bounds,arrow),arrow,motion,dim,color,alpha,w,cap,dash,kind,arc,
    opacity:arrow?(dim?.14:1):(node.classList.contains('mine')||node.classList.contains('selected')?1:.28),
    length:arc?.length||0,
    duration:Math.max(10,(parseFloat(node.style.getPropertyValue('--thread-duration'))||2.2)*1000),delay:(parseFloat(node.style.getPropertyValue('--thread-delay'))||0)*1000};
  ink.entries.set(node,value);return value;
}
function udInkDispose(stage){
  const ink=stage?._udInk;if(!ink)return;
  clearTimeout(ink.timer);clearTimeout(ink.liveTimer);cancelAnimationFrame(ink.raf);udInkCancelMotion(ink);udInkCancelRebase(ink);ink.observer?.disconnect();ink.reduce.removeEventListener?.('change',ink.motionChanged);ink.canvas.remove();ink.motionCanvas.remove();stage.classList.remove('udRasterInk');delete stage._udInk;
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
function udInkPaint(canvas,ctx,ref,list,bk,elapsed,animated,clear=true,skip=null,rects=null){
  const scaleX=ref.z*canvas.width/ref.w,scaleY=ref.z*canvas.height/ref.h;
  if(rects){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();for(const r of rects){ctx.clearRect(r.x,r.y,r.w,r.h);ctx.rect(r.x,r.y,r.w,r.h)}ctx.clip()}
  if(clear){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)}
  ctx.setTransform(scaleX,0,0,scaleY,-ref.minX*scaleX,-ref.minY*scaleY);
  let rendered=0,alpha,stroke,fill,width,cap,dash,offset;
  const empty=[];ctx.lineJoin='miter';
  // Each static stroke and arrow is painted in original relative SVG order.
  // Traveling highlights have their own surface under the cards. This avoids
  // repainting the immutable ink on every animation frame in the overview.
  for(const e of list){
    const w=e.w*bk;if(skip?.has(e.node)||!udInkEntryIntersects(e,ref,w+3)||animated&&!e.length)continue;
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
      if(animated){if(!udInkMotionPath(ctx,e.arc,motion,ref,w+3))continue}else ctx.stroke(e.shape);
    }rendered++;
  }if(rects)ctx.restore();return rendered;
}
function udInkCopyOverlap(canvas,ctx,shift){
  // Canvas drawImage snapshots overlapping source pixels; clip 'copy' to
  // the exact destination so transparent source pixels replace stale ink.
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='copy';ctx.imageSmoothingEnabled=false;
  ctx.beginPath();ctx.rect(shift.x,shift.y,shift.w,shift.h);ctx.clip();
  ctx.drawImage(canvas,shift.srcX,shift.srcY,shift.w,shift.h,shift.x,shift.y,shift.w,shift.h);ctx.restore();
}
function udInkDamage(ink,entry){
  if(!entry||entry.motion)return;
  if(!ink.ref){ink.staticDirty=true;return}
  const pad=entry.w+5;for(const b of entry.boxes||[entry.bounds])ink.damage.push({minX:b.minX-pad,minY:b.minY-pad,maxX:b.maxX+pad,maxY:b.maxY+pad});
}
function udInkDamageRects(ref,canvas,damage){
  const sx=ref.z*canvas.width/ref.w,sy=ref.z*canvas.height/ref.h,rects=[];let area=0;
  for(const b of damage){const x=Math.max(0,Math.floor((b.minX-ref.minX)*sx)-1),y=Math.max(0,Math.floor((b.minY-ref.minY)*sy)-1),r=Math.min(canvas.width,Math.ceil((b.maxX-ref.minX)*sx)+1),bot=Math.min(canvas.height,Math.ceil((b.maxY-ref.minY)*sy)+1);
    if(r<=x||bot<=y)continue;rects.push({x,y,w:r-x,h:bot-y});area+=(r-x)*(bot-y);
    if(rects.length>128||area>canvas.width*canvas.height*.45)return null;
  }return rects;
}
function udInkCancelMotion(ink){if(ink.motionJob){cancelAnimationFrame(ink.motionJob.raf);ink.motionJob=null}}
function udInkCancelRebase(ink){const job=ink.rebaseJob;if(job){cancelAnimationFrame(job.raf);job.ctx.restore();ink.rebaseJob=null}}
function udInkSwapStatic(ink,back,ctx,ref){
  const previous=ink.canvas;back.className='udBoardInk';back.setAttribute('aria-hidden','true');udInkSizeCanvas(back,ref,1);back.hidden=false;
  ink.stage.replaceChild(back,previous);ink.canvas=back;ink.ctx=ctx;ink.rebaseBack=previous;
}
// Prepare the next complete static surface before the camera crosses the
// guard band. Exposed strips are composed in bounded slices, not in the
// pointer callback or in one large paint task. Until publication the old
// image remains intact. A jump outside it uses the proven immediate fallback.
function udInkPrepareRebase(ink,z,x,y){
  if(ink.rebaseJob)return true;
  if(!ink.ref||ink.staticList?.length<1000||ink.staticDirty||ink.listDirty||ink.dirtyNodes.size||ink.damage.length||ink.liveNodes.size)return false;
  const old=ink.ref,ref=udInkAlignedRef(udInkCameraRef(ink.width,ink.height,z,x,y,devicePixelRatio||1)),{canvas}=ink,shift=udInkShift(old,ref,canvas.width,canvas.height);
  if(!shift||!shift.rects.length)return false;
  const back=ink.rebaseBack||(ink.rebaseBack=document.createElement('canvas')),ctx=back.getContext('2d');if(!ctx)return false;
  if(back.width!==canvas.width)back.width=canvas.width;if(back.height!==canvas.height)back.height=canvas.height;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,back.width,back.height);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
  ctx.globalCompositeOperation='copy';ctx.drawImage(canvas,shift.srcX,shift.srcY,shift.w,shift.h,shift.x,shift.y,shift.w,shift.h);ctx.globalCompositeOperation='source-over';
  ctx.beginPath();for(const r of shift.rects)ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();
  const job=ink.rebaseJob={old,ref,ctx,shift,bk:ink.bk,list:udInkQuery(ink.staticIndex,udInkWorldRects(ref,back,shift.rects)),at:0,drawn:0,raf:0};
  const tick=()=>{
    job.raf=0;if(ink.rebaseJob!==job)return;
    if(!ink.stage.isConnected||ink.stage._udInk!==ink||ink.ref!==old||ink.staticDirty||ink.listDirty||ink.dirtyNodes.size||ink.damage.length||ink.liveNodes.size){udInkCancelRebase(ink);return}
    const start=performance.now();let n=0;
    do{const end=Math.min(job.at+64,job.list.length);job.drawn+=udInkPaint(back,ctx,ref,job.list.slice(job.at,end),job.bk,0,false,false);n+=end-job.at;job.at=end}while(job.at<job.list.length&&n<256&&performance.now()-start<3);
    ink.metrics.rebaseSliceMax=Math.max(ink.metrics.rebaseSliceMax,performance.now()-start);
    if(job.at<job.list.length){job.raf=requestAnimationFrame(tick);return}
    ctx.restore();ink.rebaseJob=null;
    const cz=state.boardZoom||1,cx=state.boardPanX||0,cy=state.boardPanY||0;
    if(!udInkCovered(ref,cz,cx,cy)||ink.cameraZ!==cz||udInkEdge(ref,cz,cx,cy)<=udInkEdge(old,cz,cx,cy))return;
    // Swap the completed canvas itself instead of copying its translucent
    // pixels a second time. This also avoids an extra full-buffer upload.
    udInkSwapStatic(ink,back,ctx,ref);
    ink.ref=ref;ink.metrics.rebases++;ink.metrics.stripRebases++;ink.metrics.asyncRebases++;ink.shiftSinceExact++;ink.metrics.stripPaths=job.drawn;ink.metrics.queryPaths=job.list.length;ink.rebase=false;udInkSchedule(ink,true);
    if(!ink.stage._boardMoving)udInkExactRefresh(ink);
  };job.raf=requestAnimationFrame(tick);return true;
}
// Repeated translucent bitmap copies may accumulate tiny raster rounding
// differences on some GPU backends. Refresh exact pixels after the gesture,
// in slices, without a blank frame or a fully synchronous idle redraw.
function udInkExactRefresh(ink){
  if(!ink.shiftSinceExact||ink.rebaseJob||!ink.ref||ink.staticDirty||ink.listDirty||ink.dirtyNodes.size||ink.damage.length||ink.liveNodes.size)return;
  const ref=ink.ref,back=ink.rebaseBack||(ink.rebaseBack=document.createElement('canvas')),ctx=back.getContext('2d');if(!ctx)return;
  back.width=ink.canvas.width;back.height=ink.canvas.height;ctx.save();
  const job=ink.rebaseJob={exact:true,old:ref,ref,ctx,list:udInkQuery(ink.staticIndex,[ref]),at:0,drawn:0,raf:0};
  const tick=()=>{
    job.raf=0;if(ink.rebaseJob!==job)return;
    if(!ink.stage.isConnected||ink.stage._udInk!==ink||ink.ref!==ref||ink.stage._boardMoving||ink.staticDirty||ink.listDirty||ink.dirtyNodes.size||ink.damage.length||ink.liveNodes.size){udInkCancelRebase(ink);return}
    const start=performance.now();let n=0;
    do{const end=Math.min(job.at+64,job.list.length);job.drawn+=udInkPaint(back,ctx,ref,job.list.slice(job.at,end),ink.bk,0,false,job.at===0);n+=end-job.at;job.at=end}while(job.at<job.list.length&&n<256&&performance.now()-start<3);
    if(job.at<job.list.length){job.raf=requestAnimationFrame(tick);return}
    ctx.restore();ink.rebaseJob=null;udInkSwapStatic(ink,back,ctx,ref);ink.shiftSinceExact=0;ink.metrics.exactRefreshes++;ink.metrics.staticPaths=job.drawn;
  };job.raf=requestAnimationFrame(tick);
}
// Large animated scenes previously spent a whole frame clearing and stroking
// all highlights. Compose an immutable phase in a bounded back buffer over
// several frames, then exchange it at once. The previous phase stays visible
// and static ink is never touched. Live dragged routes retain immediate paint.
function udInkQueueMotion(ink,ref,bk,elapsed,reset){
  if(ink.motionJob&&(reset||ink.motionJob.ref!==ref))udInkCancelMotion(ink);
  if(ink.motionJob)return;
  const back=ink.motionBack||(ink.motionBack=document.createElement('canvas')),ctx=back.getContext('2d');if(!ctx)return;
  udInkSizeCanvas(back,ref,.5);
  const job=ink.motionJob={ref,bk,elapsed,list:udInkQuery(ink.motionIndex,[ref]),index:0,drawn:0,raf:0};
  const tick=()=>{
    job.raf=0;if(ink.motionJob!==job||ink.stage._udInk!==ink||!ink.stage.isConnected)return;
    const start=performance.now();let n=0;
    do{const end=Math.min(job.index+32,job.list.length);job.drawn+=udInkPaint(back,ctx,ref,job.list.slice(job.index,end),bk,elapsed,true,job.index===0);n+=end-job.index;job.index=end}while(job.index<job.list.length&&n<128&&performance.now()-start<3);
    ink.metrics.motionSliceMax=Math.max(ink.metrics.motionSliceMax,performance.now()-start);
    if(job.index<job.list.length){job.raf=requestAnimationFrame(tick);return}
    const {motionCanvas:front,motionCtx:f}=ink;
    udInkSizeCanvas(front,ref,.5);f.save();f.setTransform(1,0,0,1,0,0);f.globalAlpha=1;f.globalCompositeOperation='copy';f.drawImage(back,0,0);f.restore();
    ink.motionRef=ref;ink.metrics.motionPaths=job.drawn;ink.metrics.motionDraws++;ink.metrics.motionBuffered++;ink.motionJob=null;front.hidden=false;
  };
  job.raf=requestAnimationFrame(tick);
}
function udInkDraw(ink,now){
  const {stage,view,canvas,ctx,motionCanvas,motionCtx}=ink;
  if(!stage.isConnected||stage._udInk!==ink){udInkDispose(stage);return}
  if(document.hidden){ink.timer=setTimeout(()=>{ink.timer=0;udInkSchedule(ink)},250);return}
  try{
    const start=performance.now();
    const geometryDirty=ink.dirtyNodes.size>0;
    let fullDirty=ink.staticDirty||ink.listDirty&&!ink.damage.length;
    let staticDirty=ink.staticDirty||ink.listDirty||ink.damage.length>0;
    if(staticDirty||geometryDirty||ink.sizeDirty)udInkCancelRebase(ink);
    if(ink.listDirty){ink.list=[];ink.staticList=[];ink.motionList=[];ink.slots=new WeakMap();for(const node of ink.layer.children){const entry=udInkEntry(ink,node);if(entry){const list=entry.motion?ink.motionList:ink.staticList;ink.slots.set(node,{all:ink.list.length,index:list.length,motion:entry.motion});ink.list.push(entry);list.push(entry)}}ink.staticIndex=udInkIndex(ink.staticList,ink.staticIndex);ink.motionIndex=udInkIndex(ink.motionList,ink.motionIndex);ink.listDirty=false}
    else for(const node of ink.dirtyNodes){const slot=ink.slots.get(node);if(slot){const old=ink.list[slot.all],entry=ink.list[slot.all]=udInkEntry(ink,node);(slot.motion?ink.motionList:ink.staticList)[slot.index]=entry;if(old!==entry)udInkIndexSet(slot.motion?ink.motionIndex:ink.staticIndex,slot.index,entry);if(!slot.motion&&old!==entry&&!ink.liveNodes.has(node)){udInkDamage(ink,old);udInkDamage(ink,entry);staticDirty=true}}}
    ink.dirtyNodes.clear();
    if(ink.sizeDirty||!ink.width){ink.width=view.clientWidth;ink.height=view.clientHeight;ink.sizeDirty=false;ink.rebase=true}
    const z=state.boardZoom||1,x=state.boardPanX||0,y=state.boardPanY||0;
    const bk=parseFloat(ink.layer.style.getPropertyValue('--bk'))||1,elapsed=now-ink.started;let shift=null,rebase=false;
    if(ink.rebase||!udInkCovered(ink.ref,z,x,y)){
      udInkCancelRebase(ink);
      const old=ink.ref,ref=ink.ref=udInkAlignedRef(udInkCameraRef(ink.width,ink.height,z,x,y,devicePixelRatio||1));ink.rebase=false;ink.metrics.rebases++;rebase=true;
      if(!staticDirty&&!geometryDirty&&ink.bk===bk)shift=udInkShift(old,ref,canvas.width,canvas.height);
      udInkSizeCanvas(canvas,ref,1);staticDirty=true;
    }
    const ref=ink.ref,reduced=ink.reduce.matches;
    if(staticDirty||ink.bk!==bk){
      if(shift){
        if(shift.rects.length){udInkCopyOverlap(canvas,ctx,shift);const paths=udInkQuery(ink.staticIndex,udInkWorldRects(ref,canvas,shift.rects));ink.metrics.queryPaths=paths.length;ink.metrics.stripPaths=udInkPaint(canvas,ctx,ref,paths,bk,elapsed,false,false,ink.liveNodes,shift.rects);ink.metrics.stripRebases++;ink.shiftSinceExact++}
      }else{
        const rects=!fullDirty&&!rebase&&ink.bk===bk&&ink.damage.length?udInkDamageRects(ref,canvas,ink.damage):null;
        if(rects){if(rects.length){const paths=udInkQuery(ink.staticIndex,udInkWorldRects(ref,canvas,rects));ink.metrics.queryPaths=paths.length;udInkPaint(canvas,ctx,ref,paths,bk,elapsed,false,false,ink.liveNodes,rects);ink.metrics.damageDraws++}}
        else{const paths=udInkQuery(ink.staticIndex,[ref]);ink.metrics.queryPaths=paths.length;ink.metrics.staticPaths=udInkPaint(canvas,ctx,ref,paths,bk,elapsed,false,true,ink.liveNodes);ink.metrics.staticDraws++;ink.shiftSinceExact=0}
      }
      ink.staticDirty=false;ink.bk=bk;
    }
    ink.damage.length=0;
    const animate=ink.motionList.length&&!reduced,live=ink.liveNodes.size>0;
    if(animate&&!live&&ink.metrics.livePaths===0&&ink.motionList.length>=256){
      if(ink.motionRef!==ref||staticDirty||geometryDirty||!ink.zooming)udInkQueueMotion(ink,ref,bk,elapsed,staticDirty||geometryDirty);
    }else if(animate||live){
      udInkCancelMotion(ink);
      const moved=ink.motionRef!==ref;
      if(moved){udInkSizeCanvas(motionCanvas,ref,.5);ink.motionRef=ref}
      if(moved||staticDirty||geometryDirty||!ink.zooming){
        const liveList=live?[...ink.liveNodes].sort((a,b)=>(ink.slots.get(a)?.all??0)-(ink.slots.get(b)?.all??0)).map(n=>ink.entries.get(n)).filter(Boolean):[];
        ink.metrics.livePaths=live?udInkPaint(motionCanvas,motionCtx,ref,liveList,bk,elapsed,false):0;
        ink.metrics.motionPaths=animate?udInkPaint(motionCanvas,motionCtx,ref,udInkQuery(ink.motionIndex,[ref]),bk,elapsed,true,!live):0;
        ink.metrics.motionDraws++;
      }
    }else{udInkCancelMotion(ink);if(ink.motionRef){motionCanvas.width=motionCanvas.height=1;ink.motionRef=null;ink.metrics.motionPaths=ink.metrics.livePaths=0}if(ink.motionBack){ink.motionBack.width=ink.motionBack.height=1}}
    motionCanvas.hidden=!(animate||live)||!ink.motionRef;canvas.hidden=false;stage.classList.add('udRasterInk');ink.metrics.draws++;const ms=performance.now()-start;ink.metrics.totalMs+=ms;ink.metrics.maxMs=Math.max(ink.metrics.maxMs,ms);ink.metrics.rendered=ink.metrics.staticPaths+ink.metrics.motionPaths+ink.metrics.livePaths;ink.metrics.bytes=(canvas.width*canvas.height+motionCanvas.width*motionCanvas.height+(ink.motionBack?ink.motionBack.width*ink.motionBack.height:0))*4;ink.metrics.rebaseBytes=ink.rebaseBack?ink.rebaseBack.width*ink.rebaseBack.height*4:0;
    if(animate&&!ink.zooming){ink.timer=setTimeout(()=>{ink.timer=0;udInkSchedule(ink)},stage._boardMoving?100:66)}
    if(!stage._boardMoving&&!ink.zooming&&ink.staticList.length>=1000)udInkExactRefresh(ink);
  }catch(error){stage._udInkFailed=true;udInkDispose(stage);console.warn('Board ink: retaining SVG',error?.message||error)}
}
function udInkCamera(view,stage,z,settled=false){
  if(!stage)return;
  // Close views of dense boards otherwise restart thousands of animated SVG
  // paths. Keep the same bounded raster and the precise SVG picking/top layer.
  const eligible=udInkEnabled&&typeof Path2D==='function'&&view.classList.contains('bBig')&&state.visualStyle==='classic'&&!state.space&&!stage._udInkFailed;
  if(!eligible){udInkDispose(stage);return}
  let ink=stage._udInk;
  if(!ink){const layer=stage.querySelector(':scope > .boardStrings:not(.boardStringsTop)');if(!layer?.children.length)return;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),motionCanvas=document.createElement('canvas'),motionCtx=motionCanvas.getContext('2d');if(!ctx||!motionCtx)return;
    canvas.className='udBoardInk';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');stage.insertBefore(canvas,layer);
    motionCanvas.className='udBoardInk udBoardMotionInk';motionCanvas.hidden=true;motionCanvas.width=motionCanvas.height=1;motionCanvas.setAttribute('aria-hidden','true');stage.insertBefore(motionCanvas,layer);
    ink=stage._udInk={stage,view,layer,canvas,ctx,motionCanvas,motionCtx,entries:new WeakMap(),dirtyNodes:new Set(),damage:[],liveNodes:new Set(),liveTimer:0,listDirty:true,staticDirty:true,sizeDirty:true,ref:null,rebase:true,shiftSinceExact:0,raf:0,timer:0,cameraZ:z,zooming:false,started:performance.now(),reduce:matchMedia('(prefers-reduced-motion: reduce)'),metrics:{draws:0,staticDraws:0,damageDraws:0,motionDraws:0,motionBuffered:0,motionSliceMax:0,staticPaths:0,motionPaths:0,livePaths:0,totalMs:0,maxMs:0,rebases:0,syncRebases:0,stripRebases:0,asyncRebases:0,exactRefreshes:0,rebaseSliceMax:0,rebaseBytes:0,stripPaths:0,queryPaths:0,rendered:0,bytes:0}};
    ink.motionChanged=()=>udInkSchedule(ink,true);ink.reduce.addEventListener?.('change',ink.motionChanged);
    if(typeof ResizeObserver==='function'){ink.observer=new ResizeObserver(()=>{ink.sizeDirty=true;udInkSchedule(ink,true)});ink.observer.observe(view)}
    udInkSchedule(ink,true);return;
  }
  if(settled&&(ink.zooming||ink.bk!==(parseFloat(ink.layer.style.getPropertyValue('--bk'))||1))){ink.zooming=false;udInkSchedule(ink,true)}
  if(!settled&&ink.rebaseJob?.exact)udInkCancelRebase(ink);
  if(ink.cameraZ!==z){udInkCancelRebase(ink);ink.cameraZ=z;ink.zooming=!settled}
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
  }else if(!ink.zooming&&!ink.rebase&&ink.staticList?.length>=1000&&udInkEdge(ink.ref,z,state.boardPanX||0,state.boardPanY||0)<180&&udInkPrepareRebase(ink,z,state.boardPanX||0,state.boardPanY||0)){
    // A complete prepared image will be committed only if still current.
  }else if(!ink.zooming&&!ink.rebase&&udInkEdge(ink.ref,z,state.boardPanX||0,state.boardPanY||0)<UD_INK_PREPARE){
    // Prepare the newly exposed edge while the current complete bitmap still
    // covers the viewport. Ordinary pointer events never wait for a full draw.
    ink.rebase=true;udInkSchedule(ink,true);
  }
  if(settled&&!ink.rebase&&!ink.zooming&&ink.staticList?.length>=1000)udInkExactRefresh(ink);
}
function udInkClearLive(ink){
  clearTimeout(ink.liveTimer);ink.liveTimer=0;
  if(ink.liveNodes.size){for(const node of ink.liveNodes)udInkDamage(ink,ink.entries.get(node));ink.liveNodes.clear()}
}
function udInkSelectionPaths(stage,nodes){const ink=stage?._udInk;if(!ink)return;udInkClearLive(ink);ink.listDirty=true;
  for(const node of nodes){udInkDamage(ink,ink.entries.get(node));ink.dirtyNodes.add(node);
    if(node.parentNode===ink.layer&&!node.classList.contains('boardStringShadow')){const bounds=udInkBounds(node.getAttribute('d')||'');if(bounds)udInkDamage(ink,{bounds,boxes:udInkBoxes(bounds,node.classList.contains('boardStringArrow')),w:parseFloat(node.style.getPropertyValue('--sw'))||2.4,motion:node.classList.contains('boardStringMotion')})}
  }
}
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
      ink.liveNodes.add(node);udInkDamage(ink,old);
    }
  }
}
function udInkFinishPaths(stage){
  const ink=stage?._udInk;if(!ink)return;
  if(ink.liveNodes.size>256)udInkClearLive(ink);
  if(ink.liveNodes.size&&ink.dirtyNodes.size){
    clearTimeout(ink.liveTimer);ink.liveTimer=setTimeout(()=>{ink.liveTimer=0;udInkClearLive(ink);udInkSchedule(ink,true)},300);
  }
  if(ink.listDirty||ink.dirtyNodes.size||ink.staticDirty||ink.damage.length)udInkSchedule(ink,true);
}
