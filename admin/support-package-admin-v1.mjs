const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountSupportPackageAdmin(root,{request}){
 let data=null,selected=null,pending=null,busy=false,disposed=false;const key='cnine_support_package_admin_pending_v1:1';
 try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 const status=text=>{if(!disposed)root.querySelector('[data-package-admin-status]').textContent=text;};
 function render(){
  if(disposed)return;
  const order=selected||pending?.order;
  root.innerHTML=`<section class="spkg spkg-admin"><h3>패키지 구매 접수 ${data?'· 확인 대기 '+data.pending.length+'건':''}</h3><p class="spkg-note">49,800원 · 100조 코인 + 엠퍼러 에너지 200개 + SSS 리미티드 조각 5개</p><button type="button" class="ss-secondary" data-package-admin-refresh ${busy||pending?'disabled':''}>접수 내역 새로고침</button><div class="spkg-admin-list">${data?.pending.map(o=>`<button type="button" data-package-order="${esc(o.id)}" aria-pressed="${order?.id===o.id}" ${busy||pending?'disabled':''}><b>${esc(o.nickname)} · ID ${o.userId}</b><span>${new Date(o.createdAt).toLocaleString('ko-KR')}</span></button>`).join('')||'<p class="spkg-note">'+(data?'대기 중인 구매 신청이 없습니다.':'접수 내역을 확인하고 있습니다.')+'</p>'}</div>${order?`<form data-package-admin-form><h4>${esc(order.nickname)} · ID ${order.userId}</h4><small>신청 번호 ${esc(order.id)}</small>${pending?'<p>이전 처리 결과를 같은 요청으로 확인하세요.</p>':`<label>입금 확인 메모 / 반려 사유<input type="text" name="note" required maxlength="200" autocomplete="off" placeholder="입금자명·입금 시각 등 확인 내역"></label><label><input type="checkbox" name="paid">49,800원 입금과 대상 신청을 확인했습니다.</label>`}<div class="spkg-actions">${pending?'<button type="button" data-package-admin-retry>이전 처리 결과 확인</button>':'<button type="submit" data-package-process="FULFILL">입금 확인 · 패키지 지급</button><button type="button" data-package-process="REJECT">신청 반려</button>'}</div></form>`:''}<p data-package-admin-status role="status" aria-live="polite"></p>${data?.recent.length?`<details><summary>최근 처리 내역</summary>${data.recent.map(o=>`<p class="spkg-note">${esc(o.nickname)} · ${o.status==='FULFILLED'?'지급 완료':'반려'} · ${esc(o.note)}<br>${new Date(o.processedAt).toLocaleString('ko-KR')}</p>`).join('')}</details>`:''}</section>`;
  if(busy)root.querySelectorAll('button,input').forEach(el=>el.disabled=true);
 }
 async function load(){if(busy||disposed||pending)return;busy=true;try{data=await request('admin/server-support/package');if(disposed)return;if(selected)selected=data.pending.find(o=>o.id===selected.id)||null;busy=false;render();}catch(e){status(e.message);}finally{busy=false;if(!disposed)root.querySelector('[data-package-admin-refresh]').disabled=false;}}
 async function process(action){
  if(busy||disposed)return;
  if(!pending){if(!selected)return;const form=root.querySelector('form');if(!form.reportValidity())return;if(action==='FULFILL'&&!form.elements.paid.checked){status('49,800원 입금을 확인한 뒤 체크해 주세요.');return;}pending={order:selected,body:{orderId:selected.id,expectedRevision:selected.revision,action,note:form.elements.note.value.trim(),requestId:crypto.randomUUID()}};try{localStorage.setItem(key,JSON.stringify(pending));}catch{pending=null;status('처리 요청을 저장하지 못했습니다.');return;}}
  busy=true;render();status('패키지 처리 결과를 확인하고 있습니다.');
  try{const result=await request('admin/server-support/package',{method:'POST',body:pending.body});if(disposed)return;localStorage.removeItem(key);pending=null;selected=null;busy=false;await load();status(result.order.status==='FULFILLED'?'100조 코인 · 엠퍼러 에너지 200개 · SSS 리미티드 조각 5개 지급 완료':'신청을 반려했습니다.');}
  catch(e){if(disposed)return;if(!e.retryable&&e.status&&e.status<500&&![408,429].includes(e.status)){localStorage.removeItem(key);pending=null;selected=null;}busy=false;render();status(e.message);}finally{busy=false;}
 }
 const click=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.packageOrder){selected=data.pending.find(o=>o.id===b.dataset.packageOrder);render();}if(b.hasAttribute('data-package-admin-refresh'))void load();if(b.hasAttribute('data-package-admin-retry'))void process();if(b.dataset.packageProcess==='REJECT')void process('REJECT');};
 const submit=e=>{e.preventDefault();void process('FULFILL');};root.addEventListener('click',click);root.addEventListener('submit',submit);render();if(!pending)void load();
 return {dispose(){disposed=true;root.removeEventListener('click',click);root.removeEventListener('submit',submit);}};
}
