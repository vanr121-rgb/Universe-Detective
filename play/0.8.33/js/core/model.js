// Universe Graph — Модель данных: ключи хранилища, демо-мир, текущий мир (data) и состояние интерфейса (state).
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён (раньше это было одно замыкание в index.html).
'use strict';
const STORAGE='universe-graph-v5';
const LEGACY_STORAGES=['universe-graph-v4','universe-graph-v3','universe-graph-v2'];

// The tutorial world (0.17): an example campaign on the «Средневековое фэнтези» preset.
// Since 0.17 every workspace carries its own rule set (types, relations, statuses, fields).
// 0.21.5: the example article of the tutorial world — how an article looks and links to records.
function exampleUniverseArticle(){const now=new Date().toISOString();return {id:'art-universe',title:'Вселенная',icon:'🌌',body:'**Вселенная** — мир, в котором живут все сущности этого примера. Это статья-пример: её можно читать справа, окошком или на весь экран, изменить кнопкой ✎ или удалить, если она не нужна.\n\n**Части света**\nНа севере лежит холодная [[Империя Севера]]. Южнее — [[Аквитания]], край рек и древней культуры; с ней торгуют и Империя, и [[Испания]]. Великую Западную равнину держит [[Королевство Франков]], а к югу от него кочуют зверолюди — [[Земли Хищников]].\n\n**Эпоха**\nНынешние границы провела [[Война Пяти Королей]]. Она задела почти все державы, и её отголоски до сих пор слышны в спорах о земле и торговле.\n\n**Города**\n[[Аркен]] — город-крепость на торговых путях Империи, родина [[Дом Аркен|дома Аркен]]. [[Флумина]] — город у моря, где сходятся реки; там работает [[Гильдия кузнецов Флумины]].\n\n**Тайны**\nВ старых хрониках всё чаще звучит имя [[Астэр, Пожиратель Звёзд|Астэра, Пожирателя Звёзд]]. Ему служит [[Орден Чёрного Солнца]], а [[Тайна Короны]] связывает убийство короля, культ и [[Меч Эха]].\n\n**С чего начать**\n— откройте [[Аркен]] и посмотрите его страницу справа;\n— нажмите «🗺 Карта» или «📖 Статья» рядом с названием любой сущности;\n— спросите Меха: «кто живёт в Аркене?»',parentId:null,links:[{kind:'entity',id:'e-world'}],collect:{entTypes:[],statuses:[],tags:[]},tags:['пример'],order:0,createdAt:now,updatedAt:now}}
// 0.29: the world file format number — one place. Import refuses only files from a NEWER format (it compared with 5 since 0.17,
// so the program refused its own exported files).
const WORLD_SCHEMA_VERSION=6;
function buildTutorialWorld(){
  const rules=presetRules('medieval');
  return {
    version:WORLD_SCHEMA_VERSION,
    metadata:{name:'living-world-demo',app:'Universe Graph',updatedAt:new Date().toISOString()},
    workspaces:[{
      id:'ws-main',name:'Пример: Хроники Пяти Королей',favorite:true,rootId:'e-world',rulesPreset:rules.rulesPreset,articles:[exampleUniverseArticle()],exampleArticle:true,
      entityTypes:rules.entityTypes,relationTypes:rules.relationTypes,statusGroups:rules.statusGroups,
      view:{zoom:1,panX:0,panY:0,scopeId:'e-world',visualStyle:'classic'},positions:{},
      entities:[
    {id:'e-world',name:'Вселенная',type:'type-world',description:'Корневое пространство. Здесь показываются только сущности верхнего слоя.',properties:{Жанр:'Тёмное фэнтези'},style:{color:'#8fb7ff',size:54,x:0,y:0,pinned:true,space:true}},
    {id:'e-north',name:'Империя Севера',type:'type-country',description:'Холодная держава, пережившая Войну Пяти Королей.',properties:{Столица:'e-arken',Население:'4.2 млн'},status:{'sg-explore':'explored'},style:{x:-340,y:-130,pinned:false,space:true}},
    {id:'e-aquitania',name:'Аквитания',type:'type-country',description:'Старая страна южных рек и древней культуры.',properties:{Столица:'e-flumina',Наследие:'Римское'},status:{'sg-explore':'rumors'},style:{x:0,y:-170,pinned:false,space:true}},
    {id:'e-hispania',name:'Испания',type:'type-country',description:'Конфедеративная монархия юго-запада.',properties:{Столица:'Сан-Реальмо',Религия:'Unified Christianity'},style:{x:340,y:-120,pinned:false,space:true}},
    {id:'e-franks',name:'Королевство Франков',type:'type-country',description:'Северная держава Великой Западной равнины.',properties:{Регион:'Great Western Plain'},style:{x:-150,y:180,pinned:false,space:true}},
    {id:'e-predator',name:'Земли Хищников',type:'type-place',description:'Степной союз зверолюдей к югу от Франков.',properties:{Ландшафт:'Степь / саванна'},status:{'sg-explore':'unknown'},style:{x:190,y:180,pinned:false,space:true}},

    {id:'e-arken',sectionData:{'ct-hooks':{rows:[{text:'Гарнизон [[Маркус Аркен|Маркуса]] получает жалованье чужой монетой'},{text:'В порту пропал груз железа из [[Флумина|Флумины]]'}]},'ct-history':{rows:[{date:'1004',text:'Основан как пограничная крепость'},{date:'1119',text:'Выдержал осаду в [[Война Пяти Королей|Войне Пяти Королей]]'}]}},name:'Аркен',type:'type-city',description:'Северный город-крепость на пересечении торговых путей.',properties:{Население:140000,Опасность:'Высокая'},status:{'sg-explore':'explored'},style:{x:-120,y:0,space:true}},
    {id:'e-house',name:'Дом Аркен',type:'type-family',description:'Старая семья военных советников.',properties:{Девиз:'Наша сталь не дрогнет'},style:{x:100,y:-10,space:true}},
    {id:'e-marcus',sectionData:{'pc-stats':{rows:[{name:'СИЛ',value:16},{name:'ЛОВ',value:12},{name:'ТЕЛ',value:15},{name:'ИНТ',value:11},{name:'МДР',value:12},{name:'ХАР',value:10}]},'pc-vitals':{rows:[{name:'ХП',value:18,max:22}]}},name:'Маркус Аркен',type:'type-character',description:'Командир пограничного гарнизона.',properties:{Раса:'Человек',Возраст:34,Роль:'Командир'},status:{'sg-life':'alive','sg-marks':['cursed'],'sg-attitude':'friendly'},style:{x:320,y:40,space:true}},
    {id:'e-elise',sectionData:{'pc-stats':{rows:[{name:'СИЛ',value:10},{name:'ЛОВ',value:14},{name:'ТЕЛ',value:12},{name:'ИНТ',value:15},{name:'МДР',value:13},{name:'ХАР',value:17}]},'pc-vitals':{rows:[{name:'ХП',value:9,max:12},{name:'Влияние при дворе',value:3,max:5,color:'#8d78ff'}]},'pc-bio':{rows:[{date:'1112',text:'Родилась в [[Аркен|Аркене]]'},{date:'1130',text:'Посольство во [[Флумина|Флумину]]: заключён торговый мир'},{date:'1134',text:'Узнала о [[Тайна Короны|тайне короны]]'}]},'pc-secrets':{text:'Знает, что [[Маркус Аркен]] прячет письмо из [[Храм Безлунья|Храма Безлунья]]. Подозревает **[[Орден Чёрного Солнца]]**.'}},name:'Элиза Аркен',type:'type-character',description:'Наследница [[Дом Аркен|дома]] и дипломат.',properties:{Раса:'Человек',Возраст:29,Роль:'Дипломат'},status:{'sg-life':'alive','sg-attitude':'neutral'},style:{x:290,y:170,space:true}},

    {id:'e-flumina',name:'Флумина',type:'type-city',description:'Город у моря, где сходятся многие реки.',properties:{Население:60000,Опасность:'Средняя'},style:{x:-30,y:10,space:true}},
    {id:'e-maran',name:'Дом Маран',type:'type-family',description:'Династия мастеров металла и чеканки.',properties:{Девиз:'Металл помнит руку'},style:{x:160,y:-120,space:true}},
    {id:'e-guild',name:'Гильдия кузнецов Флумины',type:'type-org',description:'Сеть городских кузниц и литейных мастерских.',properties:{Цель:'Монополия на металл'},style:{x:170,y:70,space:true}},
    {id:'e-temple',name:'Храм Безлунья',type:'type-place',description:'Разрушенный храм старой веры.',properties:{Ландшафт:'Руины на холме'},status:{'sg-explore':'unknown'},style:{x:-180,y:150,space:true}},
    {id:'e-god',sectionData:{'gd-sayings':{rows:[{text:'Звёзды гаснут не от ветра.',who:'надпись в [[Храм Безлунья|Храме Безлунья]]'}]}},name:'Астэр, Пожиратель Звёзд',type:'type-god',description:'Забытый бог, чьё имя возвращается в старых хрониках.',properties:{Сфера:'Ночь'},status:{'sg-life':'missing'},style:{x:440,y:170,space:true}},
    {id:'e-sword',sectionData:{'it-stats':{rows:[{name:'Урон',value:9},{name:'Броня',value:0},{name:'Вес',value:3},{name:'Цена',value:2000}]},'it-history':{text:'Выкован для клятвы пяти королей. Звенит, когда рядом нарушают слово.'}},name:'Меч Эха',type:'type-artifact',description:'Артефакт, реагирующий на древние клятвы.',properties:{Свойства:'Отзывается на древние клятвы. Природа проклятия неизвестна.'},status:{'sg-owner':'lost','sg-marks':['cursed']},style:{x:420,y:-120,space:true}},
    {id:'e-war',sectionData:{'ev-course':{rows:[{date:'1117',text:'Смерть старого короля'},{date:'1118',text:'Пять претендентов поднимают знамёна'},{date:'1121',text:'Мир заключён во [[Флумина|Флумине]]'}]}},name:'Война Пяти Королей',type:'type-event',description:'Конфликт, изменивший границы континента.',properties:{Начало:'1024',Окончание:'1029'},style:{x:-430,y:90,space:true}},
    {id:'e-mystery',sectionData:{'qs-steps':{rows:[{text:'Расспросить [[Бруно Мельник|Бруно]] у северных ворот',done:true},{text:'Найти вход в [[Храм Безлунья]]',done:false},{text:'Узнать, кто владеет [[Меч Эха|Мечом Эха]]',done:false}]},'qs-reward':{text:'500 золотых и благосклонность [[Дом Аркен|Дома Аркен]].'}},name:'Тайна Короны',type:'type-quest',description:'Нить, связывающая убийство короля, культ и [[Меч Эха]].',properties:{Приоритет:'Критический',Награда:'Корона Севера',Заказчик:'e-elise'},status:{'sg-quest':'given'},style:{x:530,y:20,space:true}},
    {id:'e-order',name:'Орден Чёрного Солнца',type:'type-org',description:'Тайная военная религиозная организация.',properties:{Численность:700,Цель:'Вернуть Астэра'},status:{'sg-attitude':'hostile','sg-marks':['secret']},style:{x:500,y:230,space:true}}
,
        {id:'e-bruno',sectionData:{'mr-goods':{rows:[{c0:'Зерно, мешок',c1:'2 серебра',c2:'много'},{c0:'Соль',c1:'5 серебра',c2:'мало'},{c0:'Слух об [[Орден Чёрного Солнца|Ордене]]',c1:'1 золотой',c2:'один'}]},'mr-rumors':{rows:[{text:'Ночью у [[Храм Безлунья|старого храма]] видели огни'}]}},name:'Бруно Мельник',type:'type-merchant',description:'Торговец зерном и слухами у северных ворот Аркена.',properties:{Товары:'Зерно, верёвки, фонари',Цены:'Средне',Лавка:'e-arken'},status:{'sg-life':'alive','sg-attitude':'friendly'},style:{x:-60,y:150,space:false}}
      ],
      relations:[
    {id:'r01',from:'e-world',to:'e-north',type:'rel-contains',properties:{},style:{}},
    {id:'r02',from:'e-world',to:'e-aquitania',type:'rel-contains',properties:{},style:{}},
    {id:'r03',from:'e-world',to:'e-hispania',type:'rel-contains',properties:{},style:{}},
    {id:'r04',from:'e-world',to:'e-franks',type:'rel-contains',properties:{},style:{}},
    {id:'r05',from:'e-world',to:'e-predator',type:'rel-contains',properties:{},style:{}},
    {id:'r06',from:'e-world',to:'e-war',type:'rel-in',properties:{},style:{opacity:.45}},
    {id:'r07',from:'e-north',to:'e-arken',type:'rel-contains',properties:{},style:{}},
    {id:'r08',from:'e-arken',to:'e-house',type:'rel-contains',properties:{},style:{}},
    {id:'r09',from:'e-house',to:'e-marcus',type:'rel-contains',properties:{},style:{}},
    {id:'r10',from:'e-house',to:'e-elise',type:'rel-contains',properties:{},style:{}},
    {id:'r11',from:'e-marcus',to:'e-elise',type:'rel-family',properties:{kind:'Siblings'},style:{}},
    {id:'r12',from:'e-order',to:'e-marcus',type:'rel-enemy',properties:{reason:'Предательство'},style:{}},
    {id:'r13',from:'e-marcus',to:'e-sword',type:'rel-created',properties:{secret:true,reason:'Старая клятва'},style:{color:'#8b5cf6',width:5}},
    {id:'r14',from:'e-sword',to:'e-mystery',type:'rel-cause',properties:{},style:{}},
    {id:'r15',from:'e-mystery',to:'e-order',type:'rel-enemy',properties:{},style:{width:5}},
    {id:'r16',from:'e-aquitania',to:'e-flumina',type:'rel-contains',properties:{},style:{}},
    {id:'r17',from:'e-flumina',to:'e-maran',type:'rel-contains',properties:{},style:{}},
    {id:'r18',from:'e-flumina',to:'e-guild',type:'rel-contains',properties:{},style:{}},
    {id:'r19',from:'e-flumina',to:'e-temple',type:'rel-contains',properties:{},style:{}},
    {id:'r20',from:'e-maran',to:'e-sword',type:'rel-created',properties:{},style:{}},
    {id:'r21',from:'e-temple',to:'e-god',type:'rel-in',properties:{secret:true},style:{}},
    {id:'r22',from:'e-flumina',to:'e-god',type:'rel-in',properties:{secret:true},style:{color:'#a855f7',width:4}},
    {id:'r23',from:'e-north',to:'e-aquitania',type:'rel-trade',properties:{since:1001},style:{}},
    {id:'r24',from:'e-hispania',to:'e-aquitania',type:'rel-trade',properties:{since:998},style:{}},
    {id:'r25',from:'e-franks',to:'e-predator',type:'rel-enemy',properties:{},style:{}},
    {id:'r26',from:'e-war',to:'e-north',type:'rel-cause',properties:{},style:{}},
    {id:'r27',from:'e-war',to:'e-aquitania',type:'rel-cause',properties:{},style:{}},
    {id:'r28',from:'e-war',to:'e-franks',type:'rel-cause',properties:{},style:{}},
    {id:'r29',from:'e-war',to:'e-predator',type:'rel-cause',properties:{},style:{}},
    {id:'r30',from:'e-order',to:'e-god',type:'rel-member',properties:{secret:true},style:{color:'#7b2cff',width:5}}
,
        {id:'r31',from:'e-arken',to:'e-bruno',type:'rel-contains',properties:{},style:{}},
        {id:'r32',from:'e-elise',to:'e-mystery',type:'rel-quest',properties:{},style:{}},
        {id:'r33',from:'e-bruno',to:'e-guild',type:'rel-trade',properties:{},style:{}}
      ]
    }],
    views:[]
  };
}
const DEMO=buildTutorialWorld();

