(() => {
  'use strict';
  let pending=false,checkedAt=0,visible=false;
  async function refresh(){
    const tab=document.getElementById('lichRaidTab');
    if(!tab||pending)return;
    if(Date.now()-checkedAt<15000){tab.hidden=!visible;return;}
    const bridge=globalThis.CNineCoreRaidBridge;if(!bridge?.apiRequest)return;
    pending=true;
    try{const result=await bridge.apiRequest('raid/lich/feature',{}, {ttl:0,microcache:false});
      visible=result.visible===true;tab.hidden=!visible;tab.querySelector('small').textContent=result.mode+' · LICH KING';checkedAt=Date.now();}
    catch{tab.hidden=true;visible=false;}finally{pending=false;}
  }
  function wire(){
    const tabs=document.querySelector('#pveRaidHubView .raid-content-tabs')||document.getElementById('coreRaidTab')?.parentElement;
    if(!tabs)return;
    let tab=document.getElementById('lichRaidTab');
    if(!tab){tab=document.createElement('button');tab.type='button';tab.id='lichRaidTab';tab.hidden=true;tab.innerHTML='<small>TEST · LICH KING</small><b>리치왕 정벌</b>';tab.onclick=()=>location.assign('/raid/lich-king/');tabs.appendChild(tab);}
    void refresh();
  }
  const app=document.getElementById('app');
  if(app)new MutationObserver(records=>{
    if(records.some(r=>r.target===app||[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='pveRaidHubView'||n.querySelector?.('#pveRaidHubView')))))wire();
  }).observe(app,{childList:true,subtree:true});
  addEventListener('load',wire);addEventListener('cnine:account-mutation',()=>{checkedAt=0;void refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkedAt=0;void refresh();}});
  wire();
})();
