export const SOOP_CONSENT_URL='https://www.playdk.kr/my/settings/integrations/reversecall';
export const SOOP_NOTICE_VERSION='20261026-v1';
const noticeKey=id=>`cnine_soop_watch_notice:${SOOP_NOTICE_VERSION}:${id}`;

// A notice acknowledgement is never evidence of consent. PLAY DK owns consent
// and withdrawal; only a fresh server-side token exchange can confirm provision.
export function createSoopWatchConsent({getUser,getSession,request,storage=globalThis.localStorage,doc=document,navigate=url=>location.assign(url)}){
  const seen=new Set();
  let dialog=null,owner='',previousFocus=null;
  const identity=()=>`${Number(getUser()?.serverUserId||0)}:${getSession()}`;
  function close(){
    if(!dialog)return;
    const current=dialog;dialog=null;current.close();current.remove();
    if(previousFocus?.isConnected)previousFocus.focus();
  }
  function checkAccount(event){if(dialog&&(owner!==identity()||event?.type==='storage'&&[null,'cnine_card_api_token','cnine_card_user_v10'].includes(event.key)))close();}
  window.addEventListener('cnine:player-updated',checkAccount);
  window.addEventListener('storage',checkAccount);
  function open({automatic=false,verificationResult}={}){
    checkAccount();
    const id=Number(getUser()?.serverUserId||0);
    if(!id||!getSession())return false;
    let acknowledged=seen.has(id);try{acknowledged ||= storage?.getItem(noticeKey(id))==='shown';}catch{}
    if(automatic&&(acknowledged||doc.querySelector('dialog[open],.modal.show,.modal.open,.modal.active,#burningActivationNotice')))return false;
    if(dialog){if(!verificationResult)return true;close();}
    if(!doc.querySelector('[data-soop-consent-style]')){
      const style=doc.createElement('link');style.rel='stylesheet';style.href='/css/soop-watch-consent-v1.css?v='+SOOP_NOTICE_VERSION;style.dataset.soopConsentStyle='';doc.head.append(style);
    }
    owner=identity();previousFocus=doc.activeElement;
    dialog=doc.createElement('dialog');dialog.className='soop-consent-dialog';
    dialog.setAttribute('aria-labelledby','soopConsentTitle');
    dialog.setAttribute('aria-describedby','soopConsentSummary');
    dialog.innerHTML=`<header class="soop-consent-head"><img src="/assets/ui/brand/reverse-call-20261016/icon-192.png?v=20261018-transparent" width="48" height="48" alt=""><span>리버스콜 · 씨나인</span><button type="button" data-soop-close aria-label="시청시간 동의 안내 닫기">×</button></header>
      <div class="soop-consent-body"><p class="soop-consent-eyebrow">선택 동의 안내</p><h2 id="soopConsentTitle">숲 시청시간<br>정보 제공 동의</h2>
      <p id="soopConsentSummary">씨나인 멤버 방송의 시청시간 집계를 위해<br>PLAY DK에서 정보 제공 동의를 설정해 주세요.</p>
      <dl><div><dt>제공 정보</dt><dd>SOOP 아이디와 씨나인 멤버 방송의 기간별 시청시간 합계</dd></div><div><dt>이용 목적</dt><dd>씨나인 멤버 방송 시청시간 집계 및 순위 확인</dd></div><div><dt>과거 기록</dt><dd>동의 이전의 시청기록도 포함될 수 있습니다.</dd></div></dl>
      <p class="soop-consent-choice">동의하지 않아도 게임을 이용할 수 있습니다. 동의는 PLAY DK에서 직접 저장하며, 같은 설정 화면에서 언제든 철회할 수 있습니다. SOOP 계정을 다시 연결하면 재동의가 필요합니다.</p>
      <p data-soop-status role="status" aria-live="polite" hidden></p>
      <a class="soop-consent-primary" href="${SOOP_CONSENT_URL}" target="_blank" rel="noopener noreferrer">PLAY DK에서 동의 설정 <span aria-hidden="true">↗</span></a>
      <p class="soop-consent-next">설정을 저장한 뒤 이 화면으로 돌아와 아래 버튼으로 게임에 다시 연결해 주세요.</p>
      <button class="soop-consent-reconnect" type="button" data-soop-reconnect>동의 후 게임에 다시 연결</button>
      <p class="soop-consent-location">PLAY DK 내 설정 → 외부 서비스 연동 → 리버스콜</p></div>
      <footer><button type="button" data-soop-close>${verificationResult?'닫기':'나중에'}</button><small>메시지함 → 시청시간 동의에서 다시 열 수 있어요.</small></footer>`;
    const current=dialog,status=current.querySelector('[data-soop-status]');
    const setStatus=(message,error=false)=>{status.hidden=false;status.textContent=message;status.dataset.error=String(error);};
    if(verificationResult){
      if(verificationResult.soopWatch?.identityAvailable===true)setStatus('PLAY DK에서 시청시간 정보 제공을 확인했습니다. 이후 동의 상태는 PLAY DK 설정에서 관리할 수 있습니다.');
      else setStatus('현재 시청시간 정보 제공을 확인하지 못했습니다. PLAY DK의 동의·SOOP 연결 상태를 확인해 주세요. 서비스 권한 설정에 따라서도 제공되지 않을 수 있습니다.',true);
    }
    current.querySelectorAll('[data-soop-close]').forEach(button=>button.addEventListener('click',close));
    current.addEventListener('cancel',event=>{event.preventDefault();close();});
    current.querySelector('[data-soop-reconnect]').addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;setStatus('PLAY DK 연결을 준비하고 있습니다.');
      try{
        const result=await request('secondary-verification/status');
        if(dialog!==current||owner!==identity())return checkAccount();
        if(result.verification?.provider==='WAGO')throw Error('현재 계정의 2차 인증 연결은 운영팀에 문의해 주세요. PLAY DK에서 동의 설정은 직접 관리할 수 있습니다.');
        if(!result.playdk?.enabled)throw Error('PLAY DK 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.');
        const url=new URL(result.playdk.startUrl);
        if(url.protocol!=='https:'||!['playdk.kr','www.playdk.kr'].includes(url.hostname)||url.username||url.password||url.port||!/^\/api\/v2\/g\/[a-zA-Z0-9_-]+$/.test(url.pathname)||url.search||url.hash)throw Error('PLAY DK 연결 주소를 확인하지 못했습니다.');
        navigate(url.href);
      }catch(error){if(dialog===current&&owner===identity())setStatus(error.message||'연결을 준비하지 못했습니다. 다시 시도해 주세요.',true);}
      finally{if(dialog===current)button.disabled=false;}
    });
    doc.body.append(current);current.showModal();current.querySelector('[data-soop-close]').focus();
    seen.add(id);try{storage?.setItem(noticeKey(id),'shown');}catch{}
    return true;
  }
  return {open,close,dispose(){close();window.removeEventListener('cnine:player-updated',checkAccount);window.removeEventListener('storage',checkAccount);}};
}
