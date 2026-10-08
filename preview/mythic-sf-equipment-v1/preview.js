const items=[
 {key:'armor',name:'갑옷',en:'ARMOR',detail:'중첩 장갑 · 삼중 코어',file:'mythic-sf-armor-v3-green.png'},
 {key:'pants',name:'바지',en:'ARMORED PANTS',detail:'연결 장갑 · 관절 제어부',file:'mythic-sf-pants-v3-green.png'},
 {key:'boots',name:'신발',en:'ARMORED BOOTS',detail:'강화 외피 · 안정화 모듈',file:'mythic-sf-boots-v3-green.png'},
 {key:'dual-disk',name:'듀얼디스크',en:'DUAL DISK',detail:'쌍환 코어 · 전완 장착 장치',file:'mythic-sf-dual-disk-v3-green.png'}
];
const gallery=document.getElementById('gallery'),dialog=document.getElementById('detail');
gallery.innerHTML=items.map((v,i)=>`<article><div class="item-head"><span>0${i+1} / ${v.en}</span><span class="mythic">MYTHIC</span></div><button class="art" type="button" data-item="${i}" aria-label="${v.name} 확대"><img src="assets/${v.file}" alt="SF 신화 ${v.name}" fetchpriority="high"><span class="expand">↗</span></button><div class="item-copy"><h2>${v.name}</h2><p>${v.detail}</p><a href="assets/${v.file}" download>PNG 다운로드 ↓</a></div></article>`).join('');
gallery.onclick=e=>{const b=e.target.closest('[data-item]');if(!b)return;const v=items[Number(b.dataset.item)];document.getElementById('detailTitle').textContent=v.name;const img=document.getElementById('detailImage');img.src='assets/'+v.file;img.alt='SF 신화 '+v.name;document.getElementById('original').href=img.src;dialog.showModal();};
document.getElementById('close').onclick=()=>dialog.close();
dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
document.getElementById('background').onclick=e=>{const light=document.body.classList.toggle('light');e.target.textContent=light?'어두운 배경으로 보기':'밝은 배경으로 보기';e.target.setAttribute('aria-pressed',String(light));};
