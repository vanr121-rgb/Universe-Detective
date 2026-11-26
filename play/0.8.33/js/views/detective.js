// Universe Graph — Detective: детективная доска (0.17.5).
// Записи текущего пространства — бумажки, приколотые кнопками к доске; связи — нитки между кнопками.
// Положение бумажки хранится в самой записи (e.board = {x,y}), поэтому перестановка попадает
// в Ctrl+Z, в экспорт и в слияние вкладок. Пока бумажку не двигали, её место берётся из Graph.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';

const BOARD_ZOOM_MIN=.04,BOARD_ZOOM_MAX=2.5; // 0.23.8: was .25 — a board of 1000 cards did not fit and showed nothing
const BOARD_CARD_W={case:270,folder:224,photo:196,note:176,card:208};
const BOARD_CARD_H=168; // примерная высота бумажки — только для раскладки без наложений
const BOARD_RED='#c62f2f';
const BOARD_SURFACE_TILES=[[23,19],[17,29],[37,31],[41,43],[71,53],[59,83]];
const BOARD_SURFACE_PAD=192;
const BOARD_NEST_DWELL=400; // 0.23.6: how long a card is held over another before it goes inside (0.23.8: 700 → 400 ms, a filling ring shows it)
let boardRenderedKey=null,boardRenderedWorkspace=null,boardQueuedCamera=null,boardPanTicket=null;
let boardThreadFocusKey=null;
// Installed by the pointer bindings; workspace transitions use the same cancel path as Escape.
let boardCancelDrag=null;

function boardCameraKey(){const key=[state.workspaceId,state.scopeId],context=typeof udContainerContext==='function'?udContainerContext():null;if(context)key.push(context.paperId);return JSON.stringify(key)}
function boardSetThreadFocus(active){
  state.space=active;
  boardThreadFocusKey=active?boardCameraKey():null;
  const view=$('#detectiveView');
  view?.classList.toggle('boardThreadFocus',active);
  if(view){const stage=view.querySelector('.boardStage');if(active)view.style.setProperty('--thread-caption-scale',Math.max(1,.8/(state.boardZoom||1)).toFixed(2));boardSyncCaptions(stage,active||!(view._boardDetailZoom<.5));if(typeof udInkCamera==='function')udInkCamera(view,stage,state.boardZoom||1)}
}
function boardCancelQueuedPan(){if(boardPanTicket)cancelAnimationFrame(boardPanTicket.raf);boardPanTicket=null}
function boardCancelQueuedCamera(){boardQueuedCamera=null;boardCancelQueuedPan()}
// Pointer events may arrive faster than display frames. Keep their logical
// position immediately, but never run the entire renderer for each event.
function boardSchedulePanTransform(view,key){
  if(boardPanTicket)return;
  const ticket={view,key,stage:view.querySelector('.boardStage'),raf:0};boardPanTicket=ticket;
  ticket.raf=requestAnimationFrame(()=>{if(boardPanTicket!==ticket)return;boardPanTicket=null;
    if(state.visualMode==='detective'&&key===boardCameraKey()&&ticket.stage===view.querySelector('.boardStage'))applyBoardTransform();
  });
}
function boardFlushPanTransform(){
  const ticket=boardPanTicket;if(!ticket)return;boardCancelQueuedPan();
  if(state.visualMode==='detective'&&ticket.key===boardCameraKey()&&ticket.stage===ticket.view.querySelector('.boardStage'))applyBoardTransform();
}
function boardQueueCamera(action,{focus=false}={}){
  const key=boardCameraKey();
  if(boardQueuedCamera?.key!==key){
    const ticket={key};
    boardQueuedCamera=ticket;
    requestAnimationFrame(()=>{
      if(boardQueuedCamera!==ticket)return;
      boardQueuedCamera=null;
      const drag=state.boardDrag;
      if(state.visualMode!=='detective'||boardCameraKey()!==key)return;
      if(drag&&(drag.kind!=='pan'||drag.boardKey===key))return;
      ticket.prepare?.();
      ticket.focus?.();
    });
  }
  if(focus)boardQueuedCamera.focus=action;
  else boardQueuedCamera.prepare=action;
}

