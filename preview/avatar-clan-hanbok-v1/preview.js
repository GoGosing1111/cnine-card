'use strict';
(async()=>{
 const manifest=await fetch('./manifest.json').then(r=>{if(!r.ok)throw Error('한복 목록을 불러오지 못했습니다.');return r.json();});
 const catalog=await fetch('./catalog-review.json').then(r=>r.json());
 const rows=manifest.entries.map(e=>({...e,...catalog.find(a=>a.code===e.code)})),byId=id=>document.getElementById(id),asset=p=>'../../'+p;let selected=rows[0],view='gallery',loadout,archive;
 const request=async()=>{throw Error('이미지 검수에서는 계정 정보를 저장하지 않습니다.');};
 function show(){
  byId('character-name').textContent=selected.name;byId('costume').textContent=selected.caption;
  byId('lobby-small').srcset=asset(selected.lobbyMobileImage);byId('lobby').src=asset(selected.lobbyImage);byId('lobby').alt=selected.name+' 한복 로비 일러스트';byId('equipment').src=asset(selected.equipmentImage);byId('equipment').alt=selected.name+' 한복 투명 전신';
  for(const b of byId('characters').children)b.setAttribute('aria-pressed',String(b.dataset.id===selected.id));
  if(view==='loadout'){loadout?.destroy();loadout=window.SoopketmonCharacterLoadoutV2.create(byId('loadout'),{assetBase:'../../',profile:{nickname:selected.name+' 한복'},data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:{code:selected.code,name:selected.name,equipmentImage:selected.equipmentImage}},request});}
  if(view==='archive'){archive?.destroy();const ordered=[selected,...rows.filter(r=>r!==selected)];archive=window.SoopketmonAvatarShopV1.create(byId('archive'),{assetBase:'../../',request,data:{access:{shopEnabled:false},avatars:ordered.map(r=>({...r,role:'클랜 한복',description:r.caption,owned:false,equipped:false,saleEnabled:false}))}});}
 }
 for(const r of rows){const b=document.createElement('button');b.type='button';b.textContent=r.name;b.dataset.id=r.id;b.addEventListener('click',()=>{selected=r;show();});byId('characters').append(b);}
 for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{view=b.dataset.view;for(const tab of document.querySelectorAll('[data-view]')){const active=tab===b;tab.setAttribute('aria-pressed',String(active));byId(tab.dataset.view+'-view').hidden=!active;}show();});
 show();
})().catch(e=>{document.getElementById('characters').textContent=e.message;});
