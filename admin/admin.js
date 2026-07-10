let token=localStorage.getItem('cnine_admin_token')||localStorage.getItem('cnine_card_api_token')||'';
let all=[];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

async function api(path,opt={}){
  const response=await fetch('../api/'+path,{
    ...opt,
    headers:{'content-type':'application/json','authorization':'Bearer '+token,...(opt.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Error(data.error||'요청 실패');
  return data;
}

async function login(){
  try{
    const data=await api('auth/login',{method:'POST',body:JSON.stringify({privateKey:$('#key').value.trim()})});
    token=data.token;
    localStorage.setItem('cnine_admin_token',token);
    await load();
  }catch(error){alert(error.message)}
}

async function load(){
  try{
    const data=await api('admin/cards');
    all=data.cards;
    $('#login').hidden=true;
    $('#cms').hidden=false;
    render();
  }catch(error){
    $('#login').hidden=false;
    $('#cms').hidden=true;
    if(token) alert(error.message);
  }
}

function cardStatus(card){
  if(Number(card.is_active)===0) return 'hidden';
  return card.imageBroken?'broken':'active';
}

function render(){
  const q=$('#search').value.toLowerCase().trim();
  const grade=$('#grade').value;
  const status=$('#statusFilter').value;
  const list=all.filter(card=>{
    const matchesText=!q||card.title.toLowerCase().includes(q)||card.name.toLowerCase().includes(q)||card.id.toLowerCase().includes(q);
    const matchesGrade=!grade||card.grade===grade;
    const matchesStatus=!status||cardStatus(card)===status;
    return matchesText&&matchesGrade&&matchesStatus;
  });
  $('#count').textContent=`${list.length}장 / 전체 ${all.length}장`;
  $('#cards').innerHTML=list.map(card=>{
    const active=Number(card.is_active)!==0;
    return `<article class="item ${active?'':'inactive'}" data-id="${esc(card.id)}">
      <div class="image-wrap">
        <img src="../${esc(card.image)}" style="object-position:${Number(card.focusX)}% ${Number(card.focusY)}%" alt="${esc(card.title)}">
        <span class="image-state ok">이미지 정상</span>
      </div>
      <div class="form">
        <div class="meta">${esc(card.name)} · ${esc(card.id)}</div>
        <input class="title" value="${esc(card.title)}" maxlength="80" aria-label="카드명">
        <select class="rarity" aria-label="등급">${['SSR','UR','HR','SR','R','U','C'].map(x=>`<option ${x===card.grade?'selected':''}>${x}</option>`).join('')}</select>
        <label class="focus-label">가로 초점<input class="fx" type="number" min="0" max="100" value="${Number(card.focusX)}"></label>
        <label class="focus-label">세로 초점<input class="fy" type="number" min="0" max="100" value="${Number(card.focusY)}"></label>
        <label class="active-row"><input class="active" type="checkbox" ${active?'checked':''}> 카드팩·도감에 표시</label>
        <button class="save">DB에 저장</button>
        <button class="toggle ${active?'danger':'restore'}">${active?'카드 숨기기':'다시 활성화'}</button>
        <div class="save-state" aria-live="polite"></div>
      </div>
    </article>`;
  }).join('');

  document.querySelectorAll('.item').forEach(item=>{
    const img=item.querySelector('img');
    const badge=item.querySelector('.image-state');
    img.addEventListener('error',()=>{
      const card=all.find(x=>x.id===item.dataset.id);
      if(card) card.imageBroken=true;
      badge.textContent='이미지 없음';
      badge.className='image-state bad';
      item.classList.add('broken');
    });
    img.addEventListener('load',()=>{
      const card=all.find(x=>x.id===item.dataset.id);
      if(card) card.imageBroken=false;
      badge.textContent='이미지 정상';
      badge.className='image-state ok';
      item.classList.remove('broken');
    });
    item.querySelector('.save').onclick=()=>save(item);
    item.querySelector('.toggle').onclick=()=>toggleCard(item);
    item.querySelectorAll('.fx,.fy').forEach(input=>input.oninput=()=>{
      img.style.objectPosition=`${item.querySelector('.fx').value}% ${item.querySelector('.fy').value}%`;
    });
  });
}

async function save(item,forcedActive=null){
  const id=item.dataset.id;
  const saveButton=item.querySelector('.save');
  const state=item.querySelector('.save-state');
  const payload={
    id,
    title:item.querySelector('.title').value.trim(),
    grade:item.querySelector('.rarity').value,
    focusX:Number(item.querySelector('.fx').value),
    focusY:Number(item.querySelector('.fy').value),
    isActive:forcedActive===null?item.querySelector('.active').checked:forcedActive
  };
  if(!payload.title) return alert('카드명을 입력하세요.');
  saveButton.disabled=true;
  state.textContent='D1 저장 중...';
  state.className='save-state pending';
  try{
    const data=await api('admin/cards',{method:'PATCH',body:JSON.stringify(payload)});
    const updated=data.card||payload;
    const card=all.find(x=>x.id===id);
    Object.assign(card,{
      title:updated.title,
      grade:updated.grade,
      focusX:Number(updated.focusX),
      focusY:Number(updated.focusY),
      is_active:updated.is_active??(payload.isActive?1:0)
    });
    state.textContent='D1 저장 완료';
    state.className='save-state success';
    item.classList.add('saved');
    setTimeout(()=>item.classList.remove('saved'),1000);
    if(forcedActive!==null) render();
  }catch(error){
    state.textContent='저장 실패';
    state.className='save-state error';
    alert(error.message);
  }finally{
    saveButton.disabled=false;
  }
}

async function toggleCard(item){
  const active=item.querySelector('.active').checked;
  const next=!active;
  const message=next?'이 카드를 다시 카드팩과 도감에 표시할까요?':'이 카드를 숨길까요? 기존 보유 기록은 삭제되지 않습니다.';
  if(!confirm(message)) return;
  item.querySelector('.active').checked=next;
  await save(item,next);
}

$('#loginBtn').onclick=login;
$('#search').oninput=render;
$('#grade').onchange=render;
$('#statusFilter').onchange=render;
$('#logoutBtn').onclick=()=>{localStorage.removeItem('cnine_admin_token');token='';location.reload()};
if(token) load();
