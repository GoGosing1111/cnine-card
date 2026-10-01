(() => {
 'use strict';
 const VERSION='20261002-cms1';
 let visible=false,controller=null,revision=0,featureRequest,checked=0,loading=false;
 const host=()=>document.getElementById('pveCoopView');
 async function refresh(){
  const tab=document.getElementById('pveCoopTab');if(!tab)return false;
  if(Date.now()-checked<15000){tab.hidden=!visible;return visible;}
  if(featureRequest)return featureRequest;
  featureRequest=(async()=>{
   try{const {jointAccountRequest}=await import('/js/joint-account-transport.mjs');const f=await jointAccountRequest('coop/feature');visible=f.visible;checked=Date.now();tab.querySelector('small').textContent=f.mode==='TEST'?'3인 · 테스트':'3인 · 공동 전투';}
   catch{visible=false;}finally{tab.hidden=!visible;featureRequest=null;}return visible;
  })();return featureRequest;
 }
 function deactivate(){revision++;loading=false;controller?.destroy();controller=null;if(host()){host().hidden=true;host().replaceChildren();}}
 async function open(){
  const root=host();if(!root||controller||loading)return;
  const current=++revision;loading=true;root.hidden=false;root.innerHTML='<div class="pvev2-loading" role="status"><i></i><b>격전지에 연결 중</b><span>심층 제련소 · 3인 공동 전투</span></div>';
  try{
   if(!await refresh())throw Error('격전지는 현재 테스트 참여자에게만 열려 있습니다.');
   if(current!==revision)return;
   const {mountCooperative}=await import('/raid/cooperative/live.mjs?v='+VERSION);
   if(current!==revision)return;
   const result=await mountCooperative(root);
   if(current!==revision){result.destroy();return;}controller=result;
  }catch(error){if(current===revision){root.textContent=error.message;const retry=document.createElement('button');retry.textContent='다시 연결';retry.onclick=()=>void open();root.append(retry);}}
  finally{if(current===revision)loading=false;}
 }
 function wire(){
  if(host()){checked=0;void refresh();}
 }
 const app=document.getElementById('app');if(app)new MutationObserver(records=>{
  if(records.some(r=>r.target===app||[...r.addedNodes].some(n=>n.nodeType===1&&(n.id==='pveCoopView'||n.querySelector?.('#pveCoopView'))))){deactivate();wire();}
 }).observe(app,{childList:true,subtree:true});
 addEventListener('load',wire);addEventListener('pagehide',deactivate);
 globalThis.CooperativeBattleground=Object.freeze({open,refresh,deactivate,isVisible:()=>visible});wire();
})();
