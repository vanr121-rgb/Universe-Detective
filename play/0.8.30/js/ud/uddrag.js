// Temporary positions for shared Detective boards. Saved positions still use
// the regular edit/undo path, once on pointer release.
'use strict';
const UD_DRAG_INTERVAL=65,UD_DRAG_TIMEOUT=1100,UD_DRAG_LIMIT=64;
const udDragPreviews=new Map(),udPaperLeases=new Map(),udPaperGestureMarks=new Map();
let udPaperGestureNumber=0;
let udDragFrame=0,udDragExpiry=0,udDragScene=null;

function udDragSend(d,done=false){
  if(window.UG_ONLINE_PLAYER){
    if(onp.state!=='in'||onp.copy||onp.me?.role!=='player'||d.previewSession!==onp.ws)return;
  }else if(!onh.open||!onh.ready||!onh.conns.size||d.previewSession!==onh.session)return;
  const moving=d.kind==='paper'?[d.id]:d.ids;
  const cards=done?[]:moving.filter(id=>!d.layout.positions.get(id)?.fixed).slice(0,UD_DRAG_LIMIT).map(id=>{
    const {x,y}=d.layout.positions.get(id);
    return [id,Math.round(x),Math.round(y)];
  });
  const m={t:'boardDrag',scope:d.previewScope,cards};
  if(!done){
    const signature=JSON.stringify(cards),now=performance.now();
    if(signature===d.previewLast&&now-d.previewSentAt<350)return;
    d.previewLast=signature;
    d.previewSentAt=now;
  }
  if(d.kind==='paper')Object.assign(m,{paper:d.id,gesture:d.gesture,frame:++d.previewFrame});
  if(window.UG_ONLINE_PLAYER){
    // An overloaded connection can drop a preview. Keep the release message.
    if(done||onp.ws.bufferedAmount<32768)onpSend(m);
  }else if(typeof udInZone==='function')udInZone(currentWorkspace().id,()=>udDragRelay('gm',m));else udDragRelay('gm',m);
}

function udDragStart(d){
  if(window.UG_ONLINE_PLAYER?worldReadOnly():!onh.open||!onh.ready)return;
  d.previewScope=boardKey();
  if(d.kind==='paper'){d.gesture=++udPaperGestureNumber;d.previewFrame=0}
  d.previewSession=window.UG_ONLINE_PLAYER?onp.ws:onh.session;
  udDragSend(d);
  d.previewTimer=setInterval(()=>{
    if(state.boardDrag!==d||d.invalidated||boardKey()!==d.previewScope||worldReadOnly())udDragEnd(d);
    else udDragSend(d);
  },UD_DRAG_INTERVAL);
}

function udDragEnd(d){
  if(!d.previewTimer)return;
  clearInterval(d.previewTimer);
  d.previewTimer=0;
  udDragSend(d,true);
  udDragSchedule();
}

function udDragRelay(actor,m){
  if(!Array.isArray(m.cards)||m.cards.length>UD_DRAG_LIMIT||typeof m.scope!=='string')return;
  const ws=onhWorld();
  if(!ws||(actor==='gm'&&currentWorkspace()?.id!==ws.id))return;
  if(actor!=='gm'){
    const sender=onh.conns.get(actor);
    if(sender?.state!=='in'||partGet(sender.partId)?.role!=='player')return;
  }
  // Rebuild the allowlist only when the shared world changes. Use the same
  // projection as normal updates so hidden cards never appear in previews.
  onhSnapText();
  const visible=onh.dragVisible;
  const scope=visible.get(m.scope);
  if(!scope||scope.hint)return;
  if(typeof m.paper==='string'){udRelayPaperDrag(actor,m);return}
  if(onh.paperBoards?.[m.scope]?.placements)return;
  const cards=[];
  for(const item of m.cards){
    if(!Array.isArray(item)||item.length!==3)continue;
    const [id,x,y]=item,e=visible.get(id);
    if(!e||(actor!=='gm'&&e.hint)||e.board?.fixed?.[m.scope]||e.board?.lock)continue;
    if(![x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000000))continue;
    cards.push([id,Math.round(x),Math.round(y)]);
  }
  // The durable update must precede release, including the Master's debounce.
  if(!m.cards.length&&onh.timer)onhBroadcast();
  const preview={t:'boardDrag',workspace:onh.wsId,actor,scope:m.scope,cards};
  const not=[...onh.conns].filter(([c,p])=>c===actor||p.state!=='in'||(p.workspace||onh.wsId)!==onh.wsId).map(([c])=>c);
  onhOut({t:'bcast',d:JSON.stringify(preview),not});
  if(actor!=='gm'&&currentWorkspace()?.id===ws.id)udDragTake(preview);
}

function udDragTake(m){
  if(typeof m.actor!=='string'||!Array.isArray(m.cards))return;
  if(m.scope!==boardKey()){udDragPreviews.delete(m.actor);udDragSchedule();return}
  const previous=udDragPreviews.get(m.actor);
  if(m.cards.length)udDragPreviews.set(m.actor,{scope:m.scope,paper:m.paper,cards:m.cards,expires:performance.now()+UD_DRAG_TIMEOUT});
  else{
    udDragPreviews.delete(m.actor);
    if(previous?.paper&&state.boardDrag?.kind!=='paper')renderDetective();
  }
  udDragSchedule();
}

function udDragClear(actor){
  if(actor===undefined){udDragPreviews.clear();udPaperLeases.clear();udPaperGestureMarks.clear()}
  else{
    udDragPreviews.delete(actor);
    udPaperGestureMarks.delete(actor);
    for(const [key,lease] of udPaperLeases)if(lease.actor===actor)udPaperLeases.delete(key);
  }
  udDragSchedule();
}

