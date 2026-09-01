/* Apocalypse presentation guard: decorate only an actual Apocalypse hunt. */
(()=>{
  function sync(){
    const active=typeof window.selectedPveIsApocalypse==='function'&&window.selectedPveIsApocalypse();
    document.querySelectorAll('.battle-v3-live-shell[data-v3-field="HUNT"]').forEach(shell=>shell.classList.toggle('apocalypse-battle-field',Boolean(active)));
  }
  const observer=new MutationObserver(sync);
  function mount(){const root=document.getElementById('app')||document.body;observer.observe(root,{childList:true,subtree:true});document.addEventListener('click',event=>{if(event.target.closest?.('[data-monster-tab],[data-monster],[data-pve-start-button]'))queueMicrotask(sync)},true);sync()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
