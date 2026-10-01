(() => {
 'use strict';
 const VERSION='20261001-coop-v1';
 let visible=false,controller=null,revision=0,featureRequest,checked=0;
 const host=()=>document.getElementById('pveCoopView');
 async function refresh(){
  const tab=document.getElementById('coopRaidTab');if(!tab)return false;
  if(Date.now()-checked<15000){tab.hidden=!visible;return visible;}
  if(featureRequest)return featureRequest;
  featureRequest=(async()=>{
   try{const {jointAccountRequest}=await import('/js/joint-account-transport.mjs');const f=await jointAccountRequest('coop/feature');visible=f.visible;checked=Date.now();tab.querySelector('small').textContent=f.mode==='TEST'?'3인 · 테스트':'3인 · 공동 전투';}
   catch{visible=false;}finally{tab.hidden=!visible;featureRequest=null;}return visible;
  })();return featureRequest;
 }
 function deactivate(){revision++;controller?.destroy();controller=null;if(host()){host().hidden=true;host().replaceChildren();}}
 async function open(){
  const root=host();if(!root||controller)return;
  const current=++revision;root.hidden=false;root.innerHTML='<div class="core-raid-loading" role="status"><i></i><b>격전지에 연결 중</b></div>';
  try{
   const {mountCooperative}=await import('/raid/cooperative/live.mjs?v='+VERSION);
   const result=await mountCooperative(root);
   if(current!==revision){result.destroy();return;}controller=result;
  }catch(error){if(current===revision){root.textContent=error.message;const retry=document.createElement('button');retry.textContent='다시 연결';retry.onclick=()=>void open();root.append(retry);}}
 }
 function wire(){
  const hub=document.getElementById('pveRaidHubView'),tabs=hub?.querySelector('.raid-content-tabs');if(!tabs)return;
  if(!document.getElementById('coopRaidTab')){
   const tab=document.createElement('button');tab.type='button';tab.id='coopRaidTab';tab.hidden=true;tab.dataset.raidContent='coop';tab.innerHTML='<small>3인 · 공동 전투</small><b>격전지(협동)</b>';tabs.append(tab);
   const root=document.createElement('div');root.id='pveCoopView';root.hidden=true;hub.append(root);
  }void refresh();
 }
 const app=document.getElementById('app');if(app)new MutationObserver(records=>{
  if(records.some(r=>r.target===app||[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='pveRaidHubView'||n.querySelector?.('#pveRaidHubView'))))){deactivate();wire();}
 }).observe(app,{childList:true,subtree:true});
 addEventListener('load',wire);addEventListener('pagehide',deactivate);
 globalThis.CooperativeBattleground=Object.freeze({open,refresh,deactivate,isVisible:()=>visible});wire();
})();
