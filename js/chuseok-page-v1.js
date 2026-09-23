import {CHUSEOK_ASSETS as ART,CHUSEOK_EVENTS,cleanChuseokSettings} from './chuseok-model-v1.js';
import {openEventVoucher} from './event-vouchers-v1.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
const date=v=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const labels={HIDDEN:'공개 준비 중',UNCONFIGURED:'도전 OFF · 운영 설정 전',PAUSED:'도전 OFF · 준비 중',SCHEDULED:'오픈 예정',ENDED:'이벤트 종료',OPEN:'도전 가능'};
const copies={
 songpyeon:{eyebrow:'달빛 아래, 정성을 담은 한 입',title:'송편을 빚었는데,<br><em>뭘 먹어볼까?</em>',description:'동글동글 빚어낸 세 가지 송편.<br>마음이 가는 하나에, 오늘의 행운을 담아보세요.',names:['하얀 송편','분홍 송편','쑥빛 송편'],action:'송편 빚고 고르기',steps:['반죽에 소를 담아 송편 빚기','마음이 가는 송편 하나 고르기','추석 코인으로 도전하고 결과 확인']},
 envelope:{eyebrow:'당신의 모험에 보내는 작은 마음',title:'숲켓몬 하느라<br><em>고생 많았어.</em>',description:'올해도 함께해 줘서 고마워.<br>여기, 마음에 드는 봉투 하나 골라봐.',names:['비취 봉투','다홍 봉투','쪽빛 봉투'],action:'떡값 봉투 고르기',steps:['정성 담은 세 봉투를 펼치고','마음에 드는 봉투 하나 고르기','추석 코인으로 도전하고 선물 확인']}
};
export async function startChuseok(){
 const root=document.getElementById('chuseokApp');if(!root)return;
 let mode=new URLSearchParams(location.search).get('event')==='envelope'?'envelope':'songpyeon',state=null,stage=null,fxReady=false,busy=false,choosing=false,demo=false,leaving=false,login=false;
 root.className='ck-app';
 root.innerHTML=`<header class="ck-top"><div class="ck-title"><div class="ck-breadcrumb">숲켓몬 <i>/</i> 시즌 이벤트</div><h1>추석 달빛 잔치</h1></div><div class="ck-head-actions"><div class="ck-wallet"><img src="${ART}chuseok-coin.svg" alt=""><span>나의 추석 코인</span><b id="ckBalance">—</b></div><a href="/?screen=home">로비로 ↗</a></div></header>
 <nav class="ck-tabs" role="tablist" aria-label="추석 이벤트 선택"><button class="ck-tab" id="ckTabSongpyeon" role="tab" data-event="songpyeon" aria-controls="ckEventPanel"><span>01</span><b>송편 고르기</b><small>정성 한 입, 행운 한 입</small></button><button class="ck-tab" id="ckTabEnvelope" role="tab" data-event="envelope" aria-controls="ckEventPanel"><span>02</span><b>추석 떡값</b><small>봉투에 담긴 고마운 마음</small></button><div class="ck-status" id="ckStatus" role="status"><i></i><span>운영 정보 확인 중</span></div></nav>
 <div class="ck-layout" id="ckEventPanel" role="tabpanel"><div><section class="ck-play" aria-label="추석 이벤트 무대"><div class="ck-scene" id="ckScene"><div class="ck-demo-label" id="ckDemoLabel" hidden>연출 미리보기 · 코인 소모와 실제 상품 지급 없음</div><div class="ck-scene-copy"><small id="ckEyebrow"></small><h2 id="ckSceneTitle"></h2><p id="ckDescription"></p></div><div class="ck-stage" id="ckStage"></div><div class="ck-choices" id="ckChoices" hidden></div><div class="ck-scene-tools"><button type="button" id="ckSkip" hidden>연출 건너뛰기</button></div><div class="ck-scene-note" id="ckSceneNote" aria-live="polite">달빛이 내려앉은 찻상에 당신을 초대합니다.</div><div class="ck-loading" id="ckLoading">찻상을 준비하고 있어요…</div><div class="ck-result" id="ckResult" aria-live="polite" hidden></div></div>
 <div class="ck-controls"><div class="ck-cost"><img src="${ART}chuseok-coin.svg" alt=""><div><small>1회 도전 비용</small><b>추석 코인 <span id="ckCost">설정 전</span></b></div></div><button type="button" id="ckAction" class="ck-primary" disabled>준비 중 ${arrow}</button></div><div class="ck-error" id="ckError" role="alert" hidden></div></section>
 <div class="ck-below"><p><span id="ckLimit">도전 비용·상품·확률은 운영 설정 후 공개됩니다.</span><br><span id="ckPeriod">기간 설정 전 · 한국 시간(KST) 기준</span></p><div class="ck-actions-mini"><button class="ck-quiet" id="ckPreview">연출만 미리보기 ↗</button><button class="ck-quiet" id="ckRates">상품·확률 안내 ↗</button></div></div>
 <section class="ck-ledger"><div class="ck-ledger-head"><h2>나의 달빛 기록</h2><span>최근 20건 · 서버에서 확정한 결과</span></div><div id="ckHistory" class="ck-history-empty">로그인하면 도전 기록을 확인할 수 있습니다.</div></section><div class="ck-ticket-actions"><a href="/?screen=inventory">보유 상품·선택권은 인벤토리에서 확인 ↗</a></div></div>
 <aside class="ck-shelf" aria-label="이벤트 상품 안내"><div class="ck-shelf-header"><h2>오늘의 선물</h2><span id="ckRewardCount">PREPARING</span></div><div class="ck-rewards" id="ckRewards"></div><div id="ckEmptyArt" class="ck-empty-art"><img src="${ART}chuseok-coin.svg" alt="달을 새긴 추석 코인"></div><div id="ckEmptyCopy" class="ck-empty-copy"><strong>좋은 마음을 준비하고 있어요.</strong><p>상품과 확률이 정해지면<br>이곳에서 먼저 확인할 수 있습니다.</p></div><div class="ck-shelf-foot"><ol id="ckSteps"></ol><p class="ck-period">색과 위치에 관계없이<br>모든 선택의 당첨 확률은 같습니다.</p></div></aside></div>
 <dialog class="ck-dialog" id="ckDialog"><button type="button" class="ck-dialog-close" aria-label="닫기">×</button><div id="ckDialogBody"></div></dialog>`;
 const $=id=>root.querySelector('#'+id),dialog=$('ckDialog'),scene=$('ckScene'),action=$('ckAction'),coinIcon=ART+'chuseok-coin.svg';
 const current=()=>state?.events?.[mode],storageKey=()=>`cnine.chuseok.pending.v1:${state?.userId||''}`;
 const token=()=>{try{return localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{return '';}};
 async function api(path,body){const response=await fetch('/api/events/chuseok/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});let data;try{data=await response.json();}catch{throw Error('서버 응답을 확인하지 못했습니다.');}if(!response.ok)throw Object.assign(Error(data.error||'연결을 확인하세요.'),{status:response.status,code:data.code});return data;}
 function pending(){if(!state?.userId)return null;try{return JSON.parse(localStorage.getItem(storageKey())||'null');}catch{return null;}}
 function remember(body){try{localStorage.setItem(storageKey(),JSON.stringify(body));}catch{throw Error('결과 복구를 위해 브라우저 저장 공간이 필요합니다. 저장을 허용한 뒤 다시 도전하세요.');}}
 function forget(){try{localStorage.removeItem(storageKey());}catch{}}
 function error(message,needsLogin=false){$('ckError').hidden=!message;$('ckError').innerHTML=message?esc(message)+(needsLogin?' <a href="/?screen=home">게임에 로그인하기</a>':''):'';}
 function controls(){
  const s=current(),old=pending(),blocked=!s||s.phase!=='OPEN'||state.chuseokCoins<s.coinCost||(s.dailyLimit>0&&s.dailyUsed>=s.dailyLimit);
  let title=labels[s?.phase]||'운영 정보 확인 중';
  if(login)title='로그인 후 도전 가능';
  if(s?.phase==='OPEN')title=state.chuseokCoins<s.coinCost?'추석 코인 부족':s.dailyLimit>0&&s.dailyUsed>=s.dailyLimit?'오늘 도전 완료':copies[mode].action;
  if(choosing)title='마음에 드는 하나를 선택하세요';if(old)title='이전 도전 결과 확인';if(busy)title='잠시만 기다려주세요';
  action.innerHTML=esc(title)+arrow;action.disabled=busy||choosing||!fxReady||(!old&&blocked);
  $('ckPreview').disabled=busy||choosing||!fxReady||Boolean(old);$('ckPreview').textContent=choosing?'선택 중':'연출만 미리보기 ↗';
  root.querySelectorAll('[data-event]').forEach(b=>{b.disabled=busy||Boolean(old);b.setAttribute('aria-selected',String(b.dataset.event===mode));b.tabIndex=b.dataset.event===mode?0:-1;});
  $('ckBalance').textContent=state?.userId?Number(state.chuseokCoins).toLocaleString():'—';$('ckCost').textContent=s?.coinCost?`${s.coinCost.toLocaleString()}개`:'설정 전';
  $('ckStatus').querySelector('span').textContent=login?'로그인 후 내 정보 확인':labels[s?.phase]||'운영 정보 확인 중';$('ckStatus').dataset.phase=s?.phase||'UNCONFIGURED';
 }
 function paintRewards(){
  const rewards=current()?.rewards||[];$('ckRewardCount').textContent=rewards.length?`${rewards.length} REWARDS`:'PREPARING';
  $('ckEmptyArt').hidden=Boolean(rewards.length);$('ckEmptyCopy').hidden=Boolean(rewards.length);
  $('ckRewards').innerHTML=rewards.map(r=>`<article><img src="${esc(r.image||coinIcon)}" alt=""><div><b>${esc(r.name||r.ref||'상품 선택 전')}${r.kind==='ITEM'&&r.amount?' ×'+r.amount.toLocaleString():''}</b><small>${r.kind==='MISS'?'당첨 상품 없음':r.available===false?'지급 준비 중':r.kind==='EQUIPMENT'?'장비함에 1개 지급':r.kind==='MERCENARY'?'용병 카드 1장 지급':'당첨 즉시 지급'}</small><em>${r.rate===null?'확률 설정 전':r.rate+'%'}</em></div></article>`).join('');
 }
 function paintHistory(){
  const list=state?.history||[];const node=$('ckHistory');node.className=list.length?'ck-history':'ck-history-empty';
  node.innerHTML=list.length?list.map((r,i)=>`<button type="button" data-history="${i}" aria-label="${esc(CHUSEOK_EVENTS[r.event]+' '+date(r.completedAt)+' 결과 보기')}"><img src="${esc(r.reward?.image||coinIcon)}" alt=""><span><b>${esc(r.reward?.name||'꽝 · 당첨 상품 없음')}</b><small>${esc(CHUSEOK_EVENTS[r.event])} · ${date(r.completedAt)} · 추석 코인 ${r.coinCost}개</small></span></button>`).join(''):login?'로그인하면 도전 기록을 확인할 수 있습니다.':'아직 도전 기록이 없습니다. 새로운 행운을 기다리는 중이에요.';
 }
 function paint(){
  const c=copies[mode];$('ckEyebrow').textContent=c.eyebrow;$('ckSceneTitle').innerHTML=c.title;$('ckDescription').innerHTML=c.description;
  $('ckSteps').innerHTML=c.steps.map(t=>'<li>'+esc(t)+'</li>').join('');$('ckEventPanel').setAttribute('aria-labelledby',mode==='songpyeon'?'ckTabSongpyeon':'ckTabEnvelope');
  $('ckChoices').innerHTML=c.names.map((n,i)=>`<button type="button" class="ck-choice" data-choice="${i}" aria-pressed="false"><strong>0${i+1}</strong>${n}</button>`).join('');
  const s=current();$('ckLimit').textContent=s?.coinCost?`선택 후 도전 확인 시 차감 · 꽝에도 ${s.coinCost}개 소모${s.dailyLimit>0?' · 오늘 '+s.dailyUsed+'/'+s.dailyLimit+'회':''}`:'도전 비용·상품·확률은 운영 설정 후 공개됩니다.';
  $('ckPeriod').textContent=s?.startsAt&&s?.endsAt?`${date(s.startsAt)} — ${date(s.endsAt)} (KST)`:'기간 설정 전 · 한국 시간(KST) 기준';
  paintRewards();paintHistory();controls();
 }
 function reset(){
  choosing=false;demo=false;$('ckDemoLabel').hidden=true;$('ckResult').hidden=true;$('ckChoices').hidden=true;$('ckSceneNote').hidden=false;$('ckSkip').hidden=true;scene.dataset.active='false';
  $('ckSceneNote').textContent='달빛이 내려앉은 찻상에 당신을 초대합니다.';stage?.reset(mode);paint();
 }
 async function refresh(){const data=await api('state');state=data;login=false;paint();}
 function openDialog(html){$('ckDialogBody').innerHTML=html;if(!dialog.open)dialog.showModal();}
 async function animate(operation){if(!stage)return;let safety;try{await Promise.race([operation(),new Promise(resolve=>{safety=setTimeout(()=>{stage?.finish();resolve();},9000);})]);}finally{clearTimeout(safety);}}
 async function start(asDemo=false){
  if(busy||choosing||!fxReady)return;if(pending()){await execute(pending());return;}
  if(!asDemo&&action.disabled)return;reset();demo=asDemo;busy=true;controls();error('');
  $('ckDemoLabel').hidden=!demo;scene.dataset.active='true';scene.scrollIntoView({block:'start',behavior:'instant'});$('ckSkip').hidden=!stage;
  try{await animate(()=>stage.prepare(mode));}catch{error('연출이 간소화됩니다. 아래에서 하나를 선택하세요.');}
  if(leaving)return;busy=false;choosing=true;$('ckSkip').hidden=true;$('ckSceneNote').hidden=true;$('ckChoices').hidden=false;controls();$('ckChoices').querySelector('button')?.focus({preventScroll:true});
 }
 async function execute(body){
  if(busy)return;busy=true;choosing=false;dialog.close();$('ckChoices').hidden=true;error('');controls();let result;
  try{
   if(demo)result={ok:true,requestId:'presentation-only',event:mode,choice:body.choice,kind:'DEMO',reward:{name:'달빛 선물 · 연출 예시',image:coinIcon},completedAt:new Date().toISOString()};
   else{remember(body);result=await api('draw',body);state.chuseokCoins=result.chuseokCoins;state.coin=result.coin;}
  }catch(e){
   if(e.status>=400&&e.status<500&&![408,429].includes(e.status))forget();
   busy=false;reset();error(e.message+(pending()?' 「이전 도전 결과 확인」으로 같은 요청을 다시 확인하세요.':''),e.status===401);
   if(e.code==='SETTINGS_CHANGED'||e.code==='EVENT_CLOSED')await refresh().catch(()=>{});return;
  }
  mode=result.event;scene.dataset.active='true';$('ckSceneNote').hidden=false;$('ckSkip').hidden=!stage;
  try{await animate(()=>stage.reveal(result));}catch{/* A visual failure cannot undo a committed server receipt. */}
  if(leaving)return;showResult(result,demo);if(!demo){forget();state.history=[result,...(state.history||[]).filter(r=>r.requestId!==result.requestId)].slice(0,20);if(!result.replayed)current().dailyUsed++;paintHistory();}busy=false;$('ckSkip').hidden=true;controls();
  if(!demo)await refresh().catch(()=>error('상품 결과는 확정되었습니다. 최신 잔액을 불러오지 못했습니다. 새로고침해도 중복 지급되지 않습니다.'));
 }
 function showResult(result,isDemo=false){
  const win=result.kind!=='MISS',out=$('ckResult');out.hidden=false;$('ckSceneNote').hidden=true;
  out.innerHTML=`<small>${isDemo?'PRESENTATION ONLY':'CHUSEOK · '+(win?'GIFT RECEIVED':'MOONLIGHT RECORD')}</small><h3>${isDemo?'이렇게 선물을 만나게 돼요.':win?'달빛이 행운을 데려왔어요.':'이번에는 아쉽지만, 꽝이에요.'}</h3><p>${isDemo?'연출 예시입니다. 상품과 확률은 CMS 설정 후 공개되며, 코인 차감·상품 지급은 없습니다.':win?'상품이 지급되었습니다. 다시 받기를 누를 필요가 없어요.':'당첨 상품은 없으며, 도전에 사용한 추석 코인은 소모되었습니다.'}</p>${win?`<div class="ck-prize"><img src="${esc(result.reward.image||coinIcon)}" alt=""><div><small>${isDemo?'미리보기':result.reward.kind==='ITEM'?'아이템 ×'+result.reward.amount:result.reward.kind==='MERCENARY'?'용병 카드 1장':'지급 완료'}</small><b>${esc(result.reward.name)}</b></div></div>`:''}<button class="ck-primary" type="button" data-result-close>찻상으로 돌아가기 ${arrow}</button>${!isDemo&&win?'<a href="/?screen=inventory">인벤토리 확인 ↗</a>':''}`;
  out.querySelector('[data-result-close]').onclick=()=>{reset();action.focus({preventScroll:true});};
  scene.scrollIntoView({block:'start',behavior:'instant'});out.querySelector('[data-result-close]').focus({preventScroll:true});
 }
 function choose(index){
  if(!choosing||busy)return;stage?.select(index);root.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.choice)===index)));
  const s=current(),body={requestId:crypto.randomUUID(),event:mode,choice:index,revision:state?.revision,quote:s?.quote};
  if(demo){void execute(body);return;}
  openDialog(`<h2>${esc(copies[mode].names[index])}${mode==='songpyeon'?'을 먹어볼까요?':'를 열어볼까요?'}</h2><p>선택한 ${mode==='songpyeon'?'송편':'봉투'}으로 한 번 도전합니다.<br>색이나 위치에 따른 확률 차이는 없습니다.</p><div class="ck-confirm-cost"><span>이번 도전에 사용할 추석 코인</span><b>${s.coinCost.toLocaleString()}개</b></div><p>꽝에도 코인은 소모됩니다. 당첨 상품은 즉시 지급되며, 연출을 건너뛰어도 결과는 바뀌지 않습니다.</p><button class="ck-primary" id="ckConfirm">추석 코인 ${s.coinCost.toLocaleString()}개로 도전 ${arrow}</button>`);
  $('ckConfirm').onclick=()=>void execute(body);
 }
 $('ckRates').onclick=()=>{const rewards=current()?.rewards||[];openDialog('<h2>'+esc(CHUSEOK_EVENTS[mode])+' · 상품과 확률</h2><p>모든 선택의 확률은 같습니다. 표시된 확률로 서버에서 상품 1종을 추첨합니다. 장비·용병·아이템 중복 당첨도 표시 수량 그대로 지급합니다.</p>'+(rewards.length?'<table><thead><tr><th>상품</th><th>최종 확률</th></tr></thead><tbody>'+rewards.map(r=>'<tr><td>'+esc(r.name)+(r.kind==='ITEM'?' ×'+(r.amount??'미설정'):'')+'</td><td>'+(r.rate===null?'미설정':r.rate+'%')+'</td></tr>').join('')+'</tbody></table>':'<p>아직 상품과 확률을 설정하지 않았습니다. 현재 실제 도전은 OFF이며, 코인은 소모되지 않습니다.</p>')+'<p>추석 코인은 운영자가 설정한 쿠폰이나 지급을 통해 받을 수 있습니다. 아직 자동 획득처는 없습니다.</p>');};
 action.onclick=()=>void start();$('ckPreview').onclick=()=>void start(true);$('ckSkip').onclick=()=>stage?.finish();
 root.addEventListener('click',e=>{const tab=e.target.closest('[data-event]'),choice=e.target.closest('[data-choice]'),history=e.target.closest('[data-history]');if(tab&&!busy&&!pending()){mode=tab.dataset.event;reset();const url=new URL(location.href);url.searchParams.set('event',mode);window.history.replaceState(null,'',url);}if(choice)choose(Number(choice.dataset.choice));if(history&&!busy){const r=state.history[Number(history.dataset.history)];mode=r.event;reset();showResult(r);}});
 root.querySelector('.ck-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||busy||pending())return;e.preventDefault();const tabs=[...root.querySelectorAll('[data-event]')],tab=tabs[e.key==='Home'?0:e.key==='End'?1:mode==='songpyeon'?1:0];tab.click();tab.focus();});
 root.querySelector('.ck-dialog-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('click',e=>{if(e.target===dialog&&!busy)dialog.close();});
 window.addEventListener('pagehide',()=>{leaving=true;stage?.destroy();},{once:true});
 window.addEventListener('storage',e=>{if(e.key==='cnine_card_api_token'||e.key==='cnine_card_user_v10'){stage?.finish();location.reload();}});
 paint();
 await Promise.all([(async()=>{let timeout;try{if(!globalThis.ChuseokStage)throw Error('연출 모듈 로드 실패');stage=new globalThis.ChuseokStage($('ckStage'),{onPhase:t=>{$('ckSceneNote').textContent=t;}});await Promise.race([stage.init(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('연출 준비 시간 초과')),12000);})]);stage.reset(mode);}catch{stage?.destroy();stage=null;error('연출 리소스를 불러오지 못했습니다. 간소화 화면으로 선택과 결과를 확인할 수 있습니다.');}finally{clearTimeout(timeout);fxReady=true;$('ckLoading').hidden=true;controls();}})(),(async()=>{try{await refresh();}catch(e){login=e.status===401;const defaults=cleanChuseokSettings();state={...defaults,userId:null,chuseokCoins:0,history:[],events:Object.fromEntries(Object.entries(defaults.events).map(([k,s])=>[k,{...s,phase:'UNCONFIGURED',dailyUsed:0}]))};error(e.message,login);paint();}})()]);
 if(pending()){mode=pending().event;reset();error('이전 도전 결과가 확인되지 않았습니다. 같은 요청으로 결과를 확인할 수 있습니다.');}
 const itemCode=new URLSearchParams(location.search).get('use');if(['SUPERSTAR_UPGRADE_13_TICKET','VEHICLE_PARTS_150_CHOICE'].includes(itemCode)&&state?.userId)await openEventVoucher({itemCode,userId:state.userId,dialog,body:$('ckDialogBody'),token,refresh});
 return {refresh};
}
