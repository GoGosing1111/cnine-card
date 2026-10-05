/* Apocalypse presentation guard: decorate only an actual Apocalypse hunt. */
(()=>{
  let recovery;import('./apocalypse-challenge-v1.mjs?v=20261006-foreground').then(module=>{recovery=module;sync()}).catch(error=>console.warn('아포칼립스 전투 기록을 준비하지 못했습니다.',error));
  function sync(){
    recovery?.mountRecovery(document);
    const active=typeof window.selectedPveIsApocalypse==='function'&&window.selectedPveIsApocalypse();
    document.querySelectorAll('.battle-v3-live-shell[data-v3-field="HUNT"]').forEach(shell=>shell.classList.toggle('apocalypse-battle-field',Boolean(active)));
  }
  const observer=new MutationObserver(sync);
  function mount(){const root=document.getElementById('app')||document.body;observer.observe(root,{childList:true,subtree:true});document.addEventListener('click',event=>{if(event.target.closest?.('[data-monster-tab],[data-monster],[data-pve-start-button]'))queueMicrotask(sync)},true);sync()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
