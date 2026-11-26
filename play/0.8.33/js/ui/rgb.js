'use strict';

// One picker for dynamically rendered color inputs. The editor keeps its own
// draft, preview and persistence handlers, which run only after confirmation.
const rgbHex=channels=>'#'+channels.map(n=>n.toString(16).padStart(2,'0')).join('');
const hexRgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

// Older imported rules can use named colors and CSS rgb()/hsl() values.
let rgbColorProbe;
function cssRgbHex(value,fallback='#74b8ff'){
  const hex=hexOr(value,'');
  if(hex)return hex.toLowerCase();
  if(typeof value!=='string'||!CSS.supports('color',value))return fallback;
  rgbColorProbe??=document.createElement('canvas').getContext('2d');
  rgbColorProbe.fillStyle=fallback;
  rgbColorProbe.fillStyle=value;
  const color=rgbColorProbe.fillStyle;
  const channels=color.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, [\d.]+)?\)$/)?.slice(1).map(Number);
  return channels?rgbHex(channels.map(Math.round)):hexOr(color,fallback);
}

function rgbToHsv(channels,previousHue){
  const [r,g,b]=channels.map(n=>n/255),max=Math.max(r,g,b),delta=max-Math.min(r,g,b);
  if(!delta)return [previousHue,0,max];
  const hue=(max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta)*60;
  return [(hue+360)%360,delta/max,max];
}

function hsvToRgb([h,s,v]){
  return [5,3,1].map(n=>{
    const k=(n+h/60)%6;
    return Math.round(255*(v-v*s*Math.max(0,Math.min(k,4-k,1))));
  });
}

let rgbPicker,rgbSession;
function closeRgbPicker(apply=false){
  if(!rgbSession)return;
  const {input,channels,original,workspace}=rgbSession;
  rgbSession=null;
  rgbPicker.dialog.close();
  if(input.isConnected&&input.getClientRects().length)input.focus({preventScroll:true});
  if(!apply||state.workspaceId!==workspace||!input.isConnected||!input.getClientRects().length||
    input.matches(':disabled')||input.value!==original)return;
  const value=rgbHex(channels);
  if(value===original&&!input.hasAttribute('data-rgb-apply-same'))return;
  input.value=value;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

function createRgbDialog(){
  const dialog=document.createElement('dialog');
  dialog.className='rgbDialog';
  dialog.setAttribute('aria-labelledby','rgbTitle');
  dialog.innerHTML=`<form novalidate>
    <h3 id="rgbTitle">Выбор цвета</h3>
    <div class="rgbSquare" aria-hidden="true"><i></i></div>
    <input class="rgbHue" type="range" min="0" max="359" step="any" aria-label="Оттенок">
    <div class="rgbValues">
      ${['R','G','B'].map(c=>`<label>${c}<input name="${c}" type="number" min="0" max="255" step="1" required></label>`).join('')}
      <label>HEX<input name="hex" maxlength="7" spellcheck="false" pattern="#?[0-9A-Fa-f]{6}" required></label>
      <span class="rgbPreview" role="img" aria-label="Предпросмотр цвета"></span>
    </div>
    <div class="rgbPresets" aria-label="Образцы"></div>
    <div class="rgbError" role="status"></div>
    <div class="rgbActions"><button type="button" class="btn" data-rgb-cancel>Отмена</button><button type="submit" class="btn primary">Выбрать</button></div>
  </form>`;
  const form=dialog.querySelector('form'),square=dialog.querySelector('.rgbSquare');
  const hue=dialog.querySelector('.rgbHue'),hex=form.elements.hex;
  const fields=['R','G','B'].map(c=>form.elements[c]);
  const error=dialog.querySelector('.rgbError');
  const update=(skip=null)=>{
    const {channels,hsv}=rgbSession,[h,s,v]=hsv;
    const value=rgbHex(channels);
    fields.forEach((field,i)=>{if(field!==skip)field.value=channels[i]});
    if(skip!==hex)hex.value=value;
    hue.value=h;
    square.style.setProperty('--rgb-hue',h);
    square.style.setProperty('--rgb-x',s*100+'%');
    square.style.setProperty('--rgb-y',(1-v)*100+'%');
    dialog.querySelector('.rgbPreview').style.backgroundColor=value;
    error.textContent='';
  };
  const setRgb=(channels,skip)=>{
    rgbSession.channels=channels;
    rgbSession.hsv=rgbToHsv(channels,rgbSession.hsv[0]);
    update(skip);
  };
  const setHsv=()=>{
    rgbSession.channels=hsvToRgb(rgbSession.hsv);
    update();
  };
  const point=event=>{
    const r=square.getBoundingClientRect(),hsv=rgbSession.hsv;
    hsv[1]=clamp((event.clientX-r.left)/r.width,0,1);
    hsv[2]=1-clamp((event.clientY-r.top)/r.height,0,1);
    setHsv();
  };
  square.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    square.setPointerCapture(event.pointerId);
    point(event);
  });
  square.addEventListener('pointermove',event=>{if(square.hasPointerCapture(event.pointerId))point(event)});
  hue.addEventListener('input',()=>{rgbSession.hsv[0]=hue.valueAsNumber;setHsv()});
  fields.forEach(field=>field.addEventListener('input',()=>{
    if(!fields.every(input=>input.validity.valid)){error.textContent='Введите целое число от 0 до 255.';return}
    setRgb(fields.map(input=>input.valueAsNumber),field);
  }));
  hex.addEventListener('input',()=>{
    if(!hex.validity.valid){error.textContent='Введите шесть шестнадцатеричных знаков.';return}
    setRgb(hexRgb('#'+hex.value.replace(/^#/,'')),hex);
  });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(form.reportValidity())closeRgbPicker(true);
  });
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeRgbPicker()});
  dialog.addEventListener('click',event=>{
    event.stopPropagation();
    const preset=event.target.closest('[data-rgb-preset]');
    if(preset)setRgb(hexRgb(preset.dataset.rgbPreset));
    if(event.target.closest('[data-rgb-cancel]'))closeRgbPicker();
  });
  document.body.appendChild(dialog);
  return {dialog,update,fields};
}

function openRgbPicker(input){
  if(rgbSession||input.matches(':disabled')||!input.getClientRects().length)return;
  rgbPicker??=createRgbDialog();
  const {dialog,fields,update}=rgbPicker;
  const channels=hexRgb(input.value);
  rgbSession={input,original:input.value,workspace:state.workspaceId,channels,hsv:rgbToHsv(channels,0)};
  const presets=(input.dataset.rgbPresets||'').split(',').map(c=>hexOr(c,'')).filter(Boolean);
  dialog.querySelector('.rgbPresets').innerHTML=presets.map(c=>
    `<button type="button" data-rgb-preset="${c}" style="background:${c}" title="${c}" aria-label="Цвет ${c}"></button>`).join('');
  update();
  dialog.showModal();
  fields[0].focus();
  fields[0].select();
}

window.addEventListener('keydown',event=>{
  if(rgbSession){
    if(event.key==='Escape'){
      event.preventDefault();
      event.stopImmediatePropagation();
      closeRgbPicker();
    }
    return;
  }
  if((event.key===' '||event.key==='Enter')&&event.target.matches?.('input[type="color"]')){
    event.preventDefault();
    event.stopImmediatePropagation();
    openRgbPicker(event.target);
  }
},true);
document.addEventListener('click',event=>{
  if(!event.target.matches?.('input[type="color"]'))return;
  event.preventDefault();
  event.stopPropagation();
  openRgbPicker(event.target);
},true);
