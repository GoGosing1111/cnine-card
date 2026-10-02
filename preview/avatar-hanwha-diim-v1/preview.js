'use strict';
function renderLoadout(){
 const host=document.getElementById('avatarLoadoutReview');host.replaceChildren();
 window.SoopketmonCharacterLoadoutV2.create(host,{assetBase:'../../',profile:{nickname:'한화 진짜디임 이미지 검수'},data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:{code:'HANWHA_DIIM',name:'한화 진짜디임',equipmentImage:'preview/avatar-hanwha-diim-v1/assets/diim-equipment-v3-640.webp'}},request:async()=>{throw Error('이미지 검수에서는 장착을 저장하지 않습니다.')}});
}
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{
 for(const tab of document.querySelectorAll('[data-view]')){tab.setAttribute('aria-selected',String(tab===b));document.getElementById(tab.dataset.view+'-view').hidden=tab!==b}
 if(b.dataset.view==='loadout')renderLoadout();
});
for(const b of document.querySelectorAll('button[data-background]'))b.addEventListener('click',()=>{
 document.getElementById('equipment-stage').dataset.background=b.dataset.background;
 for(const button of document.querySelectorAll('button[data-background]'))button.setAttribute('aria-pressed',String(button===b));
});
