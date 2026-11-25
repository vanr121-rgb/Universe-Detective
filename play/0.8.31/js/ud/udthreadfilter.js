// F01: a view filter, using the existing relation-tier model and renderer.
'use strict';
function udCloseThreadFilter(){document.getElementById('udThreadFilter')?.remove()}
function udThreadFilterBody(){
 const names=relationTierNames();
 return '<div class="udThreadFilterTitle">Нити по важности</div><div class="udThreadFilterPresets">'+
 [[5,'Все'],[1,'Только I'],[2,'I–II'],[3,'I–III']].map(([n,label])=>`<button type="button" data-ud-tier-upto="${n}">${label}</button>`).join('')+'</div>'+names.map((name,i)=>
 `<button type="button" class="udThreadFilterLevel" data-ud-tier="${i+1}" aria-pressed="${!state.hiddenTiers.has(i+1)}"><b>${REL_TIER_MARK[i]}</b><span>${escapeHtml(name)}</span><i aria-hidden="true">${state.hiddenTiers.has(i+1)?'○':'✓'}</i></button>`).join('');
}
function udOpenThreadFilter(){
 if(document.getElementById('udThreadFilter')){udCloseThreadFilter();return}
 const anchor=document.querySelector('#viewStrip [data-act="board-threads"]'),rect=anchor?.getBoundingClientRect();
 if(!rect)return;
 const menu=document.createElement('div');menu.id='udThreadFilter';menu.className='contextMenu open udThreadFilter';menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Нити по важности');
 menu.dataset.workspace=currentWorkspace()?.id||'';menu.innerHTML=udThreadFilterBody();document.body.append(menu);
 const box=menu.getBoundingClientRect();menu.style.left=zpx(Math.max(8,Math.min(rect.left,innerWidth-box.width-8)))+'px';menu.style.top=zpx(Math.max(8,Math.min(rect.bottom+4,innerHeight-box.height-8)))+'px';
 menu.querySelector('button')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
 const target=event.target instanceof Element?event.target:null;if(!target)return;
 const menu=document.getElementById('udThreadFilter');if(!menu)return;
 if(menu.dataset.workspace!==currentWorkspace()?.id){udCloseThreadFilter();return}
 if(!target.closest('#udThreadFilter')){if(!target.closest('[data-act="board-threads"]'))udCloseThreadFilter();return}
 const button=target.closest('[data-ud-tier],[data-ud-tier-upto]');if(!button)return;
 const focus=button.dataset.udTier?`[data-ud-tier="${button.dataset.udTier}"]`:`[data-ud-tier-upto="${button.dataset.udTierUpto}"]`;
 if(button.dataset.udTier)toggleTier(Number(button.dataset.udTier));else showTiersUpTo(Number(button.dataset.udTierUpto));
 menu.innerHTML=udThreadFilterBody();menu.querySelector(focus)?.focus({preventScroll:true});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('udThreadFilter')){event.preventDefault();event.stopPropagation();udCloseThreadFilter();document.querySelector('#viewStrip [data-act="board-threads"]')?.focus()}});
window.addEventListener('resize',udCloseThreadFilter);
