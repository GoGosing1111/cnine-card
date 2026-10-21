import {jointAccountRequest} from './joint-account-transport.mjs?v=20260924-response';
import {HALLOWEEN_PACK,halloweenReceiptResults,halloweenPackPrice} from '../shared/mercenary-halloween-pack-v1.mjs?v=20261022-jinmu-stock4-v1';
import {HalloweenOpeningSession} from '../shared/mercenary-halloween-session-v2.mjs?v=20261021-mobile-recovery-v1';
import {HalloweenReceiptRecovery,halloweenReceiptRetryable} from '../shared/mercenary-halloween-recovery-v1.mjs?v=20261021-mobile-recovery-v1';
import {HalloweenAutoOpening,halloweenAutoQuote} from '../shared/mercenary-halloween-auto-v1.mjs?v=20261017-auto-v1';
import {MercenaryAcquisitionVideo,mercenaryCinematicFor} from './mercenary-acquisition-video.mjs?v=2145';
import {halloweenStockText,halloweenCollectionMarkup,halloweenResultsMarkup,halloweenRoomMarkup} from './mercenary-halloween-presentation-v2.mjs?v=jokro-pack-20261021-v1';
const fmt=n=>n==null?'미정':BigInt(n).toLocaleString('ko-KR');
const currentAccount=()=>Number(globalThis.loadUser?.()?.serverUserId)||0;
const browserLock=(key,work)=>{if(!navigator.locks?.request)throw Error('안전한 개봉을 지원하는 최신 브라우저에서 이용해 주세요.');return navigator.locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('다른 창에서 할로윈팩을 처리 중입니다.');return work();});};
let active=null;
export function halloweenBatchCinematics(results){return ['SS','SSS'].map(rank=>results.find(r=>r.rank===rank&&mercenaryCinematicFor(r))).filter(Boolean);}
export function halloweenBatchCinematic(results){return halloweenBatchCinematics(results).at(-1)??null;}
export function openHalloweenPack(){return mountHalloweenPack();}
export async function mountHalloweenPack({api=jointAccountRequest,accountId=currentAccount(),getAccountId=currentAccount,storage=localStorage,lock=browserLock,videoFactory=host=>new MercenaryAcquisitionVideo(host)}={}){
 if(active)return active;
 if(!document.querySelector('[data-halloween-pack-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-halloween-pack-v2.css?v=jokro-pack-20261021-v1';link.dataset.halloweenPackStyle='';document.head.append(link);}
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='hwp-dialog';active=dialog;
 dialog.setAttribute('aria-labelledby','hwp-title');dialog.innerHTML=halloweenRoomMarkup(HALLOWEEN_PACK);
 const $=selector=>dialog.querySelector(selector);let config=null,busy=false,disposed=false,quote=null,paused=false,auto=null,session=null,recovery=null;
 const lifetime=new AbortController(),closed=()=>Object.assign(Error('계약실을 닫았습니다. 이전 결과는 다시 확인할 수 있습니다.'),{code:'HALLOWEEN_ROOM_CLOSED'});
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
 const cinematic=videoFactory($('[data-hwp-video]'));
 const say=(text,error=false)=>{if(!disposed){$('[data-hwp-status]').textContent=text;$('[data-hwp-status]').classList.toggle('is-error',error);}};
 const sync=()=>{
  if(disposed)return;
  const pending=hasPending();
  dialog.querySelectorAll('[data-hwp-buy]').forEach(button=>button.disabled=busy||pending||!config?.userOpeningEnabled);
  $('[data-hwp-recover]').disabled=busy&&!pending;
  $('[data-hwp-recover]').textContent=busy&&pending?'개봉 결과 다시 확인':'이전 결과 확인';
  $('[data-hwp-auto-toggle]').disabled=busy;
  $('[data-hwp-auto-count]').disabled=busy;$('[data-hwp-auto-repeats]').disabled=busy;
  $('[data-hwp-auto-start]').disabled=busy||pending||!config?.userOpeningEnabled;
  const running=Boolean(auto?.state.running);
  $('.hwp-buy-actions').hidden=running;$('.hwp-secondary-actions').hidden=running&&!pending;$('[data-hwp-auto-running]').hidden=!running;
  if(running){const s=auto.state;$('[data-hwp-auto-progress]').textContent=s.completed+' / '+s.repeats+'회 반복 · '+s.totalDraws+'회 개봉 · '+fmt(s.spent)+' 코인 사용'+(s.phase==='stopping'?' · 중지 요청됨':'');$('[data-hwp-auto-stop]').disabled=s.phase==='stopping';}
  if(config){
   for(const label of dialog.querySelectorAll('[data-hwp-stock-code]'))label.textContent=halloweenStockText(null,config.stock?.find(row=>row.code===label.dataset.hwpStockCode));
   for(const count of [1,10]){const price=count===10?config.settings.prices.ten:config.settings.prices.single;$('[data-hwp-price="'+count+'"]').textContent=price==null?'가격 미정':fmt(price)+' 코인';}
   $('[data-hwp-availability]').textContent=config.userOpeningEnabled?'개봉 가능 · 수량을 선택하세요':config.settings.mode==='ON'?'현재 개봉 불가 · 운영 설정 확인 필요':'출시 준비 중 · 개봉 OFF';
  }
  updateAutoQuote();
 };
 const acceptConfig=next=>{config=next;sync();window.dispatchEvent(new CustomEvent('halloween-pack:stock',{detail:{stock:config.stock}}));};
 const videoEnd=()=>{cinematic.cancel();$('[data-hwp-video]').hidden=true;$('[data-hwp-video-actions]').hidden=true;$('[data-hwp-film]').hidden=true;$('[data-hwp-reveal]').classList.remove('has-cinematic');};
 async function present(receipt){
  if(disposed)return;const results=halloweenReceiptResults(receipt);
  $('[data-hwp-off]').hidden=true;$('[data-hwp-collection]').hidden=true;$('[data-hwp-reveal]').hidden=false;
  // All authoritative results enter the DOM together, before video loading.
  $('[data-hwp-results]').innerHTML=halloweenResultsMarkup(results,HALLOWEEN_PACK.image);
  $('[data-hwp-result-total]').textContent=results.length+'회 개봉 · 전체 공개';
  say(results.length+'회 개봉 완료 · 획득한 용병을 확인하세요.');dialog.dataset.resultCount=String(results.length);
  dialog.scrollTop=0;
  const features=halloweenBatchCinematics(results);cinematic.prepare(features);
  for(const featured of features){
   if(disposed)break;
   $('[data-hwp-film]').hidden=false;$('[data-hwp-reveal]').classList.add('has-cinematic');
   $('[data-hwp-film-rank]').textContent=featured.rank+' 용병 획득'+(auto?.state.running?' · 연출 후 자동뽑기 계속':'');
   $('[data-hwp-video]').hidden=false;$('[data-hwp-video-actions]').hidden=false;paused=document.hidden;
   $('[data-hwp-pause]').textContent=paused?'계속 재생':'일시정지';
   const playing=cinematic.play(featured,state=>{if(!disposed&&state==='paused'){paused=true;$('[data-hwp-pause]').textContent='계속 재생';}});
   if(paused)cinematic.setPaused(true);
   await playing;if(!disposed)videoEnd();
  }
 }
 session=new HalloweenOpeningSession({api:request,accountId,getAccountId:()=>disposed?0:getAccountId(),storage,lock,present,onPending:sync,onConfirmed:receipt=>{
  if(disposed)return;const user=globalThis.loadUser?.();if(Number(user?.serverUserId)===accountId&&globalThis.saveUser){
   user.coin=Number(receipt.coin);
   // A failed wallet cache must not hide the confirmed result or stop its event.
   try{globalThis.saveUser(user,{source:'draw'});}catch{}
  }
  sync();
  window.dispatchEvent(new CustomEvent('limited-pack:receipt',{detail:{coin:receipt.coin,accountId,requestId:receipt.requestId}}));
 }});
 auto=new HalloweenAutoOpening({session,isHidden:()=>document.hidden,onUpdate:()=>sync(),readConfig:async()=>{const next=await request(HALLOWEEN_PACK.featurePath);if(!disposed){acceptConfig(next);}return next;}});
 recovery=new HalloweenReceiptRecovery({
  getPendingId:()=>{try{return session.read(session.pendingKey)?.body?.requestId||null;}catch{return null;}},
  canRead:()=>!disposed&&!document.hidden&&navigator.onLine!==false&&Number(getAccountId())===accountId,
  isBusy:()=>busy,
  read:async({signal})=>{
   busy=true;sync();say('이전 개봉 결과를 다시 확인하고 있습니다.');
   try{return await recover(true,{signal,timeoutMs:8000});}
   finally{busy=false;if(!disposed){sync();if(!hasPending())void refreshConfig();}}
  },
  onError:error=>say(halloweenReceiptRetryable(error)?'연결이 불안정해 개봉 결과를 기다리고 있습니다. 이전 결과 확인으로도 확인할 수 있습니다.':error.message,true)
 });
 function updateAutoQuote(){
  if(!config)return;
  try{const q=halloweenAutoQuote(config,Number($('[data-hwp-auto-count]').value),Number($('[data-hwp-auto-repeats]').value));$('[data-hwp-auto-quote]').textContent='총 '+q.totalDraws+'회 · 최대 '+fmt(q.maxCost)+' 코인';}
  catch(e){$('[data-hwp-auto-quote]').textContent=e.message;$('[data-hwp-auto-start]').disabled=true;}
 }
 async function load(){
  const next=await request(HALLOWEEN_PACK.featurePath);if(disposed)return;config=next;
  $('[data-hwp-roster]').innerHTML=halloweenCollectionMarkup(config.cards,config.stock);
  say(config.userOpeningEnabled?'개봉할 수량을 선택하세요.':config.settings.mode==='ON'?'현재 개봉 불가 · '+config.readiness.blockers.join(' '):'출시 준비 중 · 개봉 OFF');acceptConfig(next);
 }
 async function refreshConfig(){try{const next=await request(HALLOWEEN_PACK.featurePath);if(!disposed)acceptConfig(next);}catch{}}
 async function run(work){if(busy||disposed)return;recovery.suspend();busy=true;sync();let error;try{await work();}catch(e){error=e;say(e.message,true);}finally{busy=false;if(!disposed){sync();if(halloweenReceiptRetryable(error))recovery.request();else recovery.stop();await refreshConfig();}}}
 async function recover(readOnly=false,options){
  const result=await (readOnly?session.reconcilePending(options):session.recover());
  if(result?.status==='CANCELLED')say('취소된 이전 요청을 정리했습니다. 새로 개봉할 수 있습니다.');
  else if(result&&result.status!=='COMPLETED')say('이전 개봉이 아직 확인되지 않았습니다. 이전 결과 확인을 눌러 복구해 주세요.',true);
  return result;
 }
 function dismissConfirm(){const saved=quote;quote=null;$('[data-hwp-confirm]').hidden=true;$('[data-hwp-shell]').inert=false;if(saved)(saved.auto?$('[data-hwp-auto-start]'):$('[data-hwp-buy="'+saved.count+'"]')).focus();}
 const close=()=>{if(disposed)return;auto.stop('계약실을 닫아 자동뽑기를 중지했습니다.');disposed=true;recovery.destroy();lifetime.abort();cinematic.destroy();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);window.removeEventListener('online',resume);window.removeEventListener('offline',offline);window.removeEventListener('cnine:player-updated',accountChanged);dialog.close();dialog.remove();if(active===dialog)active=null;previous?.focus();};
 const resume=()=>recovery.request({resume:true});
 const offline=()=>{auto.stop('연결이 끊겨 자동뽑기를 중지했습니다.');recovery.suspend();};
 const accountChanged=()=>{if(Number(getAccountId())!==accountId)recovery.suspend();};
 const visibility=()=>{if(document.hidden){recovery.suspend();auto.stop('화면을 벗어나 자동뽑기를 중지했습니다.');if(cinematic.active){paused=true;cinematic.setPaused(true);$('[data-hwp-pause]').textContent='계속 재생';}}else resume();};
 $('[data-hwp-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();if(quote)dismissConfirm();else close();});
 window.addEventListener('pagehide',close,{once:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('online',resume);window.addEventListener('offline',offline);window.addEventListener('cnine:player-updated',accountChanged);
 $('[data-hwp-skip]').onclick=videoEnd;$('[data-hwp-pause]').onclick=()=>{paused=!paused;cinematic.setPaused(paused);$('[data-hwp-pause]').textContent=paused?'계속 재생':'일시정지';};
 $('[data-hwp-auto-toggle]').onclick=()=>{const panel=$('[data-hwp-auto-panel]');panel.hidden=!panel.hidden;$('[data-hwp-auto-toggle]').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){panel.scrollIntoView({block:'start'});$('[data-hwp-auto-count]').focus();}};
 $('[data-hwp-auto-count]').onchange=()=>sync();$('[data-hwp-auto-repeats]').oninput=()=>sync();
 $('[data-hwp-auto-stop]').onclick=()=>{auto.stop();say('자동뽑기 중지 요청 · 진행 중인 개봉 결과까지만 처리합니다.');};
 $('[data-hwp-auto-start]').onclick=()=>{
  if(busy||!config?.userOpeningEnabled||!$('[data-hwp-auto-repeats]').reportValidity())return;
  const count=Number($('[data-hwp-auto-count]').value),repeats=Number($('[data-hwp-auto-repeats]').value);
  try{const q=halloweenAutoQuote(config,count,repeats);quote={auto:true,config:structuredClone(config),count,repeats};$('[data-hwp-confirm-text]').textContent=count+'회씩 '+repeats+'회 반복 · 총 '+q.totalDraws+'회 · 최대 '+fmt(q.maxCost)+' 코인을 사용합니다.';$('.hwp-confirm-note').textContent='한 번씩 결제하며, SS·SSS 연출이 끝나면 이어서 뽑습니다. 중지하면 진행 중인 개봉 결과까지만 처리합니다.';$('[data-hwp-confirm-start]').textContent='자동뽑기 확인';$('[data-hwp-shell]').inert=true;$('[data-hwp-confirm]').hidden=false;$('[data-hwp-confirm-cancel]').focus();}catch(e){say(e.message,true);}
 };
 dialog.querySelectorAll('[data-hwp-buy]').forEach(button=>button.onclick=()=>{
  if(busy||!config?.userOpeningEnabled)return;const count=Number(button.dataset.hwpBuy);quote={config:structuredClone(config),count};
  $('[data-hwp-confirm-text]').textContent=count+'회 개봉 · '+fmt(halloweenPackPrice(config.settings,count))+' 코인을 사용합니다.';
  $('.hwp-confirm-note').textContent='개봉 후 모든 결과를 한 번에 확인합니다. SS·SSS 획득 연출을 제공합니다.';$('[data-hwp-confirm-start]').textContent='개봉 확인';
  $('[data-hwp-shell]').inert=true;$('[data-hwp-confirm]').hidden=false;$('[data-hwp-confirm-cancel]').focus();
 });
 $('[data-hwp-confirm-cancel]').onclick=dismissConfirm;
 $('[data-hwp-confirm-start]').onclick=()=>{if(!quote||busy)return;const saved=quote;dismissConfirm();say('계약 결과를 확인하고 있습니다.');void run(async()=>{if(!saved.auto)return session.start(saved.config,saved.count);$('[data-hwp-auto-panel]').hidden=true;$('[data-hwp-auto-toggle]').setAttribute('aria-expanded','false');const s=await auto.start(saved.config,saved.count,saved.repeats);say(s.reason+' · 총 '+s.totalDraws+'회 · '+fmt(s.spent)+' 코인 사용',s.error);});};
 $('[data-hwp-recover]').onclick=()=>{
  if(busy&&hasPending()){
   close();
   // Entry performs receipt GETs only, even if the original POST is still running.
   void mountHalloweenPack({api,accountId,getAccountId,storage,lock,videoFactory}).catch(()=>{});
   return;
  }
  say('이전 개봉 결과를 확인하고 있습니다.');
  void run(()=>recover());
 };
 document.body.append(dialog);dialog.showModal();try{await load();if(!disposed&&session.read(session.pendingKey))await run(()=>recover(true));}catch(e){say(e.message,true);if(halloweenReceiptRetryable(e))recovery.request();}return dialog;
}
