import{OPTIONS,LIMITS,createState,probabilities,coinCost,valueText,polish}from'./model.mjs';
import{PolishFX,TIMING}from'./fx.mjs';
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const vendor=globalThis.CNineUiFxVendor,gsap=vendor?.gsap;
let state=createState(),visibleState=state,receipt=null,busy=false,requestSerial=0,ready=false,fx=null,slide=0,drag=null,returnTween=null;
const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');$('#reduced').checked=reducedQuery.matches;
const controls=['idle','charge','slide','result'];
function showControls(which){controls.forEach(id=>$('#'+id+'-controls').hidden=id!==which);}
function title(label,text,description){$('#phase-label').textContent=label;$('#scene-title').textContent=text;$('#scene-description').textContent=description;}
function step(index){all('[data-step]').forEach(el=>el.classList.toggle('current',Number(el.dataset.step)===index));}
$('#options').innerHTML=OPTIONS.map((option,i)=>`<div class="option-row" data-option="${i}"><div class="name-row"><span class="option-symbol" aria-hidden="true">${option.symbol}</span><strong>${option.name}</strong><span class="option-value">+0${option.unit}</span><span class="option-chance">20%</span></div><div class="option-level">${Array.from({length:10},()=>'<i></i>').join('')}<small>0/10</small></div></div>`).join('');
function updatePanel(snapshot=state){visibleState=snapshot;const rates=probabilities(snapshot);all('.option-row').forEach((el,i)=>{el.querySelector('.option-value').textContent=valueText(i,snapshot.levels[i]);el.querySelector('.option-chance').textContent=snapshot.levels[i]>=10?'MAX':rates[i]?(Math.round(rates[i]*10)/10)+'%':'—';el.querySelector('.option-level small').textContent=snapshot.levels[i]+'/10';[...el.querySelectorAll('.option-level i')].forEach((mark,j)=>mark.classList.toggle('filled',j<snapshot.levels[i]));});$('#total').innerHTML=String(snapshot.total).padStart(2,'0')+'<small> / 20</small>';$('#total-fill').style.width=snapshot.total/20*100+'%';$('#inventory').textContent='연마석 '+state.stones+'개';$('#cost').textContent=coinCost(state).toLocaleString('ko-KR');$('#next').disabled=state.total>=20;$('#next').innerHTML=state.total>=20?'연마 완료':'한 번 더 연마 <b>↗</b>';}
function highlight(index,selected=false){all('.option-row').forEach((el,i)=>{el.classList.toggle('active',i===index&&!selected);el.classList.toggle('selected',i===index&&selected);});}
function lockTools(value){$('#reset').disabled=value;$('#start').disabled=value||!ready||state.total>=20;$('#pause').disabled=!value;$('#pause').textContent='일시정지';}
function chargeSet(value){slide=Math.max(0,Math.min(1,value));const width=$('#slide-track').clientWidth-$('#slide-handle').offsetWidth-10;$('#slide-handle').style.transform=`translateX(${Math.max(0,width)*slide}px)`;$('#slide-fill').style.width=slide*100+'%';$('#slide-percent').textContent=Math.round(slide*100)+'%';$('#slide-handle').setAttribute('aria-valuenow',String(Math.round(slide*100)));fx?.setCharge(slide);}
function showResult(){if(!receipt)return;busy=false;showControls('result');$('#skip').hidden=true;lockTools(false);$('#pause').disabled=true;updatePanel();highlight(receipt.selected,true);title('POLISH COMPLETE','새로운 힘이 깨어났습니다',OPTIONS[receipt.selected].name+'이 1단계 상승했습니다.');step(2);$('#result-name').textContent=OPTIONS[receipt.selected].name;$('#result-before').textContent=valueText(receipt.selected,receipt.before);$('#result-after').textContent=valueText(receipt.selected,receipt.after);$('#next').focus({preventScroll:true});}
function begin(replay=false){
 if(busy||!ready)return;
 if(!replay){try{const before=state;const result=polish(state,'preview-'+(++requestSerial));state=result.state;receipt=result.receipt;updatePanel(before);}catch(error){title('POLISH COMPLETE','연마 완료',error.message);return;}}
 else{const levels=state.levels.slice();levels[receipt.selected]=receipt.before;updatePanel({...state,levels,total:receipt.total-1});}
 busy=true;lockTools(true);highlight(-1);showControls('charge');$('.charging-label').textContent='연마석의 힘을 봉인에 담는 중';$('#skip').hidden=false;chargeSet(0);title('ESSENCE CONDENSING','연마석의 힘이 모입니다','다섯 갈래의 빛이 봉인 안으로 스며듭니다.');step(0);
 if(fx)fx.begin(receipt);else showResult();
}
function release(){if(!busy||fx?.phase!=='sealed')return;returnTween?.kill();chargeSet(1);fx.release();}
$('#start').addEventListener('click',()=>begin());$('#next').addEventListener('click',()=>begin());$('#replay').addEventListener('click',()=>begin(true));
$('#skip').addEventListener('click',()=>{returnTween?.kill();drag=null;fx?fx.skip():showResult();});
$('#pause').addEventListener('click',()=>{$('#pause').textContent=fx?.pause()?'재개':'일시정지';});
$('#speed').addEventListener('change',()=>fx?.setSpeed(Number($('#speed').value)));
$('#reduced').addEventListener('change',()=>{fx?.setReduced($('#reduced').checked);if($('#reduced').checked&&busy&&!fx)showResult();});
$('#sound').addEventListener('click',async()=>{const next=$('#sound').getAttribute('aria-pressed')!=='true';const enabled=fx?await fx.setSound(next):false;$('#sound').setAttribute('aria-pressed',String(enabled));$('#sound').textContent=enabled?'사운드 ON':'사운드 OFF';});
$('#reset').addEventListener('click',()=>{if(busy)return;state=createState();receipt=null;fx?.idle();highlight(-1);showControls('idle');updatePanel();$('#start').disabled=!ready;title('READY TO POLISH','잠든 힘을 깨우세요','연마석의 빛이 장비의 한 가지 능력을 끌어올립니다.');step(0);});
const handle=$('#slide-handle'),track=$('#slide-track');
handle.addEventListener('pointerdown',event=>{if(fx?.phase!=='sealed')return;event.preventDefault();returnTween?.kill();drag={id:event.pointerId,x:event.clientX,start:slide};handle.setPointerCapture(event.pointerId);});
handle.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const travel=track.clientWidth-handle.offsetWidth-10;chargeSet(drag.start+(event.clientX-drag.x)/travel);});
function endDrag(event,cancel=false){if(!drag||event.pointerId!==drag.id)return;drag=null;if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);if(!cancel&&slide>=.92){release();return;}const value={p:slide};if(gsap)returnTween=gsap.to(value,{p:0,duration:.35,ease:'power3.out',onUpdate:()=>chargeSet(value.p)});else chargeSet(0);}
handle.addEventListener('pointerup',event=>endDrag(event));handle.addEventListener('pointercancel',event=>endDrag(event,true));handle.addEventListener('lostpointercapture',event=>{if(drag)endDrag(event,true);});
handle.addEventListener('keydown',event=>{if(fx?.phase!=='sealed')return;if(['Enter',' ','End'].includes(event.key)){event.preventDefault();release();}else if(event.key==='ArrowRight'){event.preventDefault();chargeSet(slide+.1);if(slide>=1)release();}else if(event.key==='ArrowLeft'||event.key==='Home'){event.preventDefault();chargeSet(event.key==='Home'?0:slide-.1);}});
window.addEventListener('resize',()=>{if(fx?.phase==='sealed')chargeSet(slide);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy&&fx&&!fx.paused&&fx.timeline?.isActive()){$('#pause').textContent=fx.pause()?'재개':'일시정지';}});
window.addEventListener('pagehide',()=>{returnTween?.kill();fx?.destroy();});
updatePanel();
try{fx=new PolishFX($('#canvas-host'),{
 onSealed:()=>{showControls('slide');title('SEAL READY','봉인을 열어 확인하세요','선택된 힘은 봉인 안에 담겨 있습니다.');step(1);$('#pause').disabled=true;chargeSet(0);handle.focus({preventScroll:true});},
 onOpening:()=>{showControls('charge');title('RESONANCE','장비와 힘이 공명합니다','선택된 옵션으로 연마석의 빛이 모입니다.');$('.charging-label').textContent='새로운 힘이 깨어나는 중';$('#pause').disabled=false;},
 onTick:(time)=>{$('#charge-progress').style.width=(time<=TIMING.sealed?time/TIMING.sealed:(time-TIMING.sealed)/(TIMING.end-TIMING.sealed))*100+'%';if(time>=TIMING.reveal&&busy){showControls('result');$('#result-name').textContent=OPTIONS[receipt.selected].name;$('#result-before').textContent=valueText(receipt.selected,receipt.before);$('#result-after').textContent=valueText(receipt.selected,receipt.after);$('#replay').disabled=true;$('#next').disabled=true;title('POLISH COMPLETE','새로운 힘이 깨어났습니다',OPTIONS[receipt.selected].name+'이 1단계 상승했습니다.');updatePanel();step(2);}},
 onHighlight:highlight,onResult:()=>{$('#replay').disabled=false;showResult();}
 });await fx.init();fx.setReduced($('#reduced').checked);}
catch(error){console.warn('Polish image fallback:',error.message);fx?.destroy();fx=null;$('#canvas-host').hidden=true;}
ready=true;$('#start').disabled=false;$('#start').innerHTML='<span>연마 시작</span><b>↗</b>';
