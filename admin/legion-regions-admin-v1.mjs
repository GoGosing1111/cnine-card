import {jointAdminRequest as api} from '../js/joint-account-transport.mjs';
import {LEGION_REGIONS,REGION_DIFFICULTIES,REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';
import {equipmentEffectText} from '../shared/equipment-growth-text-v1.mjs';
import {renderRegionFieldDrops,fillRegionFieldCatalog,updateRegionFieldOdds} from './legion-region-drops-v1.mjs?v=20261018-coins-paced-v2';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountLegionRegionsCms(root){
  let policy,busy=false,catalog=[],selectedRegion=0;
  root.innerHTML='<header><div><span class="legion-cms-eyebrow">군단토벌 · 신규 5지역</span><h2>지역 운영 · 용병장비 · 일반 아이템</h2><p>기존 군단토벌 모드와 함께 적용됩니다. 입장 횟수는 모든 지역이 공유합니다.</p></div></header><p role="status" aria-live="polite"></p><form></form>';
  const form=root.querySelector('form'),status=root.querySelector('[role=status]');
  const num=(name,label,value,min,max,step=1)=>`<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" required></label>`;
  function equipmentOdds(){
    return `<section class="legion-cms-mercenary-gear" aria-label="용병장비 드랍 확률"><h3>용병장비</h3><p>신규 5지역의 용병장비 30종 전용 확률입니다. 일반 아이템과 연마석은 아래 별도 항목에서 설정합니다.</p><p><b>예: 0.0015% = 해당 몬스터 처치 약 66,667회당 평균 1회</b><br>세트장비는 성공 시 5부위 중 1개를 선택합니다. 세트 확률이 0.0015%면 특정 부위는 0.0003%입니다. 보스 세트장비와 고유장비는 각각 독립 추첨합니다. 보장 횟수는 없으며, 드랍 보너스는 기본 확률에 별도 적용됩니다.</p><div class="legion-cms-gear-odds">${policy.difficulties.map((d,i)=>{
      const prefix='difficulties.'+i+'.loot.';
      return `<fieldset><legend>${REGION_DIFFICULTIES.find(x=>x.id===d.id).name}</legend>${num(prefix+'eliteSetPercent','정예 처치 · 용병 세트장비 (%)',d.loot.eliteSetPercent,0,100,.0001)}${num(prefix+'bossSetPercent','보스 처치 · 용병 세트장비 (%)',d.loot.bossSetPercent,0,100,.0001)}${num(prefix+'bossUniquePercent','보스 처치 · 용병 고유장비 (%)',d.loot.bossUniquePercent,0,100,.0001)}</fieldset>`;
    }).join('')}</div></section>`;
  }
  function ascendantOdds(){
    const drops=policy.ascendantDrops;if(!drops)return '';
    return `<section class="legion-cms-mercenary-gear"><h3>상위 용병장비 1~10단계</h3><label><input type="checkbox" name="ascendantDrops.enabled" ${drops.enabled?'checked':''}> 지역 보스 드랍 사용</label><p>지역 5곳의 모든 난이도에서 각 단계를 독립 추첨합니다. 성공하면 해당 단계 5부위 중 하나를 얻습니다. 아래는 드랍 보너스가 없는 보스 처치 원정 기준 평균이며 확정 지급 횟수가 아닙니다.</p><div class="legion-cms-gear-odds">${drops.tiers.map((row,i)=>num('ascendantDrops.tiers.'+i+'.expectedRuns',row.tier+'단계 평균 원정 횟수',row.expectedRuns,1,1e9)).join('')}</div></section>`;
  }
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
    form.innerHTML=`<div class="legion-cms-region-mode"><label>지역 운영<select name="mode">${['OFF','TEST','ON'].map(m=>`<option ${policy.mode===m?'selected':''}>${m}</option>`).join('')}</select></label><label>TEST 계정번호 (쉼표 구분, 최대 100명)<input name="testUserIds" value="${policy.testUserIds.join(', ')}" placeholder="OWNER는 기본 포함"></label></div><p>TEST는 계정 보상을 지급하지 않습니다. ON은 등록·공개된 용병장비와 연마석이 준비되어야 저장됩니다. OFF는 OWNER를 포함한 모든 계정의 지역 입장을 차단합니다. 아래 변경은 새 원정부터 적용됩니다.</p>
      <div class="legion-cms-region-cards">${policy.regions.map((r,i)=>{const row=LEGION_REGIONS.find(x=>x.id===r.id);return `<article><img src="${row.background}" alt=""><label><input type="checkbox" name="regions.${i}.enabled" ${r.enabled?'checked':''}> ${row.name}</label><p>${row.counter}</p><small>2세트 · ${equipmentEffectText(row.two)}<br>4세트 · ${equipmentEffectText(row.four)}</small><div>${REGION_EQUIPMENT.filter(e=>e.regionId===r.id).map(e=>`<img src="${e.image}" alt="${e.name}" title="${e.name} · 기본 전투력 ${e.totalPower}">`).join('')}</div></article>`;}).join('')}</div>
      ${equipmentOdds()}${ascendantOdds()}${renderRegionFieldDrops(policy,selectedRegion,num,catalog)}<h3>지역 공통 전투 · 연마석</h3><div class="legion-cms-region-difficulties">${policy.difficulties.map((d,i)=>{const prefix='difficulties.'+i+'.',label=REGION_DIFFICULTIES.find(x=>x.id===d.id);return `<details ${i===0?'open':''}><summary>${label.name} <span>${label.recommendation}</span></summary><div class="legion-cms-region-fields">${num(prefix+'power','일반 몬스터 전투력',d.power,1000,1e9)}${num(prefix+'bossPower','보스 전투력',d.bossPower,1000,1e9)}${num(prefix+'attack','공격 배율 (%)',d.attack,100,500)}${num(prefix+'shield','보스 시작 보호막 (%)',d.shield,0,100)}${num(prefix+'forced','강제 행동 간격 (아군 행동)',d.forced,2,12)}${num(prefix+'loot.stonePercent','일반 연마석 확률 (%)',d.loot.stonePercent,0,100,.001)}${num(prefix+'loot.eliteStonePercent','정예 연마석 확률 (%)',d.loot.eliteStonePercent,0,100,.001)}${num(prefix+'loot.bossStones','보스 확정 연마석 (개)',d.loot.bossStones,1,100)}${num(prefix+'loot.lifetimeSeconds','필드 소멸 시간 (초)',d.loot.lifetimeSeconds,3,30,.1)}</div></details>`;}).join('')}</div><footer><span>지역 정책 r${policy.revision} · 용병장비 기본 능력치는 장비 CMS에서 관리</span><button type="button" data-region-reload>다시 불러오기</button><button type="submit">지역 설정 저장</button></footer>`;
    form.querySelector('[data-region-reload]').onclick=()=>void load();
    fillRegionFieldCatalog(form,policy.regions[selectedRegion].fieldDrops?.items||[],catalog);
    updateRegionFieldOdds(form,policy.regions[selectedRegion].fieldDrops?.items||[]);
  }
  function disable(on){busy=on;form.querySelectorAll('input,select,button').forEach(e=>e.disabled=on);const add=form.querySelector('[data-field-add]');if(add&&!on)add.disabled=policy.regions[selectedRegion].fieldDrops.items.length>=100;}
  async function load(){if(busy)return;disable(true);try{const data=await api('admin/legion-hunt/regions');policy=data.policy;catalog=data.catalog;draw();status.textContent='지역 운영 '+policy.mode+' · 설정 r'+policy.revision;}catch(e){status.textContent=e.message;}finally{disable(false);}}
  form.addEventListener('input',e=>{
    if(e.target.matches('[data-field-search]'))fillRegionFieldCatalog(form,policy.regions[selectedRegion].fieldDrops?.items||[],catalog);
    else if(e.target.name?.includes('.fieldDrops.items.'))updateRegionFieldOdds(form,capture().regions[selectedRegion].fieldDrops.items);
  });
  form.addEventListener('click',e=>{
    if(busy)return;
    const tab=e.target.closest('[data-drop-region]'),remove=e.target.closest('[data-field-remove]'),add=e.target.closest('[data-field-add]');
    if(tab){policy=capture();selectedRegion=Number(tab.dataset.dropRegion);draw();return;}
    if(remove){policy=capture();policy.regions[selectedRegion].fieldDrops.items.splice(Number(remove.dataset.fieldRemove),1);draw();return;}
    if(add){
      const item=catalog.find(r=>r.code===form.querySelector('[data-field-catalog]').value);if(!item)return;
      policy=capture();const items=policy.regions[selectedRegion].fieldDrops.items;if(items.length>=100||items.some(r=>r.code===item.code))return;
      items.push({...item,enabled:false,weight:1,minQuantity:1,maxQuantity:1});draw();status.textContent=item.name+' 후보 추가 · 지역 설정을 저장하세요.';
    }
  });
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;const next=capture();disable(true);try{const data=await api('admin/legion-hunt/regions',{method:'PATCH',body:{policy:next}});policy=data.policy;draw();status.textContent='저장 완료 · '+policy.mode+' · 새 원정부터 적용';}catch(e){status.textContent=e.message;}finally{disable(false);}};
  await load();
}
