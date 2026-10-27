import {jointAccountRequest} from './joint-account-transport.mjs?v=20261024-namsudaeng-v1';
import {BLACKCROWN_PACK,blackcrownReceiptResults,blackcrownPackPrice} from '../shared/mercenary-blackcrown-pack-v1.mjs?v=20261027-v1';
import {BlackcrownOpeningSession} from '../shared/mercenary-blackcrown-session-v2.mjs?v=20261027-v1';
import {BlackcrownReceiptRecovery,blackcrownReceiptRetryable} from '../shared/mercenary-blackcrown-recovery-v1.mjs?v=20261027-v1';
import {BlackcrownAutoOpening,blackcrownAutoQuote} from '../shared/mercenary-blackcrown-auto-v1.mjs?v=20261027-v1';
import {blackcrownBulkQuote,blackcrownBulkPriceSource,blackcrownCoinText} from '../shared/mercenary-blackcrown-bulk-v1.mjs';
import {MercenaryAcquisitionVideo,mercenaryCinematicFor} from './mercenary-acquisition-video.mjs?v=20261024-namsudaeng-v1';
import {blackcrownStockText,blackcrownCollectionMarkup,blackcrownResultsMarkup,blackcrownRoomMarkup} from './mercenary-blackcrown-presentation-v2.mjs?v=20261027-v1';
const fmt=n=>n==null?'미정':BigInt(n).toLocaleString('ko-KR');
const currentAccount=()=>Number(globalThis.loadUser?.()?.serverUserId)||0;
const browserLock=(key,work)=>{if(!navigator.locks?.request)throw Error('안전한 개봉을 지원하는 최신 브라우저에서 이용해 주세요.');return navigator.locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('다른 창에서 블랙크라운팩을 처리 중입니다.');return work();});};
let active=null;
export function blackcrownBatchCinematics(results){return ['SS','SSS'].map(rank=>results.find(r=>r.rank===rank&&(r.limited||rank==='SSS')&&mercenaryCinematicFor(r))).filter(Boolean);}
export function blackcrownBatchCinematic(results){return blackcrownBatchCinematics(results).at(-1)??null;}
export function openBlackcrownPack(){return mountBlackcrownPack();}
export async function mountBlackcrownPack({api=jointAccountRequest,accountId=currentAccount(),getAccountId=currentAccount,storage=localStorage,lock=browserLock,videoFactory=host=>new MercenaryAcquisitionVideo(host)}={}){
 if(active)return active;
 if(!document.querySelector('[data-blackcrown-pack-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-blackcrown-pack.bundle.css?v=20261027-v1';link.dataset.blackcrownPackStyle='';document.head.append(link);}
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='bcp-dialog';active=dialog;
 dialog.setAttribute('aria-labelledby','bcp-title');dialog.innerHTML=blackcrownRoomMarkup(BLACKCROWN_PACK);
 const $=selector=>dialog.querySelector(selector);let stockTimer=null;let config=null,busy=false,disposed=false,quote=null,paused=false,auto=null,session=null,recovery=null;
 const lifetime=new AbortController(),closed=()=>Object.assign(Error('계약실을 닫았습니다. 이전 결과는 다시 확인할 수 있습니다.'),{code:'BLACKCROWN_ROOM_CLOSED'});
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
 const cinematic=videoFactory($('[data-bcp-video]'));
 const say=(text,error=false)=>{if(!disposed){$('[data-bcp-status]').textContent=text;$('[data-bcp-status]').classList.toggle('is-error',error);}};
 const sync=()=>{
  if(disposed)return;
  const pending=hasPending();
  dialog.querySelectorAll('[data-bcp-buy]').forEach(button=>button.disabled=busy||pending||!config?.userOpeningEnabled);
  $('[data-bcp-recover]').disabled=busy&&!pending;
  $('[data-bcp-recover]').textContent=busy&&pending?'개봉 결과 다시 확인':'이전 결과 확인';
  $('[data-bcp-auto-toggle]').disabled=busy;
  $('[data-bcp-auto-count]').disabled=busy;$('[data-bcp-auto-repeats]').disabled=busy;
  $('[data-bcp-auto-start]').disabled=busy||pending||!config?.userOpeningEnabled;
  const running=Boolean(auto?.state.running);
  $('.bcp-buy-actions').hidden=running;$('.bcp-secondary-actions').hidden=running&&!pending;$('[data-bcp-auto-running]').hidden=!running;
  if(running){const s=auto.state;$('[data-bcp-auto-progress]').textContent=s.completed+' / '+s.repeats+'회 반복 · '+s.totalDraws+'회 개봉 · '+fmt(s.spent)+' 코인 사용'+(s.phase==='stopping'?' · 중지 요청됨':'');$('[data-bcp-auto-stop]').disabled=s.phase==='stopping';}
  if(config){
   $('[data-bcp-ownership]').textContent=config.personalOddsKnown?'현재 '+config.ownedDistinctCount+'종 보유 · SS 리미티드 확률 '+(config.ssProbabilityDivisor===1?'기본':'기본의 1/'+config.ssProbabilityDivisor)+' · 카드별 확률은 아래 표시':'로그인 후 현재 보유 종류와 개인 확률을 확인할 수 있습니다.';
   for(const label of dialog.querySelectorAll('[data-bcp-stock-code]'))label.textContent=blackcrownStockText(config.cards.find(c=>c.code===label.dataset.bcpStockCode),config.stock?.find(row=>row.code===label.dataset.bcpStockCode));
   for(const label of dialog.querySelectorAll('[data-bcp-chance-code]')){const percent=config.effectiveCardPercents?.[label.dataset.bcpChanceCode];label.textContent='1회 확률 '+(percent==null?'미정':percent+'%');}
   for(const count of [1,10]){const price=count===10?config.settings.prices.ten:config.settings.prices.single;$('[data-bcp-price="'+count+'"]').textContent=price==null?'가격 미정':fmt(price)+' 코인';}
   $('[data-bcp-availability]').textContent=config.userOpeningEnabled?'개봉 가능 · 수량을 선택하세요':config.settings.mode==='ON'?'현재 개봉 불가 · 운영 설정 확인 필요':'출시 준비 중 · 개봉 OFF';
  }
  updateAutoQuote();
  updateBulkQuote();
 };
 const acceptConfig=next=>{config=next;clearTimeout(stockTimer);const nextStock=(config.stockSchedules||[]).map(s=>Date.parse(s.executeAt)).sort((a,b)=>a-b)[0];if(Number.isFinite(nextStock)){const delay=Math.max(100,nextStock-Date.parse(config.serverNow||new Date().toISOString()));stockTimer=setTimeout(()=>{if(!disposed&&!busy&&!document.hidden)void refreshConfig();},Math.min(delay,2147483647));}sync();window.dispatchEvent(new CustomEvent('blackcrown-pack:stock',{detail:{stock:config.stock}}));};
 const videoEnd=()=>{cinematic.cancel();$('[data-bcp-video]').hidden=true;$('[data-bcp-video-actions]').hidden=true;$('[data-bcp-film]').hidden=true;$('[data-bcp-reveal]').classList.remove('has-cinematic');};
 async function present(receipt){
  if(disposed)return;const results=blackcrownReceiptResults(receipt);
  $('[data-bcp-off]').hidden=true;$('[data-bcp-collection]').hidden=true;$('[data-bcp-reveal]').hidden=false;
  // All authoritative results enter the DOM together, before video loading.
  $('[data-bcp-results]').innerHTML=blackcrownResultsMarkup(results,BLACKCROWN_PACK.image);
  $('[data-bcp-result-total]').textContent=fmt(receipt.count)+'회 개봉 · '+blackcrownCoinText(receipt.coinCost);
  say(fmt(receipt.count)+'회 개봉 완료 · 획득 수량을 확인하세요.');dialog.dataset.resultCount=String(receipt.count);
  $('[data-bcp-reveal]').scrollIntoView({block:'start'});
  const features=blackcrownBatchCinematics(results);cinematic.prepare(features);
  for(const featured of features){
   if(disposed)break;
   $('[data-bcp-film]').hidden=false;$('[data-bcp-reveal]').classList.add('has-cinematic');
   $('[data-bcp-film-rank]').textContent=featured.rank+' 용병 획득'+(auto?.state.running?' · 연출 후 자동뽑기 계속':'');
   $('[data-bcp-video]').hidden=false;$('[data-bcp-video-actions]').hidden=false;paused=document.hidden;
   $('[data-bcp-pause]').textContent=paused?'계속 재생':'일시정지';
   const playing=cinematic.play(featured,state=>{if(!disposed&&state==='paused'){paused=true;$('[data-bcp-pause]').textContent='계속 재생';}});
   if(paused)cinematic.setPaused(true);
   await playing;if(!disposed)videoEnd();
  }
 }
 session=new BlackcrownOpeningSession({api:request,accountId,getAccountId:()=>disposed?0:getAccountId(),storage,lock,present,onPending:sync,onConfirmed:receipt=>{
  if(disposed)return;const user=globalThis.loadUser?.();if(Number(user?.serverUserId)===accountId&&globalThis.saveUser){
   user.coin=Number(receipt.coin);
   // A failed wallet cache must not hide the confirmed result or stop its event.
   try{globalThis.saveUser(user,{source:'draw'});}catch{}
  }
  try{for(const key of ['inventory','workshop'])globalThis.clearApiCache?.(key);}catch{}
  sync();
  window.dispatchEvent(new CustomEvent('limited-pack:receipt',{detail:{coin:receipt.coin,accountId,requestId:receipt.requestId}}));
 }});
 auto=new BlackcrownAutoOpening({session,isHidden:()=>document.hidden,onUpdate:()=>sync(),readConfig:async()=>{const next=await request(BLACKCROWN_PACK.featurePath);if(!disposed){acceptConfig(next);}return next;}});
 recovery=new BlackcrownReceiptRecovery({
  getPendingId:()=>{try{return session.read(session.pendingKey)?.body?.requestId||null;}catch{return null;}},
  canRead:()=>!disposed&&!document.hidden&&navigator.onLine!==false&&Number(getAccountId())===accountId,
  isBusy:()=>busy,
  read:async({signal})=>{
   busy=true;sync();say('이전 개봉 결과를 다시 확인하고 있습니다.');
   try{return await recover(true,{signal,timeoutMs:8000});}
   finally{busy=false;if(!disposed){sync();if(!hasPending())void refreshConfig();}}
  },
  onError:error=>say(blackcrownReceiptRetryable(error)?'연결이 불안정해 개봉 결과를 기다리고 있습니다. 이전 결과 확인으로도 확인할 수 있습니다.':error.message,true)
 });
 function updateAutoQuote(){
  if(!config)return;
  try{const q=blackcrownAutoQuote(config,Number($('[data-bcp-auto-count]').value),Number($('[data-bcp-auto-repeats]').value));$('[data-bcp-auto-quote]').textContent='총 '+q.totalDraws+'회 · 최대 '+fmt(q.maxCost)+' 코인';}
  catch(e){$('[data-bcp-auto-quote]').textContent=e.message;$('[data-bcp-auto-start]').disabled=true;}
 }
 function readBulkQuote(){const source=blackcrownBulkPriceSource(config),budget=$('[data-bcp-budget]').value.replaceAll(',','').trim();return {...blackcrownBulkQuote(source.prices,budget),reference:source.reference};}
 function updateBulkQuote(){
  const button=$('[data-bcp-bulk-start]');button.disabled=true;
  $('[data-bcp-budget]').disabled=busy;
  dialog.querySelectorAll('[data-bcp-budget-preset]').forEach(b=>{b.disabled=busy;const selected=b.dataset.bcpBudgetPreset===$('[data-bcp-budget]').value.replaceAll(',','');b.setAttribute('aria-pressed',String(selected));b.classList.toggle('bcp-primary',selected);});
  if(!config)return;
  try{const q=readBulkQuote();$('[data-bcp-bulk-quote]').textContent=fmt(q.count)+'회 개봉 · '+blackcrownCoinText(q.coinCost)+' 사용'+(q.unused!=='0'?' · 미사용 '+blackcrownCoinText(q.unused):'');$('[data-bcp-bulk-reference]').textContent=q.reference?'할로윈 기준가 1회 10억 / 10회 100억으로 계산한 준비 화면입니다. 실제 판매 가격은 미정입니다.':'저장된 블랙크라운팩 가격으로 계산합니다.';button.disabled=busy||hasPending()||!config.userOpeningEnabled||q.reference;button.textContent=busy?'결과 확인 중…':config.userOpeningEnabled&&!q.reference?'일괄 개봉 확인':'일괄 개봉 · 판매 잠금';}
  catch(e){$('[data-bcp-bulk-quote]').textContent=e.message;}
 }
 async function load(){
  const next=await request(BLACKCROWN_PACK.featurePath);if(disposed)return;config=next;
  $('[data-bcp-roster]').innerHTML=blackcrownCollectionMarkup(config.cards,config.stock,config.effectiveCardPercents);
  say(config.userOpeningEnabled?'개봉할 수량을 선택하세요.':config.settings.mode==='ON'?'현재 개봉 불가 · '+config.readiness.blockers.join(' '):'출시 준비 중 · 개봉 OFF');acceptConfig(next);
 }
 async function refreshConfig(){try{const next=await request(BLACKCROWN_PACK.featurePath);if(!disposed)acceptConfig(next);}catch{}}
 async function run(work){if(busy||disposed)return;recovery.suspend();busy=true;sync();let error;try{await work();}catch(e){error=e;say(e.message,true);}finally{busy=false;if(!disposed){sync();if(blackcrownReceiptRetryable(error))recovery.request();else recovery.stop();await refreshConfig();}}}
 async function recover(readOnly=false,options){
  const result=await (readOnly?session.reconcilePending(options):session.recover());
  if(result?.status==='CANCELLED')say('취소된 이전 요청을 정리했습니다. 새로 개봉할 수 있습니다.');
  else if(result&&result.status!=='COMPLETED')say('이전 개봉이 아직 확인되지 않았습니다. 이전 결과 확인을 눌러 복구해 주세요.',true);
  return result;
 }
 function dismissConfirm(){const saved=quote;quote=null;$('[data-bcp-confirm]').hidden=true;$('[data-bcp-shell]').inert=false;if(saved)(saved.bulk?$('[data-bcp-bulk-start]'):saved.auto?$('[data-bcp-auto-start]'):$('[data-bcp-buy="'+saved.count+'"]')).focus();}
 const close=()=>{if(disposed)return;auto.stop('계약실을 닫아 자동뽑기를 중지했습니다.');disposed=true;clearTimeout(stockTimer);recovery.destroy();lifetime.abort();cinematic.destroy();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);window.removeEventListener('online',resume);window.removeEventListener('offline',offline);window.removeEventListener('cnine:player-updated',accountChanged);dialog.close();dialog.remove();if(active===dialog)active=null;previous?.focus();};
 const resume=()=>{recovery.request({resume:true});if(!busy&&!hasPending())void refreshConfig();};
 const offline=()=>{auto.stop('연결이 끊겨 자동뽑기를 중지했습니다.');recovery.suspend();};
 const accountChanged=()=>{if(Number(getAccountId())!==accountId)recovery.suspend();};
 const visibility=()=>{if(document.hidden){recovery.suspend();auto.stop('화면을 벗어나 자동뽑기를 중지했습니다.');if(cinematic.active){paused=true;cinematic.setPaused(true);$('[data-bcp-pause]').textContent='계속 재생';}}else resume();};
 $('[data-bcp-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();if(quote)dismissConfirm();else close();});
 window.addEventListener('pagehide',close,{once:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('online',resume);window.addEventListener('offline',offline);window.addEventListener('cnine:player-updated',accountChanged);
 $('[data-bcp-skip]').onclick=videoEnd;$('[data-bcp-pause]').onclick=()=>{paused=!paused;cinematic.setPaused(paused);$('[data-bcp-pause]').textContent=paused?'계속 재생':'일시정지';};
 $('[data-bcp-auto-toggle]').onclick=()=>{const panel=$('[data-bcp-auto-panel]');panel.hidden=!panel.hidden;$('[data-bcp-auto-toggle]').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){panel.scrollIntoView({block:'start'});$('[data-bcp-auto-count]').focus();}};
 $('[data-bcp-auto-count]').onchange=()=>sync();$('[data-bcp-auto-repeats]').oninput=()=>sync();
 $('[data-bcp-budget]').oninput=()=>sync();
 dialog.querySelectorAll('[data-bcp-budget-preset]').forEach(b=>b.onclick=()=>{$('[data-bcp-budget]').value=b.dataset.bcpBudgetPreset;sync();});
 $('[data-bcp-bulk-start]').onclick=()=>{
  if(busy||!config?.userOpeningEnabled||hasPending())return;
  try{const q=readBulkQuote();if(q.reference)return;quote={bulk:true,config:structuredClone(config),...q};$('[data-bcp-confirm-text]').textContent=fmt(q.count)+'회 일괄 개봉 · '+blackcrownCoinText(q.coinCost)+'을 사용합니다.';$('.bcp-confirm-note').textContent='확정 결과를 수량으로 모아 보여드립니다. SS 리미티드 이상은 이미지로 확인합니다.';$('[data-bcp-confirm-start]').textContent='일괄 개봉 확인';$('[data-bcp-shell]').inert=true;$('[data-bcp-confirm]').hidden=false;$('[data-bcp-confirm-cancel]').focus();}catch(e){say(e.message,true);}
 };
 $('[data-bcp-auto-stop]').onclick=()=>{auto.stop();say('자동뽑기 중지 요청 · 진행 중인 개봉 결과까지만 처리합니다.');};
 $('[data-bcp-auto-start]').onclick=()=>{
  if(busy||!config?.userOpeningEnabled||!$('[data-bcp-auto-repeats]').reportValidity())return;
  const count=Number($('[data-bcp-auto-count]').value),repeats=Number($('[data-bcp-auto-repeats]').value);
  try{const q=blackcrownAutoQuote(config,count,repeats);quote={auto:true,config:structuredClone(config),count,repeats};$('[data-bcp-confirm-text]').textContent=count+'회씩 '+repeats+'회 반복 · 총 '+q.totalDraws+'회 · 최대 '+fmt(q.maxCost)+' 코인을 사용합니다.';$('.bcp-confirm-note').textContent='한 번씩 결제하며, SS 리미티드·SSS 연출이 끝나면 이어서 뽑습니다. 중지하면 진행 중인 개봉 결과까지만 처리합니다.';$('[data-bcp-confirm-start]').textContent='자동뽑기 확인';$('[data-bcp-shell]').inert=true;$('[data-bcp-confirm]').hidden=false;$('[data-bcp-confirm-cancel]').focus();}catch(e){say(e.message,true);}
 };
 dialog.querySelectorAll('[data-bcp-buy]').forEach(button=>button.onclick=()=>{
  if(busy||!config?.userOpeningEnabled)return;const count=Number(button.dataset.bcpBuy);quote={config:structuredClone(config),count};
  $('[data-bcp-confirm-text]').textContent=count+'회 개봉 · '+fmt(blackcrownPackPrice(config.settings,count))+' 코인을 사용합니다.';
  $('.bcp-confirm-note').textContent='일반 C~SS는 수량으로, SS 리미티드 이상은 이미지로 확인합니다.';$('[data-bcp-confirm-start]').textContent='개봉 확인';
  $('[data-bcp-shell]').inert=true;$('[data-bcp-confirm]').hidden=false;$('[data-bcp-confirm-cancel]').focus();
 });
 $('[data-bcp-confirm-cancel]').onclick=dismissConfirm;
 $('[data-bcp-confirm-start]').onclick=()=>{if(!quote||busy)return;const saved=quote;dismissConfirm();say('계약 결과를 확인하고 있습니다.');void run(async()=>{if(saved.bulk)return session.startBulk(saved.config,saved);if(!saved.auto)return session.start(saved.config,saved.count);$('[data-bcp-auto-panel]').hidden=true;$('[data-bcp-auto-toggle]').setAttribute('aria-expanded','false');const s=await auto.start(saved.config,saved.count,saved.repeats);say(s.reason+' · 총 '+s.totalDraws+'회 · '+fmt(s.spent)+' 코인 사용',s.error);});};
 $('[data-bcp-recover]').onclick=()=>{
  if(busy&&hasPending()){
   close();
   // Entry performs receipt GETs only, even if the original POST is still running.
   void mountBlackcrownPack({api,accountId,getAccountId,storage,lock,videoFactory}).catch(()=>{});
   return;
  }
  say('이전 개봉 결과를 확인하고 있습니다.');
  void run(()=>recover());
 };
 document.body.append(dialog);dialog.showModal();try{await load();if(!disposed&&session.read(session.pendingKey))await run(()=>recover(true));}catch(e){say(e.message,true);if(blackcrownReceiptRetryable(e))recovery.request();}return dialog;
}
