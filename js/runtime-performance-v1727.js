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
    if(root instanceof Element&&!root.isConnected)return;
    const candidates=[];
    if(root instanceof Element&&root.matches(targetSelector))candidates.push(root);
    root.querySelectorAll?.(targetSelector).forEach(node=>candidates.push(node));
    candidates.forEach(node=>{if(observed.has(node))return;observed.add(node);observer.observe(node)});
  }

  function outerRoots(nodes){
    return [...nodes].filter(node=>{
      for(let parent=node.parentElement;parent;parent=parent.parentElement)if(nodes.has(parent))return false;
      return true;
    });
  }
  function unobserve(root){
    if(!observer||root.isConnected)return;
    // A removed card may no longer match its original selector. Visit the
    // detached subtree, including registered descendants whose classes changed.
    const release=node=>{if(observed.delete(node))observer.unobserve(node)};
    release(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
    while(walker.nextNode())release(walker.currentNode);
  }
  function observeChanges(records){
    const added=new Set(),removed=new Set();
    for(const record of records){
      for(const node of record.removedNodes)if(node.nodeType===1&&!node.isConnected)removed.add(node);
      for(const node of record.addedNodes)if(node.nodeType===1&&node.isConnected)added.add(node);
    }
    // Keep moves within the live page observed, and scan nested additions once.
    outerRoots(removed).forEach(unobserve);
    outerRoots(added).forEach(observe);
  }

  window.CNineRuntime={registerCleanup,runCleanups,pauseMedia,observe,metrics};
  window.addEventListener('cnine:route-will-change',()=>runCleanups('route'));
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){pauseMedia();runCleanups('hidden')}
    else observe(document);
  });
  new MutationObserver(observeChanges).observe(document.body,{childList:true,subtree:true});
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
