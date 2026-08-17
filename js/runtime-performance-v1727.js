(()=>{
  if(window.CNineRuntime)return;
  const transientCleanups=new Set(),metrics={longTasks:[],routeRenders:[]};
  const observed=new WeakSet();
  const targetSelector='.dex-section,.pve-grade-group,.pvp-grade-group,.card-frame,.high-grade-feed,.inventory-section,video,canvas';

  function registerCleanup(callback){
    if(typeof callback!=='function')return()=>{};
    transientCleanups.add(callback);
    return()=>transientCleanups.delete(callback);
  }
  function runCleanups(reason='manual'){
    [...transientCleanups].forEach(callback=>{try{callback(reason)}catch(error){console.warn('Runtime cleanup failed',error)}});
    transientCleanups.clear();
  }
  function pauseMedia(root=document){
    root.querySelectorAll?.('video,audio').forEach(media=>{
      if(media.paused)return;
      media.dataset.runtimeWasPlaying='1';
      try{media.pause()}catch(_){}
    });
  }

  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const node=entry.target,offscreen=!entry.isIntersecting;
      node.classList.toggle('runtime-offscreen',offscreen);
      if(node instanceof HTMLVideoElement){
        if(offscreen&&!node.paused){node.dataset.runtimeWasPlaying='1';node.pause()}
        else if(!offscreen&&node.dataset.runtimeWasPlaying==='1'&&!document.hidden){delete node.dataset.runtimeWasPlaying;node.play().catch(()=>{})}
      }
      if(node instanceof HTMLCanvasElement){
        try{node.dispatchEvent(new CustomEvent(offscreen?'cnine:canvas-suspend':'cnine:canvas-resume'))}catch(_){}
      }
    });
  },{rootMargin:'240px 0px'}):null;

  function observe(root=document){
    if(!observer)return;
    const candidates=[];
    if(root instanceof Element&&root.matches(targetSelector))candidates.push(root);
    root.querySelectorAll?.(targetSelector).forEach(node=>candidates.push(node));
    candidates.forEach(node=>{if(observed.has(node))return;observed.add(node);observer.observe(node)});
  }

  window.CNineRuntime={registerCleanup,runCleanups,pauseMedia,observe,metrics};
  window.addEventListener('cnine:route-will-change',()=>runCleanups('route'));
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){pauseMedia();runCleanups('hidden')}
    else observe(document);
  });
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)observe(node)}))).observe(document.body,{childList:true,subtree:true});
  observe(document);

  try{
    new PerformanceObserver(list=>{
      list.getEntries().forEach(entry=>metrics.longTasks.push({at:Math.round(entry.startTime),duration:Math.round(entry.duration)}));
      if(metrics.longTasks.length>40)metrics.longTasks.splice(0,metrics.longTasks.length-40);
    }).observe({type:'longtask',buffered:true});
  }catch(_){}
  try{
    new PerformanceObserver(list=>{
      list.getEntries().filter(entry=>entry.name==='cnine-route-render').forEach(entry=>metrics.routeRenders.push({at:Math.round(entry.startTime),duration:Number(entry.duration.toFixed(2)),detail:entry.detail||null}));
      if(metrics.routeRenders.length>40)metrics.routeRenders.splice(0,metrics.routeRenders.length-40);
    }).observe({type:'measure',buffered:true});
  }catch(_){}
})();
