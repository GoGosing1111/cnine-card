'use strict';
let view='gallery';
function renderLoadout(){
 const host=document.getElementById('avatarLoadoutReview');host.replaceChildren();
 window.SoopketmonCharacterLoadoutV2.create(host,{assetBase:'../../',profile:{nickname:'LG 아윤 이미지 검수'},data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:{code:'LG_AYOON',name:'LG 아윤',equipmentImage:'preview/avatar-lg-ayoon-v1/assets/avatar-lg-ayoon-equipment-v4-640.webp'}},request:async()=>{throw Error('이미지 검수에서는 장착을 저장하지 않습니다.')}});
}
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{view=button.dataset.view;for(const tab of document.querySelectorAll('[data-view]')){tab.setAttribute('aria-selected',String(tab===button));document.getElementById(tab.dataset.view+'-view').hidden=tab!==button}if(view==='loadout')renderLoadout()});
for(const button of document.querySelectorAll('[data-background]'))button.addEventListener('click',()=>{document.getElementById('equipment-stage').dataset.background=button.dataset.background;for(const tab of document.querySelectorAll('[data-background]'))tab.setAttribute('aria-pressed',String(tab===button))});