function boardHash(s){let h=2166136261;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
// Небольшой наклон бумажки: у каждой записи свой и не меняется между запусками.
function boardTilt(id){return ((boardHash(id)%700)/100-3.5)}
// 0.23.6: a record has its own place on each board (e.board.at[scope]); the old single place (e.board.x/y) is the fallback.
function boardKey(){const ws=currentWorkspace();return (typeof udUsesSharedLayout==='function'&&udUsesSharedLayout(ws)?ws.rootId:null)||(typeof udContainerContext==='function'?udContainerContext():null)?.sourceScope||state.scopeId||''}
function boardPlace(e,key=boardKey()){const at=e?.board?.at?.[key];if(at&&Number.isFinite(Number(at.x))&&Number.isFinite(Number(at.y)))return {x:Number(at.x),y:Number(at.y)};if(e?.board&&Number.isFinite(Number(e.board.x))&&Number.isFinite(Number(e.board.y)))return {x:Number(e.board.x),y:Number(e.board.y)};return null}
function boardHasPlace(e){return !!boardPlace(e)}
// The main lock is in coordinates relative to the real containing card. An
// extra placement on another board may have its own lock in board coordinates.
function boardFixed(e,key=boardKey()){
  const extra=e?.board?.fixed?.[key];
  if(extra)return {lock:extra,auxiliary:true};
  const lock=e?.board?.lock;
  if(!lock)return null;
  if(e.id===key)return {lock,root:true};
  const parent=containmentParent(e.id);
  if(parent===lock.parent&&(parent===key||!parent&&key===currentRootId()||isDescendantOfBoard(e.id,key)))return {lock};
  return null;
}
function isDescendantOfBoard(id,key){
  const seen=new Set();
  for(let parent=containmentParent(id);parent&&!seen.has(parent);parent=containmentParent(parent)){
    if(parent===key)return true;
    seen.add(parent);
  }
  return false;
}
function boardLayoutFixed(e,key,v,localIds){
  const extra=e.board?.fixed?.[key];
  if(extra)return {lock:extra,auxiliary:true};
  const lock=e.board?.lock;
  if(!lock||lock.parent!==containmentParent(e.id))return null;
  if(e.id===key)return {lock,root:true};
  return localIds.has(e.id)||v?.parent===lock.parent&&!v.related?{lock}:null;
}
function boardRebaseFixed(child,parentId){
  const lock=child?.board?.lock;
  if(!lock||lock.parent===parentId)return;
  const layout=boardLayout(),p=layout.positions.get(child.id),parent=layout.positions.get(parentId||currentRootId());
  if(p&&parent&&p!==parent){lock.x=Math.round(p.x-parent.x);lock.y=Math.round(p.y-parent.y)}
  lock.parent=parentId||null;
}
function boardCanToggleFixed(e){return !!e&&!worldReadOnly()&&(!e.hint||window.UG_ONLINE_PLAYER)}
function boardApplyFix(e,key,locked,place,{auxiliary,parent}){
  e.board=isRecord(e.board)?e.board:{};
  const {x,y,dx,dy,w,h}=place;
  const originalAutoHeight=!!(auxiliary?e.board.fixed?.[key]?.autoHeight:e.board.lock?.autoHeight);
  if(locked){
    if(auxiliary){
      e.board.fixed=isRecord(e.board.fixed)?e.board.fixed:{};
      e.board.fixed[key]={x,y,w,h,autoHeight:!boardSize(e,key)?.h};
    }else e.board.lock={parent,x:dx,y:dy,w,h,autoHeight:!boardSize(e,key)?.h};
  }else{
    if(auxiliary)delete e.board.fixed?.[key];
    else delete e.board.lock;
    e.board.at=isRecord(e.board.at)?e.board.at:{};
    // Auto-height lock is independent of photo presence. Preserve explicit user sizing.
    const previousWidth=e.board.at[key]?.w;
    e.board.at[key]=originalAutoHeight?{x,y,...(previousWidth?{w:previousWidth}:{})}:{x,y,w,h};
  }
}
function boardUsesAutoPhoto(e,key=boardKey()){
  return !!boardMainImage(e)&&!boardSize(e,key)?.h;
}
function boardCompactPhotoHeight(card,e,p,via){
  const stage=card?.parentElement;
  if(!stage)return 0;
  const template=document.createElement('template');
  template.innerHTML=boardCardHtml(e,p,via,{compact:true});
  const sample=template.content.firstElementChild;
  sample.style.visibility='hidden';
  stage.append(sample);
  try{return boardMeasureNear(card.closest('#detectiveView'),()=>sample.offsetHeight)}finally{sample.remove()}
}
function boardToggleFixed(id){
  const e=getEntity(id);
  if(!boardCanToggleFixed(e))return false;
  const key=boardKey(),layout=boardLayout(),p=layout.positions.get(id);
  if(!p)return false;
  const card=$(`#detectiveView [data-board-id="${CSS.escape(id)}"]`);
  const parent=containmentParent(id)||null,via=layout.via.get(id);
  const origin=layout.positions.get(parent||currentRootId());
  const auxiliary=p.fixed?!!p.fixed.auxiliary:id!==key&&!!(p.external||via?.pinned||via?.related||!origin);
  const compactHeight=!p.fixed&&!boardSize(e,key)?.h?boardCompactPhotoHeight(card,e,p,via):0;
  const place={x:p.x,y:p.y,dx:p.x-(origin?.x||0),dy:p.y-(origin?.y||0),
    w:clamp(p.fixed?.lock.w||card?.offsetWidth||p.w||BOARD_CARD_W[p.kind],BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w),
    h:clamp(p.fixed?.lock.h||compactHeight||card?.offsetHeight||p.h||BOARD_CARD_H,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h)};
  if(id===key){
    const stored=boardPlace(e,parent),anchor=boardPlace(getEntity(parent),parent);
    place.dx=parent?(stored?.x??(Number(e.style?.x)||0)*1.2)-(anchor?.x??(Number(getEntity(parent)?.style?.x)||0)*1.2):p.x;
    place.dy=parent?(stored?.y??(Number(e.style?.y)||0)*1.15)-(anchor?.y??(Number(getEntity(parent)?.style?.y)||0)*1.15):p.y;
  }
  if(window.UG_ONLINE_PLAYER)return onpFixCard({c:'e',op:'fix',id,scope:key,locked:!p.fixed,auxiliary,parent,place});
  return boardCommit(()=>boardApplyFix(e,key,!p.fixed,place,{auxiliary,parent}),
    p.fixed?'Бумажка откреплена':'Положение и размер закреплены');
}
function boardSetPlace(e,p,key=boardKey()){if(!e||boardFixed(e,key))return;e.board=isRecord(e.board)?e.board:{};e.board.at=isRecord(e.board.at)?e.board.at:{};const old=e.board.at[key];e.board.at[key]={x:Math.round(p.x),y:Math.round(p.y)};if(old?.w)e.board.at[key].w=old.w;if(old?.h)e.board.at[key].h=old.h}
// 0.23.8: a card's own size on this board (dragged by its corner); null — the usual size of its kind.
const BOARD_SIZE_MIN={w:110,h:50},BOARD_SIZE_MAX={w:640,h:800};
function boardSize(e,key=boardKey()){const at=e?.board?.at?.[key];if(!at)return null;const w=Number(at.w),h=Number(at.h);return Number.isFinite(w)||Number.isFinite(h)?{w:Number.isFinite(w)?w:null,h:Number.isFinite(h)?h:null}:null}
function boardSetSize(e,size,pos,key=boardKey()){if(!e||boardFixed(e,key))return;if(!boardPlace(e,key)||!e.board?.at?.[key])boardSetPlace(e,pos,key);const at=e.board.at[key];if(size&&size.w)at.w=Math.round(clamp(size.w,BOARD_SIZE_MIN.w,BOARD_SIZE_MAX.w));else delete at.w;if(size&&size.h)at.h=Math.round(clamp(size.h,BOARD_SIZE_MIN.h,BOARD_SIZE_MAX.h));else delete at.h}
function boardClearPlace(e,key=boardKey()){if(!boardFixed(e,key)&&e?.board?.at)delete e.board.at[key]}
// What lies on a board besides the records of the space: open «cases» (with or without related records) and pinned records.
// Kept in the workspace (ws.boards[scope]) — saved, undoable, travels with export.
const BOARD_EMPTY_STATE=()=>({open:{},rel:{},pins:[]});
const previewBoards=new Map();
function boardState(key=boardKey(),create=false){const ws=currentWorkspace();if(!ws)return BOARD_EMPTY_STATE();
  if(udUsesSharedLayout(ws)&&key!==ws.rootId){if(create)throw Error('Вложенная раскладка не является отдельной доской');return BOARD_EMPTY_STATE()}
  if(worldReadOnly()){
    const viewKey=JSON.stringify([ws.id,key]);
    if(!previewBoards.has(viewKey))previewBoards.set(viewKey,clone((viewAsPlayer()?playerPaperBoards:ws.boards)?.[key]||BOARD_EMPTY_STATE()));
    return previewBoards.get(viewKey);
  }if(!isRecord(ws.boards)){if(!create)return BOARD_EMPTY_STATE();ws.boards={}}let b=ws.boards[key];if(!isRecord(b)){if(!create)return BOARD_EMPTY_STATE();b=ws.boards[key]=BOARD_EMPTY_STATE()}b.open=isRecord(b.open)?b.open:{};b.rel=isRecord(b.rel)?b.rel:{};b.pins=Array.isArray(b.pins)?b.pins:[];return b}
// Normalization validates every value, but an unchanged owner board must keep
// its identity: drag/layout caches must not mistake a camera save for an edit.
function boardValuesEqual(a,b){
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&boardValuesEqual(a[k],b[k]));
}
function normalizeBoards(ws,ids){
  if(udUsesSharedLayout(ws)&&(ws.boards?.[ws.rootId]?.placements?.schema!==UD_PLACEMENT_SCHEMA||!Array.isArray(ws.boards[ws.rootId].placements.items)||!Array.isArray(ws.boards[ws.rootId].placements.routes)||Object.keys(ws.boards).some(scope=>scope!==ws.rootId))){
    // Preserve unknown/conflicting old data, never pick an arbitrary winner.
    delete ws.udLayoutMode;noteRepair('Общая раскладка не распознана; сохранены все отдельные доски');
  }
  if(ws.boards===undefined)return;
  if(!isRecord(ws.boards)){delete ws.boards;return}
  const relations=new Map((ws.relations||[]).map(r=>[r.id,r]));
  for(const [k,b] of Object.entries(ws.boards)){
    if(!ids.has(k)||!isRecord(b)){delete ws.boards[k];continue}
    const open={};
    for(const [id,m] of Object.entries(isRecord(b.open)?b.open:{}))if(ids.has(id)&&(m==='one'||m==='all'))open[id]=m;
    const rel={};
    for(const [id,v] of Object.entries(isRecord(b.rel)?b.rel:{}))if(ids.has(id)&&v)rel[id]=true;
    const pins=[...new Set((Array.isArray(b.pins)?b.pins:[]).map(String).filter(id=>ids.has(id)))];
    let placements=udNormalizePlacements(b.placements,ids,relations);
    if(placements&&boardValuesEqual(b.placements,placements))placements=b.placements;
    if(!Object.keys(open).length&&!Object.keys(rel).length&&!pins.length&&!placements)delete ws.boards[k];
    else ws.boards[k]={open,rel,pins,...(placements?{placements}:{})};
  }
  if(!Object.keys(ws.boards).length)delete ws.boards;
}
// 0.21: without a chosen main photo the first picture is used — but never the record's map (a map is not a portrait).
function boardMainImage(e){const list=entityMedia(e).filter(m=>/^image\//.test(m.mime||'image/'));const mapId=e?.map?.mediaId;return list.find(m=>m.main)||list.find(m=>m.id!==mapId)||null}
function boardCardKind(e,rootId){if(e.id===rootId)return 'case';if(isSpace(e))return 'folder';if(boardMainImage(e))return 'photo';if(!e.type)return 'note';return 'card'}

// Records on the board: the space's own, then the contents of open cases (one level or all of it, in order), the records
// related to an open case if asked, and pinned records. «via» tells where an added record came from (for its place and badge).
const BOARD_LIMIT=1000;
const BOARD_GRID_FROM=120,BOARD_BIG=250; // 0.23.8: from this many unplaced cards the board lays them out in a grid
function boardStripLike(ps){let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;for(const p of ps){a=Math.min(a,p.x);b=Math.max(b,p.x);c=Math.min(c,p.y);d=Math.max(d,p.y)}const w=b-a+240,h=d-c+BOARD_CARD_H;return w/h>8||h/w>8}
function boardCollect({forMigration=false,scope=boardKey()}={}){
  const bs=boardState(scope),root=getEntity(scope);
  const nodes=forMigration?[root,...scopeMembers(scope)].filter(Boolean):activeNodes().filter(Boolean);
  const seen=new Set(nodes.map(e=>e.id)),via=new Map(),subtree=new Map(),expanded=new Map(),queue=[];
  function add(e,info){
    if(!e||seen.has(e.id)||!forMigration&&(nodes.length>=BOARD_LIMIT||!visibleByFilters(e)))return false;
    seen.add(e.id);nodes.push(e);via.set(e.id,info);return true;
  }
  function enqueue(id,mode,depth,top){
    if(!mode||id===scope||expanded.has(id))return;
    expanded.set(id,mode);queue.push({id,mode,depth,top});
  }
  for(const e of nodes)enqueue(e.id,bs.open[e.id],0,e.id);
  for(let i=0;i<queue.length;i++){
    const q=queue[i],list=subtree.get(q.top)||[];
    subtree.set(q.top,list);
    for(const id of containmentChildren(q.id)){
      const added=add(getEntity(id),{parent:q.id,depth:q.depth+1,top:q.top});
      if(added)list.push(id);
      if(added||seen.has(id)&&bs.open[id])enqueue(id,bs.open[id]||(q.mode==='all'?'all':null),q.depth+1,q.top);
    }
  }
  for(const top of Object.keys(bs.rel)){
    if(!seen.has(top)||!bs.open[top])continue;
    const members=[top,...(subtree.get(top)||[])];
    for(const member of members)for(const r of data.relations){
      if(getRT(r.type).containment)continue;
      const other=r.from===member?r.to:r.to===member?r.from:null;
      if(other&&add(getEntity(other),{parent:member,related:true,top,depth:99}))(subtree.get(top)||[]).push(other);
    }
  }
  for(const id of bs.pins)add(getEntity(id),{pinned:true});
  if(forMigration)for(const e of data.entities){
    if(seen.has(e.id)||!e.board?.at?.[scope]&&!bs.open[e.id])continue;
    const branch=[],path=new Set();
    let child=e.id;
    while(child&&!seen.has(child)&&!path.has(child)){
      path.add(child);branch.push(child);child=containmentParent(child);
    }
    if(!child||!seen.has(child)||via.get(child)?.related)continue;
    for(const id of branch.reverse()){
      if(!add(getEntity(id),{parent:child}))break;
      child=id;
    }
  }
  return {nodes,via,subtree,expanded};
}
function boardNodes(){return udBoardUsesPlacements()?boardLayout().nodes:boardCollect().nodes}
// Нитки: обычные связи между бумажками. «Содержит» от самого дела не рисуется —
// всё на доске и так лежит в этом деле; вложенность между бумажками — тонкая серая скрепка-нитка.
// 0.23.8: «содержит» on any board — between every two cards where one lies in the other (the board's own record included);
// The «Содержит» switch hides every containment thread, including open cases.
function boardRelations(nodes,via){const show=state.boardContain!==false,big=nodes.length>=BOARD_BIG,rootId=state.scopeId;return activeRelations(nodes).filter(r=>{const rt=getRT(r.type);if(!rt.containment)return true;if(!show)return false;if(via?.get(r.to)?.parent===r.from)return true;if(r.udMembership&&r.from!==rootId)return false;return show&&!(big&&r.from===rootId)})}

// Раскладка: сохранённые места + места из Graph для остальных, раздвинутые так, чтобы бумажки не легли стопкой.
function boardLayout(options){
  if(!options?.forMigration&&udBoardUsesPlacements()){
    const board=boardState().placements;
    const drag=state.boardDrag;
    return udPlacementLayout(getEntity(state.scopeId),board,
      drag?.kind==='paper'&&drag.board===board&&!drag.invalidated?drag:null);
  }
  const {nodes,via,subtree,expanded}=boardCollect(options),rootId=options?.scope??state.scopeId,pos=new Map(),loose=[],localIds=new Set(scopeMembers(rootId).map(x=>x.id));localIds.add(rootId);
  const slot=new Map(); // parent → how many children already placed under it
  for(const e of nodes){
    const kind=boardCardKind(e,rootId),saved=boardPlace(e,rootId),v=via.get(e.id),external=!v&&!localIds.has(e.id);
    if(saved){pos.set(e.id,{x:saved.x,y:saved.y,kind,saved:true,external});continue}
    let p;
    // a record from an open case lies under its folder, in a row; a related one — to the right and below of its record
    if(v?.parent&&pos.has(v.parent)){const pp=pos.get(v.parent),i=slot.get(v.parent)||0,n=v.related?1:containmentChildren(v.parent).length;slot.set(v.parent,i+1);p=v.related?{x:pp.x+120+i*240,y:pp.y+BOARD_CARD_H+70,kind,saved:false}:{x:pp.x+(i-(n-1)/2)*240,y:pp.y+BOARD_CARD_H+70,kind,saved:false}}
    else if(v?.pinned){const xs=[...pos.values()].map(q=>q.x);p={x:(xs.length?Math.max(...xs):0)+300,y:(slot.get('__pins')||0)*(BOARD_CARD_H+30),kind,saved:false};slot.set('__pins',(slot.get('__pins')||0)+1)}
    else p={x:(Number(e.style?.x)||0)*1.2,y:(Number(e.style?.y)||0)*1.15,kind,saved:false,plain:e};
    p.external=external;pos.set(e.id,p);loose.push(p);
  }
  // 0.23.8: many cards without a board place, or Graph places in a long strip (an import, a fresh big world) — a compact grid
  // by type instead: Graph's places would make a board 170 000 px wide, and pushing hundreds of cards apart costs seconds.
  const plain=loose.filter(p=>p.plain);
  if(plain.length>=BOARD_GRID_FROM||(plain.length>8&&boardStripLike(plain))){
    const saved=[...pos.values()].filter(p=>!p.plain),sb=saved.length?boardBounds({positions:new Map(saved.map((p,i)=>[i,p]))}):null;
    plain.sort((a,b)=>String(getET(a.plain.type)?.name||'').localeCompare(String(getET(b.plain.type)?.name||''),'ru')||String(a.plain.name).localeCompare(String(b.plain.name),'ru'));
    const cols=Math.max(4,Math.ceil(Math.sqrt(plain.length*1.6))),x0=sb?sb.minX+120:-(cols-1)*120,y0=sb?sb.maxY+180:0;
    plain.forEach((p,i)=>{p.x=x0+(i%cols)*240;p.y=y0+Math.floor(i/cols)*(BOARD_CARD_H+40)});
    {const gone=new Set(plain);for(let i=loose.length-1;i>=0;i--)if(gone.has(loose[i]))loose.splice(i,1)}
  }
  for(const p of plain)delete p.plain;
  for(const e of nodes){const sz=boardSize(e,rootId),p=pos.get(e.id);if(sz&&p){if(sz.w)p.w=sz.w;if(sz.h)p.h=sz.h}}
  if(loose.length){
    const all=[...pos.values()],gapX=230,gapY=BOARD_CARD_H+30,looseSet=new Set(loose),idx=new Map(all.map((p,i)=>[p,i]));
    // 0.29 (аудит, находка 12): only cards in neighbouring cells can overlap — a grid of cells instead of «every card with every
    // card» (and «is it loose?» was a search through the whole list each time): 1000 cards cost seconds before.
    const cellOf=p=>Math.floor(p.x/gapX)+':'+Math.floor(p.y/gapY);
    for(let pass=0;pass<40;pass++){
      let moved=false;const grid=new Map();for(const p of all){const k=cellOf(p);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p)}
      for(const a of loose){
        const cx=Math.floor(a.x/gapX),cy=Math.floor(a.y/gapY),near=[];
        for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const c=grid.get((cx+i)+':'+(cy+j));if(c)near.push(...c)}
        near.sort((p,q)=>idx.get(p)-idx.get(q));
        for(const b of near){
          if(a===b)continue;const dx=a.x-b.x,dy=a.y-b.y;
          if(Math.abs(dx)<gapX&&Math.abs(dy)<gapY){
            const px=gapX-Math.abs(dx),py=gapY-Math.abs(dy);
            if(px<py){const s=dx===0?((boardHash(a.x+':'+a.y)&1)?1:-1):Math.sign(dx);a.x+=s*px*(b.saved||!looseSet.has(b)?1:.5)}
            else{const s=dy===0?1:Math.sign(dy);a.y+=s*py*(b.saved||!looseSet.has(b)?1:.5)}
            moved=true;
          }
        }
      }
      if(!moved)break;
    }
    for(const p of loose){p.x=Math.round(p.x);p.y=Math.round(p.y)}
  }
  // Apply locks after loose cards have been arranged. Resolve the parent
  // first, so locks compose through several levels of containment.
  const fixed=new Map(),resolved=new Set();
  for(const e of nodes){
    const item=boardLayoutFixed(e,rootId,via.get(e.id),localIds);
    if(item)fixed.set(e.id,item);
  }
  function placeFixed(id){
    if(resolved.has(id))return;
    const f=fixed.get(id),p=pos.get(id);
    if(!f||!p)return;
    resolved.add(id);
    const lock=f.lock,parentId=lock.parent||rootId;
    if(f.auxiliary||f.root&&!lock.parent){
      p.x=lock.x;p.y=lock.y;
    }else if(!f.root){
      placeFixed(parentId);
      const parent=pos.get(parentId);
      if(parent){p.x=parent.x+lock.x;p.y=parent.y+lock.y;p.fixedParent=parentId}
    }
    p.w=lock.w;p.h=lock.h;p.fixed=f;p.saved=true;
  }
  for(const id of fixed.keys())placeFixed(id);
  return {nodes,positions:pos,relations:options?.forMigration?[]:boardRelations(nodes,via),via,subtree,expanded};
}

