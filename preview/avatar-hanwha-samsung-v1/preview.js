'use strict';
const avatars=[{key:'kangguyeol',name:'한화 강구열',code:'HANWHA_KANGGUYEOL',serial:'A-31',clan:'한화'},{key:'juseong',name:'삼성 주성',code:'SAMSUNG_JUSEONG',serial:'A-32',clan:'삼성'}];
let selected=0,view='gallery';
function renderLoadout(){
 const a=avatars[selected],host=document.getElementById('avatarLoadoutReview');host.replaceChildren();
 window.SoopketmonCharacterLoadoutV2.create(host,{assetBase:'../../',profile:{nickname:a.name+' 이미지 검수'},data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:{code:a.code,name:a.name,equipmentImage:'preview/avatar-hanwha-samsung-v1/assets/'+a.key+'-equipment-v1-640.webp'}},request:async()=>{throw Error('이미지 검수에서는 장착을 저장하지 않습니다.')}});
}
for(const b of document.querySelectorAll('[data-avatar]'))b.addEventListener('click',()=>{
 selected=Number(b.dataset.avatar);const a=avatars[selected];
 document.getElementById('name').replaceChildren(document.createTextNode(a.name));const sub=document.createElement('span');sub.textContent=a.serial+' · '+a.clan+' 클랜 유니폼';document.getElementById('name').append(sub);
 for(const btn of document.querySelectorAll('[data-avatar]'))btn.setAttribute('aria-pressed',String(btn===b));
 for(const type of ['lobby','equipment']){const img=document.getElementById(type);img.src='./assets/'+a.key+'-'+type+'-v1-'+(type==='lobby'?'1024':'640')+'.webp';img.alt=a.name+' '+(type==='lobby'?'로비 일러스트':'투명 전신');document.getElementById(type+'-source').href='./assets/'+a.key+'-'+type+'-source-art-v1.png'}
 if(view==='loadout')renderLoadout();
});
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{view=b.dataset.view;for(const tab of document.querySelectorAll('[data-view]')){tab.setAttribute('aria-selected',String(tab===b));document.getElementById(tab.dataset.view+'-view').hidden=tab!==b}if(view==='loadout')renderLoadout()});
for(const b of document.querySelectorAll('[data-background]'))b.addEventListener('click',()=>{document.getElementById('equipment-stage').dataset.background=b.dataset.background;for(const btn of document.querySelectorAll('button[data-background]'))btn.setAttribute('aria-pressed',String(btn===b))});
