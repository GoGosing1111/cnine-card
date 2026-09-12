import {DRAW_OUTCOMES,DRAW_TOTAL,formatDrawPercent as percent,parseDrawPercent,validateMercenaryDraw,summarizeMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs?v=20260912-draw1';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={MERCENARY_CARD:'용병카드',MASTER_STAR:'마스터의 별',MYSTIC_ENERGY:'미스틱에너지',NONE:'꽝'};
const colors={MERCENARY_CARD:'#dbc38c',MASTER_STAR:'#dba264',MYSTIC_ENERGY:'#7ebeb6',NONE:'#a6b4ac'};
const number=value=>Number(value).toLocaleString('ko-KR',{maximumFractionDigits:4});
const date=value=>new Intl.DateTimeFormat('ko-KR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));

export function createMercenaryDrawEditor({request,onRender}){
  let state=null,root=null,busy=false,dirty=false,pending=null,notice='',failure=false,reason='',generation=0;
  const $=selector=>root?.querySelector(selector);
  const outcome=id=>state.policy.outcomes.find(row=>row.id===id);
  function summary(){
    const s=summarizeMercenaryDraw(state.policy),valid=!s.missing&&s.total===DRAW_TOTAL;
    const expected=id=>number((outcome(id).chancePpm||0)/10000*(outcome(id).quantity||0));
    return `<div class="md-distribution">${Object.entries(s.groups).map(([key,value])=>`<div style="--md-color:${colors[key]}"><span>${labels[key]}</span><strong>${percent(value)}<small>%</small></strong></div>`).join('')}</div>
      <div class="md-spectrum" aria-hidden="true">${Object.entries(s.groups).map(([key,value])=>`<i style="background:${colors[key]};flex:${Math.max(0,value)}"></i>`).join('')}</div>
      <div class="md-total ${valid?'':'is-invalid'}"><div><span>전체 확률</span><strong data-draw-total>${percent(s.total)}<small> / 100%</small></strong></div><b>${s.missing?'입력 확인':valid?'합계 확인 완료':`차이 ${percent(DRAW_TOTAL-s.total)}%`}</b></div>
      <p class="md-expectation">100회 개봉 기댓값 <b>카드 ${number(s.groups.MERCENARY_CARD/10000)}장</b><b>별 ${expected('MASTER_STAR')}개</b><b>미스틱 ${expected('MYSTIC_ENERGY')}개</b><small>확률 계산값이며 실제 획득을 보장하지 않습니다.</small></p>`;
  }
  function probability(meta){const row=outcome(meta.id);return `<label class="md-probability"><span class="md-label">개봉 확률</span><span class="md-unit-input"><input data-draw-chance="${meta.id}" aria-label="${meta.label} 확률" type="number" min="0" max="100" step="0.0001" inputmode="decimal" value="${row.chancePpm===null?'':percent(row.chancePpm)}"><span>%</span></span></label>`;}
  function html(cmsDocument){
    if(!state)return `<section class="md-editor" data-draw-root><p class="md-message" role="status">${esc(notice||'개봉 확률 초안을 불러옵니다.')}</p>${failure?'<button data-draw-reload>다시 불러오기</button>':''}</section>`;
    const counts=Object.fromEntries(['C','B','A','S','SS','SSS'].map(rank=>[rank,cmsDocument.mercenaries.filter(row=>row.rank===rank).length]));
    const unset=cmsDocument.mercenaries.filter(row=>row.rank===null).length;
    return `<section class="md-editor" data-draw-root>
      <header class="md-heading"><div><small>CONTRACT / PROBABILITY DRAFT</small><h3>용병카드 개봉 확률</h3><p>개봉 1회에 적용할 결과와 지급 수량을 설계합니다.</p></div><div class="md-hold"><span>유저 개봉</span><strong>OFF</strong><small>서버 차단 유지</small></div></header>
      <p class="md-message ${failure?'is-error':''}" role="status" aria-live="polite" data-draw-message>${esc(notice||'확률·수량 제안 초안입니다. 저장해도 유저 개봉은 열리지 않습니다.')}</p>
      <fieldset class="md-form" ${busy?'disabled':''}>
      <div class="md-layout"><div class="md-ledger"><div class="md-section-heading"><span>01</span><div><h4>용병카드 · 등급별 확률</h4><p>모든 확률은 전체 개봉 기준입니다. 등급 내부 비율이 아닙니다.</p></div></div>
        <div class="md-grade-list">${DRAW_OUTCOMES.filter(meta=>meta.rank).map(meta=>`<div class="md-grade-row"><b class="md-grade" data-rank="${meta.rank}">${meta.rank}</b><div class="md-grade-copy"><strong>${meta.rank} 용병카드</strong><span>1장 · CMS 등급 설정 ${counts[meta.rank]}종</span></div>${probability(meta)}</div>`).join('')}</div>
        <p class="md-rank-note">${unset?`현재 ${unset}종의 등급이 미정입니다. `:''}개별 용병의 등급은 용병 도감 탭에서 직접 설정합니다. 카드별 획득 대상·같은 등급 내 확률·중복 처리는 출시 전 확정이 필요합니다.</p>
      </div><div class="md-resource-ledger"><div class="md-section-heading"><span>02</span><div><h4>재화 · 꽝</h4><p>선택된 결과 한 종류만 지급하는 구조입니다.</p></div></div>
        ${DRAW_OUTCOMES.filter(meta=>!meta.rank).map(meta=>`<section class="md-reward" data-reward="${meta.id}"><div class="md-reward-name"><span>${meta.id==='MASTER_STAR'?'02':meta.id==='MYSTIC_ENERGY'?'03':'04'}</span><h5>${meta.label}</h5></div><div class="md-reward-inputs">${probability(meta)}${meta.id==='NONE'?'<div class="md-none-quantity"><span>지급 수량</span><b>없음</b></div>':`<label class="md-quantity"><span class="md-label">당첨 시 지급</span><span class="md-unit-input"><input data-draw-quantity="${meta.id}" aria-label="${meta.label} 지급 수량" type="number" min="1" max="1000000000" step="1" inputmode="numeric" value="${esc(outcome(meta.id).quantity)}"><span>개</span></span></label>`}</div></section>`).join('')}
        <button type="button" class="md-remainder" data-draw-remainder>남은 확률을 꽝으로 채우기</button>
      </div></div>
      <section class="md-summary" data-draw-summary aria-label="확률 합계와 기대 수량">${summary()}</section>
      <div class="md-notes"><label><span>검토 메모</span><textarea data-draw-notes maxlength="2000" rows="3">${esc(state.policy.notes)}</textarea></label><label><span>이번 저장 사유</span><input data-draw-reason maxlength="500" minlength="4" placeholder="예: 용병 등급별 확률 1차 조정" value="${esc(reason)}"><small>변경 전후 설정과 함께 이력에 남습니다.</small></label></div>
      </fieldset>
      <footer class="md-savebar"><span data-draw-save-label>${dirty?'● 저장하지 않은 확률 변경':`✓ 확률 초안 r${state.revision} · ${date(state.updatedAt)}`}</span><div><button data-draw-export>JSON 내보내기</button><button data-draw-reload ${busy?'disabled':''}>다시 불러오기</button><button class="md-primary" data-draw-save ${busy||!dirty?'disabled':''}>${busy?'처리 중…':pending?'저장 결과 재확인':'확률 초안 저장'}</button></div></footer>
      <details class="md-history"><summary>최근 확률 변경 이력 · ${state.audit.length}건</summary>${state.audit.map(row=>`<p><b>r${row.revision}</b><span>${esc(row.reason)}</span><small>${date(row.created_at)} · 관리자 #${row.actor_id}</small></p>`).join('')}</details>
    </section>`;
  }
  function markDirty(){dirty=true;pending=null;if($('[data-draw-save-label]'))$('[data-draw-save-label]').textContent='● 저장하지 않은 확률 변경';const button=$('[data-draw-save]');if(button){button.disabled=false;button.textContent='확률 초안 저장';}if($('[data-draw-summary]'))$('[data-draw-summary]').innerHTML=summary();}
  async function load(){
    if(busy)return;const token=generation;busy=true;failure=false;notice='운영 확률 초안을 불러오는 중입니다.';onRender();
    try{const received=await request();if(token!==generation)return;state=received;dirty=false;pending=null;reason='';notice='확률·수량 제안 초안입니다. 저장해도 유저 개봉은 OFF로 유지됩니다.';}
    catch(error){if(token!==generation)return;failure=true;notice=error.message;}
    finally{if(token===generation){busy=false;onRender();}}
  }
  async function save(){
    if(!state||busy||!dirty)return;
    if([...root.querySelectorAll('input,textarea')].some(input=>!input.reportValidity()))return;
    try{validateMercenaryDraw(state.policy);if(reason.trim().length<4)throw Error('저장 사유를 4자 이상 입력하세요.');}catch(error){failure=true;notice=error.message;onRender();return;}
    pending??={requestId:crypto.randomUUID(),expectedRevision:state.revision,policy:structuredClone(state.policy),reason:reason.trim()};
    const token=generation;busy=true;failure=false;notice='확률 초안을 운영 CMS에 저장하고 있습니다.';onRender();
    try{const received=await request({method:'PATCH',body:JSON.stringify(pending)});if(token!==generation)return;state=received;dirty=false;pending=null;reason='';notice=`확률 저장 완료 · r${state.revision} · 유저 개봉 OFF`;}
    catch(error){if(token!==generation)return;failure=true;notice=error.name==='AbortError'?'응답 확인이 지연됩니다. 저장 결과 재확인으로 같은 요청을 확인하세요.':error.message;if(error.status&&error.status<500)pending=null;}
    finally{if(token===generation){busy=false;onRender();}}
  }
  function mount(element){
    root=element;if(!root)return;
    root.querySelectorAll('[data-draw-chance]').forEach(input=>input.oninput=()=>{outcome(input.dataset.drawChance).chancePpm=parseDrawPercent(input.value);markDirty();});
    root.querySelectorAll('[data-draw-quantity]').forEach(input=>input.oninput=()=>{outcome(input.dataset.drawQuantity).quantity=input.value===''?null:Number(input.value);markDirty();});
    if($('[data-draw-notes]'))$('[data-draw-notes]').oninput=e=>{state.policy.notes=e.target.value;markDirty();};
    if($('[data-draw-reason]'))$('[data-draw-reason]').oninput=e=>{reason=e.target.value;pending=null;};
    if($('[data-draw-save]'))$('[data-draw-save]').onclick=save;
    if($('[data-draw-reload]'))$('[data-draw-reload]').onclick=()=>{if(!dirty||confirm('저장하지 않은 확률 변경을 버리고 다시 불러올까요?'))void load();};
    if($('[data-draw-remainder]'))$('[data-draw-remainder]').onclick=()=>{
      const others=state.policy.outcomes.filter(row=>row.id!=='NONE'),sum=others.reduce((total,row)=>total+(row.chancePpm||0),0);
      if(others.some(row=>!Number.isSafeInteger(row.chancePpm))||sum>DRAW_TOTAL){failure=true;notice='용병·재화 확률을 먼저 0~100% 안으로 맞추세요.';onRender();return;}
      outcome('NONE').chancePpm=DRAW_TOTAL-sum;markDirty();onRender();
    };
    if($('[data-draw-export]'))$('[data-draw-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({revision:state.revision,policy:state.policy},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`mercenary-draw-r${state.revision}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    if(!state&&!busy&&!failure)void load();
  }
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  return {html,mount,reset(){generation++;state=null;root=null;dirty=false;pending=null;busy=false;notice='';failure=false;reason='';}};
}