// 0.23.5: «красная нить» берёт цвет нитки стиля (бечёвка в Medieval, лоза в Forest, неон в Sci-Fi…).
let boardRedCache={style:null,color:''};
function boardRedColor(){if(boardRedCache.style===state.visualStyle&&boardRedCache.color)return boardRedCache.color;const v=$('#detectiveView');const c=(v&&getComputedStyle(v).getPropertyValue('--board-red').trim())||BOARD_RED;boardRedCache={style:state.visualStyle,color:c};return c}
// The old sag and the parallel offsets still apply when custom curvature is zero.
function boardStringCtl(a,b,off=0,curve=0){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  const bend=off+Math.min(180,len*.30)*curve;
  return {x:(a.x+b.x)/2-dy/len*bend,y:(a.y+b.y)/2+Math.min(70,len*.11)+dx/len*bend};
}
function boardThreadPath(a,b,c){return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`}
function boardThreadArrow(a,b,c,size){
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<2)return '';
  // Leave the point outside the pin and keep short arrows within their thread.
  const t=1-Math.min(.22,11/length),p=pointOnQuad(a,c,b,t);
  const dx=(1-t)*(c.x-a.x)+t*(b.x-c.x),dy=(1-t)*(c.y-a.y)+t*(b.y-c.y);
  const angle=Math.atan2(dy,dx),n=Math.min(size,length*.3);
  const wing=offset=>`${(p.x-Math.cos(angle+offset)*n).toFixed(1)},${(p.y-Math.sin(angle+offset)*n).toFixed(1)}`;
  return `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${wing(.5)} L${wing(-.5)} Z`;
}

function boardStringSpecs(layout){
  const pairKey=r=>JSON.stringify(r.from<r.to?[r.from,r.to]:[r.to,r.from]);
  const keys=layout.relations.map(pairKey),counts=new Map(),slots=new Map(),specs=[];
  for(const key of keys)counts.set(key,(counts.get(key)||0)+1);
  layout.relations.forEach((r,index)=>{
    if(!layout.positions.get(r.from)||!layout.positions.get(r.to))return;
    const key=keys[index],n=counts.get(key),i=slots.get(key)||0;
    slots.set(key,i+1);
    const off=n>1?(i-(n-1)/2)*26*(r.from<r.to?1:-1):0;
    const contain=!!getRT(r.type).containment,st=contain?null:relationSvgStyle(r);
    specs.push({r,index,off,st,contain});
  });
  return specs;
}
function boardStringGeometry({r,off,st},positions){
  const a=positions.get(r.from),b=positions.get(r.to);
  if(!a||!b)return null;
  const curve=st?.curve||0,c=boardStringCtl(a,b,off,curve);
  const d=boardThreadPath(a,b,c),mid={x:(a.x+b.x)/4+c.x/2,y:(a.y+b.y)/4+c.y/2};
  const separation=st?.double?st.width+2:0;
  const paths=separation?[-separation,separation].map(s=>boardThreadPath(a,b,boardStringCtl(a,b,off+s,curve))):[d];
  const arrow=st?.arrow?boardThreadArrow(a,b,c,st.arrowSize):'';
  return {d,mid,paths,arrow};
}
function boardStringEntries(layout){
  return boardStringSpecs(layout).map(spec=>({...spec,...boardStringGeometry(spec,layout.positions)}));
}
function boardStringAppearance(){
  return [state.boardRed,state.selectedRelationId,[...state.selectedIds],state.focusedPath];
}
function boardStringSceneKey(layout,routes=JSON.stringify(layout.relations)){
  return JSON.stringify(boardStringAppearance())+routes;
}
function boardThreadSelection(r){
  const from=r.entityFrom||r.from,to=r.entityTo||r.to;
  const selected=r.id===state.selectedRelationId,active=selected||state.selectedIds.has(from)||state.selectedIds.has(to);
  const dim=state.focusedPath.length>0&&!(state.focusedPath.includes(from)&&state.focusedPath.includes(to));
  return {selected,active,dim};
}
function boardStringsSvg(layout){
  let lines='',hits='',labels='',topLines='',topHits='';
  const shadows=(layout.nodes?.length??layout.positions.size)<BOARD_BIG;
  for(const {r,index,d,mid,paths,arrow,st,contain} of boardStringEntries(layout)){
    const rt=getRT(r.type),from=r.entityFrom||r.from,to=r.entityTo||r.to;
    const {selected,active,dim}=boardThreadSelection(r);
    const masked=playerRelationMasked(r);
    const color=escapeHtml(safeCssValue(masked?rt.color:contain?'#8d8f93':state.boardRed?boardRedColor():st.color,BOARD_RED));
    const w=contain?1.4:st.width,ink=st?.opacity??1,tag=`data-board-thread="${index}"`;
    const flags=`${contain?' contain':''}${selected?' selected':''}${dim?' dim':''}${active?' mine':''}`;
    const lineWidth=st?.double?Math.max(.5,w*.45):w;
    const dash=contain?'5 5':st.dash.join(' ');
    let L=paths.map((path,track)=>{
      const key=paths.length>1?` data-board-track="${track}"`:'';
      return (shadows?`<path ${tag}${key} class="boardStringShadow" d="${path}" transform="translate(2 3)" stroke-opacity="${ink}" style="--sw:${lineWidth+.6}"/>`:'')+
        `<path ${tag}${key} class="boardString${flags}" d="${path}" stroke="${color}" stroke-opacity="${ink}" style="--sw:${lineWidth};--thread-color:${color};stroke-linecap:${st?.lineCap||'round'}${dash?`;stroke-dasharray:${dash}`:''}"/>`;
    }).join('');
    if(arrow)L+=`<path ${tag} class="boardStringArrow${flags}" d="${arrow}" fill="${color}" fill-opacity="${ink}"/>`;
    if(st?.animated){
      const style=st.animationStyle,seconds=2.2/st.animationSpeed;
      const trails=style==='comet'||style==='trail'?3:1;
      for(let i=0;i<trails;i++)L+=`<path ${tag} class="boardStringMotion ${style}${flags}" d="${d}" pathLength="100" stroke="${color}" stroke-opacity="${ink*(1-i*.25)}" style="--sw:${Math.max(2,w*(1.55-i*.3))};--thread-duration:${seconds}s;--thread-delay:${-seconds*(1-i*.045)}s"/>`;
    }
    const H=masked?'':`<path ${tag} class="boardStringHit" data-board-rel="${escapeHtml(r.id)}" d="${d}" style="--thread-hit:${Math.max(12,w+6)}px"><title>${escapeHtml(rt.name||'Связь')}: ${escapeHtml(getEntity(from)?.name||'')} → ${escapeHtml(getEntity(to)?.name||'')}</title></path>`;
    if(active&&!dim){topLines+=L;topHits+=H}else{lines+=L;hits+=H}
    if(!masked&&!contain&&relationLabelMode(r)!=='never'){
      const text=String(r.label||rt.name||'').trim();
      const transient=relationLabelShown(r,{hover:active})?'':' hoverOnly';
      if(text)labels+=`<div ${tag} class="boardStringLabel${selected?' selected':''}${transient}" style="left:${mid.x}px;top:${mid.y}px;--string:${color};--thread-label-size:${st.labelSize}px">${escapeHtml(text)}</div>`;
    }
  }
  return {svg:`<svg class="boardStrings" aria-hidden="true">${lines}</svg><svg class="boardStringHits">${hits}</svg><svg class="boardStrings boardStringsTop" aria-hidden="true">${topLines}</svg><svg class="boardStringHits boardStringHitsTop">${topHits}</svg>`,labels};
}
function boardThreadMarkup(strings,layout){
  return strings.svg+((layout.nodes?.length??layout.positions.size)>=BOARD_BIG
    ?`<template class="boardCaptions">${strings.labels}</template>`:strings.labels);
}
function boardInitCaptions(stage,layout){
  const contents=(layout.nodes?.length??layout.positions.size)>=BOARD_BIG
    ?stage.querySelector(':scope > .boardCaptions')?.content:null;
  stage._boardCaptionTemplate=contents;
  stage._boardCaptionIndex=contents?new Map([...contents.children].map(el=>[Number(el.dataset.boardThread),el])):null;
  stage._boardCaptionsAll=null;
  stage._boardCaptionMode=null;stage._boardCaptionVisible=new Set();
}
function boardCaptionBox(label){
  if(label._boardCaptionBox)return label._boardCaptionBox;
  const x=parseFloat(label.style.left),y=parseFloat(label.style.top),font=parseFloat(label.style.getPropertyValue('--thread-label-size'))||11;
  // Max-width is 230; a worst-case one-character-per-line bound preserves
  // even unusually long wrapped labels, rotation and shadow at the edge.
  const h=Math.max(32,label.textContent.length*font*1.4+20),w=145+h*.05;
  return label._boardCaptionBox={minX:x-w,maxX:x+w,minY:y-h/2-20,maxY:y+h/2+20};
}
function boardCullCaptions(stage,z=state.boardZoom||1){
  if(stage?._boardCaptionMode!=='viewport')return;
  const view=stage.parentElement,c=stage._udCardCull,w=c?.width||view.clientWidth,h=c?.height||view.clientHeight,margin=200;
  const clip={minX:(-w/2-margin-(state.boardPanX||0))/z,maxX:(w/2+margin-(state.boardPanX||0))/z,minY:(-h/2-margin-(state.boardPanY||0))/z,maxY:(h/2+margin-(state.boardPanY||0))/z};
  const desired=[],wanted=new Set();
  for(const label of stage._boardCaptionIndex.values()){
    const b=boardCaptionBox(label);
    if(label.classList.contains('selected')||!Number.isFinite(b.minX)||!Number.isFinite(b.minY)||b.maxX>=clip.minX&&b.minX<=clip.maxX&&b.maxY>=clip.minY&&b.minY<=clip.maxY){desired.push(label);wanted.add(label)}
  }
  for(const label of stage._boardCaptionVisible)if(!wanted.has(label)&&label.parentNode===stage)stage._boardCaptionTemplate.append(label);
  let before=null;for(let i=desired.length-1;i>=0;i--){const label=desired[i];if(label.parentNode!==stage)stage.insertBefore(label,before);before=label}
  stage._boardCaptionVisible=wanted;
}
function boardSyncCaptions(stage,showAll){
  if(!stage?._boardCaptionIndex)return;
  const mode=!showAll?'selected':state.visualStyle==='classic'&&!state.space?'viewport':'all';
  if(mode==='viewport'){
    if(stage._boardCaptionMode!==mode)stage._boardCaptionVisible=new Set([...stage._boardCaptionIndex.values()].filter(label=>label.parentNode===stage));
    stage._boardCaptionsAll=showAll;stage._boardCaptionMode=mode;boardCullCaptions(stage);return;
  }
  if(stage._boardCaptionsAll===showAll&&stage._boardCaptionMode===mode)return;
  const visible=document.createDocumentFragment();
  for(const label of stage._boardCaptionIndex.values()){
    if(showAll||label.classList.contains('selected'))visible.append(label);
    else if(label.parentNode===stage)stage._boardCaptionTemplate.append(label);
  }
  stage.append(visible);
  stage._boardCaptionsAll=showAll;
  stage._boardCaptionMode=mode;
}
function boardThreadCaption(stage,index){
  return stage?._boardCaptionIndex?.get(Number(index))||
    stage?.querySelector(`.boardStringLabel[data-board-thread="${index}"]`);
}
function boardThreadDomNodes(stage){
  if(stage._boardThreadNodes)return stage._boardThreadNodes;
  const nodes=new Map();
  for(const node of stage.querySelectorAll('[data-board-thread]')){
    const index=Number(node.dataset.boardThread);
    if(!nodes.has(index))nodes.set(index,[]);
    nodes.get(index).push(node);
  }
  // Parked captions must still follow their route during a move.
  for(const [index,label] of stage._boardCaptionIndex||[]){
    if(label.parentNode!==stage)nodes.get(index)?.push(label);
  }
  return stage._boardThreadNodes=nodes;
}

// A moving layout owns its coordinates for the duration of a gesture. A new
// layout or view revision is checked against the rendered routes before reuse.
function boardUpdateStrings(layout,stage,moved=null){
  const appearance=JSON.stringify(boardStringAppearance());
  const previous=stage._boardThreadFrame;
  const reuse=moved&&previous?.layout===layout&&previous.key===stage._boardThreadKey&&
    previous.version===state.viewVersion&&previous.appearance===appearance&&
    previous.positionCount===layout.positions.size&&previous.relationCount===layout.relations.length;
  let frame=previous,entries;
  if(reuse){
    entries=new Set();
    for(const id of moved)for(const spec of frame.endpoints.get(id)||[])entries.add(spec);
  }else{
    if(stage._boardThreadKey!==boardStringSceneKey(layout))return false;
    if(!moved||!stage._boardThreadKey)stage._boardThreadNodes=null;
    const nodes=boardThreadDomNodes(stage),endpoints=new Map();
    entries=boardStringSpecs(layout);
    if(entries.length!==nodes.size||entries.some(spec=>!nodes.has(spec.index)))return false;
    for(const spec of entries)for(const id of [spec.r.from,spec.r.to]){
      if(!endpoints.has(id))endpoints.set(id,[]);
      endpoints.get(id).push(spec);
    }
    frame=stage._boardThreadFrame={layout,nodes,endpoints,appearance,key:stage._boardThreadKey,
      version:state.viewVersion,positionCount:layout.positions.size,relationCount:layout.relations.length};
  }
  for(const spec of entries){
    const geometry=boardStringGeometry(spec,layout.positions);if(!geometry)return false;
    const {d,mid,paths,arrow}=geometry;
    const nodes=frame.nodes.get(spec.index);
    if(spec.st?.arrow&&!!arrow!==nodes.some(node=>node.matches?.('.boardStringArrow')))return false;
    for(const node of nodes){
      if(node.tagName.toLowerCase()==='path'){
        const next=node.matches?.('.boardStringArrow')?arrow:paths[node.dataset.boardTrack]||d;
        if(node.getAttribute('d')!==next)node.setAttribute('d',next);
      }else{node.style.left=mid.x+'px';node.style.top=mid.y+'px';node._boardCaptionBox=null}
    }
    if(typeof udInkChangedPaths==='function')udInkChangedPaths(stage,nodes);
  }
  if(typeof udInkFinishPaths==='function')udInkFinishPaths(stage);
  boardCullCaptions(stage);
  return true;
}

// 0.28.3: colour of a paper on the board (user, 21.10.2026: «покрасить заметки различными цветами … глаз теряется»).
// The colour belongs to the record (the same on every board); «По типам» tints every paper without its own colour in its type's colour.
const BOARD_PAPERS={yellow:['Жёлтая','#f9e776'],pink:['Розовая','#f7bfd0'],blue:['Голубая','#bcdcf6'],green:['Зелёная','#c6e8b4'],orange:['Оранжевая','#f8cc92'],violet:['Сиреневая','#d9c8f2'],white:['Белая','#fdfbf4'],gray:['Серая','#d8d5ce']};
function boardPaperColor(value){
  if(typeof value!=='string')return '';
  return Object.hasOwn(BOARD_PAPERS,value)?BOARD_PAPERS[value][1]:hexOr(value,'');
}
function boardPaperVars(e,et){
  const own=boardPaperColor(e.paper),tint=!own&&state.boardTypeColors?safeCssValue(e.style?.color||et.color,''):'';
  const bg=own||(tint?`color-mix(in srgb, ${tint} 30%, #fffdf5)`:'');if(!bg)return '';
  // New arbitrary colors include dark shades; named presets keep their existing ink.
  if(own&&!Object.hasOwn(BOARD_PAPERS,e.paper)){
    const [r,g,b]=hexRgb(own).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
    const ink=r*.2126+g*.7152+b*.0722<.19?'#fff':'#111';
    return `;--paper:${bg};--note:${bg};--folder:${bg};--case:${bg};--paper-ink:${ink};--paper-text:${ink};--paper-name:${ink};--paper-kind:${ink};--note-ink:${ink};--folder-ink:${ink};--case-name:${ink};--paper-line:color-mix(in srgb,${ink} 12%,transparent)`;
  }
  return `;--paper:${bg};--note:${bg};--folder:${bg};--paper-ink:#2a2620;--paper-text:#3a342a;--paper-name:#1f2a40;--paper-kind:#4f4636;--note-ink:#2a2620;--folder-ink:#2a2620;--paper-line:rgba(60,60,80,.12)`;
}
function boardPaperRowHtml(ids,cur){
  const key=escapeHtml(ids.join(',')),presets=Object.values(BOARD_PAPERS).map(([,color])=>color);
  return `<div class="paperRow" role="group" aria-label="Цвет бумажки"><input class="colorInput" type="color" aria-label="Цвет бумажки" value="${boardPaperColor(cur)||'#fdfbf4'}" data-paper-color="${key}" data-rgb-presets="${presets.join(',')}" data-rgb-apply-same><button type="button" class="btn tiny" data-paper-set="${key}" title="Вернуть стандартный цвет">Сбросить</button></div>`;
}
function setEntitiesPaper(ids,k){
  if(worldReadOnly())return 0;

  if(k&&!boardPaperColor(k))return 0;
  const list=[...new Set(ids||[])].map(getEntity).filter(e=>e&&boardPaperColor(e.paper)!==boardPaperColor(k));
  if(!list.length)return 0;
  const snap=snapshotWorkspaceMutation();for(const e of list){if(k)e.paper=k;else delete e.paper}
  if(!persist()){restoreWorkspaceMutation(snap.data,snap.state);updateUI();toast('Не удалось сохранить — всё возвращено как было','err');return 0}
  if(state.visualMode==='detective')renderDetective();updateUI();return list.length;
}
function boardToggleTypeColors(){state.boardTypeColors=!state.boardTypeColors;renderDetective();persistWorkspaceView();viewStripSoon()}
function finishPaperColor(ids,key){
  const n=setEntitiesPaper(ids.split(','),key);
  if(n)toast(key?'Цвет бумажки изменён':'Бумажка — как обычно','ok');
  hideContextMenu();
  $('#paperPop')?.remove();
}
document.addEventListener('change',ev=>{
  const input=ev.target;
  if(!input.matches?.('[data-paper-color]'))return;
  const value=input.value;
  const key=Object.keys(BOARD_PAPERS).find(k=>BOARD_PAPERS[k][1]===value)||value;
  finishPaperColor(input.dataset.paperColor,key);
});
document.addEventListener('click',ev=>{
  if(ev.target.closest?.('.rgbDialog'))return;
  const b=ev.target.closest?.('[data-paper-set]');
  if(b){ev.preventDefault();ev.stopPropagation();finishPaperColor(b.dataset.paperSet,'');return}
  const m=ev.target instanceof Element?ev.target.closest('[data-paper-marker]'):null;
  if(m){ev.preventDefault();ev.stopPropagation();const id=m.dataset.paperMarker,old=document.getElementById('paperPop');if(old){old.remove();if(old.dataset.for===id)return}
    const r=m.getBoundingClientRect(),pop=document.createElement('div');pop.id='paperPop';pop.className='paperPop';pop.dataset.for=id;const ids=state.selectedIds.size>1&&state.selectedIds.has(id)?[...state.selectedIds]:[id];pop.innerHTML=boardPaperRowHtml(ids,getEntity(id)?.paper||'');document.body.appendChild(pop);
    const zf=Number(getComputedStyle(document.documentElement).getPropertyValue('--zf'))||1;pop.style.left=Math.round(r.left/zf)+'px';pop.style.top=Math.round((r.bottom+6)/zf)+'px';return}
  if(!(ev.target instanceof Element&&ev.target.closest('#paperPop')))document.getElementById('paperPop')?.remove();
},true);
// Tint is a property of the visible assignments, not their position in the rule editor.
function boardStatusTint(options){
  const sum=[0,0,0];
  let count=0;
  for(const option of options){
    if(option.effect!=='tint')continue;
    const channels=hexRgb(cssRgbHex(option.color,'#9aa8c6'));
    channels.forEach((channel,i)=>sum[i]+=channel);
    count++;
  }
  return count?rgbHex(sum.map(channel=>Math.round(channel/count))):null;
}
function boardCardSelected(e,paper,focused){
  return focused?focused===paper?.id:state.selectedIds.has(e.id)||state.selectedId===e.id;
}
function boardCardHtml(e,p,v=null,{compact=false,paper=null,instanceMode=false,hasChildren=false,composition=null}={}){
  const focused=instanceMode&&udSelectedPaperId();
  const et=getET(e.type),kind=p.kind,sel=!compact&&boardCardSelected(e,paper,focused);
  const detailsOpen=!compact&&udDetailsOpen.has(e.id);
  const autoPhoto=boardUsesAutoPhoto(e);
  const autoHeight=!!(paper?.autoHeight||(!paper&&p.fixed?.lock?.autoHeight));
  const accent=safeCssValue(e.style?.color||et.color,'#7d8696'),icon=e.style?.icon||et.icon||'•';
  const sv=statusVisual(e),options=entityStatuses(e).map(x=>x.option);
  const stampOpt=options.find(o=>o.effect==='gray'||o.effect==='fade');
  const tint=!e.hint&&boardStatusTint(options);
  const traceEnd=state.traceStart===e.id||state.traceEnd===e.id;
  const dim=state.focusedPath.length&&!state.focusedPath.includes(e.id);
  const note=udEntityNote(e),short=udNoteExcerpt(note,120);
  const img=boardMainImage(e);
  const members=containmentChildren(e.id).filter(id=>!paper?.excludedMembers?.includes(id));
  const inside=paper&&uiIsPlayer()?Number(!!hasChildren||(!paper.childrenReady&&!e.hint&&members.some(id=>{
    const member=getEntity(id);
    return member&&member.hint!==true;
  }))):members.length||Number(hasChildren);
  const canFold=paper&&e.id!==state.scopeId&&(hasChildren||!paper.childrenReady&&inside);
  const missing=paper&&!worldReadOnly()&&!e.hint&&!udPlacementsAreShared()?udPaperMissingMembers(paper,composition?.board,composition).length:0;
  const contents=!e.hint&&!p.external&&((paper&&!paper.virtual&&(isSpace(e)||hasChildren||missing>0))||(!paper&&e.id===state.scopeId));
  const paperOpen=paper&&((uiIsPlayer()?udPaperPlayerOpen(boardKey(),paper):paper.open)||(udPaperRevealed(paper.id)?'one':false));
  const chips=statusChipsHtml(e);
  const fixedLabel=p.fixed?'Открепить':'Закрепить положение и размер';
  const preview=instanceMode&&p.external;
  const lockButton=!preview&&!paper&&sel&&boardCanToggleFixed(e)?`<button type="button" class="udFixCard" data-board-fixed="${escapeHtml(e.id)}" aria-pressed="${!!p.fixed}" aria-label="${fixedLabel}" title="${fixedLabel}">${p.fixed?'🔒':'🔓'}</button>`:'';
  const paperTools=!preview&&sel&&!worldReadOnly()&&!e.hint&&!udPlacementsAreShared()&&e.id!==state.scopeId?
    `<button type="button" data-ud-duplicate title="Создать отдельную бумажку" aria-label="Создать отдельную бумажку">⧉</button>`+
    (paper?`<button type="button" data-ud-paper-remove title="Снять бумажку" aria-label="Снять бумажку">×</button>
    <button type="button" data-ud-paper-lock title="Закрепление бумажки" aria-pressed="${!!paper.locked}">${paper.locked?'🔒':'🔓'}</button>`:''):'';
  const playerLock=sel&&paper&&e.hint&&!paper.virtual&&uiIsPlayer()&&!worldReadOnly()?
    `<button type="button" data-ud-paper-lock title="${fixedLabel}" aria-label="${fixedLabel}" aria-pressed="${!!paper.locked}">${paper.locked?'🔒':'🔓'}</button>`:'';
  const placementTools=sel&&paper&&!e.hint?
    '<button type="button" data-ud-paper-find title="Другие бумажки" aria-label="Другие бумажки">⌖</button>'+
    (!worldReadOnly()?'<button type="button" data-ud-paper-related title="Показать нить к существующей бумажке" aria-label="Показать нить">⌁</button>':'')+
    (!worldReadOnly()&&!paper.locked&&e.id!==state.scopeId?'<button type="button" data-ud-paper-transfer title="Перенести бумажку" aria-label="Перенести бумажку">↗</button>':''):'';
  const contextLock=sel&&paper&&paper.id===udContainerContext()?.paperId&&!worldReadOnly()?'<button type="button" data-ud-paper-lock title="Закрепление контейнера">'+(paper.locked?'🔒':'🔓')+'</button>':'';
  const tools=contextLock+udCardToolsHtml(e,sel)+lockButton+articleBoardButtonHtml(e,sel)+paperTools+placementTools+playerLock;
  const toolbarVisibility=p.fixed&&sel&&tools?udCardVisibilityHtml(e,sel):'';
  const cls=['boardCard','k-'+kind,img?'hasPhoto':'',p.fixed?'boardFixed':'',autoPhoto?'boardAutoPhoto':'',detailsOpen?'udOpen':'',(p.w&&p.w<170)||(p.h&&!autoHeight&&p.h<110)?'small':'',p.w||p.h?'sized':'',autoHeight?'udAutoHeight':'',p.fixed&&p.h&&!autoHeight&&p.h<110?'udShortPaper':'',sel?'selected':'',sv?.gray?'gray':'',sv?.fade?'fade':'',tint?'statusTint':'',traceEnd?'traceEnd':'',dim?'dim':''].filter(Boolean).join(' ');
  const rot=kind==='case'?0:boardTilt(paper?.id||e.id);
  return `<div class="${cls}" data-board-id="${escapeHtml(e.id)}"${paper?` data-ud-paper-id="${escapeHtml(paper.id)}"${!e.hint?' tabindex="0"':''}`:''} style="left:${p.x}px;top:${p.y}px;width:${p.w||BOARD_CARD_W[kind]}px;${p.h&&!autoHeight?`${p.fixed?'height':'min-height'}:${p.h}px;`:''}--rot:${rot.toFixed(2)}deg;--accent:${escapeHtml(accent)}${escapeHtml(boardPaperVars(e,et))}${tint?`;--status-tint:${tint}`:''}${sv?.glow?`;--glow:${escapeHtml(safeCssValue(sv.glow,'#ffd36b'))}`:''}" title="${escapeHtml(e.name)}">
    <span class="boardPin" aria-hidden="true" title="Потяните от булавки к другой бумажке — новая связь"></span>
    ${worldReadOnly()||e.hint?'':`<button type="button" class="boardMarker${e.paper?' on':''}" data-paper-marker="${escapeHtml(e.id)}" title="Цвет бумажки" aria-label="Цвет бумажки"></button>
    ${preview||p.fixed||worldReadOnly()||e.hint?'':`<span class="boardResize" data-board-resize="${escapeHtml(e.id)}" title="Потяните — изменить размер на этой доске · двойной клик — обычный размер" aria-hidden="true"></span>`}`}
    ${kind==='folder'||kind==='case'?`<span class="boardFolderTab" title="${kind==='case'?'Дело — пространство, открытое на доске':'Папка — внутри есть другие сущности'}">${escapeHtml(icon)} ${escapeHtml(e.type?et.name:'Заметка')}</span>`:''}
    ${tools&&p.fixed?'<span class="udFixedIndicator udOverviewLock" title="Положение и размер закреплены">🔒</span>':''}
    ${tools?`<div class="udCardTools">${tools}${toolbarVisibility}</div>`:p.fixed?`<span class="udFixedIndicator" title="Положение и размер закреплены">🔒</span>`:''}
    ${img?udBoardPhotoHtml(e,img,sel):''}
    ${kind==='folder'||kind==='case'?'':`<div class="boardKind"><i>${escapeHtml(icon)}</i>${escapeHtml(e.type?et.name:'Заметка')}</div>`}
    ${p.external?`<div class="boardFrom" title="Связана с сущностями этого пространства, но лежит в другом месте (Links)">↗ ${escapeHtml(getEntity(containmentParent(e.id))?.name||'вне пространства')}</div>`:''}
    ${v?.pinned?`<div class="boardFrom" title="Прикреплена к этой доске из другого места">📌 ${escapeHtml(getEntity(containmentParent(e.id))?.name||'из другого места')}</div>`:''}
    <div class="boardName" title="${escapeHtml(e.name+(udCanEditText(e,'name')?' · Двойной щелчок — изменить название':''))}"${udCanEditText(e,'name')?' data-ud-edit="name"':''}>${escapeHtml(e.name)}</div>
    ${udCardTextHtml(e,note,short,sel)}
    ${(canFold||contents)?`<div class="boardCaseBar">${canFold?`<button type="button" class="boardCaseBtn" data-ud-paper-open="${paperOpen?'close':'one'}">${paperOpen?'▴ Свернуть':'▾ Раскрыть'}</button>
    ${paperOpen?'<button type="button" class="boardCaseBtn" data-ud-paper-open="one">▾ Один уровень</button>':''}
    ${paperOpen!=='all'?'<button type="button" class="boardCaseBtn" data-ud-paper-open="all">⇊ Всё</button>':''}`:''}
    ${contents?'<button type="button" class="boardCaseBtn" data-ud-paper-contents title="Посмотреть все бумажки этого контейнера, в том числе вне видимой области">Состав…</button>':''}</div>`:instanceMode?'':boardCaseBarHtml(e,inside,v)}
    ${udCardStatusHtml(e,sel,chips)}
    ${toolbarVisibility?'':udCardVisibilityHtml(e,sel)}
    ${udCardMoreHtml(e,detailsOpen)}
    ${inside?`<div class="boardInside">${inside} ${plural(inside,...(!uiIsPlayer()&&paper&&!members.length?['бумажка','бумажки','бумажек']:['сущность','сущности','сущностей']))} внутри${missing?` · ${missing} без бумажки здесь`:''}</div>`:''}
    ${stampOpt?`<div class="boardStamp" style="--status:${escapeHtml(safeCssValue(stampOpt.color,'#b33'))}">${escapeHtml(stampOpt.name)}</div>`:''}
  </div>`;
}

function boardTileOffset(value,period){
  const remainder=value%period;
  return remainder>0?remainder-period:remainder;
}
function boardSurfaceHtml(){
  return `<div class="boardSurface"><div class="boardSurfaceTexture" style="--board-texture-pad:${BOARD_SURFACE_PAD}px"></div></div>`;
}
function boardMoveSurface(surface,x,y){
  if(surface._boardX===x&&surface._boardY===y)return;
  surface._boardX=x;surface._boardY=y;
  // Styles whose background depends on the viewport keep their own size and phase.
  surface.style.setProperty('--board-bg-x',x+'px');surface.style.setProperty('--board-bg-y',y+'px');
  const texture=surface.firstElementChild,pad=BOARD_SURFACE_PAD;
  let ref=surface._boardTextureOrigin;
  if(!ref||Math.abs(x-ref.x)>pad||Math.abs(y-ref.y)>pad){
    ref=surface._boardTextureOrigin={x,y};
    // Repaint once on leaving the padding. During ordinary panning only the
    // translation changes, and every motif is already in the same texture.
    for(const [index,[w,h]] of BOARD_SURFACE_TILES.entries()){
      texture.style.setProperty('--tile-x'+index,boardTileOffset(x+pad,w)+'px');
      texture.style.setProperty('--tile-y'+index,boardTileOffset(y+pad,h)+'px');
    }
  }
  texture.style.transform=`translate3d(${x-ref.x}px,${y-ref.y}px,0)`;
}

function applyBoardTransform({initial=false}={}){
  boardCancelQueuedPan();
  const v=$('#detectiveView'),stage=v?.querySelector('.boardStage');if(!v||!stage)return;
  const z=clamp(Number(state.boardZoom)||1,BOARD_ZOOM_MIN,BOARD_ZOOM_MAX);state.boardZoom=z;
  const px=Number(state.boardPanX)||0,py=Number(state.boardPanY)||0;
  const old=stage._boardCamera,changed=!old||old.x!==px||old.y!==py||old.z!==z;
  if(changed){stage.style.transform=`translate(${px}px,${py}px) scale(${z})`;stage._boardCamera={x:px,y:py,z};}
  if((initial||!old||old.z!==z)&&typeof udSyncBoardPhotos==='function')udSyncBoardPhotos(stage,z);
  if(changed&&typeof udNetCameraChanged==='function')udNetCameraChanged();
  if(changed&&typeof prsCameraMoved==='function')prsCameraMoved();
  // 0.23.8: the moving background reads its offset from variables set on the background layer only — set on the whole board,
  // they made the browser recompute every card and thread on each frame of panning (1000 cards: ~1.5 s per frame).
  const surf=v.querySelector('.boardSurface');
  if(surf)boardMoveSurface(surf,px,py);
  // the detail level restyles every card — set it now only if the board was still (a redraw, a jump); during a wheel/drag — once it stops (lesson 0.23.8)
  if(!stage._boardMoving&&(initial||!old||old.z!==z||v._boardDetailZoom!==z))boardDetailFor(v,boardGestureActive()?(v._boardDetailZoom??z):z,initial?stage:null);
  boardMarkMoving(v,stage);
  if(typeof udInkCamera==='function')udInkCamera(v,stage,z);
  if(typeof udPlateCamera==='function')udPlateCamera(stage,z);
  if(typeof udCullCamera==='function')udCullCamera(stage,z);
  boardCullCaptions(stage,z);
  if(typeof linkKnobSoon==='function')linkKnobSoon();
}
// Detail changes wait for the end of motion. This is logical state, not a GPU
// promotion hint: a sparse board can span tens of thousands of CSS pixels.
function boardGestureActive(){
  const d=state.boardDrag;
  if(!d||d.invalidated)return false;
  if(d.kind==='pan')return d.boardKey===boardCameraKey();
  return (d.kind==='paper'||d.kind==='card')&&d.scope===boardKey()&&
    (d.workspace===undefined||d.workspace===currentWorkspace()?.id);
}
function boardMarkMoving(v,stage){
  // Promoting the entire world to a moving texture also promotes its long SVG
  // filters. Keep normal viewport-clipped painting instead of unbounded layers.
  stage._boardMoving=true;
  const key=boardCameraKey();
  settleAfterMoves('board',()=>{
    if(key!==boardCameraKey()||stage!==$('#detectiveView .boardStage')){stage._boardMoving=false;return}
    // A stationary held pointer is still a gesture. Do not re-raster or change
    // card geometry under the hand, even after the wheel's idle timer expires.
    if(boardGestureActive()){boardMarkMoving(v,stage);return}
    stage._boardMoving=false;
    boardDetailFor(v,state.boardZoom||1);
    if(typeof udInkCamera==='function')udInkCamera(v,stage,state.boardZoom||1,true);
    if(typeof udPlateCamera==='function')udPlateCamera(stage,state.boardZoom||1);
    if(typeof udCullCamera==='function')udCullCamera(stage,state.boardZoom||1);
  });
}
// Far away the board shows less: «far» — names only (bigger, so they stay readable), «tiny» — coloured paper only.
// Overview is presentation only. Measure the ordinary layout once per rendered
// photo card, in one read batch, so LOD never changes its paper size or locks.
function boardMeasureNear(view,measure){
  const far=view?.classList.contains('bFar'),tiny=view?.classList.contains('bTiny');
  if(far)view.classList.remove('bFar');
  if(tiny)view.classList.remove('bTiny');
  try{return measure()}finally{
    if(far)view.classList.add('bFar');
    if(tiny)view.classList.add('bTiny');
  }
}
function boardSetOverviewHeight(card,height){
  card.style.setProperty('--ud-overview-height',Math.round(height)+'px');
  card._udOverviewMeasured=true;
}
function boardPrepareOverviewPhotos(view,changedCards=null){
  const cards=changedCards?changedCards.filter(c=>c.classList.contains('hasPhoto')):
    [...view.querySelectorAll('.boardCard.hasPhoto')].filter(c=>!c._udOverviewMeasured);
  if(!cards.length)return;
  const measureLocally=changedCards||cards.every(c=>c._udOverviewPending);
  // A camera/detail update must finish any measurements it encounters.
  // The ordinary selection handler still lets the browser do this before paint.
  for(const card of cards){
    if(!card._udOverviewPending)continue;
    card.parentElement?._boardOverviewObserver?.unobserve(card);
    card.classList.remove('boardMeasuringNear');
    card._udOverviewPending=false;
  }
  const measure=()=>cards.map(c=>c.offsetHeight);
  let heights;
  if(measureLocally){
    // Measure the normal sizing of the replaced cards without relaying the
    // view's zoom classes to every other photo and thread.
    for(const card of cards)card.classList.add('boardMeasuringNear');
    try{heights=measure()}finally{for(const card of cards)card.classList.remove('boardMeasuringNear')}
  }else heights=boardMeasureNear(view,measure);
  cards.forEach((c,i)=>boardSetOverviewHeight(c,heights[i]));
}
function boardObserveOverviewPhotos(view,stage,changedCards){
  const cards=changedCards.filter(card=>card.classList.contains('hasPhoto'));
  if(!cards.length)return;
  if(typeof ResizeObserver!=='function'){boardPrepareOverviewPhotos(view,cards);return}
  // Measure the actual near variant during the browser's layout, then apply
  // its border-box height before that frame is painted. The gesture handler
  // never has to synchronize layout just to obtain the new photo's height.
  const observer=stage._boardOverviewObserver??=new ResizeObserver(entries=>{
    for(const {target,borderBoxSize} of entries){
      if(!(typeof udPlateOwns==='function'?udPlateOwns(stage,target):target.parentElement===stage)){observer.unobserve(target);continue}
      const height=borderBoxSize[0]?.blockSize;
      if(!(height>0))continue;
      observer.unobserve(target);
      boardSetOverviewHeight(target,height);
      target.classList.remove('boardMeasuringNear');
      target._udOverviewPending=false;
    }
  });
  for(const card of cards){
    card._udOverviewPending=true;
    card.classList.add('boardMeasuringNear');
    observer.observe(card,{box:'border-box'});
  }
}
// A compact fixed card may put its owner toolbar above the paper. At the
// viewport edge place it beside the card, keeping the buttons below the HUD.
function boardPlaceFixedTools(view){
  const fixedTools=view.querySelectorAll('.boardCard.boardFixed.selected .udCardTools');
  if(!fixedTools.length)return;
  const clip=view.getBoundingClientRect(),strip=document.querySelector('.viewStrip');
  const top=Math.max(clip.top,strip?.getBoundingClientRect().bottom||clip.top)+4;
  const uiScale=Number(getComputedStyle(document.documentElement).getPropertyValue('--zf'))||1;
  const scale=(Number(state.boardZoom)||1)*uiScale;
  for(const tools of fixedTools){
    tools.classList.remove('udToolsBeside','udToolsLeft');tools.style.removeProperty('--ud-tools-y');
    if(tools.getBoundingClientRect().top>=top)continue;
    tools.classList.add('udToolsBeside');
    if(tools.getBoundingClientRect().right>clip.right-4)tools.classList.add('udToolsLeft');
    // Reserve the adjoining link knob's screen-space row on either side.
    const dy=Math.max(48*uiScale,top-tools.getBoundingClientRect().top)/scale;
    if(dy)tools.style.setProperty('--ud-tools-y',dy+'px');
  }
}
function boardDetailFor(v,z,initialStage=null){
  const far=z<.5,tiny=z<.2;
  const plateFeature=typeof udCardPlateEnabled!=='undefined'&&udCardPlateEnabled;
  const stage=initialStage||v.querySelector('.boardStage');
  const detailChanged=v.classList.contains('bFar')!==far||v.classList.contains('bTiny')!==tiny;
  if(typeof udSyncBoardPhotos==='function')udSyncBoardPhotos(initialStage||v.querySelector('.boardStage'),z);
  if(far){
    // A new scene may still be replaced in this task, before its first paint.
    // Let the browser size its photos once instead of forcing an early layout.
    if(initialStage)boardObserveOverviewPhotos(v,initialStage,[...initialStage.querySelectorAll('.boardCard.hasPhoto')]);
    else boardPrepareOverviewPhotos(v);
  }
  v._boardDetailZoom=z;
  const bk=z>1?(1/z).toFixed(3):'1';
  for(const sv of v.querySelectorAll('.boardStrings'))if(sv.style.getPropertyValue('--bk')!==bk)sv.style.setProperty('--bk',bk);
  const scale=Math.max(1,.8/z).toFixed(2);
  if((state.space||!plateFeature)&&v.style.getPropertyValue('--thread-caption-scale')!==scale)v.style.setProperty('--thread-caption-scale',scale);
  if(v.classList.contains('bFar')!==far)v.classList.toggle('bFar',far);
  if(v.classList.contains('bTiny')!==tiny)v.classList.toggle('bTiny',tiny);
  boardSyncCaptions(initialStage||v.querySelector('.boardStage'),state.space||!far);
  const k=far?Math.min(3.2,plateFeature?Math.ceil((.5/z)*4)/4:.5/z).toFixed(2):'1';
  const nameChanged=v.style.getPropertyValue('--bname')!==k;
  if(nameChanged)v.style.setProperty('--bname',k);
  if((detailChanged||nameChanged)&&typeof udPlateDirty==='function')udPlateDirty(stage);
  if(!far)boardPlaceFixedTools(v);
}
function boardWorldPoint(clientX,clientY){const v=$('#detectiveView'),r=v.getBoundingClientRect(),z=state.boardZoom||1;return {x:(clientX-r.left-r.width/2-(state.boardPanX||0))/z,y:(clientY-r.top-r.height/2-(state.boardPanY||0))/z}}

function boardCreationPoint(x,y){
  if(worldReadOnly()||state.visualMode!=='detective')return null;
  return {scene:boardCameraKey(),board:boardKey(),parentId:udContainerContext()?.paperId??null,point:boardWorldPoint(x,y)};
}

function boardCreationAvailable(at){
  const scope=getEntity(state.scopeId);
  return state.visualMode==='detective'&&!!scope&&!scope.hint&&at.scene===boardCameraKey()&&at.board===boardKey()&&
    at.parentId===(udContainerContext()?.paperId??null);
}

function boardCreationOffset(at){
  const origin=at.parentId?boardLayout().positions.get(at.parentId):{x:0,y:0};
  return udPlacementOffset(at.point,origin,{round:true});
}

// Inside the entity creation transaction: a pinpoint request adds just one
// paper. The ordinary creation path can still populate other prepared boards.
function boardPlaceNewAt(entity,at){
  const board=boardState(at.board).placements;
  const point=boardCreationOffset(at);
  if(!point){toast('Выбранная точка вне доступных координат доски','err');return null}
  if(!board){
    boardSetPlace(entity,point,at.board);
    return {paperId:null};
  }
  const outerFit=at.parentId&&udPaperViewFits(board,null);
  const paperId=udPlaceAtContext(entity.id,board,at.parentId,point);
  if(!paperId||!udPaperViewFits(board)||(outerFit&&!udPaperViewFits(board,null))){
    toast('Лимит доски. Сверните контейнеры или освободите место для бумажки.','err');return null;
  }
  return {paperId};
}

// Preserve the paint order, and replace markup only where selected tools change.
function boardCardOrder(entries,selected){
  const normal=[],raised=[];
  for(const entry of entries)(selected.has(entry.id)?raised:normal).push(entry);
  return normal.concat(raised);
}
function boardSelectionFilters(){
  return JSON.stringify([state.search,state.showExternal,state.showHidden,state.showRelations,state.boardContain,
    state.boardRed,state.boardTypeColors,state.focusedPath,state.traceStart,state.traceEnd,[...state.filtersEntities],
    [...state.filtersRelations],[...state.filtersStatuses||[]],[...state.hiddenTiers||[]]]);
}
function boardMoveThreadLayer(nodes,target){
  if(!nodes.length||nodes[0].parentNode===target)return;
  const index=Number(nodes[0].dataset.boardThread),children=target.children;
  let lo=0,hi=children.length;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(Number(children[mid].dataset.boardThread)>index)hi=mid;
    else lo=mid+1;
  }
  const before=children[lo]||null;
  for(const node of nodes)target.insertBefore(node,before);
}
function boardSelectionRouteIndex(relations){
  const entities=new Map(),relationsById=new Map();
  const append=(map,key,index)=>{
    const entries=map.get(key);
    if(entries)entries.push(index);else map.set(key,[index]);
  };
  relations.forEach((r,index)=>{
    const from=r.entityFrom||r.from,to=r.entityTo||r.to;
    append(entities,from,index);
    if(from!==to)append(entities,to,index);
    append(relationsById,r.id,index);
  });
  return {entities,relationsById};
}
function boardUpdateRaisedThreads(stage,top=stage.querySelector('.boardStringsTop')){
  stage.classList.toggle('boardRaisedThreads',!!top?.querySelector('.boardString'));
}
function boardUpdateSelection(view,stage){
  const scene=stage?._boardSelection;
  if(!scene||state.boardDrag||udDescriptionDraft||udDragScene||udDragPreviews.size||scene.reveal||state.udPaperReveal||
    scene.key!==boardCameraKey()||scene.version!==state.viewVersion||scene.filters!==boardSelectionFilters()||
    scene.entities!==data.entities||scene.relations!==data.relations||
    scene.source!==(scene.layout.keys?boardState().placements:null))return false;
  const {layout,entries,cards}=scene,focus=layout.keys&&udSelectedPaperId();
  const selected=new Set(entries.filter(({e,paper})=>boardCardSelected(e,paper,focus)).map(({id})=>id));
  const changed=new Set([...scene.selected,...selected].filter(id=>scene.selected.has(id)!==selected.has(id)));
  const layers=stage.querySelectorAll('.boardStrings,.boardStringHits');
  if(layers.length!==4)return false;
  if(changed.size){
    const template=document.createElement('template');
    const order=boardCardOrder(entries,selected);
    for(const entry of order){
      if(!changed.has(entry.id))continue;
      template.innerHTML=scene.html(entry);
      const previous=cards.get(entry.id);
      stage._boardOverviewObserver?.unobserve(previous);
      previous.remove();
      cards.set(entry.id,template.content.firstElementChild);
    }
    const before=new Map([[stage,layers[0]]]);
    for(let i=order.length-1;i>=0;i--){
      const id=order[i].id,node=cards.get(id);
      const parent=typeof udPlateParent==='function'?udPlateParent(stage,node):stage;
      if(changed.has(id))parent.insertBefore(node,before.get(parent)||null);
      before.set(parent,node);
    }
    if(typeof udPlateChanged==='function')udPlateChanged(stage,[...changed].map(id=>cards.get(id)));
  }
  const overview=view._boardDetailZoom<.5;
  if(changed.size&&typeof udSyncBoardPhotos==='function')udSyncBoardPhotos(stage,state.boardZoom||1,[...changed].map(id=>cards.get(id)));
  if(changed.size&&typeof udNetSchedulePriority==='function')udNetSchedulePriority();
  if(overview)boardObserveOverviewPhotos(view,stage,[...changed].map(id=>cards.get(id)));
  const dirtyEntities=new Set([...scene.selectedEntities,...state.selectedIds]
    .filter(id=>scene.selectedEntities.has(id)!==state.selectedIds.has(id)));
  const dirtyRoutes=new Set(),routeIndex=scene.routeIndex;
  for(const id of dirtyEntities)for(const index of routeIndex.entities.get(id)||[])dirtyRoutes.add(index);
  if(scene.relation!==state.selectedRelationId){
    for(const id of [scene.relation,state.selectedRelationId]){
      for(const index of routeIndex.relationsById.get(id)||[])dirtyRoutes.add(index);
    }
  }
  const routes=dirtyRoutes.size?boardThreadDomNodes(stage):null;
  for(const index of [...dirtyRoutes].sort((a,b)=>a-b)){
    const r=layout.relations[index];
    const {selected,active,dim}=boardThreadSelection(r),paths=[],hits=[];
    for(const node of routes.get(index)||[]){
      if(node.classList.contains('boardStringLabel')){
        node.classList.toggle('selected',selected);
        node.classList.toggle('hoverOnly',!relationLabelShown(r,{hover:active}));
        if(stage._boardCaptionsAll===false){
          if(selected&&node.parentNode!==stage)stage.append(node);
          else if(!selected&&node.parentNode===stage)stage._boardCaptionTemplate.append(node);
        }
      }else if(node.classList.contains('boardStringHit')){
        hits.push(node);
      }else{
        if(!node.classList.contains('boardStringShadow')){
          node.classList.toggle('selected',selected);
          node.classList.toggle('mine',active);
        }
        paths.push(node);
      }
    }
    const top=active&&!dim?2:0;
    boardMoveThreadLayer(paths,layers[top]);
    boardMoveThreadLayer(hits,layers[top+1]);
    if(typeof udInkSelectionPaths==='function')udInkSelectionPaths(stage,paths);
  }
  if(dirtyRoutes.size)boardUpdateRaisedThreads(stage,layers[2]);
  if(dirtyRoutes.size&&typeof udInkFinishPaths==='function')udInkFinishPaths(stage);
  if(dirtyRoutes.size)boardCullCaptions(stage);
  scene.selected=selected;scene.selectedEntities=new Set(state.selectedIds);scene.relation=state.selectedRelationId;
  stage._boardThreadKey=boardStringSceneKey(layout,scene.routeStamp);
  if(!overview)boardPlaceFixedTools(view);
  return true;
}
function renderDetective(selectionOnly=false){return guard('Вид Detective',()=>renderDetectiveUnsafe(selectionOnly===true),viewFailed($('#detectiveView'),'Вид Detective'))}
function renderDetectiveUnsafe(selectionOnly=false){
  const el=$('#detectiveView');if(!el)return;
  const drag=state.boardDrag;
  if(drag?.kind==='paper'&&!udRebasePaperDrag(drag))drag.invalidated=true;
  if(state.space&&(state.visualMode!=='detective'||boardThreadFocusKey!==boardCameraKey()))boardSetThreadFocus(false);
  const previousStage=el.querySelector('.boardStage');
  const root=state.visualMode==='detective'&&getEntity(state.scopeId);
  if(root&&selectionOnly&&boardUpdateSelection(el,previousStage))return;
  if(typeof udInkDispose==='function')udInkDispose(previousStage);
  if(typeof udPlateDispose==='function')udPlateDispose(previousStage);
  if(typeof udCullDispose==='function')udCullDispose(previousStage);
  if(typeof udNetDisposePriority==='function')udNetDisposePriority(previousStage);
  if(typeof udPhotoDispose==='function')udPhotoDispose(previousStage);
  previousStage?._boardOverviewObserver?.disconnect();
  if(state.visualMode!=='detective'){el.innerHTML='';return}
  if(!root){el.innerHTML='<div class="boardEmpty">Нет текущего пространства.</div>';return}
  const layout=boardLayout(),strings=boardStringsSvg(layout);
  // The next pointer frame must use the newly rendered visibility and routes.
  if(drag?.kind==='paper'&&drag.delta&&layout.previewStarts&&!drag.invalidated){
    drag.layout=layout;
    drag.ids=[...layout.previewStarts.keys()];
    drag.start=layout.previewStarts;
    if(!drag.start.has(drag.id))drag.invalidated=true;
  }
  const entries=layout.keys?[...layout.positions].map(([id,p])=>({id,p,paper:layout.keys.get(id),e:layout.external?.get(id)||getEntity(layout.keys.get(id)?.entityId||id)})):
    layout.nodes.map(e=>({id:e.id,p:layout.positions.get(e.id),e}));
  const board=layout.keys?boardState().placements:null;
  const composition=board?{board,children:udPlacementChildren(board.items),byId:new Map(board.items.map(p=>[p.id,p]))}:null;
  const focus=layout.keys&&udSelectedPaperId();
  const selected=new Set(entries.filter(({e,paper})=>boardCardSelected(e,paper,focus)).map(({id})=>id));
  const order=boardCardOrder(entries,selected);
  const html=({id,p,paper,e})=>boardCardHtml(e,p,layout.via.get(id),{paper,instanceMode:!!layout.keys,
    hasChildren:composition?.children.get(id)?.length||0,composition});
  const usePlate=typeof udCardPlateEnabled!=='undefined'&&udCardPlateEnabled&&layout.nodes.length>=BOARD_BIG;
  const ordinary=usePlate?order.filter(({id,e})=>!selected.has(id)&&!udDetailsOpen.has(e.id)):[];
  const raised=usePlate?order.filter(({id,e})=>selected.has(id)||udDetailsOpen.has(e.id)):order;
  const cards=usePlate?'<div class="udCardPlate"><div class="udCardPlateWorld">'+ordinary.map(html).join('')+'</div></div>'+raised.map(html).join(''):order.map(html).join('');
  const strCount=layout.relations.filter(r=>!getRT(r.type).containment).length;
  const descriptionEditor=udDetachDescriptionEditor();
  el.innerHTML=`${boardSurfaceHtml()}
  <div class="boardStage">${cards}${boardThreadMarkup(strings,layout)}</div>
  ${layout.nodes.length<=1?'<div class="boardEmpty">На доске пока пусто. Создайте сущности — они появятся здесь бумажками, а связи станут нитками.</div>':''}`;
  const stage=el.querySelector('.boardStage');
  if(typeof udPlateInit==='function')udPlateInit(stage);
  boardInitCaptions(stage,layout);
  boardUpdateRaisedThreads(stage);
  const routeStamp=JSON.stringify(layout.relations);
  stage._boardThreadKey=boardStringSceneKey(layout,routeStamp);
  stage._boardSelection={layout,entries,html,selected,routeStamp,routeIndex:boardSelectionRouteIndex(layout.relations),source:board,version:state.viewVersion,key:boardCameraKey(),
    filters:boardSelectionFilters(),entities:data.entities,relations:data.relations,reveal:state.udPaperReveal,
    selectedEntities:new Set(state.selectedIds),relation:state.selectedRelationId,
    cards:new Map((usePlate?ordinary.concat(raised):order).map(({id},index)=>[id,usePlate&&index<ordinary.length?stage._udCardPlate.world.children[index]:stage.children[usePlate?index-ordinary.length+1:index]]))};
  udRestoreDescriptionEditor(descriptionEditor);
  udDragSchedule();
  // 0.23.8: a big board (250+ cards) is drawn lighter — no shadows under threads and cards: each costs a full repaint of the board.
  el.classList.toggle('bBig',layout.nodes.length>=BOARD_BIG);
  el.dataset.status=`${layout.nodes.length} ${plural(layout.nodes.length,'бумажка','бумажки','бумажек')} · ${strCount} ${plural(strCount,'нитка','нитки','ниток')}`;viewStripSoon();
  applyBoardTransform({initial:true});
  // Вход в другую папку показывает её доску целиком; при первом показе после запуска — сохранённый вид.
  const key=boardCameraKey();
  if(boardRenderedKey!==key){
    const restore=boardRenderedKey===null||boardRenderedWorkspace!==state.workspaceId;
    boardRenderedKey=key;
    boardRenderedWorkspace=state.workspaceId;
    boardQueueCamera(restore?boardEnsureVisible:boardFit);
  }
}
// Во время перетаскивания двигаются только сами бумажки и нитки, без полной перерисовки.
function boardMoveCards(layout,ids=null){
  const v=$('#detectiveView'),stage=v?.querySelector('.boardStage');if(!stage)return;
  const cards=stage._boardSelection?.cards;
  if(ids&&!Array.isArray(ids)&&!(ids instanceof Set))ids=[...ids];
  for(const id of ids||layout.positions.keys()){
    const p=layout.positions.get(id);
    if(!p)continue;
    const attr=layout.keys?.has(id)?'data-ud-paper-id':'data-board-id',cached=cards?.get(id);
    const owns=typeof udPlateOwns==='function'?udPlateOwns(stage,cached):cached?.parentNode===stage;
    const card=owns&&cached.getAttribute(attr)===id?cached:stage.querySelector(`[${attr}="${CSS.escape(id)}"]`);
    if(card){card.style.left=p.x+'px';card.style.top=p.y+'px';if(typeof udPlateMoved==='function')udPlateMoved(stage,card)}
  }
  if(typeof linkKnobSoon==='function')linkKnobSoon();
  if(boardUpdateStrings(layout,stage,ids))return;
  if(typeof udInkDispose==='function')udInkDispose(stage);
  const s=boardStringsSvg(layout);
  stage.querySelectorAll('.boardStrings,.boardStringHits,.boardStringLabel,.boardCaptions').forEach(n=>n.remove());
  stage.insertAdjacentHTML('beforeend',boardThreadMarkup(s,layout));
  boardInitCaptions(stage,layout);
  boardUpdateRaisedThreads(stage);
  boardSyncCaptions(stage,state.space||!(v._boardDetailZoom<.5));
  stage._boardThreadKey=boardStringSceneKey(layout);stage._boardThreadFrame=null;stage._boardThreadNodes=null;stage._boardSelection=null;
  if(typeof udInkCamera==='function')udInkCamera(v,stage,state.boardZoom||1);
}

