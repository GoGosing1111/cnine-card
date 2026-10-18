import {jointAccountRequest} from '../../js/joint-account-transport.mjs';
import {sssRerollOdds} from '../../shared/mercenary-sss-reroll-v1.mjs?v=kangyun-20261018';
import {createRerollClient} from './client.mjs?v=20261014-v1';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const preview=new URLSearchParams(location.search).get('preview')==='1',reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let state,client,selected=null,busy=false,shown=null,chargeTimer,revealTimer;
const percent=n=>Number(n.toFixed(6)).toLocaleString('ko-KR',{maximumFractionDigits:6})+'%';
const status=text=>{$('status').textContent=text;};
function selectedCard(){return state?.cards.find(c=>c.code===selected);}
function syncAction(){
 const card=selectedCard(),pending=client?.pending();
 $('selected-name').textContent=card?.name||'선택 가능한 일반 SSS 용병이 없습니다';
 $('selected-count').textContent=card?'보유 '+card.copies+'장 → '+(card.copies-1)+'장':'';
 $('begin').disabled=busy||!state||(!pending&&(!state.openingEnabled||!card?.selectable||state.balance<1));
 $('begin').innerHTML=busy?'계약 확인 중…':pending?'이전 요청 결과 확인 <span>↗</span>':preview?'재뽑기 연출 미리보기 <span>↗</span>':'이 계약으로 재뽑기 <span>↗</span>';
 $('refresh').disabled=busy;$('previous').disabled=busy;
 for(const button of $('roster').querySelectorAll('button')){button.setAttribute('aria-pressed',String(button.dataset.code===selected));button.disabled=busy||Boolean(pending)||!state.cards.find(c=>c.code===button.dataset.code)?.selectable;}
}
function render(){
 $('balance').innerHTML=state.balance.toLocaleString('ko-KR')+'<small>'+(preview?'미리보기':'보유')+'</small>';
 if(!state.cards.some(c=>c.code===selected&&c.selectable))selected=state.cards.find(c=>c.selectable)?.code||null;
 $('roster').innerHTML=state.cards.length?state.cards.map(c=>'<button type="button" class="roster-card" data-code="'+esc(c.code)+'" aria-pressed="false" '+(!c.selectable?'disabled':'')+' title="'+esc(c.disabledReason||c.name+' 1장 선택')+'"><img loading="lazy" src="'+esc(c.sourceArt)+'" alt=""><span class="rank">SSS</span><span class="roster-copy"><strong>'+esc(c.name)+'</strong><small>보유 '+c.copies+'장'+(c.equipped?' · 편성 중':'')+(!c.selectable?' · 보호':'')+'</small></span></button>').join(''):'<p class="empty">보유한 일반 SSS 용병이 없습니다. 일반 SSS 용병 1장과 재뽑기권이 필요합니다.</p>';
 $('previous').hidden=!state.recentReceiptId;
 if(!state.openingEnabled)status('SSS 재뽑기 준비 중입니다. 운영 설정이 완료되면 이용할 수 있습니다.');
 else if(state.balance<1)status('SSS 재뽑기권이 필요합니다.');
 else status(preview?'미리보기에서는 실제 계정과 재화를 변경하지 않습니다.':'선택한 용병과 재뽑기권을 각 1개씩 소모합니다.');
 syncAction();document.body.dataset.ready='true';
}
async function refresh(){
 if(busy)return;
 busy=true;$('refresh').disabled=true;
 try{
  if(preview){state=await fetch('/preview/sss-reroll-v1/demo.json').then(r=>{if(!r.ok)throw Error('미리보기 자료를 불러오지 못했습니다.');return r.json();});$('preview-label').hidden=false;}
  else{state=client?await client.state():await jointAccountRequest('mercenary-sss-reroll/state');if(!client)client=createRerollClient({accountId:state.accountId});}
  render();
  if(client?.pending()){
   status('확인하지 않은 이전 요청이 있습니다. 같은 요청의 결과를 확인합니다.');
   const receipt=await client.run(null,{submit:false});if(receipt?.status==='COMPLETED')showCeremony(receipt);else status('이전 요청이 남아 있습니다. ‘이전 요청 결과 확인’을 눌러 완료하세요.');
  }
 }catch(error){status(error.message||'불러오지 못했습니다. 잠시 후 다시 확인하세요.');}
 finally{busy=false;$('refresh').disabled=false;if(state)syncAction();}
}
$('roster').addEventListener('click',event=>{const b=event.target.closest('[data-code]');if(!b||b.disabled)return;selected=b.dataset.code;syncAction();});
$('begin').onclick=()=>{
 if(client?.pending()){submit();return;}
 const card=selectedCard();if(!card||busy)return;
 $('confirm-source').innerHTML='<img src="'+esc(card.sourceArt)+'" alt=""><div><strong>'+esc(card.name)+'</strong><span>SSS · '+card.copies+'장 → '+(card.copies-1)+'장</span></div>';
 $('confirm-last').textContent=preview?'연출 미리보기입니다. 실제 차감은 없습니다.':card.copies===1?'마지막 1장을 소모하면 이 용병은 보유 목록에서 사라집니다.':'같은 용병의 보유 수량이 1장 줄어듭니다.';
 $('confirm-dialog').showModal();$('cancel-confirm').focus();
};
$('cancel-confirm').onclick=()=>$('confirm-dialog').close();
$('confirm-begin').onclick=()=>{$('confirm-dialog').close();submit();};
async function submit(){
 if(busy)return;busy=true;syncAction();status('계약을 확인하고 있습니다. 잠시만 기다려 주세요.');
 try{
  let receipt;
  if(preview){const card=selectedCard(),result=sssRerollOdds(state.policy,state.catalog,selected)[0];receipt={requestId:'preview-only-no-mutation',status:'COMPLETED',source:{...card,totalBefore:card.copies,totalAfter:card.copies-1},result:{...result,mercenaryCode:result.code,quantity:1,totalCopiesAfter:1,duplicatesAfter:0,isDuplicate:false},balance:state.balance};}
  else receipt=await client.run(selected);
  if(receipt?.status==='COMPLETED'){status('새로운 계약이 확정됐습니다.');showCeremony(receipt);}else status('처리 중인 요청입니다. 같은 요청의 결과를 다시 확인해 주세요.');
 }catch(error){status(error.name==='AbortError'||error instanceof TypeError?'연결이 지연되었습니다. 같은 요청으로 결과를 다시 확인하세요.':error.message);}
 finally{busy=false;syncAction();}
}
$('refresh').onclick=refresh;
$('previous').onclick=async()=>{if(busy||!state.recentReceiptId)return;busy=true;syncAction();try{const receipt=await client.receipt(state.recentReceiptId);if(receipt.status==='COMPLETED')showCeremony(receipt);}catch(error){status(error.message);}finally{busy=false;syncAction();}};
$('open-odds').onclick=()=>{
 const card=selectedCard(),odds=state?sssRerollOdds(state.policy,state.catalog,selected):[];
 $('odds-context').textContent=!state?'확률을 불러오지 못했습니다.':!state.ready?'현재 확률 설정을 준비 중입니다.':(preview?'미리보기용 확률 · ':'')+(card?card.name+' 제외 후 실제 획득 확률':'투입 용병을 선택하면 실제 확률을 확인할 수 있습니다.');
 $('odds-list').innerHTML=state?.ready?odds.map(c=>'<div class="odds-row"><img src="'+esc(c.sourceArt)+'" alt=""><span>'+esc(c.name)+'</span><strong>'+percent(c.percent)+'</strong></div>').join(''):'';
 $('odds-dialog').showModal();
};
$('close-odds').onclick=()=>$('odds-dialog').close();
for(let i=0;i<28;i++){const dot=document.createElement('i');dot.style.setProperty('--angle',i*137.5+'deg');dot.style.setProperty('--delay',(i%6)*.035+'s');$('motes').append(dot);}
function showCeremony(receipt){
 clearTimeout(chargeTimer);clearTimeout(revealTimer);shown=receipt;
 const r=receipt.result,s=receipt.source;
 $('old-art').src=s.sourceArt;$('result-art').src=r.sourceArt;$('result-art').alt=r.name+' SSS 용병';$('result-title').textContent=r.title||'새로운 계약';$('result-name').textContent=r.name;
 $('result-summary').textContent=preview?'미리보기 완료 · 실제 차감 없음':s.name+' 1장 · 재뽑기권 1개 소모';
 $('result-duplicate').textContent=preview?'실제 결과는 설정된 확률에 따라 결정됩니다.':(r.isDuplicate?'중복 획득 · ':'새 용병 획득 · ')+r.name+' 보유 '+r.totalCopiesAfter+'장';
 $('ceremony').dataset.phase='charging';$('ceremony-eyebrow').textContent='CONTRACT TRANSFORMATION';$('ceremony-title').textContent='인연을 다시 잇는 중';$('ceremony-subtitle').textContent='당신의 새로운 계약이 봉인에 깃듭니다.';
 $('seal-controls').hidden=true;$('result-controls').hidden=true;$('charging-note').hidden=false;$('skip').hidden=false;$('seal-slider').value='0';
 if(!$('ceremony').open)$('ceremony').showModal();
 chargeTimer=setTimeout(()=>{if($('ceremony').dataset.phase!=='charging')return;$('ceremony').dataset.phase='sealed';$('ceremony-title').textContent='새로운 인연의 봉인';$('ceremony-subtitle').textContent='봉인을 열어 당신의 SSS 용병을 확인하세요.';$('seal-controls').hidden=false;$('charging-note').hidden=true;$('seal-slider').focus();},reduced?0:1800);
}
function reveal(){
 if(!shown||['result','reveal'].includes($('ceremony').dataset.phase))return;
 clearTimeout(chargeTimer);$('ceremony').dataset.phase='reveal';$('seal-controls').hidden=true;$('charging-note').hidden=true;$('skip').hidden=true;
 $('ceremony-eyebrow').textContent='A NEW LEGEND, A NEW CONTRACT';$('ceremony-title').textContent='새로운 계약이 새겨졌습니다';$('ceremony-subtitle').textContent=preview?'SSS 재뽑기 연출 미리보기':'다른 전설과의 인연이 시작됩니다.';
 revealTimer=setTimeout(()=>{$('ceremony').dataset.phase='result';$('result-controls').hidden=false;$('done').focus();},reduced?0:1050);
}
$('skip').onclick=reveal;
$('seal-slider').addEventListener('input',()=>{if(Number($('seal-slider').value)>=94)reveal();});
for(const event of ['pointerup','pointercancel','keyup'])$('seal-slider').addEventListener(event,()=>{if(Number($('seal-slider').value)<94)$('seal-slider').value='0';});
$('seal-slider').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();reveal();}});
async function finish(){
 const receipt=shown;if(!receipt)return;shown=null;clearTimeout(chargeTimer);clearTimeout(revealTimer);$('ceremony').close();
 if(!preview)client.acknowledge(receipt.requestId);await refresh();$('begin').focus();
}
$('done').onclick=finish;
$('ceremony').addEventListener('cancel',event=>{event.preventDefault();if($('ceremony').dataset.phase==='result')finish();else reveal();});
refresh();
