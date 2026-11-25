// Universe Graph — защита от сбоев (0.16). Загружается ПЕРВЫМ, до всех остальных модулей.
//  • ошибка при запуске → понятный экран вместо пустого/белого окна, с выходом «сохранить данные в файл»;
//  • ошибка во время работы → короткое предупреждение, программа продолжает работать;
//  • guard(): обёртка для отрисовки видов — сломанный узел не останавливает весь вид;
//  • отчёт о данных, которые пришлось починить при загрузке или импорте.
'use strict';
let appBooted=false;
function safetyText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function errorReport(error,phase){
  return [`Universe Graph ${typeof APP_VERSION==='string'?APP_VERSION:''}`,`Этап: ${phase}`,`Время: ${new Date().toISOString()}`,`Ошибка: ${error?.message||error}`,'',String(error?.stack||'').split('\n').slice(0,12).join('\n')].join('\n');
}
// The stored world exactly as it is on disk (or in the browser), without parsing it.
function rawStoredWorld(){try{return window.UniverseGraphStorage?.getItem('universe-graph-v5')||null}catch{return null}}

// Full-screen recovery screen. Saving is switched off first, so nothing broken is written over the data.
function showFatalScreen(error,phase='работы'){
  try{if(typeof persistenceLocked!=='undefined')persistenceLocked=true;if(typeof autosaveTimer!=='undefined')clearInterval(autosaveTimer)}catch{}
  console.error('[Universe Graph] fatal',error);
  if(document.getElementById('fatalScreen'))return;
  const report=errorReport(error,phase);
  const el=document.createElement('div');el.id='fatalScreen';el.className='fatalScreen';el.setAttribute('role','alertdialog');
  el.innerHTML=`<div class="fatalCard"><h1>Universe Graph не смог продолжить</h1>
    <p>Произошла ошибка во время ${safetyText(phase)}. <b>Сохранённые данные не изменены</b>: запись на диск остановлена, чтобы ничего не испортить.</p>
    <p class="fatalWhat">${safetyText(error?.message||error)}</p>
    <div class="fatalActions"><button type="button" class="btn primary" data-fatal="reload">Перезапустить</button><button type="button" class="btn" data-fatal="save">Сохранить данные в файл</button><button type="button" class="btn" data-fatal="copy">Скопировать отчёт об ошибке</button></div>
    <p class="fatalHint">Если ошибка повторяется: сохраните данные в файл, затем восстановите резервную копию (кнопка ⟳ в верхней панели) или отправьте отчёт разработчику.</p>
    <details><summary>Технические подробности</summary><pre>${safetyText(report)}</pre></details></div>`;
  el.addEventListener('click',e=>{
    const a=e.target.closest?.('[data-fatal]')?.dataset.fatal;if(!a)return;
    if(a==='reload')location.reload();
    if(a==='copy')navigator.clipboard?.writeText(report).then(()=>e.target.textContent='Отчёт скопирован',()=>e.target.textContent='Не удалось скопировать');
    if(a==='save'){const raw=rawStoredWorld();if(!raw){e.target.textContent='Данные недоступны для чтения';return}const blob=new Blob([raw],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`universe-graph-rescue-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);e.target.textContent='Файл сохранён'}
  });
  (document.body||document.documentElement).appendChild(el);
}

// Errors after start: warn, keep working. The same message is shown at most once per 8 s.
let lastRuntimeWarning={text:'',at:0};
function reportRuntimeError(error,where){
  const msg=String(error?.message||error||'неизвестная ошибка');console.error('[Universe Graph]',where||'',error);
  if(!appBooted){showFatalScreen(error,'запуска');return}
  const now=Date.now();if(lastRuntimeWarning.text===msg&&now-lastRuntimeWarning.at<8000)return;lastRuntimeWarning={text:msg,at:now};
  const text=`Что-то пошло не так${where?` (${where})`:''}: ${msg}. Программа продолжает работу; если результат выглядит неверно — Ctrl+Z.`;
  if(typeof toast==='function')toast(text,'err');
}
window.addEventListener('error',e=>{if(e.error||e.message)reportRuntimeError(e.error||e.message)});
window.addEventListener('unhandledrejection',e=>reportRuntimeError(e.reason));

// Runs one part of the interface; if it throws, the part is replaced by a short
// message instead of leaving a frozen or empty screen.
function guard(where,fn,fallback){
  try{return fn()}catch(error){
    reportRuntimeError(error,where);
    try{fallback?.(error)}catch{}
    return undefined;
  }
}
// Fallback for a view container: a readable note with a way back to the graph.
function viewFailed(container,title){
  return error=>{if(!container)return;container.innerHTML=`<div class="viewFailed"><b>${safetyText(title)} не удалось показать.</b><span>${safetyText(error?.message||error)}</span><span>Данные не изменены. Попробуйте другой вид или Ctrl+Z, если ошибка появилась после правки.</span></div>`}
}

function showStartupNotice(title,text){
  if(typeof openModal!=='function'){alert(`${title}\n\n${text}`);return}
  openModal(title,`<div class="stack"><div class="massSummary startupNotice">${safetyText(text)}</div></div>`,'<button class="btn primary" id="noticeOk">Понятно</button>');
  document.getElementById('noticeOk').onclick=()=>closeModal();
}
// Tells the person what normalize() repaired while loading/importing.
function reportDataRepairs(){
  const list=typeof takeRepairs==='function'?takeRepairs():[];if(!list.length)return;
  const lines=list.map(([what,n])=>`• ${what}${n>1?` — ${n}`:''}`).join('\n');
  showStartupNotice('Данные были исправлены',`При загрузке в данных нашлись повреждения. Программа исправила их, чтобы всё работало:\n\n${lines}\n\nЕсли что-то пропало, сохранённую до исправления копию можно вернуть из резервной копии (кнопка ⟳).`);
}
