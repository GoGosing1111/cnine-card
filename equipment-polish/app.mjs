import {jointAccountRequest} from '/js/joint-account-transport.mjs';
import {POLISH_OPTIONS,polishRates} from '/shared/equipment-polish-v1.mjs';
import {PolishFX,TIMING} from '/preview/equipment-polish-premium-v1/source/fx.mjs?v=20261005-live';
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search),credential=params.has('cms')?'admin':'player';
const api=(action,options={})=>jointAccountRequest('character/equipment/polish/'+action,{...options,credential});
const gsap=globalThis.CNineUiFxVendor?.gsap;
let data,items=[],selected,fx,levels=[0,0,0,0,0],receipt,busy=false,slide=0,drag,returnTween,loadGeneration=0;
const total=()=>levels.reduce((a,b)=>a+b,0),fmt=n=>{try{return BigInt(n).toLocaleString('ko-KR');}catch{return '—';}},value=(i,n)=>'+'+Number((n*data.settings.options[i].increment).toFixed(2))+POLISH_OPTIONS[i].unit;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');$('#reduced').checked=reduced.matches;
function title(label,text,sub){$('#phase-label').textContent=label;$('#scene-title').textContent=text;$('#scene-description').textContent=sub;}
function controls(which){['idle','charge','slide','result'].forEach(id=>$('#'+id+'-controls').hidden=id!==which);}
function step(n){all('[data-step]').forEach(el=>el.classList.toggle('current',Number(el.dataset.step)===n));}
function highlight(index,done=false){all('.option-row').forEach((el,i)=>{el.classList.toggle('active',index===i&&!done);el.classList.toggle('selected',index===i&&done);});}
function panel(snapshot=levels){
  const settings=data.settings,rates=polishRates(settings,snapshot),count=snapshot.reduce((a,b)=>a+b,0),cost=settings.costs[Math.min(count,settings.costs.length-1)];
  $('#options').innerHTML=POLISH_OPTIONS.map((o,i)=>`<div class="option-row" data-option="${i}"><div class="name-row"><span class="option-symbol">${o.symbol}</span><strong>${o.name}</strong><span class="option-value">${value(i,snapshot[i])}</span><span class="option-chance">${settings.options[i].enabled?(snapshot[i]>=settings.options[i].maxLevel?'MAX':rates[i].toFixed(1)+'%'):'OFF'}</span></div><div class="option-level">${Array.from({length:10},(_,j)=>`<i class="${j<snapshot[i]/settings.options[i].maxLevel*10?'filled':''}"></i>`).join('')}<small>${snapshot[i]}/${settings.options[i].maxLevel}</small></div></div>`).join('');
  $('#total').innerHTML=String(count).padStart(2,'0')+'<small> / '+settings.maxAttempts+'</small>';$('#total-fill').style.width=count/settings.maxAttempts*100+'%';
  $('#inventory').textContent=`${settings.material.name} ${fmt(data.wallet.stones)}개 · 마별 ${fmt(data.wallet.masterStars)}개 · 코인 ${fmt(data.wallet.coins)}`;
  $('#material-name').textContent=settings.material.name;$('#stone-cost').textContent=fmt(cost.stones);$('#star-cost').textContent=fmt(cost.masterStars);$('#cost').textContent=fmt(cost.coins);
}
function lock(on){busy=on;$('#equipment-select').disabled=on;$('#equipment-more').disabled=on;$('#reset').disabled=on;$('#pause').disabled=!on;$('#pause').textContent='일시정지';$('#start').disabled=on||!data.ownerReview||!selected||!fx||!selected.polishEligible;}
function chargeSet(n){slide=Math.max(0,Math.min(1,n));const travel=$('#slide-track').clientWidth-$('#slide-handle').offsetWidth-10;$('#slide-handle').style.transform=`translateX(${Math.max(0,travel)*slide}px)`;$('#slide-handle').setAttribute('aria-valuenow',Math.round(slide*100));$('#slide-percent').textContent=Math.round(slide*100)+'%';$('#slide-fill').style.width=slide*100+'%';fx?.setCharge(slide);}
function result(){controls('result');$('#skip').hidden=true;lock(false);$('#pause').disabled=true;$('#replay').disabled=false;$('#next').disabled=total()>=data.settings.maxAttempts;panel();highlight(receipt.selected,true);title('REVIEW COMPLETE','검수 결과를 확인하세요',POLISH_OPTIONS[receipt.selected].name+' 1단계 상승 · 실제 장비에는 적용되지 않습니다.');$('#result-name').textContent=POLISH_OPTIONS[receipt.selected].name;$('#result-before').textContent=value(receipt.selected,receipt.before);$('#result-after').textContent=value(receipt.selected,receipt.after);step(2);}
async function begin(replay=false){
  if(busy||!data.ownerReview||!selected||!selected.polishEligible||!fx)return;
  lock(true);$('#live-message').textContent='';
  try{
    if(!replay){receipt=await api('preview',{method:'POST',body:{instanceId:selected.instanceId,levels,revision:data.settings.revision}});levels=receipt.levels;}
    const before=[...levels];before[receipt.selected]=receipt.before;panel(before);highlight(-1);controls('charge');$('#skip').hidden=false;chargeSet(0);$('.charging-label').textContent='연마석의 힘을 봉인에 담는 중';title('ESSENCE CONDENSING','연마석의 힘이 모입니다','검수 연출 · 장비와 재화를 소모하지 않습니다.');step(0);fx.begin(receipt);
  }catch(error){lock(false);$('#live-message').textContent=error.message;}
}
async function choose(){
  if(busy)return;selected=items.find(i=>i.instanceId===$('#equipment-select').value);levels=[0,0,0,0,0];receipt=null;controls('idle');highlight(-1);fx?.idle();panel();
  $('#equipment-name').textContent=selected?.name||'보유 장비가 없습니다';$('#equipment-detail').textContent=selected?`#${selected.instanceId} · 강화 +${selected.enhancement?.level||0}${selected.equipped?' · 장착 중':''}`:'';
  title('READY TO POLISH','잠든 힘을 깨우세요',data.ownerReview?'보유 장비로 연출을 검수합니다. 실제 연마는 OFF입니다.':data.notice);step(0);
  $('#start').textContent=data.ownerReview?'연출 검수 · 차감 없음':'실제 연마 OFF';$('#live-message').textContent=selected&&!selected.polishEligible?'CMS에서 이 장비 부위가 제외되어 있습니다.':'';
  fx.weapon.visible=false;lock(true);try{
    if(selected){const u=new URL(selected.image,location.origin);if(u.protocol!=='https:'&&u.origin!==location.origin)throw Error('장비 이미지 경로를 확인하세요.');const texture=await globalThis.CNineUiFxVendor.pixi.Assets.load(u.href);fx.weapon.texture=texture;fx.weapon.visible=true;fx.itemSlot=selected.slot;fx.impactV=selected.image.includes('avalon-m4a1')?.30:.5;fx.layout();}
  }catch(error){$('#live-message').textContent='장비 이미지를 불러오지 못했습니다. 다른 장비를 선택해 주세요.';selected=null;}finally{lock(false);}
}
function renderPicker(){$('#equipment-select').innerHTML=items.length?items.map(i=>`<option value="${esc(i.instanceId)}">${esc(i.name)} · +${i.enhancement?.level||0} · #${i.instanceId}${i.equipped?' · 장착 중':''}</option>`).join(''):'<option>보유 장비 없음</option>';$('#equipment-more').hidden=!data.nextCursor;}
async function load(){
  const stamp=++loadGeneration;$('#retry-access').hidden=true;
  try{
    data=await api('state');if(stamp!==loadGeneration)return;items=data.items;$('#access-gate').hidden=true;$('.atelier').hidden=false;renderPicker();
    if(items.some(i=>i.instanceId===params.get('instanceId')))$('#equipment-select').value=params.get('instanceId');
    $('#polish-cms-link').hidden=!data.ownerReview;$('#live-note').textContent=data.ownerReview?'OWNER 연출 검수 · 저장된 CMS 정책으로 확인합니다. 실제 장비 성장과 재화 차감은 OFF이며, 검수 수치는 새로고침 시 초기화됩니다.':data.notice;
    $('.review-tools').hidden=!data.ownerReview;
    fx=new PolishFX($('#canvas-host'),{
      onSealed:()=>{controls('slide');title('SEAL READY','봉인을 열어 확인하세요','선택된 힘은 봉인 안에 담겨 있습니다.');step(1);$('#pause').disabled=true;chargeSet(0);$('#slide-handle').focus({preventScroll:true});},
      onOpening:()=>{controls('charge');title('RESONANCE','장비와 힘이 공명합니다','선택된 옵션으로 연마석의 빛이 모입니다.');$('.charging-label').textContent='새로운 힘이 깨어나는 중';$('#pause').disabled=false;},
      onTick:t=>{$('#charge-progress').style.width=(t<=TIMING.sealed?t/TIMING.sealed:(t-TIMING.sealed)/(TIMING.end-TIMING.sealed))*100+'%';},onHighlight:highlight,onResult:result
    });await fx.init();fx.setReduced($('#reduced').checked);await choose();
  }catch(error){if(stamp!==loadGeneration)return;fx?.destroy();fx=null;$('.atelier').hidden=true;$('#access-gate').hidden=false;$('#access-gate [role=status]').textContent=error.message;$('#retry-access').hidden=false;}
}
$('#retry-access').onclick=()=>void load();$('#equipment-select').onchange=()=>void choose();
$('#equipment-more').onclick=async()=>{if(busy||!data.nextCursor)return;lock(true);try{const next=await api('state?beforeId='+encodeURIComponent(data.nextCursor));const id=selected?.instanceId;data.nextCursor=next.nextCursor;items.push(...next.items.filter(i=>!items.some(old=>old.instanceId===i.instanceId)));renderPicker();if(id)$('#equipment-select').value=id;}catch(error){$('#live-message').textContent=error.message;}finally{lock(false);}};
$('#start').onclick=()=>void begin();$('#next').onclick=()=>void begin();$('#replay').onclick=()=>void begin(true);$('#reset').onclick=()=>void choose();
$('#skip').onclick=()=>{returnTween?.kill();drag=null;fx?.skip();};$('#pause').onclick=()=>$('#pause').textContent=fx?.pause()?'재개':'일시정지';$('#speed').onchange=()=>fx?.setSpeed(Number($('#speed').value));$('#reduced').onchange=()=>fx?.setReduced($('#reduced').checked);
$('#sound').onclick=async()=>{const on=await fx?.setSound($('#sound').getAttribute('aria-pressed')!=='true');$('#sound').setAttribute('aria-pressed',String(!!on));$('#sound').textContent=on?'사운드 ON':'사운드 OFF';};
function release(){if(fx?.phase!=='sealed')return;returnTween?.kill();chargeSet(1);fx.release();}
const handle=$('#slide-handle');
handle.onpointerdown=e=>{if(fx?.phase!=='sealed')return;e.preventDefault();returnTween?.kill();drag={id:e.pointerId,x:e.clientX,start:slide};handle.setPointerCapture(e.pointerId);};
handle.onpointermove=e=>{if(drag?.id===e.pointerId)chargeSet(drag.start+(e.clientX-drag.x)/($('#slide-track').clientWidth-handle.offsetWidth-10));};
function endDrag(e,cancel=false){if(drag?.id!==e.pointerId)return;drag=null;if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);if(!cancel&&slide>=.92)return release();const v={p:slide};returnTween=gsap.to(v,{p:0,duration:.35,ease:'power3.out',onUpdate:()=>chargeSet(v.p)});}
handle.onpointerup=e=>endDrag(e);handle.onpointercancel=e=>endDrag(e,true);handle.onlostpointercapture=e=>{if(drag)endDrag(e,true);};
handle.onkeydown=e=>{if(fx?.phase!=='sealed')return;if(['Enter',' ','End'].includes(e.key)){e.preventDefault();release();}else if(e.key==='ArrowRight'){e.preventDefault();chargeSet(slide+.1);if(slide>=1)release();}else if(['ArrowLeft','Home'].includes(e.key)){e.preventDefault();chargeSet(e.key==='Home'?0:slide-.1);}};
window.addEventListener('resize',()=>{if(fx?.phase==='sealed')chargeSet(slide);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy&&fx?.timeline?.isActive()&&!fx.paused)$('#pause').textContent=fx.pause()?'재개':'일시정지';});
window.addEventListener('pagehide',()=>{loadGeneration++;returnTween?.kill();fx?.destroy();});
window.addEventListener('storage',e=>{if(e.key===(credential==='admin'?'cnine_admin_token':'cnine_card_api_token'))location.reload();});
await load();
