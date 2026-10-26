import {supportPackageSummary,supportPackageEventDeadline,supportPackageSalesOpen,SUPPORT_PACKAGE_SALES_ENDS_AT} from '../shared/support-package-v1.mjs?v=20261026-package-hide-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountSupportPackage(root,{request,userId,onMessages=()=>{}}){
 let data=null,pending=null,result=null,busy=false,disposed=false,serverOffset=0,deadlineTimer=null;
 const salesOpen=()=>data?.salesOpen!==false&&supportPackageSalesOpen(Date.now()+serverOffset);
 function scheduleClose(){clearTimeout(deadlineTimer);if(disposed||!data||!salesOpen())return;deadlineTimer=setTimeout(()=>{render();scheduleClose();},Math.min(2147483647,Math.max(0,SUPPORT_PACKAGE_SALES_ENDS_AT-Date.now()-serverOffset)));}
 const storageKey='cnine_support_package_pending_v1:'+userId;
 try{pending=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
 const status=text=>{if(!disposed)root.querySelector('[data-package-status]').textContent=text;};
 function render(){
  if(disposed)return;
  if(!data){root.innerHTML='<p data-package-status role="status">패키지 정보를 확인하고 있습니다.</p>';return;}
  if(!salesOpen()){root.innerHTML=`<section class="spkg"><h2>패키지 판매가 종료되었습니다.</h2><p class="spkg-note">기존 구매 신청은 운영자가 입금 확인 후 처리합니다.</p>${pending?`<div class="spkg-actions"><button type="button" data-package-apply ${busy?'disabled':''}>이전 신청 결과 확인</button></div>`:''}${result?.messageId?'<div class="spkg-actions"><button type="button" data-package-messages>메시지함에서 입금 안내 보기</button></div>':''}<p data-package-status role="status" aria-live="polite"></p></section>`;return;}
  const p=data.product,order=result?.order||data.pending,deadline=supportPackageEventDeadline(p);
  root.innerHTML=`<section class="spkg"><header class="spkg-hero"><span>SEASON PASS EXCLUSIVE</span><h2>리버스콜 코인 패키지</h2>${p.eventLabel?`<p class="spkg-event"><b>${esc(p.eventLabel)}</b><span>패키지 총 ${p.packageQuantity}개 지급</span>${deadline?`<span class="spkg-event-deadline"><time datetime="${esc(deadline.endsAt)}">${esc(deadline.label)}</time><small>${esc(deadline.detail)}</small></span>`:''}</p>`:''}<p>시즌패스 활성화 유저 전용 · 서버 개발과 새 엔진 도입에 활용됩니다.</p><strong>${p.priceWon.toLocaleString('ko-KR')}<small>원</small></strong></header><div class="spkg-rewards" aria-label="패키지 총 지급 구성"><article><img src="/${esc(p.coinImage)}" alt=""><span>코인</span><b>${p.coins/1000000000000}조</b></article>${p.items.map(i=>`<article><img src="/${esc(i.image)}" alt="${esc(i.name)}"><span>${esc(i.name)}</span><b>${i.quantity}개</b></article>`).join('')}</div><p class="spkg-note">${esc(p.eventLabel||'')} · ${esc(supportPackageSummary(p))}<br>구매 신청 → 메시지함에서 입금 안내 확인 → 운영자 입금 확인 후 지급<br>시즌패스 이용 기간은 연장되지 않습니다.<br>패키지 코인은 승부예측에 사용할 수 없습니다. 일반 콘텐츠에서는 패키지 코인부터 사용됩니다.</p>${order?`<div class="spkg-receipt"><strong>${order.status==='PENDING'?'구매 신청 접수 · 입금 확인 대기':order.status==='FULFILLED'?`패키지 ${(order.fulfillment||order.product).packageQuantity||1}개 지급 완료`:'신청 반려'}</strong><span>신청 번호 ${esc(order.id)}</span>${result?`<p>${result.messageExpired?'계좌 안내 메시지가 만료되었습니다. 필요하면 다시 발급받아 주세요.':'계좌 안내가 메시지함으로 발송되었습니다. 안내 메시지는 5분 뒤 삭제됩니다.'}</p>`:'<p>이미 접수된 신청입니다. 계좌 안내를 다시 받아도 같은 신청으로 유지됩니다. 중복 입금하지 마세요.</p>'}</div>`:''}<div class="spkg-actions"><button type="button" data-package-apply ${busy?'disabled':''}>${pending?'이전 신청 결과 확인':data.pending?'계좌 안내 다시 받기':'49,800원 · 1+1 구매 신청'}</button>${result?.messageId?'<button type="button" data-package-messages>메시지함에서 입금 안내 보기</button>':''}</div><p data-package-status role="status" aria-live="polite"></p><p class="spkg-note">SSS 리미티드 조각은 별도 재료로 보관됩니다. 교환 방법과 필요 수량은 추후 안내됩니다.</p>${data.recent.some(o=>o.status!=='PENDING')?`<details class="spkg-history"><summary>최근 구매 내역</summary>${data.recent.filter(o=>o.status!=='PENDING').map(o=>`<p>${new Date(o.createdAt).toLocaleString('ko-KR')} · ${o.status==='FULFILLED'?'지급 완료':'반려'}</p>`).join('')}</details>`:''}</section>`;
 }
 async function load(){try{data=await request('server-support/package');if(!disposed){serverOffset=Number.isFinite(data.serverNow)?data.serverNow-Date.now():0;render();scheduleClose();}}catch(e){status(e.message);}}
 async function apply(){
  if(busy||!data||disposed)return;
  if(!pending&&!salesOpen()){render();return;}
  if(!pending){pending={requestId:crypto.randomUUID()};try{localStorage.setItem(storageKey,JSON.stringify(pending));}catch{pending=null;status('신청 요청을 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');return;}}
  busy=true;render();status('구매 신청을 접수하고 있습니다.');
  try{result=await request('server-support/package/apply',{method:'POST',body:pending});if(disposed)return;localStorage.removeItem(storageKey);pending=null;data.pending=result.order.status==='PENDING'?result.order:null;busy=false;render();status(result.replayed?'저장된 신청 결과를 확인했습니다.':'구매 신청이 접수되었습니다.');}
  catch(e){if(disposed)return;if(!e.retryable&&e.status&&e.status<500&&![408,429].includes(e.status)){localStorage.removeItem(storageKey);pending=null;}busy=false;if(e.code==='SUPPORT_PACKAGE_CLOSED')data.salesOpen=false;if([401,403,404].includes(e.status))data=null;render();status(e.message);}
  finally{busy=false;}
 }
 const click=e=>{if(e.target.closest('[data-package-apply]'))void apply();if(e.target.closest('[data-package-messages]'))onMessages();};
 root.addEventListener('click',click);render();void load();
 return {dispose(){disposed=true;clearTimeout(deadlineTimer);root.removeEventListener('click',click);}};
}
