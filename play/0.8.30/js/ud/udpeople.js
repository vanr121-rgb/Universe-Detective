// Universe Detective — отдельная панель «Игроки».
'use strict';
let udPeopleListHtml='';
function udPeopleSetOpen(open){
  const box=$('#udPeople'),button=$('#udPeopleBtn');
  box.hidden=!open;
  button.classList.toggle('active',open);
  button.setAttribute('aria-expanded',String(open));
  if(open)udPeopleRefresh();
}
function udPeopleRefresh(){
  const box=$('#udPeople');
  if(!box||box.hidden)return;
  const net=!!window.UG_ONLINE_PLAYER;
  const gm=net?onp.gm:partGm(),me=net?onp.me?.id:'gm';
  const hosting=!net&&onh.ready;
  const connected=onh.open&&!net?new Set(onhPlayers().map(p=>p.id)):new Set();
  const people=net?onp.avatars:(hosting?partList():partsInWorld()).map(p=>({...p,online:connected.has(p.id)}));
  const places=new Map((hosting||net?prs.list:[]).map(person=>[person.id,person.p]));
  const rows=gm?[{...gm,id:'gm',online:net?onp.state==='in':hosting},...people]:people;
  const list=rows.map(p=>{
    const color=partColorOk(p.color)?p.color:PART_COLORS[0];
    const role=p.id==='gm'?'Мастер':p.role==='viewer'?'Зритель':'Игрок';
    const online=net?(p.id===me?onp.state==='in':onp.state==='in'&&p.online):p.online;
    const place=online?prsPlaceName(p.id===me&&!viewAsPlayer()?prsPlace().p:places.get(p.id)):'';
    const transfer=!net&&p.id!=='gm'&&online?`<button type="button" class="btn tiny" data-ud-player-zone="${escapeHtml(p.id)}">В зону…</button>`:'';
    return `<li data-ud-person="${escapeHtml(p.id)}">${partAvatarHtml(p,'partAva small')}<div><b style="--part-c:${color}">${escapeHtml(p.name)}</b><small>${role} · ${online?'в игре':'не в игре'}${place?' · '+escapeHtml(place):''}${p.id===me?' · это вы':''}</small></div>${transfer}</li>`;
  }).join('');
  if(list!==udPeopleListHtml){$('#udPeopleList').innerHTML=list;udPeopleListHtml=list}
  const manage=!net&&!viewAsPlayer();
  $('#udPeopleManage').hidden=!manage;
  $('#udPeopleUpload').hidden=net?onp.state!=='in'||!me:!manage;
  $('#udPeopleFile').disabled=net&&onp.avatarPending;
}
{
  const button=$('#udPeopleBtn'),box=$('#udPeople');
  box.addEventListener('click',ev=>{const b=ev.target.closest?.('[data-ud-player-zone]');if(b)udOpenPlayerZoneTransfer(b.dataset.udPlayerZone)});
  button.addEventListener('click',()=>udPeopleSetOpen(box.hidden));
  $('#udPeopleManage').addEventListener('click',()=>{
    if(uiIsPlayer())return;
    udPeopleSetOpen(false);
    openParticipants();
  });
  $('#udPeopleFile').addEventListener('change',async ev=>{
    const input=ev.target,file=input.files?.[0];
    input.value='';
    if(!file)return;
    const net=!!window.UG_ONLINE_PLAYER;
    const me=net?onp.me?.id:null,ws=net?onp.ws:null;
    if(net?onp.state!=='in'||!me||onp.avatarPending:viewAsPlayer())return;
    if(net)onp.avatarPending=true;
    udPeopleRefresh();
    let sent=false;
    try{
      const avatar=await partAvatarFromFile(file);
      if(net){
        if(onp.state!=='in'||onp.me?.id!==me||onp.ws!==ws)return;
        ws.send(JSON.stringify({t:'avatar',avatar}));
        sent=true;
      }else if(!viewAsPlayer()){
        const result=partSetGm({avatar});
        toast(result.ok?'Картинка аватара сохранена':result.error,result.ok?'ok':'err');
      }
    }catch(e){
      toast('Не удалось загрузить картинку аватара','err');
    }finally{
      if(net&&!sent&&onp.ws===ws)onp.avatarPending=false;
      udPeopleRefresh();
    }
  });
  document.addEventListener('pointerdown',ev=>{
    if(!box.hidden&&!box.contains(ev.target)&&!button.contains(ev.target))udPeopleSetOpen(false);
  });
  document.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'&&!box.hidden){udPeopleSetOpen(false);button.focus()}
  });
}
