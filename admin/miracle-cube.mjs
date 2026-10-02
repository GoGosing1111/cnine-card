import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {MIRACLE_RANKS,MIRACLE_TOTAL,miraclePercent,parseMiraclePercent,validateMiraclePolicy,miracleReadiness} from '../shared/miracle-cube-policy-v1.mjs';
const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const colors=['#9eabbc','#86cd9a','#74baf4','#cda6fa','#efb883','#ffe1a3'];
let state=null,draft=null,rank='SSS',busy=false,dirty=false,pending=null;
function message(text,error=false){$('#admin-status').textContent=text;$('#admin-status').classList.toggle('is-error',error);}
function summary(){
 const ready=miracleReadiness(draft,state.catalog);$('#rank-total').textContent=miraclePercent(ready.total)+' / 100%';
 $('#rank-spectrum').innerHTML=MIRACLE_RANKS.map((r,index)=>`<i style="flex:${draft.ranks[r]};background:${colors[index]}"></i>`).join('');
 const pool=state.catalog.filter(card=>card.rank===rank),total=pool.reduce((sum,card)=>sum+(draft.cards[card.code]||0),0);
 $('#pool-summary').textContent=`${rank} · ${pool.length}종 · 등급 내 합계 ${miraclePercent(total)} / 100%`;
 $('#readiness').classList.toggle('valid',ready.ready);$('#readiness').innerHTML=ready.ready?'✓ 확률 검증 완료 · ON으로 저장하면 개봉이 시작됩니다.':ready.blockers.map(text=>'<p>• '+esc(text)+'</p>').join('');
 $('#saved-state').textContent=dirty?'● 저장하지 않은 변경':`저장된 설정 r${state.revision} · ${state.mode}`;
 $('#save').disabled=busy||!dirty||(draft.mode==='ON'&&!ready.ready);$('#save').textContent=busy?'저장 중…':pending?'저장 결과 재확인':draft.mode==='ON'?'설정 저장 · 개봉 ON':'OFF 상태로 설정 저장';
 for(const node of document.querySelectorAll('[data-final]')){const card=state.catalog.find(card=>card.code===node.dataset.final),value=draft.ranks[card.rank]/MIRACLE_TOTAL*miraclePercent(draft.cards[card.code]);node.textContent=value.toLocaleString('ko-KR',{maximumFractionDigits:12})+'%';}
}
function renderCards(){
 $('#grade-tabs').innerHTML=MIRACLE_RANKS.map(r=>`<button type="button" data-grade="${r}" class="${r===rank?'active':''}">${r}</button>`).join('');
 const search=$('#search').value.trim().toLowerCase();
 const pool=state.catalog.filter(card=>card.rank===rank&&(!search||(card.name+' '+card.code).toLowerCase().includes(search)));
 $('#card-inputs').innerHTML=pool.map(card=>`<article class="mca-card ${card.available?'':'is-locked'}"><img src="${esc(card.sourceArt)}" alt="" loading="lazy"><div><strong>${esc(card.name)}</strong><small>${card.code}${card.available?'':' · 획득 잠금'}</small></div><label><small>등급 내 확률</small><div><input data-card="${card.code}" aria-label="${esc(card.name)} 등급 내 확률" inputmode="decimal" type="number" min="0" max="100" step="0.000001" required value="${miraclePercent(draft.cards[card.code])}" ${card.available?'':'disabled'}><span>%</span></div></label><span class="mca-final"><small>큐브 1개 최종 확률</small><b data-final="${card.code}"></b></span></article>`).join('')||'<p>조건에 맞는 용병이 없습니다.</p>';
 summary();
}
function render(){
 $('#cube-form').hidden=false;$('#mode-badge').textContent=state.mode;$('#mode').value=draft.mode;$('#notes').value=draft.notes;
 $('#rank-inputs').innerHTML=MIRACLE_RANKS.map((r,index)=>`<label class="mca-rate-box" style="--rank:${colors[index]}"><span>${r}</span><div><input data-rank="${r}" aria-label="${r} 등급 확률" inputmode="decimal" type="number" min="0" max="100" step="0.000001" required value="${miraclePercent(draft.ranks[r])}"><small>%</small></div></label>`).join('');
 renderCards();
}
async function load(){
 if(busy)return;busy=true;message('미라클 큐브 설정을 불러오는 중입니다.');
 try{state=await api('admin/miracle-cube');draft=structuredClone(state.policy);pending=null;dirty=false;render();message(`설정 r${state.revision} · ${state.mode} 상태를 불러왔습니다.`);}catch(error){message(error.message,true);}finally{busy=false;if(draft)summary();}
}
function update(event){
 const input=event.target;try{
  if(input.dataset.rank)draft.ranks[input.dataset.rank]=parseMiraclePercent(input.value);
  else if(input.dataset.card)draft.cards[input.dataset.card]=parseMiraclePercent(input.value);
  else if(input.id==='mode')draft.mode=input.value;
  else if(input.id==='notes')draft.notes=input.value;else return;
  input.setCustomValidity('');dirty=true;pending=null;summary();
 }catch(error){input.setCustomValidity(error.message);$('#save').disabled=true;message(error.message,true);}
}
$('#cube-form').addEventListener('input',update);
$('#grade-tabs').onclick=event=>{const button=event.target.closest('[data-grade]');if(button){rank=button.dataset.grade;renderCards();}};
$('#search').oninput=renderCards;
$('#equalize').onclick=()=>{
 const pool=state.catalog.filter(card=>card.rank===rank&&card.available);if(!pool.length)return;
 const base=Math.floor(MIRACLE_TOTAL/pool.length),remainder=MIRACLE_TOTAL-base*pool.length;
 state.catalog.filter(card=>card.rank===rank).forEach(card=>draft.cards[card.code]=0);pool.forEach((card,index)=>draft.cards[card.code]=base+(index<remainder?1:0));dirty=true;pending=null;renderCards();message(`${rank} 등급을 균등 배분했습니다. 저장 전 초안입니다.`);
};
$('#cube-form').onsubmit=async event=>{
 event.preventDefault();if(busy||!dirty||!$('#cube-form').reportValidity())return;
 try{draft=validateMiraclePolicy(draft,state.catalog);if(draft.mode==='ON'){const ready=miracleReadiness(draft,state.catalog);if(!ready.ready)throw Error(ready.blockers.join(' '));}}catch(error){message(error.message,true);return;}
 pending??={requestId:crypto.randomUUID(),revision:state.revision,policy:structuredClone(draft)};busy=true;$('#cube-form').inert=true;summary();message('확률 설정을 저장합니다.');
 try{state=await api('admin/miracle-cube',{method:'PATCH',body:pending});draft=structuredClone(state.policy);pending=null;dirty=false;render();message(`설정 r${state.revision} 저장 완료 · ${state.mode}`);}catch(error){message(error.message,true);if(error.status>=400&&error.status<500)pending=null;}finally{busy=false;$('#cube-form').inert=false;summary();}
};
$('#reload').onclick=()=>void load();window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});void load();
