import {jointAccountRequest} from './joint-account-transport.mjs?v=20260924-response';
import {LIMITED_PACK,limitedReceiptResults} from '../shared/mercenary-limited-pack-v1.mjs?v=20261006';
import {LimitedOpeningSession,limitedAutoPlan} from '../shared/mercenary-limited-session-v1.mjs?v=20261006';
import {formatDrawPercent} from '../shared/mercenary-draw-policy-v1.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null||n===undefined?'설정 전':BigInt(n).toLocaleString('ko-KR');
let active=null;const scripts=new Map();
function stylesheet(){
 if(document.querySelector('[data-limited-pack-style]'))return;
 const el=document.createElement('link');el.rel='stylesheet';el.href='/css/mercenary-limited-pack-v1.css?v=20261006';el.dataset.limitedPackStyle='';document.head.append(el);
}
function script(url,ready){
 if(ready())return Promise.resolve();if(scripts.has(url))return scripts.get(url);
 const promise=new Promise((resolve,reject)=>{
  const el=document.createElement('script');el.src=url;
  const timer=setTimeout(()=>{el.remove();reject(Error('개봉 연출 로딩 시간이 초과됐습니다. 다시 열어 주세요.'));},20000);
  el.onload=()=>{clearTimeout(timer);ready()?resolve():reject(Error('개봉 연출을 확인하지 못했습니다.'));};
  el.onerror=()=>{clearTimeout(timer);el.remove();reject(Error('개봉 연출을 불러오지 못했습니다.'));};document.head.append(el);
 });scripts.set(url,promise);promise.catch(()=>scripts.delete(url));return promise;
}
const browserLock=async(key,work)=>{
 if(!navigator.locks?.request)throw Error('이 브라우저에서는 안전한 자동 개봉을 지원하지 않습니다. 최신 Chrome 또는 Safari로 접속해 주세요.');
 return navigator.locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw Error('다른 창에서 리미티드팩을 개봉 중입니다. 해당 창의 개봉을 먼저 멈춰 주세요.');return work();});
};
const currentAccount=()=>Number(globalThis.loadUser?.()?.serverUserId)||0;
export function openLimitedPack(){return mountLimitedPack({api:jointAccountRequest,accountId:currentAccount(),getAccountId:currentAccount,storage:localStorage});}
export async function mountLimitedPack({api,accountId,getAccountId,storage,preview=false,lock=browserLock}){
 if(active){active.focus();return active;}
 stylesheet();const previous=document.activeElement,dialog=document.createElement('dialog');active=dialog;
 dialog.className='lp-dialog';dialog.setAttribute('aria-labelledby','lp-title');
 dialog.innerHTML='<header class="lp-header"><div><span class="lp-sigil" aria-hidden="true">✦</span><div><small>SOOPKETMON / LIMITED EDITION</small><h1 id="lp-title">리미티드 계약실</h1></div></div><div><span class="lp-tag">'+(preview?'연출 검수 · 실제 지급 없음':'용병별 서버 한정')+'</span><button data-lp-close aria-label="계약실 닫기">×</button></div></header>'+
 '<div class="lp-body"><section class="lp-theatre"><div class="lp-stage-heading"><span>THE SEALED CONTRACT</span><b data-lp-counter>LIMITED COLLECTION</b></div><div class="lp-canvas" data-lp-canvas></div><div class="lp-stage-foot"><span class="lp-live-dot"></span><p data-lp-status role="status" aria-live="polite">계약실을 준비하고 있습니다.</p><button data-lp-stop-stage hidden>중지</button><button data-lp-skip hidden>연출 건너뛰기</button></div></section>'+
 '<aside class="lp-controls"><span class="lp-eyebrow">A CONTRACT BEYOND RARITY</span><h2>리미티드<br>용병팩</h2><p class="lp-intro">서버에 정해진 수량만 존재하는<br>특별한 용병과의 계약.</p><div class="lp-availability" data-lp-access>개봉 상태 확인 중</div>'+
 '<div class="lp-prices"><div><small>1회 개봉</small><b data-lp-price-one>—</b><span>코인</span></div><div><small>10회 개봉</small><b data-lp-price-ten>—</b><span>코인</span></div></div>'+
 '<div class="lp-buy"><button data-lp-buy="1" class="lp-primary" disabled>1회 개봉</button><button data-lp-buy="10" class="lp-primary" disabled>10회 개봉</button></div>'+
 '<section class="lp-auto"><div><h3>자동 계약</h3><span>HALF SKIP</span></div><p>봉인 해제부터 카드 공개까지.<br>매 결과를 확인하며 자동으로 이어집니다.</p><div class="lp-auto-fields"><label>총 개봉 횟수<input data-lp-total type="number" min="1" max="1000" step="1" value="10" inputmode="numeric"></label><label>한 번에<select data-lp-batch><option value="1">1회씩</option><option value="10" selected>10회씩</option></select></label></div><p class="lp-quote" data-lp-quote>최대 1,000회 · 언제든 중지 가능</p><button data-lp-auto disabled>자동 진행 설정</button><button data-lp-stop class="lp-stop" hidden>이 개봉 후 중지</button></section>'+
 '<button data-lp-recover class="lp-recover">이전 결과 확인</button><p class="lp-fine">가격 변경·수량 소진·통신 오류 시 중지됩니다. 창을 닫아도 확정된 결과는 보존됩니다.</p></aside></div>'+
 '<section class="lp-collection"><div><h3>한정 계약 명부</h3><span>용병별 발행 한도 / 잔여 수량</span><button data-lp-refresh>새로고침 ↻</button></div><div class="lp-roster" data-lp-roster></div></section>'+
 '<details class="lp-details"><summary>획득 확률과 최근 결과</summary><div data-lp-odds></div><ol data-lp-history></ol></details>'+
 '<div class="lp-confirm" data-lp-confirm hidden><div role="group" aria-labelledby="lp-confirm-title"><span class="lp-eyebrow">CONFIRM CONTRACT</span><h2 id="lp-confirm-title">계약을 시작할까요?</h2><p data-lp-confirm-text></p><div><button data-lp-cancel>취소</button><button class="lp-primary" data-lp-confirm-start>개봉 시작</button></div></div></div>';
 document.body.append(dialog);dialog.showModal();
 let disposed=false,fx=null,config=null,session=null,confirmation=null,ready=false,total=0,revealed=0,mode='manual',lastReceipt=null,busy=false;
 const $=s=>dialog.querySelector(s),say=text=>{$('[data-lp-status]').textContent=text;};
 const history=[];
 const sync=()=>{
  const enabled=ready&&config?.userOpeningEnabled===true&&Boolean(accountId)&&!busy;
  dialog.querySelectorAll('[data-lp-buy],[data-lp-auto]').forEach(b=>b.disabled=!enabled);
  dialog.querySelectorAll('[data-lp-total],[data-lp-batch],[data-lp-refresh]').forEach(b=>b.disabled=busy);
  $('[data-lp-recover]').disabled=busy||!ready||!accountId;
  $('[data-lp-stop-stage]').hidden=!busy;$('[data-lp-stop-stage]').disabled=!busy||session?.stopped;$('[data-lp-stop]').hidden=!busy;$('[data-lp-stop]').disabled=!busy||session?.stopped;
  $('[data-lp-skip]').hidden=!fx?.running;
  $('[data-lp-close]').setAttribute('aria-label',busy?'다음 개봉을 중지하고 닫기':'계약실 닫기');
 };
 const quote=()=>{
  try{const plan=limitedAutoPlan(config.packSettings,Number($('[data-lp-total]').value),Number($('[data-lp-batch]').value));$('[data-lp-quote]').textContent='총 '+plan.total+'회 · '+fmt(plan.cost)+' 코인';}
  catch{$('[data-lp-quote]').textContent='1~1,000회 · 가격 설정 후 이용 가능';}
 };
 const renderConfig=()=>{
  if(!config)return;
  $('[data-lp-price-one]').textContent=fmt(config.packSettings.prices.single);$('[data-lp-price-ten]').textContent=fmt(config.packSettings.prices.ten);
  $('[data-lp-access]').textContent=preview?'연출 검수 모드':config.userOpeningEnabled?'계약 개봉 가능':'출시 준비 중 · 개봉 OFF';
  $('[data-lp-roster]').innerHTML=config.cards.map(c=>{
   const s=config.stock.find(r=>r.code===c.code),weight=config.policy.cardWeights[c.code];
   return '<article><div class="lp-portrait"><img src="/assets/ui/packs/limited-v1/'+c.code.toLowerCase()+'-640.webp" alt="" loading="lazy"><span>'+esc(c.rank)+'</span></div><b>'+esc(c.name)+'</b><small>'+(weight===0?'추첨 제외':s.limit===null?'수량 설정 전':fmt(s.remaining)+' / '+fmt(s.limit))+'</small></article>';
  }).join('');
  const rates=[...['SS','SSS'].map(rank=>[rank+' 리미티드',config.policy.rankRatesPpm[rank]]),...config.packSettings.extraRewards.map(r=>[{MASTER_STAR:'마스터의 별',MYSTIC_ENERGY:'미스틱 에너지',NONE:'꽝'}[r.id]+(r.quantity?' '+fmt(r.quantity)+'개':''),r.chancePpm])];
  $('[data-lp-odds]').innerHTML='<p>'+rates.map(([name,rate])=>esc(name)+' '+(rate===null?'미정':formatDrawPercent(rate)+'%')).join(' · ')+'</p><p>같은 등급에서 잔여 용병의 가중치에 따라 추첨합니다. 등급 전체가 소진되면 개봉을 중지하며, 10회는 전부 확정된 경우에만 결제합니다.</p><p>'+config.cards.map(c=>esc(c.name)+' 가중치 '+config.policy.cardWeights[c.code]).join(' · ')+'</p>';
  quote();sync();
 };
 const load=async()=>{try{const next=await api(LIMITED_PACK.featurePath);if(disposed)return;config=next;renderConfig();say(preview?'검수 모드입니다. 코인 차감·실제 지급이 없습니다.':config.userOpeningEnabled?'개봉할 계약 수를 선택하세요.':'가격·확률·발행 수량 설정을 준비하고 있습니다.');}catch(e){if(!disposed)say(e.message);}};
 async function present(receipt){
  if(disposed)return false;lastReceipt=receipt;
  const results=limitedReceiptResults(receipt).map(r=>preview?{...r,preview:true,granted:false}:r);
  fx.fastReveal=mode==='auto';
  // One renderer is reused for every receipt. No text-only automatic result path.
  await fx.play(results);if(disposed)return false;
  return !document.hidden;
 }
 const state=event=>{
  if(disposed)return;
  if(event.state==='requesting')say('계약을 확인하고 있습니다. '+(event.completed+1)+'–'+(event.completed+event.count)+' / '+total+'회');
  if(event.state==='confirmed'){
   const r=event.receipt;lastReceipt=r;
   if(!preview){
    const user=globalThis.loadUser?.();if(Number(user?.serverUserId)===accountId&&globalThis.saveUser){user.coin=Number(r.coin);globalThis.saveUser(user,{source:'draw'});}
    window.dispatchEvent(new CustomEvent('limited-pack:receipt',{detail:{coin:r.coin,accountId,requestId:r.requestId}}));
   }
   for(const draw of r.draws){
    if(draw.mercenaryCode){const stock=config?.stock?.find(s=>s.code===draw.mercenaryCode);if(stock){stock.issued++;if(stock.remaining!==null)stock.remaining=Math.max(0,stock.remaining-1);}}
    history.unshift(draw.mercenaryCode?draw.rank+' '+draw.name+' · No. '+String(draw.serial).padStart(6,'0'):(draw.outcomeId==='NONE'?'획득 없음':({MASTER_STAR:'마스터의 별',MYSTIC_ENERGY:'미스틱 에너지'}[draw.outcomeId]+' '+fmt(draw.quantity)+'개')));
   }
   history.splice(30);$('[data-lp-history]').innerHTML=history.map(s=>'<li>'+esc(s)+'</li>').join('');renderConfig();
  }
  if(event.state==='complete'||event.state==='stopped')say(event.completed+'회 개봉 완료'+(event.state==='stopped'?' · 자동 진행 중지':''));
  if(event.state==='stopping')say('현재 확정된 결과를 보여준 뒤 중지합니다.');
  sync();
 };
 session=new LimitedOpeningSession({api,accountId,getAccountId,storage,present,onState:state,lock,canContinue:()=>!disposed&&!document.hidden});
 async function run(work){
  if(busy||disposed)return;busy=true;sync();
  try{await work();}catch(e){if(!disposed)say(e.message);}
  finally{busy=false;if(!disposed){sync();void loadStockOnly();}}
 }
 async function loadStockOnly(){
  // One refresh at the end, never a timer or one API read per animation frame.
  try{const next=await api(LIMITED_PACK.featurePath);if(!disposed){config=next;renderConfig();}}catch{}
 }
 function confirm(totalCount,batchCount,automatic){
  if(!config?.userOpeningEnabled||busy)return;
  try{
   const plan=limitedAutoPlan(config.packSettings,totalCount,batchCount);
   confirmation={total:totalCount,batch:batchCount,config:structuredClone(config)};mode=automatic?'auto':'manual';
   $('[data-lp-confirm-text]').textContent=(preview?'검수용 개봉입니다. 실제 차감·지급은 없습니다. ':'')+(automatic?'자동 ':'')+totalCount+'회 · '+fmt(plan.cost)+' 코인'+(automatic?'\n카드 공개 연출 후 자동으로 다음 계약을 진행합니다.':'');
   $('[data-lp-confirm]').hidden=false;$('[data-lp-confirm-start]').focus();
  }catch(e){say(e.message);}
 }
 function close(){
  if(disposed)return;disposed=true;session.stop();fx?.destroy();document.removeEventListener('visibilitychange',visibility);
  dialog.close();dialog.remove();if(active===dialog)active=null;previous?.focus();
 }
 function visibility(){
  if(document.hidden){session.stop();if(fx?.running&&!fx.paused)fx.pause();fx?.app?.stop();}
  else if(!disposed){if(fx?.running&&fx.paused)fx.pause();if(fx?.running)fx.app?.start();}
 }
 $('[data-lp-close]').onclick=close;
 dialog.addEventListener('cancel',event=>{event.preventDefault();if(!$('[data-lp-confirm]').hidden){$('[data-lp-confirm]').hidden=true;confirmation=null;}else close();});
 $('[data-lp-total]').oninput=quote;$('[data-lp-batch]').onchange=quote;
 dialog.querySelectorAll('[data-lp-buy]').forEach(button=>button.onclick=()=>confirm(Number(button.dataset.lpBuy),Number(button.dataset.lpBuy),false));
 $('[data-lp-auto]').onclick=()=>confirm(Number($('[data-lp-total]').value),Number($('[data-lp-batch]').value),true);
 $('[data-lp-cancel]').onclick=()=>{$('[data-lp-confirm]').hidden=true;confirmation=null;};
 $('[data-lp-confirm-start]').onclick=()=>{
  if(!confirmation||busy)return;const {config:confirmedConfig,...plan}=confirmation;confirmation=null;$('[data-lp-confirm]').hidden=true;
  dialog.scrollTo({top:0,behavior:'instant'});total=plan.total;revealed=0;void run(()=>session.start(confirmedConfig,plan));
 };
 $('[data-lp-stop-stage]').onclick=$('[data-lp-stop]').onclick=()=>{session.stop();sync();};
 $('[data-lp-skip]').onclick=()=>{session.stop();fx?.skip();};
 $('[data-lp-recover]').onclick=()=>{dialog.scrollTo({top:0,behavior:'instant'});mode='manual';revealed=0;total=0;void run(()=>session.recover());};
 $('[data-lp-refresh]').onclick=()=>{if(!busy)void load();};
 document.addEventListener('visibilitychange',visibility);
 await load();
 try{
  await script('/js/ui-fx-vendor-v2045.bundle.js?v=2145',()=>Boolean(globalThis.CNineUiFxVendor));
  if(disposed)return dialog;
  await script('/js/hyper-pack-fx-v2076.bundle.js?v=2146-limited',()=>globalThis.HyperPackFX?.version>=2146);
  if(disposed)return dialog;
  fx=globalThis.HyperPackFX.create($('[data-lp-canvas]'),event=>{
   if(disposed)return;
   if(event.state==='revealed'){revealed++;$('[data-lp-counter]').textContent='CONTRACT '+String(revealed).padStart(2,'0')+(total?' / '+String(total).padStart(2,'0'):'');say(event.result.kind==='MERCENARY'?event.result.rank+' '+event.result.name+' · 서버 한정 계약':{MASTER_STAR:'마스터의 별 획득',MYSTIC_ENERGY:'미스틱 에너지 획득',MISS:'획득 없음'}[event.result.kind]);}
   sync();
  },{live:!preview,appearance:'limited',fastReveal:false,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
  await fx.init();if(disposed)return dialog;ready=true;sync();
 }catch(e){if(!disposed)say(e.message);}
 return dialog;
}
