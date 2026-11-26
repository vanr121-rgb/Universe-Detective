// Universe Graph — вики-ссылки, упоминания, оформленный текст и поиск по всему тексту (0.18).
// [[Имя]] или [[Имя|подпись]] в описании, заметках, списках и других разделах ссылается на запись.
// Ссылка на несуществующую запись показывается красной, клик по ней создаёт запись.
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';

const WIKI_LINK_RE=/\[\[([^\[\]\n|]{1,120})(?:\|([^\[\]\n]{1,120}))?\]\]/g;
let wikiCache={key:'',byName:null,mentions:null};

function wikiCacheKey(){return (state.workspaceId||'')+'|'+state.viewAs+'|'+state.viewVersion+'|'+data.entities.length+'|'+data.relations.length+'|'+(data.metadata?.updatedAt||'')+'|'+(currentWorkspace()?.updatedAt||'')}
function wikiEnsureCache(){const key=wikiCacheKey();if(wikiCache.key!==key)wikiCache={key,byName:null,mentions:null};return wikiCache}
function wikiNormName(s){return String(s??'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ')}
// Name or other name → record. The first record with that name wins (stable file order).
function wikiResolve(name){
  const c=wikiEnsureCache();
  if(!c.byName){c.byName=new Map();for(const e of data.entities){for(const n of [e.name,...(e.aliases||[])]){const k=wikiNormName(n);if(k&&!c.byName.has(k))c.byName.set(k,e.id)}}}
  const id=c.byName.get(wikiNormName(name));return id?getEntity(id):null;
}
// 0.29 (аудит, находки 20, 21): a renamed record keeps its links. Before every save the names are compared with the last save;
// [[Старое имя]] / [[Старое имя|подпись]] in records, relations and articles become [[Новое имя]] — in the same save, so one Ctrl+Z
// undoes both. Article links to records, relations and types that no longer exist are dropped there too (Ctrl+Z brings them back).
let wikiNamesSeen=new Map(),wikiNamesWs=null;
function wikiMapStrings(v,fn,depth=0){if(depth>6||v==null)return v;if(typeof v==='string')return fn(v);if(Array.isArray(v)){for(let i=0;i<v.length;i++)v[i]=wikiMapStrings(v[i],fn,depth+1);return v}if(typeof v==='object'){for(const k of Object.keys(v))v[k]=wikiMapStrings(v[k],fn,depth+1);return v}return v}
function wikiRenameLinks(pairs){
  if(!pairs.length)return 0;let n=0;const by=new Map(pairs.map(([o,nw])=>[wikiNormName(o),nw]));
  const fix=t=>typeof t!=='string'||!t.includes('[[')?t:t.replace(WIKI_LINK_RE,(m,target,label)=>{const nw=by.get(wikiNormName(target));if(!nw)return m;n++;return label?`[[${nw}|${label}]]`:`[[${nw}]]`});
  for(const o of [...data.entities,...data.relations]){if(typeof o.description==='string')o.description=fix(o.description);if(typeof o.note==='string')o.note=fix(o.note);if(o.sectionData)wikiMapStrings(o.sectionData,fix);if(isRecord(o.properties))for(const k of Object.keys(o.properties))if(typeof o.properties[k]==='string')o.properties[k]=fix(o.properties[k])}
  const ws=currentWorkspace();
  for(const a of ws?.articles||[]){
    if(typeof a.body==='string')a.body=fix(a.body);
    for(const image of a.media||[])image.caption=fix(image.caption);
    for(const box of a.infoboxes||[])for(const row of box.rows)row.value=fix(row.value);
  }
  for(const template of ws?.articleTemplates||[])for(const row of template.rows)row.value=fix(row.value);
  return n;
}
function wikiBeforeSave({rewrite=true}={}){
  const ws=currentWorkspace();if(!ws)return;
  // names as last saved: the undo baseline is exactly the last saved world (read once, then kept up to date here)
  if(!wikiNamesWs){wikiNamesWs=true;try{const base=typeof historyBaseline==='string'?JSON.parse(historyBaseline):null;for(const w of base?.workspaces||[])for(const e of w.entities||[])wikiNamesSeen.set(e.id,e.name)}catch{}}
  if(rewrite){
    const pairs=[];for(const e of data.entities){const old=wikiNamesSeen.get(e.id);if(old!=null&&old!==e.name&&wikiNormName(old)!==wikiNormName(e.name)&&!data.entities.some(x=>x.id!==e.id&&[x.name,...(x.aliases||[])].some(n=>wikiNormName(n)===wikiNormName(old))))pairs.push([old,e.name])}
    if(wikiRenameLinks(pairs))wikiCache={key:'',byName:null,mentions:null};
    const has={entity:id=>!!getEntity(id),relation:id=>data.relations.some(r=>r.id===id),type:id=>data.entityTypes.some(t=>t.id===id),reltype:id=>data.relationTypes.some(t=>t.id===id)};
    for(const a of ws.articles||[])if(Array.isArray(a.links)&&a.links.some(l=>has[l.kind]&&!has[l.kind](l.id)))a.links=a.links.filter(l=>!has[l.kind]||has[l.kind](l.id));
  }
  for(const e of data.entities)wikiNamesSeen.set(e.id,e.name);
}
function wikiLinksIn(text){const out=[];for(const m of String(text??'').matchAll(WIKI_LINK_RE))out.push({target:m[1].trim(),label:(m[2]||m[1]).trim()});return out}
// Every string inside a value (section contents are nested records and lists).
function collectStrings(v,out=[],depth=0){if(depth>6||v==null)return out;if(typeof v==='string')out.push(v);else if(Array.isArray(v))for(const x of v)collectStrings(x,out,depth+1);else if(typeof v==='object')for(const x of Object.values(v))collectStrings(x,out,depth+1);return out}
function subjectTexts(o){return [o.description||'',o.note||'',...collectStrings(o.sectionData),...Object.values(o.properties||{}).filter(v=>typeof v==='string')]}

