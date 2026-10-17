// Embedded pages scroll with the game shell. Measuring the content root avoids
// viewport-sized scrollHeight feedback and fractional-height scrollbar changes.
export function isOrganizationEmbedded(){
 try{return window.parent!==window&&parent.location.origin===location.origin;}catch{return false;}
}
export function observeOrganizationHeight(root,type){
 if(!isOrganizationEmbedded())return ()=>{};
 document.documentElement.classList.add('org-embedded');
 let queued=0,last=0,closed=false;
 const measure=()=>{
  if(queued||closed)return;
  queued=requestAnimationFrame(()=>{
   queued=0;if(closed||!root.isConnected)return;
   const height=Math.ceil(root.getBoundingClientRect().bottom+window.scrollY)+1;
   if(height>0&&height!==last){last=height;parent.postMessage({type,height},location.origin);}
  });
 };
 const observer=new ResizeObserver(measure);observer.observe(root);
 window.addEventListener('resize',measure,{passive:true});
 const close=()=>{closed=true;observer.disconnect();cancelAnimationFrame(queued);window.removeEventListener('resize',measure);window.removeEventListener('pagehide',close);};
 window.addEventListener('pagehide',close,{once:true});
 document.fonts.ready.then(measure);measure();
 return close;
}
