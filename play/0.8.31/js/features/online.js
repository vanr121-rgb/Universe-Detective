// Universe Graph — окно «Игра по сети» (0.30.2): сервер-посредник. Адрес сервера → «Текст установки» (вставить в консоль
// сервера) → «Проверить связь». Ключ сервера живёт в служебной части программы (ug-online.js); окно видит его только внутри
// текста установки. Работает в программе для Windows (в браузере — пояснение). 0.30.3: «Открыть игрокам», ссылка, кто в игре.
// Модуль загружается обычным <script> после participants.js; имена — с приставкой onl.
'use strict';
const onlUI={st:null,text:'',busy:false,result:null};
function onlApi(){return window.universeDesktop?.online||null}
function onlWhen(iso){const d=new Date(iso||'');return Number.isFinite(d.getTime())?d.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}
function onlSshHost(url){const d=String(url||'').replace(/^https?:\/\//,'').replace(/[/:].*$/,'');const m=d.match(/^(\d+)-(\d+)-(\d+)-(\d+)\.sslip\.io$/);return m?m.slice(1).join('.'):d||'IP'}
function onlStatusHtml(){
  const s=onlUI.st;if(!s)return '';
  if(!s.address)return '<span>Сервер ещё не указан.</span>';
  const chk=s.lastCheck?(s.lastCheck.ok?`<span class="onlOk">✓ связь есть</span> (${escapeHtml(onlWhen(s.lastCheck.at))})`:`<span class="onlBad">✗ связи не было</span> (${escapeHtml(onlWhen(s.lastCheck.at))})`):'связь ещё не проверяли';
  return `<span>Сервер: <b>${escapeHtml(s.url||s.address)}</b></span><span>${s.hasKey?'ключ сервера создан':'ключа ещё нет — он появится в тексте установки'}</span><span>${chk}</span>`;
}
// UD 0.3: two ways — the server on this computer (free, default) or a rented relay (later)
const ONL_LINK_KIND={local:'На этом же компьютере',internet:'Через интернет (постоянный кеш)', 'internet-direct':'Прямая запасная ссылка (без общего кеша)',lan:'В своей сети — Wi-Fi или кабель',radmin:'Через Radmin VPN',hamachi:'Через Hamachi',public:'Прямой адрес (нужен проброс порта на роутере)'};
/* «own» only when the program says so: an older service part (or the tests' stand-in) knows only the rented relay */
const onlIsOwn=()=>(onlUI.st||{}).mode==='own';
function onlModeHtml(s){if(typeof onlApi()?.setMode!=='function')return '';return `<div class="onlModes" role="radiogroup" aria-label="Как игроки подключаются">
  <label class="onlMode${s.mode==='own'?' active':''}"><input type="radio" name="onlMode" value="own"${s.mode==='own'?' checked':''}><b>Сервер на этом компьютере</b><small>Бесплатно. Ваша программа сама становится сервером.</small></label>
  <label class="onlMode${s.mode==='relay'?' active':''}"><input type="radio" name="onlMode" value="relay"${s.mode==='relay'?' checked':''}><b>Свой арендованный сервер</b><small>Понадобится адрес настроенного сервера.</small></label></div>`}
function onlOwnHtml(){
  const r=onlUI.result;
  return `<p class="onlIntro">Пока игра открыта, этот компьютер — сервер: мир у вас, игроки заходят по ссылке в браузере. Компьютер должен быть включён, программа — открыта.</p>
  <small class="onlHint">Windows может спросить «Разрешить доступ» для Universe Detective — нажмите «Разрешить» (для частных сетей), иначе игроки не достучатся.</small>
  ${r&&!r.ok?`<div class="onlResult isBad" role="status">${escapeHtml(r.error||'Не получилось')}</div>`:''}
  ${onlGameHtml()}`;
}
function onlLinksHtml(){
  const links=onh.links||[],t=onh.tunnel||{state:'off'},can=onlUI.st?.canTunnel!==false;
  const rows=links.map((l,i)=>`<div class="onlLinkRow"><label for="onlLink${i}">${escapeHtml(ONL_LINK_KIND[l.kind]||'Ссылка')}</label><div class="onlRow"><input id="onlLink${i}" readonly value="${escapeHtml(l.url)}"><button type="button" class="btn${i?'':' primary'}" data-onl-link="${i}">Скопировать</button></div></div>`).join('');
  const tun=!onh.ready?'':t.state==='on'?`<button type="button" class="btn" data-onl-tunnel="off">Выключить доступ через интернет</button>`
    :t.state==='download'?`<span class="onlBusy">Скачиваю туннель Cloudflare (один раз, ~60 МБ)…</span>`:t.state==='starting'?`<span class="onlBusy">Получаю адрес у Cloudflare…</span>`
    :can?`<button type="button" class="btn" data-onl-tunnel="on">🌐 Открыть и через интернет (бесплатно, Cloudflare)</button>`:'';
  return `${rows||'<small class="onlHint">У этого компьютера не нашлось адреса в сети — подключите Wi-Fi или кабель.</small>'}
    <div class="onlActs">${tun}</div>${t.error?`<div class="onlResult isBad" role="status">${escapeHtml(t.error)}</div>`:''}
    <small class="onlHint">В домашней сети ссылка открывается по HTTP. Для подключения через интернет можно получить защищённую ссылку. Друзья далеко — или «через интернет» (ссылка меняется при каждом открытии), или Radmin VPN у всех (тогда подойдёт ссылка «Через Radmin VPN»).</small>`;
}
function onlBodyHtml(){
  if(onlApi()&&onlIsOwn())return onlModeHtml(onlUI.st||{})+onlOwnHtml();
  if(!onlApi())return `<p class="onlIntro">Игру по сети открывает Мастер в программе Universe Detective на своём компьютере, а игроки заходят по ссылке в браузере. В браузере эта часть недоступна.</p>`;
  const s=onlUI.st||{};const r=onlUI.result;
  return `${onlModeHtml(s)}<p class="onlIntro">Игроки подключаются к вам через ваш сервер-посредник — маленький арендованный сервер. Он только пересылает сообщения: мир хранится у вас. Нужно один раз указать адрес сервера и установить на него посредника.</p>
  <div class="form onlForm"><label for="onlAddr">Адрес сервера</label><div class="onlRow"><input id="onlAddr" value="${escapeHtml(s.address||'')}" placeholder="IP сервера, например 185.12.34.56" autocomplete="off" spellcheck="false"><button type="button" class="btn" data-onl-save>Сохранить</button></div>
  <small class="onlHint">Адрес есть в панели хостинга. Для IP программа сама возьмёт бесплатное имя вида 185-12-34-56.sslip.io — оно нужно для защищённого соединения.</small></div>
  <div class="onlStatus">${onlStatusHtml()}</div>
  <div class="onlActs"><button type="button" class="btn" data-onl-install>Текст установки</button><button type="button" class="btn primary" data-onl-check>Проверить связь</button>${s.hasKey?'<button type="button" class="btn" data-onl-newkey>Новый ключ…</button>':''}</div>
  <div class="onlResult${r?(r.ok?' isOk':' isBad'):''}" role="status">${r?escapeHtml(r.ok?'Связь есть: посредник отвечает и принял ключ. Можно открывать игру игрокам.':r.error||'Не получилось'):''}</div>
  ${s.hasKey?onlGameHtml():''}
  ${onlUI.text?`<div class="onlInstall"><ol><li>Откройте консоль сервера: в панели хостинга кнопка «Консоль», или в Windows — PowerShell и команда <code>ssh root@${escapeHtml(onlSshHost(s.url))}</code>.</li><li>Нажмите «Скопировать», вставьте текст в консоль и нажмите Enter.</li><li>Дождитесь слова «ГОТОВО» (2–5 минут) и нажмите «Проверить связь».</li></ol>
    <textarea id="onlText" readonly rows="6" spellcheck="false" aria-label="Текст установки">${escapeHtml(onlUI.text)}</textarea>
    <div class="onlActs"><button type="button" class="btn primary" data-onl-copy>Скопировать</button><small class="onlHint">В тексте — ключ вашего сервера. Не пересылайте его другим людям.</small></div></div>`:''}`;
}
// 0.30.3: the game itself — open to the players, the link, who is in, «спрашивать меня»
function onlGameHtml(){
  const nr=typeof rvwCount==='function'?rvwCount():0,hasLog=typeof rvwLog==='function'&&rvwLog().length>0;
  const rv=hasLog?`<div class="onlActs"><button type="button" class="btn${nr?' primary':''}" data-onl-review>📋 Новое от игроков${nr?` (${nr})`:''}</button></div>`:'';
  const ws=onh.open?onhWorld():currentWorkspace(),name=escapeHtml(ws?.name||'мир'),parts=typeof partsInWorld==='function'?partsInWorld(onh.open?onh.wsId:state.workspaceId):[];
  const ask=`<label class="partCheck onlAskRow"><input type="checkbox" id="onlAsk"${onh.ask?' checked':''}> Спрашивать меня, когда кто-то входит</label>`;
  if(!onh.open)return `<div class="onlGame"><h4>Игра</h4>${parts.length?`<div class="onlActs"><button type="button" class="btn primary" data-onl-open>▶ Открыть игрокам мир «${name}»</button></div><small class="onlHint">Войти смогут участники этого мира (${parts.length}): ${parts.map(p=>escapeHtml(p.name)).join(', ')}.</small>`:`<p class="onlHint">В этом мире ещё нет участников. <button type="button" class="btn" data-onl-parts>Добавить участников…</button></p>`}${ask}${rv}</div>`;
  const pl=onhPlayers();
  return `<div class="onlGame isOpen"><h4>Игра</h4><div class="onlLive">${onh.ready?`<span class="onlOk">● Игра открыта</span> — мир «${name}»`:'<span class="onlBad">● Подключаюсь к серверу…</span>'}</div>
    ${onlIsOwn()?onlLinksHtml():`<label for="onlLink">Ссылка для игроков</label><div class="onlRow"><input id="onlLink" readonly value="${escapeHtml(onh.url)}"><button type="button" class="btn primary" data-onl-link>Скопировать</button></div>`}
    <small class="onlHint">Отправьте её игрокам (например, в Discord). Игрок выбирает свой аватар и вводит пароль. Создайте аватары в панели «Игроки».</small>
    <div class="onlPlayers">${pl.length?pl.map(p=>`<div class="partRow">${partAvatarHtml(p,'partAva small')}<div class="partWho"><b>${escapeHtml(p.name)}</b><small>${p.role==='viewer'?'зритель':'игрок'} · в игре с ${escapeHtml(new Date(p.at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}${(()=>{const v=onh.pres?.get(p.id);return v?` · ${escapeHtml(prsPlaceName(v.p))}${v.ms?` · ${v.ms} мс`:''}`:''})()}</small></div><button type="button" class="btn" data-onl-kick="${escapeHtml(p.c)}">Отключить</button></div>`).join(''):'<div class="empty">Пока никого нет в игре.</div>'}</div>
    ${ask}${rv}<div class="onlActs">${pl.length>1?'<button type="button" class="btn" data-onl-kickall>Отключить всех</button>':''}<button type="button" class="btn danger" data-onl-stop>■ Закрыть игру</button></div></div>`;
}
function onlRender(){const box=$('#onlBody');if(box)box.innerHTML=onlBodyHtml()}
async function onlRefresh(){const api=onlApi();if(!api)return;try{onlUI.st=await api.status()}catch{onlUI.st=null}onlRender()}
async function onlSaveAddress(){const api=onlApi(),v=$('#onlAddr')?.value||'';if(!api)return false;const r=await api.setAddress(v);
  if(!r.ok){onlUI.result={ok:false,error:r.error};onlRender();return false}
  onlUI.st=r;if(onlUI.text)onlUI.text='';onlUI.result=null;onlRender();toast('Адрес сервера сохранён','ok');return true}
async function onlAct(fn){if(onlUI.busy)return;onlUI.busy=true;$('#onlBody')?.classList.add('isBusy');try{await fn()}finally{onlUI.busy=false;$('#onlBody')?.classList.remove('isBusy')}}
function openOnline(){
  if(uiIsPlayer())return;

  onlUI.text='';onlUI.result=null;
  openModal('Игра по сети',`<div id="onlBody">${onlBodyHtml()}</div>`,`<button type="button" class="btn primary" id="onlClose">Готово</button>`);
  $('#onlClose').onclick=closeModal;onlRefresh();
  const box=$('#onlBody');
  box.addEventListener('change',ev=>{
    if(ev.target.name==='onlMode'){const api=onlApi(),want=ev.target.value;if(!api?.setMode)return;onlAct(async()=>{const r=await api.setMode(want);if(r?.ok){onlUI.st=r;onlUI.result=null;onlUI.text=''}else toast(r?.error||'Не удалось переключить','err');onlRender()});return}
    if(ev.target.id==='onlAsk'){onh.ask=ev.target.checked;try{UniverseGraphStorage.setSetting('ug-online-ask',onh.ask?'1':'0')}catch(e){settingSaveFailed(e)}}});
  box.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target.id==='onlAddr'){ev.preventDefault();ev.stopPropagation();onlAct(onlSaveAddress)}});
  box.addEventListener('click',ev=>{const t=ev.target instanceof Element?ev.target:null;if(!t)return;const api=onlApi();if(!api)return;
    if(t.closest('[data-onl-save]')){onlAct(onlSaveAddress);return}
    if(t.closest('[data-onl-open]')){onlAct(async()=>{const r=await onhOpen();if(!r.ok){onlUI.result={ok:false,error:r.error||'Не удалось открыть игру'}}else{onlUI.result=null;toast('Игра открыта — отправьте ссылку игрокам','ok')}onlRender()});return}
    if(t.closest('[data-onl-stop]')){if(!confirm('Закрыть игру? Все игроки будут отключены.'))return;onlAct(async()=>{await onhClose();toast('Игра закрыта','ok');onlRender();/* 0.30.7: something from the players to look at — the review right away */if(typeof rvwCount==='function'&&rvwCount())openPlayerReview()});return}
    if(t.closest('[data-onl-review]')){openPlayerReview();return}
    if(t.closest('[data-onl-kickall]')){if(!confirm('Отключить всех игроков? Игра останется открытой — войти снова смогут, только если вы пустите.'))return;const n=onhKickAll();toast(`Отключены все (${n})`,'ok');onlRender();return}
    if(t.closest('[data-onl-parts]')){closeModal();openParticipants({add:true});return}
    const kb=t.closest('[data-onl-kick]');if(kb){const p=onhPlayers().find(x=>x.c===kb.dataset.onlKick);if(p&&confirm(`Отключить «${p.name}» от игры?`)){onhKick(p.c);toast(`«${p.name}» отключён`,'ok')}return}
    if(t.closest('[data-onl-tunnel]')){const on=t.closest('[data-onl-tunnel]').dataset.onlTunnel==='on';onlAct(async()=>{const r=await api.tunnel(on);if(on&&r?.ok)toast('Доступ через интернет открыт — отправьте игрокам верхнюю ссылку','ok');else if(on&&r&&!r.ok)toast(r.error||'Не удалось','err');onlRender()});return}
    if(t.closest('[data-onl-link]')){const inp=$('#onlLink'+(t.closest('[data-onl-link]').dataset.onlLink||''))||$('#onlLink');const v=inp?.value||'';navigator.clipboard.writeText(v).then(()=>toast('Ссылка скопирована','ok'),()=>{inp?.select();toast('Не удалось скопировать — выделил ссылку: нажмите Ctrl+C','err')});return}
    if(t.closest('[data-onl-install]')||t.closest('[data-onl-newkey]')){const fresh=!!t.closest('[data-onl-newkey]');
      if(fresh&&!confirm('Создать новый ключ сервера? Старый перестанет подходить: текст установки нужно будет вставить на сервер ещё раз.'))return;
      onlAct(async()=>{const typed=$('#onlAddr')?.value.trim();if(typed!==(onlUI.st?.address||'')&&!(await onlSaveAddress()))return;
        const r=await api.installText(fresh);if(!r.ok){onlUI.result={ok:false,error:r.error};onlRender();return}
        onlUI.text=r.text;onlUI.result=null;await onlRefresh();setTimeout(()=>$('#onlText')?.scrollIntoView({block:'nearest'}),0)});return}
    if(t.closest('[data-onl-copy]')){const ta=$('#onlText');if(!ta)return;navigator.clipboard.writeText(ta.value).then(()=>toast('Текст установки скопирован — вставьте его в консоль сервера','ok'),()=>{ta.focus();ta.select();toast('Не удалось скопировать — выделил текст: нажмите Ctrl+C','err')});return}
    if(t.closest('[data-onl-check]')){onlAct(async()=>{const typed=$('#onlAddr')?.value.trim();if(typed!==(onlUI.st?.address||'')&&!(await onlSaveAddress()))return;
      onlUI.result={ok:false,error:'Проверяю…'};onlRender();const r=await api.check();onlUI.result=r;await onlRefresh();if(r.ok)toast('Связь с сервером есть','ok')});return}
  });
}