function boardRefreshSavedPositions(before=null,id=null){
  const view=$('#detectiveView'),stage=view?.querySelector('.boardStage'),scene=stage?._boardSelection;
  if(state.visualMode!=='detective'||!scene?.layout.keys||scene.key!==boardCameraKey()||scene.version+1!==state.viewVersion||
    scene.filters!==boardSelectionFilters()||scene.reveal||state.udPaperReveal||udDescriptionDraft||
    state.boardDrag||udDragScene||udDragPreviews.size)return false;
  const board=boardState().placements;
  if(scene.source!==board)return false;
  if(before){
    const workspace=currentWorkspace(),previous=before.workspaces?.find(w=>w.id===workspace?.id);
    const paper=board?.items.find(p=>p.id===id);
    const previousPaper=previous?.boards?.[boardKey()]?.placements?.items.find(p=>p.id===id);
    if(!paper||!previousPaper)return false;
    // A local write can also merge another tab's changes. Verify that the
    // workspace content only changed by this move before retaining its scene.
    previousPaper.x=paper.x;previousPaper.y=paper.y;
    const workspaceContent=({view,positions,updatedAt,...content})=>content;
    if(!boardValuesEqual(workspaceContent(previous),workspaceContent(workspace)))return false;
  }
  const layout=boardLayout(),moved=new Map();
  if(!layout.keys||layout.positions.size!==scene.entries.length||JSON.stringify(layout.relations)!==scene.routeStamp)return false;
  let index=0;
  for(const [key,position] of layout.positions){
    const entry=scene.entries[index++],card=scene.cards.get(key);
    if(entry.id!==key||!(typeof udPlateOwns==='function'?udPlateOwns(stage,card):card?.parentElement===stage)||entry.paper!==layout.keys.get(key)||
      entry.e!==(layout.external?.get(key)||getEntity(entry.paper?.entityId||key)))return false;
    const {x,y,...style}=position,{x:oldX,y:oldY,...oldStyle}=entry.p;
    if(!boardValuesEqual(style,oldStyle))return false;
    if(oldX!==x||oldY!==y||card.style.left!==x+'px'||card.style.top!==y+'px')moved.set(key,position);
  }
  if(moved.size&&!boardUpdateStrings(layout,stage,moved.keys()))return false;
  for(const entry of scene.entries){
    const position=moved.get(entry.id);if(!position)continue;
    const card=scene.cards.get(entry.id);
    card.style.left=position.x+'px';card.style.top=position.y+'px';
    if(typeof udPlateMoved==='function')udPlateMoved(stage,card);
    entry.p.x=position.x;entry.p.y=position.y;
  }
  scene.layout=layout;scene.version=state.viewVersion;scene.entities=data.entities;scene.relations=data.relations;
  if(view._boardDetailZoom>=.5)boardPlaceFixedTools(view);
  if(typeof linkKnobSoon==='function')linkKnobSoon();
  return true;
}

