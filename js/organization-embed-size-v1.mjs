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

// An auto-height iframe can be much taller than the visible game viewport.
// Native dialog centering otherwise places its confirmation buttons offscreen.
export function fitOrganizationDialog(dialog){
 if(!isOrganizationEmbedded())return ()=>{};
 const host=window.parent,frame=window.frameElement;if(!frame)return ()=>{};
 let queued=0,closed=false;
 const place=()=>{
  queued=0;if(closed||!dialog.open||!dialog.isConnected)return;
  const rect=frame.getBoundingClientRect(),viewport=host.visualViewport;
  const header=host.document.querySelector('.v21-route-command-head')?.getBoundingClientRect();
  const hostTop=Math.max(viewport?.offsetTop||0,header&&header.bottom>0&&header.top<(viewport?.height||host.innerHeight)?header.bottom:0);
  const top=Math.max(0,hostTop-rect.top),bottom=Math.min(innerHeight,(viewport?.offsetTop||0)+(viewport?.height||host.innerHeight)-rect.top);
  const available=Math.max(1,bottom-top-32),maxHeight=available+'px';
  if(dialog.style.maxHeight!==maxHeight)dialog.style.maxHeight=maxHeight;
  const y=Math.max(top+16,top+(bottom-top-dialog.getBoundingClientRect().height)/2)+'px';
  if(dialog.style.top!==y)dialog.style.top=y;
 };
 const schedule=()=>{if(!queued&&!closed)queued=requestAnimationFrame(place);};
 Object.assign(dialog.style,{position:'fixed',inset:'auto',left:'50%',margin:'0',transform:'translateX(-50%)'});
 const observer=new ResizeObserver(schedule);observer.observe(dialog);
 host.addEventListener('scroll',schedule,{capture:true,passive:true});host.addEventListener('resize',schedule,{passive:true});
 host.visualViewport?.addEventListener('resize',schedule,{passive:true});host.visualViewport?.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',schedule,{passive:true});
 const close=()=>{if(closed)return;closed=true;cancelAnimationFrame(queued);observer.disconnect();host.removeEventListener('scroll',schedule,true);host.removeEventListener('resize',schedule);host.visualViewport?.removeEventListener('resize',schedule);host.visualViewport?.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);window.removeEventListener('pagehide',close);dialog.removeEventListener('close',close);};
 dialog.addEventListener('close',close,{once:true});window.addEventListener('pagehide',close,{once:true});place();return close;
}
