(() => {
  'use strict';
  const CARD_ID='CN-0B48C6FF8F9B4AC5';
  const FRAME='../assets/ui/card-frames/faker-championship-frame-v1.png';
  function enhanceCardEditor(card){
    const active=String(card?.dataset?.id||'')===CARD_ID;
    card?.classList.toggle('fakerAdminCard',active);
    const thumb=card?.querySelector('.cardThumbWrap');
    let frame=thumb?.querySelector('.fakerAdminFrame');
    if(active&&thumb&&!frame){frame=document.createElement('img');frame.className='fakerAdminFrame';frame.src=FRAME;frame.alt='';frame.setAttribute('aria-hidden','true');thumb.append(frame)}
    else if(!active)frame?.remove();
  }
  function enhancePackCard(article){
    if(String(article?.dataset?.cardId||'')!==CARD_ID||article.classList.contains('cmsFakerCard'))return;
    const art=[...article.children].find(node=>node.tagName==='IMG');if(!art)return;
    const visual=document.createElement('div');visual.className='cmsFakerVisual';article.insertBefore(visual,art);visual.append(art);
    const frame=document.createElement('img');frame.className='cmsFakerFrame';frame.src=FRAME;frame.alt='';frame.setAttribute('aria-hidden','true');visual.append(frame);article.classList.add('cmsFakerCard');
  }
  function enhance(root=document){
    if(root.matches?.('.adminCard'))enhanceCardEditor(root);
    root.querySelectorAll?.('.adminCard').forEach(enhanceCardEditor);
    if(root.matches?.('.cmsNewCardGrid article'))enhancePackCard(root);
    root.querySelectorAll?.('.cmsNewCardGrid article').forEach(enhancePackCard);
  }
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)enhance(node)})));
  const start=()=>{enhance();observer.observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
