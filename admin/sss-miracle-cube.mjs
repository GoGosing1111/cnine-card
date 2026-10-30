import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {parseSssCubePercent,sssCubePercent,sssCubeReadiness,validateSssCubePolicy} from '../shared/sss-miracle-cube-v1.mjs?v=20261030-soldout1';
import {sssCubeCatalogWithLimits} from '../shared/sss-miracle-cube-stock-v1.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,draft,dirty=false,busy=false,group='all',pending=null;
const inputValues=new Map(),inputErrors=new Map();
const message=(text,error=false)=>{$('#admin-status').textContent=text;$('#admin-status').classList.toggle('is-error',error);};
function summary(){
 const ready=sssCubeReadiness(draft,sssCubeCatalogWithLimits(state.catalog,draft.stockLimits));$('#rate-total').textContent=sssCubePercent(ready.total)+' / 100%';
 const totals=[false,true].map(limited=>state.catalog.filter(c=>c.limited===limited).reduce((sum,c)=>sum+(draft.cards[c.code]??0),0));
 $('#group-totals').textContent=`SSS 일반 ${sssCubePercent(totals[0])}% · SSS 리미티드 ${sssCubePercent(totals[1])}%`;
 $('#readiness').innerHTML=ready.ready?(ready.excludedCodes.length?`소진 ${ready.excludedCodes.length}종 자동 제외 · 남은 설정 비율을 100%로 환산합니다. ON 저장 시 개봉이 시작됩니다.`:'구성 검증 완료 · ON 저장 시 개봉이 시작됩니다.'):ready.blockers.map(b=>`<p>${esc(b)}</p>`).join('');
 $('#saved-state').textContent=dirty?'저장하지 않은 변경':`설정 r${state.revision} · ${state.mode}`;
 const invalid=inputErrors.size>0||Boolean($('#cube-form :invalid'));$('#save').disabled=busy||!dirty||invalid||(draft.mode==='ON'&&!ready.ready);
 $('#save').textContent=busy?'저장 중…':pending?'저장 결과 재확인':draft.mode==='ON'?'저장 · 개봉 ON':'OFF 상태로 저장';
 $('#reload').disabled=busy;
}
function renderCards(){
 const search=$('#search').value.trim().toLowerCase(),rows=state.catalog.filter(c=>(group==='all'||c.limited===(group==='limited'))&&(!search||(c.name+' '+c.code).toLowerCase().includes(search)));
 document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));
 $('#card-inputs').innerHTML=rows.map(c=>`<article class="sc-panel sc-admin-card"><img src="${esc(c.sourceArt)}" loading="lazy" alt=""><div><p>${c.limited?'SSS 리미티드':'SSS 일반'} · ${esc(c.code)}</p><h3>${esc(c.name)}</h3><p>${c.limited?(c.remaining===null?'큐브 전용 한도 미등록':`큐브 잔여 ${c.remaining} / ${c.stockLimit}장 · 발행 ${c.issued}장`):'기존 일반 획득 설정 연동'}</p>${c.lockReason?`<p class="sc-lock">${esc(c.lockReason)}</p>`:''}</div><label>기본 설정 확률 (%)<input data-card="${esc(c.code)}" aria-label="${esc(c.name)} 설정 확률" type="text" inputmode="decimal" autocomplete="off" placeholder="미설정" value="${sssCubePercent(draft.cards[c.code])}" maxlength="12"></label>${c.cubeEligible?`<label>큐브 전용 총 한도 (장)<input data-limit="${esc(c.code)}" aria-label="${esc(c.name)} 큐브 전용 한도" type="number" min="${c.issued??0}" max="1000000" step="1" placeholder="미등록" value="${draft.stockLimits[c.code]??''}"></label>`:''}</article>`).join('')||'<p class="sc-empty">조건에 맞는 용병이 없습니다.</p>';
 for(const input of document.querySelectorAll('[data-card]')){if(inputValues.has(input.dataset.card))input.value=inputValues.get(input.dataset.card);input.setCustomValidity(inputErrors.get(input.dataset.card)||'');}
 for(const input of document.querySelectorAll('[data-limit]')){const key='limit:'+input.dataset.limit;if(inputValues.has(key))input.value=inputValues.get(key);input.setCustomValidity(inputErrors.get(key)||'');}
 summary();
}
function render(){
 $('#cube-form').hidden=false;$('#mode').value=draft.mode;$('#notes').value=draft.notes;renderCards();
}
async function load(){
 if(busy)return;busy=true;$('#reload').disabled=true;message('SSS 미라클큐브 설정을 불러옵니다.');
 try{state=await api('admin/sss-miracle-cube');draft=structuredClone(state.policy);dirty=false;pending=null;inputValues.clear();inputErrors.clear();render();message(`설정 r${state.revision} · ${state.mode} 상태입니다.`);}catch(e){message(e.message,true);}finally{busy=false;$('#reload').disabled=false;if(draft)summary();}
}
$('#cube-form').addEventListener('input',e=>{
 const input=e.target,key=input.dataset.limit?'limit:'+input.dataset.limit:input.dataset.card;
 try{
  if(input.dataset.card){inputValues.set(input.dataset.card,input.value);draft.cards[input.dataset.card]=parseSssCubePercent(input.value);inputErrors.delete(input.dataset.card);}
  else if(input.dataset.limit){inputValues.set(key,input.value);const n=Number(input.value),card=state.catalog.find(c=>c.code===input.dataset.limit);if(!/^\d+$/.test(input.value)||!Number.isSafeInteger(n)||n<(card.issued??0)||n>1000000)throw Error('발행 수량 이상, 0~1,000,000장의 정수로 입력하세요.');draft.stockLimits[card.code]=n;inputErrors.delete(key);}
  else if(input.id==='mode')draft.mode=input.value;else if(input.id==='notes')draft.notes=input.value;else return;
  input.setCustomValidity('');dirty=true;pending=null;summary();
 }catch(error){if(key)inputErrors.set(key,error.message);input.setCustomValidity(error.message);$('#save').disabled=true;message(error.message,true);}
});
$('#search').oninput=renderCards;document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{group=b.dataset.group;renderCards();});
$('#cube-form').onsubmit=async event=>{
 event.preventDefault();if(busy||!dirty||inputErrors.size||!$('#cube-form').reportValidity())return;
 try{draft=validateSssCubePolicy(draft,state.catalog);if(draft.mode==='ON'){const ready=sssCubeReadiness(draft,sssCubeCatalogWithLimits(state.catalog,draft.stockLimits));if(!ready.ready)throw Error(ready.blockers.join(' '));}}catch(e){message(e.message,true);return;}
 pending??={requestId:crypto.randomUUID(),revision:state.revision,policy:structuredClone(draft)};busy=true;$('#cube-form').inert=true;summary();message('설정을 저장합니다.');
 try{state=await api('admin/sss-miracle-cube',{method:'PATCH',body:pending});draft=structuredClone(state.policy);dirty=false;pending=null;inputValues.clear();inputErrors.clear();render();message(`저장 완료 · r${state.revision} · ${state.mode}`);}catch(e){message(e.message,true);if(e.status>=400&&e.status<500)pending=null;}finally{busy=false;$('#cube-form').inert=false;summary();}
};
$('#reload').onclick=()=>void load();window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});void load();
