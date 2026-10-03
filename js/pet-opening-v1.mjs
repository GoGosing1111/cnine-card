import {jointAccountRequest,jointAdminRequest} from './joint-account-transport.mjs';
const $=id=>document.getElementById(id),review=new URLSearchParams(location.search).get('review')==='1',api=review?jointAdminRequest:jointAccountRequest;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,busy=false,pending=null,animationEnd=null;
const note=(message,tone='')=>{$('status').textContent=message;$('status').dataset.tone=tone;};
const max=()=>review?state?.settings.maxBatch||100:state?.maxOpen||0;
const quantity=()=>Number($('quantity').value),valid=()=>Number.isSafeInteger(quantity())&&quantity()>0&&quantity()<=max();
const pendingKey=()=>state?'pet_open_pending_v1:'+state.userId:null;
function persist(){if(review)return;try{pending?localStorage.setItem(pendingKey(),JSON.stringify(pending)):localStorage.removeItem(pendingKey());}catch{}}
function restore(){if(review)return;try{const saved=JSON.parse(localStorage.getItem(pendingKey())||'null');if(saved&&Number.isSafeInteger(saved.count)&&/^[a-zA-Z0-9_-]{8,100}$/.test(saved.requestId)&&Number.isSafeInteger(saved.expectedRevision)){pending=saved;$('quantity').value=saved.count;}}catch{}}
function controls(){
  $('cost').textContent=(Math.max(0,quantity()||0)*(state?.settings.essencePerOpen||10)).toLocaleString();
  $('open').disabled=busy||!state||!pending&&!valid();$('open').firstElementChild.textContent=busy?'봉인 해제 중…':pending?'개봉 결과 다시 확인':!review&&!state?.settings.enabled?'개봉 준비 중':review?'개봉 연출 검수':quantity().toLocaleString()+'개 개봉하기';
  $('quantity').disabled=busy||Boolean(pending);$('quantity').max=max()||1;
  $('minus').disabled=busy||Boolean(pending)||quantity()<=1;$('plus').disabled=busy||Boolean(pending)||quantity()>=max();
  document.querySelectorAll('[data-count]').forEach(button=>button.disabled=busy||Boolean(pending)||button.dataset.count!=='max'&&Number(button.dataset.count)>max()||max()===0);
  $('refresh').disabled=busy||Boolean(pending);$('rates').disabled=!state;
}
function cards(rows){
  return rows.map((pet,index)=>pet.outcome==='EMPTY'?'<article class="po-pet-card po-blank-card" style="--index:'+index+'"><div class="po-blank-art"><span aria-hidden="true">∅</span><p>인연이 닿지 않았습니다</p></div><div><b>꽝</b><strong>×'+pet.quantity+'</strong></div></article>':'<article class="po-pet-card" style="--index:'+index+'">'+(pet.isNew?'<span class="po-new">NEW BOND</span>':'')+'<img src="/'+esc(pet.sourceArt.replace(/^\//,''))+'" alt="'+esc(pet.name)+'" loading="lazy"><div><b>'+esc(pet.name)+'</b><strong>×'+pet.quantity+'</strong></div></article>').join('');
}
function render(){
  $('seals').textContent=review?'검수용':state.balances.seals.toLocaleString();$('essence').textContent=review?'차감 없음':state.balances.essence.toLocaleString();
  $('maximum').textContent=review?'연출 검수 최대 '+max()+'개':'개봉 가능 '+max().toLocaleString()+'개';
  $('unitCost').textContent='봉인구 1개당 정수 '+state.settings.essencePerOpen.toLocaleString()+'개';
  const list=review?state.catalog.map(p=>({...p,quantity:1})):state.ownedPets;
  $('collection').innerHTML=list?.length?cards(list):'<p class="po-empty">아직 깨어난 동료가 없습니다.<br><small>봉인구를 개봉하면 여기에 모입니다.</small></p>';
  if(review)$('collection').previousElementSibling.querySelector('h2').textContent='검수용 펫 후보';
  controls();
}
async function load({restorePending=true}={}){
  if(busy)return;busy=true;controls();note('보유 아이템과 개봉 설정을 확인하고 있습니다.');
  try{state=await api(review?'admin/pets/opening':'pets/opening/state');if(restorePending)restore();render();note(pending?'처리 중이던 개봉이 있습니다. 같은 요청으로 결과를 확인하세요.':review?'OWNER 검수 · 운영 획득 풀과 실제 지급은 별도로 설정합니다.':state.settings.enabled?max()>0?'개봉할 수량을 선택하세요.':'봉인구와 정수가 필요합니다. 보유 아이템을 확인하세요.':'획득 풀·확률 설정 후 개봉이 열립니다.');}
  catch(error){note(error.status===401?'로그인 후 다시 확인하세요.':error.message,'error');}
  finally{busy=false;controls();}
}
function setQuantity(value){$('quantity').value=Math.max(1,Math.min(max()||1,value));controls();}
$('minus').onclick=()=>setQuantity((quantity()||1)-1);$('plus').onclick=()=>setQuantity((quantity()||1)+1);
document.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>setQuantity(b.dataset.count==='max'?max():Number(b.dataset.count)));
$('quantity').oninput=()=>{controls();if(state&&!valid())note('1~'+max()+' 사이의 정수 수량을 입력하세요.','error');else if(state)note('개봉할 수량을 선택하세요.');};
$('refresh').onclick=()=>load();$('cancel').onclick=()=>$('confirm').close();
$('open').onclick=()=>{if(pending){void open();return;}if(!valid())return;$('confirmTitle').textContent=quantity()+'개 봉인을 해제할까요?';$('confirmCost').textContent='펫 봉인구 '+quantity()+'개 + 펫 정수 '+(quantity()*state.settings.essencePerOpen).toLocaleString()+'개';$('confirmNote').textContent=review?'OWNER 시각 검수 · 실제 차감과 지급이 없습니다.':state.settings.blankWeight>0?'꽝이 나오면 펫은 지급되지 않으며 봉인구·정수는 소모됩니다.':'개봉이 완료되면 사용한 아이템은 반환되지 않습니다.';$('confirm').showModal();};
$('confirmOpen').onclick=()=>{$('confirm').close();void open();};
function animate(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
  $('stage').classList.add('is-opening');$('skip').hidden=false;
  return new Promise(resolve=>{const timer=setTimeout(finish,2100);function finish(){clearTimeout(timer);$('stage').classList.remove('is-opening');$('skip').hidden=true;animationEnd=null;resolve();}animationEnd=finish;});
}
$('skip').onclick=()=>animationEnd?.();
async function open(){
  if(busy||!state||!pending&&!valid())return;
  if(!pending){pending={requestId:crypto.randomUUID(),count:quantity(),expectedRevision:state.settings.revision};persist();}
  busy=true;controls();note(review?'봉인 해제 연출을 검수합니다.':'봉인을 해제하고 있습니다. 응답을 기다려 주세요.');
  try{
    const result=await api(review?'admin/pets/opening/review':'pets/opening/open',{method:'POST',body:review?{count:pending.count}:pending});
    pending=null;persist();await animate();
    const groups=new Map();for(const pet of result.results){const p=groups.get(pet.code)||{...pet,quantity:0};p.quantity++;p.isNew=p.isNew||pet.isNew;groups.set(pet.code,p);}
    const blankCount=result.results.filter(p=>p.outcome==='EMPTY').length,petCount=result.count-blankCount;
    $('resultCards').innerHTML=cards([...groups.values()].sort((a,b)=>Number(a.outcome==='EMPTY')-Number(b.outcome==='EMPTY')));$('results').classList.add('is-revealing');$('results').classList.toggle('is-all-blank',petCount===0);
    $('resultTitle').textContent=review?'봉인 해제 연출 검수':petCount?'새로운 동료가 깨어났습니다':'이번 봉인에는 동료가 없었습니다';
    $('resultSummary').textContent=(review?'검수 전용 · 펫 '+petCount+'마리 / 꽝 '+blankCount+'회 · 실제 지급 없음'+(result.demoPool?' · 운영 확률 미정':''):'펫 '+petCount+'마리 획득 · 꽝 '+blankCount+'회 · 봉인구 '+result.cost.seals+'개 / 정수 '+result.cost.essence+'개 사용');
    $('resultCount').textContent=result.count.toLocaleString();$('resultPetCount').textContent=petCount.toLocaleString();$('resultBlankCount').textContent=blankCount.toLocaleString();
    $('resultSpent').innerHTML=review?'<b>OWNER 검수</b><span>실제 아이템 차감 · 지급 없음</span>':'<span><img src="/assets/items/pet-opening-v1/pet-seal-orb.webp" alt="">봉인구 <b>−'+result.cost.seals.toLocaleString()+'</b></span><span><img src="/assets/items/pet-opening-v1/pet-essence.webp" alt="">정수 <b>−'+result.cost.essence.toLocaleString()+'</b></span>';
    if(!review){try{state=await api('pets/opening/state');render();}catch{state.balances=result.balances;state.maxOpen=Math.max(0,Math.min(state.settings.maxBatch,result.balances.seals,Math.floor(result.balances.essence/state.settings.essencePerOpen)));}}
    note(review?'연출 검수가 완료되었습니다. 실제 아이템과 보유 펫은 그대로입니다.':'개봉 완료 · 펫 '+petCount+'마리 획득 / 꽝 '+blankCount+'회');
    $('results').showModal();
  }catch(error){
    const retry=error.retryable||error.name==='AbortError'||error.status>=500||['JOINT_LOCK_BUSY','JOINT_RESPONSE_INVALID'].includes(error.code);
    if(!retry){pending=null;persist();}
    note(retry?'응답을 확인하지 못했습니다. ‘개봉 결과 다시 확인’을 누르면 같은 요청의 결과를 확인합니다.':error.message,'error');
  }finally{busy=false;controls();}
}
$('results').addEventListener('close',()=>{$('results').classList.remove('is-revealing');$('open').focus({preventScroll:true});});
$('again').onclick=()=>{$('results').close();requestAnimationFrame(()=>$('quantity').focus({preventScroll:true}));};
$('rates').onclick=()=>{if(!state)return;const pool=state.pool||[],demo=review&&!pool.length,rows=demo?state.catalog:pool;$('poolNote').textContent=demo?'시각 검수용 후보입니다. 운영 풀과 확률은 아직 정해지지 않았습니다.':pool.length?'각 봉인구에서 펫 또는 꽝을 독립 추첨합니다. 꽝에서도 개봉 비용은 소모됩니다.':'획득 풀과 확률이 아직 설정되지 않았습니다.';$('poolRows').innerHTML=rows.map(p=>'<div class="po-rate-row"><img src="/'+esc(p.sourceArt.replace(/^\//,''))+'" alt=""><b>'+esc(p.name)+'</b><strong>'+(demo?'미정':(p.probability*100).toLocaleString('ko-KR',{maximumFractionDigits:4})+'%')+'</strong></div>').join('')+(rows.length?'<div class="po-rate-row po-blank-rate"><span class="po-rate-blank-mark" aria-hidden="true">∅</span><b>꽝 · 펫 지급 없음</b><strong>'+(demo?'미정':((state.blankProbability||0)*100).toLocaleString('ko-KR',{maximumFractionDigits:4})+'%')+'</strong></div>':'');$('probabilities').showModal();};
if(review){document.body.classList.add('po-review-mode');$('reviewNote').hidden=false;$('back').href='/admin/';$('back').innerHTML='<span aria-hidden="true">←</span> 펫 CMS';$('equipment').href='/pets/?review=1';}
await load();
if(!review){
  for(const [src,attributes] of [['/js/soopketmon-v21-exact-shell-adapter.js?v=2108-shared-navigation',{enabled:'false'}],['/js/adventure-lobby-v2107.js?v=2108-shared-navigation',{}],['/js/adventure-navigation-standalone.js?v=2108-shared-navigation',{route:'deck'}]]){
    await new Promise(resolve=>{const script=document.createElement('script');script.src=src;Object.assign(script.dataset,attributes);script.onload=resolve;script.onerror=resolve;document.head.append(script);});
  }
}