function boardBounds(layout){
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const p of layout.positions.values()){const w=p.w||BOARD_CARD_W[p.kind]||210;minX=Math.min(minX,p.x-w/2);maxX=Math.max(maxX,p.x+w/2);minY=Math.min(minY,p.y-14);maxY=Math.max(maxY,p.y+Math.max(BOARD_CARD_H,p.h||0)+20)}
  return Number.isFinite(minX)?{minX,maxX,minY,maxY}:null;
}
function boardFit(){
  boardCancelQueuedCamera();
  const v=$('#detectiveView');if(!v)return;const b=boardBounds(boardLayout());
  if(!b){state.boardZoom=1;state.boardPanX=0;state.boardPanY=0}
  else{
    const top=hudOffsetWithin(v)+56,availW=Math.max(200,v.clientWidth-60),availH=Math.max(160,v.clientHeight-top-40);
    const z=clamp(Math.min(availW/(b.maxX-b.minX),availH/(b.maxY-b.minY)),BOARD_ZOOM_MIN,1.4);
    state.boardZoom=z;state.boardPanX=-((b.minX+b.maxX)/2)*z;state.boardPanY=top/2-12-((b.minY+b.maxY)/2)*z;
  }
  applyBoardTransform();updateZoom();persistWorkspaceView();
}
function boardResetView(){boardCancelQueuedCamera();state.boardZoom=1;state.boardPanX=0;state.boardPanY=0;applyBoardTransform();updateZoom();persistWorkspaceView()}
// После переключения на доску бумажки должны быть видны.
function boardEnsureVisible(){
  const v=$('#detectiveView');if(!v||state.visualMode!=='detective')return;
  const cards=[...v.querySelectorAll('[data-board-id]')];if(!cards.length)return;const vr=v.getBoundingClientRect();
  const inView=c=>{const r=c.getBoundingClientRect();return r.right>=vr.left&&r.left<=vr.right&&r.bottom>=vr.top+80&&r.top<=vr.bottom};
  // Доску здесь ещё не раскладывали — показать её целиком; иначе уважать сохранённый вид, пока видна хоть одна бумажка.
  const untouched=!boardNodes().some(boardHasPlace);
  if(untouched?!cards.every(inView):!cards.some(inView))boardFit();
}

