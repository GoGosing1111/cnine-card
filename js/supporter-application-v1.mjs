import {mountSupportScreenGuard} from './supporter-screen-guard-v1.mjs?v=20261011-guard1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function openSupportApplication({root,getUser,request,signal,now=Date.now,onIssued=()=>{},onMessages=()=>{},onClose=()=>{}}){
  const doc=root.ownerDocument,dialog=doc.createElement('dialog'),userId=Number(getUser()?.serverUserId||getUser()?.id),key='cnine_support_application_pending_v1:'+userId;
  let disposed=false,busy=false,result=null,error='',pending=null,offset=0;
  const identity=()=>{let token='';try{token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{}return Number(getUser()?.serverUserId||getUser()?.id)+':'+token;};
  const who=identity();
  dialog.className='ss-dialog ss-application';dialog.setAttribute('aria-label','후원 신청 안내');root.append(dialog);
  const guard=mountSupportScreenGuard(dialog,{getUser,now:()=>now()+offset});
  const clearPending=()=>{try{localStorage.removeItem(key);}catch{}pending=null;};
  function close(){if(disposed)return;disposed=true;clearInterval(timer);guard.dispose();dialog.close();dialog.remove();signal?.removeEventListener('abort',close);onClose();}
  function render(){
    if(disposed)return;
    const expired=result&&(result.expired||now()+offset>=result.expiresAt),missing=result&&!result.messageId;
    const title=error?'발급 결과를 확인해 주세요':result?(expired||missing?'안내 메시지가 만료되었어요':'메시지함으로 계좌를 보냈어요'):'계좌 안내를 보내고 있어요';
    dialog.innerHTML=`<header class="ss-dialog-head"><span class="ss-brand">SOOPKETMON · 후원 신청</span><button class="ss-close" type="button" data-ss-close aria-label="신청 안내 닫기">×</button></header><div class="ss-dialog-body"><div class="ss-application-art"><img src="/assets/ui/season-pass-v1/supporter-crest.webp" width="92" height="92" alt=""></div><p class="ss-eyebrow">함께 이어가는 30일</p><h2>${title}</h2><p class="ss-application-summary">계좌 정보는 신청한 계정의 <b>메시지함</b>에서 확인할 수 있습니다.<br><b>반드시 게임 닉네임으로 입금해 주세요.</b></p><div class="ss-application-rules"><div><strong>5<small>분</small></strong><span>발급 후 자동 삭제</span></div><div><strong>3<small>회 / 일</small></strong><span>한국시간 자정 초기화</span></div></div><p class="ss-application-note">메시지를 읽지 않아도 발급 5분 뒤 삭제됩니다.<br>운영자의 후원 확인 후 30일 혜택이 적용됩니다.</p><p class="ss-application-status" role="status" aria-live="polite">${esc(error|| (result?`오늘 ${result.application.used} / ${result.application.limit}회 발급 · ${result.application.remaining}회 남음`:'개인 메시지함으로 발송 중입니다…'))}</p>${result&&!expired&&!missing?'<p class="ss-application-countdown" data-ss-countdown></p><button class="ss-apply-button" type="button" data-ss-messages>메시지함 열기 →</button>':result?'<p class="ss-application-note">다시 발급하려면 후원 화면에서 신청해 주세요.</p>':''}${error&&pending?'<button class="ss-apply-button" type="button" data-ss-application-retry>같은 요청으로 결과 확인</button>':''}<button class="ss-application-dismiss" type="button" data-ss-close>${busy?'안내 닫기':'확인'}</button></div>`;
    guard.refresh();tick();
  }
  function tick(){
    if(disposed)return;
    if(identity()!==who){close();return;}
    const el=dialog.querySelector('[data-ss-countdown]');if(!el||!result)return;
    const seconds=Math.max(0,Math.ceil((result.expiresAt-now()-offset)/1000));
    if(!seconds){result.expired=true;render();return;}
    el.textContent=`자동 삭제까지 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  }
  async function send(){
    if(disposed||busy)return;
    try{
      if(!pending){const stored=JSON.parse(localStorage.getItem(key)||'null');pending=typeof stored?.requestId==='string'?stored:{requestId:crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(pending));}
    }catch{error='신청 요청을 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.';render();return;}
    busy=true;error='';render();
    try{
      const value=await request('server-support/apply',{method:'POST',body:pending,signal});
      if(identity()!==who)return;
      clearPending();result=value;offset=value.serverNow-now();onIssued(value);
    }catch(e){
      if(identity()!==who)return;
      error=e.message||'통신이 끊겼습니다. 같은 요청으로 결과를 확인해 주세요.';
      if(e.code==='SUPPORT_APPLICATION_LIMIT'||(!e.retryable&&e.code!=='JOINT_LOCK_BUSY'&&e.status&&e.status<500&&![408,429].includes(e.status)))clearPending();
    }finally{busy=false;if(!disposed)render();}
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-ss-close'))close();else if(b.hasAttribute('data-ss-application-retry'))void send();else if(b.hasAttribute('data-ss-messages')){close();onMessages();}});
  const timer=setInterval(tick,1000);signal?.addEventListener('abort',close,{once:true});
  render();dialog.showModal();guard.refresh();
  // Paint the guidance first, then issue immediately without a second confirmation.
  doc.defaultView.requestAnimationFrame(()=>void send());
  return {dispose:close};
}
