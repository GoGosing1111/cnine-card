(() => {
  'use strict';
  const FRAME='../assets/ui/card-frames/zenith-frame-concept-v2.png';
  function ensureZenithOptions(){
    const filter=document.querySelector('#grade');
    if(filter&&![...filter.options].some(o=>o.value==='ZENITH'))filter.add(new Option('ZENITH','ZENITH'),filter.options[1]||null);
    const grade=document.querySelector('#cardGrade');
    if(grade&&![...grade.options].some(o=>o.value==='ZENITH'))grade.add(new Option('ZENITH','ZENITH'),grade.options[0]||null);
    const breakthrough=document.querySelector('#breakthroughGrade');
    if(breakthrough&&![...breakthrough.options].some(o=>o.value==='ZENITH'))breakthrough.add(new Option('ZENITH','ZENITH'));
    const battleGrid=document.querySelector('#battleGradePower');
    if(battleGrid&&battleGrid.children.length&&!battleGrid.querySelector('[data-grade="ZENITH"]')){
      const label=document.createElement('label');label.className='field';label.innerHTML='<span>ZENITH 기본 전투력</span><input class="battleGradeInput" data-grade="ZENITH" type="number" min="0" value="5500">';battleGrid.append(label);
    }
  }
  function enhanceCardEditor(card){
    const isZenith=card.querySelector('.rarity')?.value==='ZENITH';
    card.classList.toggle('zenithAdminCard',isZenith);
    const thumb=card.querySelector('.cardThumbWrap');let frame=thumb?.querySelector('.zenithAdminFrame');
    if(isZenith&&thumb&&!frame){frame=document.createElement('img');frame.className='zenithAdminFrame';frame.src=FRAME;frame.alt='';frame.setAttribute('aria-hidden','true');thumb.append(frame)}
    else if(!isZenith)frame?.remove();
    let field=card.querySelector('.cardPowerTypeField');
    if(isZenith&&!field){field=document.createElement('label');field.className='field cardPowerTypeField zenithPowerField';field.innerHTML='<span>전투력 유형</span><select class="powerType" disabled><option value="FIXED" selected>기본형 · 5,500</option></select><small class="powerPreview">기본 전투력 5,500</small>';card.querySelector('.weight')?.closest('.row')?.before(field)}
    else if(!isZenith&&field?.classList.contains('zenithPowerField'))field.remove();
  }
  function enhancePackCard(article){
    if(!article.querySelector('.cmsGrade.ZENITH')||article.classList.contains('cmsZenithCard'))return;
    const art=[...article.children].find(node=>node.tagName==='IMG');if(!art)return;
    const visual=document.createElement('div');visual.className='cmsZenithVisual';article.insertBefore(visual,art);visual.append(art);
    const frame=document.createElement('img');frame.className='cmsZenithFrame';frame.src=FRAME;frame.alt='';frame.setAttribute('aria-hidden','true');visual.append(frame);article.classList.add('cmsZenithCard');
  }
  function enhance(root=document){ensureZenithOptions();if(root.matches?.('.adminCard'))enhanceCardEditor(root);root.querySelectorAll?.('.adminCard').forEach(enhanceCardEditor);if(root.matches?.('.cmsNewCardGrid article'))enhancePackCard(root);root.querySelectorAll?.('.cmsNewCardGrid article').forEach(enhancePackCard)}
  document.addEventListener('change',event=>{if(event.target.matches('.adminCard .rarity'))enhanceCardEditor(event.target.closest('.adminCard'))});
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)enhance(node)})));
  const start=()=>{enhance();observer.observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