let data=clone(DEMO);
let loadedSavedWorld=false;
const state={
  mode:'explore',enterOnClick:false,scopeId:'e-world',selectedId:null,selectedRelationId:null,traceStart:null,traceEnd:null,focusedPath:[],viewVersion:0,
  zoom:1,panX:0,panY:0,dragNode:null,panning:false,dragMoved:false,dropTargetId:null,dragStartX:0,dragStartY:0,dragOriginX:0,dragOriginY:0,lastX:0,lastY:0,hoverId:null,hoverRelationId:null,space:false,
  showExternal:false,showHidden:false,viewAs:'gm',showRelations:true,isolate:false,search:'',focusRadius:2,hideFar:false,filtersEntities:new Set(),filtersRelations:new Set(),hiddenTiers:new Set(),filtersStatuses:new Set(),history:['e-world'],historyIndex:0,relationTreeExpanded:new Set(),relationFolds:new Set(['contents','relations','tags','widgets']),panelWidths:{left:300,right:360},
  selectedIds:new Set(),selectionBox:null,workspaceId:null,workspaceRecent:[],spaceFavorites:new Set(),inspectorMode:'overview',lastInspectorMode:'overview',visualMode:'detective',foldsClosed:new Set(),boardZoom:1,boardPanX:0,boardPanY:0,boardRed:false,boardTypeColors:false,boardContain:true,stripClosed:new Set(),boardDrag:null,boardLastTap:null,visualStyle:'classic',outlineExpanded:new Set(),outlineCollapsedRoots:new Set(),outlineZoom:1,treeExpanded:new Set(),treeRootCollapsed:false,treeZoom:1,treeDrag:null,treeDropTargetId:null,treeDropIntent:null,outlineDrag:null,outlineDropTargetId:null,outlineDropIntent:null,galaxyExpanded:new Set(),galaxyRootCollapsed:false,galaxyLayoutVersion:0,galaxyZoom:1,galaxyPanX:0,galaxyPanY:0,galaxyOrbit:{},galaxyOrbitOpacity:.62,galaxyDrag:null,galaxyLastTap:null,galaxyDropTargetId:null
};
