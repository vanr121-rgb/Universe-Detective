// Universe Graph — пресеты наборов правил (0.17): готовые типы, связи, статусы и поля.
// Набор правил живёт в каждом рабочем пространстве отдельно; пресет — только стартовая точка,
// всё в нём можно переименовать, удалить или сбросить до нуля.
// Модуль загружается обычным <script> в порядке, заданном в index.html; все модули
// делят одно глобальное пространство имён.
'use strict';

// Status effects: how a status changes the node on the map.
const STATUS_EFFECTS=[
  ['none','Нет'],
  ['fade','Полупрозрачный'],
  ['gray','Серый'],
  ['glow','Свечение цветом статуса'],
  ['tint','Покрас карточки']
];
// Field kinds of a type's questionnaire («анкета»).
const FIELD_KINDS=[
  ['text','Строка'],
  ['longtext','Текст'],
  ['number','Число'],
  ['choice','Выбор из списка'],
  ['ref','Ссылка на сущность'],
  ['bool','Да / нет']
];

// The one built-in idea that every rule set keeps: nesting («Содержит»). Its name and look are editable.
function containmentTypeTemplate(){return {id:'rel-contains',name:'Содержит',color:'#8fb7ff',width:2,arrow:true,lineStyle:'solid',animated:false,containment:true}}

