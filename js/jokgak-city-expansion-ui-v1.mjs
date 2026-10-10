import {CITY_WEAPONS,defaultCityArsenal,defaultCityFacilities} from '../shared/jokgak-city-expansion-v1.mjs';
import {cityItemArt} from './jokgak-city-item-art-v1.mjs?v=20261011-items1';
const money=n=>Number(n||0).toLocaleString('ko-KR');
const clock=ms=>{const s=Math.ceil(Math.max(0,ms)/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
export function cityWeaponIcon(code){
 const d={PIPE:'M6 21 4 19 15 8V3h5v7H18L7 21Zm9-13 3 2',PISTOL:'M2 5h19v6h-7l-1 3H9l-2 7H3l3-11H2Zm12 6v4h-4M18 5V3',RIFLE:'M2 7h6l2-2h8v3h5v3h-9v3h-3l2 7H9l-2-9-5 3Zm8-2V2h6v3M19 8v3'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="${d[code]||'M4 18h16M8 17V7a4 4 0 0 1 8 0v10'}"/></svg>`;
}
const locked=(m,now,busy)=>busy||!m?.active||m.deadUntil>now||m.jailedUntil>now||m.hospitalRequired||m.nextActionAt>now;
export function cityWeaponProfile(state){
 const m=state?.mine;if(!m?.active)return '';
 return `<section class="jc-city-loadout">${cityItemArt(m.weapon?.code,true)||`<span>${cityWeaponIcon()}</span>`}<div><small>CITY LOADOUT · 도시 전용</small><b>${m.weapon?.name||'맨손'} <em>${m.weapon?.code?'장착 중':'무기 미장착'}</em></b><p>계정 성장 보정 · 편성 전체 전투력</p></div><strong>${money(m.cityPower||state.arsenal?.basePower||100000)}<small>POWER</small></strong><button data-city-place="MARKET">시장 무기상 ↗</button></section>`;
}
export function cityWeapons(state,selected,now,busy){
 if(!state||selected!=='MARKET')return '';
 const cfg=state.arsenal||defaultCityArsenal(),m=state.mine,here=m?.active&&m.location==='MARKET';
 return `<section class="jc-armory" aria-label="시장 무기상"><header><small>MARKET / ARMS DEALER</small><h3>거리의 무기상</h3><p>도시에서는 무기가 편성 전체의 힘을 결정합니다.</p></header><div>${cfg.weapons.map(w=>{const meta=CITY_WEAPONS.find(x=>x.code===w.code),owned=m?.ownedWeapons?.includes(w.code),equipped=m?.weapon?.code===w.code;return `<article class="jc-weapon ${equipped?'is-equipped':''}">${cityItemArt(w.code)}<div class="jc-weapon-copy"><small>${meta.tag}</small><b>${meta.name}${equipped?'<em>장착 중</em>':''}</b><p>도시 전투력 <strong>${money(w.power)}</strong></p><span>${money(w.price)}원${owned?'<em>보유 중</em>':''}</span></div><button data-city-action="${owned?'equipWeapon':'buyWeapon'}" data-city-product="${w.code}" ${locked(m,now,busy)||!here||!w.enabled||equipped||!owned&&m?.cash<w.price?'disabled':''}>${!w.enabled?'이용 중지':equipped?'장착 중':!here?'이동 후 이용':owned?'장착':m.cash<w.price?'현금 부족':'구매'}</button></article>`;}).join('')}</div><footer>맨손 ${money(cfg.basePower)} · 구매 후 미니 인벤토리에서 장착하세요.<br>일반 PVP·PVE 스펙과 장비는 유지됩니다.</footer></section>`;
}
export function cityMiniInventory(state,now,busy){
 const m=state?.mine;if(!m?.active)return '';
 const owned=(state.arsenal||defaultCityArsenal()).weapons.filter(w=>m.ownedWeapons?.includes(w.code));
 return `<section class="jc-mini-inventory" aria-label="미니 인벤토리"><header><div><small>PERSONAL INVENTORY</small><h3>미니 인벤토리 <b>${owned.length} / 3</b></h3></div><button data-city-place="MARKET">무기 구매 ↗</button></header><div class="jc-mini-weapons">${owned.length?owned.map(w=>{const meta=CITY_WEAPONS.find(x=>x.code===w.code),equipped=m.weapon?.code===w.code;return `<article class="${equipped?'is-equipped':''}">${cityItemArt(w.code,true)}<b>${meta.name}</b><small>${money(w.power)} POWER</small><em>${equipped?'장착 중':'보유 중'}</em><button data-city-action="${equipped?'unequipWeapon':'equipWeapon'}" ${equipped?'':`data-city-product="${w.code}"`} ${locked(m,now,busy)||!w.enabled?'disabled':''}>${equipped?'해제':'장착'}</button></article>`;}).join(''):'<p>아직 무기가 없습니다.<br>시장에서 구매한 무기가 여기에 보관됩니다.</p>'}</div></section>`;
}
export function cityFacilities(state,selected,now,busy){
 const m=state?.mine;if(!m?.active)return '';
 const cfg=state.facilities||defaultCityFacilities();
 if(selected==='HOSPITAL'&&m.location==='HOSPITAL'&&!m.deadUntil)return `<section class="jc-facility-banner"><small>HOSPITAL / STAY POLICY</small><b>${m.hospitalStaff?'의료진 상주 가능':`병원 체류 · <span data-city-stay-clock="hospitalLeaveAt">${clock(m.hospitalLeaveAt-now)}</span>`}</b><p>${m.hospitalStaff?'의사·간호사는 병원 체류 제한에서 제외됩니다.':`${cfg.hospital.maxStayMs/60000}분 후 다른 장소로 자동 이동합니다. 필요한 진료를 먼저 받아 주세요.`}</p></section>`;
 if(selected!=='MOTEL')return '';
 const resting=m.restUntil>now,remaining=m.motelNextAt>now&&!resting,here=m.location==='MOTEL';
 return `<section class="jc-motel" aria-label="모텔 개인 객실"><div class="jc-motel-sign"><small>PRIVATE ROOM</small><strong>MOTEL<span>REST & RECOVER</span></strong><i>${resting?'OCCUPIED':'VACANCY'}</i></div><h3>${resting?'지금은 나만의 시간':'도시의 소음에서 잠시 벗어나세요'}</h3><p>개인 객실에서는 공격·검문·체포를 받지 않습니다.<br>휴식 중 다른 사람에게 행동하려면 먼저 퇴실하세요.</p><div class="jc-motel-time"><span>${resting?'남은 휴식':remaining?'재이용까지':'최대 휴식'}</span><b data-city-stay-clock="${resting?'restUntil':remaining?'motelNextAt':'none'}">${resting?clock(m.restUntil-now):remaining?clock(m.motelNextAt-now):cfg.motel.stayMs/60000+'분'}</b></div><button class="jc-primary" data-city-action="${resting?'checkout':'rest'}" ${busy||!here||!resting&&(remaining||locked(m,now,busy)||!cfg.motel.enabled)?'disabled':''}>${resting?'일찍 퇴실하기':!here?'모텔 이동 후 입실':remaining?'재이용 대기':'개인 객실 입실'}</button><small>퇴실 후 ${cfg.motel.cooldownMs/60000}분 대기 · 종료 시 집으로 이동<br>입실은 무료이며 도시 체력은 기존 자동 회복 규칙을 따릅니다.</small></section>`;
}
