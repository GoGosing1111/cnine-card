import {jointAdminRequest} from '../js/joint-account-transport.mjs';
import {validateForgePolicy} from '../shared/equipment-forge-policy-v1.mjs';
import {FORGE_STEP_FIELDS, FORGE_SOURCE_NAMES, forgeInputNumber, forgePolicyReadiness} from '../shared/equipment-forge-cms-v1.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const at = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const put = (object, path, value) => {const keys=path.split('.');keys.slice(0,-1).reduce((target,key)=>target[key],object)[keys.at(-1)]=value;};
const decimal = value => value === null ? '' : String(value / 10000);
const format = value => value === null ? '미설정' : Number(value).toLocaleString('ko-KR');
const tabs = [['steps','01','강화 단계'], ['protection','02','보호권 · 획득처'], ['restoration','03','파괴 복구'], ['readiness','04','검증 · 저장 정보']];

export function mountForgePolicyEditor(host, {request=jointAdminRequest}={}) {
  let data, draft, tab='steps', dirty=false, busy=false, disposed=false, controller;
  host.classList.add('forge-policy-editor');
  function message(text, error=false) {
    const target=host.querySelector('[data-policy-status]');
    if(target){target.textContent=text;target.classList.toggle('is-error',error);}
  }
  function numberInput(path,label,min,max,type='integer',prefix='') {
    const value=at(draft,path), percentage=type==='percent';
    return `<label><span>${esc(label)}${percentage?' <em>%</em>':''}</span><input data-policy-path="${path}" data-number="${type}" type="number" inputmode="${percentage?'decimal':'numeric'}" min="${min}" max="${max}" step="${percentage?'0.0001':'1'}" placeholder="미설정" value="${esc(percentage?decimal(value):value)}" aria-label="${esc(prefix+label+(percentage?' %':''))}"></label>`;
  }
  function select(path,label,options) {
    return `<label><span>${esc(label)}</span><select data-policy-path="${path}" aria-label="${esc(label)}">${options.map(([value,name])=>`<option value="${esc(value)}" ${String(at(draft,path)??'')===value?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
  }
  function itemSelect(path,label,protection=false) {
    const selected=at(draft,path), items=data.catalog.filter(item=>!protection||item.code!=='MASTER_STAR');
    const options=[['',protection?'미설정 · 보호권 선택':'재료 없음 · 코인만 사용'], ...items.map(item=>[item.code,`${item.name} · ${item.code}${item.is_active?'':' (비활성)'}`])];
    if(selected&&!items.some(item=>item.code===selected))options.push([selected,`${selected} (미등록)`]);
    return `<div class="forge-material-choice">${select(path,label,options)}<div class="forge-material-preview" data-item-preview="${path}" aria-live="polite"></div></div>`;
  }
  function stepsMarkup() {
    return `<div class="forge-section-heading"><div><h3>단계별 확률과 소모 재료</h3><p>강화 재료는 확정 규칙인 <b>코인 + 마스터의 별</b>을 사용합니다. 빈칸은 0이 아닌 미설정입니다.</p></div><span class="forge-tag">+0 → +10</span></div>
      <p class="forge-inline-rule">성공 최소 10% · 성공 + 유지 + 파괴 = 100% · 소수점 4자리까지 · 성공/유지/파괴 모두 기본 비용 소모</p>
      <div class="forge-step-list">${draft.steps.map(row=>`<section class="forge-policy-step" data-step="${row.level}"><div class="forge-step-title"><h4>+${row.level}<span>→</span><strong>+${row.level+1}</strong></h4><span data-step-status="${row.level}"></span></div><div class="forge-step-fields">${FORGE_STEP_FIELDS.map(([key,label,min,max,type])=>numberInput(`steps.${row.level}.${key}`,label,min,max,type,`+${row.level+1} `)).join('')}</div><div class="forge-step-foot"><span data-step-preview="${row.level}"></span><span>보호권 사용 시 성공률 유지 · 파괴 → 유지</span></div></section>`).join('')}</div>`;
  }
  function protectionMarkup() {
    return `<div class="forge-section-heading"><div><h3>장비보호권</h3><p>파괴 판정을 유지로 바꿉니다. 별도의 성공 확률을 더하거나 성공률을 높이지 않습니다.</p></div><span class="forge-tag">GAMEPLAY ONLY</span></div>
      <div class="forge-policy-grid">${itemSelect('protection.itemCode','보호권 아이템',true)}${select('protection.consume','보호권 소모 시점',[['UNSET','미설정'],['ON_DESTROY','파괴 판정일 때만 소모'],['ON_ATTEMPT','강화 시도마다 소모']])}</div>
      <p class="forge-inline-rule">소모 수량은 ‘강화 단계’에서 각 단계별로 설정합니다. 선택한 아이템은 등록·활성 상태여야 합니다.</p>
      <h4 class="forge-subheading">게임 내 획득처</h4><p>보상 대상 클리어·완주 시만 판정합니다. 상자·뽑기 보상풀에는 자동 편입하지 않습니다.</p>
      <div class="forge-source-list">${draft.protection.sources.map((source,index)=>`<section class="forge-source"><label class="forge-check"><input type="checkbox" data-policy-path="protection.sources.${index}.enabled" ${source.enabled?'checked':''}><span>${FORGE_SOURCE_NAMES[source.content]}</span></label>${numberInput(`protection.sources.${index}.chancePpm`,'획득 확률',0.0001,100,'percent',FORGE_SOURCE_NAMES[source.content]+' ')}${numberInput(`protection.sources.${index}.quantity`,'획득 수량',1,100,'integer',FORGE_SOURCE_NAMES[source.content]+' ')}</section>`).join('')}</div>
      <p class="forge-inline-rule">0.0001% = 백만 번당 평균 1회. 극희귀 획득 정책을 고려해 설정하세요. 저장만으로 드롭이 시작되지는 않습니다.</p>`;
  }
  function restorationMarkup() {
    return `<div class="forge-section-heading"><div><h3>파괴 기록 복구</h3><p>본인의 미복구 파괴 기록만 1회 복구합니다. 이미 소모한 강화 재료는 돌려주지 않습니다.</p></div><span class="forge-tag">RECOVERY</span></div>
      <label class="forge-check forge-restore-toggle"><input type="checkbox" data-policy-path="restoration.enabled" ${draft.restoration.enabled?'checked':''}><span>복구 사용 정책 설정</span></label>
      <div class="forge-policy-grid">${numberInput('restoration.coinCost','복구 코인 (0 = 무료)',0,1e12)}${numberInput('restoration.expiresHours','복구 가능 시간 (0 = 무기한)',0,87600)}${itemSelect('restoration.itemCode','복구권 / 복구 재료')}${numberInput('restoration.itemQuantity','복구 재료 소모 수량',1,1e8)}${select('restoration.levelMode','복구되는 강화 단계',[['UNSET','미설정'],['PREVIOUS','파괴 직전 강화 단계 유지'],['ZERO','+0으로 복구']])}</div>
      <p class="forge-inline-rule">재료 없이 코인만 받을 경우 ‘재료 없음’을 선택하고 수량을 비우세요. 복구 시간을 비워두면 미설정이며, 0과 다릅니다.</p>
      <div class="forge-policy-note"><b>복구 안전 규칙</b><p>다른 유저의 기록·이미 복구된 기록·기한이 지난 기록은 거절합니다. 재요청하더라도 동일 기록에 장비가 중복 지급되지 않습니다.</p></div>`;
  }
  function readinessMarkup() {
    return `<div class="forge-section-heading"><div><h3>정책 검증 · 저장 정보</h3><p>미설정 항목은 초안으로 보존합니다. 모든 칸을 채워도 운영 활성화 승인으로 처리하지 않습니다.</p></div></div>
      <div class="forge-policy-grid"><label><span>정책 식별 버전</span><input type="text" data-policy-path="version" value="${esc(draft.version)}" minlength="8" maxlength="80" pattern="[A-Za-z0-9_-]{8,80}"></label>${numberInput('quoteSeconds','견적 유효 시간 (초)',15,900)}${select('mode','저장 정책 모드',[['OFF','OFF · 실행 중지 초안'],['TEST','TEST · OWNER 검수용 초안']])}</div>
      <p class="forge-inline-rule">현재 공동 출시 게이트가 잠겨 있으면 TEST로 저장해도 실제 계정에서 강화가 열리지 않습니다. 유효한 기존 견적은 발급 당시 비용·확률을 유지합니다.</p>
      <div class="forge-readiness" data-readiness></div>
      <div class="forge-policy-note"><b>변경 이력과 동시 수정 보호</b><p>서버가 수정 버전을 비교해 덮어쓰기를 방지하고, 변경 전·후 값을 관리자 로그에 함께 남깁니다. 다른 창과 충돌하면 입력 내용을 보존한 채 재확인을 요청합니다.</p></div>`;
  }
  function render() {
    if(disposed)return;
    if(!draft){host.innerHTML='<p role="status" data-policy-status>강화 정책을 불러오는 중…</p><button type="button" data-policy-reload>다시 불러오기</button>';host.querySelector('button').onclick=load;return;}
    host.innerHTML=`<div class="forge-policy-overview"><div><small>정책 입력 상태</small><strong data-policy-progress></strong></div><div><small>운영 실행</small><strong>${data.executionMode==='OFF'?'OFF · 출시 대기':'공동 승인본 기준'}</strong></div><div><small>저장된 초안</small><strong>r${data.policy.revision}</strong></div></div>
      <nav class="forge-policy-tabs" aria-label="장비 강화 정책">${tabs.map(([key,no,label])=>`<button type="button" data-policy-tab="${key}" aria-pressed="${key===tab}"><small>${no}</small>${label}</button>`).join('')}</nav>
      <form class="forge-policy-form"><fieldset ${busy?'disabled':''}><div class="forge-policy-content">${({steps:stepsMarkup,protection:protectionMarkup,restoration:restorationMarkup,readiness:readinessMarkup})[tab]()}</div>
      <div class="forge-policy-save"><div><b data-policy-dirty></b><p>운영 수치 변경·지급·기능 ON 없음 · 초안만 저장</p><p class="forge-policy-status" role="status" aria-live="polite" data-policy-status></p></div><button type="button" data-policy-reload>다시 불러오기</button><button type="submit">${busy?'저장 중…':'강화 정책 저장'}</button></div></fieldset></form>`;
    host.querySelectorAll('[data-policy-tab]').forEach(button=>button.onclick=()=>{if(busy)return;try{capture();tab=button.dataset.policyTab;render();host.querySelector('.forge-policy-tabs').scrollIntoView({block:'start'});}catch(error){message(error.message,true);}});
    host.querySelector('[data-policy-reload]').onclick=()=>{if(!busy&&(!dirty||confirm('저장하지 않은 강화 정책을 버리고 다시 불러올까요?')))void load();};
    host.querySelector('form').oninput=()=>{dirty=true;try{capture();refresh();message('편집 중입니다. 모든 탭의 변경 내용을 한 번에 저장합니다.');}catch(error){message(error.message,true);}updateDirty();};
    host.querySelector('form').onchange=host.querySelector('form').oninput;
    host.querySelector('form').onsubmit=save;
    refresh();updateDirty();
  }
  function capture() {
    const next=structuredClone(draft);
    for(const input of host.querySelectorAll('[data-policy-path]')) {
      if(input.type==='number'&&input.validity.badInput)throw Error('숫자 입력을 확인하세요.');
      const value=input.type==='checkbox'?input.checked:input.dataset.number?forgeInputNumber(input.value,input.dataset.number):input.value||null;
      put(next,input.dataset.policyPath,value);
    }
    draft=next;
    return next;
  }
  function updateDirty(){const el=host.querySelector('[data-policy-dirty]');if(el)el.textContent=dirty?'저장하지 않은 변경 있음':`저장 버전 r${data.policy.revision} · 변경 없음`;}
  function refresh() {
    for(const preview of host.querySelectorAll('[data-item-preview]')){
      const item=data.catalog.find(item=>item.code===at(draft,preview.dataset.itemPreview));
      let image='';
      try{const url=new URL(item?.image||'',location.origin+'/');if(item?.image&&((url.origin===location.origin&&url.pathname.startsWith('/assets/'))||url.protocol==='https:')&&!url.username&&!url.password)image=url.href;}catch{}
      const signature=JSON.stringify([item?.code,item?.name,image]);
      if(preview.dataset.itemSignature===signature)continue;
      preview.dataset.itemSignature=signature;
      preview.innerHTML=item?`${image?`<img src="${esc(image)}" alt="${esc(item.name)}" loading="lazy">`:''}<div><b>${esc(item.name)}</b><small>${esc(item.code)}</small></div>`:'<span>아이템을 선택하면 이름과 이미지를 확인할 수 있습니다.</span>';
      const img=preview.querySelector('img');if(img)img.onerror=()=>{img.hidden=true;};
    }
    let valid, error;
    try{valid=validateForgePolicy(draft);}catch(e){error=e.message;}
    const readiness=valid?forgePolicyReadiness(valid,data.catalog):null;
    host.querySelector('[data-policy-progress]').textContent=readiness?`${readiness.completedSteps} / 10 단계 입력`:'설정값 확인 필요';
    for(const row of draft.steps) {
      const el=host.querySelector(`[data-step-status="${row.level}"]`);if(!el)continue;
      const rates=[row.successPpm,row.maintainPpm,row.destroyPpm], sum=rates.reduce((s,n)=>s+(n??0),0), complete=rates.every(n=>n!==null), correct=complete&&sum===1000000&&row.successPpm>=100000;
      el.textContent=rates.every(n=>n===null)?'확률 미설정':`합계 ${sum/10000}%${correct?' · 정상':complete?' · 확인 필요':' · 입력 중'}`;el.classList.toggle('is-error',complete&&!correct);
      host.querySelector(`[data-step-preview="${row.level}"]`).textContent=`1회 비용 ${format(row.coinCost)} 코인 · 별 ${format(row.itemQuantity)}개`;
    }
    const list=host.querySelector('[data-readiness]');
    if(list)list.innerHTML=error?`<h4>설정값 오류</h4><p class="is-error">${esc(error)}</p>`:`<h4>${readiness.ready?'정책 입력 완료 · 별도 출시 승인 필요':`확인이 필요한 항목 ${readiness.issues.length}개`}</h4>${readiness.issues.length?`<ul>${readiness.issues.map(issue=>`<li>${esc(issue.message)}</li>`).join('')}</ul>`:'<p>설정 초안은 완성됐습니다. 실제 공개는 공동 출시 승인본과 서버 게이트를 따릅니다.</p>'}`;
  }
  async function load() {
    if(busy||disposed)return;
    busy=true;controller=new AbortController();render();
    host.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{const result=await request('admin/equipment-forge/runtime',{signal:controller.signal});if(disposed)return;data=result;draft=structuredClone(result.policy);dirty=false;busy=false;render();message('저장된 강화 정책을 불러왔습니다. 미정 수치는 그대로 보존됩니다.');}
    catch(error){if(!disposed){busy=false;render();message(error.message,true);}}
    finally{busy=false;}
  }
  async function save(event) {
    event.preventDefault();if(busy||disposed)return;
    let policy;
    try{policy=validateForgePolicy(capture());}catch(error){message(error.message,true);return;}
    busy=true;host.querySelector('fieldset').disabled=true;host.querySelectorAll('[data-policy-tab]').forEach(button=>button.disabled=true);message('모든 탭의 정책을 저장하고 있습니다…');controller=new AbortController();
    try{const result=await request('admin/equipment-forge/runtime',{method:'PATCH',body:{policy},signal:controller.signal});if(disposed)return;data=result;draft=structuredClone(result.policy);dirty=false;busy=false;render();message('강화 정책 저장 완료. 초안만 저장했으며 운영 실행·재화는 변경되지 않았습니다.');}
    catch(error){if(!disposed)message(error.status===409?`${error.message} 입력은 보존되어 있습니다.`:error.message,true);}
    finally{busy=false;if(!disposed){host.querySelector('fieldset').disabled=false;host.querySelectorAll('[data-policy-tab]').forEach(button=>button.disabled=false);updateDirty();}}
  }
  void load();
  return {get dirty(){return dirty;}, destroy(){disposed=true;controller?.abort();host.replaceChildren();}, reload:load};
}
