(() => {
  'use strict';
  const CARD_ID='CN-0B48C6FF8F9B4AC5';
  const FRAME='../assets/ui/card-frames/faker-t1-championship-frame-v2.png';
  const T1_LOGO='../assets/ui/brands/t1-logo-red-official-cropped.png';
  const SIGNATURE='../assets/ui/card-frames/faker-wordmark-clear-v2.svg';
  function imageLayer(className,src,alt=''){
    const image=document.createElement('img');image.className=className;image.src=src;image.alt=alt;if(!alt)image.setAttribute('aria-hidden','true');return image;
  }
  function addBrandLayers(root,prefix){
    root.append(imageLayer(`${prefix}Frame`,FRAME));
    root.append(imageLayer(`${prefix}T1Mark`,T1_LOGO,'T1'));
    root.append(imageLayer(`${prefix}Signature`,SIGNATURE,'FAKER'));
    const subtitle=document.createElement('span');subtitle.className=`${prefix}Subtitle`;subtitle.textContent='THE UNKILLABLE DEMON KING';root.append(subtitle);
  }
  function enhanceCardEditor(card){
    const active=String(card?.dataset?.id||'')===CARD_ID;
    card?.classList.toggle('fakerAdminCard',active);
    const thumb=card?.querySelector('.cardThumbWrap');
    let frame=thumb?.querySelector('.fakerAdminFrame');
    if(active&&thumb&&!frame)addBrandLayers(thumb,'fakerAdmin');
    else if(!active)thumb?.querySelectorAll('[class^="fakerAdmin"]').forEach(node=>node.remove());
  }
  function enhancePackCard(article){
    if(String(article?.dataset?.cardId||'')!==CARD_ID||article.classList.contains('cmsFakerCard'))return;
    const art=[...article.children].find(node=>node.tagName==='IMG');if(!art)return;
    const visual=document.createElement('div');visual.className='cmsFakerVisual';article.insertBefore(visual,art);visual.append(art);
    addBrandLayers(visual,'cmsFaker');article.classList.add('cmsFakerCard');
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
