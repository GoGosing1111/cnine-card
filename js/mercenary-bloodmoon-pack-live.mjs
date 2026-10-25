import {jointAccountRequest} from './joint-account-transport.mjs?v=20261024-namsudaeng-v1';
import {BLOODMOON_PACK,bloodmoonReceiptResults,bloodmoonPackPrice} from '../shared/mercenary-bloodmoon-pack-v1.mjs?v=20261025-eunseol4-v1';
import {BloodmoonOpeningSession} from '../shared/mercenary-bloodmoon-session-v2.mjs?v=20261025-eunseol4-v1';
import {BloodmoonReceiptRecovery,bloodmoonReceiptRetryable} from '../shared/mercenary-bloodmoon-recovery-v1.mjs?v=20261024-namsudaeng-v1';
import {BloodmoonAutoOpening,bloodmoonAutoQuote} from '../shared/mercenary-bloodmoon-auto-v1.mjs?v=20261024-namsudaeng-v1';
import {bloodmoonBulkQuote,bloodmoonBulkPriceSource,bloodmoonCoinText} from '../shared/mercenary-bloodmoon-bulk-v1.mjs';
import {MercenaryAcquisitionVideo,mercenaryCinematicFor} from './mercenary-acquisition-video.mjs?v=20261024-namsudaeng-v1';
import {bloodmoonStockText,bloodmoonCollectionMarkup,bloodmoonResultsMarkup,bloodmoonRoomMarkup} from './mercenary-bloodmoon-presentation-v2.mjs?v=20261025-eunseol4-v1';
const fmt=n=>n==null?'미정':BigInt(n).toLocaleString('ko-KR');
const currentAccount=()=>Number(globalThis.loadUser?.()?.serverUserId)||0;
const browserLock=(key,work)=>{if(!navigator.locks?.request)throw Error('안전한 개봉을 지원하는 최신 브라우저에서 이용해 주세요.');return navigator.locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('다른 창에서 블러드문팩을 처리 중입니다.');return work();});};
let active=null;
export function bloodmoonBatchCinematics(results){return ['SS','SSS'].map(rank=>results.find(r=>r.rank===rank&&(r.limited||rank==='SSS')&&mercenaryCinematicFor(r))).filter(Boolean);}
export function bloodmoonBatchCinematic(results){return bloodmoonBatchCinematics(results).at(-1)??null;}
export function openBloodmoonPack(){return mountBloodmoonPack();}
export async function mountBloodmoonPack({api=jointAccountRequest,accountId=currentAccount(),getAccountId=currentAccount,storage=localStorage,lock=browserLock,videoFactory=host=>new MercenaryAcquisitionVideo(host)}={}){
 if(active)return active;
 if(!document.querySelector('[data-bloodmoon-pack-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-bloodmoon-pack-v2.css?v=20261025-eunseol4-v1';link.dataset.bloodmoonPackStyle='';document.head.append(link);}
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='bwp-dialog';active=dialog;
 dialog.setAttribute('aria-labelledby','bwp-title');dialog.innerHTML=bloodmoonRoomMarkup(BLOODMOON_PACK);
 const $=selector=>dialog.querySelector(selector);let config=null,busy=false,disposed=false,quote=null,paused=false,auto=null,session=null,recovery=null;
 const lifetime=new AbortController(),closed=()=>Object.assign(Error('계약실을 닫았습니다. 이전 결과는 다시 확인할 수 있습니다.'),{code:'BLOODMOON_ROOM_CLOSED'});
 // Retiring a stalled view cancels only its local wait. The durable request ID
 // survives, and a late response from that view cannot alter the reopened room.
 const request=async(path,options={})=>{
  if(disposed)throw closed();
  const controller=new AbortController(),parents=[lifetime.signal,options.signal].filter(Boolean),cancel=()=>controller.abort();
  for(const signal of parents){signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();}
  let abort;
  try{return await Promise.race([
   Promise.resolve().then(()=>{if(disposed)throw closed();if(controller.signal.aborted)throw Object.assign(Error('결과 확인을 잠시 중지했습니다.'),{name:'AbortError'});return api(path,{...options,signal:controller.signal});}),
   new Promise((_,reject)=>{abort=()=>reject(disposed?closed():Object.assign(Error('결과 확인을 잠시 중지했습니다.'),{name:'AbortError'}));controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();})
  ]);}finally{controller.signal.removeEventListener('abort',abort);for(const signal of parents)signal.removeEventListener('abort',cancel);}
 };
 const hasPending=()=>{try{return Boolean(session&&storage.getItem(session.pendingKey));}catch{return true;}};
 const cinematic=videoFactory($('[data-bwp-video]'));
 const say=(text,error=false)=>{if(!disposed){$('[data-bwp-status]').textContent=text;$('[data-bwp-status]').classList.toggle('is-error',error);}};
 const sync=()=>{
  if(disposed)return;
  const pending=hasPending();
  dialog.querySelectorAll('[data-bwp-buy]').forEach(button=>button.disabled=busy||pending||!config?.userOpeningEnabled);
  $('[data-bwp-recover]').disabled=busy&&!pending;
  $('[data-bwp-recover]').textContent=busy&&pending?'개봉 결과 다시 확인':'이전 결과 확인';
  $('[data-bwp-auto-toggle]').disabled=busy;
  $('[data-bwp-auto-count]').disabled=busy;$('[data-bwp-auto-repeats]').disabled=busy;
  $('[data-bwp-auto-start]').disabled=busy||pending||!config?.userOpeningEnabled;
  const running=Boolean(auto?.state.running);
  $('.bwp-buy-actions').hidden=running;$('.bwp-secondary-actions').hidden=running&&!pending;$('[data-bwp-auto-running]').hidden=!running;
  if(running){const s=auto.state;$('[data-bwp-auto-progress]').textContent=s.completed+' / '+s.repeats+'회 반복 · '+s.totalDraws+'회 개봉 · '+fmt(s.spent)+' 코인 사용'+(s.phase==='stopping'?' · 중지 요청됨':'');$('[data-bwp-auto-stop]').disabled=s.phase==='stopping';}
  if(config){
   for(const label of dialog.querySelectorAll('[data-bwp-stock-code]'))label.textContent=bloodmoonStockText(config.cards.find(c=>c.code===label.dataset.bwpStockCode),config.stock?.find(row=>row.code===label.dataset.bwpStockCode));
   for(const label of dialog.querySelectorAll('[data-bwp-chance-code]')){const percent=config.effectiveCardPercents?.[label.dataset.bwpChanceCode];label.textContent='1회 확률 '+(percent==null?'미정':percent+'%');}
   for(const count of [1,10]){const price=count===10?config.settings.prices.ten:config.settings.prices.single;$('[data-bwp-price="'+count+'"]').textContent=price==null?'가격 미정':fmt(price)+' 코인';}
   $('[data-bwp-availability]').textContent=config.userOpeningEnabled?'개봉 가능 · 수량을 선택하세요':config.settings.mode==='ON'?'현재 개봉 불가 · 운영 설정 확인 필요':'출시 준비 중 · 개봉 OFF';
  }
  updateAutoQuote();
  updateBulkQuote();
 };
 const acceptConfig=next=>{config=next;sync();window.dispatchEvent(new CustomEvent('bloodmoon-pack:stock',{detail:{stock:config.stock}}));};
 const videoEnd=()=>{cinematic.cancel();$('[data-bwp-video]').hidden=true;$('[data-bwp-video-actions]').hidden=true;$('[data-bwp-film]').hidden=true;$('[data-bwp-reveal]').classList.remove('has-cinematic');};
 async function present(receipt){
  if(disposed)return;const results=bloodmoonReceiptResults(receipt);
  $('[data-bwp-off]').hidden=true;$('[data-bwp-collection]').hidden=true;$('[data-bwp-reveal]').hidden=false;
  // All authoritative results enter the DOM together, before video loading.
  $('[data-bwp-results]').innerHTML=bloodmoonResultsMarkup(results,BLOODMOON_PACK.image);
  $('[data-bwp-result-total]').textContent=fmt(receipt.count)+'회 개봉 · '+bloodmoonCoinText(receipt.coinCost);
  say(fmt(receipt.count)+'회 개봉 완료 · 획득 수량을 확인하세요.');dialog.dataset.resultCount=String(receipt.count);
  $('[data-bwp-reveal]').scrollIntoView({block:'start'});
  const features=bloodmoonBatchCinematics(results);cinematic.prepare(features);
  for(const featured of features){
   if(disposed)break;
   $('[data-bwp-film]').hidden=false;$('[data-bwp-reveal]').classList.add('has-cinematic');
   $('[data-bwp-film-rank]').textContent=featured.rank+' 용병 획득'+(auto?.state.running?' · 연출 후 자동뽑기 계속':'');
   $('[data-bwp-video]').hidden=false;$('[data-bwp-video-actions]').hidden=false;paused=document.hidden;
   $('[data-bwp-pause]').textContent=paused?'계속 재생':'일시정지';
   const playing=cinematic.play(featured,state=>{if(!disposed&&state==='paused'){paused=true;$('[data-bwp-pause]').textContent='계속 재생';}});
   if(paused)cinematic.setPaused(true);
   await playing;if(!disposed)videoEnd();
  }
 }
 session=new BloodmoonOpeningSession({api:request,accountId,getAccountId:()=>disposed?0:getAccountId(),storage,lock,present,onPending:sync,onConfirmed:receipt=>{
  if(disposed)return;const user=globalThis.loadUser?.();if(Number(user?.serverUserId)===accountId&&globalThis.saveUser){
   user.coin=Number(receipt.coin);
   // A failed wallet cache must not hide the confirmed result or stop its event.
   try{globalThis.saveUser(user,{source:'draw'});}catch{}
  }
  try{for(const key of ['inventory','workshop'])globalThis.clearApiCache?.(key);}catch{}
  sync();
  window.dispatchEvent(new CustomEvent('limited-pack:receipt',{detail:{coin:receipt.coin,accountId,requestId:receipt.requestId}}));
 }});
 auto=new BloodmoonAutoOpening({session,isHidden:()=>document.hidden,onUpdate:()=>sync(),readConfig:async()=>{const next=await request(BLOODMOON_PACK.featurePath);if(!disposed){acceptConfig(next);}return next;}});
 recovery=new BloodmoonReceiptRecovery({
  getPendingId:()=>{try{return session.read(session.pendingKey)?.body?.requestId||null;}catch{return null;}},
  canRead:()=>!disposed&&!document.hidden&&navigator.onLine!==false&&Number(getAccountId())===accountId,
  isBusy:()=>busy,
  read:async({signal})=>{
   busy=true;sync();say('이전 개봉 결과를 다시 확인하고 있습니다.');
   try{return await recover(true,{signal,timeoutMs:8000});}
   finally{busy=false;if(!disposed){sync();if(!hasPending())void refreshConfig();}}
  },
  onError:error=>say(bloodmoonReceiptRetryable(error)?'연결이 불안정해 개봉 결과를 기다리고 있습니다. 이전 결과 확인으로도 확인할 수 있습니다.':error.message,true)
 });
 function updateAutoQuote(){
  if(!config)return;
  try{const q=bloodmoonAutoQuote(config,Number($('[data-bwp-auto-count]').value),Number($('[data-bwp-auto-repeats]').value));$('[data-bwp-auto-quote]').textContent='총 '+q.totalDraws+'회 · 최대 '+fmt(q.maxCost)+' 코인';}
  catch(e){$('[data-bwp-auto-quote]').textContent=e.message;$('[data-bwp-auto-start]').disabled=true;}
 }
 function readBulkQuote(){const source=bloodmoonBulkPriceSource(config),budget=$('[data-bwp-budget]').value.replaceAll(',','').trim();return {...bloodmoonBulkQuote(source.prices,budget),reference:source.reference};}
 function updateBulkQuote(){
  const button=$('[data-bwp-bulk-start]');button.disabled=true;
  $('[data-bwp-budget]').disabled=busy;
  dialog.querySelectorAll('[data-bwp-budget-preset]').forEach(b=>{b.disabled=busy;const selected=b.dataset.bwpBudgetPreset===$('[data-bwp-budget]').value.replaceAll(',','');b.setAttribute('aria-pressed',String(selected));b.classList.toggle('bwp-primary',selected);});
  if(!config)return;
  try{const q=readBulkQuote();$('[data-bwp-bulk-quote]').textContent=fmt(q.count)+'회 개봉 · '+bloodmoonCoinText(q.coinCost)+' 사용'+(q.unused!=='0'?' · 미사용 '+bloodmoonCoinText(q.unused):'');$('[data-bwp-bulk-reference]').textContent=q.reference?'할로윈 기준가 1회 10억 / 10회 100억으로 계산한 준비 화면입니다. 실제 판매 가격은 미정입니다.':'저장된 블러드문팩 가격으로 계산합니다.';button.disabled=busy||hasPending()||!config.userOpeningEnabled||q.reference;button.textContent=busy?'결과 확인 중…':config.userOpeningEnabled&&!q.reference?'일괄 개봉 확인':'일괄 개봉 · 판매 잠금';}
  catch(e){$('[data-bwp-bulk-quote]').textContent=e.message;}
 }
 async function load(){
  const next=await request(BLOODMOON_PACK.featurePath);if(disposed)return;config=next;
  $('[data-bwp-roster]').innerHTML=bloodmoonCollectionMarkup(config.cards,config.stock,config.effectiveCardPercents);
  say(config.userOpeningEnabled?'개봉할 수량을 선택하세요.':config.settings.mode==='ON'?'현재 개봉 불가 · '+config.readiness.blockers.join(' '):'출시 준비 중 · 개봉 OFF');acceptConfig(next);
 }
 async function refreshConfig(){try{const next=await request(BLOODMOON_PACK.featurePath);if(!disposed)acceptConfig(next);}catch{}}
 async function run(work){if(busy||disposed)return;recovery.suspend();busy=true;sync();let error;try{await work();}catch(e){error=e;say(e.message,true);}finally{busy=false;if(!disposed){sync();if(bloodmoonReceiptRetryable(error))recovery.request();else recovery.stop();await refreshConfig();}}}
 async function recover(readOnly=false,options){
  const result=await (readOnly?session.reconcilePending(options):session.recover());
  if(result?.status==='CANCELLED')say('취소된 이전 요청을 정리했습니다. 새로 개봉할 수 있습니다.');
  else if(result&&result.status!=='COMPLETED')say('이전 개봉이 아직 확인되지 않았습니다. 이전 결과 확인을 눌러 복구해 주세요.',true);
  return result;
 }
 function dismissConfirm(){const saved=quote;quote=null;$('[data-bwp-confirm]').hidden=true;$('[data-bwp-shell]').inert=false;if(saved)(saved.bulk?$('[data-bwp-bulk-start]'):saved.auto?$('[data-bwp-auto-start]'):$('[data-bwp-buy="'+saved.count+'"]')).focus();}
 const close=()=>{if(disposed)return;auto.stop('계약실을 닫아 자동뽑기를 중지했습니다.');disposed=true;recovery.destroy();lifetime.abort();cinematic.destroy();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);window.removeEventListener('online',resume);window.removeEventListener('offline',offline);window.removeEventListener('cnine:player-updated',accountChanged);dialog.close();dialog.remove();if(active===dialog)active=null;previous?.focus();};
 const resume=()=>recovery.request({resume:true});
 const offline=()=>{auto.stop('연결이 끊겨 자동뽑기를 중지했습니다.');recovery.suspend();};
 const accountChanged=()=>{if(Number(getAccountId())!==accountId)recovery.suspend();};
 const visibility=()=>{if(document.hidden){recovery.suspend();auto.stop('화면을 벗어나 자동뽑기를 중지했습니다.');if(cinematic.active){paused=true;cinematic.setPaused(true);$('[data-bwp-pause]').textContent='계속 재생';}}else resume();};
 $('[data-bwp-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();if(quote)dismissConfirm();else close();});
 window.addEventListener('pagehide',close,{once:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('online',resume);window.addEventListener('offline',offline);window.addEventListener('cnine:player-updated',accountChanged);
 $('[data-bwp-skip]').onclick=videoEnd;$('[data-bwp-pause]').onclick=()=>{paused=!paused;cinematic.setPaused(paused);$('[data-bwp-pause]').textContent=paused?'계속 재생':'일시정지';};
 $('[data-bwp-auto-toggle]').onclick=()=>{const panel=$('[data-bwp-auto-panel]');panel.hidden=!panel.hidden;$('[data-bwp-auto-toggle]').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){panel.scrollIntoView({block:'start'});$('[data-bwp-auto-count]').focus();}};
 $('[data-bwp-auto-count]').onchange=()=>sync();$('[data-bwp-auto-repeats]').oninput=()=>sync();
 $('[data-bwp-budget]').oninput=()=>sync();
 dialog.querySelectorAll('[data-bwp-budget-preset]').forEach(b=>b.onclick=()=>{$('[data-bwp-budget]').value=b.dataset.bwpBudgetPreset;sync();});
 $('[data-bwp-bulk-start]').onclick=()=>{
  if(busy||!config?.userOpeningEnabled||hasPending())return;
  try{const q=readBulkQuote();if(q.reference)return;quote={bulk:true,config:structuredClone(config),...q};$('[data-bwp-confirm-text]').textContent=fmt(q.count)+'회 일괄 개봉 · '+bloodmoonCoinText(q.coinCost)+'을 사용합니다.';$('.bwp-confirm-note').textContent='확정 결과를 수량으로 모아 보여드립니다. SS 리미티드 이상은 이미지로 확인합니다.';$('[data-bwp-confirm-start]').textContent='일괄 개봉 확인';$('[data-bwp-shell]').inert=true;$('[data-bwp-confirm]').hidden=false;$('[data-bwp-confirm-cancel]').focus();}catch(e){say(e.message,true);}
 };
 $('[data-bwp-auto-stop]').onclick=()=>{auto.stop();say('자동뽑기 중지 요청 · 진행 중인 개봉 결과까지만 처리합니다.');};
 $('[data-bwp-auto-start]').onclick=()=>{
  if(busy||!config?.userOpeningEnabled||!$('[data-bwp-auto-repeats]').reportValidity())return;
  const count=Number($('[data-bwp-auto-count]').value),repeats=Number($('[data-bwp-auto-repeats]').value);
  try{const q=bloodmoonAutoQuote(config,count,repeats);quote={auto:true,config:structuredClone(config),count,repeats};$('[data-bwp-confirm-text]').textContent=count+'회씩 '+repeats+'회 반복 · 총 '+q.totalDraws+'회 · 최대 '+fmt(q.maxCost)+' 코인을 사용합니다.';$('.bwp-confirm-note').textContent='한 번씩 결제하며, SS 리미티드·SSS 연출이 끝나면 이어서 뽑습니다. 중지하면 진행 중인 개봉 결과까지만 처리합니다.';$('[data-bwp-confirm-start]').textContent='자동뽑기 확인';$('[data-bwp-shell]').inert=true;$('[data-bwp-confirm]').hidden=false;$('[data-bwp-confirm-cancel]').focus();}catch(e){say(e.message,true);}
 };
 dialog.querySelectorAll('[data-bwp-buy]').forEach(button=>button.onclick=()=>{
  if(busy||!config?.userOpeningEnabled)return;const count=Number(button.dataset.bwpBuy);quote={config:structuredClone(config),count};
  $('[data-bwp-confirm-text]').textContent=count+'회 개봉 · '+fmt(bloodmoonPackPrice(config.settings,count))+' 코인을 사용합니다.';
  $('.bwp-confirm-note').textContent='일반 C~SS는 수량으로, SS 리미티드 이상은 이미지로 확인합니다.';$('[data-bwp-confirm-start]').textContent='개봉 확인';
  $('[data-bwp-shell]').inert=true;$('[data-bwp-confirm]').hidden=false;$('[data-bwp-confirm-cancel]').focus();
 });
 $('[data-bwp-confirm-cancel]').onclick=dismissConfirm;
 $('[data-bwp-confirm-start]').onclick=()=>{if(!quote||busy)return;const saved=quote;dismissConfirm();say('계약 결과를 확인하고 있습니다.');void run(async()=>{if(saved.bulk)return session.startBulk(saved.config,saved);if(!saved.auto)return session.start(saved.config,saved.count);$('[data-bwp-auto-panel]').hidden=true;$('[data-bwp-auto-toggle]').setAttribute('aria-expanded','false');const s=await auto.start(saved.config,saved.count,saved.repeats);say(s.reason+' · 총 '+s.totalDraws+'회 · '+fmt(s.spent)+' 코인 사용',s.error);});};
 $('[data-bwp-recover]').onclick=()=>{
  if(busy&&hasPending()){
   close();
   // Entry performs receipt GETs only, even if the original POST is still running.
   void mountBloodmoonPack({api,accountId,getAccountId,storage,lock,videoFactory}).catch(()=>{});
   return;
  }
  say('이전 개봉 결과를 확인하고 있습니다.');
  void run(()=>recover());
 };
 document.body.append(dialog);dialog.showModal();try{await load();if(!disposed&&session.read(session.pendingKey))await run(()=>recover(true));}catch(e){say(e.message,true);if(bloodmoonReceiptRetryable(e))recovery.request();}return dialog;
}
