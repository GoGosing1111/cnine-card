(() => {
 'use strict';
 const mapped=value=>{try{const u=new URL(String(value||''),document.baseURI);if(u.origin!==location.origin||u.searchParams.has('original'))return value;return globalThis.CNineImageDeliveryMap?.map?.[u.pathname]||value;}catch{return value;}};
 globalThis.CNineImageDelivery=Object.freeze({url:mapped,version:'20261015-v1'});
 function image(img){
  if(!(img instanceof HTMLImageElement))return;
  const source=img.getAttribute('src'),next=source&&mapped(source);
  if(next&&next!==source){img.dataset.cnineOriginalSrc=source;img.src=next;}
  const set=img.getAttribute('srcset');if(set&&!set.includes('data:')){const optimized=set.split(',').map(part=>{const match=part.trim().match(/^(\S+)(.*)$/);return match?mapped(match[1])+match[2]:part;}).join(', ');if(optimized!==set){if(source&&!img.dataset.cnineOriginalSrc)img.dataset.cnineOriginalSrc=source;img.setAttribute('srcset',optimized);}}
 }
 const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')image(record.target);else for(const node of record.addedNodes)if(node.nodeType===1){image(node);node.querySelectorAll?.('img').forEach(image);}}});
 function start(){document.querySelectorAll('img').forEach(image);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','srcset']});}
 // A failed derivative falls back to its intact original exactly once.
 addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.dataset.cnineOriginalSrc){const original=img.dataset.cnineOriginalSrc;delete img.dataset.cnineOriginalSrc;const u=new URL(original,document.baseURI);u.searchParams.set('original','1');img.removeAttribute('srcset');img.src=u.href;}},true);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
