import {jointAccountRequest} from './joint-account-transport.mjs';
const menu=document.querySelector('.workspace-tabs');
if(menu){
  const link=document.createElement('a');link.className='equipment-polish-entry';link.href='/equipment-polish/';link.hidden=true;link.innerHTML='<img src="/preview/equipment-polish-premium-v1/assets/polishing-stone-v1.png" alt=""><span>장비 연마<small>POLISH</small></span><b>↗</b>';menu.insertAdjacentElement('afterend',link);
  link.onclick=()=>{const selected=document.querySelector('#inventory-list [aria-pressed="true"]')?.dataset.id;link.href='/equipment-polish/'+(selected?'?instanceId='+encodeURIComponent(selected):'');};
  let generation=0;
  async function refresh(){const stamp=++generation;link.hidden=true;try{const state=await jointAccountRequest('character/equipment/polish/status');if(stamp!==generation)return;link.hidden=!state.canEnter;link.querySelector('small').textContent=state.ownerReview&&!state.publicVisible?'OWNER 검수 · 공개 OFF':'POLISH';}catch{}}
  window.addEventListener('storage',e=>{if(e.key==='cnine_card_api_token')void refresh();});window.addEventListener('pageshow',()=>void refresh());void refresh();
}
