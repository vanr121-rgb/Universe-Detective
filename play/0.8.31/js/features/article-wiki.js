// Данные и разметка вики-статей. Инфошаблон вставляется как редактируемая копия.
'use strict';
const ARTICLE_BOX_LIMIT=12, ARTICLE_ROW_LIMIT=24, ARTICLE_IMAGE_LIMIT=16;
const ARTICLE_BOX_PLACES=[['aside','Сбоку в начале'],['top','Над текстом'],['inline','В тексте']];
const articleText=(value,max)=>String(value??'').slice(0,max);
function articleNormalizeExtras(article){
  const images=[],imageIds=new Set();
  for(const image of (Array.isArray(article.media)?article.media:[]).slice(0,ARTICLE_IMAGE_LIMIT)){
    if(!isRecord(image)||typeof image.id!=='string'||!image.id||imageIds.has(image.id))continue;
    imageIds.add(image.id);
    images.push({id:image.id,name:articleText(image.name,160),caption:articleText(image.caption,500),alt:articleText(image.alt,200)});
  }
  const boxes=articleNormalizeBoxes(article.infoboxes,ARTICLE_BOX_LIMIT).map(box=>({
    ...box,place:ARTICLE_BOX_PLACES.some(([key])=>key===box.place)?box.place:'aside',
    imageId:imageIds.has(box.imageId)?box.imageId:'',
  }));
  return {...(images.length?{media:images}:{}),...(boxes.length?{infoboxes:boxes}:{})};
}
function articleNormalizeBoxes(source,limit){
  const ids=new Set(),out=[];
  for(const box of (Array.isArray(source)?source:[]).slice(0,limit)){
    if(!isRecord(box))continue;
    let id=typeof box.id==='string'&&/^[\w-]{1,100}$/.test(box.id)?box.id:uid('infobox');
    if(ids.has(id))id=uid('infobox');
    ids.add(id);
    const rows=(Array.isArray(box.rows)?box.rows:[]).filter(isRecord).slice(0,ARTICLE_ROW_LIMIT)
      .map(row=>({label:articleText(row.label,100),value:articleText(row.value,1000)}))
      .filter(row=>row.label.trim()||row.value.trim());
    out.push({id,title:articleText(box.title,100).trim(),rows,place:box.place,imageId:box.imageId});
  }
  return out;
}
function articleNormalizeTemplates(source){
  return articleNormalizeBoxes(source,100).filter(box=>box.title).map(({id,title,rows})=>({id,title,rows}));
}
function articleFigureHtml(image,resolveImage=getMediaUrl){
  if(!image)return '';
  const url=resolveImage(image.id);
  if(!url)return '<div class="articleMissingImage">Изображение недоступно</div>';
  const alt=image.alt||image.caption||image.name||'Иллюстрация';
  return `<figure class="articleFigure"><a href="${escapeHtml(url)}" target="_blank" rel="noopener" data-article-picture title="Увеличить изображение">
    <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"></a>${image.caption?`<figcaption>${richTextHtml(image.caption)}</figcaption>`:''}</figure>`;
}
function articleBoxHtml(box,images,resolveImage){
  return `<aside class="articleInfoBox" aria-label="${escapeHtml(box.title||'Инфоблок')}">
    ${box.title?`<div class="articleInfoTitle">${escapeHtml(box.title)}</div>`:''}${articleFigureHtml(images.get(box.imageId),resolveImage)}
    ${box.rows.length?`<dl>${box.rows.map(row=>`<dt>${escapeHtml(row.label)}</dt><dd>${richTextHtml(row.value)}</dd>`).join('')}</dl>`:''}
  </aside>`;
}
function articleDocumentHtml(article,resolveImage=getMediaUrl){
  const figure=image=>articleFigureHtml(image,resolveImage);
  const images=new Map((article.media||[]).map(image=>[image.id,image]));
  const boxes=new Map((article.infoboxes||[]).map(box=>[box.id,box]));
  const placedImages=new Set([...boxes.values()].map(box=>box.imageId).filter(Boolean));
  const placedBoxes=new Set(),headings=[],blocks=[];
  let paragraph=[],list=[],listKind='';
  const flushParagraph=()=>{
    if(paragraph.length)blocks.push(`<p>${richTextHtml(paragraph.join('\n'))}</p>`);
    paragraph=[];
  };
  const flushList=()=>{
    if(list.length)blocks.push(`<${listKind}>${list.map(text=>`<li>${richTextHtml(text)}</li>`).join('')}</${listKind}>`);
    list=[];
  };
  for(const line of String(article.body||'').split(/\r?\n/)){
    const heading=line.match(/^\s*(#{1,4})\s+(.+?)\s*$/);
    const wikiHeading=line.match(/^\s*(={2,5})\s*(.*?)\s*\1\s*$/);
    const embed=line.trim().match(/^\{\{(image|infobox):([^{}]+)\}\}$/);
    const item=line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
    if(heading||wikiHeading){
      flushParagraph();flushList();
      const label=(heading||wikiHeading)[2],level=heading?Math.min(5,heading[1].length+1):Math.min(5,wikiHeading[1].length);
      const index=headings.length;
      headings.push({label,level});
      blocks.push(`<h${level} tabindex="-1" data-article-heading="${index}">${richTextHtml(label)}</h${level}>`);
    }else if(embed){
      flushParagraph();flushList();
      const [,kind,id]=embed;
      if(kind==='image'&&images.has(id)&&!placedImages.has(id)){placedImages.add(id);blocks.push(figure(images.get(id)))}
      if(kind==='infobox'&&boxes.get(id)?.place==='inline'&&!placedBoxes.has(id)){placedBoxes.add(id);blocks.push(articleBoxHtml(boxes.get(id),images,resolveImage))}
    }else if(item){
      flushParagraph();
      const kind=item[2]?'ol':'ul';
      if(kind!==listKind)flushList();
      listKind=kind;list.push(item[3]);
    }else{
      flushList();
      if(line.trim())paragraph.push(line);
      else flushParagraph();
    }
  }
  flushParagraph();flushList();
  const toc=headings.length>1?`<details class="articleContents" open><summary>Оглавление</summary><nav aria-label="Оглавление">${headings.map(({label,level},i)=>`<button type="button" class="linkBtn" data-article-jump="${i}" style="--article-depth:${Math.max(0,level-2)}">${escapeHtml(plainExcerpt(label,140))}</button>`).join('')}</nav></details>`:'';
  const top=[...boxes.values()].filter(box=>box.place==='top').map(box=>articleBoxHtml(box,images,resolveImage)).join('');
  const aside=[...boxes.values()].filter(box=>box.place==='aside').map(box=>articleBoxHtml(box,images,resolveImage)).join('');
  const unplaced=[...boxes.values()].filter(box=>box.place==='inline'&&!placedBoxes.has(box.id)).map(box=>articleBoxHtml(box,images,resolveImage)).join('');
  const gallery=[...images.values()].filter(image=>!placedImages.has(image.id)).map(figure).join('');
  return `${top}<div class="articleReadingGrid${aside?' withInfo':''}"><div class="articleProse">${toc}${blocks.join('')}${unplaced}</div>${aside?`<div class="articleInfoRail">${aside}</div>`:''}</div>
    ${gallery?`<section class="articleGallery"><h3>Галерея</h3><div>${gallery}</div></section>`:''}`;
}
function articleInsertText(input,text){
  const start=input.selectionStart,end=input.selectionEnd;
  if(input.maxLength>=0&&input.value.length-(end-start)+text.length>input.maxLength){toast('Достигнут предел длины статьи','err');return false}
  input.setRangeText(text,start,end,'end');
  input.focus();
  return true;
}
function articleBoxRowsHtml(rows){
  return rows.map(row=>`<div class="articleBoxRow"><input aria-label="Название поля" maxlength="100" value="${escapeHtml(row.label)}" placeholder="Поле">
    <input aria-label="Значение поля" maxlength="1000" value="${escapeHtml(row.value)}" placeholder="Значение"><button type="button" class="iconBtn" data-art-row-remove aria-label="Удалить поле">×</button></div>`).join('');
}
function articleWikiEditorHtml(draft){
  return `<div class="articleMarkup"><button type="button" class="btn tiny" data-art-markup="heading">Заголовок</button><button type="button" class="btn tiny" data-art-markup="list">Список</button>
    <button type="button" class="btn tiny" data-art-markup="link" aria-expanded="false">Вики-ссылка</button></div>
    <div id="artWikiTarget" class="articleEditActions" hidden>
      <select id="artWikiTargetKind" aria-label="Куда ведёт ссылка"><option value="entity">К бумажке</option><option value="article">К статье</option></select>
      <input id="artWikiTargetSearch" type="search" aria-label="Найти цель ссылки" placeholder="Найти по названию…">
      <select id="artWikiTargetId" aria-label="Цель ссылки"></select>
      <button type="button" class="btn tiny" data-art-link-insert>Вставить ссылку</button>
    </div>
    <textarea id="artBody" data-wiki rows="10" maxlength="200000">${escapeHtml(draft.body)}</textarea>
    <details id="artPreview"><summary>Предпросмотр</summary><div class="articleBody" id="artPreviewContent"></div></details>`;
}
function articleExtrasEditorHtml(templates,canManageTemplates){
  const options=templates.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`).join('');
  return `<div class="articleExtras">
    <details id="artBoxesPane"><summary>${canManageTemplates?'Инфоблоки и шаблоны':'Инфоблоки'}</summary>
      <div class="articleEditActions"><button type="button" class="btn" id="artBoxAdd">＋ Инфоблок</button>${canManageTemplates?`<select id="artTemplate" aria-label="Инфошаблон"><option value="">Выберите шаблон</option>${options}</select><button type="button" class="btn" id="artTemplateInsert" disabled>Вставить</button><button type="button" class="btn danger" id="artTemplateRemove" disabled>Удалить шаблон</button>`:''}</div>
      <div id="artBoxes"></div></details>
    <details id="artImagesPane"><summary>Изображения</summary><label class="articleFileLabel" for="artImageFiles">Добавить изображения</label>
      <input type="file" id="artImageFiles" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,image/avif,image/x-icon,.ico">
      <div id="artImages"></div></details></div>`;
}
function bindArticleWikiEditor(draft,templates){
  const modal=$('#modalBody'),body=$('#artBody'),files=$('#artImageFiles');
  const templateSelect=$('#artTemplate');
  const pending=new Map();
  const images=draft.media||[],boxes=draft.infoboxes||[];
  const templatesOriginal=clone(templates);
  let active=true,busy=false,linkSelection=null;
  const linkPanel=$('#artWikiTarget'),linkKind=$('#artWikiTargetKind'),linkSearch=$('#artWikiTargetSearch'),linkId=$('#artWikiTargetId');
  function renderLinkTargets(){
    const query=searchFold(linkSearch.value.trim()),articles=linkKind.value==='article';
    const named=articles?wsArticles().filter(a=>!a.hint&&a.id!==draft.id).map(a=>[a.id,a.title,getEntity(a.primaryFor)?.name||getArticle(a.parentId)?.title||'']):
      data.entities.filter(e=>!e.hint).map(e=>[e.id,e.name,[getET(e.type).name,getEntity(containmentParent(e.id))?.name].filter(Boolean).join(' · ')]);
    const options=named.filter(([,name,place])=>searchFold(name+' '+place).includes(query)).sort((a,b)=>a[1].localeCompare(b[1],'ru')).slice(0,150);
    linkId.innerHTML=options.map(([id,name,place])=>`<option value="${escapeHtml(id)}">${escapeHtml(name+(place?' · '+place:''))}</option>`).join('')||'<option value="">Ничего не найдено</option>';
    linkPanel.querySelector('[data-art-link-insert]').disabled=!options.length;
  }
  linkKind.onchange=linkSearch.oninput=renderLinkTargets;
  const readBoxes=()=>[...modal.querySelectorAll('[data-art-box]')].map(el=>({
    id:el.dataset.artBox,title:el.querySelector('.articleBoxName').value,place:el.querySelector('.articleBoxPlace').value,
    imageId:el.querySelector('.articleBoxImage').value,
    rows:[...el.querySelectorAll('.articleBoxRow')].map(row=>({label:row.children[0].value,value:row.children[1].value})),
  }));
  const refreshTemplates=(id='')=>{
    templateSelect.innerHTML='<option value="">Выберите шаблон</option>'+templates.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</option>`).join('');
    templateSelect.value=id;
    templateSelect.onchange();
  };
  const redrawBoxes=()=>{
    const imageOptions=images.map(image=>[image.id,image.caption||image.name]);
    $('#artBoxes').innerHTML=boxes.map(box=>`<fieldset data-art-box="${escapeHtml(box.id)}"><legend>Инфоблок</legend>
      <div class="articleEditActions"><input class="articleBoxName" aria-label="Заголовок инфоблока" placeholder="Заголовок" maxlength="100" value="${escapeHtml(box.title)}">
        <select class="articleBoxPlace" aria-label="Положение инфоблока">${ARTICLE_BOX_PLACES.map(([id,label])=>`<option value="${id}" ${id===box.place?'selected':''}>${label}</option>`).join('')}</select>
        <select class="articleBoxImage" aria-label="Изображение инфоблока"><option value="">Без изображения</option>${imageOptions.map(([id,label])=>`<option value="${escapeHtml(id)}" ${id===box.imageId?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></div>
      <div class="articleBoxRows">${articleBoxRowsHtml(box.rows)}</div>
      <div class="articleEditActions"><button type="button" class="btn tiny" data-art-add-row>＋ Поле</button><button type="button" class="btn tiny" data-art-box-inline>Вставить в текст</button>
        ${templateSelect?'<button type="button" class="btn tiny" data-art-save-template>Сохранить как шаблон</button>':''}<button type="button" class="btn tiny danger" data-art-remove-box>Убрать блок</button></div>
      </fieldset>`).join('');
  };
  const redrawImages=()=>{
    $('#artImages').innerHTML=images.map(image=>{
      const url=pending.get(image.id)?.dataUrl||getMediaUrl(image.id);
      return `<div class="articleImageRow" data-art-image="${escapeHtml(image.id)}">${url?`<img src="${escapeHtml(url)}" alt="">`:''}<div><b>${escapeHtml(image.name)}</b>
        <input class="articleImageCaption" aria-label="Подпись изображения" placeholder="Подпись" maxlength="500" value="${escapeHtml(image.caption)}">
        <input class="articleImageAlt" aria-label="Описание изображения" placeholder="Описание для чтения с экрана" maxlength="200" value="${escapeHtml(image.alt)}">
        <div class="articleEditActions"><button type="button" class="btn tiny" data-art-image-inline>Вставить в текст</button>
        <button type="button" class="btn tiny danger" data-art-remove-image>Убрать</button></div></div></div>`;
    }).join('');
  };
  const syncBoxes=()=>boxes.splice(0,boxes.length,...readBoxes());
  const insertToken=(kind,id)=>{
    articleInsertText(body,`\n\n{{${kind}:${id}}}\n\n`);
    body.scrollIntoView({block:'nearest'});
  };
  const preview=$('#artPreview'),previewContent=$('#artPreviewContent');
  preview.addEventListener('toggle',()=>{
    if(preview.open)previewContent.innerHTML=articleDocumentHtml({...(files?articleNormalizeExtras({media:images,infoboxes:readBoxes()}):draft),body:body.value},
      id=>pending.get(id)?.dataUrl||getMediaUrl(id))||'<div class="empty">Добавьте текст или изображения.</div>';
  });
  const events=new AbortController();
  modal.addEventListener('click',event=>{
    if(event.target.closest('#artPreviewContent')){event.preventDefault();event.stopPropagation();return}
    const button=event.target.closest('button');
    if(!button)return;
    const markup=button.dataset.artMarkup;
    if(markup==='link'){
      linkPanel.hidden=!linkPanel.hidden;
      button.setAttribute('aria-expanded',String(!linkPanel.hidden));
      if(!linkPanel.hidden){linkSelection=[body.selectionStart,body.selectionEnd];renderLinkTargets();linkSearch.focus()}
      return;
    }
    if(button.hasAttribute('data-art-link-insert')){
      const id=linkId.value;
      if(!id||!linkSelection)return;
      const [start,end]=linkSelection;
      const label=body.value.slice(start,end).replace(/[\[\]|\n]/g,' ').trim().slice(0,110);
      const prefix=linkKind.value==='article'?'статья-id:':'карточка:';
      body.setSelectionRange(start,end);
      articleInsertText(body,`[[${prefix}${id}${label?'|'+label:''}]]`);
      linkPanel.hidden=true;
      modal.querySelector('[data-art-markup="link"]').setAttribute('aria-expanded','false');
      body.dispatchEvent(new Event('input',{bubbles:true}));
      return;
    }
    if(markup){
      const text=body.value.slice(body.selectionStart,body.selectionEnd);
      articleInsertText(body,markup==='heading'?`\n\n## ${text||'Раздел'}\n\n`:markup==='list'?`\n${(text||'Пункт').split('\n').map(line=>'- '+line).join('\n')}\n`:`[[${text||'Название'}]]`);
      return;
    }
    if(!files)return;
    const box=button.closest('[data-art-box]'),image=button.closest('[data-art-image]');
    const action=attribute=>button.hasAttribute('data-art-'+attribute);
    if(action('row-remove'))button.closest('.articleBoxRow').remove();
    if(action('add-row')&&box.querySelectorAll('.articleBoxRow').length<ARTICLE_ROW_LIMIT){
      box.querySelector('.articleBoxRows').insertAdjacentHTML('beforeend',articleBoxRowsHtml([{label:'',value:''}]));
      box.querySelector('.articleBoxRow:last-child input').focus();
    }
    if(action('box-inline')){box.querySelector('.articleBoxPlace').value='inline';insertToken('infobox',box.dataset.artBox)}
    if(action('remove-box')){
      body.value=body.value.replaceAll(`{{infobox:${box.dataset.artBox}}}`,'');
      box.remove();syncBoxes();
    }
    if(templateSelect&&action('save-template')){
      const source=readBoxes().find(x=>x.id===box.dataset.artBox);
      const title=source.title.trim();
      if(!title){toast('Введите заголовок шаблона','err');return}
      if(templates.some(t=>articleNorm(t.title)===articleNorm(title))){toast('Шаблон с таким названием уже есть','err');return}
      if(templates.length>=100){toast('Достигнут предел в 100 шаблонов','err');return}
      const id=uid('art-template');
      templates.push({id,title,rows:source.rows});
      refreshTemplates(id);
      toast('Шаблон добавлен в черновик. Сохраните статью.','ok');
    }
    if(action('image-inline'))insertToken('image',image.dataset.artImage);
    if(action('remove-image')){
      const id=image.dataset.artImage;
      images.splice(images.findIndex(x=>x.id===id),1);pending.delete(id);
      body.value=body.value.replaceAll(`{{image:${id}}}`,'');
      syncBoxes();redrawBoxes();redrawImages();
    }
  },{signal:events.signal});
  if(files){
    const addBox=template=>{
      syncBoxes();
      if(boxes.length>=ARTICLE_BOX_LIMIT){toast(`Не больше ${ARTICLE_BOX_LIMIT} инфоблоков в статье`,'err');return}
      boxes.push({id:uid('infobox'),title:template?.title||'',place:'aside',imageId:'',rows:clone(template?.rows||[{label:'',value:''}])});
      redrawBoxes();
      $('#artBoxes fieldset:last-child .articleBoxName').focus();
    };
    $('#artBoxAdd').onclick=()=>addBox();
    if(templateSelect){
      templateSelect.onchange=()=>{for(const id of ['artTemplateInsert','artTemplateRemove'])$('#'+id).disabled=!templateSelect.value};
      $('#artTemplateInsert').onclick=()=>addBox(templates.find(t=>t.id===templateSelect.value));
      $('#artTemplateRemove').onclick=()=>{
        const i=templates.findIndex(t=>t.id===templateSelect.value);
        if(i<0||!confirm(`Удалить шаблон «${templates[i].title}»? Размещённые инфоблоки сохранятся.`))return;
        templates.splice(i,1);refreshTemplates();
      };
    }
    $('#artImages').addEventListener('input',event=>{
      const image=images.find(x=>x.id===event.target.closest('[data-art-image]')?.dataset.artImage);
      if(!image)return;
      if(event.target.matches('.articleImageCaption'))image.caption=event.target.value;
      if(event.target.matches('.articleImageAlt'))image.alt=event.target.value;
    });
    files.onchange=async()=>{
      if(busy)return;
      const selected=[...files.files];files.value='';
      if(images.length+selected.length>ARTICLE_IMAGE_LIMIT){toast(`Не больше ${ARTICLE_IMAGE_LIMIT} изображений в статье`,'err');return}
      busy=true;files.disabled=true;$('#artSave').disabled=true;
      try{
        for(const file of selected){
          try{
            const meta=newMediaMeta(await processImageFile(file,{maxDim:1600}),null);
            if(!active)return;
            images.push({id:meta.id,name:meta.name,alt:meta.alt,caption:''});pending.set(meta.id,meta);
          }catch(error){if(active)toast(`${file.name}: ${error.message}`,'err')}
        }
      }finally{
        busy=false;
        if(active){files.disabled=false;$('#artSave').disabled=false;syncBoxes();redrawBoxes();redrawImages()}
      }
    };
    redrawBoxes();redrawImages();
  }
  activeModalCleanup=()=>{active=false;events.abort();pending.clear()};
  return {
    read:()=>files?articleNormalizeExtras({media:images,infoboxes:readBoxes()}):null,
    pending, templates, templatesOriginal, busy:()=>busy,
  };
}
