/* Runtime-only Nightmare presentation. Existing monster artwork is never replaced. */
(()=>{
  const currentTab=()=>{try{return String(JSON.parse(localStorage.getItem('cnine_pve_monster_filter')||'{}').tab||'NORMAL').toUpperCase()}catch{return 'NORMAL'}};
  const nightmareSelected=()=>currentTab()==='NIGHTMARE';
  function decorateBrowser(){
    const root=document.querySelector('#battleMonsters .pve-monster-browser');if(!root)return;
    const active=nightmareSelected();root.classList.toggle('nightmare-active',active);
    root.querySelector('[data-monster-tab="NIGHTMARE"]')?.classList.add('nightmare-tab');
    root.querySelectorAll('.monster-choice').forEach(card=>card.classList.toggle('nightmare-monster',active));
    const spotlight=root.querySelector('.pve-target-spotlight');if(!spotlight)return;
    spotlight.classList.toggle('nightmare-target',active);
    let badge=spotlight.querySelector('.nightmare-target-emblem');
    if(active&&!badge){
      badge=document.createElement('div');badge.className='nightmare-target-emblem';badge.innerHTML='<i aria-hidden="true"></i><span><small>PVE EXCLUSIVE</small><b>NIGHTMARE</b></span>';spotlight.append(badge);
    }else if(!active&&badge)badge.remove();
  }
  function decorateBattle(){
    if(!nightmareSelected())return;
    document.querySelectorAll('#modal .battle-stage,#modal .battle-v2-live-stage,#modal [data-battle-v2-stage]').forEach(stage=>{
      stage.classList.add('nightmare-battle');
      if(stage.querySelector('.nightmare-battle-mark'))return;
      const mark=document.createElement('div');mark.className='nightmare-battle-mark';mark.innerHTML='<i></i><b>NIGHTMARE</b><small>DAMAGE LIMIT RELEASED</small>';stage.append(mark);
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    let observedBrowserRoot=null,observedModal=null;
    function attach(){
      const browserRoot=document.getElementById('battleMonsters'),modal=document.getElementById('modal');
      if(browserRoot&&browserRoot!==observedBrowserRoot){new MutationObserver(decorateBrowser).observe(browserRoot,{childList:true,subtree:true});observedBrowserRoot=browserRoot;decorateBrowser()}
      if(modal&&modal!==observedModal){new MutationObserver(decorateBattle).observe(modal,{childList:true,subtree:true});observedModal=modal;decorateBattle()}
    }
    const app=document.getElementById('app');if(app)new MutationObserver(attach).observe(app,{childList:true});attach();
  });
})();
