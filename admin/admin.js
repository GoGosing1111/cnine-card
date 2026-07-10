let token=localStorage.getItem('cnine_admin_token')||localStorage.getItem('cnine_card_api_token')||'';
let all=[],members=[],role='';
const selected=new Set();
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const imageSrc=v=>/^https?:\/\//i.test(v)?v:'../'+String(v||'').replace(/^\//,'');
async function api(path,opt={}){const r=await fetch('../api/'+path,{...opt,headers:{'content-type':'application/json','authorization':'Bearer '+token,...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'요청 실패');return d}
async function login(){try{const d=await api('auth/login',{method:'POST',body:JSON.stringify({privateKey:$('#key').value.trim()})});token=d.token;localStorage.setItem('cnine_admin_token',token);await load()}catch(e){alert(e.message)}}
async function load(){try{const d=await api('admin/cards');all=d.cards;members=d.members;role=d.role;$('#login').hidden=true;$('#cms').hidden=false;fillMembers();render()}catch(e){$('#login').hidden=false;$('#cms').hidden=true;if(token)alert(e.message)}}
function fillMembers(){ $('#memberId').innerHTML=members.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('') }
function cardStatus(c){if(Number(c.is_active)===0)return'hidden';return c.imageBroken?'broken':'active'}
function memberOptions(selected){return members.map(m=>`<option value="${m.id}" ${Number(selected)===Number(m.id)?'selected':''}>${esc(m.name)}</option>`).join('')}
function updateBulkBar(list=[]){
  const bar=$('#bulkActions');
  if(!bar)return;
  bar.hidden=role!=='OWNER';
  $('#selectedCount').textContent=`${selected.size}장 선택`;
  const visibleIds=list.map(c=>c.id);
  const checked=visibleIds.length>0&&visibleIds.every(id=>selected.has(id));
  const box=$('#selectVisible');
  box.checked=checked;
  box.indeterminate=!checked&&visibleIds.some(id=>selected.has(id));
  $('#bulkDeleteBtn').disabled=selected.size===0;
}
function render(){
  const q=$('#search').value.toLowerCase().trim(),g=$('#grade').value,s=$('#statusFilter').value;
  const list=all.filter(c=>(!q||c.title.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.id.toLowerCase().includes(q))&&(!g||c.grade===g)&&(!s||cardStatus(c)===s));
  $('#count').textContent=`${list.length}장 / 전체 ${all.length}장`;
  $('#cards').innerHTML=list.map(c=>{const a=Number(c.is_active)!==0;return `<article class="item ${a?'':'inactive'} ${selected.has(c.id)?'selected':''}" data-id="${esc(c.id)}">
    ${role==='OWNER'?`<label class="select-card"><input type="checkbox" class="card-check" ${selected.has(c.id)?'checked':''}><span>선택</span></label>`:''}
    <div class="image-wrap"><img src="${esc(imageSrc(c.image))}" style="object-position:${Number(c.focusX)}% ${Number(c.focusY)}%" alt="${esc(c.title)}"><span class="image-state ok">이미지 정상</span></div>
    <div class="form">
      <div class="meta">${esc(c.name)} · ${esc(c.id)}</div>
      <input class="title" value="${esc(c.title)}" maxlength="80" aria-label="카드명">
      <select class="member" aria-label="멤버">${memberOptions(c.memberId)}</select>
      <select class="rarity" aria-label="등급">${['SSR','UR','HR','SR','R','U','C'].map(x=>`<option ${x===c.grade?'selected':''}>${x}</option>`).join('')}</select>
      <input class="image-path" value="${esc(c.image)}" aria-label="이미지 경로" placeholder="이미지 경로 또는 URL">
      <label class="focus-label">가로 초점<input class="fx" type="number" min="0" max="100" value="${Number(c.focusX)}"></label>
      <label class="focus-label">세로 초점<input class="fy" type="number" min="0" max="100" value="${Number(c.focusY)}"></label>
      <label class="active-row"><input class="active" type="checkbox" ${a?'checked':''}> 카드팩·도감에 표시</label>
      <button class="save">DB에 저장</button>
      <button class="toggle ${a?'danger':'restore'}">${a?'카드 숨기기':'다시 활성화'}</button>
      ${role==='OWNER'?'<button class="delete">완전 삭제</button>':''}
      <div class="save-state" aria-live="polite"></div>
    </div>
  </article>`}).join('');
  document.querySelectorAll('.item').forEach(item=>{
    const c=all.find(x=>x.id===item.dataset.id),img=item.querySelector('img'),badge=item.querySelector('.image-state');
    img.onerror=()=>{c.imageBroken=true;badge.textContent='이미지 없음';badge.className='image-state bad';item.classList.add('broken')};
    img.onload=()=>{c.imageBroken=false;badge.textContent='이미지 정상';badge.className='image-state ok';item.classList.remove('broken')};
    item.querySelector('.card-check')?.addEventListener('change',e=>{e.target.checked?selected.add(c.id):selected.delete(c.id);item.classList.toggle('selected',e.target.checked);updateBulkBar(list)});
    item.querySelector('.save').onclick=()=>save(item);
    item.querySelector('.toggle').onclick=()=>toggleCard(item);
    item.querySelector('.delete')?.addEventListener('click',()=>hardDelete(c));
    item.querySelectorAll('.fx,.fy').forEach(input=>input.oninput=()=>{img.style.objectPosition=`${item.querySelector('.fx').value}% ${item.querySelector('.fy').value}%`});
    item.querySelector('.image-path').onchange=()=>{img.src=imageSrc(item.querySelector('.image-path').value.trim())};
  });
  updateBulkBar(list);
}
async function save(item,forcedActive=null){
  const id=item.dataset.id,state=item.querySelector('.save-state'),btn=item.querySelector('.save');
  const payload={id,memberId:Number(item.querySelector('.member').value),title:item.querySelector('.title').value.trim(),grade:item.querySelector('.rarity').value,image:item.querySelector('.image-path').value.trim(),focusX:Number(item.querySelector('.fx').value),focusY:Number(item.querySelector('.fy').value),isActive:forcedActive===null?item.querySelector('.active').checked:forcedActive};
  if(!payload.title)return alert('카드명을 입력하세요.'); if(!payload.image)return alert('이미지 경로를 입력하세요.');
  btn.disabled=true;state.textContent='D1 저장 중...';state.className='save-state pending';
  try{const d=await api('admin/cards',{method:'PATCH',body:JSON.stringify(payload)});const i=all.findIndex(x=>x.id===id);all[i]=d.card;state.textContent='D1 저장 완료';state.className='save-state success';item.classList.add('saved');setTimeout(()=>item.classList.remove('saved'),900);if(forcedActive!==null)render()}
  catch(e){state.textContent='저장 실패';state.className='save-state error';alert(e.message)}finally{btn.disabled=false}
}
async function toggleCard(item){const next=!item.querySelector('.active').checked;if(!confirm(next?'이 카드를 다시 표시할까요?':'이 카드를 숨길까요?'))return;item.querySelector('.active').checked=next;await save(item,next)}
async function hardDelete(c){if(!confirm(`정말 '${c.title}' 카드를 완전 삭제할까요?\n보유 기록과 뽑기 기록도 함께 삭제됩니다.`))return;try{await api('admin/cards',{method:'DELETE',body:JSON.stringify({id:c.id})});selected.delete(c.id);all=all.filter(x=>x.id!==c.id);render();alert('완전 삭제 완료')}catch(e){alert(e.message)}}
async function bulkDelete(){
  const ids=[...selected].filter(id=>all.some(c=>c.id===id));
  if(!ids.length)return;
  if(!confirm(`선택한 ${ids.length}장의 카드를 완전 삭제할까요?\n보유 기록과 뽑기 기록도 함께 삭제됩니다.`))return;
  const btn=$('#bulkDeleteBtn');btn.disabled=true;btn.textContent='삭제 중...';
  try{const d=await api('admin/cards',{method:'DELETE',body:JSON.stringify({ids})});const removed=new Set(d.deletedIds||ids);all=all.filter(c=>!removed.has(c.id));selected.clear();render();alert(`${removed.size}장 삭제 완료`)}catch(e){alert(e.message)}finally{btn.textContent='선택 카드 삭제';btn.disabled=false}
}
function openAdd(){ $('#dialogTitle').textContent='카드 추가';$('#memberId').value=members[0]?.id||'';$('#cardTitle').value='';$('#cardGrade').value='C';$('#cardImage').value='';$('#cardFx').value=50;$('#cardFy').value=50;$('#cardActive').checked=true;updatePreview();$('#cardDialog').showModal() }
function updatePreview(){const src=$('#cardImage').value.trim();$('#formPreview').src=src?imageSrc(src):'';$('#formPreview').style.objectPosition=`${$('#cardFx').value}% ${$('#cardFy').value}%`}
async function addCard(){const payload={memberId:Number($('#memberId').value),title:$('#cardTitle').value.trim(),grade:$('#cardGrade').value,image:$('#cardImage').value.trim(),focusX:Number($('#cardFx').value),focusY:Number($('#cardFy').value),isActive:$('#cardActive').checked};try{const d=await api('admin/cards',{method:'POST',body:JSON.stringify(payload)});all.unshift(d.card);$('#cardDialog').close();render();alert('카드 추가 완료')}catch(e){alert(e.message)}}
async function bulkSave(){const lines=$('#bulkText').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),cards=[];for(const [i,line] of lines.entries()){const p=line.split('|').map(x=>x.trim());if(p.length<4)return alert(`${i+1}번째 줄 형식이 잘못됐습니다.`);cards.push({memberId:Number(p[0]),title:p[1],grade:p[2],image:p[3],focusX:50,focusY:50,isActive:true})}try{const d=await api('admin/cards',{method:'POST',body:JSON.stringify({cards})});all=[...d.cards,...all];$('#bulkDialog').close();$('#bulkText').value='';render();alert(`${d.cards.length}장 등록 완료`)}catch(e){alert(e.message)}}
$('#loginBtn').onclick=login;$('#search').oninput=render;$('#grade').onchange=render;$('#statusFilter').onchange=render;$('#logoutBtn').onclick=()=>{localStorage.removeItem('cnine_admin_token');token='';location.reload()};$('#addBtn').onclick=openAdd;$('#bulkBtn').onclick=()=>$('#bulkDialog').showModal();$('#saveCardBtn').onclick=addCard;$('#bulkSaveBtn').onclick=bulkSave;['cardImage','cardFx','cardFy'].forEach(id=>$('#'+id).addEventListener('input',updatePreview));if(token)load();

$('#selectVisible').onchange=e=>{const q=$('#search').value.toLowerCase().trim(),g=$('#grade').value,st=$('#statusFilter').value;const visible=all.filter(c=>(!q||c.title.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.id.toLowerCase().includes(q))&&(!g||c.grade===g)&&(!st||cardStatus(c)===st));visible.forEach(c=>e.target.checked?selected.add(c.id):selected.delete(c.id));render()};$('#clearSelectionBtn').onclick=()=>{selected.clear();render()};$('#bulkDeleteBtn').onclick=bulkDelete;