function udDragSchedule(){
  clearTimeout(udDragExpiry);
  if(!udDragFrame&&(udDragPreviews.size||udDragScene))udDragFrame=requestAnimationFrame(udDragPaint);
}

function udDragPaint(now){
  udDragFrame=0;
  let expiredPaper=false;
  for(const [actor,preview] of udDragPreviews){
    if(preview.scope!==boardKey()||preview.expires<=now){
      expiredPaper||=!!preview.paper;
      udDragPreviews.delete(actor);
    }
  }
  if(state.boardDrag?.moved&&['card','paper'].includes(state.boardDrag.kind))return;
  if(expiredPaper)renderDetective();
  const stage=$('#detectiveView .boardStage');
  if(!stage||(!udDragScene&&!udDragPreviews.size)){udDragScene=null;return}
  if(udDragScene?.stage!==stage){
    if(!udDragPreviews.size){udDragScene=null;return}
    const layout=boardLayout();
    udDragScene={stage,layout,base:new Map([...layout.positions].map(([id,{x,y}])=>[id,{x,y}])),last:now-16};
  }
  const scene=udDragScene,targets=new Map();
  for(const preview of udDragPreviews.values()){
    for(const [id,x,y] of preview.cards){
      const p=scene.layout.positions.get(id);
      if(p&&!p.fixed&&(!preview.paper||scene.layout.keys?.has(preview.paper)))targets.set(id,{x,y});
    }
  }
  // Locked descendants follow their parent, as in a local drag.
  const targetFor=(id,remaining)=>{
    const target=targets.get(id),base=scene.base.get(id);
    const parent=scene.layout.keys?.get(id)?.parentId||scene.layout.positions.get(id)?.fixedParent;
    if(target||!parent||!remaining)return target||base;
    const origin=scene.base.get(parent),next=targetFor(parent,remaining-1);
    return {x:base.x+next.x-origin.x,y:base.y+next.y-origin.y};
  };
  const blend=matchMedia('(prefers-reduced-motion: reduce)').matches?1:1-Math.exp(-Math.min(100,now-scene.last)/42);
  scene.last=now;
  const moved=new Set();
  for(const [id,p] of scene.layout.positions){
    const goal=targetFor(id,50);
    if(p.x===goal.x&&p.y===goal.y)continue;
    p.x=Math.abs(goal.x-p.x)<.2?goal.x:p.x+(goal.x-p.x)*blend;
    p.y=Math.abs(goal.y-p.y)<.2?goal.y:p.y+(goal.y-p.y)*blend;
    moved.add(id);
  }
  if(moved.size)boardMoveCards(scene.layout,moved);
  if(moved.size){udDragSchedule();return}
  if(!udDragPreviews.size){udDragScene=null;return}
  // A stationary pointer needs expiry handling, but no animation frames.
  const expires=Math.min(...[...udDragPreviews.values()].map(preview=>preview.expires));
  udDragExpiry=setTimeout(udDragSchedule,Math.max(0,expires-now));
}

function udRelayPaperDrag(actor,m){
  const {gesture,frame,scope,paper}=m;
  if(!Number.isSafeInteger(gesture)||gesture<1||!Number.isSafeInteger(frame)||frame<1)return;
  if(actor!=='gm'&&onh.conns.get(actor)?.papers!==1)return;
  const aliasKey=JSON.stringify([scope,paper]);
  const realId=onh.paperBindings?.get(aliasKey)||paper;
  const key=JSON.stringify([scope,realId]),now=performance.now();
  for(const [key,lease] of udPaperLeases)if(lease.expires<=now)udPaperLeases.delete(key);
  const previous=udPaperGestureMarks.get(actor);
  if(previous&&(gesture<previous.gesture||gesture===previous.gesture&&
    (previous.done||frame<=previous.frame||key!==previous.key)))return;
  const done=m.cards.length===0,lease=udPaperLeases.get(key);
  const placement=onh.paperBoards?.[scope]?.placements?.items.find(p=>p.id===paper);
  if(done){
    if(!lease||lease.actor!==actor||lease.gesture!==gesture)return;
    udPaperLeases.delete(key);
    if(onh.timer)onhBroadcast();
  }else{
    const card=m.cards[0];
    if(!placement||placement.locked||lease&&lease.actor!==actor||m.cards.length!==1||
       !Array.isArray(card)||card.length!==3||card[0]!==paper||!udCoordinate(card[1])||!udCoordinate(card[2]))return;
    if(previous?.key!==key&&udPaperLeases.get(previous?.key)?.actor===actor)udPaperLeases.delete(previous.key);
    udPaperLeases.set(key,{actor,gesture,expires:now+UD_DRAG_TIMEOUT});
  }
  udPaperGestureMarks.set(actor,{gesture,frame,done,key});
  const preview={t:'boardDrag',actor,scope,paper,cards:done?[]:[[paper,Math.round(m.cards[0][1]),Math.round(m.cards[0][2])]]};
  const not=[...onh.conns].filter(([c,p])=>c===actor||p.state!=='in'||(p.workspace||onh.wsId)!==onh.wsId||p.papers!==1).map(([c])=>c);
  onhOut({t:'bcast',d:JSON.stringify(preview),not});
  if(actor!=='gm'&&currentWorkspace()?.id===onh.wsId){
    const localPreview=viewAsPlayer()?preview:{...preview,paper:realId,cards:preview.cards.map(([,x,y])=>[realId,x,y])};
    udDragTake(localPreview);
  }
}
