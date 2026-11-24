// Universe Graph — Общие мелкие функции: выбор элементов, числа, id, копирование, экранирование, проверка цветов и CSS.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
// 0.25.5: interface scale in a browser tab is CSS zoom on the page (the desktop app zooms the whole window instead).
// Under CSS zoom, mouse positions, getBoundingClientRect and innerWidth are in SCREEN pixels, while style.left/top and
// offsetWidth of a zoomed element are in its own CSS pixels. zpx() turns a screen distance into CSS px, zsc() the reverse.
// The map, Galaxy, Detective board and the selection box are counter-zoomed (fixes.css) — their maths stays in screen px.
let uiCssZoom=1;
function uiZ(){return uiCssZoom||1}
function zpx(v){return v/uiZ()}
function zsc(v){return v*uiZ()}
const APP_VERSION='ud-0.8.30'; /* Universe Detective; worlds note which program saved them (data.metadata.appVersion) */

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
// NaN/undefined used to pass straight through (clamp(NaN,0,1) === NaN); now they fall back to the lower bound.
const clamp=(n,a,b)=>Number.isFinite(n)?Math.max(a,Math.min(b,n)):a;
// Russian plural form: plural(5,'бумажка','бумажки','бумажек') → «бумажек».
const plural=(n,one,few,many)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many};
// Random part from crypto (Math.random could yield a 1-3 character suffix, e.g. for 0.5).
// 0.29 (аудит, находка 2г): a personal setting that could not be written is said once — otherwise the choice silently comes back
// after a restart.
let settingSaveNoted=false;
function settingSaveFailed(e){console.warn('setting save',e);if(settingSaveNoted)return;settingSaveNoted=true;try{toast('Не удалось сохранить настройку — после перезапуска она может вернуться к прежней','err')}catch{}}
const uid=(p='id')=>{const a=new Uint32Array(2);crypto.getRandomValues(a);return p+'-'+a[0].toString(36).padStart(7,'0').slice(-7)+'-'+(a[1]%1679616).toString(36).padStart(4,'0')};
const clone=o=>JSON.parse(JSON.stringify(o));
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

// One colour validator for the whole app (widgetColor used to duplicate it). Short #abc is expanded.
function hexOr(v,fallback){const s=String(v??'').trim();if(/^#[0-9a-fA-F]{6}$/.test(s))return s;if(/^#[0-9a-fA-F]{3}$/.test(s))return '#'+[...s.slice(1)].map(c=>c+c).join('');return fallback}
const normalizeHex=v=>hexOr(v,'#74b8ff');
// Backslash is refused too: CSS escapes (\75 rl(...)) could otherwise spell url( and slip past the check.
function safeCssValue(v,fallback='transparent'){const s=String(v??'').trim();if(!s||/[;{}<>'"`\\]/.test(s)||/url\s*\(|expression\s*\(|@import/i.test(s))return fallback;return s.slice(0,180)}

// 0.23.9: «a moment after the movement stops» measured in frames, not milliseconds: run `done` once there were 3 frames
// in a row without a new movement and at least 150 ms passed. A fixed or guessed pause was shorter than one frame on a slow
// computer, so the expensive sharp redraw happened in the middle of scrolling (lessons 0.23.7, 0.23.9).
const settleState=new Map();
function settleAfterMoves(key,done){let s=settleState.get(key);if(!s){s={frames:0,at:0,raf:0,done};settleState.set(key,s)}s.done=done;s.frames=0;s.at=performance.now();
  if(s.raf)return;const tick=()=>{if(s.frames>=3&&performance.now()-s.at>=150){s.raf=0;const f=s.done;s.done=null;f&&f();return}s.frames++;s.raf=requestAnimationFrame(tick)};s.raf=requestAnimationFrame(tick)}
// 0.30.9: an editor window saves every field it shows. Someone else (a player in the online game) may have changed the same
// thing while the window was open: what this person did NOT touch keeps the other's newer value (one level deeper for
// records — properties, sections, style). obj — after the form was written, opened — when the window opened,
// live — right before the form was written. Returns the kept field names.
function keepTheirChanges(obj,opened,live){
  const kept=[];if(!obj||!opened||!live)return kept;const J=v=>JSON.stringify(v===undefined?null:v),rec=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  for(const k of new Set([...Object.keys(opened),...Object.keys(live)])){
    if(k==='id'||k==='updatedAt'||k==='createdAt'||J(live[k])===J(opened[k]))continue; /* nobody else changed it */
    if(J(obj[k])===J(opened[k])){if(live[k]===undefined)delete obj[k];else obj[k]=clone(live[k]);kept.push(k);continue} /* only they changed it */
    if(rec(obj[k])&&rec(opened[k])&&rec(live[k]))for(const kk of new Set([...Object.keys(opened[k]),...Object.keys(live[k])])){
      if(J(live[k][kk])===J(opened[k][kk])||J(obj[k][kk])!==J(opened[k][kk]))continue;if(live[k][kk]===undefined)delete obj[k][kk];else obj[k][kk]=clone(live[k][kk]);kept.push(k+'.'+kk)}
  }
  return kept;
}
function keptChangesToast(kept){if(!kept?.length)return;const names=typeof RVW_FIELD_NAMES==='object'?RVW_FIELD_NAMES:{};const list=[...new Set(kept.map(k=>names[k.split('.')[0]]||k.split('.')[0]))];
  toast(`Пока окно было открыто, это поменял кто-то ещё (${list.join(', ')}) — его изменение оставлено, ваше сохранено`,'ok')}


