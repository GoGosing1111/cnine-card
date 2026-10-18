import {jointAdminRequest} from '../js/joint-account-transport.mjs';
import {SSS_REROLL_TOTAL,parseSssRerollPercent,sssRerollPercent,sssRerollReadiness,sssRerollOdds,sssRerollEligible} from '../shared/mercenary-sss-reroll-v1.mjs?v=kangyun-20261018';
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,saving=false,pending=null;
const message=text=>{$('admin-status').textContent=text;},pct=n=>Number(n.toFixed(6)).toLocaleString('ko-KR',{maximumFractionDigits:6})+'%';
function draft(){return{...state.policy,mode:$('mode').value,notes:$('notes').value,cards:Object.fromEntries([...$('card-inputs').querySelectorAll('[data-code]')].map(input=>[input.dataset.code,parseSssRerollPercent(input.value)]))};}
function update(){
 try{const policy=draft(),ready=sssRerollReadiness(policy,state.catalog);$('total').textContent=pct(ready.total/1e6);$('readiness').textContent=ready.ready?'확률 설정 완료 · ON 저장 시 재뽑기를 이용할 수 있습니다.':ready.blockers.join(' ');$('save').disabled=saving||policy.mode==='ON'&&!ready.ready;
  const odds=sssRerollOdds(policy,state.catalog,$('source-preview').value);$('actual-odds').innerHTML=odds.length?odds.map(c=>'<div class="actual-row"><span>'+esc(c.name)+'</span><b>'+pct(c.percent)+'</b></div>').join(''):'<p class="cms-help">투입 용병을 제외한 확률을 설정하세요.</p>';
 }catch(error){$('readiness').textContent=error.message;$('save').disabled=true;}
}
function render(){
 $('policy-form').hidden=false;$('mode').value=state.policy.mode;$('notes').value=state.policy.notes;$('mode-badge').textContent=state.mode==='ON'?'ON · 운영 중':'OFF · 중지';
 $('revision').textContent='저장 버전 '+state.revision+(state.updatedAt?' · '+new Date(state.updatedAt).toLocaleString('ko-KR'):' · 아직 저장하지 않음');
 $('card-inputs').innerHTML=state.catalog.map(c=>'<div class="cms-card '+(!sssRerollEligible(c)?'unavailable':'')+'"><img src="'+esc(c.sourceArt)+'" alt=""><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.code)+' · '+(sssRerollEligible(c)?'일반 SSS':esc(c.rank)+' · 획득 불가')+'</small></div><label><input aria-label="'+esc(c.name)+' 기준 확률" inputmode="decimal" autocomplete="off" data-code="'+esc(c.code)+'" value="'+sssRerollPercent(state.policy.cards[c.code])+'" placeholder="미설정"><span>%</span></label></div>').join('');
 $('source-preview').innerHTML=state.catalog.filter(c=>c.rank==='SSS'&&!c.limited).map(c=>'<option value="'+esc(c.code)+'">'+esc(c.name)+'</option>').join('');update();
}
async function load(){
 if(saving)return;$('reload').disabled=true;
 try{state=await jointAdminRequest('admin/mercenary-sss-reroll');if(!state.isOwner)throw Error('OWNER만 관리할 수 있습니다.');pending=null;render();message(state.revision===0?'최초 확률은 미입력 상태입니다. 용병별 확률을 설정해 주세요.':'현재 저장된 설정입니다. 수정한 확률은 저장 후 적용됩니다.');}
 catch(error){message(error.message||'설정을 불러오지 못했습니다.');}
 finally{$('reload').disabled=false;}
}
$('reload').onclick=load;$('policy-form').addEventListener('input',()=>{pending=null;update();});$('source-preview').addEventListener('change',update);
$('equalize').onclick=()=>{
 const eligible=state.catalog.filter(sssRerollEligible);if(eligible.length<2){message('획득 가능한 일반 SSS 용병이 최소 2종 필요합니다.');return;}
 const base=Math.floor(SSS_REROLL_TOTAL/eligible.length),remainder=SSS_REROLL_TOTAL%eligible.length;
 for(const input of $('card-inputs').querySelectorAll('[data-code]')){const index=eligible.findIndex(c=>c.code===input.dataset.code);input.value=sssRerollPercent(index<0?0:base+(index<remainder?1:0));}pending=null;update();message('균등 배분 초안입니다. 설정 저장 전에는 적용되지 않습니다.');
};
$('policy-form').onsubmit=async event=>{
 event.preventDefault();if(saving)return;
 let policy;try{policy=draft();}catch(error){message(error.message);return;}
 if(policy.mode==='ON'&&!sssRerollReadiness(policy,state.catalog).ready){update();return;}
 if(!pending)pending={requestId:crypto.randomUUID(),revision:state.revision,policy};
 saving=true;const inputs=[...$('policy-form').querySelectorAll('input,select,textarea,button')];inputs.forEach(e=>e.disabled=true);$('reload').disabled=true;message('설정을 저장하고 있습니다.');
 try{state=await jointAdminRequest('admin/mercenary-sss-reroll',{method:'PATCH',body:pending});pending=null;render();message('저장 완료 · '+state.mode+' · 버전 '+state.revision);}
 catch(error){if(error.code==='SSS_REROLL_REVISION_CONFLICT'){pending=null;message('다른 창에서 설정을 변경했습니다. 최신 설정을 불러온 뒤 수정하세요.');}else message(error.message||'저장 결과가 불확실합니다. 같은 설정을 다시 저장하면 기존 요청을 확인합니다.');}
 finally{saving=false;inputs.forEach(e=>e.disabled=false);$('reload').disabled=false;update();}
};
load();
