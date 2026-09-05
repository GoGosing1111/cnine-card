(()=>{
  'use strict';
  function ensureGrantOption(){
    const select=document.getElementById('inventoryItemCode');
    if(!select||select.querySelector('option[value="UNIQUE_ADVANCEMENT_PASS"]'))return;
    const option=document.createElement('option');
    option.value='UNIQUE_ADVANCEMENT_PASS';
    option.textContent='전직 패스권 · 전직 100% 성공';
    select.append(option);
  }
  new MutationObserver(ensureGrantOption).observe(document.documentElement,{childList:true,subtree:true});
  ensureGrantOption();
})();