// Записывает места бумажек в записи; сохраняет; при неудаче возвращает как было.
function boardCommitPlaces(places,message){
  if(worldReadOnly())return false;

  const before=clone(data);
  for(const [id,p] of places){const e=getEntity(id);if(e)boardSetPlace(e,p)}
  if(!persist()){data=before;normalize();renderDetective();toast('Не удалось сохранить доску — расположение возвращено','err');return false}
  if(message)toast(message,'ok');return true;
}
// Ровная сетка: дело сверху по центру, дальше бумажки по типам, внутри типа — по имени.
function boardArrange(){
  if(udUsesSharedLayout()){
    if(worldReadOnly())return;
    const parentId=udSharedCurrentParent(),layout=boardLayout(),board=boardState().placements;
    const papers=board.items.filter(p=>p.parentId===parentId&&layout.keys.has(p.id)&&!p.locked);
    if(!papers.length)return;
    const typeOrder=new Map((data.entityTypes||[]).map((t,i)=>[t.id,i]));
    const sorted=papers.slice().sort((a,b)=>{const x=getEntity(a.entityId),y=getEntity(b.entityId);return (typeOrder.get(x?.type)??999)-(typeOrder.get(y?.type)??999)||String(x?.name).localeCompare(String(y?.name),'ru')});
    const cols=Math.max(2,Math.ceil(Math.sqrt(sorted.length*1.7))),dx=Math.max(250,...sorted.map(p=>(p.w||270)+32)),dy=Math.max(BOARD_CARD_H+44,...sorted.map(p=>(p.h||BOARD_CARD_H)+44));
    const locked=board.items.filter(p=>p.parentId===parentId&&p.locked),firstY=Math.max(238,...locked.map(p=>p.y+(p.h||BOARD_CARD_H)+44));
    if(udCommitPlacementChange(live=>{
      for(const [i,p] of sorted.entries()){
        const item=live.items.find(x=>x.id===p.id),row=Math.floor(i/cols),col=i%cols,inRow=Math.min(cols,sorted.length-row*cols);
        const x=(col-(inRow-1)/2)*dx,y=firstY+row*dy;
        if(!item||item.locked||!udCoordinate(x)||!udCoordinate(y))return false;
        item.x=x;item.y=y;
      }
    },'Бумажки разложены · Ctrl+Z — вернуть как было'))boardFit();
    return;
  }
  if(udBoardUsesPlacements()){toast('Положение отдельных бумажек меняется перетаскиванием');return}
  // 0.23.6: open cases are laid out again under their folders (their places are dropped), the grid holds the space's own records
  const layout=boardLayout(),rootId=state.scopeId,rest=layout.nodes.filter(e=>e.id!==rootId&&!layout.via.has(e.id));if(!layout.nodes.length)return;
  const typeOrder=new Map((data.entityTypes||[]).map((t,i)=>[t.id,i]));
  rest.sort((a,b)=>(typeOrder.get(a.type)??999)-(typeOrder.get(b.type)??999)||String(a.name).localeCompare(String(b.name),'ru'));
  const cols=Math.max(2,Math.ceil(Math.sqrt(rest.length*1.7))),dx=250,dy=BOARD_CARD_H+44,places=new Map();
  const hasRoot=layout.positions.has(rootId);if(hasRoot)places.set(rootId,{x:0,y:-dy});
  rest.forEach((e,i)=>{const row=Math.floor(i/cols),col=i%cols,inRow=Math.min(cols,rest.length-row*cols);places.set(e.id,{x:(col-(inRow-1)/2)*dx,y:row*dy+(hasRoot?40:0)})});
  if(boardCommit(()=>{for(const [id,p] of places){const e=getEntity(id);if(e)boardSetPlace(e,p)}for(const id of layout.via.keys())boardClearPlace(getEntity(id))},'Доска разложена · Ctrl+Z — вернуть как было'))boardFit()
}
function boardToggleContain(){state.boardContain=state.boardContain===false;renderDetective();persistWorkspaceView();toast(state.boardContain?'Нитки «содержит» показаны':'Нитки «содержит» спрятаны')}
function boardToggleRed(){state.boardRed=!state.boardRed;renderDetective();persistWorkspaceView()}

