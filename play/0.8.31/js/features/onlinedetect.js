// Universe Graph — «режим игрока» (0.30.3). Загружается ПЕРВЫМ, до хранилища: если страницу открыли по ссылке игры
// (https://<сервер>/r/<комната>/), программа работает как клиент игрока — мир приходит от Мастера и живёт только в памяти.
'use strict';
function udStableParseInvite(hash,config){
  try{
    if(typeof hash!=='string'||hash.length>1200)return null;
    const params=new URLSearchParams(hash.replace(/^#/,''));if([...params.keys()].length!==2||params.getAll('server').length!==1||params.getAll('key').length!==1)return null;
    const u=new URL(params.get('server')),key=params.get('key'),m=u.pathname.match(/^\/r\/([a-z0-9]{8,32})\/$/);
    const cloud=u.protocol==='https:'&&!u.port&&/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(u.hostname);
    const local=config?.allowLocal===true&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)&&!!u.port;
    if(!m||(!cloud&&!local)||u.username||u.password||u.search||u.hash||!/^[A-Za-z0-9_-]{122}$/.test(key||''))return null;
    return Object.freeze({stable:true,gameRoom:m[1],room:m[1]+'@'+key,masterKey:key,ws:(u.protocol==='https:'?'wss://':'ws://')+u.host+u.pathname+'ws'});
  }catch{return null}
}
function udStableB64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function udStableUnb64(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
function udStableSocket(config){const nonce=udStableB64(crypto.getRandomValues(new Uint8Array(32))),url=new URL(config.ws);url.searchParams.set('ud-challenge',nonce);return {url:url.href,nonce}}
async function udStableVerify(config,nonce,message){try{
  if(!message||message.t!=='identity'||message.room!==config.gameRoom||!/^[A-Za-z0-9_-]{86}$/.test(message.signature||''))return false;
  const key=await crypto.subtle.importKey('spki',udStableUnb64(config.masterKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,udStableUnb64(message.signature),new TextEncoder().encode('UD-PLAYER-1\0'+config.gameRoom+'\0'+nonce));
}catch{return false}}
window.UG_ONLINE_PLAYER=(()=>{try{
  if(window.universeDesktop||!/^https?:$/.test(location.protocol))return null;
  if(window.UD_STABLE_CLIENT){const config=window.UD_STABLE_CLIENT,invite=location.origin===config.origin?udStableParseInvite(location.hash,config):null;document.documentElement.classList.add('ugOnlinePlayer');if(invite){window.addEventListener('hashchange',()=>location.reload());return invite}location.replace(config.home);return Object.freeze({stable:true,invalid:true,room:'invalid',ws:''})}
  const m=location.pathname.match(/^\/r\/([a-z0-9]{8,32})\/(?:index\.html)?$/);if(!m)return null;
  document.documentElement.classList.add('ugOnlinePlayer');
  return Object.freeze({room:m[1],ws:(location.protocol==='https:'?'wss://':'ws://')+location.host+'/r/'+m[1]+'/ws'});
}catch{return null}})();

