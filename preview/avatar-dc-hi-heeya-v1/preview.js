'use strict';
const equipmentStage=document.getElementById('equipment-stage');
const backgroundButtons=[...document.querySelectorAll('button[data-background]')];
for(const button of backgroundButtons)button.addEventListener('click',()=>{
  equipmentStage.dataset.background=button.dataset.background;
  for(const option of backgroundButtons)option.setAttribute('aria-pressed',String(option===button));
});
let loadout;
const tabs=[...document.querySelectorAll('button[data-view]')];
for(const button of tabs)button.addEventListener('click',()=>{
  for(const tab of tabs){const selected=tab===button;tab.setAttribute('aria-selected',String(selected));document.getElementById(`${tab.dataset.view}-view`).hidden=!selected;}
  if(button.dataset.view==='loadout'&&!loadout)loadout=window.SoopketmonCharacterLoadoutV2.create(document.getElementById('avatarLoadoutReview'),{
    assetBase:'../../',profile:{nickname:'DC 하이희야 이미지 검수'},
    data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:{code:'DC_HI_HEEYA',name:'DC 하이희야',equipmentImage:'preview/avatar-dc-hi-heeya-v1/assets/avatar-dc-hi-heeya-equipment-v1-640.webp'}},
    request:async()=>{throw Error('이미지 검수 화면에서는 장착을 저장하지 않습니다.');}
  });
});