// ---- 0.23.6: «cases» — open a folder right on the board ----
// A small bar on a folder: open one level / everything inside, show related records, lay the case out, close it again.
function boardCaseBarHtml(e,inside,v){
  const bs=boardState(),open=bs.open[e.id],btn=(attr,label,title,on=false)=>`<button type="button" class="boardCaseBtn${on?' on':''}" ${attr} title="${escapeHtml(title)}"${on?' aria-pressed="true"':''}>${label}</button>`;
  const parts=[];
  if(e.id!==state.scopeId&&inside){
    if(!open)parts.push(btn(`data-board-open="${escapeHtml(e.id)}" data-mode="one"`,'▾ Раскрыть','Выложить на доску то, что внутри (один уровень)'),btn(`data-board-open="${escapeHtml(e.id)}" data-mode="all"`,'⇊ Всё','Выложить всё, что внутри, на всю глубину'));
    else parts.push(btn(`data-board-open="${escapeHtml(e.id)}" data-mode="close"`,'▴ Свернуть','Убрать содержимое дела с доски (сами сущности остаются в мире)'),btn(`data-board-open="${escapeHtml(e.id)}" data-mode="${open==='all'?'one':'all'}"`,open==='all'?'▾ Один уровень':'⇊ Всё',open==='all'?'Показывать только первый уровень':'Показать всё, что внутри, на всю глубину'),btn(`data-board-related="${escapeHtml(e.id)}"`,'🔗 Связанные','Добавить сущности, связанные с этим делом обычными связями (например, квесты его персонажей)',!!bs.rel[e.id]),...(!worldReadOnly()?[btn(`data-board-case-layout="${escapeHtml(e.id)}"`,'⊞','Разложить дело: содержимое рядами по уровням под карточкой')]:[]));
  }
  if(v?.pinned&&!worldReadOnly())parts.push(btn(`data-board-unpin="${escapeHtml(e.id)}"`,'✕ С доски','Убрать с этой доски (сущность остаётся в мире)'));
  return parts.length?`<div class="boardCaseBar">${parts.join('')}</div>`:'';
}
// Board changes go through the usual path: snapshot → change → save (Ctrl+Z works) → on failure everything is put back.
function boardCommit(mutate,okText,afterSave){
  if(worldReadOnly())return false;
  const before=clone(data),bs=snapshotMutationState();
  try{
    if(mutate()===false){restoreWorkspaceMutation(before,bs);updateUI();return false}
  }catch(err){restoreWorkspaceMutation(before,bs);updateUI();toast('Не получилось: '+err.message,'err');return false}
  state.viewVersion++;
  if(!persist()){restoreWorkspaceMutation(before,bs);updateUI();toast('Не удалось сохранить доску — всё возвращено как было','err');return false}
  if(!afterSave?.(before))renderDetective();
  if(okText)toast(okText,'ok');
  return true;
}
// The old board stores positions in board coordinates. An arrow changes
// membership and preserves that one paper without converting the saved board.
function boardNestLegacyArrow(parentId,childId,scene,configureRelation){
  if(worldReadOnly()||state.visualMode!=='detective'||scene!==boardCameraKey()||udBoardUsesPlacements()){
    toast('Исходная доска больше недоступна','err');return false;
  }
  const parent=getEntity(parentId),child=getEntity(childId),layout=boardLayout();
  const point=layout.positions.get(childId);
  if(!parent||!child||!point||!layout.positions.has(parentId)||point.fixed||child.hint||parent.hint){
    toast('Выбранные бумажки недоступны или закреплены','err');return false;
  }
  const previous=data.relations.find(r=>r.from===parentId&&r.to===childId&&getRT(r.type).containment);
  let relation;
  const saved=boardCommit(()=>{
    relation=previous&&!previous.udMembership?previous:addContainment(childId,parentId,{force:true,persist:false});
    if(!relation)return false;
    if(configureRelation)configureRelation(relation);
    boardSetPlace(child,point);
    if(parentId!==boardKey())boardState(boardKey(),true).open[parentId]||='one';
    if(!boardLayout().positions.has(childId)){
      toast('Бумажка не помещается на этой доске','err');return false;
    }
  },'Бумажка помещена внутрь · Ctrl+Z — отменить');
  if(saved)updateUI();
  return saved?relation:false;
}
function boardOpenCase(id,mode){const e=getEntity(id);if(!e)return false;
  if(worldReadOnly()){const bs=boardState();if(mode==='close'){delete bs.open[id];delete bs.rel[id]}else bs.open[id]=mode==='all'?'all':'one';renderDetective();return true}
  return boardCommit(()=>{
    const bs=boardState(boardKey(),true);
    if(mode==='close'){delete bs.open[id];delete bs.rel[id];return}
    bs.open[id]=mode==='all'?'all':'one';
    if(!udPrepareOpenContainerLayouts()){
      toast('Не удалось раскрыть сохранённую раскладку. Проверьте вместимость доски.','err');
      return false;
    }
  },mode==='close'?`Дело «${e.name}» свёрнуто`:`Дело «${e.name}» раскрыто${mode==='all'?' целиком':''}`)}
