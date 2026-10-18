import {LEGION_REGIONS,REGION_DIFFICULTIES} from '../shared/legion-regions-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={INVENTORY_ITEM:'아이템',CARD:'카드',EQUIPMENT:'장비',VEHICLE:'이동수단'};
export function renderRegionFieldDrops(policy,index,num){
  const region=policy.regions[index],info=LEGION_REGIONS.find(r=>r.id===region.id),drops=region.fieldDrops,prefix=`regions.${index}.fieldDrops.`;
  return `<section class="legion-region-drop-editor"><h3>맵별 필드 드랍</h3><p>잊혀진 섬과 같은 후보·가중치·수량 방식입니다. 맵을 바꿔도 입력값은 유지되며, 아래 지역 설정 저장으로 함께 저장합니다.</p>
    <nav class="legion-cms-map-tabs" aria-label="드랍 설정 지역">${policy.regions.map((r,i)=>{const map=LEGION_REGIONS.find(m=>m.id===r.id);return `<button type="button" data-drop-region="${i}" aria-pressed="${i===index}"><img src="${esc(map.background)}" alt=""><span>${esc(map.name)}</span></button>`;}).join('')}</nav>
    <header><h3>${esc(info.name)} <small>필드 드랍 ${drops?.items.length??0}종</small></h3><b>지역 운영 ${esc(policy.mode)}</b></header>
    ${drops?`<p>지역 전용 장비·연마석과 별도로 추첨합니다. ‘재앙’의 최초 초안은 잊혀진 섬 ‘지옥’ 수치를 사용합니다.</p>
    <div class="legion-cms-difficulties">${drops.difficulties.map((d,i)=>`<fieldset><legend>${REGION_DIFFICULTIES.find(r=>r.id===d.id).name}</legend>${num(prefix+`difficulties.${i}.dropPercent`,'일반 몬스터 확률 (%)',d.dropPercent,0,100,.01)}${num(prefix+`difficulties.${i}.bossDropPercent`,'보스 확률 (%)',d.bossDropPercent,0,100,.01)}${num(prefix+`difficulties.${i}.lifetimeSeconds`,'필드 소멸 시간 (초)',d.lifetimeSeconds,3,30,.1)}</fieldset>`).join('')}</div>
    <h3 class="legion-cms-pool-title">드랍 후보 <small>${drops.items.length} / 100</small></h3><p>드랍 성공 시 사용 중인 후보에서 1종을 선택합니다. 가중치는 0.001 단위, 수량은 최소~최대 범위입니다.</p>
    <div class="legion-cms-items">${drops.items.map((item,i)=>`<article><div class="legion-cms-item-title"><img src="${esc(item.image)}" alt="" loading="lazy"><div><strong>${esc(item.name)}</strong><small>${types[item.type]} · ${esc(item.ref)}</small><b data-field-odds="${i}"></b></div><button type="button" data-field-remove="${i}" aria-label="${esc(item.name)} 제외">제외</button></div><div class="legion-cms-item-fields"><label class="legion-cms-check"><input type="checkbox" name="${prefix}items.${i}.enabled" ${item.enabled?'checked':''}>드랍 사용</label>${num(prefix+`items.${i}.weight`,'선택 가중치',item.weight,0,1e6,.001)}${num(prefix+`items.${i}.minQuantity`,'최소 수량',item.minQuantity,1,item.type==='VEHICLE'?1:item.type==='EQUIPMENT'?100:1e6)}${num(prefix+`items.${i}.maxQuantity`,'최대 수량',item.maxQuantity,1,item.type==='VEHICLE'?1:item.type==='EQUIPMENT'?100:1e6)}</div></article>`).join('')||'<p>등록된 후보가 없습니다.</p>'}</div>
    <div class="legion-cms-add"><label>아이템 검색<input type="search" data-field-search placeholder="이름 또는 코드"></label><label>추가할 아이템<select data-field-catalog></select></label><button type="button" data-field-add ${drops.items.length>=100?'disabled':''}>후보 추가</button></div>`:'<p>아직 저장된 필드 드랍 초안이 없습니다.</p>'}</section>`;
}
export function fillRegionFieldCatalog(form,items,catalog){
  const select=form.querySelector('[data-field-catalog]');if(!select)return;
  const term=form.querySelector('[data-field-search]').value.trim().toLocaleLowerCase(),chosen=new Set(items.map(r=>r.code));
  const rows=catalog.filter(r=>!chosen.has(r.code)&&(!term||(r.name+' '+r.code+' '+types[r.type]).toLocaleLowerCase().includes(term)));
  select.innerHTML=rows.length?rows.map(r=>`<option value="${esc(r.code)}">[${types[r.type]}] ${esc(r.name)} · ${esc(r.ref)}</option>`).join(''):'<option value="">추가할 아이템이 없습니다</option>';
}
export function updateRegionFieldOdds(form,items){
  const total=items.reduce((n,r)=>n+(r.enabled?r.weight:0),0);
  form.querySelectorAll('[data-field-odds]').forEach(el=>{const row=items[Number(el.dataset.fieldOdds)],odds=total&&row.enabled?row.weight/total*100:0;el.textContent='드랍 시 '+(odds>0&&odds<.00001?'0.00001% 미만':odds.toFixed(5).replace(/\.?0+$/,'')+'%');});
}
