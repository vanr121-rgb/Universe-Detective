// Universe Graph — разделы страницы записи и связи (0.18).
// Страница = шапка + разделы. Раздел — «кирпичик» одного из видов (SECTION_KINDS) со своими настройками.
// Откуда берутся разделы:
//   • шаблон типа (type.page) — у всех записей типа; нет шаблона → страница по умолчанию;
//   • свои разделы записи (o.page.add), скрытые разделы типа (o.page.hide) и свой порядок (o.page.order);
//   • содержимое разделов «своего содержимого» лежит в записи: o.sectionData[id раздела].
// Открытый раздел остаётся открытым при переходе к другой записи (ключ сворачивания = id раздела).
// Модуль загружается обычным <script> в порядке, заданном в index.html.
'use strict';

const SECTION_TEXT_STYLES=[['normal','обычный'],['hand','рукописный'],['parchment','пергамент'],['mono','моноширинный'],['note','листок-заметка']];
const SECTION_FONT_SIZES=[['s','мелкий'],['m','средний'],['l','крупный']];
const SECTION_MAX_ROWS=400;

// Settings: {key,label,type,options?,def?,min?,max?,when?}. Types: select · bool · number · text · lines · types · reltypes · statuses.
const SECTION_KINDS={
  // 0.26.9: what Meh was told about the record (notes/notesui.js) — shown by itself when there is something
  mehnotes:{name:'Что рассказывали',icon:'🧠',group:'data',subjects:['entity'],unique:true,hint:'Заметки Меха, открытые вопросы и строки журнала сессий про эту запись'},
  description:{name:'Описание',icon:'¶',group:'data',subjects:['entity','relation'],unique:true,hint:'Текст сущности с [[вики-ссылками]], **жирным** и картинками',
    settings:[{key:'style',label:'Вид текста',type:'select',options:SECTION_TEXT_STYLES,def:'normal'},{key:'size',label:'Размер текста',type:'select',options:SECTION_FONT_SIZES,def:'m'}]},
  fields:{name:'Анкета',icon:'☰',group:'data',subjects:['entity','relation'],unique:true,hint:'Вопросы типа и ответы этой сущности',
    settings:[{key:'hideBlank',label:'Скрывать вопросы без ответа',type:'bool',def:false},{key:'columns',label:'Колонки',type:'select',options:[['1','одна'],['2','две']],def:'1'}]},
  properties:{name:'Свойства',icon:'≡',group:'data',subjects:['entity','relation'],unique:true,hint:'Свободные поля сущности вне анкеты',
    settings:[{key:'columns',label:'Колонки',type:'select',options:[['1','одна'],['2','две']],def:'2'}]},
  gallery:{name:'Галерея',icon:'▣',group:'data',subjects:['entity'],unique:true,hint:'Все картинки сущности',
    settings:[{key:'columns',label:'Колонки',type:'select',options:[['1','1'],['2','2'],['3','3'],['4','4']],def:'3'},{key:'size',label:'Высота картинок',type:'select',options:[['s','низкие'],['m','средние'],['l','высокие'],['auto','как есть']],def:'m'},{key:'fit',label:'Как вписывать',type:'select',options:[['cover','заполнить (обрезать края)'],['contain','целиком']],def:'cover'},{key:'captions',label:'Подписи под картинками',type:'bool',def:true}]},
  relations:{name:'Связи',icon:'↔',group:'data',subjects:['entity'],unique:false,hint:'Связи сущности — все или только нужных типов',
    settings:[{key:'relTypes',label:'Только эти типы связей (ничего не отмечено — все)',type:'reltypes'},{key:'direction',label:'Направление',type:'select',options:[['all','все'],['out','исходящие (сущность → …)'],['in','входящие (… → сущность)']],def:'all'},{key:'sort',label:'Порядок',type:'select',options:[['type','по типу связи'],['name','по имени'],['none','как созданы']],def:'type'},{key:'limit',label:'Показывать не больше',type:'number',min:1,max:500,def:60}]},
  contents:{name:'Содержание',icon:'⌄',group:'data',subjects:['entity'],unique:false,hint:'Что вложено в сущность, на любой глубине',
    settings:[{key:'entTypes',label:'Только эти типы сущностей (ничего не отмечено — все)',type:'types'}]},
  records:{name:'Подборка сущностей',icon:'◈',group:'data',subjects:['entity'],unique:false,hint:'Сущности по правилу: «Квесты», «Жители», «Враги», «Товары»…',
    settings:[{key:'source',label:'Откуда брать',type:'select',options:[['related','связанные с этой сущностью'],['children','вложенные (первый уровень)'],['descendants','вложенные (все уровни)'],['siblings','соседи по пространству'],['mentions','упоминают эту сущность'],['mentioned','упомянуты в этой сущности'],['all','все сущности пространства']],def:'related'},
      {key:'relTypes',label:'Через связи этих типов (ничего — любые)',type:'reltypes',when:{source:'related'}},{key:'direction',label:'Направление связи',type:'select',options:[['all','любое'],['out','исходящие'],['in','входящие']],def:'all',when:{source:'related'}},
      {key:'entTypes',label:'Только сущности этих типов (ничего — любые)',type:'types'},{key:'statuses',label:'Только со статусами (ничего — любые)',type:'statuses'},
      {key:'display',label:'Вид',type:'select',options:[['list','список'],['chips','плашки'],['cards','карточки с описанием']],def:'list'},{key:'sort',label:'Порядок',type:'select',options:[['name','по имени'],['type','по типу'],['none','как созданы']],def:'name'},{key:'limit',label:'Показывать не больше',type:'number',min:1,max:500,def:50}]},
  mentions:{name:'Упоминания',icon:'❝',group:'data',subjects:['entity'],unique:true,hint:'Кто ссылается на сущность через [[ ]] или поле-ссылку, и на кого ссылается она',
    settings:[{key:'show',label:'Показывать',type:'select',options:[['both','обе стороны'],['in','кто ссылается на сущность'],['out','на кого ссылается сущность']],def:'both'}]},
  tags:{name:'Теги',icon:'#',group:'data',subjects:['entity'],unique:true,hint:'Метки для поиска и фильтров',settings:[]},
  blocks:{name:'Блоки и графики',icon:'▦',group:'data',subjects:['entity'],unique:false,hint:'Карточки, метрики, графики и картинки из «Настроить блоки». Можно поставить несколько разделов: например, отдельно графики и отдельно карточки',
    settings:[{key:'show',label:'Какие блоки показывать',type:'select',options:[['all','все'],['chart','только графики'],['card','только карточки и метрики'],['image','только картинки']],def:'all'}]},
  info:{name:'Служебное',icon:'ⓘ',group:'data',subjects:['entity','relation'],unique:true,hint:'ID, родитель, даты, источник',
    settings:[{key:'onlyFull',label:'Только в режиме «Информация»',type:'bool',def:true}]},
  text:{name:'Заметка',icon:'✎',group:'content',subjects:['entity','relation'],unique:false,hint:'Свой текст с [[ссылками]]: секреты, слухи, планы',content:'text',
    settings:[{key:'style',label:'Вид текста',type:'select',options:SECTION_TEXT_STYLES,def:'normal'},{key:'size',label:'Размер текста',type:'select',options:SECTION_FONT_SIZES,def:'m'},{key:'placeholder',label:'Подсказка, пока пусто',type:'text',def:''}]},
  list:{name:'Список',icon:'☑',group:'content',subjects:['entity','relation'],unique:false,hint:'Чек-лист, маркеры или нумерованный список',content:'rows',
    settings:[{key:'mode',label:'Вид',type:'select',options:[['check','чек-лист с галочками'],['bullet','маркеры'],['number','нумерованный']],def:'check'},{key:'hideDone',label:'Прятать выполненные',type:'bool',def:false,when:{mode:'check'}},{key:'items',label:'Пункты по умолчанию — по одному в строке',type:'lines'}],
    rows:[{key:'text',label:'Пункт',type:'text',wiki:true},{key:'done',label:'Готово',type:'bool'}]},
  table:{name:'Таблица',icon:'⊞',group:'content',subjects:['entity','relation'],unique:false,hint:'Свои колонки и строки: инвентарь, цены, расписание',content:'rows',
    settings:[{key:'columns',label:'Колонки — по одной в строке',type:'lines',def:['Название','Значение']},{key:'striped',label:'Полосы через строку',type:'bool',def:true},{key:'header',label:'Показывать заголовки колонок',type:'bool',def:true}]},
  stats:{name:'Характеристики',icon:'⚄',group:'content',subjects:['entity','relation'],unique:false,hint:'Числа с подписью: СИЛ 16 (+3), Броня 14…',content:'rows',
    settings:[{key:'items',label:'Характеристики по умолчанию — по одной в строке',type:'lines'},{key:'columns',label:'Колонки',type:'select',options:[['2','2'],['3','3'],['4','4'],['6','6']],def:'3'},{key:'modifier',label:'Модификатор',type:'select',options:[['none','не показывать'],['dnd','как в D&D: (значение − 10) ÷ 2'],['plain','значение со знаком']],def:'none'}],
    rows:[{key:'name',label:'Название',type:'text'},{key:'value',label:'Значение',type:'number'}]},
  trackers:{name:'Счётчики',icon:'±',group:'content',subjects:['entity','relation'],unique:false,hint:'ХП 12/20, ресурсы, «часы» угрозы — с кнопками − / +',content:'rows',
    settings:[{key:'items',label:'Счётчики по умолчанию — «Название / максимум», по одному в строке',type:'lines'},{key:'style',label:'Вид',type:'select',options:[['bar','полоса'],['pips','точки'],['clock','часы'],['number','только число']],def:'bar'},{key:'step',label:'Шаг кнопок − / +',type:'number',min:1,max:1000,def:1}],
    rows:[{key:'name',label:'Название',type:'text'},{key:'value',label:'Сейчас',type:'number'},{key:'max',label:'Максимум',type:'number'},{key:'color',label:'Цвет',type:'color'}]},
  timeline:{name:'Хронология',icon:'⌛',group:'content',subjects:['entity','relation'],unique:false,hint:'События по датам: биография, история города',content:'rows',
    settings:[{key:'order',label:'Порядок',type:'select',options:[['manual','как записано'],['asc','сначала ранние'],['desc','сначала поздние']],def:'manual'}],
    rows:[{key:'date',label:'Когда',type:'text'},{key:'text',label:'Что случилось',type:'text',wiki:true}]},
  quotes:{name:'Цитаты',icon:'❞',group:'content',subjects:['entity','relation'],unique:false,hint:'Фразы и кто их сказал',content:'rows',settings:[],
    rows:[{key:'text',label:'Цитата',type:'text',wiki:true},{key:'who',label:'Кто сказал',type:'text',wiki:true}]},
  links:{name:'Ссылки',icon:'↗',group:'content',subjects:['entity','relation'],unique:false,hint:'Адреса в интернете: вики, Fandom, музыка для сцены',content:'rows',settings:[],
    rows:[{key:'title',label:'Название',type:'text'},{key:'url',label:'Адрес (https://…)',type:'text'}]}
};
const SECTION_COMMON_KEYS=['title','icon','color','open','hideEmpty','compact','maxHeight'];

