'use strict';
const byId=id=>document.getElementById(id),tabs=[...document.querySelectorAll('[data-view]')];let loadout;
function renderLoadout(){
  loadout?.destroy?.();byId('avatarLoadoutReview').replaceChildren();
  loadout=window.SoopketmonCharacterLoadoutV2.create(byId('avatarLoadoutReview'),{
    assetBase:'../../',profile:{nickname:'LG 하이희야'},
    data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:{code:'LG_HI_HEEYA_PREVIEW',name:'LG 하이희야',equipmentImage:'preview/avatar-lg-hi-heeya-uniform-v1/assets/avatar-lg-hi-heeya-equipment-v2-640.webp'}},
    request:async()=>{throw Error('아바타 리소스 미리보기입니다.');}
  });
}
function showTab(button){
  for(const tab of tabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;byId(tab.dataset.view+'-view').hidden=!active;}
  if(button.dataset.view==='loadout')renderLoadout();
}
for(const button of tabs){
  button.addEventListener('click',()=>showTab(button));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
    const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(tabs.indexOf(button)+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];showTab(next);next.focus();
  });
}
for(const button of document.querySelectorAll('button[data-background]'))button.addEventListener('click',()=>{
  byId('equipment-stage').dataset.background=button.dataset.background;
  for(const b of document.querySelectorAll('button[data-background]'))b.setAttribute('aria-pressed',String(b===button));
});
