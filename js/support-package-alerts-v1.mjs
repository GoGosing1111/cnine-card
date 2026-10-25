import {SUPPORT_PACKAGE,supportPackageSummary} from '../shared/support-package-v1.mjs?v=20261025-package-bogo-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Owner-only polling: no package/order reads for ordinary players.
export function mountPackageAlerts({root,request,canReceive,onOpen,onCount=()=>{}}){
 const doc=root.ownerDocument||root,storeKey='cnine_support_package_alert_seen_v1:1';let disposed=false,busy=false,dialog=null,shown=[];
 const seen=()=>{try{return new Set(JSON.parse(localStorage.getItem(storeKey)||'[]'));}catch{return new Set();}};
 const close=()=>{dialog?.close();dialog?.remove();dialog=null;shown=[];};
 function acknowledge(){const ids=seen();shown.forEach(o=>ids.add(o.id));try{localStorage.setItem(storeKey,JSON.stringify([...ids].slice(-500)));}catch{}close();}
 async function refresh(){
  if(disposed)return;if(!canReceive()){close();onCount(0);return;}if(busy||doc.visibilityState==='hidden')return;
  busy=true;
  try{const data=await request('admin/server-support/package/alerts');if(disposed||!canReceive())return;onCount(data.pending.length);const ids=seen();shown=data.pending.filter(o=>!ids.has(o.id));if(!shown.length){close();return;}
   if(!dialog){dialog=doc.createElement('dialog');dialog.className='ss-dialog spkg-alert';dialog.setAttribute('aria-label','패키지 구매 접수 알림');root.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();acknowledge();});dialog.addEventListener('click',e=>{if(e.target.closest('[data-package-alert-close]'))acknowledge();if(e.target.closest('[data-package-alert-open]')){acknowledge();onOpen();}});}
   dialog.innerHTML=`<section class="spkg"><header class="spkg-hero"><span>PURCHASE RECEIVED</span><h2>패키지 구매가 접수됐습니다</h2><p>새로운 구매 신청 ${shown.length}건 · 전체 확인 대기 ${data.pending.length}건</p></header><div class="spkg-alert-orders">${shown.map(o=>`<article><b>${esc(o.nickname)} <small>· ID ${o.userId}</small></b><strong>49,800원</strong><time>${new Date(o.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</time><span>${esc((data.product||SUPPORT_PACKAGE).eventLabel)} · 총 2개<br>${esc(supportPackageSummary(data.product||SUPPORT_PACKAGE))}</span><small>신청 번호 ${esc(o.id)}</small></article>`).join('')}</div><p class="spkg-note">입금 확인 후 CMS에서 1+1 패키지 총 2개를 지급하세요.</p><div class="spkg-actions"><button type="button" data-package-alert-open>CMS 접수 내역 보기</button><button type="button" data-package-alert-close>확인 · 닫기</button></div></section>`;
   if(!dialog.open)dialog.showModal();
  }catch(e){if([401,403].includes(e.status))close();}finally{busy=false;}
 }
 const storage=e=>{if(!canReceive()){close();onCount(0);return;}if(e.key===storeKey&&dialog){const ids=seen();if(shown.every(o=>ids.has(o.id)))close();}};
 const changed=()=>{if(!canReceive())close();else void refresh();};
 const timer=setInterval(()=>void refresh(),20000);doc.addEventListener('visibilitychange',changed);window.addEventListener('storage',storage);window.addEventListener('cnine:player-updated',changed);void refresh();
 return {refresh,dispose(){disposed=true;clearInterval(timer);doc.removeEventListener('visibilitychange',changed);window.removeEventListener('storage',storage);window.removeEventListener('cnine:player-updated',changed);close();}};
}
