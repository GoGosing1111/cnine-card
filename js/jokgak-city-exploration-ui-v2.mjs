import {CITY_FOUND_WEAPONS,CITY_ARMORS,CITY_SEARCH_AREAS,defaultCityExploration,citySearchPool} from '../shared/jokgak-city-exploration-v1.mjs';
import {CITY_SUPPLY_WEAPONS} from '../shared/jokgak-city-supply-v1.mjs';
import {citySupplyArt,citySupplyGearDetail,citySupplyExpiryLabel} from './jokgak-city-supply-ui-v1.mjs?v=20261021-supply-expiry1';
import {CITY_WEAPONS} from '../shared/jokgak-city-expansion-v1.mjs';
import {cityPlace} from '../shared/jokgak-city-v1.mjs';
import {cityItemArt} from './jokgak-city-item-art-v1.mjs?v=20261011-items1';
import {cityExplorationArt} from './jokgak-city-gear-art-v1.mjs?v=20261012-background-perf1';
const money=n=>Number(n||0).toLocaleString('ko-KR');
const metas=[...CITY_WEAPONS,...CITY_FOUND_WEAPONS,...CITY_ARMORS,...CITY_SUPPLY_WEAPONS];
const tierNames=['','일반','고급','희귀','최상급','보급 전용'];
const tier=meta=>meta?.tier||({PIPE:1,PISTOL:2,RIFLE:3}[meta?.code])||1;
const armor=meta=>meta?.kind==='armor';
const atmosphere={HOME:'먼지 쌓인 다락, 잊힌 장비를 찾는 시간.',POLICE:'불 꺼진 보급실에 남겨진 전술 장비.',POST:'주인 없는 화물 속에서 발견하는 뜻밖의 무장.',MARKET:'낡은 좌판 사이, 아직 쓸 만한 것들이 남아 있습니다.',DEPARTMENT:'굳게 닫혔던 보안실의 흔적을 따라갑니다.',DOCK:'바닷바람이 스치는 컨테이너, 묵직한 보급의 흔적.',ALLEY:'어둠 속 은신처에 누군가 장비를 남겼습니다.',SHOP:'적재함 틈에서 다음 교전을 준비합니다.',RESTAURANT:'지하 보관실, 오래된 물품 사이를 살펴봅니다.'};
const rules=state=>[...CITY_SUPPLY_WEAPONS,...(state?.arsenal?.weapons||[]),...(state?.exploration||defaultCityExploration()).weapons,...(state?.exploration||defaultCityExploration()).armors];
const owned=(mine,meta)=>(armor(meta)?mine?.ownedArmors:mine?.ownedWeapons)?.includes(meta.code);
const equipped=(mine,meta)=>(armor(meta)?mine?.armor:mine?.weapon)?.code===meta.code;
const reticle='<span class="jc-search-reticle" aria-hidden="true"><i></i><i></i><i></i></span>';
export function cityGearArt(code,small=false){return citySupplyArt(code,small)||cityItemArt(code,small)||cityExplorationArt(code,small);}
export function cityExplorePanel(state,selected,now,busy){
 if(!state)return '';
 const cfg=state.exploration||defaultCityExploration(),pool=citySearchPool(state,selected),meta=CITY_SEARCH_AREAS.find(a=>a.location===selected),place=cityPlace(selected),m=state.mine;
 if(!meta)return '';
 const here=m?.active&&m.location===selected,remaining=Math.max(0,(m?.exploreNextAt||0)-now);
 const reason=busy?'주변을 살펴보는 중…':!pool?'현재 탐색 중지':!m?.active?'도시 입장 후 탐색':!here?'이 지역으로 이동 후 탐색':m?.deadUntil>now?'부활 후 탐색 가능':m?.jailedUntil>now?'구금 해제 후 탐색 가능':m?.hospitalRequired?'병원 진료 후 탐색 가능':m?.restUntil>now?'휴식 종료 후 탐색 가능':m?.career?.work?'근무 완료 후 탐색':m?.nextActionAt>now?'행동 대기 중':remaining>0?`재탐색 ${Math.ceil(remaining/1000)}초`:'';
 const all=rules(state),drops=pool?.drops||[],total=(pool?.area.emptyWeight||0)+drops.reduce((n,d)=>n+d.weight,0),empty=total?(pool.area.emptyWeight/total*100):100;
 return `<section class="jc-explore jc-explore-v2 ${busy?'is-scanning':''}" aria-label="현재 지역 탐색" style="--search-x:${place.x}%;--search-y:${place.y}%">
 <header class="jc-search-scene"><div class="jc-search-kicker"><span>FIELD SEARCH · ${String(CITY_SEARCH_AREAS.indexOf(meta)+1).padStart(2,'0')}</span><b>${here?'현 위치':'미리보기'}</b></div><div class="jc-search-title"><div><small>${place.name} 탐색</small><h3>${meta.label}</h3></div>${reticle}</div><p>${atmosphere[selected]}</p></header>
 <div class="jc-search-content"><div class="jc-search-section-label"><b>발견 가능 장비</b><span>${drops.length}종 · 눌러서 자세히</span></div><div class="jc-explore-drops">${drops.map(d=>{const item=metas.find(m=>m.code===d.code),rule=all.find(r=>r.code===d.code),chance=(d.weight/total*100).toFixed(1);return `<button class="jc-drop-card" data-city-gear="${d.code}" data-tier="${tier(item)}" aria-label="${item.name}, 발견 ${chance}%, 장비 정보"><span class="jc-drop-chance">${chance}<small>%</small></span>${cityGearArt(d.code,true)}<span class="jc-drop-kind">${tierNames[tier(item)]} ${armor(item)?'방어구':'무기'}</span><b>${item.name}</b><strong>${armor(item)?'+':''}${money(rule.power)}</strong><span class="jc-drop-owned">${equipped(m,item)?'● 장착 중':owned(m,item)?'✓ 보유 중':'도시 전투력'}</span></button>`;}).join('')||`<p class="jc-search-unavailable">${pool?'현재 발견 가능한 장비가 없습니다.':'이 지역의 탐색이 잠시 중지되었습니다.'}</p>`}</div>
 <div class="jc-search-probability"><span>발견 없음 <b>${empty.toFixed(1)}%</b></span><i aria-hidden="true"><em style="width:${100-empty}%"></em></i></div>
 <button class="jc-search-button" data-city-action="explore" ${reason?'disabled':''}>${reticle}<b>${reason||'이 지역 탐색하기'}</b><small>무료</small></button><footer><span>재탐색 ${cfg.cooldownMs/1000}초</span><span>장비는 이번 회차에만 사용</span></footer></div></section>`;
}
export function cityEquipmentSummary(state){
 const m=state.mine;if(!m?.active)return '';
 return `<section class="jc-kit-summary" aria-label="장착 장비"><header><div><small>MY CITY LOADOUT</small><h3>지금의 무장</h3></div><strong>${money(m.cityPower)}<small>도시 전투력</small></strong></header><div>${[['무기',m.weapon],['방어구',m.armor]].map(([label,item])=>`<div>${item?.code?cityGearArt(item.code,true):'<span class="jc-kit-vacant" aria-hidden="true">＋</span>'}<span><small>${label}</small><b>${item?.name||'미장착'}</b></span></div>`).join('')}</div></section>`;
}
export function cityEquipmentCard(state,rule,meta,locked){
 const m=state.mine,isArmor=armor(meta),isEquipped=equipped(m,meta),action=isArmor?'Armor':'Weapon';
 return `<article class="jc-kit-card ${meta.supplyOnly?'jc-supply-gear':''} ${isEquipped?'is-equipped':''}" data-tier="${tier(meta)}"><span class="jc-kit-badge">${isEquipped?'✓ 장착 중':tierNames[tier(meta)]}</span><button class="jc-kit-inspect" data-city-gear="${meta.code}" aria-label="${meta.name} 장비 정보">${cityGearArt(meta.code,true)}</button><b>${meta.name}</b><small>${isArmor?'추가 전투력':'도시 전투력'} <strong>${isArmor?'+':''}${money(rule.power)}</strong></small>${meta.supplyOnly?citySupplyExpiryLabel(state,meta.code):''}<button class="jc-kit-equip" data-city-action="${isEquipped?'unequip':'equip'}${action}" ${isEquipped?'':`data-city-product="${meta.code}"`} ${locked||!rule.enabled?'disabled':''}>${isEquipped?'장착 해제':'장착하기'}</button></article>`;
}
export function cityArmorInventory(state,now,busy){
 const m=state?.mine;if(!m?.active)return '';
 const list=(state.exploration||defaultCityExploration()).armors.filter(a=>m.ownedArmors?.includes(a.code)),locked=busy||m.deadUntil>now||m.jailedUntil>now||m.hospitalRequired||m.nextActionAt>now;
 return `<section class="jc-mini-inventory jc-kit-inventory jc-armor-inventory" aria-label="도시 방어구"><header><div><small>ARMOR COLLECTION</small><h3>방어구 <b>${list.length} / ${CITY_ARMORS.length}</b></h3></div><span>1개 장착</span></header><p class="jc-gear-help">방어구의 전투력이 무기 전투력에 더해집니다.</p><div class="jc-mini-weapons">${list.map(a=>cityEquipmentCard(state,a,CITY_ARMORS.find(x=>x.code===a.code),locked)).join('')||'<p>아직 방어구가 없습니다.<br>현재 지역을 탐색해 나만의 무장을 완성하세요.</p>'}</div></section>`;
}
export function cityGearDetail(state,code){
 if(citySupplyGearDetail(state,code))return citySupplyGearDetail(state,code);
 const meta=metas.find(m=>m.code===code),rule=rules(state).find(r=>r.code===code);if(!meta||!rule)return '';
 const places=CITY_SEARCH_AREAS.filter(area=>citySearchPool(state,area.location)?.drops.some(d=>d.code===code)).map(area=>cityPlace(area.location).name);
 return `<div class="jc jc-loot-result jc-loot-v2 jc-gear-detail" data-tier="${tier(meta)}"><span class="jc-loot-eyebrow">EQUIPMENT INTEL</span><div class="jc-loot-visual">${cityGearArt(code)}</div><span class="jc-loot-tier">${tierNames[tier(meta)]} · ${armor(meta)?'방어구':'무기'}</span><h3>${meta.name}</h3><strong>${armor(meta)?'+':''}${money(rule.power)}<small>${armor(meta)?'추가 도시 전투력':'도시 전투력'}</small></strong><p>${equipped(state.mine,meta)?'현재 장착 중인 장비입니다.':owned(state.mine,meta)?'보유한 장비입니다. 인벤토리에서 장착할 수 있습니다.':'지역을 탐색해 발견할 수 있는 장비입니다.'}</p><div class="jc-gear-sources"><small>발견 지역</small><span>${places.join(' · ')||'현재 탐색 획득 중지'}</span></div><footer>${armor(meta)?'방어구':'무기'} 1개 장착 · 이번 회차에만 사용</footer></div>`;
}
export function cityExplorationResult(result){
 const e=result.exploration,item=e.item,found=e.outcome==='FOUND';
 return `<div class="jc jc-loot-result jc-loot-v2" data-tier="${tier(item)}" data-outcome="${e.outcome}"><span class="jc-loot-eyebrow">${found?'DISCOVERY / NEW EQUIPMENT':item?'DISCOVERY / OWNED':'SEARCH COMPLETE'}</span><small>${cityPlace(e.location)?.name||'도시'} · 탐색 완료</small><div class="jc-loot-visual">${item?cityGearArt(item.code):reticle}<span class="jc-loot-orbit" aria-hidden="true"></span></div><span class="jc-loot-tier">${item?tierNames[tier(item)]+' · '+(armor(item)?'방어구':'무기'):'주변 탐색'}</span><h3>${item?item.name:'장비를 발견하지 못했습니다'}</h3>${item?`<strong>${armor(item)?'+':''}${money(item.power)}<small>${armor(item)?'추가 도시 전투력':'도시 전투력'}</small></strong>`:''}<p>${found?'새로운 장비를 인벤토리에 보관했습니다.<br>장착하고 다음 교전을 준비하세요.':item?'이미 보유한 장비입니다.<br>중복 장비는 추가되지 않습니다.':'이번 장소에서는 쓸 만한 장비를 찾지 못했습니다.<br>다음 탐색에서 다른 흔적을 찾아보세요.'}</p><footer>도시 전용 장비 · 이번 회차에만 사용</footer></div>`;
}
