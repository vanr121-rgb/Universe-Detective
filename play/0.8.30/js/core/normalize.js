// Universe Graph — Починка и миграция мира при каждой загрузке и сохранении (normalize).
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
const UD_PHOTO_MIN_H=48,UD_PHOTO_MAX_H=600;
function normalizeBoardPhoto(input){
  if(!isRecord(input))return;
  const {height,fit}=input,photo={};
  if(Number.isFinite(height)&&height>0)photo.height=Math.round(clamp(height,UD_PHOTO_MIN_H,UD_PHOTO_MAX_H));
  if(fit==='cover')photo.fit=fit;
  if(Object.keys(photo).length)return photo;
}

// What normalize() had to repair. Reported once to the person after loading or
// importing (0.16) — damaged data used to be fixed or dropped silently.
const repairLog=new Map();
function noteRepair(text,n=1){if(n>0)repairLog.set(text,(repairLog.get(text)||0)+n)}
function takeRepairs(){const out=[...repairLog.entries()];repairLog.clear();return out}
// A colour must be just a colour. Values like "red;background:url(…)" would leak extra CSS into
// card styles, so anything that is not #hex, rgb()/hsl() or a plain colour name is dropped.
const isRecord=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const SAFE_COLOR=/^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([0-9.,%\s/deg+-]+\)|[a-z]{3,24})$/i;
function sanitizeColors(obj,keys){for(const k of keys){if(obj[k]===undefined)continue;if(typeof obj[k]!=='string'||!SAFE_COLOR.test(obj[k].trim())){delete obj[k];noteRepair('исправлены неверные цвета')}else obj[k]=obj[k].trim()}}
// A number field that is not a finite number is removed (the type's value applies),
// or clamped into its sane range. Broken sizes used to make nodes invisible.
function sanitizeNumbers(obj,limits,label){if(!obj)return;for(const [k,[lo,hi]] of Object.entries(limits)){if(obj[k]===undefined||obj[k]===null||obj[k]==='')continue;const n=Number(obj[k]);if(!Number.isFinite(n)){delete obj[k];noteRepair(label);continue}const c=Math.max(lo,Math.min(hi,n));if(c!==obj[k])obj[k]=c}}
const ENTITY_NUMBERS={size:[10,120],borderWidth:[0,8],glow:[0,60],opacity:[.05,1],animationSpeed:[.1,4]};
const RELATION_NUMBERS={width:[.5,20],opacity:[.05,1],curve:[-1,1],dashSize:[1,30],dashGap:[1,40],arrowSize:[3,24],labelSize:[6,24],animationSpeed:[.1,4]};
// 0.17: every workspace has its own rule set (entity types, relation types, status groups,
// questionnaire fields). Worlds from 0.16 and older had one global set: it is copied into
// each workspace once. Nothing in a rule set is built in except the nesting relation
// («Содержит»), which is recognised by its flag, not by its name, and can be renamed.
const FIELD_KIND_IDS=new Set(FIELD_KINDS.map(x=>x[0])),STATUS_EFFECT_IDS=new Set(STATUS_EFFECTS.map(x=>x[0]));
function normalizeFields(t){
  if(t.fields===undefined)return;
  const raw=Array.isArray(t.fields)?t.fields:[];t.fields=raw.filter(isRecord);
  const ids=new Set(),names=new Set(),out=[];
  for(const f of t.fields){
    f.name=String(f.name??'').trim();if(!f.name||names.has(f.name.toLowerCase())){noteRepair('удалены поля анкеты без названия или с повторяющимся названием');continue}
    names.add(f.name.toLowerCase());
    if(!f.id||ids.has(f.id))f.id=uid('field');f.id=String(f.id);ids.add(f.id);
    if(!FIELD_KIND_IDS.has(f.kind))f.kind='text';
    if(f.kind==='choice')f.options=[...new Set((Array.isArray(f.options)?f.options:[]).map(x=>String(x??'').trim()).filter(Boolean))];else delete f.options;
    if(f.kind==='ref')f.refType=f.refType?String(f.refType):'';else delete f.refType;
    out.push(f);
  }
  t.fields=out;if(!t.fields.length)delete t.fields;
}
// 0.18: page sections. A section = {id, kind, title, icon, color, open, hideEmpty, compact, maxHeight, config}.
// Kind-specific settings are checked by the section registry (ui/sections.js) when it is loaded.
function normalizeSectionDef(sec){
  if(!isRecord(sec))return null;
  sec.kind=String(sec.kind||'');
  if(typeof SECTION_KINDS!=='undefined'&&!SECTION_KINDS[sec.kind])return null;
  sec.id=String(sec.id||'')||uid('sec');
  sec.title=String(sec.title??'').slice(0,80);if(!sec.title)delete sec.title;
  sec.icon=String(sec.icon??'').slice(0,4);if(!sec.icon)delete sec.icon;
  sanitizeColors(sec,['color']);if(!sec.color)delete sec.color;
  for(const k of ['open','hideEmpty','compact'])if(sec[k]===true)sec[k]=true;else delete sec[k];
  const mh=Math.round(Number(sec.maxHeight));if(Number.isFinite(mh)&&mh>=80)sec.maxHeight=Math.min(mh,2000);else delete sec.maxHeight;
  sec.config=isRecord(sec.config)?sec.config:{};
  if(typeof sectionNormalizeConfig==='function')sectionNormalizeConfig(sec);
  return sec;
}
function normalizePageList(list){const ids=new Set();return (Array.isArray(list)?list:[]).map(normalizeSectionDef).filter(sec=>{if(!sec||ids.has(sec.id))return false;ids.add(sec.id);return true})}
// A type's page template: undefined = the default page; [] = the person removed every section.
function normalizeTypePage(t,kind='entity'){if(t.page===undefined){delete t.pageArticles;delete t.pageMap;return}if(!Array.isArray(t.page)){delete t.page;noteRepair('исправлены шаблоны страниц');return}t.page=normalizePageList(t.page);
  // 0.20.5: custom pages made before articles get the «Статьи» section once (shown only when there are articles); after that the person may remove it.
  if(!t.pageArticles&&typeof SECTION_KINDS!=='undefined'&&SECTION_KINDS.articles){if(t.page.length&&!t.page.some(s=>s.kind==='articles')){const i=t.page.findIndex(s=>s.kind==='info');t.page.splice(i<0?t.page.length:i,0,{id:t.page.some(s=>s.id==='articles')?uid('sec'):'articles',kind:'articles',hideEmpty:true,config:{}})}t.pageArticles=true}
  // 0.21: the same once for «Карта» on record types (relation types have no maps).
  if(!t.pageMap&&typeof SECTION_KINDS!=='undefined'&&SECTION_KINDS.map&&kind==='entity'){if(t.page.length&&!t.page.some(s=>s.kind==='map')){const i=t.page.findIndex(s=>s.kind==='relations'||s.kind==='info');t.page.splice(i<0?t.page.length:i,0,{id:t.page.some(s=>s.id==='map')?uid('sec'):'map',kind:'map',hideEmpty:true,config:{}})}t.pageMap=true}}