// Who mentions whom: [[ ]] in any text of a record or a relation, and questionnaire «ссылка» fields.
function wikiMentionIndex(){
  const c=wikiEnsureCache();if(c.mentions)return c.mentions;
  const incoming=new Map(),outgoing=new Map();
  const add=(fromKey,toId,via)=>{if(!toId)return;if(!incoming.has(toId))incoming.set(toId,new Map());const m=incoming.get(toId);if(!m.has(fromKey))m.set(fromKey,new Set());m.get(fromKey).add(via);if(!outgoing.has(fromKey))outgoing.set(fromKey,new Map());const o=outgoing.get(fromKey);if(!o.has(toId))o.set(toId,new Set());o.get(toId).add(via)};
  for(const e of data.entities){
    for(const t of subjectTexts(e))for(const l of wikiLinksIn(t)){const target=wikiResolve(l.target);if(target&&target.id!==e.id)add('e:'+e.id,target.id,'текст')}
    for(const f of getET(e.type).fields||[]){if(f.kind!=='ref')continue;const v=e.properties?.[f.name];if(v&&getEntity(v)&&v!==e.id)add('e:'+e.id,v,'поле «'+f.name+'»')}
  }
  for(const r of data.relations){for(const t of subjectTexts(r))for(const l of wikiLinksIn(t)){const target=wikiResolve(l.target);if(target)add('r:'+r.id,target.id,'текст связи')}}
  c.mentions={incoming,outgoing};return c.mentions;
}
function mentionSourceLabel(key){if(key.startsWith('e:')){const e=getEntity(key.slice(2));return e?{entity:e,name:e.name}:null}const r=data.relations.find(x=>x.id===key.slice(2));if(!r)return null;const a=getEntity(r.from),b=getEntity(r.to);return {relation:r,name:`${a?.name||'?'} — ${getRT(r.type).name} — ${b?.name||'?'}`}}

