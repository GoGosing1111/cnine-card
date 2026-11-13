import {MercenaryAcquisitionVideo} from './mercenary-acquisition-video.mjs';
import {jointAccountRequest} from './joint-account-transport.mjs';
import {BLUE_GEAR_PACK as pack,BLUE_GEAR_DRAW_POLICY as policy} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {BlackcrownOpeningSession} from '../shared/mercenary-blackcrown-session-v2.mjs';
import {blackcrownReceiptResults} from '../shared/mercenary-blackcrown-pack-v1.mjs';
import {BlackcrownAutoOpening,blackcrownAutoQuote} from '../shared/mercenary-blackcrown-auto-v1.mjs';
import {blackcrownBulkQuote,blackcrownCoinText as money} from '../shared/mercenary-blackcrown-bulk-v1.mjs';

const account=()=>Number(globalThis.loadUser?.()?.serverUserId)||0;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modes={single:'직접 개봉',auto:'자동 개봉',bulk:'금액 지정'};
const lock=(key,work)=>navigator.locks?.request?navigator.locks.request(key,{ifAvailable:true},lease=>{if(!lease)throw Error('다른 창에서 개봉 중입니다.');return work();}):work();
let active;
export async function openBlueGearPack({api=jointAccountRequest,getAccountId=account,storage=localStorage}={}){
 if(active?.open)return active;
 if(!document.querySelector('link[data-blue-gear-style]')){
  const style=document.createElement('link');style.rel='stylesheet';style.href='/css/blue-gear-pack-v1.css?reveal=3';style.dataset.blueGearStyle='';document.head.append(style);
 }
 const dialog=document.createElement('dialog'),previous=document.activeElement,lifetime=new AbortController();
 dialog.className='bgp-room';dialog.setAttribute('aria-labelledby','bgp-title');active=dialog;
 dialog.innerHTML=`<div class="bgp-top"><span>REVERSE CALL <i>/</i> BLUE GEAR</span><button type="button" data-close aria-label="닫기">×</button></div>
 <div class="bgp-workbench"><div class="bgp-chamber"><div class="bgp-rings" aria-hidden="true"></div><img data-pack-art src="/assets/ui/packs/blue-gear-live-v1/pack-768.webp" srcset="/assets/ui/packs/blue-gear-live-v1/pack-320.webp 320w, /assets/ui/packs/blue-gear-live-v1/pack-768.webp 768w" sizes="(max-width:600px) 145px, 250px" width="964" height="1632" alt="블루기어 승인 팩 원화"></div>
 <main class="bgp-panel"><div class="bgp-kicker">LIMITED MERCENARY PACK</div><h2 id="bgp-title">블루기어팩</h2><p class="bgp-sale" data-sale>판매 정보 확인 중</p>
 <div class="bgp-modes" role="group" aria-label="개봉 방식">${Object.entries(modes).map(([key,label])=>'<button type="button" data-mode="'+key+'" aria-pressed="'+(key==='single')+'">'+label+'</button>').join('')}</div>
 <section class="bgp-controls" data-controls></section><section class="bgp-confirm" data-confirm hidden><h3>개봉 확인</h3><p data-total></p><div><button type="button" data-back>취소</button><button class="bgp-buy" type="button" data-pay>개봉 확정</button></div></section><p role="status" aria-live="polite" data-status></p>
 <div class="bgp-tools"><button type="button" data-odds aria-expanded="false">등장 확률</button><button type="button" data-recover hidden>이전 결과 확인</button></div></main></div>
 <section class="bgp-odds" data-rates hidden></section><section class="bgp-film" data-film hidden><div data-film-screen></div><p><button type="button" data-pause>일시정지</button><button type="button" data-skip>건너뛰기</button></p></section><section class="bgp-results" data-results hidden aria-label="개봉 결과"></section>`;
 document.body.append(dialog);dialog.showModal();
 const $=s=>dialog.querySelector(s),controls=$('[data-controls]'),results=$('[data-results]'),status=$('[data-status]');
 const id=getAccountId();let config,mode='single',busy=false,quote,autoQuote,boundary,closing=false,purchase=null,paused=false;
 const cinema=new MercenaryAcquisitionVideo($('[data-film-screen]'));
 const request=(path,options={})=>api(path,{...options,signal:lifetime.signal});
 const drawButton=(count)=>'<button type="button" class="bgp-buy" data-buy="'+count+'"><strong>'+count+'회 개봉</strong><span>'+money(count===1?config.settings.prices.single:config.settings.prices.ten)+'</span></button>';
 const update=()=>{
  if(!config||closing)return;
  $('[data-sale]').textContent=config.openingScheduled?'11월 20일 00:00 판매 시작 · 한국시간':config.userOpeningEnabled?'판매 중':'현재 개봉할 수 없습니다';
  for(const button of dialog.querySelectorAll('[data-mode]')){button.setAttribute('aria-pressed',String(button.dataset.mode===mode));button.disabled=busy||Boolean(purchase);}
  for(const el of controls.querySelectorAll('button:not([data-stop]),input,select'))el.disabled=busy||!config.userOpeningEnabled||!id;
  const stop=$('[data-stop]');if(stop)stop.hidden=!auto.state.running;
  $('[data-recover]').hidden=!id||!(session.read(session.pendingKey)||session.read(session.receiptKey)||session.lastReceipt);
  $('[data-recover]').disabled=busy;
 };
 function drawControls(){
  if(!config)return;
  quote=null;autoQuote=null;
  if(mode==='single')controls.innerHTML='<div class="bgp-buy-row">'+drawButton(1)+drawButton(10)+'</div>';
  if(mode==='auto')controls.innerHTML='<div class="bgp-fields"><label>매회 개봉<select data-count><option value="1">1회</option><option value="10">10회</option></select></label><label>반복 횟수<input data-repeats type="number" min="1" max="100" value="1"></label></div><p data-quote></p><button class="bgp-buy" type="button" data-auto>자동 개봉 시작</button><button type="button" data-stop hidden>자동 개봉 중지</button>';
  if(mode==='bulk')controls.innerHTML='<label class="bgp-budget">사용할 코인 한도<input data-budget type="text" inputmode="numeric" value="10000000000" maxlength="15"></label><p data-quote></p><button class="bgp-buy" type="button" data-bulk>한도 내 개봉</button>';
  refreshQuote();update();
 }
 function refreshQuote(){
  const el=$('[data-quote]');if(!el||!config)return;
  try{if(mode==='auto'){autoQuote=blackcrownAutoQuote(config,Number($('[data-count]').value),Number($('[data-repeats]').value));el.textContent='총 '+autoQuote.totalDraws.toLocaleString()+'회 · 최대 '+money(autoQuote.maxCost);}
   else{quote=blackcrownBulkQuote(config.settings.prices,$('[data-budget]').value);el.textContent=quote.count.toLocaleString()+'회 · 실제 사용 '+money(quote.coinCost);}}
  catch(e){quote=autoQuote=null;el.textContent=e.message;}
 }
 function displayRates(){
  const rates=$('[data-rates]');
  rates.innerHTML='<h3>1회 개봉 기준 확률</h3><p>SS는 보유한 종류가 2·3·4종일 때 미보유 카드 확률이 각각 ½·¼·⅛로 줄어듭니다. 보유·소진된 자리와 감소분은 일반 SSS로 지급됩니다.</p><div class="bgp-rate-grid">'+policy.pool.map(c=>{const s=config.stock.find(r=>r.code===c.code);return '<div><span>'+escape(c.name)+' <small>'+c.rank+'</small></span><b>'+escape(config.effectiveCardPercents[c.code])+'%</b><small>'+(s?'잔여 '+s.remaining+' / '+s.limit:'수량 제한 없음')+'</small></div>';}).join('')+'</div><p>'+Object.entries(config.settings.normalRankRatesPpm).filter(([r])=>r!=='SSS').map(([r,n])=>r+' '+n/10000+'%').join(' · ')+' · 일반 SSS '+escape(config.effectiveNormalSssPercent)+'% · 미획득 '+config.settings.missRatePpm/10000+'%</p>';
 }
 async function load(){
  const next=await request(pack.featurePath);if(closing)return next;
  config=next;displayRates();clearTimeout(boundary);
  window.dispatchEvent(new CustomEvent('blue-gear-pack:stock',{detail:{stock:next.stock,open:next.drawEnabled,scheduled:next.openingScheduled}}));
  if(next.openingScheduled)boundary=setTimeout(()=>run(async()=>{await load();drawControls();}),Math.max(180,Date.parse(next.openingAt)-Date.parse(next.serverNow)+150));
  update();return config;
 }
 async function present(receipt){
  if(closing)return;
  const rows=blackcrownReceiptResults(receipt,pack,policy);
  // Match Bloodmoon's per-batch SS/SSS contract reveals. Bulk receipts use the image grid.
  if(!receipt.format){
   for(const rank of ['SS','SSS']){
    const featured=rows.find(r=>r.rank===rank&&(r.limited||rank==='SSS'));if(!featured||closing)continue;
    const film=$('[data-film]');film.hidden=false;paused=false;$('[data-pause]').textContent='일시정지';
    status.textContent=featured.name+' · '+rank+' 계약';film.scrollIntoView({block:'nearest'});
    try{await cinema.play(featured,state=>{if(state==='paused'&&!closing){paused=true;$('[data-pause]').textContent='계속 재생';}});}
    finally{film.hidden=true;}
   }
  }
  if(closing)return;
  results.hidden=false;results.innerHTML='<div class="bgp-result-head"><h3>개봉 결과</h3><span>'+receipt.count.toLocaleString()+'회 · '+money(receipt.coinCost)+'</span></div><div class="bgp-result-grid">'+rows.map(r=>r.kind==='MISS'?'<div class="bgp-miss">미획득'+(r.quantity>1?' ×'+r.quantity:'')+'</div>':'<article data-grade="'+escape(r.rank)+'"><img loading="lazy" src="'+escape(r.artUrl)+'" alt=""><div><small>'+escape(r.rank)+(r.limited?' LIMITED':'')+'</small><strong>'+escape(r.name)+'</strong><span>'+(r.serial?'발행 '+r.serial+' / '+r.stockLimit:r.quantity>1?'×'+r.quantity:'1장')+'</span></div></article>').join('')+'</div>';
  dialog.classList.remove('bgp-opening');results.scrollIntoView?.({block:'nearest'});status.textContent='개봉 결과를 확인했습니다.';
 }
 const session=new BlackcrownOpeningSession({pack,drawPolicy:policy,api:request,accountId:id,getAccountId:()=>closing?0:getAccountId(),storage,lock,present,
  beforeOpen:async()=>{if(closing)throw Error('개봉실을 닫았습니다.');dialog.classList.add('bgp-opening');status.textContent='코어 개방 중…';},
  onConfirmed:receipt=>{const user=globalThis.loadUser?.();if(user&&Number(user.serverUserId)===id){user.coin=Number(receipt.coin);globalThis.saveUser?.(user,{source:'draw'});}globalThis.clearApiCache?.('packs');}});
 const auto=new BlackcrownAutoOpening({session,readConfig:load,isHidden:()=>document.hidden||closing,onUpdate:s=>{if(closing)return;status.textContent=s.reason||'자동 개봉 '+s.completed+'회 완료';update();}});
 async function run(fn){
  if(busy||closing)return;busy=true;update();
  try{await fn();}catch(e){if(!closing)status.textContent=e.message;}finally{busy=false;dialog.classList.remove('bgp-opening');update();}
 }
 controls.addEventListener('input',refreshQuote);
 function visibility(){if(document.hidden)auto.stop('화면을 벗어나 자동 개봉을 중지했습니다.');}
 document.addEventListener('visibilitychange',visibility,{signal:lifetime.signal});
 dialog.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-close'))return dialog.close();
  if(b.hasAttribute('data-stop'))return auto.stop();
  if(b.hasAttribute('data-skip'))return cinema.cancel();
  if(b.hasAttribute('data-pause')){paused=!paused;cinema.setPaused(paused);b.textContent=paused?'계속 재생':'일시정지';return;}
  if(b.hasAttribute('data-back')){purchase=null;$('[data-confirm]').hidden=true;controls.hidden=false;update();return;}
  if(b.hasAttribute('data-pay')&&purchase){
   const selected=purchase;purchase=null;$('[data-confirm]').hidden=true;controls.hidden=false;
   return run(async()=>{if(selected.mode==='auto')await auto.start(selected.config,selected.count,selected.repeats);
    else if(selected.mode==='bulk')await session.startBulk(selected.config,selected.quote);
    else await session.start(selected.config,selected.count);await load();});
  }
  if(b.hasAttribute('data-odds')){const rates=$('[data-rates]');rates.hidden=!rates.hidden;b.setAttribute('aria-expanded',String(!rates.hidden));if(!rates.hidden)rates.scrollIntoView({block:'nearest'});return;}
  if(b.hasAttribute('data-mode')){mode=b.dataset.mode;drawControls();return;}
  if(b.hasAttribute('data-recover'))return run(async()=>{await session.recover();await load();});
  if(b.hasAttribute('data-buy'))purchase={mode:'single',config,count:Number(b.dataset.buy),total:config.settings.prices[Number(b.dataset.buy)===1?'single':'ten']};
  else if(b.hasAttribute('data-auto')&&autoQuote)purchase={mode:'auto',config,count:autoQuote.count,repeats:autoQuote.repeats,total:autoQuote.maxCost};
  else if(b.hasAttribute('data-bulk')&&quote)purchase={mode:'bulk',config,quote,count:quote.count,total:quote.coinCost};
  else return;
  const draws=purchase.count*(purchase.repeats||1);$('[data-total]').textContent=(purchase.mode==='auto'?'자동 ':'')+draws.toLocaleString()+'회 · '+(purchase.mode==='auto'?'최대 ':'')+money(purchase.total);
  controls.hidden=true;$('[data-confirm]').hidden=false;update();$('[data-pay]').focus();
 });
 dialog.addEventListener('close',()=>{closing=true;auto.stop();cinema.destroy();clearTimeout(boundary);lifetime.abort();dialog.remove();active=null;if(previous?.isConnected)previous.focus();},{once:true});
 await run(async()=>{await load();drawControls();if(id&&session.read(session.pendingKey)){const receipt=await session.reconcilePending();if(receipt?.retryable)status.textContent='이전 개봉 결과를 확인해 주세요.';}});
 return dialog;
}
