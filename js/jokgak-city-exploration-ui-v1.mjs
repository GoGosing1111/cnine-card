import {CITY_FOUND_WEAPONS,CITY_ARMORS,CITY_SEARCH_AREAS,defaultCityExploration,citySearchPool} from '../shared/jokgak-city-exploration-v1.mjs';
import {CITY_WEAPONS} from '../shared/jokgak-city-expansion-v1.mjs';
import {cityPlace} from '../shared/jokgak-city-v1.mjs';
import {cityItemArt} from './jokgak-city-item-art-v1.mjs?v=20261011-items1';
const money=n=>Number(n||0).toLocaleString('ko-KR');
const metas=[...CITY_WEAPONS,...CITY_FOUND_WEAPONS,...CITY_ARMORS];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tierNames=['','일반','고급','희귀','최상급'];
export function cityGearArt(code,small=false){
  const existing=cityItemArt(code,small);if(existing)return existing;
  const meta=metas.find(m=>m.code===code),armor=meta?.kind==='armor';
  const paths={
    CROWBAR:'M22 72 66 28 64 16 72 12 81 22 77 33 31 81Z M65 25l11 10',
    BAT:'M22 78 38 62 44 54 72 18Q79 12 85 19L88 22Q91 26 86 32L52 61 44 65 29 82Z M35 65l7 7',
    KNIFE:'M24 78 42 59 36 51 53 40 81 13 85 17 64 50 49 63 34 85Z M35 51l17 17',
    CROSSBOW:'M22 71 70 23 79 31 31 79ZM19 26Q57 31 76 79M19 26l19 53 38 0M43 48l21-22',
    SHOTGUN:'M12 58 29 47 71 20 78 27 39 54 42 61 27 66 15 76 9 66ZM42 47l27-20M65 19l15 15',
    SMG:'M12 42h49l8-8h13v11h9v9H60l-5 9H40l-9 20H19l7-24H12ZM47 59l6 22H41l-2-20M64 34V25h14v9',
    SNIPER:'M8 66 26 54 42 40h32v6h16v6H66l-7 9H42l-7 18H25l5-17-18 13ZM43 40V28h23v8H40M58 55l9 22M71 46v6',
    JACKET:'M25 29 38 20l12 12 12-12 13 9 14 29-14 8-7-15v34H32V51l-7 15-14-8ZM50 33v52M33 64h10m14 0h10',
    WORK_VEST:'M29 21h13l8 14 8-14h13l3 21-9 10v35H35V52l-9-10ZM38 59h24v12H38M48 37v46',
    PADDED:'M27 25 41 18l9 12 9-12 14 7 12 21-15 8-3-7v40H33V47l-3 7-15-8ZM38 43h24M38 56h24M38 69h24',
    KEVLAR:'M28 20h14v13h16V20h14l7 24-10 9v33H31V53l-10-9ZM37 43h26v23H37ZM38 73h24',
    RIOT:'M24 23 39 17l11 13 11-13 15 6 12 21-15 9-6-11v43H33V42l-6 11-15-9ZM39 40h22l4 23-15 15-15-15Z',
    PLATE:'M26 24 39 16l11 13 11-13 13 8 15 23-16 8-6-10v41H33V45l-6 10-16-8ZM50 35l15 8-3 25-12 12-12-12-3-25Z M50 43v26'
  };
  return `<span class="jc-gear-art ${small?'is-small':''}" data-tier="${meta?.tier||2}" aria-label="${esc(meta?.name||'장비')}"><svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path class="jc-gear-frame" d="M8 24V8h16m52 0h16v16m0 52v16H76m-52 0H8V76"/><circle cx="50" cy="50" r="37" class="jc-gear-ring"/><path class="jc-gear-shape" d="${paths[code]||(armor?paths.KEVLAR:paths.KNIFE)}"/></svg></span>`;
}
export function cityExplorePanel(state,selected,now,busy){
  if(!state)return '';
  const cfg=state.exploration||defaultCityExploration(),pool=citySearchPool(state,selected),meta=CITY_SEARCH_AREAS.find(a=>a.location===selected),m=state.mine;
  if(!meta)return '';
  const here=m?.active&&m.location===selected,remaining=Math.max(0,(m?.exploreNextAt||0)-now),blocked=busy||!here||!pool||m?.deadUntil>now||m?.jailedUntil>now||m?.nextActionAt>now||m?.hospitalRequired||m?.restUntil>now||m?.career?.work||remaining>0;
  const rules=[...(state.arsenal?.weapons||[]),...cfg.weapons,...cfg.armors],drops=pool?.drops||[],total=(pool?.area.emptyWeight||0)+drops.reduce((n,d)=>n+d.weight,0);
  return `<section class="jc-explore ${busy?'is-scanning':''}" aria-label="현재 지역 탐색"><header><span class="jc-explore-signal">⌖</span><div><small>LOCAL EXPLORATION</small><h3>${meta.label}</h3></div><b>${here?'현 위치':'탐색 지역'}</b></header><p>거리에서 찾는 나만의 무장</p><div class="jc-explore-drops">${drops.map(d=>{const item=metas.find(m=>m.code===d.code),r=rules.find(r=>r.code===d.code);return `<div title="${esc(item.name)} · 발견 ${(d.weight/total*100).toFixed(1)}%"><small>${item.kind==='armor'?'방어구':'무기'}</small>${cityGearArt(d.code,true)}<b>${item.name}</b><span>${item.kind==='armor'?'+':''}${money(r.power)}</span><em>${(d.weight/total*100).toFixed(1)}%</em></div>`;}).join('')||'<p>현재 탐색이 중지되었습니다.</p>'}</div><button class="jc-search-button" data-city-action="explore" ${blocked?'disabled':''}><span>⌖</span><b>${busy?'주변을 살펴보는 중…':!pool?'탐색 중지':!here?'이 지역으로 이동 후 탐색':m?.career?.work?'근무 완료 후 탐색':remaining>0?`재탐색 ${Math.ceil(remaining/1000)}초`:'이 지역 탐색하기'}</b><small>무료</small></button><footer>재탐색 ${cfg.cooldownMs/1000}초 · ${total?Math.round((pool?.area.emptyWeight||0)/total*100):100}%는 발견 없음<br>무기·방어구 각 1개 장착 · 이번 회차에만 사용</footer></section>`;
}
export function cityArmorInventory(state,now,busy){
  const m=state?.mine;if(!m?.active)return '';
  const rules=(state.exploration||defaultCityExploration()).armors.filter(a=>m.ownedArmors?.includes(a.code));
  const locked=busy||m.deadUntil>now||m.jailedUntil>now||m.hospitalRequired||m.nextActionAt>now;
  return `<section class="jc-mini-inventory jc-armor-inventory" aria-label="도시 방어구"><header><div><small>ARMOR / CITY ONLY</small><h3>방어구 <b>${rules.length} / ${CITY_ARMORS.length}</b></h3></div></header><p class="jc-gear-help">선택한 방어구 1개의 전투력이 무기에 더해집니다.</p><div class="jc-mini-weapons">${rules.map(a=>{const meta=CITY_ARMORS.find(x=>x.code===a.code),equipped=m.armor?.code===a.code;return `<article class="${equipped?'is-equipped':''}">${cityGearArt(a.code,true)}<b>${meta.name}</b><small>+${money(a.power)} POWER</small><em>${equipped?'장착 중':tierNames[meta.tier]}</em><button data-city-action="${equipped?'unequipArmor':'equipArmor'}" ${equipped?'':`data-city-product="${a.code}"`} ${locked||!a.enabled?'disabled':''}>${equipped?'해제':'장착'}</button></article>`;}).join('')||'<p>아직 방어구가 없습니다.<br>지도에서 현재 지역을 탐색해 보세요.</p>'}</div></section>`;
}
export function cityExplorationResult(result){
  const e=result.exploration,item=e.item;
  return `<div class="jc jc-loot-result"><small>${cityPlace(e.location)?.name||'도시'} · 탐색 완료</small>${item?cityGearArt(item.code):'<div class="jc-empty-search">⌖</div>'}<span class="jc-loot-tier">${item?tierNames[item.tier]+' '+(item.kind==='armor'?'방어구':'무기'):'주변 탐색'}</span><h3>${item?item.name:'발견한 장비가 없습니다'}</h3>${item?`<strong>${item.kind==='armor'?'+':''}${money(item.power)} <small>POWER</small></strong>`:''}<p>${e.outcome==='FOUND'?'미니 인벤토리에 보관했습니다.<br>원하는 장비를 직접 장착하세요.':e.outcome==='DUPLICATE'?'이미 보유한 장비를 발견했습니다.<br>중복 장비는 추가되지 않습니다.':'다음 탐색에서 다른 흔적을 찾아보세요.'}</p><footer>탐색 결과는 저장되었습니다. 재접속해도 결과가 바뀌지 않습니다.</footer></div>`;
}