// Text with [[links]], **жирный**, *курсив*, line breaks and (for a record) {{image:id}} pictures.
function udStableWikiTarget(token){
  const m=String(token).match(/^(карточка|статья-id):([A-Za-z0-9_-]+)$/i);
  if(!m)return null;
  const article=m[1].toLowerCase()==='статья-id';
  return {article,id:m[2],value:article?getArticle(m[2]):getEntity(m[2])};
}
function udRemapWikiCards(text,ids){
  return String(text||'').replace(WIKI_LINK_RE,(match,target,label)=>{
    const m=target.trim().match(/^карточка:([A-Za-z0-9_-]+)$/i);
    return m&&ids.has(m[1])?`[[карточка:${ids.get(m[1])}${label?'|'+label:''}]]`:match;
  });
}
function richTextHtml(text,{entity=null,empty=''}={}){
  const src=String(text??'');if(!src.trim())return empty;
  let bold=false;
  const plain=part=>escapeHtml(part).split('**').map((chunk,i)=>{let out=i?(bold=!bold,bold?'<b>':'</b>'):'';return out+chunk.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<i>$2</i>').replace(/\n/g,'<br>')}).join('');
  const html=src.split(/(\{\{image:[^}]+\}\}|\[\[[^\[\]\n]{1,250}\]\])/g).map(part=>{
    const img=part.match(/^\{\{image:([^}]+)\}\}$/);
    if(img){if(!entity)return '';const meta=getMediaMeta(entity,img[1]);if(!meta)return '';const url=getMediaUrl(meta.id);if(!url)return '';const width=clamp(Number(meta.displayWidth)||720,120,1400),align=['left','center','right'].includes(meta.align)?meta.align:'center';return `<img class="descriptionImage" data-align="${align}" src="${url}" alt="${escapeHtml(meta.alt||meta.name||'Изображение')}" style="width:min(100%,${width}px)" loading="lazy">`+(meta.caption?`<div class="widgetImageCaption">${escapeHtml(meta.caption)}</div>`:'')}
    const link=part.match(/^\[\[([^\[\]\n|]{1,120})(?:\|([^\[\]\n]{1,120}))?\]\]$/);
    if(link){
      const stable=udStableWikiTarget(link[1].trim());
      if(stable){
        const {article,id,value}=stable;
        if(!value||value.hint)return '<span class="muted">Ссылка недоступна</span>';
        const caption=escapeHtml(link[2]?.trim()||(article?value.title:value.name));
        return `<button type="button" class="wikiLink${article?' articleLink':''}" ${article?'data-article-open':'data-related'}="${escapeHtml(id)}">${caption}</button>`;
      }
      const name=link[1].trim(),isArt=/^статья\s*:/i.test(name),label=(link[2]||name.replace(/^статья\s*:\s*/i,'')).trim(),t=isArt?null:wikiResolve(name);
      // 0.20.5: [[статья: Бестиарий]] — or a plain name that only an article has — opens the article.
      if(!t&&typeof articleResolve==='function'){const art=articleResolve(name);if(art)return `<button type="button" class="wikiLink articleLink" data-article-open="${escapeHtml(art.id)}" title="Статья «${escapeHtml(art.title)}»">${escapeHtml(art.icon||'📖')} ${escapeHtml(label)}</button>`}
      return t?`<button type="button" class="wikiLink" data-related="${escapeHtml(t.id)}" title="${escapeHtml(t.name)}">${escapeHtml(label)}</button>`:`<button type="button" class="wikiLink missing" data-wiki-new="${escapeHtml(name)}" title="Сущности «${escapeHtml(name)}» нет — нажмите, чтобы создать">${escapeHtml(label)}</button>`}
    return plain(part);
  }).join('');
  return bold?html+'</b>':html;
}
// Plain short text for previews: no links brackets, no pictures.
function plainExcerpt(text,max=150){const s=String(text??'').replace(/\{\{image:[^}]+\}\}/g,' ').replace(WIKI_LINK_RE,(m,a,b)=>(b||a)).replace(/\*\*?([^*\n]+)\*\*?/g,'$1').replace(/\s+/g,' ').trim();return s.length>max?s.slice(0,max-1).trimEnd()+'…':s}

// A red link was clicked: create that record in the current space and open it.
function wikiCreateFromLink(name){
  if(worldReadOnly())return;
  const clean=String(name||'').trim().slice(0,120);if(!clean)return;
  if(wikiResolve(clean)){revealEntity(wikiResolve(clean).id);return}
  if(!confirm(`Сущности «${clean}» ещё нет. Создать её в текущем пространстве?`))return;
  openEntityModal(null);const n=$('#mName');if(n){n.value=clean;n.dispatchEvent(new Event('input',{bubbles:true}))}
}

