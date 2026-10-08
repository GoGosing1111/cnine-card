import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {LEGION_REGIONS,REGION_DIFFICULTIES,REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';
import {equipmentEffectText} from '../shared/equipment-growth-text-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountLegionRegionsCms(root){
  let policy,busy=false;
  root.innerHTML='<header><div><span class="legion-cms-eyebrow">REGIONAL EXPEDITIONS</span><h2>지역 확장 · 전투와 전리품</h2><p>기존 군단토벌 모드와 함께 적용됩니다. 입장 횟수는 모든 지역이 공유합니다.</p></div></header><p role="status" aria-live="polite"></p><form></form>';
  const form=root.querySelector('form'),status=root.querySelector('[role=status]');
  const num=(name,label,value,min,max,step=1)=>`<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" required></label>`;
  function capture(){
    const next=structuredClone(policy);
    for(const input of form.querySelectorAll('[name]')){
      if(input.name==='testUserIds'){next.testUserIds=input.value.trim()?input.value.split(/[\s,]+/).map(Number):[];continue;}
      const keys=input.name.split('.');let target=next;for(const key of keys.slice(0,-1))target=target[key];
      target[keys.at(-1)]=input.name==='mode'?input.value:input.type==='checkbox'?input.checked:Number(input.value);
    }
    return next;
  }
  function draw(){
    form.innerHTML=`<div class="legion-cms-region-mode"><label>지역 운영<select name="mode">${['OFF','TEST','ON'].map(m=>`<option ${policy.mode===m?'selected':''}>${m}</option>`).join('')}</select></label><label>TEST 계정번호 (쉼표 구분, 최대 100명)<input name="testUserIds" value="${policy.testUserIds.join(', ')}" placeholder="OWNER는 기본 포함"></label></div><p>TEST는 계정 보상을 지급하지 않습니다. ON은 등록·공개된 지역 장비와 연마석이 준비되어야 저장됩니다. 아래 변경은 새 원정부터 적용됩니다.</p>
      <div class="legion-cms-region-cards">${policy.regions.map((r,i)=>{const row=LEGION_REGIONS.find(x=>x.id===r.id);return `<article><img src="${row.background}" alt=""><label><input type="checkbox" name="regions.${i}.enabled" ${r.enabled?'checked':''}> ${row.name}</label><p>${row.counter}</p><small>2세트 · ${equipmentEffectText(row.two)}<br>4세트 · ${equipmentEffectText(row.four)}</small><div>${REGION_EQUIPMENT.filter(e=>e.regionId===r.id).map(e=>`<img src="${e.image}" alt="${e.name}" title="${e.name} · 기본 전투력 ${e.totalPower}">`).join('')}</div></article>`;}).join('')}</div>
      <div class="legion-cms-region-difficulties">${policy.difficulties.map((d,i)=>{const prefix='difficulties.'+i+'.',label=REGION_DIFFICULTIES.find(x=>x.id===d.id);return `<details ${i===0?'open':''}><summary>${label.name} <span>${label.recommendation}</span></summary><div class="legion-cms-region-fields">${num(prefix+'power','일반 몬스터 전투력',d.power,1000,1e9)}${num(prefix+'bossPower','보스 전투력',d.bossPower,1000,1e9)}${num(prefix+'attack','공격 배율 (%)',d.attack,100,500)}${num(prefix+'shield','보스 시작 보호막 (%)',d.shield,0,100)}${num(prefix+'forced','강제 행동 간격 (아군 행동)',d.forced,2,12)}${num(prefix+'loot.stonePercent','일반 연마석 확률 (%)',d.loot.stonePercent,0,100,.001)}${num(prefix+'loot.eliteStonePercent','정예 연마석 확률 (%)',d.loot.eliteStonePercent,0,100,.001)}${num(prefix+'loot.eliteSetPercent','정예 세트 확률 (%)',d.loot.eliteSetPercent,0,100,.001)}${num(prefix+'loot.bossSetPercent','보스 세트 확률 (%)',d.loot.bossSetPercent,0,100,.001)}${num(prefix+'loot.bossUniquePercent','보스 고유 확률 (%)',d.loot.bossUniquePercent,0,100,.001)}${num(prefix+'loot.bossStones','보스 확정 연마석 (개)',d.loot.bossStones,1,100)}${num(prefix+'loot.lifetimeSeconds','필드 소멸 시간 (초)',d.loot.lifetimeSeconds,3,30,.1)}</div></details>`;}).join('')}</div><footer><span>지역 정책 r${policy.revision} · 장비 기본 능력치는 장비 CMS에서 관리</span><button type="button" data-region-reload>다시 불러오기</button><button type="submit">지역 설정 저장</button></footer>`;
    form.querySelector('[data-region-reload]').onclick=()=>void load();
  }
  function disable(on){busy=on;form.querySelectorAll('input,select,button').forEach(e=>e.disabled=on);}
  async function load(){if(busy)return;disable(true);try{const data=await api('admin/legion-hunt/regions');policy=data.policy;draw();status.textContent='지역 운영 '+policy.mode+' · 설정 r'+policy.revision;}catch(e){status.textContent=e.message;}finally{disable(false);}}
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;const next=capture();disable(true);try{const data=await api('admin/legion-hunt/regions',{method:'PATCH',body:{policy:next}});policy=data.policy;draw();status.textContent='저장 완료 · '+policy.mode+' · 새 원정부터 적용';}catch(e){status.textContent=e.message;}finally{disable(false);}};
  await load();
}
