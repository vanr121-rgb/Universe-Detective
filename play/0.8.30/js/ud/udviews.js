// Universe Detective — в UD один вид, доска (js/views/detective.js). Здесь — то немногое из убранных видов Universe Graph
// (graph.js, tree.js, table.js…), чем пользуется общий код: список видов, «это таблица?», рисунок линии связи.
// Холста Graph нет: resize / wakeRenderLoop — пустые (доска сама следит за размером окна).
'use strict';
const VIEW_MODES=['detective'];
function isRecordsMode(){return false}
function resize(){}
function wakeRenderLoop(){}
// из graph.js
function lineDashPattern(st){
  const a=Math.max(1,Number(st.dashSize)||7),g=Math.max(1,Number(st.dashGap ?? a)||a);
  switch(st.lineStyle){case 'dash':return[a,g];case 'dot':return[Math.max(1,a*.28),g];case 'longdash':return[a*2.1,g];case 'dashdot':return[a,g,Math.max(1,a*.25),g];case 'dense':return[Math.max(1,a*.7),Math.max(1,g*.55)];default:return[]}
}
function pointOnQuad(p0,p1,p2,t){const u=1-t;return{x:u*u*p0.x+2*u*t*p1.x+t*t*p2.x,y:u*u*p0.y+2*u*t*p1.y+t*t*p2.y}}
// из tree.js
const THREAD_ANIMATION_NAMES={dot:'Поток точки',reverse:'Обратный поток',pulse:'Пульсация центра',comet:'Комета',trail:'След',spark:'Искры'};
function relationSvgStyle(r){
  const rt=getRT(r.type),st={...rt,...(r.style||{})};
  return {
    color:safeCssValue(st.color||rt.color,'#8fb7ff'),width:clamp(Number(st.width)||2,.5,20),
    opacity:clamp(Number(st.opacity??1),.05,1),dash:lineDashPattern(st),
    arrow:!!st.arrow,arrowSize:clamp(Number(st.arrowSize)||8,3,24),
    curve:clamp(Number(st.curve)||0,-1,1),
    lineCap:['round','butt','square'].includes(st.lineCap)?st.lineCap:'round',
    double:st.lineStyle==='double',animated:!!st.animated,
    animationStyle:Object.hasOwn(THREAD_ANIMATION_NAMES,st.animationStyle)?st.animationStyle:'dot',
    animationSpeed:clamp(Number(st.animationSpeed)||1,.1,4),
    labelSize:clamp(Number(st.labelSize)||11,6,24),
  };
}
// из js/meh/lexicon.js (Мех убран, а «Найти двойников» и корзина узнают имя в другой форме: «Маркуса Аркена» = «Маркус Аркен»)
const RU_ADJECTIVE=/(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const RU_PARTICIPLE=/((ивш|ывш|ующ)|((?<=[ая])(ем|нн|вш|ющ|щ)))$/;
const RU_NOUN=/(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
const nameStemCache=new Map();
function ruNameStem(word){
  const w=String(word||'').toLowerCase().replace(/ё/g,'е');if(nameStemCache.has(w))return nameStemCache.get(w);
  let out=w;const m=w.match(/^(.*?[аеиоуыэюя])(.*)$/);
  if(m&&/[а-я]/.test(w)){let rv=m[2],t=rv.replace(RU_ADJECTIVE,'');rv=t!==rv?t.replace(RU_PARTICIPLE,''):rv.replace(RU_NOUN,'');out=m[1]+rv.replace(/ь$/,'')}
  if(out.length>=5)out=out.replace(/[еео]([бвгджзклмнпрстфхцчшщ])$/,'$1');
  if(nameStemCache.size>20000)nameStemCache.clear();nameStemCache.set(w,out);return out;
}