// ---- Default pages ----
// The ids of the default sections are the fold keys of 0.17, so what was open stays open.
// Sections that collect data hide while empty and appear by themselves when something is in them.
function defaultPage(kind){
  return kind==='relation'
    ?[{id:'description',kind:'description'},{id:'fields',kind:'fields',hideEmpty:true},{id:'properties',kind:'properties',hideEmpty:true},{id:'articles',kind:'articles',hideEmpty:true},{id:'info',kind:'info'}].map(s=>({...s,config:{}}))
    :[{id:'description',kind:'description'},{id:'fields',kind:'fields',hideEmpty:true},{id:'properties',kind:'properties',hideEmpty:true},{id:'gallery',kind:'gallery',hideEmpty:true},{id:'map',kind:'map',hideEmpty:true},{id:'relations',kind:'relations',hideEmpty:true},{id:'contents',kind:'contents',hideEmpty:true},{id:'mentions',kind:'mentions',hideEmpty:true},{id:'articles',kind:'articles',hideEmpty:true},{id:'tags',kind:'tags',hideEmpty:true},{id:'widgets',kind:'blocks',hideEmpty:true},{id:'info',kind:'info'}].map(s=>({...s,config:{}}));
}

// ---- Settings normalisation (called by normalize.js for every section) ----
function sectionSettingDefault(st){return Array.isArray(st.def)?[...st.def]:st.def}
function sectionNormalizeConfig(sec){
  const k=SECTION_KINDS[sec.kind];if(!k)return;const c=sec.config,out={};
  for(const st of k.settings){
    let v=c[st.key];if(v===undefined)continue;
    if(st.type==='select'){v=String(v);if(!st.options.some(([id])=>id===v))continue}
    else if(st.type==='bool')v=!!v;
    else if(st.type==='number'){v=Math.round(Number(v));if(!Number.isFinite(v))continue;v=clamp(v,st.min??-1e9,st.max??1e9)}
    else if(st.type==='text')v=String(v).slice(0,200);
    else if(st.type==='lines'){v=(Array.isArray(v)?v:String(v).split('\n')).map(x=>String(x??'').trim().slice(0,120)).filter(Boolean).slice(0,60)}
    else if(['types','reltypes','statuses'].includes(st.type)){v=[...new Set((Array.isArray(v)?v:[]).map(String).filter(Boolean))].slice(0,100)}
    out[st.key]=v;
  }
  sec.config=out;
}
function secConf(sec,key){const k=SECTION_KINDS[sec.kind],st=k?.settings.find(x=>x.key===key);const v=sec.config?.[key];return v!==undefined?v:(st?sectionSettingDefault(st):undefined)}

// ---- Subject: the record or relation whose page is shown ----
function sectionSubject(kind,id){
  if(kind==='relation'){const r=data.relations.find(x=>x.id===id);if(!r)return null;const typeDef=data.relationTypes.find(t=>t.id===r.type)||null;return {kind,id,obj:r,typeDef,typeName:getRT(r.type).name}}
  const e=getEntity(id);if(!e)return null;const typeDef=data.entityTypes.find(t=>t.id===e.type)||null;return {kind:'entity',id,obj:e,typeDef,typeName:typeDef?typeDef.name:'Без типа'};
}
function subjectKey(subj){return subj.kind+':'+subj.id}
function subjectFromKey(key){const i=String(key||'').indexOf(':');return i<0?null:sectionSubject(key.slice(0,i),key.slice(i+1))}
function typePage(typeDef,kind){return Array.isArray(typeDef?.page)?typeDef.page:defaultPage(kind)}
function findTypeDef(typeKind,typeId){return (typeKind==='relation'?data.relationTypes:data.entityTypes).find(t=>t.id===typeId)||null}
// All sections of a page, in order; hidden ones separately.
function pageSections(subj){
  const tpl=typePage(subj.typeDef,subj.kind).map((sec,i)=>({sec,own:false,i}));
  const own=(subj.obj.page?.add||[]).map((sec,i)=>({sec,own:true,i:1000+i}));
  const hide=new Set(subj.obj.page?.hide||[]),order=subj.obj.page?.order||[];
  const pos=entry=>{const k=order.indexOf(entry.sec.id);return k<0?100000+entry.i:k};
  // 0.23.9: a record that has a map shows the «Карта» block (with a small preview) even if its type's page has no such block
  if(subj.kind==='entity'&&typeof hasEntityMap==='function'&&hasEntityMap(subj.obj)&&!tpl.some(x=>x.sec.kind==='map')&&!own.some(x=>x.sec.kind==='map')){const d=tpl.findIndex(x=>x.sec.kind==='description');tpl.push({sec:{id:'auto-map',kind:'map'},own:false,i:d>=0?d+.5:-1})}
  // 0.26.9: «Что рассказывали» — by itself when Meh keeps something about the record
  if(subj.kind==='entity'&&typeof mehNotesFor==='function'&&!tpl.some(x=>x.sec.kind==='mehnotes')&&!own.some(x=>x.sec.kind==='mehnotes')&&mehNotesFor(subj.obj).length){const d=tpl.findIndex(x=>x.sec.kind==='description');tpl.push({sec:{id:'auto-mehnotes',kind:'mehnotes',open:true},own:false,i:d>=0?d+.6:-1})}
  const all=[...tpl,...own].sort((a,b)=>pos(a)-pos(b));
  return {visible:all.filter(x=>x.own||!hide.has(x.sec.id)),hidden:all.filter(x=>!x.own&&hide.has(x.sec.id))};
}
function findPageSection(subj,secId){const p=pageSections(subj);return [...p.visible,...p.hidden].find(x=>x.sec.id===secId)||null}

// ---- Section contents ----
function trackerSeed(line){const m=String(line).match(/^(.*?)(?:\s*\/\s*(\d+))?$/);return {name:(m?.[1]||line).trim(),value:m?.[2]?Number(m[2]):0,max:m?.[2]?Number(m[2]):10}}
function seedRows(sec){
  const items=secConf(sec,'items')||[];
  if(sec.kind==='list')return items.map(text=>({text,done:false}));
  if(sec.kind==='stats')return items.map(name=>({name,value:''}));
  if(sec.kind==='trackers')return items.map(trackerSeed);
  return [];
}
function sectionRowsRaw(subj,sec){const d=subj.obj.sectionData?.[sec.id];return Array.isArray(d?.rows)?d.rows.filter(isRecord).slice(0,SECTION_MAX_ROWS):null}
function sectionRows(subj,sec){return sectionRowsRaw(subj,sec)??seedRows(sec)}
function sectionText(subj,sec){return String(subj.obj.sectionData?.[sec.id]?.text??'')}
function tableColumns(sec){const c=secConf(sec,'columns');return (Array.isArray(c)&&c.length?c:['Название','Значение']).slice(0,12)}
function rowFieldsFor(sec){if(sec.kind==='table')return tableColumns(sec).map((name,i)=>({key:'c'+i,label:name,type:'text',wiki:true}));return SECTION_KINDS[sec.kind]?.rows||[]}

// ---- Fold state ----
// 0.21.5: «Описание» is open until the person closes it (the short excerpt under the name was removed — it read as a repeat).
// 0.24: open/closed is remembered for each type of record (a «Персонаж» may keep «История» open, a «Город» — closed).
// Keys «e:<type>|<section>» / «r:<relation type>|<section>»; with nothing remembered for the type — the old common memory.
function foldKey(subj,secId){return `${subj?.kind==='relation'?'r':'e'}:${subj?.obj?.type||''}|${secId}`}
// UD: on a card («▸ Подробнее») a section with something in it starts open, an empty one closed (udcard.js sets this while drawing)
let secOpenFilled=false;
function sectionIsOpen(sec,subj){
  if(subj){const k=foldKey(subj,sec.id);if(state.relationFolds.has(k))return true;if(state.foldsClosed?.has(k))return false}
  return state.relationFolds.has(sec.id)?true:(state.foldsClosed?.has(sec.id)?false:!!sec.open||sec.kind==='description'||(secOpenFilled&&!!subj&&!sectionIsEmpty(subj,sec)))}
function setFoldOpen(subj,secId,open){const k=subj?foldKey(subj,secId):secId;if(!state.foldsClosed)state.foldsClosed=new Set();
  if(open){state.relationFolds.add(k);state.foldsClosed.delete(k)}else{state.relationFolds.delete(k);state.foldsClosed.add(k)}}

