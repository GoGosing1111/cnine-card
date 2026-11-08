import {SUPPORT_PACKAGE,supportPackageSummary,SUPPORT_PACKAGE_EVENT_DEADLINE} from '../shared/support-package-v1.mjs?v=20261106-package-refresh-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
const passKey=order=>'pass2:'+order.id;
function packageRow(order,fallback){
  const product=order.product||fallback||SUPPORT_PACKAGE;
  return `<article><b>${esc(order.nickname)} <small>· ID ${Number(order.userId)}</small></b><strong>${product.priceWon.toLocaleString('ko-KR')}원 · ${order.quantity??1}회</strong><time>${date(order.createdAt)}</time><span>${esc(product.eventLabel)} · 총 ${product.packageQuantity}개<br>${esc(supportPackageSummary(product))}</span><small>신청 번호 ${esc(order.id)}</small></article>`;
}
function passRow(order){
  return `<article><b>${esc(order.nickname)} <small>· ID ${Number(order.userId)}</small></b><strong>시즌패스 2개월차 · ${Number(order.priceWon).toLocaleString('ko-KR')}원</strong><time>${date(order.createdAt)}</time><button type="button" class="ss-secondary" data-pass-alert-open="${Number(order.userId)}" data-pass-order-id="${esc(order.id)}">CMS에서 입금 확인</button></article>`;
}
// Package and pass notifications share one owner-only request while the page is visible.
export function mountPackageAlerts({root,request,canReceive,onOpen,onPassOpen=()=>{},onCount=()=>{}}){
  const doc=root.ownerDocument||root,storeKey='cnine_support_package_alert_seen_v1:1';
  let disposed=false,controller=null,timer=null,dialog=null,shown=[],signature='';
  function seen(){try{return new Set(JSON.parse(localStorage.getItem(storeKey)||'[]'));}catch{return new Set();}}
  function close(){dialog?.close();dialog?.remove();dialog=null;shown=[];signature='';}
  function acknowledge(keys){
    const ids=seen();keys.forEach(id=>ids.add(id));try{localStorage.setItem(storeKey,JSON.stringify([...ids].slice(-500)));}catch{}close();
  }
  function show(data){
    const orders=data.pending||[],passOrders=data.passPending||[],ids=seen();
    onCount(orders.length,passOrders);
    const packages=orders.filter(o=>!ids.has(o.id)),passes=passOrders.filter(o=>!ids.has(passKey(o)));
    if(!packages.length&&!passes.length){close();return;}
    const next=JSON.stringify([packages,passes,orders.length,passOrders.length]);if(signature===next&&dialog?.open)return;
    signature=next;shown=[...packages.map(o=>o.id),...passes.map(passKey)];
    if(!dialog){
      dialog=doc.createElement('dialog');dialog.className='ss-dialog spkg-alert';root.append(dialog);
      dialog.addEventListener('cancel',e=>{e.preventDefault();acknowledge(shown);});
      dialog.addEventListener('click',e=>{
        const button=e.target.closest('button');if(!button||!canReceive())return;
        if(button.hasAttribute('data-pass-alert-open')){const id=Number(button.dataset.passAlertOpen);const orderId=button.dataset.passOrderId;acknowledge(['pass2:'+orderId]);onPassOpen(id,orderId);}
        else if(button.hasAttribute('data-package-alert-open')){acknowledge(shown.filter(k=>!k.startsWith('pass2:')));onOpen();}
        else if(button.hasAttribute('data-package-alert-close'))acknowledge(shown);
      });
    }
    const title=passes.length?(packages.length?'새 구매 신청이 접수됐습니다':'시즌패스 2개월차 구매 신청이 접수됐습니다'):'패키지 구매가 접수됐습니다';
    dialog.setAttribute('aria-label',passes.length?'시즌패스 구매 접수 알림':'패키지 구매 접수 알림');
    const passHtml=passes.length?`<div class="spkg-alert-orders">${passes.map(passRow).join('')}</div>`:'';
    const packageHtml=packages.length?`<div class="spkg-alert-orders">${packages.map(o=>packageRow(o,data.product)).join('')}</div><p class="spkg-note spkg-deadline-note"><time datetime="${esc(SUPPORT_PACKAGE_EVENT_DEADLINE.endsAt)}">1+1 이벤트 · ${esc(SUPPORT_PACKAGE_EVENT_DEADLINE.label)}</time><br>${esc(SUPPORT_PACKAGE_EVENT_DEADLINE.detail)}</p>`:'';
    dialog.innerHTML=`<section class="spkg"><header class="spkg-hero"><h2>${title}</h2><p>새로운 구매 신청 ${shown.length}건 · 전체 확인 대기 ${orders.length+passOrders.length}건</p></header>${passHtml}${packageHtml}<p class="spkg-note">신청자의 입금 내역을 확인한 뒤 CMS에서 구매를 확정하세요.</p><div class="spkg-actions">${packages.length?'<button type="button" data-package-alert-open>CMS 접수 내역 보기</button>':''}<button type="button" data-package-alert-close>확인 · 닫기</button></div></section>`;
    if(!dialog.open)dialog.showModal();
  }
  async function refresh(){
    if(disposed||controller||!canReceive()||doc.visibilityState==='hidden')return;
    const read=new AbortController();controller=read;
    try{const data=await request('admin/server-support/package/alerts',{signal:read.signal});if(!read.signal.aborted&&!disposed&&canReceive())show(data);}
    catch(e){if(!read.signal.aborted&&[401,403].includes(e.status)){close();onCount(0,[]);}}
    finally{if(controller===read)controller=null;}
  }
  function update(){
    if(disposed)return;
    if(!canReceive()||doc.visibilityState==='hidden'){
      clearInterval(timer);timer=null;controller?.abort();controller=null;
      if(!canReceive()){close();onCount(0,[]);}return;
    }
    if(!timer){timer=setInterval(()=>void refresh(),20000);void refresh();}
  }
  function storage(e){if(e.key!==storeKey)return;const ids=seen();if(dialog&&shown.every(id=>ids.has(id)))close();else if(dialog)void refresh();}
  doc.addEventListener('visibilitychange',update);window.addEventListener('storage',storage);window.addEventListener('cnine:player-updated',update);update();
  return {refresh,dispose(){disposed=true;clearInterval(timer);controller?.abort();doc.removeEventListener('visibilitychange',update);window.removeEventListener('storage',storage);window.removeEventListener('cnine:player-updated',update);close();}};
}