// ---- Подсказка имён при вводе [[ ----
// Works in any <textarea>/<input> with data-wiki (description, notes, list items…).
let wikiSuggestState=null;
function wikiSuggestEl(){let el=$('#wikiSuggest');if(!el){el=document.createElement('div');el.id='wikiSuggest';el.className='wikiSuggest';el.setAttribute('role','listbox');document.body.appendChild(el)}return el}
function wikiSuggestClose(){wikiSuggestState=null;$('#wikiSuggest')?.classList.remove('open')}
function wikiSuggestFor(field){
  const pos=field.selectionStart??0,before=field.value.slice(0,pos),m=before.match(/\[\[([^\[\]\n|]{0,40})$/);
  if(!m){wikiSuggestClose();return}
  const q=wikiNormName(m[1]);
  const items=data.entities.filter(e=>!q||wikiNormName(e.name).includes(q)||(e.aliases||[]).some(a=>wikiNormName(a).includes(q)))
    .sort((a,b)=>(wikiNormName(a.name).startsWith(q)?0:1)-(wikiNormName(b.name).startsWith(q)?0:1)||a.name.localeCompare(b.name,'ru')).slice(0,8);
  const el=wikiSuggestEl(),r=field.getBoundingClientRect();
  wikiSuggestState={field,start:pos-m[1].length,end:pos,items,index:0,query:m[1]};
  el.innerHTML=items.map((e,i)=>`<button type="button" class="wikiSuggestItem${i===0?' active':''}" data-wiki-pick="${i}" role="option"><span>${escapeHtml(getET(e.type).icon||'•')}</span><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.type?getET(e.type).name:'Без типа')}</small></button>`).join('')+(m[1].trim()&&!wikiResolve(m[1])?`<div class="wikiSuggestNew">Нет такой сущности — ссылка будет красной, её можно создать позже</div>`:'')+(items.length?'':'<div class="wikiSuggestNew">Начните вводить имя сущности</div>');
  el.style.left=zpx(Math.max(8,Math.min(innerWidth-zsc(300),r.left)))+'px';el.style.top=zpx(Math.min(innerHeight-40,r.bottom+4))+'px';el.style.width=Math.min(320,Math.max(220,zpx(r.width)))+'px';
  el.classList.add('open');
}
function wikiSuggestPick(i){
  const st=wikiSuggestState;if(!st)return;const e=st.items[i];if(!e)return;const f=st.field;
  const after=f.value.slice(st.end),closing=after.startsWith(']]')?'':']]';
  f.value=f.value.slice(0,st.start)+e.name+closing+after;const caret=st.start+e.name.length+2;f.setSelectionRange(caret,caret);f.focus();
  f.dispatchEvent(new Event('input',{bubbles:true}));wikiSuggestClose();
}
document.addEventListener('input',ev=>{const f=ev.target;if(f instanceof HTMLElement&&f.matches('[data-wiki]'))wikiSuggestFor(f)});
document.addEventListener('keydown',ev=>{
  const st=wikiSuggestState;if(!st||ev.target!==st.field||!$('#wikiSuggest')?.classList.contains('open'))return;
  if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();ev.stopPropagation();if(!st.items.length)return;st.index=(st.index+(ev.key==='ArrowDown'?1:-1)+st.items.length)%st.items.length;$$('#wikiSuggest .wikiSuggestItem').forEach((b,i)=>b.classList.toggle('active',i===st.index));return}
  if((ev.key==='Enter'||ev.key==='Tab')&&st.items.length){ev.preventDefault();ev.stopPropagation();wikiSuggestPick(st.index);return}
  if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();wikiSuggestClose()}
},true);
document.addEventListener('mousedown',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-wiki-pick]'):null;if(b){ev.preventDefault();wikiSuggestPick(Number(b.dataset.wikiPick));return}if(!(ev.target instanceof Element&&ev.target.closest('#wikiSuggest,[data-wiki]')))wikiSuggestClose()},true);
document.addEventListener('click',ev=>{const b=ev.target instanceof Element?ev.target.closest('[data-wiki-new]'):null;if(!b)return;ev.preventDefault();ev.stopPropagation();wikiCreateFromLink(b.dataset.wikiNew)},true);
window.addEventListener('resize',wikiSuggestClose);

// ---- Поиск по всему тексту ----
function relationSearchText(r){const a=getEntity(r.from),b=getEntity(r.to);return searchFold(getRT(r.type).name+' '+(a?.name||'')+' '+(b?.name||'')+' '+JSON.stringify(r.properties||{})+' '+(r.description||'')+' '+collectStrings(r.sectionData).join(' '))}
// Where the words were found, with a little text around them («…Наследница дома и …»).
function searchSnippet(o,low){
  if(String(o.name||'').toLowerCase().includes(low))return null;
  const sources=[['описание',o.description],['заметка',o.note],...Object.entries(o.properties||{}).filter(([,v])=>typeof v==='string'||typeof v==='number').map(([k,v])=>[k,String(v)]),['раздел',collectStrings(o.sectionData).join(' · ')],['другие имена',(o.aliases||[]).join(', ')]];
  for(const [where,raw] of sources){const text=plainExcerpt(raw,100000);const i=text.toLowerCase().indexOf(low);if(i<0)continue;const a=Math.max(0,i-38),b=Math.min(text.length,i+low.length+52);return {where,before:(a>0?'…':'')+text.slice(a,i),hit:text.slice(i,i+low.length),after:text.slice(i+low.length,b)+(b<text.length?'…':'')}}
  return null;
}
function searchSnippetHtml(sn){return sn?`<small class="searchSnippet"><em>${escapeHtml(sn.where)}:</em> ${escapeHtml(sn.before)}<mark>${escapeHtml(sn.hit)}</mark>${escapeHtml(sn.after)}</small>`:''}