// A record's own page: sections only it has, sections of its type it hides, and its own order.
function normalizeOwnPage(o){
  if(o.page!==undefined){
    if(!isRecord(o.page))delete o.page;
    else{const pg=o.page,add=normalizePageList(pg.add),ids=list=>[...new Set((Array.isArray(list)?list:[]).map(x=>String(x??'')).filter(Boolean))];
      o.page={};if(add.length)o.page.add=add;const hide=ids(pg.hide),order=ids(pg.order);if(hide.length)o.page.hide=hide;if(order.length)o.page.order=order;
      if(!Object.keys(o.page).length)delete o.page}
  }
  if(o.sectionData!==undefined){
    if(!isRecord(o.sectionData))delete o.sectionData;
    else{for(const [k,v] of Object.entries(o.sectionData))if(!isRecord(v))delete o.sectionData[k];if(!Object.keys(o.sectionData).length)delete o.sectionData}
  }
}
function normalizeUdRuleGroups(value){
  const groups={};
  for(const tab of ['types','relations','statuses']){
    const names=Array.isArray(value?.[tab])?value[tab]:[];
    const clean=[...new Set(names.filter(n=>typeof n==='string').map(n=>n.trim().slice(0,40)).filter(Boolean))];
    if(clean.length)groups[tab]=clean;
  }
  return groups;
}
function normalizeRuleSet(ws,legacy){
  if(ws.udRuleGroups!==undefined)ws.udRuleGroups=normalizeUdRuleGroups(ws.udRuleGroups);
  if(!Array.isArray(ws.entityTypes))ws.entityTypes=clone(legacy.entityTypes);
  if(!Array.isArray(ws.relationTypes))ws.relationTypes=clone(legacy.relationTypes);
  if(!Array.isArray(ws.statusGroups))ws.statusGroups=[];
  {const a=ws.entityTypes.length,b=ws.relationTypes.length,c=ws.statusGroups.length;
  ws.entityTypes=ws.entityTypes.filter(isRecord);ws.relationTypes=ws.relationTypes.filter(isRecord);ws.statusGroups=ws.statusGroups.filter(isRecord);
  noteRepair('удалены повреждённые записи типов',a-ws.entityTypes.length+b-ws.relationTypes.length);noteRepair('удалены повреждённые группы статусов',c-ws.statusGroups.length)}
  // IDs are reference keys. Keep the first occurrence stable, regenerate only missing/duplicate IDs.
  const usedEntityTypeIds=new Set();
  for(const t of ws.entityTypes){
    if(!t.id||usedEntityTypeIds.has(t.id)){t.id=uid('etype');noteRepair('исправлены id типов')}
    if(t.group!==undefined){const g=typeof t.group==='string'?t.group.trim().slice(0,40):'';if(g)t.group=g;else delete t.group} /* 0.28.3: own group in the rules list */
    t.id=String(t.id);
    sanitizeNumbers(t,ENTITY_NUMBERS,'исправлены неверные числа в оформлении');
    usedEntityTypeIds.add(t.id);
    if(t.name==null||String(t.name).trim()==='')t.name='Тип сущности';
    t.name=String(t.name);
    sanitizeColors(t,['color','borderColor']);
    if(t.color===undefined)t.color='#74b8ff';
    if(t.size===undefined)t.size=34;
    if(t.shape===undefined)t.shape='circle';
    if(t.icon===undefined)t.icon='•';
    if(t.animation===undefined)t.animation='none';
    if(t.animationSpeed===undefined)t.animationSpeed=1;
    if(t.glow===undefined)t.glow=17;
    if(t.borderWidth===undefined)t.borderWidth=1.3;
    if(t.borderColor===undefined)t.borderColor='rgba(255,255,255,.22)';
    normalizeFields(t);normalizeTypePage(t);
  }
  const usedRelationTypeIds=new Set();
  for(const t of ws.relationTypes){
    if(!t.id||usedRelationTypeIds.has(t.id)){t.id=uid('rtype');noteRepair('исправлены id типов')}
    t.id=String(t.id);
    sanitizeNumbers(t,RELATION_NUMBERS,'исправлены неверные числа в оформлении');
    if(typeof t.group==='string'&&t.group.trim())t.group=t.group.trim().slice(0,40);else delete t.group;
    usedRelationTypeIds.add(t.id);
    if(t.name==null||String(t.name).trim()==='')t.name=t.containment?'Содержит':'Связь';
    t.name=String(t.name);
    sanitizeColors(t,['color']);
    if(t.color===undefined)t.color='#91a4c7';
    if(t.width===undefined)t.width=2;
    if(t.lineStyle===undefined)t.lineStyle='solid';
    normalizeFields(t);normalizeTypePage(t,'relation'); // 0.18: relation types have a questionnaire and a page too
    // 0.22: reverse name and the record types a relation may join
    if(typeof t.reverseName!=='string'||!t.reverseName.trim())delete t.reverseName;else t.reverseName=t.reverseName.trim().slice(0,80);
    for(const k of ['fromTypes','toTypes']){if(!Array.isArray(t[k])){delete t[k];continue}const ids=new Set(ws.entityTypes.map(x=>String(x.id)));t[k]=[...new Set(t[k].map(String).filter(id=>ids.has(id)))];if(!t[k].length)delete t[k]}
  }
  // Exactly one nesting type per rule set. It is found by its flag (older worlds: by the
  // name «Содержит»); extra nesting types are merged into it.
  const containsCandidates=ws.relationTypes.filter(t=>t.containment===true);
  let containsType=containsCandidates[0]||ws.relationTypes.find(t=>/^содержит$/i.test(String(t?.name||'').trim()));
  if(!containsType){
    containsType=containmentTypeTemplate();
    if(usedRelationTypeIds.has(containsType.id))containsType.id=uid('rtype');
    ws.relationTypes.unshift(containsType);
  }
  const extraContains=new Set(ws.relationTypes.filter(t=>t!==containsType&&(t.containment===true||/^содержит$/i.test(String(t?.name||'').trim()))).map(t=>t.id));
  if(extraContains.size){
    for(const r of Array.isArray(ws.relations)?ws.relations:[])if(extraContains.has(r?.type))r.type=containsType.id;
    ws.relationTypes=ws.relationTypes.filter(t=>!extraContains.has(t.id));
  }
  containsType.containment=true;
  if(containsType.arrow===undefined)containsType.arrow=true;
  if(containsType.animated===undefined)containsType.animated=false;
  for(const t of ws.relationTypes)if(t!==containsType&&t.containment)delete t.containment;
  // Status groups: a scale (one of) or flags (any number at once), each option with its look.
  const typeIds=new Set(ws.entityTypes.map(t=>t.id)),groupIds=new Set();
  for(const g of ws.statusGroups){
    if(!g.id||groupIds.has(g.id)){g.id=uid('sg');noteRepair('исправлены id групп статусов')}
    g.id=String(g.id);groupIds.add(g.id);
    g.name=String(g.name??'').trim()||'Статусы';
    g.kind=g.kind==='flags'?'flags':'scale';
    g.appliesTo=[...new Set((Array.isArray(g.appliesTo)?g.appliesTo:[]).map(String).filter(id=>typeIds.has(id)))];
    const optIds=new Set();
    g.options=(Array.isArray(g.options)?g.options:[]).filter(isRecord).filter(o=>{
      o.name=String(o.name??'').trim();if(!o.name)return false;
      if(!o.id||optIds.has(o.id))o.id=uid('st');o.id=String(o.id);optIds.add(o.id);
      sanitizeColors(o,['color']);if(o.color===undefined)o.color='#9aa8c6';
      o.icon=String(o.icon??'').slice(0,4);
      if(!STATUS_EFFECT_IDS.has(o.effect))o.effect='none';
      return true;
    });
  }
}
// Keeps only statuses of existing groups/options: a scale holds one option id, flags a list.
function normalizeEntityStatus(e,groups){
  if(e.status===undefined)return;
  if(!isRecord(e.status)){delete e.status;noteRepair('исправлены повреждённые статусы');return}
  for(const [gid,v] of Object.entries(e.status)){
    const g=groups.get(gid);if(!g){delete e.status[gid];continue}
    const ok=new Set(g.options.map(o=>o.id));
    if(g.kind==='flags'){const list=[...new Set((Array.isArray(v)?v:[v]).map(String).filter(x=>ok.has(x)))];if(list.length)e.status[gid]=list;else delete e.status[gid]}
    else{const one=String(Array.isArray(v)?v[0]:v??'');if(ok.has(one))e.status[gid]=one;else delete e.status[gid]}
  }
  if(!Object.keys(e.status).length)delete e.status;
}
function udNormalizeContainment(ws,isContainment,repair){
  const homes=new Map(),parents=new Map(),keep=new Set();
  const accept=r=>{
    const list=parents.get(r.to)||[];
    if(list.includes(r.from)){repair('убраны повторные связи вложенности');return}
    if(udContainmentReaches(parents,r.from,r.to)){repair('разорваны циклы вложенности');return}
    list.push(r.from);parents.set(r.to,list);keep.add(r);
  };
  for(const r of ws.relations){
    if(!isContainment(r)){delete r.udMembership;keep.add(r);continue}
    if(r.udMembership===true)continue;
    delete r.udMembership;
    if(homes.has(r.to)){repair('убраны повторные основные связи вложенности');continue}
    accept(r);
    if(keep.has(r))homes.set(r.to,r.from);
  }
  for(const r of ws.relations)if(isContainment(r)&&r.udMembership===true){
    if(r.to===String(ws.rootId??'')){repair('убрана вложенность корневой сущности');continue}
    accept(r);
  }
  if(keep.size!==ws.relations.length)ws.relations=ws.relations.filter(r=>keep.has(r));
  return homes;
}
function normalize(){
  if(!data || typeof data!=='object' || Array.isArray(data))data=clone(DEMO);

  const legacyViews=Array.isArray(data.views)?data.views:[];
  const legacyEntities=Array.isArray(data.entities)?data.entities.filter(isRecord):[];
  const legacyRelations=Array.isArray(data.relations)?data.relations.filter(isRecord):[];
  data.metadata=(data.metadata&&typeof data.metadata==='object')?data.metadata:{};
  data.metadata.appVersion=APP_VERSION;
  // Before 0.17 the types lived on the world; they become each workspace's own rule set.
  // (After that, data.entityTypes/relationTypes/statusGroups only point at the active workspace's.)
  // Top-level lists are only a source for workspaces that have no rule set of their own
  // (old worlds, hand-made files); a workspace's own lists always win. Old files without a
  // version number therefore migrate too.
  const legacyRules={
    entityTypes:(Array.isArray(data.entityTypes)?data.entityTypes:[]).filter(isRecord),
    relationTypes:(Array.isArray(data.relationTypes)?data.relationTypes:[]).filter(isRecord)
  };
  data.version=WORLD_SCHEMA_VERSION;
  data.views=legacyViews;
  data.workspaces=Array.isArray(data.workspaces)?data.workspaces.filter(isRecord):[];

  // Migration / bootstrap: legacy versions stored one universe globally.
  if(!data.workspaces.length){
    data.workspaces=[{
      id:'ws-main',
      name:'Основной мир',
      favorite:true,
      rootId:legacyEntities.find(e=>e.id==='e-world')?.id
        ||legacyEntities.find(e=>e.style?.space)?.id
        ||legacyEntities[0]?.id
        ||null,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
      view:{zoom:1,panX:0,panY:0,scopeId:'e-world'},
      positions:{},
      entities:clone(legacyEntities),
      relations:clone(legacyRelations)
    }];
  }

  const usedWorkspaceIds=new Set();
  for(const ws of data.workspaces){
    if(!ws.id||usedWorkspaceIds.has(ws.id))ws.id=uid('ws');
    usedWorkspaceIds.add(ws.id);
  }

  const fallbackWs=data.workspaces[0];
  const now=new Date().toISOString();

  // Normalize EVERY workspace, not only the currently active one.
  // This prevents malformed secondary workspaces from breaking when opened later.
  for(const ws of data.workspaces){
    ws.id=ws.id||uid('ws');
    ws.name=String(ws.name||'Рабочая зона');
    if(!Array.isArray(ws.relations)&&ws===fallbackWs)ws.relations=clone(legacyRelations);
    normalizeRuleSet(ws,legacyRules);
    // Helpers such as getET/getRT read the active rule set; point them at this workspace's.
    data.entityTypes=ws.entityTypes;data.relationTypes=ws.relationTypes;data.statusGroups=ws.statusGroups;
    const statusGroupMap=new Map(ws.statusGroups.map(g=>[g.id,g]));
    ws.favorite=!!ws.favorite;
    // 0.29.2: the trash — only well-formed items (a hostile file must not bring junk); old ones leave by themselves
    if(ws.trash!==undefined){ws.trash=Array.isArray(ws.trash)?ws.trash.filter(t=>isRecord(t)&&isRecord(t.entity)&&t.entity.id&&typeof t.at==='string').slice(-1000).map(t=>({id:String(t.id||uid('trash')),batch:String(t.batch||t.id||''),at:t.at,...(t.networkShared===true?{networkShared:true}:{}),entity:t.entity,parent:t.parent?String(t.parent):null,children:Array.isArray(t.children)?t.children.map(String):[],relations:Array.isArray(t.relations)?t.relations.filter(r=>isRecord(r)&&r.from&&r.to&&r.type):[],pins:Array.isArray(t.pins)?t.pins.filter(isRecord):[],areas:Array.isArray(t.areas)?t.areas.filter(isRecord):[],articleLinks:Array.isArray(t.articleLinks)?t.articleLinks.filter(isRecord):[],paperBoards:Array.isArray(t.paperBoards)?t.paperBoards.filter(isRecord):[]})):[];if(typeof trashExpire==='function')trashExpire(ws)}
    // 0.29.4–0.29.6: drawing boards, own generator tables, tag colours, «это разные» pairs — checked like everything from a file
    if(ws.sketches!==undefined)ws.sketches=Array.isArray(ws.sketches)?ws.sketches.filter(isRecord).slice(0,200).map(b=>({id:String(b.id||uid('sheet')).slice(0,60),name:String(b.name||'Лист').slice(0,40),strokes:typeof drawNormStrokes==='function'?drawNormStrokes(b.strokes):[],createdAt:typeof b.createdAt==='string'?b.createdAt:undefined,updatedAt:typeof b.updatedAt==='string'?b.updatedAt:undefined})):[];
    if(ws.generators!==undefined)ws.generators=Array.isArray(ws.generators)?ws.generators.filter(isRecord).slice(0,300).map(g=>({id:String(g.id||uid('gen')).slice(0,60),name:String(g.name||'Таблица').slice(0,60),die:/^d\d{1,3}$/.test(String(g.die||''))?String(g.die):'',rows:String(g.rows||'').slice(0,20000)})):[];
    if(ws.tagColors!==undefined){const c={};if(isRecord(ws.tagColors))for(const [k,v] of Object.entries(ws.tagColors))if(/^#[0-9a-f]{3,8}$/i.test(String(v)))c[String(k).slice(0,60)]=String(v);ws.tagColors=c}
    if(ws.notDuplicates!==undefined)ws.notDuplicates=Array.isArray(ws.notDuplicates)?ws.notDuplicates.filter(p=>Array.isArray(p)&&p.length===2).slice(0,5000).map(p=>[String(p[0]),String(p[1])]):[];
    // 0.30.5 / 0.30.7: «игроки рисуют» and the journal of the players' changes (only the Master has it)
    if(ws.sketchPlayers!==undefined)ws.sketchPlayers=ws.sketchPlayers!==false;
    if(ws.playerLog!==undefined)ws.playerLog=Array.isArray(ws.playerLog)?ws.playerLog.filter(x=>isRecord(x)&&['add','set','del','back'].includes(x.op)&&['e','r','a'].includes(x.c)&&typeof x.id==='string').slice(-1500).map(x=>{/* checked in place: the same objects stay (an open review holds them) */x.lid=String(x.lid||uid('plog')).slice(0,60);x.id=x.id.slice(0,80);for(const k of ['at','who','whoId','session','name'])x[k]=String(x[k]||'').slice(0,k==='name'?300:80);if(x.fields!==undefined)x.fields=Array.isArray(x.fields)?x.fields.map(String).slice(0,40):[];x.ok=!!x.ok;return x}):[];
    if(ws.trashDays!==undefined){const d=Number(ws.trashDays);ws.trashDays=Number.isFinite(d)&&d>=0&&d<=3650?d:30}
    if(ws.myNotes!==undefined)ws.myNotes=Array.isArray(ws.myNotes)?ws.myNotes.filter(n=>isRecord(n)&&typeof n.text==='string'&&n.text.trim()).slice(-2000).map(n=>({id:String(n.id||uid('note')),owner:typeof n.owner==='string'&&n.owner?n.owner.slice(0,60):'gm',text:n.text.slice(0,4000),at:String(n.at||''),...(n.edited?{edited:String(n.edited)}:{})})):[]; /* 0.28: personal notes */
    ws.createdAt=ws.createdAt||now;
    ws.updatedAt=ws.updatedAt||now;
    if(typeof normalizeArticles==='function')normalizeArticles(ws);else if(!Array.isArray(ws.articles))ws.articles=[];
    if(typeof normalizeRelationTiers==='function')normalizeRelationTiers(ws);

    if(!Array.isArray(ws.entities))ws.entities=ws===fallbackWs?clone(legacyEntities):[];
    if(!Array.isArray(ws.relations))ws.relations=ws===fallbackWs?clone(legacyRelations):[];
    {const n0=ws.entities.length,r0=ws.relations.length;
    ws.entities=ws.entities.filter(isRecord);
    ws.relations=ws.relations.filter(isRecord);
    noteRepair('удалены повреждённые записи сущностей',n0-ws.entities.length);noteRepair('удалены повреждённые записи связей',r0-ws.relations.length)}

    // Entity IDs are workspace-local. Repair missing/duplicate IDs before relation cleanup.
    const entityIds=new Set();
    ws.entities.forEach((e,index)=>{
      if(!e.id||entityIds.has(e.id)){if(e.id)noteRepair('исправлены повторяющиеся id сущностей');e.id=uid('entity')}
      e.id=String(e.id);
      entityIds.add(e.id);
      e.name=e.name==null||String(e.name).trim()===''?'Безымянная сущность':String(e.name);
      e.description=e.description==null?'':String(e.description);
      if(e.note!=null)e.note=String(e.note);else delete e.note;
      e.properties=(e.properties&&typeof e.properties==='object'&&!Array.isArray(e.properties))?e.properties:{};
      const normalizedMedia=Array.isArray(e.media)?e.media.filter(m=>isRecord(m)&&m.id).map(m=>({
        id:String(m.id),name:String(m.name||'image'),mime:String(m.mime||'image/webp'),width:Math.max(0,Number(m.width)||0),height:Math.max(0,Number(m.height)||0),
        sourceWidth:Math.max(0,Number(m.sourceWidth)||Number(m.width)||0),sourceHeight:Math.max(0,Number(m.sourceHeight)||Number(m.height)||0),size:Math.max(0,Number(m.size)||0),
        alt:String(m.alt||m.name||'Изображение'),caption:String(m.caption||''),displayWidth:clamp(Number(m.displayWidth)||Math.min(720,Number(m.width)||720),120,1400),
        fit:['contain','cover','fill'].includes(m.fit)?m.fit:'contain',align:['left','center','right'].includes(m.align)?m.align:'center',entityId:e.id,main:!!m.main
      })) : [];
      const uniqueMediaIds=new Set();
      e.media=normalizedMedia.filter(m=>{if(uniqueMediaIds.has(m.id))return false;uniqueMediaIds.add(m.id);return true});
      e.widgets=Array.isArray(e.widgets)?e.widgets.filter(isRecord):[];
      e.tags=Array.isArray(e.tags)
        ?[...new Set(e.tags.map(x=>String(x??'').trim()).filter(Boolean))]
        :[];
      e.style=(e.style&&typeof e.style==='object'&&!Array.isArray(e.style))?e.style:{};
      sanitizeNumbers(e.style,ENTITY_NUMBERS,'исправлены неверные числа в оформлении');
      for(const k of ['color','icon','shape','borderColor','animation'])if(e.style[k]!==undefined&&typeof e.style[k]!=='string'){delete e.style[k];noteRepair('исправлено неверное оформление')}
      sanitizeColors(e.style,['color','borderColor']);
      if(e.style.x!==undefined&&!Number.isFinite(Number(e.style.x))||e.style.y!==undefined&&!Number.isFinite(Number(e.style.y)))noteRepair('исправлены неверные координаты');
      // Missing coordinates used to be randomized on every normalize/persist call.
      // Use stable deterministic fallbacks instead.
      e.style.x=Number.isFinite(Number(e.style.x))?Number(e.style.x):index*140;
      e.style.y=Number.isFinite(Number(e.style.y))?Number(e.style.y):0;
      if(e.style.z!==undefined){if(Number.isFinite(Number(e.style.z)))e.style.z=Number(e.style.z);else delete e.style.z} // 0.23: depth in Graph 3D
      if(e.style.space===undefined)e.style.space=false;
      if(e.style.pinned===undefined)e.style.pinned=false;
      if(e.style.opacity===undefined)e.style.opacity=1;
      // 0.15.21: borderColor/borderWidth/glow/animation are inherited from the
      // entity type. Older versions wrote these defaults into every entity, which
      // made type edits invisible; untouched defaults are dropped so the type wins.
      if(!data.metadata.typeInheritanceV1){
        if(e.style.borderColor==='rgba(255,255,255,.22)')delete e.style.borderColor;
        if(Number(e.style.borderWidth)===1.3)delete e.style.borderWidth;
        if(Number(e.style.glow)===17)delete e.style.glow;
        if(e.style.animation==='none')delete e.style.animation;
        if(Number(e.style.animationSpeed)===1)delete e.style.animationSpeed;
        // Values identical to the entity's type were copied in by older versions;
        // dropping them changes nothing on screen but lets later type edits apply.
        const et=data.entityTypes.find(t=>t.id===e.type);
        if(et){for(const k of ['color','size','shape','icon']){if(e.style[k]!==undefined&&String(e.style[k]).toLowerCase()===String(et[k]??'').toLowerCase())delete e.style[k]}}
      }
      if(e.style.animationPhase===undefined)e.style.animationPhase=(index%16)/16*Math.PI*2;
      // 0.17: an entity may have no type («Без типа») — e.g. after the rule set was reset.
      if(e.type!=null&&e.type!==''&&!data.entityTypes.some(t=>t.id===String(e.type))){noteRepair('сущности с несуществующим типом переведены в «Без типа»');e.type=''}
      e.type=e.type==null?'':String(e.type);
      normalizeEntityStatus(e,statusGroupMap);
      for(const k of ['offBoard','onBoard','contentOffBoard'])if(e[k]!==undefined){if(e[k]===true||e[k]==='true')e[k]=true;else delete e[k]}if(e.offBoard)delete e.onBoard;
      if(e.vis!==undefined&&e.vis!=='gm'&&e.vis!=='hint')delete e.vis;
      if(!entityNamedVisibility(e))delete e.namedVisibility;
      if(e.paper!==undefined&&!(typeof boardPaperColor==='function'&&boardPaperColor(e.paper)))delete e.paper; /* 0.28.3: colour of the paper on the board */
      if(e.blockVis!==undefined){if(!isRecord(e.blockVis))delete e.blockVis;else{for(const [k,v] of Object.entries(e.blockVis))if(v!=='gm'&&v!=='hint')delete e.blockVis[k];if(!Object.keys(e.blockVis).length)delete e.blockVis}} // 0.27: the record lives off the board (hidden)
      if(e.aliases!==undefined){e.aliases=[...new Set((Array.isArray(e.aliases)?e.aliases:[]).map(x=>String(x??'').trim()).filter(Boolean))];if(!e.aliases.length)delete e.aliases}
      // 0.17.5: place of the paper on the Detective board.
      // board places: the old single place {x,y} and, since 0.23.6, one place per board {at:{scope:{x,y}}}
      if(e.board!==undefined){const b=e.board;if(!isRecord(b))delete e.board;else{const nb={};if(Number.isFinite(Number(b.x))&&Number.isFinite(Number(b.y))){nb.x=Math.round(Number(b.x));nb.y=Math.round(Number(b.y))}if(isRecord(b.at)){const at={};for(const [k,v] of Object.entries(b.at))if(isRecord(v)&&Number.isFinite(Number(v.x))&&Number.isFinite(Number(v.y))){at[k]={x:Math.round(Number(v.x)),y:Math.round(Number(v.y))};const w=Number(v.w),hh=Number(v.h);if(Number.isFinite(w))at[k].w=Math.round(clamp(w,110,640));if(Number.isFinite(hh))at[k].h=Math.round(clamp(hh,50,800))}if(Object.keys(at).length)nb.at=at}
        const fixed=v=>isRecord(v)&&['x','y','w','h'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))?{
          x:Math.round(v.x),y:Math.round(v.y),w:Math.round(clamp(v.w,110,640)),h:Math.round(clamp(v.h,50,800)),
          ...(v.autoHeight===true?{autoHeight:true}:{})
        }:null;
        const lock=fixed(b.lock);
        if(lock)nb.lock={...lock,parent:typeof b.lock.parent==='string'?b.lock.parent:null};
        const extra=Object.entries(isRecord(b.fixed)?b.fixed:{}).flatMap(([k,v])=>{const item=fixed(v);return item?[[k,item]]:[]});
        if(extra.length)nb.fixed=Object.fromEntries(extra);
        const photo=normalizeBoardPhoto(b.photo);
        if(photo)nb.photo=photo;
        if(Object.keys(nb).length)e.board=nb;else delete e.board}}
      normalizeOwnPage(e);
      for(const k of ['source','externalId'])if(e[k]!==undefined){if(e[k]==null||e[k]==='')delete e[k];else e[k]=String(e[k])}
      // Widget IDs are workspace-local primary keys in SQLite, so they must be
      // unique across every entity in the workspace, not merely inside one entity.
      // Repair missing/duplicate IDs deterministically before projection persistence.
      e.widgets=e.widgets.map(w=>{
        w.config=(w.config&&typeof w.config==='object')?w.config:{};
        w.style=(w.style&&typeof w.style==='object')?w.style:{};
        return w;
      });
    });

    // Widget IDs are primary keys together with workspace_id. Repair duplicates
    // across the entire workspace after all entity IDs are normalized.
    const workspaceWidgetIds=new Set();
    for(const e of ws.entities){
      e.widgets=e.widgets.map(w=>{
        if(!w.id||workspaceWidgetIds.has(w.id))w.id=uid('widget');
        workspaceWidgetIds.add(w.id);
        return w;
      });
    }
    // 0.21: maps of records — pins and areas pointing at records that no longer exist are dropped.
    if(typeof normalizeEntityMaps==='function')normalizeEntityMaps(ws,entityIds);

    // Remove dangling relations and repair duplicate/missing relation IDs.
    const relationIds=new Set();
    {const before=ws.relations.length;ws.relations=ws.relations.filter(r=>{if(r.from!=null)r.from=String(r.from);if(r.to!=null)r.to=String(r.to);return entityIds.has(r.from)&&entityIds.has(r.to)&&r.from!==r.to});noteRepair('удалены связи, которые вели к несуществующим сущностям',before-ws.relations.length)}
    ws.relations=ws.relations.map(r=>{
      if(!r.id||relationIds.has(r.id))r.id=uid('relation');
      relationIds.add(r.id);
      if(r.labelMode!==undefined&&!['always','hover','never'].includes(r.labelMode))delete r.labelMode; /* 0.28.3 */
      // Unknown relation-type references are normalized to a real generic type so
      // imported/corrupt data never depends on the transient getRT() fallback.
      if(!playerRelationMasked(r)&&!data.relationTypes.some(t=>t.id===r.type)){r.type=ensureGenericRelationType().id;noteRepair('связям с несуществующим типом назначен тип «Связь»')}
      r.properties=(r.properties&&typeof r.properties==='object'&&!Array.isArray(r.properties))?r.properties:{};
      r.style=(r.style&&typeof r.style==='object'&&!Array.isArray(r.style))?r.style:{};
      if(r.description!==undefined){if(r.description==null||r.description==='')delete r.description;else r.description=String(r.description)}
      normalizeOwnPage(r);
      sanitizeNumbers(r.style,RELATION_NUMBERS,'исправлены неверные числа в оформлении');
      sanitizeColors(r.style,['color']);
      // 0.15.21: these are inherited from the relation type. Older versions
      // wrote the defaults into every relation, which hid type edits.
      if(!data.metadata.typeInheritanceV1){
        const defaults={opacity:1,curve:0,dashSize:7,dashGap:7,labelVisible:true,animationStyle:'dot',animationSpeed:1,arrowSize:8};
        for(const [k,v] of Object.entries(defaults))if(r.style[k]===v)delete r.style[k];
      }
      return r;
    });

    const parentByChild=udNormalizeContainment(ws,r=>getRT(r.type).containment,noteRepair);
    const containmentTargets=new Set(parentByChild.keys());
    if(ws.rootId!=null)ws.rootId=String(ws.rootId);
    const rootCandidate=
      (ws.rootId&&entityIds.has(ws.rootId)&&!containmentTargets.has(ws.rootId)?ws.rootId:null)
      ||ws.entities.find(e=>e.id==='e-world')?.id
      ||ws.entities.find(e=>e.style?.space&&!containmentTargets.has(e.id))?.id
      ||ws.entities.find(e=>!containmentTargets.has(e.id))?.id
      ||ws.entities[0]?.id
      ||null;
    ws.rootId=rootCandidate;
    const locked=ws.entities.filter(e=>e.board?.lock);
    if(locked.length){
      for(const e of locked)e.board.lock.parent=parentByChild.get(e.id)||null;
    }
    if(typeof normalizeBoards==='function')normalizeBoards(ws,new Set(ws.entities.map(e=>e.id))); // 0.23.6: open cases and pinned records of each board

    const defaultView={zoom:1,panX:0,panY:0,scopeId:ws.rootId,showExternal:false,isolate:false,hideFar:false,focusRadius:2,galaxyZoom:1,galaxyPanX:0,galaxyPanY:0,galaxyRootCollapsed:false,treeZoom:1,galaxyOrbit:{},galaxyOrbitOpacity:.62,visualStyle:'classic'};
    ws.view=(ws.view&&typeof ws.view==='object')?ws.view:defaultView;
    if(!Number.isFinite(Number(ws.view.zoom)))ws.view.zoom=1;
    if(!Number.isFinite(Number(ws.view.panX)))ws.view.panX=0;
    if(!Number.isFinite(Number(ws.view.panY)))ws.view.panY=0;
    ws.view.galaxyOrbit=(ws.view.galaxyOrbit&&typeof ws.view.galaxyOrbit==='object')?ws.view.galaxyOrbit:{};
    if(!isVisualStyle(ws.view.visualStyle))ws.view.visualStyle='classic';
    if(ws.styleLock!=null&&!isVisualStyle(ws.styleLock))delete ws.styleLock;
    if(ws.mehWords!=null)ws.mehWords=Array.isArray(ws.mehWords)?ws.mehWords.filter(w=>w&&typeof w.word==='string'&&w.word.trim()&&typeof w.to==='string').slice(0,2000):[]; // 0.26.1: words of this world for Meh // 0.25.3: the Master's style for this world
    if(!entityIds.has(ws.view.scopeId))ws.view.scopeId=ws.rootId;
    ws.positions=(ws.positions&&typeof ws.positions==='object')?ws.positions:{};
  }

  // Guarantee at least one workspace.
  if(!data.workspaces.length){
    data.workspaces=[{id:'ws-main',name:'Основной мир',favorite:true,rootId:null,createdAt:now,updatedAt:now,view:{},positions:{},entities:[],relations:[]}];
    normalizeRuleSet(data.workspaces[0],legacyRules);
  }

  if(!state.workspaceId||!data.workspaces.some(w=>w.id===state.workspaceId))state.workspaceId=data.workspaces[0].id;
  const activeWs=data.workspaces.find(w=>w.id===state.workspaceId)||data.workspaces[0];
  data.entities=activeWs.entities;
  data.relations=activeWs.relations;
  data.entityTypes=activeWs.entityTypes;
  data.relationTypes=activeWs.relationTypes;
  data.statusGroups=activeWs.statusGroups;

  data.metadata.typeInheritanceV1=true;

  invalidateContainmentIndex();
  if(typeof viewAsPlayer==='function'&&viewAsPlayer())playerReproject(); /* 0.28: in the player's view the views keep reading the copy */
  if(typeof udRestoreSharedContext==='function')udRestoreSharedContext();
}

