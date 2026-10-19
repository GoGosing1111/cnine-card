import {jointAccountRequest} from './joint-account-transport.mjs?v=20260924-response';
import {HALLOWEEN_PACK,halloweenReceiptResults,halloweenPackPrice} from '../shared/mercenary-halloween-pack-v1.mjs?v=bathory-20261019-v1';
import {HalloweenOpeningSession} from '../shared/mercenary-halloween-session-v2.mjs?v=20261017-stock-recovery-v1';
import {HalloweenAutoOpening,halloweenAutoQuote} from '../shared/mercenary-halloween-auto-v1.mjs?v=20261017-auto-v1';
import {MercenaryAcquisitionVideo,mercenaryCinematicFor} from './mercenary-acquisition-video.mjs?v=2145';
import {halloweenStockText,halloweenCollectionMarkup,halloweenResultsMarkup,halloweenRoomMarkup} from './mercenary-halloween-presentation-v2.mjs?v=bathory-20261019-v1';
const fmt=n=>n==null?'미정':BigInt(n).toLocaleString('ko-KR');
const currentAccount=()=>Number(globalThis.loadUser?.()?.serverUserId)||0;
const browserLock=(key,work)=>{if(!navigator.locks?.request)throw Error('안전한 개봉을 지원하는 최신 브라우저에서 이용해 주세요.');return navigator.locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('다른 창에서 할로윈팩을 처리 중입니다.');return work();});};
let active=null;
export function halloweenBatchCinematics(results){return ['SS','SSS'].map(rank=>results.find(r=>r.rank===rank&&mercenaryCinematicFor(r))).filter(Boolean);}
export function halloweenBatchCinematic(results){return halloweenBatchCinematics(results).at(-1)??null;}
export function openHalloweenPack(){return mountHalloweenPack();}
export async function mountHalloweenPack({api=jointAccountRequest,accountId=currentAccount(),getAccountId=currentAccount,storage=localStorage,lock=browserLock,videoFactory=host=>new MercenaryAcquisitionVideo(host)}={}){
 if(active)return active;
 if(!document.querySelector('[data-halloween-pack-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-halloween-pack-v2.css?v=bathory-20261019-v1';link.dataset.halloweenPackStyle='';document.head.append(link);}
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='hwp-dialog';active=dialog;
 dialog.setAttribute('aria-labelledby','hwp-title');dialog.innerHTML=halloweenRoomMarkup(HALLOWEEN_PACK);
 const $=selector=>dialog.querySelector(selector);let config=null,busy=false,disposed=false,quote=null,paused=false,auto=null;
 const cinematic=videoFactory($('[data-hwp-video]'));
 const say=(text,error=false)=>{if(!disposed){$('[data-hwp-status]').textContent=text;$('[data-hwp-status]').classList.toggle('is-error',error);}};
 const sync=()=>{
  if(disposed)return;
  dialog.querySelectorAll('[data-hwp-buy]').forEach(button=>button.disabled=busy||!config?.userOpeningEnabled);
  $('[data-hwp-recover]').disabled=busy;
  $('[data-hwp-auto-toggle]').disabled=busy;
  $('[data-hwp-auto-count]').disabled=busy;$('[data-hwp-auto-repeats]').disabled=busy;
  $('[data-hwp-auto-start]').disabled=busy||!config?.userOpeningEnabled;
  const running=Boolean(auto?.state.running);
  $('.hwp-buy-actions').hidden=running;$('.hwp-secondary-actions').hidden=running;$('[data-hwp-auto-running]').hidden=!running;
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
 const session=new HalloweenOpeningSession({api,accountId,getAccountId,storage,lock,present,onConfirmed:receipt=>{
  if(disposed)return;const user=globalThis.loadUser?.();if(Number(user?.serverUserId)===accountId&&globalThis.saveUser){user.coin=Number(receipt.coin);globalThis.saveUser(user,{source:'draw'});}
  window.dispatchEvent(new CustomEvent('limited-pack:receipt',{detail:{coin:receipt.coin,accountId,requestId:receipt.requestId}}));
 }});
 auto=new HalloweenAutoOpening({session,isHidden:()=>document.hidden,onUpdate:()=>sync(),readConfig:async()=>{const next=await api(HALLOWEEN_PACK.featurePath);if(!disposed){acceptConfig(next);}return next;}});
 function updateAutoQuote(){
  if(!config)return;
  try{const q=halloweenAutoQuote(config,Number($('[data-hwp-auto-count]').value),Number($('[data-hwp-auto-repeats]').value));$('[data-hwp-auto-quote]').textContent='총 '+q.totalDraws+'회 · 최대 '+fmt(q.maxCost)+' 코인';}
  catch(e){$('[data-hwp-auto-quote]').textContent=e.message;$('[data-hwp-auto-start]').disabled=true;}
 }
 async function load(){
  const next=await api(HALLOWEEN_PACK.featurePath);if(disposed)return;config=next;
  $('[data-hwp-roster]').innerHTML=halloweenCollectionMarkup(config.cards,config.stock);
  say(config.userOpeningEnabled?'개봉할 수량을 선택하세요.':config.settings.mode==='ON'?'현재 개봉 불가 · '+config.readiness.blockers.join(' '):'출시 준비 중 · 개봉 OFF');acceptConfig(next);
 }
 async function run(work){if(busy||disposed)return;busy=true;sync();try{await work();}catch(e){say(e.message,true);}finally{busy=false;if(!disposed){sync();try{const next=await api(HALLOWEEN_PACK.featurePath);if(!disposed){acceptConfig(next);}}catch{}}}}
 async function recover(readOnly=false){
  const result=await (readOnly?session.reconcilePending():session.recover());
  if(result?.status==='CANCELLED')say('취소된 이전 요청을 정리했습니다. 새로 개봉할 수 있습니다.');
  else if(result&&result.status!=='COMPLETED')say('이전 개봉이 아직 확인되지 않았습니다. 이전 결과 확인을 눌러 복구해 주세요.',true);
 }
 function dismissConfirm(){const saved=quote;quote=null;$('[data-hwp-confirm]').hidden=true;$('[data-hwp-shell]').inert=false;if(saved)(saved.auto?$('[data-hwp-auto-start]'):$('[data-hwp-buy="'+saved.count+'"]')).focus();}
 const close=()=>{if(disposed)return;auto.stop('계약실을 닫아 자동뽑기를 중지했습니다.');disposed=true;cinematic.destroy();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);dialog.close();dialog.remove();if(active===dialog)active=null;previous?.focus();};
 const visibility=()=>{if(document.hidden){auto.stop('화면을 벗어나 자동뽑기를 중지했습니다.');if(cinematic.active){paused=true;cinematic.setPaused(true);$('[data-hwp-pause]').textContent='계속 재생';}}};
 $('[data-hwp-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();if(quote)dismissConfirm();else close();});
 window.addEventListener('pagehide',close,{once:true});document.addEventListener('visibilitychange',visibility);
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
 $('[data-hwp-recover]').onclick=()=>{void run(()=>recover());};
 document.body.append(dialog);dialog.showModal();try{await load();if(!disposed&&session.read(session.pendingKey))await run(()=>recover(true));}catch(e){say(e.message,true);}return dialog;
}
