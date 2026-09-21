'use strict';
const profiles={DK_NAMU_BONGSOON:{name:'DK 나무늘봉순',serial:'A-24',call:'DK NAMU BONGSOON',stem:'avatar-dk-bongsoon'},LG_JUSEONG:{name:'LG 주성',serial:'A-25',call:'LG JUSEONG',stem:'avatar-lg-juseong'}};
let selected='DK_NAMU_BONGSOON',view='gallery',loadout;
const byId=id=>document.getElementById(id);
function showAvatar(code){
 selected=code;const p=profiles[code],prefix='./assets/'+p.stem+'-';
 byId('avatar-heading').replaceChildren(document.createTextNode(p.name+' '));const small=document.createElement('span');small.textContent=p.serial+' · '+p.call;byId('avatar-heading').append(small);
 byId('lobby-image').src=prefix+'lobby-v1-1024.webp';byId('lobby-image').srcset=prefix+'lobby-v1-640.webp 640w, '+prefix+'lobby-v1-1024.webp 1024w';byId('lobby-image').sizes='(max-width:680px) 100vw,45vw';byId('lobby-image').alt=p.name+' 로비 일러스트';
 byId('equipment-image').src=prefix+'equipment-v1-640.webp';byId('equipment-image').alt=p.name+' 장비창 전신';
 byId('lobby-source').href=prefix+'lobby-source-art-v1.png';byId('equipment-source').href=prefix+'equipment-source-art-v1.png';
 for(const b of document.querySelectorAll('[data-avatar]'))b.setAttribute('aria-pressed',String(b.dataset.avatar===code));
 if(view==='loadout')renderLoadout();
}
function renderLoadout(){
 loadout?.destroy?.();byId('avatarLoadoutReview').replaceChildren();const p=profiles[selected];
 loadout=window.SoopketmonCharacterLoadoutV2.create(byId('avatarLoadoutReview'),{assetBase:'../../',profile:{nickname:p.name},data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:{code:selected,name:p.name,equipmentImage:'preview/avatar-dk-bongsoon-lg-juseong-v1/assets/'+p.stem+'-equipment-v1-640.webp'}},request:async()=>{throw Error('이미지 미리보기 화면입니다.');}});
}
for(const button of document.querySelectorAll('[data-avatar]'))button.addEventListener('click',()=>showAvatar(button.dataset.avatar));
for(const button of document.querySelectorAll('button[data-background]'))button.addEventListener('click',()=>{byId('equipment-stage').dataset.background=button.dataset.background;for(const b of document.querySelectorAll('button[data-background]'))b.setAttribute('aria-pressed',String(b===button));});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{view=button.dataset.view;for(const b of document.querySelectorAll('[data-view]')){const active=b===button;b.setAttribute('aria-selected',String(active));byId(b.dataset.view+'-view').hidden=!active;}if(view==='loadout')renderLoadout();});
showAvatar(selected);
