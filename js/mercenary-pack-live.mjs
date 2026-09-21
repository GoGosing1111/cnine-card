import {jointAccountRequest as api} from './joint-account-transport.mjs';
import {MERCENARY_PACK,mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs';

let busy=false,access={connected:true,userOpeningEnabled:null},statusText='개봉 상태를 확인하고 있습니다.';
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const notice=text=>{statusText=text;for(const node of document.querySelectorAll('[data-mercenary-open-status]'))if(node.textContent!==text)node.textContent=text;};
function syncButtons(){
  for(const button of document.querySelectorAll('[data-mercenary-open]'))button.disabled=busy||access.userOpeningEnabled!==true;
  for(const button of document.querySelectorAll('[data-mercenary-repeat]'))button.disabled=busy||button.dataset.ready!=='true'||access.userOpeningEnabled!==true;
  for(const label of document.querySelectorAll('[data-hyper-opening-label]')){const value=access.userOpeningEnabled?'용병 계약 개봉 가능':'현재 개봉 준비 중';if(label.textContent!==value)label.textContent=value;}
  const accountId=Number(globalThis.loadUser?.()?.serverUserId);let hasPending=false,hasReceipt=false;try{hasPending=accountId>0&&Boolean(localStorage.getItem(`cnine.mercenary.pack.pending:${accountId}`));hasReceipt=accountId>0&&Boolean(localStorage.getItem(`cnine.mercenary.pack.receipt:${accountId}`));}catch{}
  for(const button of document.querySelectorAll('[data-mercenary-recover]')){button.hidden=!hasPending&&!hasReceipt;button.disabled=busy;const label=hasPending?'이전 개봉 처리 확인':'최근 개봉 결과';if(button.textContent!==label)button.textContent=label;}
  notice(statusText);
}
async function feature(){const before=access.userOpeningEnabled;access=await api(MERCENARY_PACK.featurePath);syncButtons();if(before!==access.userOpeningEnabled){notice(access.userOpeningEnabled?'1회 5억 코인 · 같은 등급의 용병은 균등 추첨합니다.':'하이퍼팩 개봉은 현재 OFF입니다.');window.dispatchEvent(new CustomEvent('mercenary-pack:availability',{detail:access}));}return access;}
function stylesheet(){if(document.querySelector('[data-mercenary-pack-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-pack-live.css?v=2098';link.dataset.mercenaryPackStyle='';document.head.append(link);}
const scripts=new Map();
function script(path,ready){if(ready())return Promise.resolve();if(scripts.has(path))return scripts.get(path);const promise=new Promise((resolve,reject)=>{let el=[...document.scripts].find(s=>new URL(s.src||location.href).pathname===path.split('?')[0]);const existing=Boolean(el);el||=document.createElement('script');const timer=setTimeout(()=>reject(Error('개봉 연출을 불러오지 못했습니다.')),15000);el.addEventListener('load',()=>{clearTimeout(timer);ready()?resolve():reject(Error('개봉 모듈을 확인하세요.'));},{once:true});el.addEventListener('error',()=>{clearTimeout(timer);reject(Error('개봉 연출을 불러오지 못했습니다.'));},{once:true});if(!existing){el.src=path;document.head.append(el);}});scripts.set(path,promise);promise.catch(()=>scripts.delete(path));return promise;}

export async function showMercenaryReceipt(receipt,{onClose,onRepeat}={}){
  const results=mercenaryPackResults(receipt);stylesheet();
  const dialog=document.createElement('dialog');dialog.className='mercenary-pack-dialog';dialog.classList.toggle('batch',results.length>1);
  dialog.innerHTML='<header><div><span>HYPER PACK · CONTRACT</span><h2>계약 결과</h2></div><button type="button" data-close aria-label="개봉 결과 닫기">닫기</button></header><p class="mercenary-pack-receipt" role="status"></p><div class="mercenary-pack-stage" aria-hidden="true"></div><div class="mercenary-pack-controls"><button type="button" data-pause disabled>일시정지</button><button type="button" data-skip disabled>결과 바로 보기</button></div><ol class="mercenary-pack-results"></ol><footer><a href="/mercenary-codex/?view=owned">내 용병 확인·편성</a><span>획득 결과는 계정에 저장됐습니다.</span></footer>';
  const status=dialog.querySelector('[role="status"]');status.textContent=`${receipt.replayed?'저장된 결과 복구 · ':''}${results.length}회 개봉${receipt.coinCost?` · ${fmt(receipt.coinCost)} 코인`:''}`;
  const repeat=document.createElement('button');repeat.type='button';repeat.className='mercenary-pack-repeat';repeat.dataset.mercenaryRepeat=String(results.length);repeat.disabled=true;
  repeat.innerHTML=`<strong>${results.length}회 더 개봉</strong><span>${fmt(MERCENARY_PACK.price*results.length)} 코인</span>`;
  if(onRepeat)dialog.querySelector('footer').append(repeat);
  const list=dialog.querySelector('ol');for(const result of results){
    const li=document.createElement('li');li.dataset.kind=result.kind;
    if(result.kind==='MERCENARY'||result.kind==='MYSTIC_ENERGY'){const img=new Image();img.src=result.kind==='MERCENARY'?'/'+result.sourceArt.replace(/^\//,''):'/assets/items/starlight-armor-core-v1749.png';img.alt=result.kind==='MERCENARY'?result.name:'미스틱 에너지';li.append(img);}
    else{const icon=document.createElement('span');icon.className='reward-symbol';icon.textContent=result.kind==='MASTER_STAR'?'★':'—';li.append(icon);}
    const title=document.createElement('b'),detail=document.createElement('span');
    title.textContent=result.kind==='MERCENARY'?`${result.rank} · ${result.name}`:result.kind==='MASTER_STAR'?'마스터의 별':result.kind==='MYSTIC_ENERGY'?'미스틱 에너지':'꽝';
    detail.textContent=result.kind==='MERCENARY'?result.duplicate?`중복 +1 · 누적 ${fmt(result.duplicateCount)}장`:'새 용병 계약':result.kind==='MISS'?'획득 없음':`${fmt(result.quantity)}개`;
    li.append(title,detail);list.append(li);
  }
  let fx,closed=false;const pause=dialog.querySelector('[data-pause]'),skip=dialog.querySelector('[data-skip]');
  const leave=()=>close(false);const close=(acknowledge=true)=>{if(closed)return;closed=true;fx?.destroy();window.removeEventListener('pagehide',leave);document.removeEventListener('visibilitychange',visibility);dialog.close();dialog.remove();if(acknowledge)onClose?.();};
  dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  repeat.onclick=()=>{if(closed||busy||repeat.disabled)return;repeat.disabled=true;close();void onRepeat();};
  pause.onclick=()=>fx?.pause();skip.onclick=()=>fx?.skip();
  const visibility=()=>{if(document.hidden&&fx?.running&&!fx.paused)fx.pause();};document.addEventListener('visibilitychange',visibility);
  dialog.addEventListener('close',()=>document.removeEventListener('visibilitychange',visibility),{once:true});
  window.addEventListener('pagehide',leave,{once:true});document.body.append(dialog);dialog.showModal();
  try{
    await script('/js/ui-fx-vendor-v2045.bundle.js',()=>Boolean(globalThis.CNineUiFxVendor));
    await script('/js/hyper-pack-fx-v2076.bundle.js?v=2091',()=>globalThis.HyperPackFX?.version>=2091);
    if(closed)return;
    fx=globalThis.HyperPackFX.create(dialog.querySelector('.mercenary-pack-stage'),event=>{if(closed)return;dialog.dataset.phase=event.state;pause.disabled=skip.disabled=!fx?.running;pause.textContent=event.state==='paused'?'계속 재생':'일시정지';},{live:true});
    await fx.init();if(closed){fx.destroy();return;}await fx.play(results);
  }catch(error){fx?.destroy();if(!closed){pause.disabled=skip.disabled=true;status.textContent+=' · 연출을 불러오지 못해 저장된 결과를 표시합니다.';dialog.querySelector('.mercenary-pack-stage').hidden=true;}}
  finally{if(!closed){repeat.dataset.ready='true';syncButtons();}}
}

async function open(count=1,{recoverOnly=false}={}){
  if(busy)return false;if(!Number.isInteger(count)||count<1||count>MERCENARY_PACK.maxCount)throw Error('개봉 횟수를 확인하세요.');
  busy=true;syncButtons();let key,pending;
  try{
    await feature();
    const state=await api(MERCENARY_PACK.statePath);
    key=`cnine.mercenary.pack.pending:${state.accountId}`;
    try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    const receiptKey=`cnine.mercenary.pack.receipt:${state.accountId}`;
    const validatePending=value=>{if(typeof value?.requestId!=='string'||!Number.isInteger(value.count)||value.count<1||value.count>MERCENARY_PACK.maxCount)throw Error('이전 개봉 요청 정보를 확인하세요.');};
    const readReceipt=async value=>{try{return await api(MERCENARY_PACK.receiptPath+'?requestId='+encodeURIComponent(value.requestId));}catch(error){if(error.status!==404)throw error;return null;}};
    const completeReceipt=result=>{
      const results=mercenaryPackResults(result);
      if(result.requestId!==pending.requestId||results.length!==pending.count)throw Object.assign(Error('요청한 횟수와 개봉 결과가 다릅니다. 이전 개봉 처리를 확인하세요.'),{code:'MERCENARY_RECEIPT_MISMATCH'});
      localStorage.setItem(receiptKey,JSON.stringify({requestId:result.requestId,count:results.length}));
      if(localStorage.getItem(key)===JSON.stringify(pending))localStorage.removeItem(key);
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
        pending={requestId:crypto.randomUUID(),count};localStorage.setItem(key,JSON.stringify(pending));
      }
    }
    if(result?.status!=='COMPLETED'){
      if(access.userOpeningEnabled!==true){notice('개봉은 OFF입니다. 아직 완료되지 않은 요청은 보관합니다.');return false;}
      result=await api(pending.count>1?MERCENARY_PACK.batchPath:MERCENARY_PACK.openPath,{method:'POST',body:pending});
    }
    completeReceipt(result);notice(`${result.draws.length}회 개봉 결과를 계정에 저장했습니다.`);
    window.dispatchEvent(new CustomEvent('mercenary-pack:complete',{detail:{accountId:state.accountId,requestId:result.requestId}}));
    await showMercenaryReceipt(result,{onRepeat:()=>open(result.draws.length)});return true;
  }catch(error){
    // These responses precede a saved transaction, or explicitly cancel it.
    // Keep uncertain/in-flight requests so retries cannot charge twice.
    if(key&&pending&&['MERCENARY_FUNDS','MERCENARY_COUNT','MERCENARY_PRICE_PENDING','MERCENARY_DRAW_PENDING','JOINT_OPERATION_SUPERSEDED'].includes(error.code)&&localStorage.getItem(key)===JSON.stringify(pending))localStorage.removeItem(key);
    notice(error.message);return false;
  }
  finally{busy=false;syncButtons();}
}
globalThis.MercenaryPack=Object.freeze({open,recover:()=>open(1,{recoverOnly:true}),showReceipt:showMercenaryReceipt,feature:()=>({...access})});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-mercenary-open],[data-mercenary-recover]');if(button&&!button.disabled){event.preventDefault();void open(Number(button.dataset.mercenaryOpen||1),{recoverOnly:button.hasAttribute('data-mercenary-recover')});}});
const observer=new MutationObserver(syncButtons);observer.observe(document.body,{childList:true,subtree:true});
let featureFlight;const refreshFeature=()=>{if(document.hidden||featureFlight)return;featureFlight=feature().catch(()=>{access={...access,userOpeningEnabled:false};notice('개봉 상태를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');syncButtons();}).finally(()=>featureFlight=null);};
const pollFeature=()=>{if(document.querySelector('[data-mercenary-open]'))refreshFeature();};let timer=setInterval(pollFeature,15000);
addEventListener('focus',refreshFeature);addEventListener('storage',event=>{if(event.key==='cnine.hyper-opening.changed')refreshFeature();});document.addEventListener('visibilitychange',refreshFeature);
addEventListener('pagehide',()=>{observer.disconnect();clearInterval(timer);});
addEventListener('pageshow',event=>{if(event.persisted){observer.observe(document.body,{childList:true,subtree:true});clearInterval(timer);timer=setInterval(pollFeature,15000);syncButtons();refreshFeature();}});refreshFeature();
