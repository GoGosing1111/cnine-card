import {MERCENARY_LEVEL_RULES,validateMercenaryLevelPolicy,mercenaryLevelReadiness,mercenaryGrowthDraft,mercenaryGrowthSummary} from '../shared/mercenary-level-v1.mjs?v=20261016-growth-live-v1';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields={hpPercent:'체력',attackPercent:'공격',defensePercent:'방어',speedPercent:'행동 속도',skillPowerPercent:'배정 스킬 계수',mitigationBypassPercent:'PVP 경감 관통',actionCatchupPercent:'PVP 행동 대응',actionCreditPercent:'PVP 추가 행동 숙련'};
const percent=value=>`+${Number(value.toFixed(2)).toLocaleString('ko-KR')}%`;
const readiness=policy=>mercenaryLevelReadiness(policy,{requireGrowth:true});

export function createMercenaryLevelEditor({request,onRender}){
 let state=null,root=null,dirty=false,busy=false,pending=null,notice='',generation=0;
 const $=s=>root?.querySelector(s);
 const number=(label,path,value,{max=1000,min=0,step=.01}={})=>`<label class="mc-field"><span>${esc(label)}</span><input data-level-field="${path}" type="number" min="${min}" max="${max}" step="${step}" value="${value??''}" placeholder="미정"></label>`;
 function growthTable(policy){
  const growth=policy.growth;
  const rows=Array.from({length:20},(_,i)=>({level:i+1,mask:MERCENARY_LEVEL_RULES.milestones.reduce((mask,level,index)=>mask|(level<i+1?1<<index:0),0),label:`Lv.${i+1}`}));
  rows.push({level:20,mask:15,label:'Lv.20 최종 돌파'});
  let values;
  try{values=rows.map(row=>({...row,bonus:mercenaryGrowthSummary(growth,{level:row.level,experience:0,breakthroughMask:row.mask,revision:0}).total}));}catch{return '<p>성장 수치를 모두 입력하면 Lv.1~20 누적 효과를 표시합니다. 빈칸을 0이나 검수 수치로 자동 채우지 않습니다.</p>';}
  return `<p class="mc-level-table-hint">표를 좌우로 밀어 모든 능력을 확인할 수 있습니다.</p><div class="mc-level-growth-scroll" tabindex="0" aria-label="레벨별 누적 성장표"><table class="mc-level-growth-table"><thead><tr><th>단계</th>${Object.values(fields).map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${values.map(row=>`<tr><th scope="row">${row.label}</th>${Object.keys(fields).map(key=>`<td>${percent(row.bonus[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>각 수치는 기본 능력치에 더하는 누적 증가율입니다. 성공한 돌파만 포함되며 Lv.5·10·15·20의 돌파 직전과 성공 이후를 구분합니다.</p>`;
 }
 function html(){
  if(!state)return `<section data-level-root class="mc-review"><p role="status">${esc(notice||'성장 초안을 불러오고 있습니다.')}</p><button data-level-reload ${busy?'disabled':''}>다시 불러오기</button></section>`;
  const p=state.policy,g=p.growth??mercenaryGrowthDraft(),ready=readiness(p);
  return `<section data-level-root class="mc-review"><div class="mc-release-strip"><div><small>용병 성장 설계</small><h3>용병 레벨 · 돌파 V2</h3><p>일반 레벨 성장과 돌파 보너스를 따로 설정합니다. 저장한 성장 수치와 실행 상태를 적용합니다.</p></div><div><b>${state.releaseEnabled?`실행 ${p.mode}`:"실행 OFF · 출시 잠금"}</b><b>설정 r${p.revision}</b></div></div>
   <p>같은 등급의 중복 카드만 재료로 사용합니다. 동일 용병은 경험치 3배, 다른 동급 용병은 1배이며 기본 보유 1장은 보호합니다. 리미티드의 필요 경험치는 일반의 5배입니다.</p>
   <p>Lv.5 · 10 · 15 · 20 경험치 100%에서 돌파합니다. 실패해도 레벨과 이전 능력은 유지하며 현재 경험치만 0이 됩니다. 성공하면 해당 돌파 능력을 얻고 다음 레벨로 이동합니다. 최종 돌파는 Lv.20을 유지합니다.</p>
   <p>일반 레벨의 초과 경험치는 이월합니다. 돌파 구간의 초과분만 사전 동의 후 소멸하며 코인·마스터의 별 추가 비용은 없습니다.</p>
   <p><a href="/mercenary-codex/leveling/" target="_blank" rel="noopener">용병 성장실 열기 ↗</a> · 운영 설정은 아래에 저장한 수치를 사용합니다.</p>
   <fieldset class="mc-level-form" ${busy?'disabled':''}>
    <label class="mc-field"><span>성장 실행</span><select data-level-field="mode" ${!state.releaseEnabled?'disabled':''}><option value="OFF" ${p.mode==='OFF'?'selected':''}>OFF · 경험치 전수와 돌파 중지</option><option value="ON" ${p.mode==='ON'?'selected':''}>ON · 설정한 성장 기능 적용</option></select></label>
    <section class="mc-fields-section"><div class="mc-section-title"><h3>재료 경험치</h3><p>등급별 중복 1장 기준입니다. 동일 용병의 3배 배수는 고정입니다.</p></div><div class="mc-fields">${Object.entries(p.xpPerCard).map(([rank,xp])=>number(`${rank} 등급 · 기본 경험치`,`xpPerCard.${rank}`,xp,{max:1e9,min:1,step:1})).join('')}</div></section>
    <section class="mc-fields-section"><div class="mc-section-title"><h3>일반 용병 레벨별 필요 경험치</h3><p>리미티드는 아래 값 × 5. Lv.20은 최종 돌파에 필요한 경험치입니다.</p></div><div class="mc-fields mc-level-xp">${p.levels.map((row,i)=>number(`Lv.${row.level}${MERCENARY_LEVEL_RULES.milestones.includes(row.level)?' · 돌파':''}`,`levels.${i}.requiredXp`,row.requiredXp,{max:2e11,min:1,step:1})).join('')}</div></section>
    <section class="mc-fields-section"><div class="mc-section-title"><h3>레벨마다 얻는 기본 능력</h3><p>Lv.1을 기준으로 레벨이 1 오를 때마다 아래 증가분을 더합니다. 공격·체력과 행동 속도를 독립적으로 조정합니다.</p></div><div class="mc-fields">${Object.entries(g.perLevel).map(([key,value])=>number(`${fields[key]} 증가 · %`,`growth.perLevel.${key}`,value,{max:key==='speedPercent'?5:100})).join('')}</div></section>
    ${g.milestones.map((milestone,i)=>`<section class="mc-fields-section"><div class="mc-section-title"><h3>Lv.${milestone.level} 돌파 성공 능력</h3><p>이 돌파에서 새로 얻는 증가분입니다. 앞선 돌파와 레벨 성장에 가산하며 실패 시 추가하지 않습니다.</p></div><div class="mc-fields">${number('성공 확률 · %',`milestones.${i}.successChancePpm`,p.milestones[i].successChancePpm===null?null:p.milestones[i].successChancePpm/10000,{max:100,step:.0001})}${Object.keys(fields).map(key=>number(`${fields[key]} 증가 · %`,`growth.milestones.${i}.${key}`,milestone[key],{max:key==='mitigationBypassPercent'?12.5:key==='actionCatchupPercent'?25:key==='actionCreditPercent'?30:key==='speedPercent'?10:400})).join('')}</div></section>`).join('')}
   </fieldset>
   <section class="mc-fields-section"><div class="mc-section-title"><h3>누적 성장 확인</h3><p>체력·공격·방어·속도는 덱 연계와 개인 장비 반영 후 한 번만 적용합니다. 성장 능력치를 편성 전투력에 다시 더하지 않으며, PVP 추가 행동 숙련은 고유 횟수에 가산하고 곱하지 않습니다.</p></div><div data-level-growth-preview>${growthTable(p)}</div><p>PVP 경감 관통은 성장한 공격 용병이 상대보다 높은 레벨일 때만 제한적으로 적용합니다. 같은 레벨에서는 리미티드의 기존 경감·상성을 유지하며 PVE 보스 기믹에 적용하지 않습니다. 행동 대응은 상대의 성장 전 자연 속도와 해당 덱 카드가 만드는 고유 연속 행동 기회를 합산해 비교합니다. 내 자연 속도·고유 행동·성장 추가 행동을 모두 뺀 부족분에 대응 숙련과 레벨 차이 계수를 곱해 자연 속도에 더합니다. 최대 숙련은 부족분의 70%이며 이미 지급된 행동을 중복 보상하지 않습니다. 전투 시작 시 살아 있는 소유 카드 기준을 고정하고 보조 유닛은 제외합니다. PVP 추가 행동 숙련은 별도로 최대 +0.75회를 가산합니다. 일반 1회는 최대 1.75회, 고유 3회는 최대 3.75회가 되며 소수분을 누적해 행동합니다.</p><p>최종 누적 상한: 체력·공격 각각 +1,600%, 방어 +400%, 기본 속도 +80%, 스킬 계수 +100%, 경감 관통 50%, 행동 대응 70%, 추가 행동 숙련 75%(+0.75회). 입력 합계가 상한을 넘으면 저장을 차단합니다.</p><p>구형 돌파의 단일 효과는 과거 영수증·전투 재현용으로 보존합니다. V2 성장표를 설정하면 구형 효과를 중복 적용하지 않습니다.</p></section>
   <p data-level-ready>${ready.ready?(state.releaseEnabled?'수치 입력 완료 · 선택한 실행 상태로 저장합니다.':'수치 입력 완료 · 출시 잠금 상태입니다.'):`미정 ${ready.missing.length}개 · ${esc(ready.missing.join(', '))}`}</p><p role="status" aria-live="polite">${esc(notice)}</p><div class="mc-savebar"><span>${state.releaseEnabled?'ON 저장 시 경험치 전수·돌파와 성장 전투 효과가 적용됩니다. OFF 저장 시 중지합니다.':'초안 저장으로 카드 소모·성장·전투 효과가 켜지지 않습니다.'}</span><div><button data-level-reload ${busy?'disabled':''}>다시 불러오기</button><button data-level-save class="mc-primary" ${busy||!dirty?'disabled':''}>${pending?'저장 결과 재확인':state.releaseEnabled?'성장 설정 저장':'성장 초안 저장'}</button></div></div></section>`;
 }
 async function load(){
  if(busy)return;if(dirty&&!confirm('저장하지 않은 성장 초안을 버리고 다시 불러올까요?'))return;
  const token=generation;busy=true;notice='불러오는 중…';onRender();
  try{const received=await request();if(token!==generation)return;state=received;dirty=false;pending=null;notice='성장 초안을 불러왔습니다. 미정 수치는 자동으로 채우지 않습니다.';}catch(e){if(token===generation)notice=e.message;}finally{if(token===generation){busy=false;onRender();}}
 }
 async function save(){
  if(busy||!dirty)return;
  try{for(const el of root.querySelectorAll('input,select'))if(!el.reportValidity())return;validateMercenaryLevelPolicy(state.policy);if(state.policy.mode==='ON'&&(!state.releaseEnabled||!readiness(state.policy).ready))throw Error('ON 저장에는 전체 성장 수치 입력이 필요합니다.');pending??={policy:structuredClone(state.policy)};}catch(e){notice=e.message;onRender();return;}
  const token=generation;busy=true;onRender();
  try{const received=await request({method:'PATCH',body:JSON.stringify(pending)});if(token!==generation)return;state=received;dirty=false;pending=null;notice=state.releaseEnabled?`성장 설정 저장 완료 · 실행 ${state.policy.mode}`:'성장 초안 저장 완료 · 운영 실행 OFF 유지';}catch(e){if(token===generation){notice=e.message;if(e.status>=400&&e.status<500)pending=null;}}finally{if(token===generation){busy=false;onRender();}}
 }
 function mount(element){
  root=element;if(!root)return;
  $('[data-level-reload]')?.addEventListener('click',()=>void load());$('[data-level-save]')?.addEventListener('click',()=>void save());
  root.querySelectorAll('[data-level-field]').forEach(el=>el.oninput=()=>{
   const path=el.dataset.levelField.split('.'),key=path.pop();if(path[0]==='growth'&&!state.policy.growth)state.policy.growth=mercenaryGrowthDraft();
   let object=state.policy;for(const part of path)object=object[part];object[key]=key==='mode'?el.value:el.value===''?null:key==='successChancePpm'?Math.round(Number(el.value)*10000):Number(el.value);
   dirty=true;pending=null;const button=$('[data-level-save]');if(button)button.disabled=busy;
   try{const ready=readiness(state.policy);$('[data-level-ready]').textContent=ready.ready?(state.releaseEnabled?'수치 입력 완료 · 선택한 실행 상태로 저장합니다.':'수치 입력 완료 · 출시 잠금 상태입니다.'):`미정 ${ready.missing.length}개`; }catch(e){$('[data-level-ready]').textContent=e.message;}
   $('[data-level-growth-preview]').innerHTML=growthTable(state.policy);
  });
  if(!state&&!busy&&!notice)void load();
 }
 return {html,mount,get dirty(){return dirty;},reset(){generation++;state=null;root=null;dirty=false;busy=false;pending=null;notice='';}};
}
