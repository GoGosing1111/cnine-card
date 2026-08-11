(() => {
  'use strict';
  const normalize=value=>String(value||'').trim().replace(/\\/g,'/');
  const isCardImage=image=>image.matches('.pendingCard > img,.cardThumbWrap > img:not(.zenithAdminFrame):not(.fakerAdminFrame):not(.fakerAdminT1Mark):not(.fakerAdminSignature),.previewCardPicker img,.cmsNewCardGrid img:not(.cmsZenithFrame):not(.cmsFakerFrame):not(.cmsFakerT1Mark):not(.cmsFakerSignature)');
  function retry(image){
    if(!isCardImage(image)||image.dataset.cmsImageRetried==='1')return;
    image.dataset.cmsImageRetried='1';
    const url=new URL(normalize(image.getAttribute('src')||image.src),location.href);url.searchParams.set('_imgretry',String(Date.now()));image.src=url.href;
  }
  function repair(root=document){
    const images=[];if(root.matches?.('img'))images.push(root);root.querySelectorAll?.('img').forEach(image=>images.push(image));
    images.forEach(image=>{const raw=image.getAttribute('src')||'';const fixed=normalize(raw);if(raw!==fixed)image.setAttribute('src',fixed);if(isCardImage(image)){image.addEventListener('error',()=>retry(image),{once:true});if(image.complete&&image.naturalWidth===0)retry(image)}});
    const inputs=[];if(root.matches?.('.image,.pImage,#cardImage'))inputs.push(root);root.querySelectorAll?.('.image,.pImage,#cardImage').forEach(input=>inputs.push(input));
    inputs.forEach(input=>{const fixed=normalize(input.value);if(input.value!==fixed)input.value=fixed});
  }
  document.addEventListener('input',event=>{if(event.target.matches('.image,.pImage,#cardImage'))event.target.value=normalize(event.target.value)});
  document.addEventListener('click',()=>repair(),true);
  const start=()=>{repair();setTimeout(()=>repair(),500);new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)repair(node)}))).observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
