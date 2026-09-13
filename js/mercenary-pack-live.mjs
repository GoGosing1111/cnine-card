import {jointAccountRequest as api} from './joint-account-transport.mjs';
import {MERCENARY_PACK,mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs';

let busy=false,access={connected:true,userOpeningEnabled:false};
const fmt=n=>Number(n||0).toLocaleString('ko-KR');
const notice=text=>{for(const node of document.querySelectorAll('[data-mercenary-open-status]'))node.textContent=text;};
function syncButtons(){for(const button of document.querySelectorAll('[data-mercenary-open]'))button.disabled=busy||access.userOpeningEnabled!==true;}
async function feature(){access=await api(MERCENARY_PACK.featurePath);syncButtons();return access;}
function stylesheet(){if(document.querySelector('[data-mercenary-pack-style]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-pack-live.css?v=2091';link.dataset.mercenaryPackStyle='';document.head.append(link);}
const scripts=new Map();
function script(path,ready){if(ready())return Promise.resolve();if(scripts.has(path))return scripts.get(path);const promise=new Promise((resolve,reject)=>{let el=[...document.scripts].find(s=>new URL(s.src||location.href).pathname===path.split('?')[0]);const existing=Boolean(el);el||=document.createElement('script');const timer=setTimeout(()=>reject(Error('개봉 연출을 불러오지 못했습니다.')),15000);el.addEventListener('load',()=>{clearTimeout(timer);ready()?resolve():reject(Error('개봉 모듈을 확인하세요.'));},{once:true});el.addEventListener('error',()=>{clearTimeout(timer);reject(Error('개봉 연출을 불러오지 못했습니다.'));},{once:true});if(!existing){el.src=path;document.head.append(el);}});scripts.set(path,promise);promise.catch(()=>scripts.delete(path));return promise;}

export async function showMercenaryReceipt(receipt,{onClose}={}){
  const results=mercenaryPackResults(receipt);stylesheet();
  const dialog=document.createElement('dialog');dialog.className='mercenary-pack-dialog';dialog.classList.toggle('batch',results.length>1);
  dialog.innerHTML='<header><div><span>HYPER PACK · CONTRACT</span><h2>계약 결과</h2></div><button type="button" data-close aria-label="개봉 결과 닫기">닫기</button></header><p class="mercenary-pack-receipt" role="status"></p><div class="mercenary-pack-stage" aria-hidden="true"></div><div class="mercenary-pack-controls"><button type="button" data-pause disabled>일시정지</button><button type="button" data-skip disabled>결과 바로 보기</button></div><ol class="mercenary-pack-results"></ol><footer><a href="/mercenary-hangar/">용병 지휘소로 이동</a><span>획득 결과는 계정에 저장됐습니다.</span></footer>';
  const status=dialog.querySelector('[role="status"]');status.textContent=`${receipt.replayed?'저장된 결과 복구 · ':''}${results.length}회 개봉${receipt.coinCost?` · ${fmt(receipt.coinCost)} 코인`:''}`;
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
  const close=()=>{if(closed)return;closed=true;fx?.destroy();window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',visibility);dialog.close();dialog.remove();onClose?.();};
  dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  pause.onclick=()=>fx?.pause();skip.onclick=()=>fx?.skip();
  const visibility=()=>{if(document.hidden&&fx?.running&&!fx.paused)fx.pause();};document.addEventListener('visibilitychange',visibility);
  dialog.addEventListener('close',()=>document.removeEventListener('visibilitychange',visibility),{once:true});
  window.addEventListener('pagehide',close,{once:true});document.body.append(dialog);dialog.showModal();
  try{
    await script('/js/ui-fx-vendor-v2045.bundle.js',()=>Boolean(globalThis.CNineUiFxVendor));
    await script('/js/hyper-pack-fx-v2076.bundle.js?v=2091',()=>globalThis.HyperPackFX?.version>=2091);
    if(closed)return;
    fx=globalThis.HyperPackFX.create(dialog.querySelector('.mercenary-pack-stage'),event=>{if(closed)return;dialog.dataset.phase=event.state;pause.disabled=skip.disabled=!fx?.running;pause.textContent=event.state==='paused'?'계속 재생':'일시정지';},{live:true});
    await fx.init();if(closed){fx.destroy();return;}await fx.play(results);
  }catch(error){fx?.destroy();if(!closed){pause.disabled=skip.disabled=true;status.textContent+=' · 연출을 불러오지 못해 저장된 결과를 표시합니다.';dialog.querySelector('.mercenary-pack-stage').hidden=true;}}
}

async function open(count=1){
  if(busy)return false;if(!Number.isInteger(count)||count<1||count>MERCENARY_PACK.maxCount)throw Error('개봉 횟수를 확인하세요.');
  busy=true;syncButtons();let key,pending;
  try{
    if((await feature()).userOpeningEnabled!==true){notice('용병카드 개봉은 현재 OFF입니다.');return false;}
    const state=await api(MERCENARY_PACK.statePath);if(!state.available)throw Error('용병카드 개봉을 준비 중입니다.');
    key=`cnine.mercenary.pack.pending:${state.accountId}`;
    try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    if(!pending){pending={requestId:crypto.randomUUID(),count};localStorage.setItem(key,JSON.stringify(pending));}
    let result;
    try{result=await api(MERCENARY_PACK.receiptPath+'?requestId='+encodeURIComponent(pending.requestId));}catch(error){if(error.status!==404)throw error;}
    if(result?.status!=='COMPLETED')result=await api(pending.count>1?MERCENARY_PACK.batchPath:MERCENARY_PACK.openPath,{method:'POST',body:pending});
    mercenaryPackResults(result);notice('개봉 결과를 계정에 저장했습니다.');
    window.dispatchEvent(new CustomEvent('mercenary-pack:complete',{detail:{accountId:state.accountId,requestId:result.requestId}}));
    await showMercenaryReceipt(result,{onClose:()=>{if(localStorage.getItem(key)===JSON.stringify(pending))localStorage.removeItem(key);}});return true;
  }catch(error){notice(error.message);return false;}
  finally{busy=false;syncButtons();}
}
globalThis.MercenaryPack=Object.freeze({open,showReceipt:showMercenaryReceipt,feature:()=>({...access})});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-mercenary-open]');if(button&&!button.disabled){event.preventDefault();void open(Number(button.dataset.mercenaryOpen));}});
const observer=new MutationObserver(syncButtons);observer.observe(document.body,{childList:true,subtree:true});
addEventListener('pagehide',()=>observer.disconnect(),{once:true});void feature().catch(()=>syncButtons());
