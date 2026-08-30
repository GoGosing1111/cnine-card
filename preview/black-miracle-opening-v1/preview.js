(()=>{
  'use strict';
  const feature=window.BlackMiracleOpeningV1926;
  const modal=document.getElementById('modal');
  const rewardButtons=[...document.querySelectorAll('[data-preview-reward]')];
  const launchButton=document.querySelector('[data-preview-launch]');
  let selected='equipment';

  const select=kind=>{
    selected=kind;
    rewardButtons.forEach(button=>{
      const active=button.dataset.previewReward===kind;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  };
  const launch=()=>feature?.preview(selected,{modal,ownedQuantity:4,delayMs:380});

  rewardButtons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.previewReward)));
  launchButton.addEventListener('click',launch);
  select(selected);
  requestAnimationFrame(launch);
})();
