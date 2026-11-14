import {mountSupportApplicationAdmin} from './supporter-application-admin-v1.mjs?v=20261114-month2-purchase';
import {mountSupportPackageAdmin} from './support-package-admin-v1.mjs?v=20261106-package-refresh-v1';
import {mountPackageAlerts} from '../js/support-package-alerts-v1.mjs?v=20261108-pass-purchases';
import {jointAdminRequest} from '../js/joint-account-transport.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const reviewLabels={REJECT_UNPAID:'미입금 거절',HOLD_PURCHASE:'시즌패스 구매 임시 제한',RELEASE_PURCHASE:'시즌패스 구매 제한 해제'};
const actionLabel=r=>r.action==='GRANT'?(r.month??1)+'개월차 · 29,800원':r.action==='REVOKE'?'전체 혜택 중지':reviewLabels[r.action]||r.action;
export function mountSupportAdmin(root,{request=jointAdminRequest,initial=null}={}){
  let state=initial,preview=null,pending=null,busy=false,disposed=false,reviewing=null,passOrders=initial?.passPending||[];
  root.innerHTML=`<div class="ss-admin"><header><span>SERVER SUPPORT · 운영 전용</span><h2>후원 관리</h2><p>후원 내역을 확인한 계정에 30일 혜택을 부여하고, 이용 기간과 처리 기록을 관리합니다.</p></header><section data-pass-orders aria-label="시즌패스 2개월차 구매 신청"></section><div data-support-package-admin></div><div data-support-application-admin></div><div class="ss-admin-summary"><div><small>후원 금액</small><b>30일 · 29,800원</b></div><div><small>기간제 펫 잠재력</small><b>자석 100% · 1마리</b></div><div><small>군단토벌 혜택</small><b>행동력 최대치 +3회</b></div></div><div class="ss-admin-workspace"><section><h3>후원 확인 · 이용 기간 관리</h3><form data-support-form novalidate><label>대상 계정<div class="ss-recipient"><select name="recipientType" aria-label="계정 검색 기준"><option value="NICKNAME">닉네임</option><option value="ID">계정 ID</option></select><input name="recipient" required maxlength="80" placeholder="정확한 닉네임" autocomplete="off" aria-label="후원 대상 계정"></div></label><button type="submit" class="ss-secondary" data-support-check>계정 · 이용 기간 확인</button><label>입금 확인할 시즌패스<select name="passMonth"><option value="">구매 월 선택</option><option value="1">1개월차</option><option value="2">2개월차</option></select></label><label>처리 메모<input name="note" required maxlength="200" placeholder="확인한 후원 내역 또는 중지 사유"></label></form><div data-support-preview class="ss-admin-preview" hidden></div><p data-support-status role="status" aria-live="polite"></p><p>이용 중인 계정은 기존 종료일에 30일을 더합니다. 같은 날 연장해도 군단토벌 행동력은 초기화되지 않습니다.</p></section><section><div class="ss-section-heading"><h3>등록된 후원자</h3><button type="button" class="ss-secondary" data-support-refresh>새로고침</button></div><p>후원 페이지는 가입 3일 이상·2차 인증 완료 유저에게 표시됩니다. CMS 후원 관리는 핑크빛유두 전용입니다.</p><div class="ss-admin-table-wrap"><table><thead><tr><th>계정</th><th>상태</th><th>이용 종료</th></tr></thead><tbody data-support-subscribers></tbody></table></div><p class="ss-footnote">최근 등록·변경된 계정 최대 200명</p></section></div><section class="ss-admin-history"><h3>최근 처리 기록</h3><div class="ss-admin-table-wrap"><table><thead><tr><th>처리 시각</th><th>계정</th><th>처리</th><th>종료일</th><th>확인 메모</th></tr></thead><tbody data-support-history></tbody></table></div></section></div>`;
  const packageAdmin=mountSupportPackageAdmin(root.querySelector('[data-support-package-admin]'),{request});
  const applicationAdmin=mountSupportApplicationAdmin(root.querySelector('[data-support-application-admin]'),{request,onConfig(config){
    if(disposed||!preview)return;
    preview={...preview,firstMonthSalesOpen:config.firstMonthSalesOpen,secondMonthSalesOpen:config.secondMonthSalesOpen};
    render();
  }});
  const $=s=>root.querySelector(s),form=$('[data-support-form]'),storageKey='cnine_support_admin_pending_v1:1';
  const status=(text,error=false)=>{$('[data-support-status]').textContent=text;$('[data-support-status]').classList.toggle('ss-error',error);};
  const lock=()=>{root.querySelectorAll('input,select,button').forEach(el=>{if(el.closest('[data-support-application-admin],[data-support-package-admin]'))return;el.disabled=busy||!state||!!pending&&!el.hasAttribute('data-support-retry')||el.dataset.blocked==='true'});if(reviewing)form.elements.passMonth.disabled=true;};
  function renderOrders(){
    const panel=$('[data-pass-orders]');
    panel.innerHTML=`<h3>시즌패스 2개월차 구매 신청 · 확인 대기 ${passOrders.length}건</h3>${passOrders.length?`<div class="ss-admin-table-wrap"><table><thead><tr><th>신청자</th><th>신청 시각</th><th>신청 처리</th></tr></thead><tbody>${passOrders.map(o=>`<tr><td><b>${esc(o.nickname)}</b><small>ID ${Number(o.userId)}</small></td><td>${date(o.createdAt)}</td><td><button type="button" class="ss-secondary" data-pass-review="${esc(o.id)}" ${pending||busy?'disabled':''}>${Number(o.priceWon).toLocaleString('ko-KR')}원 · 신청 검토</button></td></tr>`).join('')}</tbody></table></div>`:'<p>입금 확인을 기다리는 2개월차 신청이 없습니다.</p>'}`;
  }
  function setPassOrders(orders){
    if(disposed||JSON.stringify(orders)===JSON.stringify(passOrders))return;
    passOrders=orders;
    if(reviewing&&!busy&&!pending&&!orders.some(o=>o.id===reviewing.id)){
      reviewing=null;preview=null;render();status('이미 처리된 2개월차 신청입니다. 목록을 확인하세요.');return;
    }
    renderOrders();
  }
  function render(){
    if(!state)return;
    $('[data-support-subscribers]').innerHTML=state.subscribers.map(r=>`<tr><td><b>${esc(r.target.nickname)}</b><small>ID ${r.target.id}</small></td><td><span class="ss-state ${r.subscription.active?'is-active':''}">${r.subscription.active?'이용 중':r.subscription.revokedAt?'중지':'만료'}</span></td><td>${date(r.subscription.endsAt)}</td></tr>`).join('')||'<tr><td colspan="3">등록된 후원자가 없습니다.</td></tr>';
    $('[data-support-history]').innerHTML=state.history.map(r=>`<tr><td>${date(r.processedAt)}</td><td>${esc(r.target.nickname)}<small>ID ${r.target.id}</small></td><td>${esc(actionLabel(r))}</td><td>${date(r.subscription.endsAt)}</td><td>${esc(r.note)}</td></tr>`).join('')||'<tr><td colspan="5">처리 기록이 없습니다.</td></tr>';
    renderOrders();
    const block=$('[data-support-preview]'),v=preview||pending?.preview;block.hidden=!v;
    if(v){const active=v.subscription.active,end=Math.max(active?v.subscription.endsAt:0,state.serverNow)+30*86400000;
      const month=form.elements.passMonth.value;
      const salesClosed=month==='1'&&v.firstMonthSalesOpen===false||month==='2'&&v.secondMonthSalesOpen===false;
      block.innerHTML=`<h3>${esc(v.target.nickname)} <small>· ID ${v.target.id}</small></h3><dl><div><dt>현재 상태</dt><dd>${active?'이용 중':v.subscription.revokedAt?'중지':v.subscription.endsAt?'만료':'등록 전'}</dd></div><div><dt>현재 종료일</dt><dd>${date(v.subscription.endsAt)}</dd></div><div><dt>30일 추가 후</dt><dd>${date(end)}</dd></div></dl>${v.lastPassApplication?`<p>최근 계좌 안내 신청 · ${v.lastPassApplication.month}개월차 · ${date(v.lastPassApplication.issuedAt)}</p>`:''}<p>${v.eligible?'가입 3일 경과 · 2차 인증 완료':'가입 3일 경과와 2차 인증 완료가 필요합니다.'}</p>${form.elements.passMonth.value==='2'&&!v.secondPassEnabled?'<p>2개월차 보상표를 완성하고 판매를 개방하면 결제를 확인할 수 있습니다.</p>':form.elements.passMonth.value==='2'&&v.subscription.passTerms?.[2]?.revokedAt===null?'<p>이 계정은 이미 2개월차 패스를 구매했습니다.</p>':''}${pending?`<p>${esc(actionLabel(pending.body))} 결과를 확인하고 있습니다. 같은 요청으로 다시 확인해 주세요.</p><button type="button" class="ss-primary" data-support-retry>이전 처리 결과 확인</button>`:`<div class="ss-admin-actions"><button type="button" class="ss-primary" data-support-action="GRANT" data-blocked="${v.purchaseHold?.blocked||!v.eligible||!form.elements.passMonth.value||salesClosed||(form.elements.passMonth.value==='2'&&(v.subscription.passTerms?.[2]?.revokedAt===null||!v.secondPassEnabled))}">${salesClosed?`${month}개월차 판매 종료`:form.elements.passMonth.value?`${form.elements.passMonth.value}개월차 결제 확인`:'구매 월을 선택하세요'}</button><button type="button" class="ss-danger" data-support-action="REVOKE" data-blocked="${!active}">전체 후원 혜택 중지</button></div>`}`;
    }
    if(v){
      const hold=v.purchaseHold||{blocked:false,revision:0};
      const stateLine=block.ownerDocument.createElement('p');
      stateLine.textContent=hold.blocked?'시즌패스 구매 임시 제한 중':'시즌패스 구매 제한 없음';
      block.querySelector('dl').after(stateLine);
      const actions=block.querySelector('.ss-admin-actions');
      if(actions){
        if(reviewing)actions.insertAdjacentHTML('beforeend','<button type="button" class="ss-danger" data-support-action="REJECT_UNPAID">미입금 거절</button>');
        const action=hold.blocked?'RELEASE_PURCHASE':'HOLD_PURCHASE';
        actions.insertAdjacentHTML('beforeend',`<button type="button" class="ss-secondary" data-support-action="${action}">${reviewLabels[action]}</button>`);
      }
    }
    if(reviewing){const revoke=block.querySelector('[data-support-action="REVOKE"]');if(revoke)revoke.hidden=true;}
    lock();
  }
  async function load(){if(busy||pending||disposed)return;busy=true;lock();try{state=await request('admin/server-support');if(disposed)return;passOrders=state.passPending||[];render();status('후원 내역을 확인한 뒤 대상 계정에 혜택을 부여하세요.');}catch(e){if(!disposed)status(e.message,true);}finally{busy=false;if(!disposed)lock();}}
  async function check(e,order=reviewing){e?.preventDefault();if(busy||pending||!form.elements.recipient.reportValidity())return;busy=true;preview=null;reviewing=order;render();status('계정과 현재 이용 기간을 확인하고 있습니다.');try{preview=await request('admin/server-support/preview',{method:'POST',body:{recipientType:form.elements.recipientType.value,recipient:form.elements.recipient.value}});if(disposed)return;if(order&&!passOrders.some(o=>o.id===order.id)){reviewing=null;preview=null;render();status('이미 처리된 2개월차 신청입니다. 목록을 확인하세요.');return;}form.elements.passMonth.value=order?'2':preview.lastPassApplication?String(preview.lastPassApplication.month):'';render();status('입금 내역의 계정과 구매 월을 확인하세요.');}catch(error){if(!disposed)status(error.message,true);}finally{busy=false;if(!disposed)lock();}}
  async function reviewPass(id,orderId){
    if(disposed||busy||pending)return;
    const order=passOrders.find(o=>Number(o.userId)===Number(id)&&(!orderId||o.id===orderId));
    if(!order){status('이미 처리됐거나 목록에 없는 2개월차 신청입니다.',true);return;}
    form.elements.recipientType.value='ID';form.elements.recipient.value=String(order.userId);form.elements.note.value='';
    await check(null,order);
    if(!disposed&&preview&&reviewing===order){form.scrollIntoView({block:'center'});form.elements.note.focus({preventScroll:true});}
  }
  async function change(action){
    if(busy||!pending&&!preview)return;
    if(!pending){
      const isReview=Object.hasOwn(reviewLabels,action);
      if(!isReview&&!form.elements.note.reportValidity())return;
      if(action==='REJECT_UNPAID'&&!reviewing)return;
      const body={userId:preview.target.id,action,note:form.elements.note.value.trim()||(action==='REJECT_UNPAID'?'미입금':reviewLabels[action]),expectedRevision:preview.subscription.revision,requestId:crypto.randomUUID()};
      if(action==='GRANT')body.month=Number(form.elements.passMonth.value);
      if(reviewing&&(action==='GRANT'||action==='REJECT_UNPAID'))body.passApplicationId=reviewing.id;
      if(action==='HOLD_PURCHASE'||action==='RELEASE_PURCHASE')body.expectedHoldRevision=preview.purchaseHold?.revision??0;
      pending={preview,body};
      try{localStorage.setItem(storageKey,JSON.stringify(pending));}catch{pending=null;status('처리 요청을 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.',true);return;}
    }
    busy=true;render();status('처리 결과를 확인하고 있습니다.');
    try{
      const result=await request('admin/server-support',{method:'POST',body:pending.body});
      if(disposed)return;
      const targetPreview=pending.preview;
      localStorage.removeItem(storageKey);pending=null;
      if(result.action==='HOLD_PURCHASE'||result.action==='RELEASE_PURCHASE'){
        preview={...targetPreview,purchaseHold:result.purchaseHold};
      }else{
        preview=null;reviewing=null;
      }
      if(result.passApplicationId)setPassOrders(passOrders.filter(o=>o.id!==result.passApplicationId));
      else if(result.action==='GRANT'&&result.month===2)setPassOrders(passOrders.filter(o=>Number(o.userId)!==Number(result.target.id)));
      state.history=[result,...state.history.filter(r=>r.requestId!==result.requestId)].slice(0,30);
      if(result.action==='GRANT'||result.action==='REVOKE')state.subscribers=[{target:result.target,subscription:result.subscription},...state.subscribers.filter(r=>r.target.id!==result.target.id)];
      state.serverNow=result.processedAt;render();
      const done=result.action==='GRANT'?`${result.month??1}개월차 적용 완료 · 후원 종료 ${date(result.subscription.endsAt)}`:actionLabel(result)+' 완료';
      status(`${result.target.nickname} · ${done}${result.replayed?' · 저장된 처리 결과':''}`);
    }
    catch(error){if(disposed)return;if(!error.retryable&&error.status&&error.status<500&&![408,429].includes(error.status)){localStorage.removeItem(storageKey);pending=null;preview=null;reviewing=null;}render();status(error.message,true);}finally{busy=false;if(!disposed)lock();}
  }
  const click=e=>{const row=e.target.closest('[data-pass-review]');if(row){const order=passOrders.find(o=>o.id===row.dataset.passReview);if(order)void reviewPass(order.userId,order.id);return;}const action=e.target.closest('[data-support-action]');if(action&&!action.disabled)void change(action.dataset.supportAction);if(e.target.closest('[data-support-retry]'))void change();if(e.target.closest('[data-support-refresh]'))void load();};
  const changed=e=>{if(e.target.name==='passMonth'&&!busy&&!pending){render();return;}if(['recipient','recipientType'].includes(e.target.name)&&!busy&&!pending){reviewing=null;preview=null;render();}};
  root.addEventListener('click',click);form.addEventListener('submit',check);form.addEventListener('input',changed);form.addEventListener('change',changed);
  try{pending=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
  if(state){render();status(pending?'이전 처리 결과를 같은 요청으로 확인하세요.':'후원 내역을 확인한 뒤 대상 계정을 조회하세요.');}else void load();
  return {reviewPass,setPassOrders,dispose(){disposed=true;packageAdmin.dispose();applicationAdmin.dispose();root.removeEventListener('click',click);form.removeEventListener('submit',check);form.removeEventListener('input',changed);form.removeEventListener('change',changed);root.replaceChildren();}};
}
function install(){
  const nav=document.getElementById('nav'),cms=document.getElementById('cms');if(!nav||!cms)return;
  const button=document.createElement('button'),panel=document.createElement('section');button.type='button';button.textContent='후원 관리';button.dataset.view='server-support';button.hidden=true;panel.id='view-server-support';panel.className='view';panel.hidden=true;nav.append(button);cms.append(panel);
  let mounted=null,initial=null,epoch=0,alerts=null,identity=null,identityKey=null,loading=false,blocked=false,retryTimer=null,retryCount=0,needsRetry=false,controller=null,openedFromLink=false;
  const sessionKey=value=>{let credential='';try{credential=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';}catch{}return JSON.stringify([value?.role,value?.id,value?.nickname,credential]);};
  const clearView=()=>{button.hidden=true;panel.hidden=true;alerts?.dispose();alerts=null;mounted?.dispose();mounted=null;initial=null;button.textContent='후원 관리';};
  const openPackages=()=>{button.click();panel.querySelector('[data-support-package-admin]')?.scrollIntoView({block:'start'});};
  const openPass=(id,orderId)=>{button.click();void mounted?.reviewPass(id,orderId);};
  async function loadAccess(){
    if(identity?.role!=='OWNER'||blocked||loading)return;
    clearTimeout(retryTimer);retryTimer=null;
    const turn=epoch;loading=true;controller=new AbortController();
    try{
      const value=await jointAdminRequest('admin/server-support',{signal:controller.signal});
      if(turn!==epoch)return;
      if(value.adminId!==1){blocked=true;clearView();return;}
      initial=value;button.hidden=false;retryCount=0;needsRetry=false;
      alerts||=mountPackageAlerts({root:document.body,request:jointAdminRequest,canReceive:()=>!button.hidden,onOpen:openPackages,onPassOpen:openPass,onCount:(n,orders=[])=>{if(initial)initial.passPending=orders;mounted?.setPassOrders(orders);button.textContent=['후원 관리',...(orders.length?['2개월차 '+orders.length+'건']:[]),...(n?['패키지 '+n+'건']:[])].join(' · ');}});
      const params=new URL(location.href).searchParams;
      if(!openedFromLink&&params.get('supportPassMonth')==='2'){openedFromLink=true;openPass(params.get('userId'),params.get('supportPassOrder'));}
      if(!openedFromLink&&params.has('supportPackage')){openedFromLink=true;openPackages();}
    }catch(error){
      if(turn!==epoch)return;
      if(error.code==='ACCOUNT_RESPONSE_STALE'){identityKey=null;sync();return;}
      if([401,403].includes(error.status)){blocked=true;clearView();return;}
      // A transient read failure is not a permission denial. Keep a verified
      // operator's open form intact and retry only this read, never a payment.
      needsRetry=true;
      if(retryCount<3)retryTimer=setTimeout(()=>{retryTimer=null;void loadAccess();},[1000,3000,10000][retryCount++]);
    }finally{if(turn===epoch){loading=false;controller=null;}}
  }
  function sync(event){
    const next=event?.detail||globalThis.__SOOP_CMS_IDENTITY__,key=sessionKey(next);
    if(key!==identityKey){
      epoch++;controller?.abort();controller=null;clearTimeout(retryTimer);retryTimer=null;
      loading=false;blocked=false;needsRetry=false;retryCount=0;openedFromLink=false;
      identity=next;identityKey=key;clearView();
    }
    // The CMS shell may re-show navigation while refreshing identity.
    button.hidden=identity?.role!=='OWNER'||blocked||!initial;
    if(identity?.role==='OWNER'&&!blocked)void loadAccess();
  }
  const wake=()=>{
    if(document.visibilityState==='hidden')return;
    if(sessionKey(globalThis.__SOOP_CMS_IDENTITY__)!==identityKey){sync();return;}
    if(needsRetry&&!blocked){retryCount=0;void loadAccess();}
  };
  button.addEventListener('click',event=>{event.stopImmediatePropagation();if(button.hidden)return;document.querySelectorAll('.view').forEach(v=>v.hidden=v!==panel);document.querySelectorAll('#nav [data-view]').forEach(b=>b.classList.toggle('active',b===button));document.getElementById('pageTitle').textContent='후원 관리';mounted||=mountSupportAdmin(panel,{initial});if(matchMedia('(max-width:800px)').matches)window.scrollTo(0,0);},true);
  window.addEventListener('soop:cms-identity',sync);window.addEventListener('online',wake);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);sync();
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();}
