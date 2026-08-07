(() => {
  'use strict';
  const normalize=value=>String(value||'').trim().replace(/\\/g,'/');
  function repair(root=document){
    const images=[];if(root.matches?.('img'))images.push(root);root.querySelectorAll?.('img').forEach(image=>images.push(image));
    images.forEach(image=>{const raw=image.getAttribute('src')||'';const fixed=normalize(raw);if(raw!==fixed)image.setAttribute('src',fixed)});
    const inputs=[];if(root.matches?.('.image,.pImage,#cardImage'))inputs.push(root);root.querySelectorAll?.('.image,.pImage,#cardImage').forEach(input=>inputs.push(input));
    inputs.forEach(input=>{const fixed=normalize(input.value);if(input.value!==fixed)input.value=fixed});
  }
  document.addEventListener('input',event=>{if(event.target.matches('.image,.pImage,#cardImage'))event.target.value=normalize(event.target.value)});
  document.addEventListener('click',()=>repair(),true);
  const start=()=>{repair();new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.ELEMENT_NODE)repair(node)}))).observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