function boardToggleRelated(id){const e=getEntity(id);if(!e)return false;const on=!boardState().rel[id];
  if(worldReadOnly()){const bs=boardState();if(!bs.open[id])bs.open[id]='one';if(on)bs.rel[id]=true;else delete bs.rel[id];renderDetective();return true}
  return boardCommit(()=>{const bs=boardState(boardKey(),true);if(!bs.open[id])bs.open[id]='one';if(on)bs.rel[id]=true;else{const rel=[...boardLayout().via].filter(([,v])=>v.related&&v.top===id).map(([nid])=>nid);delete bs.rel[id];for(const nid of rel)boardClearPlace(getEntity(nid))}},on?`К делу «${e.name}» добавлены связанные сущности`:`Связанные сущности убраны с дела «${e.name}»`)}
// Lays a case out under its card: level after level (by nesting), related records in the last row.
function boardLayoutCase(id){
  const layout=boardLayout(),top=layout.positions.get(id),e=getEntity(id);if(!top||!e)return false;
  const levels=[];for(const [nid,v] of layout.via){if(v.top!==id)continue;const d=v.related?999:(v.depth||1);(levels[d]=levels[d]||[]).push(nid)}
  const rows=levels.filter(Boolean),dy=BOARD_CARD_H+70,dx=240,places=new Map();
  rows.forEach((row,i)=>{row.sort((a,b)=>{const pa=layout.via.get(a)?.parent,pb=layout.via.get(b)?.parent;return String(pa).localeCompare(String(pb))||String(getEntity(a)?.name).localeCompare(String(getEntity(b)?.name),'ru')});row.forEach((nid,j)=>places.set(nid,{x:top.x+(j-(row.length-1)/2)*dx,y:top.y+(i+1)*dy}))});
  if(!places.size){toast('Сначала раскройте дело — тогда будет что раскладывать','err');return false}
  return boardCommit(()=>{for(const [nid,p] of places){const x=getEntity(nid);if(x)boardSetPlace(x,p)}},`Дело «${e.name}» разложено по уровням · Ctrl+Z — вернуть`);
}
// Pinned records: a record from any place of the world lies on this board too.
function boardPin(id){const e=getEntity(id);if(!e)return false;if(udBoardUsesPlacements())return udCommitPlacementChange(board=>!!udPlaceAtContext(id,board,udSharedCurrentParent()),`«${e.name}» прикреплена к доске`);if(boardNodes().some(x=>x.id===id)){toast(`«${e.name}» уже на доске`,'ok');return false}return boardCommit(()=>{const bs=boardState(boardKey(),true);if(!bs.pins.includes(id))bs.pins.push(id)},`«${e.name}» прикреплена к доске`)}
function boardUnpin(id){const e=getEntity(id);return boardCommit(()=>{const bs=boardState(boardKey(),true);bs.pins=bs.pins.filter(x=>x!==id);if(e?.board?.fixed)delete e.board.fixed[boardKey()];if(e)boardClearPlace(e)},`«${e?.name||'Сущность'}» убрана с доски`)}
function boardOpenPinPicker(){
  if(worldReadOnly())return;

  openModal('Прикрепить к доске',`<div class="form"><input id="boardPinSearch" placeholder="Название сущности из любого места мира…" autocomplete="off"><div class="boardPinList" id="boardPinList"></div><div class="inlineHelp">Сущность появится на этой доске с пометкой 📌, а в мире останется на своём месте.</div></div>`,'<button class="btn" id="cancelModal">Закрыть</button>');
  const layout=boardLayout();
  const on=new Set(layout.keys?[boardKey(),...[...layout.keys.values()].map(p=>p.entityId)]:layout.nodes.map(e=>e.id));
  const draw=()=>{const q=searchFold(($('#boardPinSearch')?.value||'').trim());const list=data.entities.filter(e=>!on.has(e.id)&&(!q||entitySearchText(e).includes(q))).slice(0,40);$('#boardPinList').innerHTML=list.length?list.map(e=>`<button type="button" class="listItem boardPinItem" data-pin-id="${escapeHtml(e.id)}"><span class="listIcon">${escapeHtml(getET(e.type).icon||'•')}</span><span class="listMeta"><b>${escapeHtml(e.name)}</b><small>${escapeHtml(getET(e.type).name)} · ${escapeHtml(getEntity(containmentParent(e.id))?.name||'верхний уровень')}</small></span></button>`).join(''):'<div class="empty">Ничего не найдено.</div>'};
  draw();$('#boardPinSearch').addEventListener('input',draw);$('#boardPinSearch').focus();
  $('#boardPinList').addEventListener('click',ev=>{const b=ev.target.closest('[data-pin-id]');if(!b)return;closeModal();boardPin(b.dataset.pinId)});
  $('#cancelModal').onclick=closeModal;
}


