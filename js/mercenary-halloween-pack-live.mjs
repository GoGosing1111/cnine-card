import {jointAccountRequest} from './joint-account-transport.mjs?v=20260924-response';
import {HALLOWEEN_PACK,halloweenReceiptResults,halloweenPackPrice} from '../shared/mercenary-halloween-pack-v1.mjs?v=20261017-owner-ready-v1';
import {HalloweenOpeningSession} from '../shared/mercenary-halloween-session-v2.mjs?v=20261017-owner-ready-v1';
import {MercenaryAcquisitionVideo,mercenaryCinematicFor} from './mercenary-acquisition-video.mjs?v=2145';
import {halloweenCollectionMarkup,halloweenResultsMarkup,halloweenRoomMarkup} from './mercenary-halloween-presentation-v2.mjs?v=20261017-owner-ready-v1';
const fmt=n=>n==null?'미정':BigInt(n).toLocaleString('ko-KR');
const currentAccount=()=>Number(globalThis.loadUser?.()?.serverUserId)||0;
const browserLock=(key,work)=>{if(!navigator.locks?.request)throw Error('안전한 개봉을 지원하는 최신 브라우저에서 이용해 주세요.');return navigator.locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('다른 창에서 할로윈팩을 처리 중입니다.');return work();});};
let active=null;
export function halloweenBatchCinematic(results){return results.filter(r=>mercenaryCinematicFor(r)).sort((a,b)=>(b.rank==='SSS')-(a.rank==='SSS'))[0]??null;}
export function openHalloweenPack(){return mountHalloweenPack();}
export async function mountHalloweenPack({api=jointAccountRequest,accountId=currentAccount(),getAccountId=currentAccount,storage=localStorage,lock=browserLock,videoFactory=host=>new MercenaryAcquisitionVideo(host)}={}){
 if(active)return active;
 if(!document.querySelector('[data-halloween-pack-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/mercenary-halloween-pack-v2.css?v=20261017-owner-ready-v1';link.dataset.halloweenPackStyle='';document.head.append(link);}
 const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='hwp-dialog';active=dialog;
 dialog.setAttribute('aria-labelledby','hwp-title');dialog.innerHTML=halloweenRoomMarkup(HALLOWEEN_PACK);
 const $=selector=>dialog.querySelector(selector);let config=null,busy=false,disposed=false,quote=null,paused=false;
 const cinematic=videoFactory($('[data-hwp-video]'));
 const say=(text,error=false)=>{if(!disposed){$('[data-hwp-status]').textContent=text;$('[data-hwp-status]').classList.toggle('is-error',error);}};
 const sync=()=>{
  if(disposed)return;
  dialog.querySelectorAll('[data-hwp-buy]').forEach(button=>button.disabled=busy||!config?.userOpeningEnabled);
  $('[data-hwp-recover]').disabled=busy;
  if(config){
   for(const count of [1,10]){const price=count===10?config.settings.prices.ten:config.settings.prices.single;$('[data-hwp-price="'+count+'"]').textContent=price==null?'가격 미정':fmt(price)+' 코인';}
   $('[data-hwp-availability]').textContent=config.userOpeningEnabled?'개봉 가능 · 수량을 선택하세요':'출시 준비 중 · 개봉 OFF';
  }
 };
 const videoEnd=()=>{cinematic.cancel();$('[data-hwp-video]').hidden=true;$('[data-hwp-video-actions]').hidden=true;$('[data-hwp-film]').hidden=true;$('[data-hwp-reveal]').classList.remove('has-cinematic');};
 async function present(receipt){
  if(disposed)return;const results=halloweenReceiptResults(receipt);
  $('[data-hwp-off]').hidden=true;$('[data-hwp-collection]').hidden=true;$('[data-hwp-reveal]').hidden=false;
  // All authoritative results enter the DOM together, before video loading.
  $('[data-hwp-results]').innerHTML=halloweenResultsMarkup(results,HALLOWEEN_PACK.image);
  $('[data-hwp-result-total]').textContent=results.length+'회 개봉 · 전체 공개';
  say(results.length+'회 개봉 완료 · 획득한 용병을 확인하세요.');dialog.dataset.resultCount=String(results.length);
  dialog.scrollTop=0;
  const featured=halloweenBatchCinematic(results);
  if(featured){
   $('[data-hwp-film]').hidden=false;$('[data-hwp-reveal]').classList.add('has-cinematic');
   $('[data-hwp-film-rank]').textContent=featured.rank+' 용병 획득';
   $('[data-hwp-video]').hidden=false;$('[data-hwp-video-actions]').hidden=false;paused=document.hidden;
   $('[data-hwp-pause]').textContent=paused?'계속 재생':'일시정지';cinematic.prepare([featured]);
   const playing=cinematic.play(featured,state=>{if(!disposed&&state==='paused'){paused=true;$('[data-hwp-pause]').textContent='계속 재생';}});
   if(paused)cinematic.setPaused(true);
   await playing;if(!disposed)videoEnd();
  }
 }
 const session=new HalloweenOpeningSession({api,accountId,getAccountId,storage,lock,present,onConfirmed:receipt=>{
  if(disposed)return;const user=globalThis.loadUser?.();if(Number(user?.serverUserId)===accountId&&globalThis.saveUser){user.coin=Number(receipt.coin);globalThis.saveUser(user,{source:'draw'});}
  window.dispatchEvent(new CustomEvent('limited-pack:receipt',{detail:{coin:receipt.coin,accountId,requestId:receipt.requestId}}));
 }});
 async function load(){
  const next=await api(HALLOWEEN_PACK.featurePath);if(disposed)return;config=next;
  $('[data-hwp-roster]').innerHTML=halloweenCollectionMarkup(config.cards,config.stock);
  say(config.userOpeningEnabled?'개봉할 수량을 선택하세요.':'출시 준비 중 · 개봉 OFF');sync();
 }
 async function run(work){if(busy||disposed)return;busy=true;sync();try{await work();}catch(e){say(e.message,true);}finally{busy=false;if(!disposed){sync();try{const next=await api(HALLOWEEN_PACK.featurePath);if(!disposed){config=next;sync();}}catch{}}}}
 function dismissConfirm(){const count=quote?.count;quote=null;$('[data-hwp-confirm]').hidden=true;$('[data-hwp-shell]').inert=false;if(count)$('[data-hwp-buy="'+count+'"]').focus();}
 const close=()=>{if(disposed)return;disposed=true;cinematic.destroy();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);dialog.close();dialog.remove();if(active===dialog)active=null;previous?.focus();};
 const visibility=()=>{if(document.hidden&&cinematic.active){paused=true;cinematic.setPaused(true);$('[data-hwp-pause]').textContent='계속 재생';}};
 $('[data-hwp-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();if(quote)dismissConfirm();else close();});
 window.addEventListener('pagehide',close,{once:true});document.addEventListener('visibilitychange',visibility);
 $('[data-hwp-skip]').onclick=videoEnd;$('[data-hwp-pause]').onclick=()=>{paused=!paused;cinematic.setPaused(paused);$('[data-hwp-pause]').textContent=paused?'계속 재생':'일시정지';};
 dialog.querySelectorAll('[data-hwp-buy]').forEach(button=>button.onclick=()=>{
  if(busy||!config?.userOpeningEnabled)return;const count=Number(button.dataset.hwpBuy);quote={config:structuredClone(config),count};
  $('[data-hwp-confirm-text]').textContent=count+'회 개봉 · '+fmt(halloweenPackPrice(config.settings,count))+' 코인을 사용합니다.';
  $('[data-hwp-shell]').inert=true;$('[data-hwp-confirm]').hidden=false;$('[data-hwp-confirm-cancel]').focus();
 });
 $('[data-hwp-confirm-cancel]').onclick=dismissConfirm;
 $('[data-hwp-confirm-start]').onclick=()=>{if(!quote||busy)return;const saved=quote;dismissConfirm();say('계약 결과를 확인하고 있습니다.');void run(()=>session.start(saved.config,saved.count));};
 $('[data-hwp-recover]').onclick=()=>{void run(()=>session.recover());};
 document.body.append(dialog);dialog.showModal();try{await load();}catch(e){say(e.message,true);}return dialog;
}
