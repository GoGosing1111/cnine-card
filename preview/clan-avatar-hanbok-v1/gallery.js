const looks=[
  {
    "id": "joeun",
    "name": "조은",
    "avatarCode": "T1_JOEUN",
    "category": "female",
    "caption": "먹빛 저고리 · 붉은 비단",
    "accent": "#8e2835",
    "image": "assets/joeun-hanbok-v1.png",
    "original": "../avatar-t1-joeun-v1/assets/avatar-t1-joeun-equipment-source-art-v1.png"
  },
  {
    "id": "kangguyeol",
    "name": "강구열",
    "avatarCode": "KANGGUYEOL_DK",
    "category": "male",
    "caption": "옥빛 배자 · 먹색 바지",
    "accent": "#9bb4a9",
    "image": "assets/kangguyeol-hanbok-v1.png",
    "original": "../avatar-kangguyeol-dk-v1/assets/avatar-kangguyeol-dk-equipment-source-art-v1.png"
  },
  {
    "id": "orikkung",
    "name": "오리꿍",
    "avatarCode": "FM_ORIKKUNG",
    "category": "duck",
    "caption": "초록 배자 · 전통 복건",
    "accent": "#296551",
    "image": "assets/orikkung-hanbok-v1.png",
    "original": "../avatar-fm-orikkung-v1/assets/avatar-fm-orikkung-equipment-source-art-v1.png"
  },
  {
    "id": "dimwoos",
    "name": "딤우스",
    "avatarCode": "FM_DIMWOOS",
    "category": "female",
    "caption": "아이보리 저고리 · 비취 치마",
    "accent": "#146653",
    "image": "assets/dimwoos-hanbok-v1.png",
    "original": "../avatar-fm-dimwoos-v1/assets/avatar-fm-dimwoos-equipment-source-art-v1.png"
  },
  {
    "id": "hi-heeya",
    "name": "하이희야",
    "avatarCode": "DC_HI_HEEYA",
    "category": "female",
    "caption": "연보라 고름 · 남색 치마",
    "accent": "#6b6792",
    "image": "assets/hi-heeya-hanbok-v1.png",
    "original": "../avatar-dc-hi-heeya-v1/assets/avatar-dc-hi-heeya-equipment-source-art-v1.png"
  },
  {
    "id": "bongsoon",
    "name": "나무늘봉순",
    "avatarCode": "DK_NAMU_BONGSOON",
    "category": "female",
    "caption": "백색 저고리 · 민트 치마",
    "accent": "#8abbba",
    "image": "assets/bongsoon-hanbok-v1.png",
    "original": "../avatar-dk-bongsoon-lg-juseong-v1/assets/avatar-dk-bongsoon-equipment-source-art-v1.png"
  },
  {
    "id": "juseong",
    "name": "주성",
    "avatarCode": "LG_JUSEONG",
    "category": "male",
    "caption": "자주빛 겉옷 · 먹색 바지",
    "accent": "#703851",
    "image": "assets/juseong-hanbok-v1.png",
    "original": "../avatar-dk-bongsoon-lg-juseong-v1/assets/avatar-lg-juseong-equipment-source-art-v1.png"
  },
  {
    "id": "ayoon",
    "name": "아윤",
    "avatarCode": "LOTTE_AYOON",
    "category": "female",
    "caption": "크림 저고리 · 포도빛 치마",
    "accent": "#8f3f53",
    "image": "assets/ayoon-hanbok-v1.png",
    "original": "../avatar-lotte-ayoon-v1/assets/avatar-lotte-ayoon-equipment-source-art-v1.png"
  }
];
const grid=document.querySelector('#grid'),dialog=document.querySelector('#detail'),stage=document.querySelector('#detail-stage');let current=0;
for(const [index,look] of looks.entries()){const card=document.createElement('article');card.className='look';card.dataset.category=look.category;card.style.setProperty('--look-accent',look.accent);card.innerHTML=`<button class="portrait" aria-label="${look.name} 한복 크게 보기"><img src="${look.image}" alt="${look.name} 한복 전신 의상" width="1024" height="1536"></button><div class="look-meta"><div><h2>${look.name}</h2><p>${look.caption}</p></div><span class="number">${String(index+1).padStart(2,'0')} / 08</span></div>`;card.querySelector('button').addEventListener('click',()=>openLook(index));grid.append(card);}
function showLook(index){current=(index+looks.length)%looks.length;const look=looks[current];document.querySelector('#detail-name').textContent=look.name;document.querySelector('#detail-caption').textContent=look.caption;document.querySelector('#before-image').src=look.original;document.querySelector('#before-image').alt=look.name+' 기존 의상';document.querySelector('#after-image').src=look.image;document.querySelector('#after-image').alt=look.name+' 한복 의상';document.querySelector('#download').href=look.image;document.querySelector('#download').download=look.id+'-hanbok-v1.png';}
function openLook(index){showLook(index);stage.classList.remove('comparing');document.querySelector('#compare').setAttribute('aria-pressed','false');dialog.showModal();}
document.querySelector('#close').onclick=()=>dialog.close();document.querySelector('#previous').onclick=()=>showLook(current-1);document.querySelector('#next').onclick=()=>showLook(current+1);document.querySelector('#compare').onclick=event=>{const on=stage.classList.toggle('comparing');event.currentTarget.setAttribute('aria-pressed',String(on));};
document.querySelector('#theme').onclick=event=>{const on=document.body.classList.toggle('dark');event.currentTarget.setAttribute('aria-pressed',String(on));event.currentTarget.textContent=on?'밝은 배경':'어두운 배경';};
document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));for(const card of grid.children){card.hidden=button.dataset.filter==='all'?false:button.dataset.filter==='female'?card.dataset.category!=='female':card.dataset.category==='female';}});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
document.addEventListener('keydown',event=>{if(!dialog.open)return;if(event.key==='ArrowLeft')showLook(current-1);if(event.key==='ArrowRight')showLook(current+1);});
