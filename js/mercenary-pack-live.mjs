import {jointAccountRequest as api} from './joint-account-transport.mjs';
import {MERCENARY_PACK,mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs?v=2134-receipt-art-v2';
import {MercenaryAcquisitionVideo,withPresentationDeadline} from './mercenary-acquisition-video.mjs?v=2145';

let busy=false,activeAuto=null,access={connected:true,userOpeningEnabled:null},statusText='개봉 상태를 확인하고 있습니다.';
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const notice=text=>{statusText=text;for(const node of document.querySelectorAll('[data-mercenary-open-status]'))if(node.textContent!==text)node.textContent=text;};
// 결과 목록은 원본 PNG(평균 2.37MB)가 아니라 용병도감이 이미 쓰는 640 webp(평균 129KB)를 읽는다.
// 원본은 webp가 없을 때만 내려받고, 그 사실을 콘솔에 남긴다.
const mercenaryArtUrl=code=>`/assets/ui/project-v/mercenaries/codex-v1/${String(code||'').toLowerCase()}-art-640.webp`;
// loadUser()는 계정 JSON 전체를 파싱한다. DOM 변경마다 부르면 로비·전투 프레임을 깎으므로
// 계정 또는 개봉 저장소가 실제로 바뀐 순간에만 다시 읽는다.
let accountCache=null;
const invalidateAccount=()=>{accountCache=null;};
function accountFlags(){
  if(accountCache)return accountCache;
  let accountId=0,hasPending=false,hasReceipt=false;
  try{
    accountId=Number(globalThis.loadUser?.()?.serverUserId)||0;
    if(accountId>0){hasPending=Boolean(localStorage.getItem(`cnine.mercenary.pack.pending:${accountId}`));hasReceipt=Boolean(localStorage.getItem(`cnine.mercenary.pack.receipt:${accountId}`));}
  }catch(error){console.warn('MERCENARY_PACK_ACCOUNT_READ_FAILED',error?.message||error);}
  accountCache={accountId,hasPending,hasReceipt};return accountCache;
}
function syncButtons(){
  for(const button of document.querySelectorAll('[data-mercenary-open]'))button.disabled=busy||Boolean(activeAuto)||access.userOpeningEnabled!==true;
  for(const button of document.querySelectorAll('[data-mercenary-auto]'))button.disabled=busy||Boolean(activeAuto)||access.userOpeningEnabled!==true;
  for(const button of document.querySelectorAll('[data-mercenary-repeat]'))button.disabled=busy||button.dataset.ready!=='true'||access.userOpeningEnabled!==true;
  for(const label of document.querySelectorAll('[data-hyper-opening-label]')){const value=access.userOpeningEnabled?'용병 계약 개봉 가능':'현재 개봉 준비 중';if(label.textContent!==value)label.textContent=value;}
  const {hasPending,hasReceipt}=accountFlags();
  for(const button of document.querySelectorAll('[data-mercenary-recover]')){button.hidden=!hasPending&&!hasReceipt;button.disabled=busy;button.setAttribute('aria-busy',String(busy));const label=hasPending?'이전 개봉 처리 확인':'최근 개봉 결과';if(button.textContent!==label)button.textContent=label;}
  notice(statusText);
}
// DOM 변경 한 건마다 동기로 돌면 앱 전체가 느려진다. 프레임당 한 번으로 합친다.
let syncQueued=false;
const frame=typeof requestAnimationFrame==='function'?requestAnimationFrame:fn=>{void Promise.resolve().then(fn);};
function requestSync(){if(syncQueued)return;syncQueued=true;frame(()=>{syncQueued=false;syncButtons();});}
async function feature(){const before=access.userOpeningEnabled;access=await api(MERCENARY_PACK.featurePath);syncButtons();if(before!==access.userOpeningEnabled){notice(access.userOpeningEnabled?'1회 5억 코인 · 등급별 확률·용병별 가중치로 추첨합니다.':'하이퍼팩 개봉은 현재 OFF입니다.');window.dispatchEvent(new CustomEvent('mercenary-pack:availability',{detail:access}));}return access;}
function stylesheet(){if(document.querySelector('[data-mercenary-pack-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-pack-live.css?v=20260924-auto-fast';link.dataset.mercenaryPackStyle='';document.head.append(link);}
const scripts=new Map();
function script(path,ready){
  if(ready())return Promise.resolve();if(scripts.has(path))return scripts.get(path);
  const promise=new Promise((resolve,reject)=>{
    // Do not wait on the already-fired load event of an older FX version.
    const el=document.createElement('script');el.src=path;
    const fail=message=>{clearTimeout(timer);el.remove();reject(Error(message));};
    const timer=setTimeout(()=>fail('개봉 연출을 불러오지 못했습니다.'),15000);
    el.addEventListener('load',()=>{clearTimeout(timer);ready()?resolve():fail('개봉 모듈을 확인하세요.');},{once:true});
    el.addEventListener('error',()=>fail('개봉 연출을 불러오지 못했습니다.'),{once:true});document.head.append(el);
  });
  scripts.set(path,promise);promise.catch(()=>scripts.delete(path));return promise;
}
// 연출 단계는 어떤 이유로도 무한 대기하면 안 된다. 대기가 끝나지 않으면 오류를 그대로 올려
// 저장된 결과 목록으로 떨어뜨린다. 결과는 이미 계정에 지급된 뒤다.
function withDeadline(promise,ms,message){
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}

export async function showMercenaryReceipt(receipt,{onClose,onRepeat,autoSession}={}){
  const results=mercenaryPackResults(receipt);
  // 자동 모드는 영수증만 표시한다. 카드/영상/FX를 만들거나 자원을 기다리지 않는다.
  if(autoSession){
    autoSession.showResults(results);
    if(autoSession.completed<autoSession.total&&autoSession.canContinue())await new Promise(resolve=>setTimeout(resolve,120));
    return;
  }
  stylesheet();
  const dialog=document.createElement('dialog');dialog.className='mercenary-pack-dialog';dialog.classList.toggle('batch',results.length>1);
  if(results.some(result=>result.kind==='MERCENARY'&&['SS','SSS'].includes(result.rank)))dialog.dataset.cinematics='true';
  dialog.innerHTML='<header><div><span>HYPER PACK · CONTRACT</span><h2>계약 결과</h2></div><button type="button" data-close aria-label="개봉 결과 닫기">닫기</button></header><p class="mercenary-pack-receipt" role="status"></p><div class="mercenary-pack-stage" aria-hidden="true"></div><div class="mercenary-pack-controls"><button type="button" data-pause disabled>일시정지</button><button type="button" data-skip disabled>결과 바로 보기</button></div><ol class="mercenary-pack-results"></ol><footer><a href="/mercenary-codex/?view=owned">내 용병 확인·편성</a><span>획득 결과는 계정에 저장됐습니다.</span></footer>';
  const status=dialog.querySelector('[role="status"]');status.textContent=`${receipt.replayed?'저장된 결과 복구 · ':''}${results.length}회 개봉${receipt.coinCost?` · ${fmt(receipt.coinCost)} 코인`:''}`;
  const repeat=document.createElement('button');repeat.type='button';repeat.className='mercenary-pack-repeat';repeat.dataset.mercenaryRepeat=String(results.length);repeat.disabled=true;
  repeat.innerHTML=`<strong>${results.length}회 더 개봉</strong><span>${fmt(MERCENARY_PACK.price*results.length)} 코인</span>`;
  if(onRepeat)dialog.querySelector('footer').append(repeat);
  const list=dialog.querySelector('ol');for(const result of results){
    const li=document.createElement('li');li.dataset.kind=result.kind;
    if(result.kind==='MERCENARY'||result.kind==='MYSTIC_ENERGY'){
      const img=new Image();img.loading='lazy';img.decoding='async';
      if(result.kind==='MERCENARY'){
        const original='/'+result.sourceArt.replace(/^\//,'');
        img.src=mercenaryArtUrl(result.mercenaryCode);img.alt=result.name;
        img.addEventListener('error',()=>{if(img.getAttribute('src')===original)return;console.warn('MERCENARY_ART_WEBP_UNAVAILABLE',result.mercenaryCode);img.src=original;},{once:true});
      }else{img.src='/assets/items/starlight-armor-core-v1749.png';img.alt='미스틱 에너지';}
      li.append(img);
    }
    else{const icon=document.createElement('span');icon.className='reward-symbol';icon.textContent=result.kind==='MASTER_STAR'?'★':'—';li.append(icon);}
    const title=document.createElement('b'),detail=document.createElement('span');
    title.textContent=result.kind==='MERCENARY'?`${result.rank} · ${result.name}`:result.kind==='MASTER_STAR'?'마스터의 별':result.kind==='MYSTIC_ENERGY'?'미스틱 에너지':'꽝';
    detail.textContent=result.kind==='MERCENARY'?result.duplicate?`중복 +1 · 누적 ${fmt(result.duplicateCount)}장`:'새 용병 계약':result.kind==='MISS'?'획득 없음':`${fmt(result.quantity)}개`;
    li.append(title,detail);list.append(li);
  }
  let fx,closed=false;const pause=dialog.querySelector('[data-pause]'),skip=dialog.querySelector('[data-skip]');
  const cinematic=new MercenaryAcquisitionVideo(dialog.querySelector('.mercenary-pack-stage'));
  const leave=()=>{autoSession?.stop();close(false);};const close=(acknowledge=true)=>{if(closed)return;closed=true;if(acknowledge)autoSession?.stop();fx?.destroy();cinematic.destroy();window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',visibility);dialog.close();dialog.remove();if(acknowledge)onClose?.();};
  dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  // 결제는 이미 확정된 뒤다. 닫고 나서 다음 개봉을 시작해야 잠금과 겹치지 않는다.
  repeat.onclick=()=>{if(closed||repeat.disabled)return;repeat.disabled=true;close();void Promise.resolve().then(onRepeat);};
  pause.onclick=()=>fx?.pause();skip.onclick=()=>fx?.skip();
  const visibility=()=>{if(document.hidden){autoSession?.stop();if(fx?.running&&!fx.paused)fx.pause();}};document.addEventListener('visibilitychange',visibility);
  dialog.addEventListener('close',()=>document.removeEventListener('visibilitychange',visibility),{once:true});
  window.addEventListener('pagehide',leave,{once:true});document.body.append(dialog);dialog.showModal();
  try{
    await script('/js/ui-fx-vendor-v2045.bundle.js',()=>Boolean(globalThis.CNineUiFxVendor));
    await script('/js/hyper-pack-fx-v2076.bundle.js?v=2145',()=>globalThis.HyperPackFX?.version>=2145);
    if(closed)return;
    fx=globalThis.HyperPackFX.create(dialog.querySelector('.mercenary-pack-stage'),event=>{if(closed)return;dialog.dataset.phase=event.state;pause.disabled=!fx?.running||fx.loading;skip.disabled=!fx?.running;pause.textContent=event.state==='paused'?'계속 재생':'일시정지';},{live:true,cinematic});
    await withDeadline(fx.init(),20000,'개봉 연출 자원을 불러오지 못했습니다.');if(closed){fx.destroy();return;}
    await withPresentationDeadline(fx.play(results),()=>fx.paused||document.hidden,45000+results.length*20000);
  }catch(error){autoSession?.stop('연출 오류로 자동 개봉을 중지했습니다.');console.warn('MERCENARY_PACK_FX_FAILED',error?.message||error);fx?.destroy();cinematic.destroy();if(!closed){dialog.dataset.phase='complete';pause.disabled=skip.disabled=true;status.textContent+=` · ${error?.message||'연출을 불러오지 못했습니다.'} 저장된 결과를 표시합니다.`;dialog.querySelector('.mercenary-pack-stage').hidden=true;}}
  finally{if(!closed){repeat.dataset.ready='true';syncButtons();}}
}

async function open(count=1,{recoverOnly=false,autoSession=null}={}){
  if(activeAuto&&autoSession!==activeAuto){notice('자동 개봉을 먼저 중지해 주세요.');return false;}
  // 잠겨 있을 때 조용히 끝내면 버튼이 고장난 것처럼 보인다. 이유를 반드시 남긴다.
  if(busy){notice('이전 개봉 요청을 처리하고 있습니다. 잠시 후 다시 확인해 주세요.');return false;}
  if(!Number.isInteger(count)||count<1||count>MERCENARY_PACK.maxCount)throw Error('개봉 횟수를 확인하세요.');
  busy=true;invalidateAccount();syncButtons();let key,pending,released=false;
  const release=()=>{if(released)return;released=true;busy=false;invalidateAccount();syncButtons();};
  try{
    await feature();
    const state=await api(MERCENARY_PACK.statePath);
    if(autoSession&&(!autoSession.canContinue()||Number(state.accountId)!==autoSession.accountId))return false;
    key=`cnine.mercenary.pack.pending:${state.accountId}`;
    try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    if(autoSession&&pending){notice('이전 개봉 처리 확인 후 자동 개봉을 시작해 주세요.');return false;}
    const receiptKey=`cnine.mercenary.pack.receipt:${state.accountId}`;
    const validatePending=value=>{if(typeof value?.requestId!=='string'||!Number.isInteger(value.count)||value.count<1||value.count>MERCENARY_PACK.maxCount)throw Error('이전 개봉 요청 정보를 확인하세요.');};
    const readReceipt=async value=>{try{return await api(MERCENARY_PACK.receiptPath+'?requestId='+encodeURIComponent(value.requestId));}catch(error){if(error.status!==404)throw error;return null;}};
    const completeReceipt=result=>{
      const results=mercenaryPackResults(result);
      if(result.requestId!==pending.requestId||results.length!==pending.count)throw Object.assign(Error('요청한 횟수와 개봉 결과가 다릅니다. 이전 개봉 처리를 확인하세요.'),{code:'MERCENARY_RECEIPT_MISMATCH'});
      localStorage.setItem(receiptKey,JSON.stringify({requestId:result.requestId,count:results.length}));
      if(localStorage.getItem(key)===JSON.stringify(pending))localStorage.removeItem(key);
      invalidateAccount();
    };
    let result;
    if(pending){
      validatePending(pending);result=await readReceipt(pending);
      if(result?.status==='COMPLETED'){
        completeReceipt(result);
        // A normal click starts the newly selected amount. Old completed draws
        // are only displayed by the explicit recovery button.
        if(!recoverOnly){pending=null;result=null;}
      }else if(!recoverOnly&&pending.count!==count){
        notice(`이전 ${pending.count}회 개봉 처리를 먼저 확인해 주세요. 선택한 ${count}회 개봉은 아직 실행하지 않았습니다.`);return false;
      }
    }
    if(!pending){
      if(recoverOnly){
        try{pending=JSON.parse(localStorage.getItem(receiptKey)||'null');}catch{}
        if(!pending){notice('확인할 이전 개봉이 없습니다.');return false;}
        validatePending(pending);result=await readReceipt(pending);
        if(result?.status!=='COMPLETED'){notice('저장된 개봉 결과를 확인하지 못했습니다. 다시 조회해 주세요.');return false;}
      }else{
        if(access.userOpeningEnabled!==true||!(state.openingAvailable??state.available)){notice('하이퍼팩 개봉은 현재 OFF입니다.');return false;}
        pending={requestId:crypto.randomUUID(),count};localStorage.setItem(key,JSON.stringify(pending));invalidateAccount();
      }
    }
    if(result?.status!=='COMPLETED'){
      if(autoSession&&!autoSession.canContinue())return false;
      if(access.userOpeningEnabled!==true){notice('개봉은 OFF입니다. 아직 완료되지 않은 요청은 보관합니다.');return false;}
      result=await api(pending.count>1?MERCENARY_PACK.batchPath:MERCENARY_PACK.openPath,{method:'POST',body:pending});
    }
    completeReceipt(result);notice(`${result.draws.length}회 개봉 결과를 계정에 저장했습니다.`);
    if(autoSession){autoSession.completed+=result.draws.length;autoSession.update();}
    window.dispatchEvent(new CustomEvent('mercenary-pack:complete',{detail:{accountId:state.accountId,requestId:result.requestId}}));
    // 결제와 지급은 여기서 끝났다. 연출이 끝날 때까지 잠금을 쥐고 있으면 연출 자원이
    // 지연되는 동안 개봉·복구 버튼이 전부 눌리지 않는다.
    release();
    await showMercenaryReceipt(result,{onRepeat:autoSession?undefined:()=>open(result.draws.length),autoSession});return true;
  }catch(error){
    // These responses precede a saved transaction, or explicitly cancel it.
    // Keep uncertain/in-flight requests so retries cannot charge twice.
    if(key&&pending&&['MERCENARY_FUNDS','MERCENARY_COUNT','MERCENARY_PRICE_PENDING','MERCENARY_DRAW_PENDING','JOINT_OPERATION_SUPERSEDED'].includes(error.code)&&localStorage.getItem(key)===JSON.stringify(pending))localStorage.removeItem(key);
    notice(error.message);return false;
  }
  finally{release();}
}

function configureAutoOpening(){
  if(busy||activeAuto||document.querySelector('.mercenary-auto-dialog'))return;
  stylesheet();
  const dialog=document.createElement('dialog');dialog.className='mercenary-pack-dialog mercenary-auto-dialog';
  dialog.innerHTML='<header><div><span>HYPER PACK · QUICK RESULTS</span><h2>자동 개봉</h2></div><button type="button" data-auto-close>닫기</button></header><p>연출 없이 결과만 빠르게 확인합니다. 진행 중 언제든 중지할 수 있습니다.</p><div class="mercenary-auto-fields"><label>총 개봉 횟수<input data-auto-total type="number" min="1" max="1000" step="1" value="10" inputmode="numeric"></label><label>한 번에 개봉<select data-auto-batch><option value="10">10회씩</option><option value="1">1회씩</option></select></label></div><p class="mercenary-auto-cost" data-auto-cost></p><p class="mercenary-auto-status" role="status">잔액 부족·오류·화면 이탈 시 자동 중지됩니다.</p><ol class="mercenary-auto-results" data-auto-results aria-label="최근 개봉 결과 20개" hidden></ol><footer><button type="button" data-auto-start>자동 개봉 시작</button><button type="button" data-auto-stop hidden>자동 개봉 중지</button></footer>';
  const total=dialog.querySelector('[data-auto-total]'),batch=dialog.querySelector('[data-auto-batch]'),start=dialog.querySelector('[data-auto-start]'),stop=dialog.querySelector('[data-auto-stop]'),status=dialog.querySelector('[role="status"]');
  const quote=()=>{const n=Number(total.value),valid=Number.isInteger(n)&&n>=1&&n<=1000;start.disabled=!valid;dialog.querySelector('[data-auto-cost]').textContent=valid?`총 ${fmt(n)}회 · 최대 ${fmt(n*MERCENARY_PACK.price)} 코인 사용`:'1~1,000 사이의 정수로 입력해 주세요.';};total.oninput=quote;quote();
  let session=null;
  const close=()=>{session?.stop();dialog.close();dialog.remove();};dialog.querySelector('[data-auto-close]').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  start.onclick=async()=>{
    const n=Number(total.value),chunk=Number(batch.value);if(busy||activeAuto||!Number.isInteger(n)||n<1||n>1000||![1,10].includes(chunk))return;
    invalidateAccount();const {accountId,hasPending}=accountFlags();
    if(!accountId||hasPending){status.textContent=hasPending?'이전 개봉 처리를 먼저 확인해 주세요.':'로그인 상태를 확인해 주세요.';return;}
    session={accountId,total:n,completed:0,stopped:false,reason:'',results:[],
      stop(reason='자동 개봉을 중지했습니다. 처리 중인 요청은 결과까지 확인합니다.'){this.stopped=true;this.reason=reason;this.update();},
      canContinue(){invalidateAccount();return !this.stopped&&!document.hidden&&dialog.isConnected&&accountFlags().accountId===this.accountId;},
      update(){status.textContent=`${this.completed} / ${this.total}회 완료 · ${this.reason||'자동 개봉 진행 중'}`;},
      showResults(results){
        this.results.push(...results.map((result,index)=>({...result,sequence:this.completed-results.length+index+1})));
        this.results=this.results.slice(-20);
        const list=dialog.querySelector('[data-auto-results]'),fragment=document.createDocumentFragment();
        for(const result of [...this.results].reverse()){
          const row=document.createElement('li'),sequence=document.createElement('small'),title=document.createElement('b'),detail=document.createElement('span');
          row.dataset.rank=result.rank||'';sequence.textContent=`${fmt(result.sequence)}회`;
          title.textContent=result.kind==='MERCENARY'?`${result.rank} · ${result.name}`:result.kind==='MASTER_STAR'?'마스터의 별':result.kind==='MYSTIC_ENERGY'?'미스틱 에너지':'꽝';
          detail.textContent=result.kind==='MERCENARY'?result.duplicate?`중복 +1 · 누적 ${fmt(result.duplicateCount)}장`:'새 용병 계약':result.kind==='MISS'?'획득 없음':`+${fmt(result.quantity)}개`;
          row.append(sequence,title,detail);fragment.append(row);
        }
        list.replaceChildren(fragment);list.hidden=false;
      }
    };
    activeAuto=session;total.disabled=batch.disabled=start.disabled=true;start.hidden=true;dialog.querySelector('.mercenary-auto-fields').hidden=true;dialog.dataset.autoPhase='running';stop.hidden=false;stop.onclick=()=>session.stop();stop.focus();syncButtons();session.update();
    const leave=()=>session.stop('화면 이탈로 자동 개봉을 중지했습니다.');
    const hidden=()=>{if(document.hidden)leave();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);window.addEventListener('cnine:route-will-change',leave);
    try{
      while(session.completed<n&&session.canContinue()){
        const ok=await open(Math.min(chunk,n-session.completed),{autoSession:session});
        if(!ok){session.stop(statusText);break;}
      }
      if(!session.reason)session.reason=session.completed===n?'자동 개봉 완료':'자동 개봉 중지';
    }finally{
      document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);window.removeEventListener('cnine:route-will-change',leave);
      activeAuto=null;stop.hidden=true;start.hidden=true;dialog.dataset.autoPhase='done';session.update();syncButtons();
    }
  };
  document.body.append(dialog);dialog.showModal();
}
globalThis.MercenaryPack=Object.freeze({open,recover:()=>open(1,{recoverOnly:true}),showReceipt:showMercenaryReceipt,feature:()=>({...access})});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-mercenary-open],[data-mercenary-recover]');if(button&&!button.disabled){event.preventDefault();void open(Number(button.dataset.mercenaryOpen||1),{recoverOnly:button.hasAttribute('data-mercenary-recover')});}});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-mercenary-auto]');if(button&&!button.disabled){event.preventDefault();configureAutoOpening();}});
const observer=new MutationObserver(requestSync);observer.observe(document.body,{childList:true,subtree:true});
let featureFlight;const refreshFeature=()=>{if(document.hidden||featureFlight)return;invalidateAccount();featureFlight=feature().catch(()=>{access={...access,userOpeningEnabled:false};notice('개봉 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');syncButtons();}).finally(()=>featureFlight=null);};
const pollFeature=()=>{if(document.querySelector('[data-mercenary-open]'))refreshFeature();};let timer=setInterval(pollFeature,15000);
addEventListener('focus',refreshFeature);addEventListener('storage',event=>{invalidateAccount();if(event.key==='cnine.hyper-opening.changed')refreshFeature();else requestSync();});document.addEventListener('visibilitychange',refreshFeature);
addEventListener('cnine:account-mutation',()=>{invalidateAccount();requestSync();});
// Login/profile saves also replace the same-tab account without a storage event.
addEventListener('cnine:player-updated',()=>{invalidateAccount();requestSync();});
addEventListener('pagehide',()=>{observer.disconnect();clearInterval(timer);});
addEventListener('pageshow',event=>{if(event.persisted){observer.observe(document.body,{childList:true,subtree:true});clearInterval(timer);timer=setInterval(pollFeature,15000);invalidateAccount();syncButtons();refreshFeature();}});refreshFeature();