// ---- Rendering ----
function sectionTitle(sec){return sec.title||SECTION_KINDS[sec.kind]?.name||'Раздел'}
function sectionIcon(sec){return sec.icon||SECTION_KINDS[sec.kind]?.icon||'•'}
function relationsFor(subj,sec){
  const e=subj.obj,types=secConf(sec,'relTypes')||[],dir=secConf(sec,'direction');
  let rs=relationRows(e).filter(r=>(!types.length||types.includes(r.type))&&(dir==='all'||(dir==='out'?r.from===e.id:r.to===e.id)));
  const sort=secConf(sec,'sort');const other=r=>getEntity(r.from===e.id?r.to:r.from);
  if(sort==='name')rs=[...rs].sort((a,b)=>String(other(a)?.name||'').localeCompare(String(other(b)?.name||''),'ru'));
  else if(sort==='type')rs=[...rs].sort((a,b)=>getRT(a.type).name.localeCompare(getRT(b.type).name,'ru')||String(other(a)?.name||'').localeCompare(String(other(b)?.name||''),'ru'));
  return rs;
}
function descendantsOf(id,seen=new Set()){const out=[];for(const c of containmentChildren(id)){if(seen.has(c))continue;seen.add(c);const e=getEntity(c);if(e){out.push(e);out.push(...descendantsOf(c,seen))}}return out}
function recordsFor(subj,sec){
  const e=subj.obj,src=secConf(sec,'source');let list=[];
  if(src==='related'){const types=secConf(sec,'relTypes')||[],dir=secConf(sec,'direction');for(const r of relationRows(e)){if(types.length&&!types.includes(r.type))continue;if(dir==='out'&&r.from!==e.id)continue;if(dir==='in'&&r.to!==e.id)continue;const o=getEntity(r.from===e.id?r.to:r.from);if(o)list.push(o)}}
  else if(src==='children')list=containmentChildren(e.id).map(getEntity).filter(Boolean);
  else if(src==='descendants')list=descendantsOf(e.id);
  else if(src==='siblings'){const p=containmentParent(e.id);list=(p?containmentChildren(p):[]).map(getEntity).filter(x=>x&&x.id!==e.id)}
  else if(src==='mentions'){const m=wikiMentionIndex().incoming.get(e.id);list=m?[...m.keys()].filter(k=>k.startsWith('e:')).map(k=>getEntity(k.slice(2))).filter(Boolean):[]}
  else if(src==='mentioned'){const m=wikiMentionIndex().outgoing.get('e:'+e.id);list=m?[...m.keys()].map(getEntity).filter(Boolean):[]}
  else if(src==='all')list=data.entities.filter(x=>x.id!==e.id);
  const types=secConf(sec,'entTypes')||[],sts=secConf(sec,'statuses')||[];
  list=[...new Map(list.map(x=>[x.id,x])).values()].filter(x=>(!types.length||types.includes(x.type))&&(!sts.length||entityStatuses(x).some(s=>sts.includes(statusKey(s.group.id,s.option.id)))));
  const sort=secConf(sec,'sort');
  if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'ru'));else if(sort==='type')list.sort((a,b)=>getET(a.type).name.localeCompare(getET(b.type).name,'ru')||a.name.localeCompare(b.name,'ru'));
  return list;
}
function mentionsFor(subj,sec){const idx=wikiMentionIndex(),show=secConf(sec,'show');const inc=show==='out'?[]:[...(idx.incoming.get(subj.id)||new Map()).entries()];const out=show==='in'?[]:[...(idx.outgoing.get('e:'+subj.id)||new Map()).entries()];return {inc,out}}
function galleryImages(e){return entityMedia(e).filter(m=>/^image\//.test(m.mime||'image/'))}
function freeProperties(subj){const names=new Set((subj.typeDef?.fields||[]).map(f=>f.name));return Object.entries(subj.obj.properties||{}).filter(([k])=>!names.has(k)&&!(subj.kind==='relation'&&k==='secret'))}

// Count shown in the section head ('' = nothing). Also decides «пустой раздел».
function sectionCount(subj,sec){
  const e=subj.obj;
  switch(sec.kind){
    case 'description':return String(e.description||'').trim()?'':0;
    case 'fields':{const f=subj.typeDef?.fields||[];if(!f.length)return 0;return f.filter(x=>e.properties?.[x.name]!=null&&e.properties[x.name]!=='').length+'/'+f.length}
    case 'properties':return freeProperties(subj).length;
    case 'gallery':return galleryImages(e).length;
    case 'relations':return relationsFor(subj,sec).length;
    case 'contents':return containmentChildren(e.id).length;
    case 'records':return recordsFor(subj,sec).length;
    case 'mentions':{const m=mentionsFor(subj,sec);return m.inc.length+m.out.length}
    case 'mehnotes':return typeof mehNotesFor==='function'?mehNotesFor(e).length:0;
    case 'tags':return (e.tags||[]).length;
    case 'blocks':return 0;
    case 'articles':return typeof articlesForSubject==='function'?articlesForSubject(subj).length:0;
    case 'map':return typeof hasEntityMap==='function'?(hasEntityMap(e)?(entityMap(e).pins.length||''):(mapsShowing(e.id).length?'':0)):0;
    case 'info':return '';
    case 'text':return sectionText(subj,sec).trim()?'':0;
    case 'list':{const rows=sectionRows(subj,sec);return secConf(sec,'mode')==='check'&&rows.length?rows.filter(r=>r.done).length+'/'+rows.length:rows.length}
    default:return sectionRows(subj,sec).length;
  }
}
function sectionIsEmpty(subj,sec){
  if(subj.obj?.blockHidden?.[sec.id]==='hint')return false;
  const c=sectionCount(subj,sec);
  return c===0||c==='0/0';
}

function entityRowHtml(o,extra=''){const et=getET(o.type);return `<div class="relationTreeItem secEntityRow" data-related="${escapeHtml(o.id)}"><div class="listIcon" style="color:${escapeHtml(safeCssValue(o.style?.color||et.color,'#74b8ff'))}">${escapeHtml(o.style?.icon||et.icon||'•')}</div><div class="listMeta"><b>${escapeHtml(o.name)}</b><small>${escapeHtml(o.type?et.name:'Без типа')}${extra}</small>${statusChipsHtml(o)?`<span class="secRowChips">${statusChipsHtml(o)}</span>`:''}</div></div>`}
function kvGrid(pairs,cols){return pairs.length?`<div class="kv secKv" style="--sec-cols:${cols}">${pairs.map(([k,v])=>`<div class="kvItem"><small>${escapeHtml(k)}</small><span>${v}</span></div>`).join('')}</div>`:''}
function textClass(sec){return `secText style-${escapeHtml(secConf(sec,'style')||'normal')} size-${escapeHtml(secConf(sec,'size')||'m')}`}
function modifierText(v,mode){const n=Number(v);if(!Number.isFinite(n)||v===''||mode==='none')return '';const m=mode==='dnd'?Math.floor((n-10)/2):n;return (m>=0?'+':'')+m}
function safeUrl(u){const s=String(u||'').trim();return /^https?:\/\/[^\s"'<>]+$/i.test(s)?s:''}
function compareDates(a,b){const na=parseFloat(String(a).replace(',','.')),nb=parseFloat(String(b).replace(',','.'));if(Number.isFinite(na)&&Number.isFinite(nb)&&na!==nb)return na-nb;return String(a).localeCompare(String(b),'ru',{numeric:true})}
function trackerVisual(row,style,secId,i,step){
  const v=Number(row.value)||0,max=Math.max(1,Number(row.max)||0),pct=clamp(v/max,0,1),color=escapeHtml(safeCssValue(row.color,'')||'');
  const btn=(d,label)=>`<button type="button" class="iconBtn secStep" data-sec-step="${escapeHtml(secId)}|${i}|${d*step}" title="${d<0?'Уменьшить':'Увеличить'} на ${step}" aria-label="${escapeHtml(row.name||'Счётчик')}: ${d<0?'минус':'плюс'} ${step}">${label}</button>`;
  let vis='';
  if(style==='bar')vis=`<div class="secBar"><i style="width:${(pct*100).toFixed(1)}%${color?';background:'+color:''}"></i></div>`;
  else if(style==='pips'){const n=Math.min(max,30);vis=`<div class="secPips">${Array.from({length:n},(_,k)=>`<i class="${k<Math.round(pct*n)?'on':''}"${color&&k<Math.round(pct*n)?` style="background:${color}"`:''}></i>`).join('')}</div>`}
  else if(style==='clock'){const segs=Math.min(max,12),filled=Math.round(pct*segs),r=16,c=18;let paths='';for(let k=0;k<segs;k++){const a0=(k/segs)*Math.PI*2-Math.PI/2,a1=((k+1)/segs)*Math.PI*2-Math.PI/2;paths+=`<path d="M${c},${c} L${(c+r*Math.cos(a0)).toFixed(2)},${(c+r*Math.sin(a0)).toFixed(2)} A${r},${r} 0 0 1 ${(c+r*Math.cos(a1)).toFixed(2)},${(c+r*Math.sin(a1)).toFixed(2)} Z" class="${k<filled?'on':''}"${color&&k<filled?` style="fill:${color}"`:''}/>`}vis=`<svg class="secClock" viewBox="0 0 36 36" aria-hidden="true">${paths}</svg>`}
  return `<div class="secTracker s-${escapeHtml(style)}"><div class="secTrackerHead"><b>${escapeHtml(row.name||'Счётчик')}</b><span class="secTrackerVal">${escapeHtml(String(v))}${row.max!==''&&row.max!=null?` / ${escapeHtml(String(row.max))}`:''}</span>${btn(-1,'−')}${btn(1,'+')}</div>${vis}</div>`;
}
let udDescriptionDraft=null;
function udDescriptionHost(key){
  return document.querySelector(`#detectiveView [data-subject="${CSS.escape(key)}"] [data-ud-description]`);
}
function udDetachDescriptionEditor(){
  const draft=udDescriptionDraft;
  if(!draft)return null;
  const active=document.activeElement===draft.input;
  if(draft.form.isConnected)draft.form.remove();
  return {draft,active};
}
function udRestoreDescriptionEditor(detached){
  if(!detached||detached.draft!==udDescriptionDraft||detached.draft.workspace!==state.workspaceId)return;
  const {draft,active}=detached,host=udDescriptionHost(draft.key);
  if(!host)return;
  host.replaceChildren(draft.form);
  if(active)draft.input.focus({preventScroll:true});
}
function udOpenDescription(subj,host){
  if(!subj||!host||!udCanEditText(subj.obj,'desc'))return;
  if(udDescriptionDraft&&!udFinishDescription(true))return;
  const key=subjectKey(subj),workspace=state.workspaceId;
  host=udDescriptionHost(key)||host;
  const form=document.createElement('form');
  form.className='udDescriptionEdit';
  form.innerHTML='<textarea aria-label="Описание" rows="5" data-wiki></textarea><div class="udDescriptionActions"><button type="submit" class="btn primary tiny">Сохранить</button><button type="button" class="btn tiny">Отмена</button></div>';
  const input=form.querySelector('textarea'),original=subj.obj.description||'';
  input.value=original;
  udDescriptionDraft={key,workspace,form,input,original};
  form.addEventListener('submit',ev=>{ev.preventDefault();udFinishDescription(true)});
  form.querySelector('[type="button"]').onclick=()=>udFinishDescription(false);
  input.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();udFinishDescription(false)}
    if(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();ev.stopPropagation();udFinishDescription(true)}
  });
  host.replaceChildren(form);
  input.focus();
}
function udFinishDescription(save){
  const draft=udDescriptionDraft;
  if(!draft)return true;
  const subj=draft.workspace===state.workspaceId?subjectFromKey(draft.key):null,value=draft.input.value.trimEnd();
  if(save&&value!==draft.original){
    if(!subj||!udCanEditText(subj.obj,'desc')){toast('Описание больше недоступно. Скопируйте черновик перед отменой.','err');return false;}
    if(String(subj.obj.description||'')!==draft.original){
      toast('Описание изменилось, пока вы печатали. Скопируйте черновик перед отменой.','err');
      return false;
    }
    if(!commitSectionChange(()=>{subj.obj.description=value;subj.obj.updatedAt=new Date().toISOString()},'Описание сохранено'))return false;
  }
  udDescriptionDraft=null;
  renderDetective();
  return true;
}
function sectionBody(subj,sec,full){
  const e=subj.obj,id=sec.id;
  switch(sec.kind){
    case 'articles':return typeof articlesSectionBody==='function'?articlesSectionBody(subj):'';
    case 'map':return typeof mapSectionBody==='function'?mapSectionBody(subj):'';
    case 'mehnotes':return typeof mehNotesSectionBody==='function'?mehNotesSectionBody(e):'';
    case 'description':{
      const html=richTextHtml(e.description,{entity:subj.kind==='entity'?e:null,empty:''});
      const text=html?`<div class="${textClass(sec)}">${html}</div>`:'<div class="empty">Описания пока нет.</div>';
      if(subj.kind!=='entity')return text;
      const edit=udCanEditText(e,'desc')?`<button type="button" class="linkBtn" data-ud-description-edit>${html?'Изменить':'Добавить'}</button>`:'';
      return `<div data-ud-description>${text}${edit}</div>`;
    }
    case 'fields':{const fields=subj.typeDef?.fields||[];if(!fields.length)return `<div class="empty">У типа «${escapeHtml(subj.typeName)}» нет анкеты. Её можно задать в «Правилах».</div>`;const hide=secConf(sec,'hideBlank');const list=fields.filter(f=>!hide||(e.properties?.[f.name]!=null&&e.properties[f.name]!==''));return list.length?`<div class="kv fieldKv secKv" style="--sec-cols:${secConf(sec,'columns')}">${list.map(f=>`<div class="kvItem"><small>${escapeHtml(f.name)}</small><span>${fieldValueHtml(f,e.properties?.[f.name])}</span></div>`).join('')}</div>`:'<div class="empty">Ответов пока нет.</div>'}
    case 'properties':{const p=freeProperties(subj);return p.length?kvGrid(p.map(([k,v])=>[k,escapeHtml(typeof v==='object'?JSON.stringify(v):v)]),secConf(sec,'columns')):'<div class="empty">Свободных полей нет.</div>'}
    case 'gallery':{const imgs=galleryImages(e);if(!imgs.length)return '<div class="empty">Картинок пока нет. Их можно добавить в редакторе сущности.</div>';const caps=secConf(sec,'captions');return `<div class="secGallery size-${escapeHtml(secConf(sec,'size'))} fit-${escapeHtml(secConf(sec,'fit'))}" style="--sec-cols:${secConf(sec,'columns')}">${imgs.map(m=>{const url=getMediaUrl(m.id);return `<figure class="secFigure"><button type="button" class="secImgBtn" data-gallery-open="${escapeHtml(m.id)}" title="Открыть крупно">${url?`<img src="${url}" alt="${escapeHtml(m.alt||m.name||'Картинка')}" loading="lazy">`:'<span>нет файла</span>'}</button>${caps&&(m.caption||m.name)?`<figcaption>${escapeHtml(m.caption||m.name)}${m.main?' ★':''}</figcaption>`:''}</figure>`}).join('')}</div>`}
    case 'relations':{const rs=relationsFor(subj,sec),lim=secConf(sec,'limit'),add=`<button type="button" class="btn secLinkAdd" data-link-from="${escapeHtml(e.id)}" title="Найти сущность и выбрать тип связи (или Alt + потянуть от сущности к сущности)">＋ Связать с…</button>`;if(!rs.length)return '<div class="empty">Подходящих связей нет.</div>'+add;return add+`<div class="stack">${rs.slice(0,lim).map(r=>{const other=getEntity(r.from===e.id?r.to:r.from);const rt=getRT(r.type),has=other&&containmentChildren(other.id).length>0,open=other&&state.relationTreeExpanded.has(other.id);return `<div class="relationTreeItem" data-related="${escapeHtml(other?.id||'')}" data-relation-id="${escapeHtml(r.id)}"><button type="button" class="treeToggle ${has?'':'emptyToggle'}" data-tree-toggle="${escapeHtml(other?.id||'')}" ${has?'aria-expanded="'+open+'"':'disabled'}>${has?(open?'▾':'▸'):'·'}</button><div class="listIcon" style="color:${escapeHtml(safeCssValue(rt.color,'#8fb7ff'))}">${escapeHtml(other?getET(other.type).icon:'•')}</div><div class="listMeta"><b>${escapeHtml(other?.name||'Удалено')}</b><small>${escapeHtml(relationNameFor(r,e.id))}${r.properties?.secret?' · secret':''}${has?' · '+containmentChildren(other.id).length+' внутри':''}</small></div><span class="count">${r.from===e.id?'→':'←'}</span></div>${has&&open?`<div class="nestedTree">${relationTreeRows(other.id,1)}</div>`:''}`}).join('')}${rs.length>lim?`<div class="empty">Показаны ${lim} из ${rs.length}.</div>`:''}</div>`}
    case 'contents':{const types=secConf(sec,'entTypes')||[];if(!containmentChildren(e.id).length)return '<div class="empty">Внутри пока нет объектов.</div>';const kids=containmentChildren(e.id).length;if(types.length){const list=descendantsOf(e.id).filter(x=>types.includes(x.type));return list.length?`<div class="stack">${list.slice(0,200).map(o=>entityRowHtml(o)).join('')}</div>${list.length>200?`<div class="empty">Показаны 200 из ${list.length}.</div>`:''}`:'<div class="empty">Вложенных сущностей этих типов нет.</div>'}return '<div class="subtle treeHelp">Раскрывайте вложенность на любой глубине.</div>'+relationTreeRows(e.id,0,new Set(),200)+(kids>200?`<div class="empty">Показаны 200 из ${kids}. Остальные видны на карте и в Outline.</div>`:'')}
    case 'records':{const list=recordsFor(subj,sec),lim=secConf(sec,'limit'),disp=secConf(sec,'display');if(!list.length)return '<div class="empty">По этому правилу сущностей нет.</div>';const shown=list.slice(0,lim);const more=list.length>lim?`<div class="empty">Показаны ${lim} из ${list.length}.</div>`:'';
      if(disp==='chips')return `<div class="secChips">${shown.map(o=>`<button type="button" class="tagChip secChip" data-related="${escapeHtml(o.id)}"><i>${escapeHtml(getET(o.type).icon||'•')}</i>${escapeHtml(o.name)}</button>`).join('')}</div>${more}`;
      if(disp==='cards')return `<div class="secCards">${shown.map(o=>`<button type="button" class="secCard" data-related="${escapeHtml(o.id)}"><b>${escapeHtml(getET(o.type).icon||'•')} ${escapeHtml(o.name)}</b><small>${escapeHtml(plainExcerpt(o.description,110)||(o.type?getET(o.type).name:'Без типа'))}</small>${statusChipsHtml(o)?`<span class="secRowChips">${statusChipsHtml(o)}</span>`:''}</button>`).join('')}</div>${more}`;
      return `<div class="stack">${shown.map(o=>entityRowHtml(o)).join('')}</div>${more}`}
    case 'mentions':{const m=mentionsFor(subj,sec);if(!m.inc.length&&!m.out.length)return '<div class="empty">Упоминаний нет. Напишите в тексте другой сущности [['+escapeHtml(e.name)+']] — и она появится здесь.</div>';const row=(key,via)=>{const s=mentionSourceLabel(key);if(!s)return '';return s.entity?entityRowHtml(s.entity,' · '+escapeHtml([...via].join(', '))):`<div class="relationTreeItem" data-relation-id="${escapeHtml(s.relation.id)}"><div class="listIcon">↔</div><div class="listMeta"><b>${escapeHtml(s.name)}</b><small>${escapeHtml([...via].join(', '))}</small></div></div>`};
      const LIM=100,more=n=>n>LIM?`<div class="empty">Показаны ${LIM} из ${n}. Остальные — через поиск.</div>`:'';
      return (m.inc.length?`<div class="secSub">Ссылаются на сущность</div><div class="stack">${m.inc.slice(0,LIM).map(([k,v])=>row(k,v)).join('')}</div>${more(m.inc.length)}`:'')+(m.out.length?`<div class="secSub">Сущность ссылается на</div><div class="stack">${m.out.slice(0,LIM).map(([id,v])=>{const o=getEntity(id);return o?entityRowHtml(o,' · '+escapeHtml([...v].join(', '))):''}).join('')}</div>${more(m.out.length)}`:'')}
    case 'tags':{const tags=e.tags||[];return `<div class="tagChips">${tags.length?tags.map(tg=>{const c=typeof tagColor==='function'?tagColor(tg):'';return `<button type="button" class="tagChip" data-tag-goto="${escapeHtml(tg)}" title="Все сущности с тегом «${escapeHtml(tg)}» — менеджер тегов"${c?` style="--tag-color:${escapeHtml(safeCssValue(c,'#8fb7ff'))}"`:''}>#${escapeHtml(tg)}</button>`}).join(''):'<span class="empty">Нет тегов.</span>'}</div>`}
    case 'blocks':return '';
    case 'info':{if(subj.kind==='relation'){const a=getEntity(e.from),b=getEntity(e.to),rt=getRT(e.type),st={...rt,...(e.style||{})};return kvGrid([['Откуда',escapeHtml(a?.name||'?')],['Куда',escapeHtml(b?.name||'?')],['Тип',escapeHtml(rt.name)],['Направление',rt.arrow?'→':'—'],['Толщина',escapeHtml(String(st.width||rt.width))+'px'],['Цвет',escapeHtml(st.color||rt.color||'')],['Стиль',escapeHtml(st.lineStyle||'solid')],['ID',escapeHtml(e.id)]],2)}
      return kvGrid([['ID',escapeHtml(e.id)],['Родитель',escapeHtml(getEntity(containmentParent(e.id))?.name||'—')],['Создано',escapeHtml(e.createdAt||'—')],['Изменено',escapeHtml(e.updatedAt||'—')],...(e.aliases?.length?[['Другие имена',escapeHtml(e.aliases.join(', '))]]:[]),...(e.source?[['Источник',escapeHtml(e.source)]]:[]),...(e.externalId?[['Внешний номер',escapeHtml(e.externalId)]]:[])],2)}
    case 'text':{const t=sectionText(subj,sec);return t.trim()?`<div class="${textClass(sec)}">${richTextHtml(t,{entity:subj.kind==='entity'?e:null})}</div>`:`<div class="empty">${escapeHtml(secConf(sec,'placeholder')||'Пусто.')} <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Написать</button></div>`}
    case 'list':{const rows=sectionRows(subj,sec),mode=secConf(sec,'mode'),hideDone=mode==='check'&&secConf(sec,'hideDone');const items=rows.map((r,i)=>({r,i})).filter(x=>!(hideDone&&x.r.done));if(!items.length)return `<div class="empty">${rows.length?'Всё выполнено ✓':'Пунктов пока нет.'} <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Изменить</button></div>`;
      const tag=mode==='number'?'ol':'ul';return `<${tag} class="secList m-${escapeHtml(mode)}">${items.map(({r,i})=>`<li class="${r.done?'done':''}">${mode==='check'?`<button type="button" class="secCheck" data-sec-check="${escapeHtml(id)}|${i}" role="checkbox" aria-checked="${r.done?'true':'false'}" aria-label="Отметить пункт">${r.done?'✓':''}</button>`:''}<span>${richTextHtml(r.text)||'—'}</span></li>`).join('')}</${tag}>`}
    case 'table':{const cols=tableColumns(sec),rows=sectionRows(subj,sec);if(!rows.length)return `<div class="empty">Строк пока нет. <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Заполнить</button></div>`;return `<div class="secTableWrap"><table class="secTable${secConf(sec,'striped')?' striped':''}">${secConf(sec,'header')?`<thead><tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${cols.map((c,k)=>`<td>${richTextHtml(r['c'+k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
    case 'stats':{const rows=sectionRows(subj,sec),mode=secConf(sec,'modifier');if(!rows.length)return `<div class="empty">Характеристик пока нет. <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Добавить</button></div>`;return `<div class="secStats" style="--sec-cols:${secConf(sec,'columns')}">${rows.map(r=>{const mod=modifierText(r.value,mode);return `<div class="secStat"><small>${escapeHtml(r.name||'—')}</small><b>${escapeHtml(r.value===''||r.value==null?'—':String(r.value))}</b>${mod?`<span>${escapeHtml(mod)}</span>`:''}</div>`}).join('')}</div>`}
    case 'trackers':{const rows=sectionRows(subj,sec);if(!rows.length)return `<div class="empty">Счётчиков пока нет. <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Добавить</button></div>`;const style=secConf(sec,'style'),step=secConf(sec,'step');return `<div class="secTrackers">${rows.map((r,i)=>trackerVisual(r,style,id,i,step)).join('')}</div>`}
    case 'timeline':{let rows=sectionRows(subj,sec).map((r,i)=>({...r,i}));if(!rows.length)return `<div class="empty">Событий пока нет. <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Добавить</button></div>`;const ord=secConf(sec,'order');if(ord==='asc')rows.sort((a,b)=>compareDates(a.date,b.date));if(ord==='desc')rows.sort((a,b)=>compareDates(b.date,a.date));return `<ol class="secTimeline">${rows.map(r=>`<li><b>${escapeHtml(r.date||'—')}</b><span>${richTextHtml(r.text)}</span></li>`).join('')}</ol>`}
    case 'quotes':{const rows=sectionRows(subj,sec);if(!rows.length)return `<div class="empty">Цитат пока нет. <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Добавить</button></div>`;return rows.map(r=>`<blockquote class="secQuote"><p>${richTextHtml(r.text)}</p>${r.who?`<cite>— ${richTextHtml(r.who)}</cite>`:''}</blockquote>`).join('')}
    case 'links':{const rows=sectionRows(subj,sec);if(!rows.length)return `<div class="empty">Ссылок пока нет. <button type="button" class="linkBtn" data-sec-edit="${escapeHtml(id)}">Добавить</button></div>`;return `<ul class="secLinks">${rows.map(r=>{const u=safeUrl(r.url);return `<li>${u?`<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.title||u)}</a><small>${escapeHtml(u.replace(/^https?:\/\//,'').slice(0,60))}</small>`:`<span>${escapeHtml(r.title||'—')}</span><small>${r.url?'адрес должен начинаться с https://':''}</small>`}</li>`}).join('')}</ul>`}
  }
  return '';
}
// Whether a section is drawn now (empty sections can hide; «Служебное» can be for the «Информация» mode only).
// UD: sections of Universe Graph that UD has no part for — the map (no maps), blocks and charts, «what Meh was told» (no Meh). Their data stays in the world.
const UD_NO_SECTIONS=new Set(['map','blocks','mehnotes']);
function sectionShown(subj,sec,full=state.inspectorMode==='info'){if(!SECTION_KINDS[sec.kind]||UD_NO_SECTIONS.has(sec.kind))return false;if(typeof uiIsPlayer==='function'&&uiIsPlayer()&&(subj.obj?.blockHidden?.[sec.id]==='gm'||sec.kind==='mehnotes'||sec.kind==='info'))return false; /* 0.28: the player's view */if(sec.kind==='info'&&secConf(sec,'onlyFull')&&!full)return false;return !(sec.hideEmpty&&sectionIsEmpty(subj,sec))}
function sectionHtml(subj,entry,full){
  const sec=entry.sec,k=SECTION_KINDS[sec.kind];if(!k)return '';
  if(!sectionShown(subj,sec,full))return '';
  const open=sectionIsOpen(sec,subj),count=subj.obj?.blockHidden?.[sec.id]==='hint'?'?':sectionCount(subj,sec);
  const accent=sec.color?`--sec-accent:${escapeHtml(safeCssValue(sec.color,''))};`:'';
  const hintBlock=subj.obj?.blockHidden?.[sec.id]==='hint',body=open?(hintBlock?'<div class="empty">Что-то есть, но подробностей нет.</div>':sectionBody(subj,sec,full)):'';
  const bv=subj.kind==='entity'&&typeof blockVis==='function'&&!(typeof uiIsPlayer==='function'&&uiIsPlayer())&&sec.kind!=='mehnotes'&&sec.kind!=='info'?blockVis(subj.obj,sec.id):null; /* 0.28: the eye of the block */
  return `<div class="infoFold secBlock k-${sec.kind}${open?' isOpen':''}${sec.compact?' compact':''}${sec.color?' accent':''}" data-fold-panel="${escapeHtml(sec.id)}" data-sec="${escapeHtml(sec.id)}" style="${accent}"><span class="secGrip" data-sec-grip="${escapeHtml(sec.id)}" title="Перетащите, чтобы поставить раздел в другое место" aria-hidden="true">⠿</span><button type="button" class="infoFoldHead" data-fold="${escapeHtml(sec.id)}" aria-expanded="${open}"><span><em class="secIcon" aria-hidden="true">${escapeHtml(sectionIcon(sec))}</em>${escapeHtml(sectionTitle(sec))}</span><b>${escapeHtml(String(count))}</b><i>›</i></button>${bv?`<button type="button" class="iconBtn secVisBtn" data-sec-vis="${escapeHtml(subj.id)}|${escapeHtml(sec.id)}" title="Кто видит блок: ${escapeHtml(VIS_STATES.find(s=>s[0]===bv)?.[1]||'')}. Нажмите — сменить (всем → «что-то есть» → только Мастер)" aria-label="Кто видит блок">${visEyeSvg(bv)}</button>`:''}<button type="button" class="iconBtn secMenuBtn" data-sec-menu="${escapeHtml(sec.id)}" title="Настроить раздел «${escapeHtml(sectionTitle(sec))}»" aria-label="Меню раздела">⋯</button><div class="infoFoldBody${open?' open':''}">${open?`<div class="secBody"${sec.maxHeight?` style="max-height:${sec.maxHeight}px"`:''}>${body}</div>`:''}</div></div>`;
}
function renderPageHtml(subj,{full=false}={}){
  const p=pageSections(subj);
  const sections=p.visible.map(x=>sectionHtml(subj,x,full)).join('');
  const note=subj.kind==='entity'&&subj.obj.note!==undefined?String(subj.obj.note):'';
  const noteBlock=note?`<div class="udFullNote"><b>Заметка</b><div>${richTextHtml(note)}</div></div>`:'';
  const hidden=p.hidden.length?`<details class="secHidden"><summary>Скрытые разделы: ${p.hidden.length}</summary>${p.hidden.map(x=>`<button type="button" class="tagChip" data-sec-restore="${escapeHtml(x.sec.id)}" title="Вернуть на страницу">↺ ${escapeHtml(sectionTitle(x.sec))}</button>`).join('')}</details>`:'';
  return `<div class="secPage" data-subject="${escapeHtml(subjectKey(subj))}">${noteBlock}${sections}<div class="secFooter"><button type="button" class="btn secAddBtn" data-sec-add>＋ Раздел</button>${subj.typeDef?`<button type="button" class="btn secPageBtn" data-sec-type-page title="Разделы всех сущностей типа «${escapeHtml(subj.typeName)}»">▤ Страница типа</button>`:''}</div>${hidden}</div>`;
}

// ---- Changes ----
function commitSectionChange(change,okText){
  if(worldReadOnly())return false;

  const before=clone(data),beforeState=snapshotMutationState();
  try{change()}catch(error){restoreWorkspaceMutation(before,beforeState);updateUI();toast(error?.message||'Не удалось изменить раздел','err');return false}
  normalize();takeRepairs();
  if(!persist()){restoreWorkspaceMutation(before,beforeState);updateUI();toast('Не удалось сохранить раздел — состояние восстановлено','err');return false}
  updateUI();if(okText)toast(okText,'ok');return true;
}
// Stable reference to the object after normalize() (objects are edited in place, but re-find to be safe).
function liveSubject(subj){return sectionSubject(subj.kind,subj.id)}
function ensureOwnPage(o){if(!isRecord(o.page))o.page={};return o.page}
function setSectionData(o,secId,value){if(!isRecord(o.sectionData))o.sectionData={};o.sectionData[secId]=value}
function materializeRows(subj,sec){const s=liveSubject(subj),rows=clone(sectionRows(s,sec));setSectionData(s.obj,sec.id,{...(s.obj.sectionData?.[sec.id]||{}),rows});return s.obj.sectionData[sec.id].rows}
function moveSectionInRecord(subj,secId,dir){
  // Swaps with the nearest section that is actually shown; hidden ones keep their places.
  return commitSectionChange(()=>{const s=liveSubject(subj),list=pageSections(s).visible,ids=list.map(x=>x.sec.id),i=ids.indexOf(secId);if(i<0)return;let j=i+dir;while(j>=0&&j<ids.length&&!sectionShown(s,list[j].sec))j+=dir;if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];ensureOwnPage(s.obj).order=ids});
}
function hideSectionInRecord(subj,secId,hide){
  return commitSectionChange(()=>{const s=liveSubject(subj),pg=ensureOwnPage(s.obj),set=new Set(pg.hide||[]);if(hide)set.add(secId);else set.delete(secId);pg.hide=[...set]},hide?'Раздел скрыт у этой сущности — вернуть можно внизу страницы':'Раздел снова на странице');
}
// 0.21.5: «Удалить у всех записей типа» from the ⋯ menu. Content written in records is kept as their own section (as in the type page editor).
// 0.21.5: sections are dragged with the mouse — by the ⠿ handle or by their title. The new order belongs to this record.
function setSectionOrderInRecord(subj,ids){
  return commitSectionChange(()=>{const s=liveSubject(subj),p=pageSections(s),known=new Set(ids);ensureOwnPage(s.obj).order=[...ids,...[...p.visible,...p.hidden].map(x=>x.sec.id).filter(id=>!known.has(id))]});
}
let secDrag=null,secDragEndedAt=0;
document.addEventListener('pointerdown',ev=>{
  const t=ev.target instanceof Element?ev.target:null;if(!t||ev.button!==0||worldReadOnly())return;
  const grip=t.closest('.secPage [data-sec-grip]'),head=t.closest('.secPage .infoFoldHead');if(!grip&&!head)return;
  const block=(grip||head).closest('.secBlock'),page=block?.closest('.secPage');if(!block||!page)return;
  secDrag={block,page,id:block.dataset.sec,sx:ev.clientX,sy:ev.clientY,pid:ev.pointerId,moved:false,byGrip:!!grip,at:null};
  if(grip)ev.preventDefault();
});
window.addEventListener('pointermove',ev=>{
  const d=secDrag;if(!d||ev.pointerId!==d.pid)return;
  if(!d.moved){if(Math.hypot(ev.clientX-d.sx,ev.clientY-d.sy)<6)return;d.moved=true;d.block.classList.add('secDragging');document.body.classList.add('secDraggingBody')}
  const blocks=[...d.page.querySelectorAll(':scope > .secBlock')].filter(b=>b!==d.block);
  let at=blocks.length;for(let i=0;i<blocks.length;i++){const r=blocks[i].getBoundingClientRect();if(ev.clientY<r.top+r.height/2){at=i;break}}
  d.at=at;blocks.forEach((b,i)=>{b.classList.toggle('secDropBefore',i===at);b.classList.toggle('secDropAfter',at===blocks.length&&i===blocks.length-1)});
  const host=d.page.closest('.right')||d.page.parentElement;const hr=host?.getBoundingClientRect?.();if(hr){if(ev.clientY<hr.top+30)host.scrollTop-=12;else if(ev.clientY>hr.bottom-30)host.scrollTop+=12}
});
window.addEventListener('pointerup',ev=>{
  const d=secDrag;if(!d||ev.pointerId!==d.pid)return;secDrag=null;
  d.page.querySelectorAll('.secDropBefore,.secDropAfter').forEach(b=>b.classList.remove('secDropBefore','secDropAfter'));d.block.classList.remove('secDragging');document.body.classList.remove('secDraggingBody');
  if(!d.moved||d.at==null)return;secDragEndedAt=performance.now();
  const others=[...d.page.querySelectorAll(':scope > .secBlock')].map(b=>b.dataset.sec).filter(id=>id!==d.id);others.splice(d.at,0,d.id);
  const subj=subjectFromKey(d.page.dataset.subject);if(subj)setSectionOrderInRecord(subj,others);
});
// A drag that started on a title must not also fold or unfold the section.
document.addEventListener('click',ev=>{if(performance.now()-secDragEndedAt<250&&ev.target instanceof Element&&ev.target.closest('.secPage')){ev.preventDefault();ev.stopPropagation()}},true);
function keepRemovedTypeSection(list,typeId,sec){
  let count=0;
  for(const o of list){
    if(o.type!==typeId||!o.sectionData?.[sec.id])continue;
    const own=ensureOwnPage(o);
    own.add=own.add||[];
    if(!own.add.some(x=>x.id===sec.id))own.add.push(clone(sec));
    count++;
  }
  return count;
}
function removeSectionFromType(subj,secId){
  const s=liveSubject(subj),t=s?.typeDef;if(!t)return false;const sec=typePage(t,s.kind).find(x=>x.id===secId);if(!sec)return false;
  const list=(s.kind==='relation'?data.relations:data.entities).filter(o=>o.type===t.id);
  if(!confirm(`Удалить раздел «${sectionTitle(sec)}» у всех сущностей типа «${t.name}» (${list.length})?\nСодержимое, которое в нём написано, не пропадёт: у таких сущностей раздел останется как собственный. Ctrl+Z вернёт всё.`))return false;
  return commitSectionChange(()=>{const td=findTypeDef(s.kind,t.id);if(!Array.isArray(td.page))td.page=clone(defaultPage(s.kind));const i=td.page.findIndex(x=>x.id===secId);if(i>=0)td.page.splice(i,1);
    keepRemovedTypeSection(list,t.id,sec)},`Раздел удалён у всех «${t.name}»`);
}
function deleteOwnSection(subj,secId){
  const s=liveSubject(subj),entry=findPageSection(s,secId);if(!entry?.own)return false;
  if(!sectionIsEmpty(s,entry.sec)&&!confirm(`Удалить раздел «${sectionTitle(entry.sec)}» вместе с содержимым? (Ctrl+Z вернёт)`))return false;
  return commitSectionChange(()=>{const o=liveSubject(subj).obj;o.page.add=(o.page.add||[]).filter(x=>x.id!==secId);if(o.sectionData)delete o.sectionData[secId];if(o.page.order)o.page.order=o.page.order.filter(x=>x!==secId)},'Раздел удалён');
}

// ---- Section menu (⋯) ----
let sectionMenuFor=null,sectionMenuOpenedAt=0;
function closeSectionMenu(){$('#sectionMenu')?.classList.remove('open');sectionMenuFor=null}
function openSectionMenu(subj,secId,anchor){
  const entry=findPageSection(subj,secId);if(!entry)return;
  let el=$('#sectionMenu');if(!el){el=document.createElement('div');el.id='sectionMenu';el.className='contextMenu sectionMenu';el.setAttribute('role','menu');document.body.appendChild(el)}
  const k=SECTION_KINDS[entry.sec.kind],ids=pageSections(subj).visible.filter(x=>sectionShown(subj,x.sec)).map(x=>x.sec.id),i=ids.indexOf(secId);
  sectionMenuFor={subj,secId};sectionMenuOpenedAt=performance.now();
  el.innerHTML=`${k.content?`<button type="button" data-sm="edit"><span class="cmIcon">✎</span>Изменить содержимое…</button>`:''}${entry.sec.kind==='fields'||entry.sec.kind==='properties'||entry.sec.kind==='tags'||entry.sec.kind==='gallery'?`<button type="button" data-sm="record"><span class="cmIcon">✎</span>Изменить сущность…</button>`:''}${entry.sec.kind==='blocks'?`<button type="button" data-sm="blocks"><span class="cmIcon">▦</span>Настроить блоки…</button>`:''}<button type="button" data-sm="settings"><span class="cmIcon">⚙</span>Настроить раздел…</button><div class="menuDivider"></div><button type="button" data-sm="up" ${i>0?'':'disabled'}><span class="cmIcon">↑</span>Выше</button><button type="button" data-sm="down" ${i<ids.length-1?'':'disabled'}><span class="cmIcon">↓</span>Ниже</button><div class="menuDivider"></div>${entry.own?`<button type="button" class="dangerItem" data-sm="delete"><span class="cmIcon">×</span>Удалить раздел</button>`:`<button type="button" class="dangerItem" data-sm="hide"><span class="cmIcon">×</span>Удалить у этой сущности</button>${subj.typeDef?`<button type="button" class="dangerItem" data-sm="untype"><span class="cmIcon">×</span>Удалить у всех «${escapeHtml(subj.typeName)}»</button><div class="menuDivider"></div><button type="button" data-sm="typepage"><span class="cmIcon">▤</span>Страница всех «${escapeHtml(subj.typeName)}»…</button>`:''}`}`;
  el.classList.add('open');const r=anchor.getBoundingClientRect(),w=el.offsetWidth||230,h=el.offsetHeight||240;
  el.style.left=zpx(Math.max(8,Math.min(innerWidth-zsc(w)-8,r.right-zsc(w))))+'px';el.style.top=zpx(Math.max(8,Math.min(innerHeight-zsc(h)-8,r.bottom+4)))+'px';
  el.querySelector('button:not([disabled])')?.focus();
}
function runSectionMenu(action){
  const m=sectionMenuFor;closeSectionMenu();if(!m)return;const subj=liveSubject(m.subj);if(!subj)return;
  if(action==='edit'||action==='settings')openSectionEditor({mode:'record',subj},m.secId);
  else if(action==='record'){subj.kind==='relation'?openRelationModal(subj.id):openEntityModal(subj.id)}
  else if(action==='up'||action==='down')moveSectionInRecord(subj,m.secId,action==='up'?-1:1);
  else if(action==='hide')hideSectionInRecord(subj,m.secId,true);
  else if(action==='delete')deleteOwnSection(subj,m.secId);
  else if(action==='untype')removeSectionFromType(subj,m.secId);
  else if(action==='typepage')openPageTemplateEditor(subj.kind,subj.typeDef.id);
}

// ---- Clicks inside a page ----
function currentPageSubject(target){const host=target.closest('[data-subject]');return host?subjectFromKey(host.dataset.subject):null}
document.addEventListener('click',ev=>{
  const t=ev.target instanceof Element?ev.target:null;if(!t)return;
  const sm=t.closest('#sectionMenu [data-sm]');if(sm){ev.preventDefault();ev.stopPropagation();if(!sm.disabled)runSectionMenu(sm.dataset.sm);return}
  if(!t.closest('#sectionMenu,[data-sec-menu]'))closeSectionMenu();
  const subj=t.closest('.secPage')?currentPageSubject(t):null;if(!subj)return;
  const hit=sel=>t.closest(sel);let b;
  const stop=()=>{ev.preventDefault();ev.stopPropagation()};
  if((b=hit('[data-sec-menu]'))){stop();if(sectionMenuFor?.secId===b.dataset.secMenu&&$('#sectionMenu')?.classList.contains('open'))closeSectionMenu();else openSectionMenu(subj,b.dataset.secMenu,b);return}
  if((b=hit('[data-sec-check]'))){stop();const [secId,i]=b.dataset.secCheck.split('|');const entry=findPageSection(subj,secId);if(!entry)return;commitSectionChange(()=>{const rows=materializeRows(subj,entry.sec);if(rows[+i])rows[+i].done=!rows[+i].done});return}
  if((b=hit('[data-sec-step]'))){stop();const [secId,i,d]=b.dataset.secStep.split('|');const entry=findPageSection(subj,secId);if(!entry)return;commitSectionChange(()=>{const rows=materializeRows(subj,entry.sec),r=rows[+i];if(!r)return;const max=Number(r.max),next=(Number(r.value)||0)+Number(d);r.value=Number.isFinite(max)&&r.max!==''&&r.max!=null?clamp(next,0,max):Math.max(0,next)});return}
  if((b=hit('[data-ud-description-edit]'))){stop();udOpenDescription(subj,b.closest('[data-ud-description]'));return}
  if((b=hit('[data-sec-edit]'))){stop();openSectionEditor({mode:'record',subj},b.dataset.secEdit);return}
  if(hit('[data-sec-edit-record]')){stop();subj.kind==='relation'?openRelationModal(subj.id):openEntityModal(subj.id);return}
  if((b=hit('[data-sec-restore]'))){stop();hideSectionInRecord(subj,b.dataset.secRestore,false);return}
  if(hit('[data-sec-add]')){stop();openSectionPicker({mode:'record',subj});return}
  if(hit('[data-sec-type-page]')){stop();if(subj.typeDef)openPageTemplateEditor(subj.kind,subj.typeDef.id);return}

  if((b=hit('[data-gallery-open]'))){stop();openImageViewer(subj.obj,b.dataset.galleryOpen);return}
},true);
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&$('#sectionMenu')?.classList.contains('open')){ev.stopPropagation();closeSectionMenu()}},true);
window.addEventListener('resize',closeSectionMenu);
// Scrolling closes the menu — but not the scroll that brought its button into view a moment ago.
document.addEventListener('scroll',()=>{if(performance.now()-sectionMenuOpenedAt>400)closeSectionMenu()},true);

function openImageViewer(e,mediaId){
  const imgs=galleryImages(e);let i=Math.max(0,imgs.findIndex(m=>m.id===mediaId));
  const show=()=>{const m=imgs[i],url=m?getMediaUrl(m.id):'';$('#modalTitle').textContent=`${e.name} — ${i+1} из ${imgs.length}`;$('#viewerHost').innerHTML=url?`<img src="${url}" alt="${escapeHtml(m.alt||m.name||'')}">${m.caption||m.name?`<div class="viewerCaption">${escapeHtml(m.caption||m.name)}</div>`:''}`:'<div class="empty">Файл недоступен.</div>';$('#viewerPrev').disabled=i<=0;$('#viewerNext').disabled=i>=imgs.length-1};
  openModal(e.name,`<div class="imageViewer" id="viewerHost"></div>`,`<button class="btn" id="viewerPrev">← Предыдущая</button><button class="btn" id="viewerNext">Следующая →</button><button class="btn primary" id="viewerClose">Закрыть</button>`);
  $('#viewerPrev').onclick=()=>{if(i>0){i--;show()}};$('#viewerNext').onclick=()=>{if(i<imgs.length-1){i++;show()}};$('#viewerClose').onclick=closeModal;
  activeModalCleanup=(()=>{const key=ev=>{if(ev.key==='ArrowLeft')$('#viewerPrev')?.click();if(ev.key==='ArrowRight')$('#viewerNext')?.click()};document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key)})();
  show();
}

// ---- Section picker ----
// target: {mode:'record',subj} or {mode:'template',typeKind,typeId}
function openSectionPicker(target){
  const subjKind=target.mode==='record'?target.subj.kind:target.typeKind;
  const typeDef=target.mode==='record'?target.subj.typeDef:findTypeDef(target.typeKind,target.typeId);
  const pg=target.mode==='record'?pageSections(target.subj):null;
  const present=new Set(target.mode==='record'?pg.visible.map(x=>x.sec.kind):typePage(typeDef,subjKind).map(s=>s.kind));
  // 0.21.5: a section deleted from this record (hidden) is offered back instead of «already on the page».
  const restorable=new Map(target.mode==='record'?pg.hidden.filter(x=>!present.has(x.sec.kind)).map(x=>[x.sec.kind,x.sec.id]):[]);
  const kinds=Object.entries(SECTION_KINDS).filter(([,k])=>k.subjects.includes(subjKind));
  const group=(g,title)=>`<div class="secPickGroup"><h4>${title}</h4><div class="secPickGrid">${kinds.filter(([,k])=>k.group===g).map(([id,k])=>{const taken=k.unique&&present.has(id),back=!taken&&restorable.has(id);return `<button type="button" class="secPick" data-pick-kind="${id}" ${back?`data-pick-restore="${escapeHtml(restorable.get(id))}"`:''} ${taken?'disabled':''}><span class="secPickIcon">${escapeHtml(k.icon)}</span><b>${escapeHtml(k.name)}</b><small>${taken?'уже есть на странице':back?'был удалён у этой сущности — вернуть':escapeHtml(k.hint)}</small></button>`}).join('')}</div></div>`;
  const scope=target.mode==='record'&&typeDef?`<div class="secScope"><label><input type="radio" name="secScope" value="record" checked> Только этой сущности</label><label><input type="radio" name="secScope" value="type"> Всем сущностям типа «${escapeHtml(typeDef.name)}»</label></div>`:'';
  openModal('Новый раздел',`<div class="form">${scope}${group('content','Своё содержимое — у каждой сущности своё')}${group('data','Данные сущности — собираются сами')}</div>`,`<button class="btn" id="cancelModal">Отмена</button>`);
  $('#cancelModal').onclick=()=>target.mode==='template'?openPageTemplateEditor(target.typeKind,target.typeId):closeModal();
  $$('[data-pick-kind]').forEach(b=>b.onclick=()=>{
    if(b.dataset.pickRestore){closeModal();hideSectionInRecord(target.subj,b.dataset.pickRestore,false);return}
    const kind=b.dataset.pickKind,sec={id:uid('sec'),kind,config:{}};
    const toType=target.mode==='record'&&$('input[name="secScope"]:checked')?.value==='type';
    openSectionEditor(toType?{mode:'template',typeKind:subjKind,typeId:typeDef.id,returnTo:target}:target,null,sec);
  });
}

// ---- Settings form (generic, from the kind's settings list) ----
function typeChecks(list,selected,cls){return list.length?`<div class="typeChecks">${list.map(([id,label])=>`<label><input type="checkbox" class="${cls}" value="${escapeHtml(id)}" ${selected.includes(id)?'checked':''}> ${label}</label>`).join('')}</div>`:'<div class="inlineHelp">Пока нечего выбрать.</div>'}
function settingFieldHtml(st,v){
  const attr=`data-set-key="${st.key}" data-set-type="${st.type}"`,when=st.when?` data-when='${escapeHtml(JSON.stringify(st.when))}'`:'';
  let input='';
  if(st.type==='select')input=`<select ${attr}>${st.options.map(([id,l])=>`<option value="${escapeHtml(id)}" ${String(v)===id?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select>`;
  else if(st.type==='bool')return `<label class="toggleRow secSetting"${when}><span>${escapeHtml(st.label)}</span><input type="checkbox" class="checkbox" ${attr} ${v?'checked':''}></label>`;
  else if(st.type==='number')input=`<input type="number" ${attr} min="${st.min??''}" max="${st.max??''}" value="${escapeHtml(v??'')}">`;
  else if(st.type==='text')input=`<input ${attr} value="${escapeHtml(v??'')}" maxlength="200">`;
  else if(st.type==='lines')input=`<textarea ${attr} rows="4">${escapeHtml((Array.isArray(v)?v:[]).join('\n'))}</textarea>`;
  else if(st.type==='types')input=`<div ${attr}>${typeChecks(data.entityTypes.map(t=>[t.id,escapeHtml((t.icon||'•')+' '+t.name)]),v||[],'setCheck')}</div>`;
  else if(st.type==='reltypes')input=`<div ${attr}>${typeChecks(data.relationTypes.map(t=>[t.id,escapeHtml(t.name)]),v||[],'setCheck')}</div>`;
  else if(st.type==='statuses')input=`<div ${attr}>${typeChecks(data.statusGroups.flatMap(g=>g.options.map(o=>[statusKey(g.id,o.id),escapeHtml(g.name+': '+(o.icon?o.icon+' ':'')+o.name)])),v||[],'setCheck')}</div>`;
  return `<div class="secSetting"${when}><label>${escapeHtml(st.label)}</label>${input}</div>`;
}
function readSettings(host,kind){
  const out={};for(const st of SECTION_KINDS[kind].settings){const el=host.querySelector(`[data-set-key="${st.key}"]`);if(!el)continue;
    if(st.type==='bool')out[st.key]=el.checked;else if(st.type==='lines')out[st.key]=el.value.split('\n').map(x=>x.trim()).filter(Boolean);else if(['types','reltypes','statuses'].includes(st.type))out[st.key]=[...el.querySelectorAll('.setCheck:checked')].map(x=>x.value);else if(st.type==='number')out[st.key]=el.value===''?undefined:Number(el.value);else out[st.key]=el.value}
  return out;
}
function syncSettingVisibility(host){host.querySelectorAll('[data-when]').forEach(el=>{let ok=true;try{for(const [k,v] of Object.entries(JSON.parse(el.dataset.when))){const ctl=host.querySelector(`[data-set-key="${k}"]`);if(ctl&&ctl.value!==v)ok=false}}catch{}el.hidden=!ok})}

// ---- Rows editor (generic) ----
function rowInputHtml(f,v){const a=`data-row-key="${escapeHtml(f.key)}"`;if(f.type==='bool')return `<input type="checkbox" class="checkbox" ${a} ${v?'checked':''} title="${escapeHtml(f.label)}">`;if(f.type==='number')return `<input type="number" ${a} value="${escapeHtml(v??'')}" placeholder="${escapeHtml(f.label)}">`;if(f.type==='color')return `<input type="color" class="colorInput" ${a} value="${cssRgbHex(v,'#78b8ff')}" title="${escapeHtml(f.label)}">`;return `<input ${a} value="${escapeHtml(v??'')}" placeholder="${escapeHtml(f.label)}"${f.wiki?' data-wiki':''}>`}
function rowEditorRowHtml(fields,row={}){return `<div class="secRowEdit" style="--row-cols:${fields.map(f=>f.type==='bool'?'auto':f.type==='color'?'44px':f.type==='number'?'minmax(60px,.6fr)':'minmax(0,1.6fr)').join(' ')} auto">${fields.map(f=>rowInputHtml(f,row[f.key])).join('')}<span class="secRowBtns"><button type="button" class="iconBtn" data-row-up title="Выше">↑</button><button type="button" class="iconBtn" data-row-down title="Ниже">↓</button><button type="button" class="iconBtn" data-row-del title="Удалить строку">×</button></span></div>`}
function rowsEditorHtml(fields,rows){return `<div class="secRowsHead" style="--row-cols:${fields.map(f=>f.type==='bool'?'auto':f.type==='color'?'44px':f.type==='number'?'minmax(60px,.6fr)':'minmax(0,1.6fr)').join(' ')} auto">${fields.map(f=>`<small>${escapeHtml(f.label)}</small>`).join('')}<small></small></div><div class="secRows" id="secRows">${rows.map(r=>rowEditorRowHtml(fields,r)).join('')}</div><button type="button" class="btn" id="secAddRow">＋ Строка</button>`}
function bindRowsEditor(fields){
  const host=$('#secRows');if(!host)return;
  host.addEventListener('click',ev=>{const row=ev.target.closest('.secRowEdit');if(!row)return;if(ev.target.closest('[data-row-del]'))row.remove();else if(ev.target.closest('[data-row-up]')&&row.previousElementSibling)row.parentNode.insertBefore(row,row.previousElementSibling);else if(ev.target.closest('[data-row-down]')&&row.nextElementSibling)row.parentNode.insertBefore(row.nextElementSibling,row)});
  $('#secAddRow').onclick=()=>{if(host.children.length>=SECTION_MAX_ROWS){toast(`Не больше ${SECTION_MAX_ROWS} строк`,'err');return}host.insertAdjacentHTML('beforeend',rowEditorRowHtml(fields));host.lastElementChild.querySelector('input:not([type=checkbox])')?.focus()};
}
function readRowsEditor(fields){
  return $$('#secRows .secRowEdit').map(row=>{const o={};for(const f of fields){const el=row.querySelector(`[data-row-key="${CSS.escape(f.key)}"]`);if(!el)continue;if(f.type==='bool')o[f.key]=el.checked;else if(f.type==='number'){o[f.key]=el.value===''?'':Number(el.value)}else if(f.type==='color')o[f.key]=el.value;else o[f.key]=el.value.trim()}return o})
    .filter(o=>fields.some(f=>f.type!=='bool'&&f.type!=='color'&&o[f.key]!==''&&o[f.key]!=null));
}

// ---- Section editor ----
// target.mode 'record': content goes to the record; settings go to the record's own section or to its type's template.
// target.mode 'template': settings of a type's section (no content).
function openSectionEditor(target,secId,newSec=null){
  let subj=target.mode==='record'?liveSubject(target.subj):null;
  const typeDef=target.mode==='template'?findTypeDef(target.typeKind,target.typeId):subj?.typeDef;
  const entry=newSec?{sec:newSec,own:target.mode==='record'}:subj?findPageSection(subj,secId):{sec:typePage(typeDef,target.typeKind).find(s=>s.id===secId),own:false};
  if(!entry?.sec)return;const sec=clone(entry.sec),k=SECTION_KINDS[sec.kind];
  const shared=!entry.own&&!!typeDef,locked=target.mode==='record'&&!entry.own&&!typeDef;
  const contentHtml=target.mode==='record'&&k.content?(k.content==='text'?`<textarea id="secText" rows="10" data-wiki placeholder="${escapeHtml(secConf(sec,'placeholder')||'Текст. [[Имя сущности]] — ссылка, **жирный**, *курсив*.')}">${escapeHtml(sectionText(subj,sec))}</textarea><div class="inlineHelp">Начните печатать [[ — появится подсказка имён.</div>`:`<div id="secRowsHost">${rowsEditorHtml(rowFieldsFor(sec),clone(sectionRows(subj,sec)))}</div>`):'';
  const common=`<div class="customizerGrid secCommon"><div><label>Название</label><input id="secTitle" value="${escapeHtml(sec.title||'')}" placeholder="${escapeHtml(k.name)}" maxlength="80"></div><div><label>Значок</label><input id="secIcon" value="${escapeHtml(sec.icon||'')}" placeholder="${escapeHtml(k.icon)}" maxlength="4"></div><div><label>Цвет полоски</label><div class="secColorRow"><input id="secColorOn" type="checkbox" class="checkbox" ${sec.color?'checked':''} title="Свой цвет"><input id="secColor" type="color" class="colorInput" value="${cssRgbHex(sec.color,'#78b8ff')}"></div></div><div><label>Высота (прокрутка внутри)</label><select id="secMaxH">${[[0,'без ограничения'],[160,'160 px'],[240,'240 px'],[360,'360 px'],[520,'520 px']].map(([v,l])=>`<option value="${v}" ${Number(sec.maxHeight||0)===v?'selected':''}>${l}</option>`).join('')}</select></div></div><label class="toggleRow"><span>Открыт при первом показе</span><input id="secOpen" type="checkbox" class="checkbox" ${sec.open?'checked':''}></label><label class="toggleRow"><span>Прятать, когда пусто</span><input id="secHideEmpty" type="checkbox" class="checkbox" ${sec.hideEmpty?'checked':''}></label><label class="toggleRow"><span>Компактный</span><input id="secCompact" type="checkbox" class="checkbox" ${sec.compact?'checked':''}></label>`;
  const lockedNote=locked?'<div class="inlineHelp">У сущности без типа разделы по умолчанию не настраиваются — здесь меняется только содержимое. Свой раздел можно добавить кнопкой «＋ Раздел».</div>':'';
  const kindSettings=k.settings.length?`<div class="secKindSettings">${k.settings.map(st=>settingFieldHtml(st,secConf(sec,st.key))).join('')}</div>`:'';
  const where=target.mode==='template'?`Раздел страницы всех сущностей типа «${escapeHtml(typeDef?.name||'')}».`:shared?`Настройки — общие для всех сущностей типа «${escapeHtml(typeDef.name)}». ${k.content?'Содержимое — только этой сущности.':''}`:'Раздел только этой сущности.';
  openModal(newSec?`Новый раздел: ${k.name}`:`Раздел «${sectionTitle(sec)}»`,`<div class="form secEditor"><div class="inlineHelp secWhere">${k.icon} ${escapeHtml(k.hint)}. ${where}</div>${contentHtml?`<div class="customizerSection"><h4>Содержимое</h4>${contentHtml}</div>`:''}${locked?lockedNote:`<div class="customizerSection"><h4>Настройки раздела</h4>${common}${kindSettings}</div>`}</div>`,`<button class="btn" id="cancelModal">${target.mode==='template'?'← Назад':'Отмена'}</button><button class="btn primary" id="saveSection">${newSec?'Добавить раздел':'Сохранить'}</button>`);
  const back=()=>{if(target.mode==='template')openPageTemplateEditor(target.typeKind,target.typeId);else if(target.returnTo)closeModal();else closeModal()};
  $('#cancelModal').onclick=()=>{if(target.returnTo){openSectionPicker(target.returnTo);return}back()};
  if(k.content==='rows'&&target.mode==='record')bindRowsEditor(rowFieldsFor(sec));
  const host=$('.secEditor');if(!locked){syncSettingVisibility(host)};host.addEventListener('change',()=>syncSettingVisibility(host));
  $('#saveSection').onclick=()=>{
    const next=locked?sec:{...sec,title:$('#secTitle').value.trim(),icon:$('#secIcon').value.trim(),color:$('#secColorOn').checked?$('#secColor').value:'',open:$('#secOpen').checked,hideEmpty:$('#secHideEmpty').checked,compact:$('#secCompact').checked,maxHeight:Number($('#secMaxH').value)||0,config:{...sec.config,...readSettings(host,sec.kind)}};
    if(!locked)normalizeSectionDef(next);
    let content=null;
    if(target.mode==='record'&&k.content==='text')content={text:$('#secText').value};
    else if(target.mode==='record'&&k.content==='rows'){const rows=readRowsEditor(rowFieldsFor(next));content={rows}}
    const ok=commitSectionChange(()=>{
      if(target.mode==='template'){const t=findTypeDef(target.typeKind,target.typeId);const page=clone(typePage(t,target.typeKind));const i=page.findIndex(s=>s.id===next.id);if(i<0)page.push(next);else page[i]=next;t.page=page;return}
      const s=liveSubject(target.subj),o=s.obj;
      if(entry.own){const pg=ensureOwnPage(o);pg.add=pg.add||[];const i=pg.add.findIndex(x=>x.id===next.id);if(i<0)pg.add.push(next);else pg.add[i]=next}
      else if(!locked){const t=s.typeDef;const page=clone(typePage(t,s.kind));const i=page.findIndex(x=>x.id===next.id);if(i<0)page.push(next);else page[i]=next;t.page=page}
      if(content){const prev=isRecord(o.sectionData?.[next.id])?o.sectionData[next.id]:{};setSectionData(o,next.id,{...prev,...content})}
    },newSec?'Раздел добавлен':'Раздел сохранён');
    if(!ok)return;
    // A new section opens right away, so the person sees what was added.
    if(newSec){setFoldOpen(target.subj,next.id,true);updateUIPrefsInspectorFolds();}
    if(target.mode==='template'&&!target.returnTo){openPageTemplateEditor(target.typeKind,target.typeId);return}
    closeModal();updateUI();
  };
  setTimeout(()=>($('#secText')||$('#secRows input:not([type=checkbox])')||$('#secTitle'))?.focus(),30);
}

// ---- Page of a type (Правила → тип → «Страница») ----
function openPageTemplateEditor(typeKind,typeId){
  const t=findTypeDef(typeKind,typeId);if(!t){toast('Тип не найден','err');return}
  const page=typePage(t,typeKind),custom=Array.isArray(t.page);
  const rows=page.map((s,i)=>{const k=SECTION_KINDS[s.kind];return `<div class="listItem secTplRow"><div class="listIcon">${escapeHtml(sectionIcon(s))}</div><div class="listMeta"><b>${escapeHtml(sectionTitle(s))}</b><small>${[s.title&&s.title!==k?.name?k?.name:'',s.open?'открыт':'',s.hideEmpty?'прячется пустым':''].filter(Boolean).map(escapeHtml).join(' · ')}</small></div><button type="button" class="iconBtn" data-tpl-up="${i}" ${i?'':'disabled'} title="Выше">↑</button><button type="button" class="iconBtn" data-tpl-down="${i}" ${i<page.length-1?'':'disabled'} title="Ниже">↓</button><button type="button" class="iconBtn" data-tpl-edit="${escapeHtml(s.id)}" title="Настроить">✎</button><button type="button" class="iconBtn" data-tpl-del="${escapeHtml(s.id)}" title="Убрать со страницы">×</button></div>`}).join('');
  const n=(typeKind==='relation'?data.relations:data.entities).filter(o=>o.type===typeId).length;
  openModal(`Страница: ${t.name}`,`<div class="form"><div class="rulesIntro">Разделы страницы у всех ${typeKind==='relation'?'связей':'сущностей'} типа «${escapeHtml(t.name)}» (сейчас их ${n}). Каждая сущность может скрыть раздел у себя или добавить свои. ${custom?'':'<b>Сейчас — страница по умолчанию.</b>'}</div><div class="stack typeList">${rows||'<div class="empty">На странице нет разделов — будет видна только шапка.</div>'}</div><div class="buttonGrid" style="margin-top:9px"><button type="button" class="btn primary" id="tplAdd">＋ Раздел</button>${custom?'<button type="button" class="btn" id="tplReset">↺ Страница по умолчанию</button>':''}</div></div>`,`<button class="btn" id="tplBack">← К правилам</button><button class="btn primary" id="tplDone">Готово</button>`);
  const change=(fn,ok)=>{if(commitSectionChange(()=>{const live=findTypeDef(typeKind,typeId);const pg=clone(typePage(live,typeKind));fn(pg,live);live.page=pg},ok))openPageTemplateEditor(typeKind,typeId)};
  $$('[data-tpl-up]').forEach(b=>b.onclick=()=>change(pg=>{const i=+b.dataset.tplUp;[pg[i-1],pg[i]]=[pg[i],pg[i-1]]}));
  $$('[data-tpl-down]').forEach(b=>b.onclick=()=>change(pg=>{const i=+b.dataset.tplDown;[pg[i+1],pg[i]]=[pg[i],pg[i+1]]}));
  $$('[data-tpl-edit]').forEach(b=>b.onclick=()=>openSectionEditor({mode:'template',typeKind,typeId},b.dataset.tplEdit));
  $$('[data-tpl-del]').forEach(b=>b.onclick=()=>{
    const secId=b.dataset.tplDel,sec=page.find(s=>s.id===secId);
    // Content in records is never thrown away: those records keep it as their own section.
    const holders=(typeKind==='relation'?data.relations:data.entities).filter(o=>o.type===typeId&&o.sectionData?.[secId]);
    change((pg)=>{const i=pg.findIndex(s=>s.id===secId);if(i>=0)pg.splice(i,1);keepRemovedTypeSection(typeKind==='relation'?data.relations:data.entities,typeId,sec)},holders.length?`Раздел убран со страницы типа. У ${holders.length} сущностей было содержимое — у них он остался как собственный`:'Раздел убран со страницы типа');
  });
  $('#tplAdd').onclick=()=>openSectionPicker({mode:'template',typeKind,typeId});
  if($('#tplReset'))$('#tplReset').onclick=()=>{if(!confirm('Вернуть страницу по умолчанию? Свои разделы типа пропадут со страниц (содержимое сущностей останется в данных, Ctrl+Z вернёт всё).'))return;if(commitSectionChange(()=>{delete findTypeDef(typeKind,typeId).page},'Страница по умолчанию'))openPageTemplateEditor(typeKind,typeId)};
  $('#tplBack').onclick=()=>openRulesModal(typeKind==='relation'?'relations':'types');
  $('#tplDone').onclick=closeModal;
}