const RULE_PRESETS={
  medieval:{
    id:'medieval',name:'Средневековое фэнтези',skin:'medieval',
    description:'Королевства, города, персонажи, торговцы, фракции, артефакты и квесты. Статусы жизни, квестов, исследования и владения.',
    entityTypes:[
      {id:'type-world',name:'Мир',color:'#8fb7ff',size:54,shape:'circle',icon:'✦'},
      {id:'type-country',name:'Государство',color:'#ffd15c',size:46,shape:'hex',icon:'◆',fields:[
        {id:'f-capital',name:'Столица',kind:'ref',refType:'type-city'},
        {id:'f-ruler',name:'Правитель',kind:'ref',refType:'type-character'},
        {id:'f-population',name:'Население',kind:'text'}]},
      {id:'type-city',name:'Город',color:'#a78bfa',size:38,shape:'diamond',icon:'⌂',fields:[
        {id:'f-population',name:'Население',kind:'number'},
        {id:'f-danger',name:'Опасность',kind:'choice',options:['Низкая','Средняя','Высокая']}]},
      {id:'type-place',name:'Место',color:'#76e57f',size:33,shape:'circle',icon:'⌖',fields:[
        {id:'f-landscape',name:'Ландшафт',kind:'text'}]},
      {id:'type-character',name:'Персонаж',color:'#63c8ff',size:34,shape:'circle',icon:'●',fields:[
        {id:'f-race',name:'Раса',kind:'text'},
        {id:'f-role',name:'Роль',kind:'text'},
        {id:'f-age',name:'Возраст',kind:'number'}]},
      {id:'type-merchant',name:'Торговец',color:'#f0b45a',size:34,shape:'circle',icon:'⚖',fields:[
        {id:'f-goods',name:'Товары',kind:'longtext'},
        {id:'f-prices',name:'Цены',kind:'choice',options:['Дёшево','Средне','Дорого']},
        {id:'f-shop',name:'Лавка',kind:'ref',refType:'type-city'}]},
      {id:'type-family',name:'Дом / семья',color:'#c58cff',size:36,shape:'square',icon:'◇',fields:[
        {id:'f-motto',name:'Девиз',kind:'text'}]},
      {id:'type-org',name:'Фракция',color:'#55ddb0',size:36,shape:'triangle',icon:'⚔',fields:[
        {id:'f-goal',name:'Цель',kind:'text'},
        {id:'f-size',name:'Численность',kind:'number'}]},
      {id:'type-god',name:'Божество',color:'#df91ff',size:47,shape:'star',icon:'✦',fields:[
        {id:'f-sphere',name:'Сфера',kind:'text'}]},
      {id:'type-event',name:'Событие',color:'#ff6b88',size:33,shape:'circle',icon:'✹',fields:[
        {id:'f-start',name:'Начало',kind:'text'},
        {id:'f-end',name:'Окончание',kind:'text'}]},
      {id:'type-item',name:'Предмет',color:'#9fb6c9',size:30,shape:'square',icon:'⚒',fields:[
        {id:'f-value',name:'Ценность',kind:'number'}]},
      {id:'type-artifact',name:'Артефакт',color:'#54dcff',size:35,shape:'diamond',icon:'◈',fields:[
        {id:'f-properties',name:'Свойства',kind:'longtext'}]},
      {id:'type-quest',name:'Квест',color:'#ffd166',size:32,shape:'triangle',icon:'!',fields:[
        {id:'f-reward',name:'Награда',kind:'text'},
        {id:'f-giver',name:'Заказчик',kind:'ref',refType:'type-character'},
        {id:'f-priority',name:'Приоритет',kind:'choice',options:['Низкий','Обычный','Высокий','Критический']}]}
    ],
    relationTypes:[
      containmentTypeTemplate(),
      {id:'rel-rules',name:'Управляет',color:'#ffd15c',width:3,arrow:true,lineStyle:'solid',animated:false},
      {id:'rel-member',name:'Состоит в',color:'#55ddb0',width:2,arrow:true,lineStyle:'solid',animated:false},
      {id:'rel-family',name:'Родственник',color:'#a78bfa',width:2,arrow:false,lineStyle:'solid',animated:false},
      {id:'rel-ally',name:'Союзник',color:'#7fd88a',width:2,arrow:false,lineStyle:'solid',animated:false},
      {id:'rel-enemy',name:'Враждует',color:'#ff4d6d',width:4,arrow:true,lineStyle:'dash',animated:false},
      {id:'rel-love',name:'Любит',color:'#ff88bb',width:2,arrow:true,lineStyle:'solid',animated:true},
      {id:'rel-trade',name:'Торгует с',color:'#ffd700',width:2,arrow:false,lineStyle:'solid',animated:true},
      {id:'rel-owns',name:'Владеет',color:'#9fb6c9',width:2,arrow:true,lineStyle:'solid',animated:false},
      {id:'rel-quest',name:'Выдал квест',color:'#ffd166',width:2,arrow:true,lineStyle:'dash',animated:false},
      {id:'rel-created',name:'Создал',color:'#54dcff',width:2,arrow:true,lineStyle:'dot',animated:false},
      {id:'rel-in',name:'Связан с местом',color:'#76e57f',width:2,arrow:true,lineStyle:'dot',animated:false},
      {id:'rel-cause',name:'Причина / следствие',color:'#ff9e64',width:3,arrow:true,lineStyle:'solid',animated:false}
    ],
    statusGroups:[
      {id:'sg-life',name:'Жизнь',kind:'scale',appliesTo:['type-character','type-merchant','type-god'],options:[
        {id:'alive',name:'Жив',color:'#57d68d',icon:'♥',effect:'none'},
        {id:'wounded',name:'Ранен',color:'#ffad5a',icon:'✚',effect:'none'},
        {id:'missing',name:'Пропал',color:'#9aa8c6',icon:'?',effect:'fade'},
        {id:'dead',name:'Мёртв',color:'#8b93a3',icon:'✝',effect:'gray'}]},
      {id:'sg-marks',name:'Метки',kind:'flags',appliesTo:[],options:[
        {id:'cursed',name:'Проклят',color:'#b26bff',icon:'☠',effect:'glow'},
        {id:'enchanted',name:'Зачарован',color:'#54dcff',icon:'✧',effect:'glow'},
        {id:'suspect',name:'Под подозрением',color:'#ff6b88',icon:'⚑',effect:'none'},
        {id:'secret',name:'Тайна',color:'#c9a8ff',icon:'⌘',effect:'none'}]},
      {id:'sg-attitude',name:'Отношение к партии',kind:'scale',appliesTo:['type-character','type-merchant','type-org','type-country','type-family'],options:[
        {id:'hostile',name:'Враждебно',color:'#ff4d6d',icon:'✕',effect:'none'},
        {id:'neutral',name:'Нейтрально',color:'#9aa8c6',icon:'–',effect:'none'},
        {id:'friendly',name:'Дружелюбно',color:'#7fd88a',icon:'☺',effect:'none'},
        {id:'ally',name:'Союзник',color:'#57d68d',icon:'★',effect:'none'}]},
      {id:'sg-quest',name:'Ход квеста',kind:'scale',appliesTo:['type-quest'],options:[
        {id:'not-given',name:'Не выдан',color:'#9aa8c6',icon:'○',effect:'fade'},
        {id:'given',name:'Выдан',color:'#ffd166',icon:'◐',effect:'glow'},
        {id:'done',name:'Выполнен',color:'#57d68d',icon:'✓',effect:'none'},
        {id:'failed',name:'Провален',color:'#8b93a3',icon:'✕',effect:'gray'}]},
      {id:'sg-explore',name:'Исследование',kind:'scale',appliesTo:['type-place','type-city','type-country'],options:[
        {id:'unknown',name:'Неизвестно',color:'#9aa8c6',icon:'?',effect:'fade'},
        {id:'rumors',name:'Слухи',color:'#ffd166',icon:'…',effect:'none'},
        {id:'explored',name:'Исследовано',color:'#57d68d',icon:'⌖',effect:'none'}]},
      {id:'sg-owner',name:'Владение',kind:'scale',appliesTo:['type-item','type-artifact'],options:[
        {id:'lost',name:'Утерян',color:'#9aa8c6',icon:'?',effect:'fade'},
        {id:'hidden',name:'Спрятан',color:'#c9a8ff',icon:'⌘',effect:'none'},
        {id:'received',name:'Получен',color:'#57d68d',icon:'✓',effect:'none'}]}
    ]
  },
  standard:{
    id:'standard',name:'Стандарт',skin:'classic',
    description:'Нейтральная основа для любого жанра и для работы: персоны, места, организации, предметы, события, задачи и заметки.',
    entityTypes:[
      {id:'type-person',name:'Персона',color:'#63c8ff',size:34,shape:'circle',icon:'●',fields:[
        {id:'f-role',name:'Роль',kind:'text'}]},
      {id:'type-place',name:'Место',color:'#76e57f',size:34,shape:'circle',icon:'⌖'},
      {id:'type-org',name:'Организация',color:'#55ddb0',size:38,shape:'hex',icon:'▣',fields:[
        {id:'f-goal',name:'Цель',kind:'text'}]},
      {id:'type-item',name:'Предмет',color:'#9fb6c9',size:30,shape:'square',icon:'◆'},
      {id:'type-event',name:'Событие',color:'#ff6b88',size:33,shape:'circle',icon:'✹',fields:[
        {id:'f-date',name:'Дата',kind:'text'}]},
      {id:'type-task',name:'Задача',color:'#ffd166',size:32,shape:'triangle',icon:'!',fields:[
        {id:'f-owner',name:'Ответственный',kind:'ref',refType:'type-person'},
        {id:'f-deadline',name:'Срок',kind:'text'}]},
      {id:'type-note',name:'Заметка',color:'#c5cad6',size:28,shape:'square',icon:'✎'}
    ],
    relationTypes:[
      containmentTypeTemplate(),
      {id:'rel-related',name:'Связан с',color:'#91a4c7',width:2,arrow:false,lineStyle:'solid',animated:false},
      {id:'rel-member',name:'Входит в',color:'#55ddb0',width:2,arrow:true,lineStyle:'solid',animated:false},
      {id:'rel-owns',name:'Владеет',color:'#9fb6c9',width:2,arrow:true,lineStyle:'solid',animated:false},
      {id:'rel-depends',name:'Зависит от',color:'#ff9e64',width:2,arrow:true,lineStyle:'dash',animated:false},
      {id:'rel-responsible',name:'Отвечает за',color:'#ffd166',width:2,arrow:true,lineStyle:'solid',animated:false}
    ],
    statusGroups:[
      {id:'sg-progress',name:'Состояние',kind:'scale',appliesTo:['type-task','type-event'],options:[
        {id:'planned',name:'Запланировано',color:'#9aa8c6',icon:'○',effect:'fade'},
        {id:'active',name:'Активно',color:'#ffd166',icon:'◐',effect:'glow'},
        {id:'done',name:'Завершено',color:'#57d68d',icon:'✓',effect:'none'},
        {id:'cancelled',name:'Отменено',color:'#8b93a3',icon:'✕',effect:'gray'}]},
      {id:'sg-activity',name:'Активность',kind:'scale',appliesTo:['type-person','type-org'],options:[
        {id:'active',name:'Активен',color:'#57d68d',icon:'●',effect:'none'},
        {id:'inactive',name:'Неактивен',color:'#8b93a3',icon:'○',effect:'fade'}]},
      {id:'sg-marks',name:'Метки',kind:'flags',appliesTo:[],options:[
        {id:'important',name:'Важно',color:'#ff6b88',icon:'!',effect:'glow'},
        {id:'question',name:'Под вопросом',color:'#ffd166',icon:'?',effect:'none'}]}
    ]
  }
};
// 0.18: ready-made record pages. Built-in sections keep the default ids (description, fields, relations…),
// so a section opened on one record stays open on the others.
const PAGE_BASE={
  description:{id:'description',kind:'description'},fields:{id:'fields',kind:'fields',hideEmpty:true},properties:{id:'properties',kind:'properties',hideEmpty:true},
  gallery:{id:'gallery',kind:'gallery',hideEmpty:true},relations:{id:'relations',kind:'relations',hideEmpty:true},contents:{id:'contents',kind:'contents',hideEmpty:true},
  mentions:{id:'mentions',kind:'mentions',hideEmpty:true},tags:{id:'tags',kind:'tags',hideEmpty:true},blocks:{id:'widgets',kind:'blocks',hideEmpty:true},info:{id:'info',kind:'info'}
};
const presetPage=(...items)=>items.map(x=>typeof x==='string'?{...PAGE_BASE[x],config:{}}:{config:{},...x});
const PRESET_PAGES={
  medieval:{
    'type-character':presetPage('description','fields',
      {id:'pc-stats',kind:'stats',title:'Характеристики',config:{items:['СИЛ','ЛОВ','ТЕЛ','ИНТ','МДР','ХАР'],columns:'3',modifier:'dnd'}},
      {id:'pc-vitals',kind:'trackers',title:'Здоровье и ресурсы',icon:'♥',color:'#d9534f',config:{items:['ХП / 10'],style:'bar'}},
      'relations',{id:'pc-quests',kind:'records',title:'Квесты',icon:'!',hideEmpty:true,config:{source:'related',relTypes:['rel-quest'],entTypes:['type-quest'],display:'cards'}},
      {id:'pc-bio',kind:'timeline',title:'Биография',config:{order:'manual'}},
      {id:'pc-secrets',kind:'text',title:'Секреты',icon:'🔒',config:{style:'parchment',placeholder:'То, чего игроки пока не знают.'}},
      'gallery','mentions','tags','blocks','info'),
    'type-merchant':presetPage('description','fields',{id:'mr-goods',kind:'table',title:'Товары',icon:'⚖',config:{columns:['Товар','Цена','Есть'],striped:true,header:true}},
      'relations',{id:'mr-rumors',kind:'list',title:'Слухи',icon:'👂',config:{mode:'bullet'}},'gallery','mentions','tags','info'),
    'type-city':presetPage('description','fields',
      {id:'ct-people',kind:'records',title:'Жители',icon:'☺',hideEmpty:true,config:{source:'descendants',entTypes:['type-character','type-merchant'],display:'list'}},
      {id:'ct-places',kind:'records',title:'Места',icon:'⌂',hideEmpty:true,config:{source:'children',entTypes:['type-place'],display:'chips'}},
      {id:'ct-hooks',kind:'list',title:'Слухи и зацепки',icon:'👂',config:{mode:'bullet'}},{id:'ct-history',kind:'timeline',title:'История',config:{order:'asc'}},
      'relations','contents','gallery','mentions','tags','info'),
    'type-country':presetPage('description','fields',
      {id:'cn-cities',kind:'records',title:'Города',icon:'⌂',hideEmpty:true,config:{source:'descendants',entTypes:['type-city'],display:'chips'}},
      {id:'cn-history',kind:'timeline',title:'История',config:{order:'asc'}},'relations','contents','gallery','mentions','tags','info'),
    'type-family':presetPage('description','fields',
      {id:'fm-members',kind:'records',title:'Члены семьи',icon:'☺',hideEmpty:true,config:{source:'descendants',entTypes:['type-character'],display:'list'}},
      {id:'fm-chronicle',kind:'timeline',title:'Летопись',config:{order:'asc'}},'relations','contents','mentions','tags','info'),
    'type-org':presetPage('description','fields',
      {id:'or-members',kind:'records',title:'Члены',icon:'☺',hideEmpty:true,config:{source:'related',relTypes:['rel-member'],display:'list'}},
      {id:'or-goals',kind:'list',title:'Цели',icon:'◎',config:{mode:'number'}},{id:'or-secrets',kind:'text',title:'Секреты',icon:'🔒',config:{style:'parchment'}},
      'relations','contents','mentions','tags','info'),
    'type-god':presetPage('description','fields',{id:'gd-sayings',kind:'quotes',title:'Изречения'},
      {id:'gd-followers',kind:'records',title:'Последователи',icon:'☺',hideEmpty:true,config:{source:'related',display:'chips'}},'relations','gallery','mentions','tags','info'),
    'type-item':presetPage('description','fields',{id:'it-stats',kind:'stats',title:'Свойства предмета',config:{items:['Урон','Броня','Вес','Цена'],columns:'2',modifier:'none'}},
      {id:'it-history',kind:'text',title:'История предмета'},'relations','gallery','mentions','tags','info'),
    'type-artifact':presetPage('description','fields',{id:'it-stats',kind:'stats',title:'Свойства предмета',config:{items:['Урон','Броня','Вес','Цена'],columns:'2',modifier:'none'}},
      {id:'it-history',kind:'text',title:'Легенда',icon:'✶',config:{style:'parchment'}},'relations','gallery','mentions','tags','info'),
    'type-event':presetPage('description','fields',{id:'ev-course',kind:'timeline',title:'Ход событий',config:{order:'manual'}},
      {id:'ev-people',kind:'records',title:'Участники',icon:'☺',hideEmpty:true,config:{source:'related',display:'chips'}},'relations','contents','mentions','tags','info'),
    'type-quest':presetPage('description','fields',{id:'qs-steps',kind:'list',title:'Задачи',icon:'☑',config:{mode:'check'}},
      {id:'qs-people',kind:'records',title:'Участники',icon:'☺',hideEmpty:true,config:{source:'related',display:'chips'}},
      {id:'qs-reward',kind:'text',title:'Награда',icon:'★'},'relations','mentions','tags','info')
  },
  standard:{
    'type-person':presetPage('description','fields',{id:'ps-contacts',kind:'links',title:'Ссылки'},{id:'ps-history',kind:'timeline',title:'История',config:{order:'desc'}},'relations','gallery','mentions','tags','info'),
    'type-task':presetPage('description','fields',{id:'tk-steps',kind:'list',title:'Подзадачи',icon:'☑',config:{mode:'check'}},'relations','mentions','tags','info'),
    'type-event':presetPage('description','fields',{id:'ev-course',kind:'timeline',title:'Ход событий'},'relations','mentions','tags','info'),
    'type-note':presetPage({id:'description',kind:'description',config:{style:'note'}},'mentions','tags','info')
  }
};
// 0.29.8 «Большое средневековое фэнтези» (просьба пользователя 22.10.2026: «расширить многократно»): к 14 типам, 13 связям и
// 6 группам статусов пресета — ещё 70 типов по группам, 40 связей с важностью и 10 групп статусов, у типов — анкеты и значки.
// Старые номера не меняются (миры с прежним пресетом получают недостающее через «Добавить» и не ломаются).
(function(){
  const M=RULE_PRESETS.medieval,G={people:'Люди и существа',power:'Сообщества и власть',places:'Места',things:'Вещи',deeds:'События и дела',lore:'Знания и вера'};
  const T=(id,name,group,icon,color,shape,size,fields=[])=>({id,name,group,icon,color,shape,size,fields:fields.map(([fid,fname,kind,extra])=>({id:fid,name:fname,kind,...(extra||{})}))});
  const ch=(...o)=>({options:o}),ref=t=>({refType:t});
  // the 14 that were there get a group too (the «Набор правил» shows the new ones next to them)
  const old={'type-world':G.places,'type-country':G.power,'type-city':G.places,'type-place':G.places,'type-character':G.people,'type-merchant':G.people,'type-family':G.power,'type-org':G.power,'type-god':G.lore,'type-event':G.deeds,'type-item':G.things,'type-artifact':G.things,'type-quest':G.deeds};
  for(const t of M.entityTypes)if(old[t.id])t.group=old[t.id];
  M.entityTypes.push(
    // ---- люди и существа ----
    T('type-noble','Дворянин',G.people,'♛','#e8c26a','circle',35,[['f-title','Титул','text'],['f-house','Род','ref',ref('type-family')],['f-lands','Владения','ref',ref('type-fief')],['f-coat','Герб','text']]),
    T('type-ruler','Правитель',G.people,'♚','#ffcf40','star',42,[['f-title','Титул','text'],['f-realm','Держава','ref',ref('type-country')],['f-heir','Наследник','ref',ref('type-character')],['f-reign','Годы правления','text']]),
    T('type-knight','Рыцарь',G.people,'⚔','#c7d2e0','circle',35,[['f-lord','Сюзерен','ref',ref('type-noble')],['f-order','Орден','ref',ref('type-order')],['f-coat','Герб','text'],['f-oath','Обет','text']]),
    T('type-mage','Маг',G.people,'✶','#8f7dff','circle',34,[['f-school','Школа магии','ref',ref('type-school')],['f-rank','Ранг','choice',ch('Ученик','Адепт','Магистр','Архимаг')],['f-power','Сила','choice',ch('Слабая','Средняя','Великая')]]),
    T('type-priest','Жрец',G.people,'☩','#f3e7b0','circle',34,[['f-deity','Божество','ref',ref('type-god')],['f-temple','Храм','ref',ref('type-temple')],['f-rank','Сан','text']]),
    T('type-mercenary','Наёмник',G.people,'⛨','#c28b5a','circle',33,[['f-price','Цена за день','text'],['f-band','Отряд','ref',ref('type-army')],['f-loyal','Верность','choice',ch('Продаст','Пока платят','Надёжен')]]),
    T('type-rogue','Вор',G.people,'🗡','#8b8fa3','circle',32,[['f-guild','Гильдия','ref',ref('type-guild')],['f-specialty','Ремесло','choice',ch('Карманник','Взломщик','Контрабандист','Убийца','Мошенник')],['f-bounty','Награда за голову','text']]),
    T('type-bard','Бард',G.people,'♫','#ff9ec7','circle',32,[['f-instrument','Инструмент','text'],['f-songs','Известные песни','longtext']]),
    T('type-healer','Лекарь',G.people,'✚','#8fe3a8','circle',32,[['f-herbs','Травы и снадобья','longtext'],['f-price','Цена','text']]),
    T('type-craftsman','Ремесленник',G.people,'⚒','#b9a07a','circle',32,[['f-craft','Ремесло','text'],['f-workshop','Мастерская','ref',ref('type-city')]]),
    T('type-peasant','Крестьянин',G.people,'☘','#a7c98a','circle',30,[['f-village','Деревня','ref',ref('type-village')],['f-need','Беда','text']]),
    T('type-hero','Персонаж игрока',G.people,'★','#5fd4ff','star',38,[['f-player','Игрок','text'],['f-class','Класс','text'],['f-level','Уровень','number'],['f-race','Раса','text']]),
    T('type-monster','Чудовище',G.people,'☗','#d1584f','triangle',36,[['f-danger','Опасность','choice',ch('Безобидно','Опасно','Смертельно')],['f-lair','Логово','ref',ref('type-dungeon')],['f-weak','Слабость','text']]),
    T('type-undead','Нежить',G.people,'☠','#9aa5b1','triangle',34,[['f-danger','Опасность','choice',ch('Безобидно','Опасно','Смертельно')],['f-lifename','Прежняя жизнь','text'],['f-bound','Привязка к миру','text']]),
    T('type-dragon','Дракон',G.people,'🐉','#ff7a45','star',46,[['f-color','Цвет','text'],['f-age','Возраст','choice',ch('Детёныш','Молодой','Взрослый','Древний')],['f-hoard','Сокровищница','ref',ref('type-treasure')],['f-lair','Логово','ref',ref('type-dungeon')]]),
    T('type-spirit','Дух',G.people,'❂','#b8e4ff','circle',32,[['f-bound','Привязан к','text'],['f-wish','Желание','text']]),
    T('type-demon','Демон',G.people,'⛧','#ff3b5c','star',38,[['f-name','Истинное имя','text'],['f-pact','Договор','ref',ref('type-pact')],['f-banish','Изгнание','text']]),
    T('type-fey','Фейри',G.people,'❀','#c6a2ff','circle',32,[['f-court','Двор','choice',ch('Летний','Зимний','Без двора')],['f-bargain','Цена помощи','text']]),
    T('type-beast','Зверь',G.people,'🐾','#b48a5c','circle',30,[['f-tame','Приручен','bool'],['f-owner','Хозяин','ref',ref('type-character')]]),
    // ---- сообщества и власть ----
    T('type-fief','Владение',G.power,'⚑','#e0b04f','hex',38,[['f-lord','Сеньор','ref',ref('type-noble')],['f-overlord','Сюзерен','ref',ref('type-ruler')],['f-income','Доход','text'],['f-levy','Ополчение','number']]),
    T('type-guild','Гильдия',G.power,'⚙','#d8a35d','hex',36,[['f-master','Глава','ref',ref('type-character')],['f-trade','Чем занимается','text'],['f-hall','Гильдейский дом','ref',ref('type-city')]]),
    T('type-order','Орден',G.power,'✠','#e6e6e6','triangle',38,[['f-grandmaster','Великий магистр','ref',ref('type-knight')],['f-vow','Устав и обеты','longtext'],['f-seat','Цитадель','ref',ref('type-fortress')]]),
    T('type-cult','Культ',G.power,'☾','#9b5de5','triangle',36,[['f-deity','Чему поклоняются','text'],['f-leader','Верховный жрец','ref',ref('type-character')],['f-hidden','Тайный','bool']]),
    T('type-church','Церковь',G.power,'⛪','#f5e6a8','hex',38,[['f-deity','Божество','ref',ref('type-god')],['f-head','Глава церкви','ref',ref('type-priest')],['f-tithe','Десятина','text']]),
    T('type-gang','Банда',G.power,'☗','#8a6f6f','triangle',33,[['f-boss','Главарь','ref',ref('type-character')],['f-turf','Территория','ref',ref('type-place')]]),
    T('type-clan','Клан',G.power,'⚚','#c68a4e','hex',36,[['f-chief','Вождь','ref',ref('type-character')],['f-totem','Тотем','text']]),
    T('type-tribe','Племя',G.power,'✺','#9ccc65','hex',35,[['f-chief','Вождь','ref',ref('type-character')],['f-lands','Земли','ref',ref('type-place')]]),
    T('type-army','Войско',G.power,'⚔','#cf5c5c','square',38,[['f-commander','Командир','ref',ref('type-character')],['f-size','Численность','number'],['f-morale','Боевой дух','choice',ch('Сломлен','Шаткий','Твёрдый','Неукротимый')]]),
    T('type-council','Совет',G.power,'⚖','#a8c4e0','hex',34,[['f-seat','Место заседаний','ref',ref('type-city')],['f-members','Состав','longtext']]),
    // ---- места ----
    T('type-village','Деревня',G.places,'⌂','#b39ddb','diamond',32,[['f-population','Население','number'],['f-elder','Староста','ref',ref('type-character')],['f-trouble','Беда','text']]),
    T('type-castle','Замок',G.places,'♜','#9e9e9e','square',40,[['f-lord','Хозяин','ref',ref('type-noble')],['f-garrison','Гарнизон','number'],['f-defense','Оборона','choice',ch('Слабая','Крепкая','Неприступная')]]),
    T('type-fortress','Крепость',G.places,'⛫','#8d8d8d','square',40,[['f-commander','Комендант','ref',ref('type-character')],['f-garrison','Гарнизон','number']]),
    T('type-temple','Храм',G.places,'⛩','#f7e3a1','diamond',34,[['f-deity','Божество','ref',ref('type-god')],['f-priest','Настоятель','ref',ref('type-priest')]]),
    T('type-ruins','Руины',G.places,'🏚','#a1887f','diamond',33,[['f-was','Чем были','text'],['f-danger','Опасность','choice',ch('Безопасно','Опасно','Смертельно')]]),
    T('type-dungeon','Подземелье',G.places,'🕳','#6d6875','diamond',36,[['f-levels','Ярусы','number'],['f-danger','Опасность','choice',ch('Безопасно','Опасно','Смертельно')],['f-master','Хозяин','ref',ref('type-monster')]]),
    T('type-forest','Лес',G.places,'🌲','#66bb6a','circle',36,[['f-danger','Опасность','choice',ch('Безопасно','Опасно','Смертельно')],['f-dwellers','Обитатели','text']]),
    T('type-mountains','Горы',G.places,'⛰','#a1887f','triangle',38,[['f-pass','Перевалы','text'],['f-dwellers','Обитатели','text']]),
    T('type-water','Река / озеро',G.places,'≈','#4fc3f7','circle',34,[['f-ford','Броды и мосты','text']]),
    T('type-road','Тракт',G.places,'┅','#bcaaa4','square',30,[['f-from','Откуда','ref',ref('type-city')],['f-to','Куда','ref',ref('type-city')],['f-days','Дней пути','number']]),
    T('type-tavern','Таверна',G.places,'🍺','#ffb74d','diamond',32,[['f-keeper','Хозяин','ref',ref('type-character')],['f-price','Цены','choice',ch('Дёшево','Средне','Дорого')],['f-dish','Фирменное блюдо','text']]),
    T('type-port','Порт',G.places,'⚓','#4dd0e1','diamond',34,[['f-ships','Корабли','longtext'],['f-harbormaster','Начальник порта','ref',ref('type-character')]]),
    T('type-market','Рынок',G.places,'⚖','#ffd54f','diamond',30,[['f-days','Торговые дни','text'],['f-goods','Чем славится','text']]),
    T('type-mine','Шахта',G.places,'⛏','#90a4ae','diamond',30,[['f-ore','Добыча','text'],['f-owner','Хозяин','ref',ref('type-character')]]),
    T('type-graveyard','Кладбище',G.places,'✝','#90a4ae','diamond',30,[['f-haunted','Неспокойно','bool']]),
    T('type-tower','Башня',G.places,'🗼','#b0bec5','square',32,[['f-owner','Хозяин','ref',ref('type-mage')],['f-floors','Этажи','number']]),
    // ---- вещи ----
    T('type-weapon','Оружие',G.things,'🗡','#cfd8dc','diamond',30,[['f-damage','Урон','text'],['f-kind','Вид','choice',ch('Меч','Топор','Копьё','Лук','Кинжал','Молот','Посох','Другое')],['f-value','Цена','text']]),
    T('type-armor','Доспех',G.things,'⛨','#b0bec5','square',30,[['f-defense','Защита','text'],['f-kind','Вид','choice',ch('Кожаный','Кольчуга','Латы','Щит','Другое')],['f-value','Цена','text']]),
    T('type-potion','Зелье',G.things,'⚗','#80deea','circle',28,[['f-effect','Действие','text'],['f-doses','Порций','number']]),
    T('type-scroll','Свиток',G.things,'📜','#ffe0b2','square',28,[['f-spell','Заклинание','ref',ref('type-spell')],['f-uses','Заряды','number']]),
    T('type-book','Книга',G.things,'📕','#bcaaa4','square',28,[['f-author','Автор','ref',ref('type-character')],['f-language','Язык','ref',ref('type-language')],['f-secret','Сокрытое','longtext']]),
    T('type-relic','Реликвия',G.things,'✟','#ffe082','star',32,[['f-saint','Святой покровитель','text'],['f-power','Сила','longtext']]),
    T('type-treasure','Сокровище',G.things,'💎','#ffd700','diamond',32,[['f-worth','Стоимость','text'],['f-guard','Стража','ref',ref('type-monster')]]),
    T('type-key','Ключ',G.things,'🗝','#d4af37','circle',26,[['f-opens','Открывает','text']]),
    T('type-mount','Скакун',G.things,'🐎','#a1887f','circle',30,[['f-kind','Народ','text'],['f-owner','Всадник','ref',ref('type-character')]]),
    T('type-ship','Корабль',G.things,'⛵','#4fc3f7','square',34,[['f-captain','Капитан','ref',ref('type-character')],['f-crew','Команда','number'],['f-port','Порт приписки','ref',ref('type-port')]]),
    // ---- события и дела ----
    T('type-battle','Битва',G.deeds,'⚔','#ef5350','triangle',34,[['f-date','Дата','text'],['f-winner','Победитель','text'],['f-losses','Потери','text']]),
    T('type-war','Война',G.deeds,'✕','#c62828','triangle',38,[['f-start','Начало','text'],['f-cause','Причина','longtext'],['f-end','Чем кончилась','text']]),
    T('type-tournament','Турнир',G.deeds,'🏆','#ffca28','triangle',30,[['f-date','Дата','text'],['f-prize','Приз','text'],['f-winner','Победитель','ref',ref('type-character')]]),
    T('type-feast','Праздник',G.deeds,'✺','#ffb74d','circle',28,[['f-date','Дата','text'],['f-custom','Обычаи','longtext']]),
    T('type-prophecy','Пророчество',G.deeds,'👁','#b388ff','star',32,[['f-text','Слова пророчества','longtext'],['f-seer','Провидец','ref',ref('type-character')]]),
    T('type-rumor','Слух',G.deeds,'👂','#c5cae9','circle',26,[['f-source','Откуда','text'],['f-true','Правда ли','choice',ch('Не проверено','Правда','Ложь','Отчасти')]]),
    T('type-secret','Тайна',G.deeds,'⌘','#b39ddb','circle',28,[['f-knows','Посвящённые','longtext'],['f-cost','Цена раскрытия','text']]),
    T('type-plot','Заговор',G.deeds,'🕸','#7e57c2','triangle',32,[['f-target','Против кого','ref',ref('type-character')],['f-goal','Цель','text'],['f-deadline','Срок','text']]),
    T('type-pact','Договор',G.deeds,'✍','#a1887f','square',28,[['f-terms','Условия','longtext'],['f-price','Цена','text'],['f-ends','Срок действия','text']]),
    // ---- знания и вера ----
    T('type-spell','Заклинание',G.lore,'✧','#7c4dff','star',28,[['f-school','Школа','ref',ref('type-school')],['f-level','Круг','number'],['f-effect','Действие','longtext'],['f-cost','Цена','text']]),
    T('type-school','Школа магии',G.lore,'✺','#651fff','hex',32,[['f-element','Стихия','text'],['f-founder','Основатель','ref',ref('type-character')]]),
    T('type-language','Язык',G.lore,'Ꭿ','#90caf9','square',26,[['f-speakers','Носители','text'],['f-script','Письменность','text']]),
    T('type-legend','Легенда',G.lore,'❦','#ffcc80','circle',28,[['f-told','Край','text'],['f-truth','Доля правды','choice',ch('Выдумка','Есть зерно правды','Всё правда')]]),
    T('type-custom','Обычай',G.lore,'✿','#ffab91','circle',26,[['f-who','Народ','text'],['f-when','Дата','text']]),
    T('type-disease','Болезнь',G.lore,'☣','#aed581','circle',28,[['f-symptoms','Признаки','longtext'],['f-cure','Лечение','text'],['f-spread','Заразность','choice',ch('Не заразна','Заразна','Мор')]]),
    T('type-law','Закон',G.lore,'⚖','#cfd8dc','square',26,[['f-realm','Земли','ref',ref('type-country')],['f-punishment','Наказание','text']])
  );
  // ---- связи: смысл и важность (I — важнейшее, V — фон) ----
  const R=(id,name,color,tier,arrow=true,lineStyle='solid',width=2,inverse='')=>({id,name,color,width,arrow,lineStyle,animated:false,tier,...(inverse?{reverseName:inverse}:{})});
  M.relationTypes.push(
    R('rel-parent','Родитель','#ce93d8',2,true,'solid',2,'Ребёнок'),R('rel-spouse','Супруг','#f48fb1',2,false),R('rel-heir','Наследник','#ffd54f',2,true,'dash',2,'Наследует'),R('rel-bastard','Бастард','#b39ddb',3,true,'dot',2,'Отец бастарда'),R('rel-sibling','Брат / сестра','#ba68c8',3,false),R('rel-guardian','Опекун','#9575cd',3,true,'solid',2,'Под опекой'),
    R('rel-liege','Сюзерен','#ffca28',2,true,'solid',3,'Вассал'),R('rel-serves','Служит','#ffe082',3,true),R('rel-sworn','Присягнул','#fff176',2,true,'solid',3,'Принял присягу'),R('rel-commands','Командует','#ef9a9a',2,true,'solid',3,'Под командой'),R('rel-advisor','Советник','#90caf9',3,true,'dash',2,'Слушает советника'),
    R('rel-friend','Друг','#a5d6a7',3,false),R('rel-rival','Соперник','#ffab91',3,false,'dash'),R('rel-debtor','Должник','#bcaaa4',4,true,'dot',2,'Кредитор'),R('rel-fears','Боится','#b0bec5',4,true,'dot'),R('rel-mentor','Наставник','#80cbc4',3,true,'solid',2,'Ученик'),R('rel-betrayed','Предал','#e53935',2,true,'dash',3,'Предан'),R('rel-saved','Спас','#81c784',3,true,'solid',2,'Спасён'),R('rel-blackmail','Шантажирует','#ab47bc',2,true,'dash',2,'Под шантажом'),R('rel-suspects','Подозревает','#ff8a65',4,true,'dot'),R('rel-hates','Ненавидит','#d32f2f',3,true,'solid',3,'Ненавидим'),
    R('rel-worships','Поклоняется','#e1bee7',3,true,'solid',2,'Почитаем'),R('rel-cursed','Проклял','#7b1fa2',2,true,'dash',3,'Проклят'),R('rel-blessed','Благословил','#fff59d',3,true),R('rel-pact','Связан договором','#8d6e63',2,false,'dash',3),R('rel-summoned','Призвал','#9c27b0',3,true,'dot',2,'Призван'),
    R('rel-war','Воюет с','#c62828',1,false,'solid',5),R('rel-siege','Осаждает','#e53935',1,true,'dash',4,'В осаде у'),R('rel-tribute','Платит дань','#ffb300',3,true,'dot',2,'Получает дань'),R('rel-hired','Нанят','#a1887f',3,true,'solid',2,'Нанял'),R('rel-spy','Шпионит за','#546e7a',2,true,'dot',2,'Под слежкой'),R('rel-supplies','Поставляет','#ffcc80',4,true),
    R('rel-wears','Носит','#b0bec5',4,true),R('rel-keeps','Хранит','#90a4ae',4,true,'solid',2,'Хранится у'),R('rel-buried','Похоронен в','#78909c',4,true,'dot'),R('rel-born','Родом из','#a5d6a7',4,true,'dot',2,'Родина'),R('rel-lives','Живёт в','#c5e1a5',4,true,'dot',2,'Жители'),R('rel-guards','Охраняет','#4db6ac',3,true,'solid',2,'Под охраной'),R('rel-seeks','Ищет','#ffd54f',3,true,'dash',2,'Его ищет'),R('rel-stole','Украл','#ef5350',2,true,'dash',2,'Украдено у')
  );
  // the old ones get a level too (they were all «III»)
  // the 13 old relation types keep «Обычная» (III): since 0.28 every link starts ordinary, the Master raises what matters
  // ---- статусы ----
  const life=M.statusGroups.find(g=>g.id==='sg-life');
  if(life){life.appliesTo=[...new Set([...life.appliesTo,'type-noble','type-ruler','type-knight','type-mage','type-priest','type-mercenary','type-rogue','type-bard','type-healer','type-craftsman','type-peasant','type-hero','type-monster','type-dragon','type-beast','type-fey','type-mount'])];
    life.options.splice(2,0,{id:'badly-wounded',name:'Тяжело ранен',color:'#ff7043',icon:'✚',effect:'none'},{id:'dying',name:'При смерти',color:'#e53935',icon:'⚠',effect:'glow'});life.options.push({id:'risen',name:'Поднят из мёртвых',color:'#9575cd',icon:'☠',effect:'glow'})}
  const people=['type-character','type-merchant','type-noble','type-ruler','type-knight','type-mage','type-priest','type-mercenary','type-rogue','type-bard','type-healer','type-craftsman','type-peasant','type-hero'];
  const places=['type-city','type-place','type-country','type-village','type-castle','type-fortress','type-temple','type-port','type-market','type-mine','type-fief','type-tower','type-tavern'];
  const S=(id,name,kind,appliesTo,opts)=>({id,name,kind,appliesTo,options:opts.map(([oid,oname,color,icon,effect='none'])=>({id:oid,name:oname,color,icon,effect}))});
  M.statusGroups.push(
    S('sg-standing','Положение','scale',people,[['favor','В фаворе','#ffd54f','★'],['free','Свободен','#9aa8c6','–'],['disgrace','В опале','#a1887f','↓','fade'],['wanted','В розыске','#ff7043','⚑'],['exile','В изгнании','#90a4ae','⇥','fade'],['captive','В плену','#78909c','⛓','gray']]),
    S('sg-place-state','Состояние','scale',places,[['thriving','Процветает','#66bb6a','▲'],['steady','Живёт как прежде','#9aa8c6','–'],['decline','В упадке','#ffb74d','▼','fade'],['siege','Осаждено','#ef5350','⚔','glow'],['captured','Захвачено','#c62828','⚑'],['ruined','Разорено','#8d6e63','✕','gray'],['abandoned','Заброшено','#78909c','○','gray']]),
    S('sg-spirit','Чары и дух','flags',[],[['possessed','Одержим','#7b1fa2','☾','glow'],['blessed','Благословлён','#fff59d','✦','glow'],['charmed','Под чарами','#f48fb1','❤','glow'],['mad','Безумен','#ab47bc','✺'],['disguised','Под чужой личиной','#90a4ae','◐']]),
    S('sg-threat','Угроза','scale',['type-monster','type-undead','type-dragon','type-demon','type-spirit','type-beast','type-gang','type-army','type-cult'],[['harmless','Безобидно','#9ccc65','○'],['dangerous','Опасно','#ffb74d','!'],['deadly','Смертельно','#e53935','☠','glow'],['defeated','Повержено','#8b93a3','✓','gray']]),
    S('sg-war','Война и мир','scale',['type-country','type-fief','type-clan','type-tribe','type-guild','type-order'],[['peace','Мир','#81c784','☮'],['tension','Напряжение','#ffd54f','!'],['at-war','Война','#e53935','⚔','glow'],['truce','Перемирие','#90caf9','≈']]),
    S('sg-item-state','Сохранность','scale',['type-item','type-artifact','type-weapon','type-armor','type-relic','type-ship','type-key'],[['intact','Цел','#81c784','✓'],['damaged','Повреждён','#ffb74d','~'],['broken','Сломан','#8b93a3','✕','gray']]),
    S('sg-secret','Раскрытие','scale',['type-secret','type-plot','type-prophecy','type-pact'],[['hidden-s','Скрыто','#9aa8c6','⌘','fade'],['guessed','Догадываются','#ffd54f','?'],['revealed','Раскрыто','#ef5350','!','glow']]),
    S('sg-prophecy','Сбывается ли','scale',['type-prophecy','type-legend'],[['waiting','Ждёт своего часа','#9aa8c6','…'],['coming','Сбывается','#ffb74d','◐','glow'],['fulfilled','Сбылось','#81c784','✓'],['averted','Предотвращено','#8b93a3','✕','gray']]),
    S('sg-rumor','Правдивость','scale',['type-rumor','type-legend'],[['unverified','Не проверено','#9aa8c6','?'],['true','Правда','#81c784','✓'],['false','Ложь','#e57373','✕','fade']]),
    S('sg-battle','Исход','scale',['type-battle','type-war','type-tournament'],[['ongoing','Идёт','#ffb74d','⚔','glow'],['victory','Победа','#81c784','★'],['defeat','Поражение','#e57373','✕'],['draw','Ничья','#9aa8c6','=']]),
    S('sg-road','Путь','scale',['type-road','type-mountains','type-water','type-forest'],[['safe','Безопасно','#81c784','✓'],['risky','Опасно','#ffb74d','!'],['blocked','Перекрыто','#e53935','✕','gray']])
  );
  // ---- страницы новых типов: люди — как у персонажа, поселения и крепости — как у города ----
  const pg=PRESET_PAGES.medieval;
  for(const id of ['type-noble','type-ruler','type-knight','type-mage','type-priest','type-mercenary','type-rogue','type-bard','type-healer','type-hero'])pg[id]=pg['type-character'];
  for(const id of ['type-village','type-castle','type-fortress','type-port'])pg[id]=pg['type-city'];
  for(const id of ['type-weapon','type-armor','type-relic'])pg[id]=pg['type-artifact'];
  for(const id of ['type-battle','type-war','type-tournament'])pg[id]=pg['type-event'];
  pg['type-dungeon']=presetPage('description','fields',{id:'dg-rooms',kind:'list',title:'Залы и ловушки',icon:'🕳',config:{mode:'number'}},{id:'dg-monsters',kind:'records',title:'Кто внутри',icon:'☗',hideEmpty:true,config:{source:'descendants',display:'chips'}},{id:'dg-loot',kind:'list',title:'Добыча',icon:'💎',config:{mode:'bullet'}},'relations','contents','gallery','mentions','tags','info');
  pg['type-spell']=presetPage('description','fields',{id:'sp-stats',kind:'stats',title:'Заклинание',config:{items:['Круг','Дальность','Длительность','Время'],columns:'2',modifier:'none'}},'relations','mentions','tags','info');
  pg['type-monster']=presetPage('description','fields',{id:'mn-stats',kind:'stats',title:'Характеристики',config:{items:['СИЛ','ЛОВ','ТЕЛ','ИНТ','МДР','ХАР'],columns:'3',modifier:'dnd'}},{id:'mn-vitals',kind:'trackers',title:'Здоровье',icon:'♥',color:'#d9534f',config:{items:['ХП / 30'],style:'bar'}},{id:'mn-tactics',kind:'text',title:'Тактика',icon:'⚔'},'relations','gallery','mentions','tags','info');
  pg['type-dragon']=pg['type-monster'];
  M.description='Королевства и владения, замки и подземелья, рыцари, маги и чудовища, гильдии, ордена и культы, войны, заговоры, пророчества и заклинания — 84 типа сущностей по группам, 53 вида связей по важности, 17 групп статусов.';
})();
for(const [pid,pages] of Object.entries(PRESET_PAGES))for(const t of RULE_PRESETS[pid].entityTypes)if(pages[t.id])t.page=pages[t.id];
const PRESET_ORDER=['medieval','standard'];
// A fresh, independent copy of a preset's rules (never the shared object itself).
function presetRules(id){const p=RULE_PRESETS[id];if(!p)return null;return {entityTypes:clone(p.entityTypes),relationTypes:clone(p.relationTypes),statusGroups:clone(p.statusGroups),rulesPreset:p.id,skin:p.skin}}
