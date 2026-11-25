// A bounded, compositor-friendly plate for the ordinary overview papers.
// All photos, labels and paper elements remain genuine DOM; no fake hit map.
'use strict';
let udCardPlateEnabled=true;
// 4.5 Mi pixels covers the ordinary 1600x950 fit-to-zoom gesture on both
// Chromium and native Windows without crossing the promotion boundary. The
// independent side and area caps still prevent sparse-world giant textures.
const UD_PLATE_PIXELS=4.5*1024*1024,UD_PLATE_SIDE=3072;
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
  const plate=stage?._udCardPlate;if(!plate)return;plate.dirty=true;udPlateCamera(stage,state.boardZoom||1);
}
function udPlateChanged(stage,cards){
  const plate=stage?._udCardPlate;if(!plate)return;
  for(const card of cards)plate.changed.add(card);
  udPlateCamera(stage,state.boardZoom||1);
}
function udPlateMoved(stage,card){
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
