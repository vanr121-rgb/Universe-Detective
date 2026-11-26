// A bounded, compositor-friendly plate for the ordinary overview papers.
// All photos, labels and paper elements remain genuine DOM; no fake hit map.
'use strict';
let udCardPlateEnabled=true;
// 4.5 Mi pixels covers the ordinary 1600x950 fit-to-zoom gesture on both
// Chromium and native Windows without crossing the promotion boundary. The
// independent side and area caps still prevent sparse-world giant textures.
const UD_PLATE_PIXELS=4.5*1024*1024,UD_PLATE_SIDE=3072;
const UD_CULL_MARGIN=200;
function udPlateDpr(){return (devicePixelRatio||1)*(Number(document.documentElement.style.getPropertyValue('--zf'))||1)}
function udPlateFits(bounds,z,dpr=1){
  if(!bounds||!(z>0))return false;
  const w=Math.ceil((bounds.maxX-bounds.minX)*z*dpr),h=Math.ceil((bounds.maxY-bounds.minY)*z*dpr);
  return w>0&&h>0&&w<=UD_PLATE_SIDE&&h<=UD_PLATE_SIDE&&w*h<=UD_PLATE_PIXELS;
}
function udPlateBox(x,y,w,h){
  if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
  // Rotation is at most 3.5 degrees; reserve additional room for folder tabs,
  // outlines, locks and the nesting hint.
  const pad=Math.max(64,Math.ceil(Math.max(w,h)*.09));
  return {minX:x-w/2-pad,maxX:x+w/2+pad,minY:y-12-pad,maxY:y+h+pad};
}
function udPlateContains(a,b){return !!a&&!!b&&a.minX<=b.minX&&a.maxX>=b.maxX&&a.minY<=b.minY&&a.maxY>=b.maxY}
// Near zoom: exclude only cards safely outside an expanded viewport. Keep
// actual DOM and dimensions intact, so route geometry, selection, locks,
// nesting and the photo observer still see the same scene.
function udCullRect(width,height,z,x,y,margin=UD_CULL_MARGIN){return {minX:(-width/2-margin-x)/z,minY:(-height/2-margin-y)/z,maxX:(width/2+margin-x)/z,maxY:(height/2+margin-y)/z}}
function udCullOutside(box,clip){return !!box&&(box.maxX<clip.minX||box.minX>clip.maxX||box.maxY<clip.minY||box.minY>clip.maxY)}
function udCullRecord(card,w,h){return {w,h,box:udPlateBox(parseFloat(card.style.left),parseFloat(card.style.top),w,h),keep:card.matches('.selected,.udOpen,.dragging,.resizing,.nestTarget,.nestArming')}}
function udCullShow(card){card.classList.remove('udCardOffscreen');card.style.removeProperty('--ud-cull-w');card.style.removeProperty('--ud-cull-h')}
function udCullHide(card,r){card.style.setProperty('--ud-cull-w',r.w+'px');card.style.setProperty('--ud-cull-h',r.h+'px');card.classList.add('udCardOffscreen')}
function udCullDispose(stage){
  const c=stage?._udCardCull;if(!c)return;
  cancelAnimationFrame(c.raf);c.observer?.disconnect();c.viewObserver?.disconnect();
  for(const card of c.hidden)udCullShow(card);delete stage._udCardCull;
}
function udCullApply(c,z){
  if(c.stage._udCardCull!==c||!c.stage.isConnected||!c.width||!c.height)return;
  const clip=udCullRect(c.width,c.height,z,state.boardPanX||0,state.boardPanY||0),active=document.activeElement?.closest?.('.boardCard');
  for(const [card,r] of c.records){
    const hidden=!r.keep&&card!==active&&udCullOutside(r.box,clip);
    if(hidden!==c.hidden.has(card)){if(hidden){udCullHide(card,r);c.hidden.add(card)}else{udCullShow(card);c.hidden.delete(card)}c.metrics.toggles++}
  }
  c.metrics.visible=c.records.size-c.hidden.size;
}
function udCullSchedule(c){
  if(c.raf)return;c.raf=requestAnimationFrame(()=>{c.raf=0;if(!c.stage.isConnected||c.stage._udCardCull!==c)return;
    if((state.boardZoom||1)<.5){udCullDispose(c.stage);return}
    if(c.dirty){
      const cards=new Set(c.stage._boardSelection?.cards.values()||c.stage.querySelectorAll('.boardCard'));
      for(const card of c.records.keys())if(!cards.has(card)){c.observer?.unobserve(card);c.records.delete(card);c.hidden.delete(card)}
      for(const card of cards){if(!c.records.has(card))c.observer?.observe(card);if(!c.hidden.has(card))c.records.set(card,udCullRecord(card,card.offsetWidth,card.offsetHeight))}
      c.width=c.view.clientWidth;c.height=c.view.clientHeight;c.dirty=false;c.metrics.measures++;
    }
    udCullApply(c,state.boardZoom||1);
  });
}
function udCullCamera(stage,z){
  if(!stage)return;const view=stage.parentElement;
  if(z<.5||!view?.classList.contains('bBig')||state.visualStyle!=='classic'){udCullDispose(stage);return}
  let c=stage._udCardCull;
  if(!c){c=stage._udCardCull={stage,view,records:new Map(),hidden:new Set(),dirty:true,raf:0,width:0,height:0,metrics:{measures:0,toggles:0,visible:0}};
    if(typeof ResizeObserver==='function'){
      c.observer=new ResizeObserver(entries=>{if(stage._udCardCull!==c)return;let changed=false;for(const e of entries){const old=c.records.get(e.target);if(!old)continue;const w=e.target.offsetWidth,h=e.target.offsetHeight;if(w!==old.w||h!==old.h){c.records.set(e.target,udCullRecord(e.target,w,h));changed=true}}if(changed)udCullSchedule(c)});
      c.viewObserver=new ResizeObserver(()=>{if(stage._udCardCull!==c)return;c.width=view.clientWidth;c.height=view.clientHeight;udCullSchedule(c)});c.viewObserver.observe(view);
    }
  }
  if(c.dirty)udCullSchedule(c);else udCullApply(c,z);
}
function udCullDirty(stage,changed=null){const c=stage?._udCardCull;if(c){
  // Geometry-affecting detail changes need real dimensions. A selection
  // swaps only its own card nodes; do not awaken all unrelated offscreen DOM.
  if(!changed){for(const card of c.hidden)udCullShow(card);c.hidden.clear()}
  c.dirty=true;udCullSchedule(c)
}}
function udCullMoved(stage,card){const c=stage?._udCardCull,r=c?.records.get(card);if(!r)return;
  c.records.set(card,udCullRecord(card,r.w,r.h));if(c.hidden.delete(card))udCullShow(card);udCullSchedule(c);
}
function udPlateParent(stage,card){return stage._udCardPlate&&!card.matches('.selected,.udOpen')?stage._udCardPlate.world:stage}
function udPlateOwns(stage,card){return !!card&&(card.parentElement===stage||card.parentElement===stage._udCardPlate?.world)}
function udPlateInit(stage){
  const element=stage.querySelector(':scope > .udCardPlate');if(!element)return;
  const plate=stage._udCardPlate={element,world:element.firstElementChild,stage,bounds:null,sizes:new WeakMap(),changed:new Set(),dirty:true,raf:0,active:false,focus:false,metrics:{measures:0,mounts:0,drops:0,pixels:0}};
  const focus=()=>{
    if(!stage.isConnected)return;
    plate.focus=plate.world.contains(document.activeElement);
    if(plate.focus)udPlateDrop(plate);else udPlateSchedule(plate);
  };
  stage.addEventListener('focusin',focus);
  stage.addEventListener('focusout',()=>queueMicrotask(focus));
}
function udPlateDrop(plate,reason='inactive'){
  if(!plate.active)return;
  plate.element.classList.remove('udCardPlateActive');
  plate.active=false;plate.metrics.drops++;plate.metrics.lastDrop=reason;
}
function udPlateDispose(stage){
  const plate=stage?._udCardPlate;if(!plate)return;
  cancelAnimationFrame(plate.raf);plate.raf=0;udPlateDrop(plate);
}
function udPlateEligible(plate,z){
  const view=plate.stage.parentElement;
  if(plate.dragSuspended&&!state.boardDrag)plate.dragSuspended=false;
  return udCardPlateEnabled&&plate.stage.isConnected&&view?.classList.contains('bBig')&&view.classList.contains('bFar')&&state.visualStyle==='classic'&&z<.5&&!plate.focus&&!plate.dragSuspended;
}
function udPlateMeasure(plate,z){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  // Read a batch of already laid-out boxes. Selected/open papers are included
  // in the bounds too, so moving them back into the plate is not a rebase.
  for(const card of plate.stage._boardSelection.cards.values()){
    const w=card.offsetWidth,h=card.offsetHeight;plate.sizes.set(card,{w,h});
    const b=udPlateBox(parseFloat(card.style.left),parseFloat(card.style.top),w,h);if(!b)return null;
    minX=Math.min(minX,b.minX);minY=Math.min(minY,b.minY);maxX=Math.max(maxX,b.maxX);maxY=Math.max(maxY,b.maxY);
  }
  if(!Number.isFinite(minX))return null;
  // Reserve a little room for changes and effects, without ever promoting the
  // sparse world as a giant texture.
  const pad=Math.max(320,24/z);
  return {minX:minX-pad,minY:minY-pad,maxX:maxX+pad,maxY:maxY+pad};
}
function udPlateSchedule(plate){
  if(plate.raf)return;
  plate.raf=requestAnimationFrame(()=>{
    plate.raf=0;const z=state.boardZoom||1;
    if(!udPlateEligible(plate,z)){udPlateDrop(plate);return}
    if(!plate.dirty&&plate.changed.size){
      for(const card of plate.changed){
        if(!udPlateOwns(plate.stage,card))continue;
        const w=card.offsetWidth,h=card.offsetHeight;plate.sizes.set(card,{w,h});
        if(!udPlateContains(plate.bounds,udPlateBox(parseFloat(card.style.left),parseFloat(card.style.top),w,h)))plate.dirty=true;
      }
      plate.changed.clear();
    }
    if(plate.dirty||!plate.bounds){
      const b=udPlateMeasure(plate,z);plate.metrics.measures++;
      // Existing coverage may still fit after a few paper/label changes.
      const same=plate.active&&udPlateContains(plate.bounds,b);
      if(!same){udPlateDrop(plate);plate.bounds=b}
      plate.dirty=false;plate.changed.clear();
    }
    if(plate.active)return;
    if(!udPlateFits(plate.bounds,z,udPlateDpr()))return;
    const b=plate.bounds,w=Math.ceil((b.maxX-b.minX)*z),h=Math.ceil((b.maxY-b.minY)*z);
    plate.element.style.cssText='left:'+b.minX+'px;top:'+b.minY+'px;width:'+w+'px;height:'+h+'px;transform:scale('+1/z+')';
    plate.world.style.transform='scale('+z+') translate('+(-b.minX)+'px,'+(-b.minY)+'px)';
    plate.refZ=z;plate.element.classList.add('udCardPlateActive');plate.active=true;
    plate.metrics.mounts++;plate.metrics.pixels=w*h;
  });
}
function udPlateCamera(stage,z){
  const plate=stage?._udCardPlate;if(!plate)return;
  if(!udPlateEligible(plate,z)){udPlateDrop(plate);return}
  const dpr=udPlateDpr();
  if(plate.active&&(!udPlateFits(plate.bounds,z,dpr)||!udPlateFits(plate.bounds,plate.refZ,dpr)))udPlateDrop(plate,'budget');
  if(plate.dirty||plate.changed.size||!plate.active&&(!plate.bounds||udPlateFits(plate.bounds,z,dpr)))udPlateSchedule(plate);
}
function udPlateDirty(stage){
  udCullDirty(stage);
  const plate=stage?._udCardPlate;if(!plate)return;plate.dirty=true;udPlateCamera(stage,state.boardZoom||1);
}
function udPlateChanged(stage,cards){
  udCullDirty(stage,cards);
  const plate=stage?._udCardPlate;if(!plate)return;
  for(const card of cards)plate.changed.add(card);
  udPlateCamera(stage,state.boardZoom||1);
}
function udPlateMoved(stage,card){
  udCullMoved(stage,card);
  const plate=stage?._udCardPlate;if(!plate||!plate.active||card.parentElement!==plate.world)return;
  if(card.matches('.dragging,.resizing')){plate.dragSuspended=true;udPlateDrop(plate);return}
  const size=plate.sizes.get(card),b=size&&udPlateBox(parseFloat(card.style.left),parseFloat(card.style.top),size.w,size.h);
  if(!udPlateContains(plate.bounds,b)){udPlateDrop(plate);udPlateDirty(stage)}
}
if(typeof window!=='undefined')window.addEventListener('resize',()=>{
  const stage=document.querySelector('#detectiveView .boardStage');if(!stage)return;
  const z=state.boardZoom||1;udPlateCamera(stage,z);
  if(typeof udSyncBoardPhotos==='function')udSyncBoardPhotos(stage,z);
});
