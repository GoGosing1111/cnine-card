import {jointAccountRequest,jointAdminRequest} from '../js/joint-account-transport.mjs';
import {MIRACLE_RANKS,miraclePercent} from '../shared/miracle-cube-policy-v1.mjs';
const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const params=new URLSearchParams(location.search),adminPreview=params.get('admin')==='1',request=adminPreview?jointAdminRequest:jointAccountRequest;
let state=null,busy=false,animation=null,draws=[],previewing=false,filter='SSS',sound=false;
const activeAudio=new Set(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const pendingKey=()=>`cnine.miracle.pending:${state?.accountId||'unknown'}`;
function readPending(){try{return JSON.parse(localStorage.getItem(pendingKey())||'null');}catch{return null;}}
function clearPending(){localStorage.removeItem(pendingKey());$('#recover').hidden=true;}
function setPending(value){localStorage.setItem(pendingKey(),JSON.stringify(value));$('#recover').hidden=false;}
function status(message,error=false){$('#status').textContent=message;$('#status').classList.toggle('is-error',error);}
function stopSound(){for(const audio of activeAudio){audio.pause();audio.currentTime=0;}activeAudio.clear();}
function playSound(file,volume){if(!sound||reduced.matches||document.hidden)return;const audio=new Audio('/assets/sfx/v3-advancement-awakening-v1/'+file);audio.volume=volume;activeAudio.add(audio);audio.onended=()=>activeAudio.delete(audio);void audio.play().catch(()=>activeAudio.delete(audio));}
function controls(){
 $('#open-one').disabled=busy||adminPreview||!state?.openingEnabled||state.balance<1||Boolean(readPending());
 $('#open-ten').disabled=busy||adminPreview||!state?.openingEnabled||state.balance<10||Boolean(readPending());
 $('#preview').disabled=busy;$('#recover').disabled=busy;$('#balance').innerHTML=state?`${state.balance.toLocaleString()}<small>개</small>`:'—<small>개</small>';
}
async function load(){
 $('#retry-state').hidden=true;
 try{
  state=await request(adminPreview?'admin/miracle-cube':'miracle-cube/state');
  $('#owner-tools').hidden=!state.isOwner;$('#recover').hidden=!readPending();
  status(adminPreview?'운영자 연출 미리보기 · 실제 지급 없음':state.openingEnabled?'원하는 수량을 선택해 큐브를 개봉하세요.':'개봉 준비 중입니다. 운영 시작 후 이용할 수 있습니다.');
  controls();
 }catch(error){status(error.status===401?'로그인 후 보유 큐브와 개봉 상태를 확인할 수 있습니다.':error.message,true);$('#retry-state').hidden=false;}
}
function showRates(rank=filter){
 if(!state)return;filter=rank;
 $('#rank-filters').innerHTML=MIRACLE_RANKS.map(r=>`<button data-rank="${r}" class="${filter===r?'active':''}">${r} · ${miraclePercent(state.policy.ranks[r])}%</button>`).join('');
 const rows=state.catalog.filter(card=>card.rank===filter);
 $('#rate-list').innerHTML=rows.length?rows.map(card=>`<article class="mc-rate-row"><img src="${esc(card.sourceArt)}" alt="" loading="lazy"><div><strong>${esc(card.name)}</strong><small>${!card.available?'획득 잠금':`등급 내 ${card.withinRankPercent.toLocaleString('ko-KR',{maximumFractionDigits:6})}%`}</small></div><span>${state.ready&&card.available?card.percent.toLocaleString('ko-KR',{maximumFractionDigits:12})+'%':'설정 대기'}</span></article>`).join(''):'<p class="mc-rate-row">해당 등급의 용병을 준비 중입니다.</p>';
 if(!$('#rates-dialog').open)$('#rates-dialog').showModal();
}
function selectResult(index){
 const draw=draws[index];$('#result-art').src=draw.sourceArt;$('#result-art').alt=`${draw.rank} ${draw.name} 용병 원화`;$('#result-rank').textContent=draw.rank;$('#result-name').textContent=draw.name;
 $('#result-duplicate').textContent=previewing?'연출 확인용':draw.duplicate?'중복 용병 +1장':'새로운 용병 획득';
 $('#result-count').textContent=previewing?'미리보기에서는 큐브를 사용하거나 용병을 지급하지 않습니다.':`총 보유 ${draw.totalCopies}장 · 중복 ${draw.duplicateCount}장`;
 $('#result-list').querySelectorAll('button').forEach((button,i)=>button.classList.toggle('active',i===index));
}
function showResult(){
 animation?.kill();animation=null;stopSound();$('#skip').hidden=true;$('#closed-cube').hidden=false;$('#opening-canvas').hidden=true;$('.mc-flare').style.opacity='0';
 $('#result-context').textContent=previewing?'연출 미리보기 · 실제 지급 없음':`용병 소환 완료 · ${draws.length}장`;
 $('#result-list').innerHTML=draws.length>1?draws.map((draw,index)=>`<button data-result="${index}" aria-label="${esc(draw.name)} 결과 보기"><img src="${esc(draw.sourceArt)}" alt=""><b>${draw.rank}</b></button>`).join(''):'';
 selectResult(draws.reduce((best,draw,index)=>MIRACLE_RANKS.indexOf(draw.rank)>MIRACLE_RANKS.indexOf(draws[best].rank)?index:best,0));if(!$('#result-dialog').open)$('#result-dialog').showModal();
 if(!previewing)clearPending();busy=false;controls();status(previewing?'연출 미리보기를 마쳤습니다.':`용병 ${draws.length}장을 획득했습니다.`);
 $('#stage-caption').textContent='최상위 용병 큐브';
}
async function animateResult(){
 const highest=draws.reduce((rank,draw)=>MIRACLE_RANKS.indexOf(draw.rank)>MIRACLE_RANKS.indexOf(rank)?draw.rank:rank,'C');
 const sheet=new Image();sheet.src='/assets/ui/miracle-cube-v1/cube-opening.webp';
 try{await Promise.race([sheet.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Asset timeout')),8000))]);}catch{showResult();return;}
 const gsap=window.CNineUiFxVendor?.gsap;if(!gsap||reduced.matches){showResult();return;}
 const canvas=$('#opening-canvas'),ctx=canvas.getContext('2d'),motion={frame:0,energy:0},cellW=sheet.width/4,cellH=sheet.height/2;
 $('#closed-cube').hidden=true;canvas.hidden=false;$('#skip').hidden=false;$('#stage-caption').textContent='봉인이 반응합니다';
 const drawFrame=()=>{
  ctx.clearRect(0,0,800,800);const whole=Math.min(7,Math.round(motion.frame));
  const frame=(index,alpha)=>{ctx.globalAlpha=alpha;ctx.drawImage(sheet,index%4*cellW,Math.floor(index/4)*cellH,cellW,cellH,42,25,716,716);};
  frame(whole,1);ctx.globalAlpha=1;
  if(motion.energy>0){ctx.save();ctx.globalCompositeOperation='screen';const glow=ctx.createRadialGradient(400,415,12,400,415,330);glow.addColorStop(0,`rgba(255,239,188,${motion.energy*.6})`);glow.addColorStop(.45,`rgba(112,228,244,${motion.energy*.17})`);glow.addColorStop(1,'rgba(40,100,160,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,800,800);
   for(let i=0;i<38;i++){const a=i*2.39996,r=60+motion.energy*140+(i%6)*24;ctx.fillStyle=`rgba(245,232,179,${motion.energy*(.25+(i%3)*.2)})`;ctx.beginPath();ctx.arc(400+Math.cos(a)*r,410+Math.sin(a)*r*.85,1+i%3,0,Math.PI*2);ctx.fill();}ctx.restore();}
 };
 const step=index=>document.querySelectorAll('[data-step]').forEach(node=>node.classList.toggle('active',Number(node.dataset.step)===index));
 const pause=highest==='SSS'?.65:highest==='SS'?.35:.1;
 animation=gsap.timeline({onUpdate:drawFrame,onComplete:showResult});
 animation.call(()=>{step(0);playSound('riposte-advancement-v1.mp3',.18);},null,0)
  .to(motion,{frame:2,duration:.8,ease:'power1.inOut'},0)
  .call(()=>{step(1);$('#stage-caption').textContent='코어 개방';playSound('afterimage-advancement-v1.mp3',.12);},null,.85)
  .to(motion,{frame:5,duration:1.0,ease:'none'},.85)
  .to(motion,{energy:.7,duration:.7,ease:'power2.in'},1.3)
  .call(()=>{$('#stage-caption').textContent=highest==='SSS'?'찬란한 기적이 깨어납니다':'동료의 응답이 들려옵니다';},null,1.95)
  .to(motion,{frame:7,energy:1,duration:.8,ease:'power2.inOut'},2+pause)
  .call(()=>{step(2);playSound('immortal-advancement-v1.mp3',highest==='SSS'?.22:.16);},null,2.45+pause)
  .to($('.mc-flare'),{opacity:.8,duration:.2,ease:'power2.in'},2.7+pause)
  .to($('.mc-flare'),{opacity:0,duration:.5},2.9+pause)
  .to({}, {duration:.15},3.4+pause);
 drawFrame();
}
async function open(count,recover=false){
 if(busy||!state||adminPreview)return;busy=true;controls();previewing=false;status(recover?'이전 개봉 결과를 확인합니다.':'큐브의 봉인을 확인합니다.');
 let pending=readPending();
 try{
  if(!pending){pending={requestId:crypto.randomUUID(),count};setPending(pending);}
  let result;
  if(recover){try{result=await request('miracle-cube/receipt?requestId='+encodeURIComponent(pending.requestId));}catch(error){if(error.code!=='JOINT_NOT_FOUND')throw error;}}
  if(!result||result.status==='PENDING')result=await request('miracle-cube/open',{method:'POST',body:pending,timeoutMs:18000});
  if(result.status!=='COMPLETED'||!result.draws?.length)throw Error('개봉 결과를 확인 중입니다. 같은 요청으로 다시 확인하세요.');
  state.balance=result.balance;draws=result.draws;await animateResult();
 }catch(error){
  if(['MIRACLE_COUNT','MIRACLE_BALANCE','MIRACLE_CLOSED','MIRACLE_NOT_READY','MIRACLE_POLICY_CHANGED','MIRACLE_CATALOG_CHANGED','JOINT_OPERATION_SUPERSEDED'].includes(error.code))clearPending();
  status(error.message||'개봉 결과를 확인하지 못했습니다. 이전 개봉 결과 확인을 눌러 주세요.',true);busy=false;controls();
 }
}
$('#open-one').onclick=()=>void open(1);$('#open-ten').onclick=()=>void open(10);$('#recover').onclick=()=>void open(readPending()?.count||1,true);$('#retry-state').onclick=()=>void load();
$('#probabilities').onclick=()=>showRates();$('#catalog-button').onclick=()=>showRates();$('#rank-filters').onclick=event=>{const button=event.target.closest('[data-rank]');if(button)showRates(button.dataset.rank);};
$('#result-list').onclick=event=>{const button=event.target.closest('[data-result]');if(button)selectResult(Number(button.dataset.result));};
$('#preview').onclick=async()=>{if(busy||!state?.isOwner)return;const rank=$('#preview-rank').value,card=state.catalog.find(card=>card.rank===rank&&card.available);if(!card){status('해당 등급에 미리 볼 용병이 없습니다.',true);return;}previewing=true;draws=[{...card,mercenaryCode:card.code}];busy=true;controls();await animateResult();};
$('#sound').onclick=()=>{sound=!sound;$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').textContent='효과음 '+(sound?'ON':'OFF');if(!sound)stopSound();};
$('#skip').onclick=showResult;
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$('#'+button.dataset.close).close());
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopSound();animation?.pause();}else animation?.resume();});
window.addEventListener('pagehide',()=>{animation?.kill();stopSound();});
void load();
