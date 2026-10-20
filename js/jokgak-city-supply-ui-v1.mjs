import {cityPlace} from '../shared/jokgak-city-v1.mjs';
import {CITY_SUPPLY_WEAPONS,citySupplyWeapon} from '../shared/jokgak-city-supply-v1.mjs';
const ART='/assets/ui/jokgak-city/supply-20261018/';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
export const citySupplyDrops=state=>state?.supply&&state.supply.epoch===state.shift?.id&&state.supply.mode===state.mode?state.supply.drops:[];
export function citySupplyExpiryLabel(state,code,now=state?.serverNow||Date.now()){
  const expiresAt=state?.mine?.supplyWeaponExpiresAt?.[code];
  return expiresAt?`<small data-supply-weapon-clock="${expiresAt}">남은 사용 시간 ${time(expiresAt-now)}</small>`:'';
}
export function citySupplyArt(code,compact=false){
  const w=citySupplyWeapon(code);if(!w)return '';
  const file=code==='GROZA'?'groza':'golden-aks';
  return `<span class="jc-item-art jc-item-art--equipment" data-city-item-art="${code}"><img src="${ART+file}-${compact?256:768}.webp" alt="${w.name}" width="768" height="768" decoding="async" draggable="false"></span>`;
}
export function citySupplyBlocked(state,d,now,busy){
  const m=state?.mine;
  return busy?'처리 중':d.endsAt<=now?'결과 정산 중':!m?.active?'도시 입장 후 참여':m.location!==d.location?'낙하 지점으로 이동하세요':m.deadUntil>now?'부활 후 참여':m.jailedUntil>now?'구금 해제 후 참여':m.hospitalRequired?'병원 진료 후 참여':m.restUntil>now?'휴식 종료 후 참여':m.nextActionAt>now?'행동 대기 중':d.holder?.userId===m.userId?'보급상자 지키는 중':'';
}
export function citySupplyMap(state,now){
  return citySupplyDrops(state).filter(d=>d.status==='OPEN'&&d.endsAt>now).map(d=>{const p=cityPlace(d.location);return `<button class="jc-supply-pin" data-city-place="${d.location}" data-supply-pin="${esc(d.id)}" style="left:${p.x+10}%;top:${p.y+2}%" aria-label="${p.name} 보급상자, 남은 시간 ${time(d.endsAt-now)}"><img src="${ART}supply-crate-256.webp" alt=""><span>보급상자 <b data-supply-clock="${d.endsAt}">${time(d.endsAt-now)}</b></span></button>`;}).join('');
}
export function citySupplyPanel(state,now,busy){
  if(!state?.supply)return '';
  const drops=citySupplyDrops(state),open=drops.filter(d=>d.status==='OPEN');
  return `<section class="jc-supply-panel" aria-label="보급상자 쟁탈전"><header><div><small>AIR DROP / FIELD CONTEST</small><h3>보급상자 쟁탈전</h3></div><span>6시간 회차 · 무작위 2~3회</span></header>
  ${open.length?open.map(d=>{const reason=citySupplyBlocked(state,d,now,busy),remote=state.mine?.active&&state.mine.location!==d.location;return `<article class="jc-supply-contest" data-supply-contest="${esc(d.id)}"><img class="jc-supply-crate" src="${ART}supply-crate-256.webp" alt="보급상자"><div class="jc-supply-copy"><small>${d.number}차 보급 · ${cityPlace(d.location).name}</small><h4>${esc(d.holder?.nickname||'주인 없는 보급상자')}</h4><p>${d.holder?'현재 보유자':'낙하 지점에서 먼저 확보하세요'} · <b data-supply-clock="${d.endsAt}">${time(d.endsAt-now)}</b></p></div><button class="jc-supply-button" ${remote?`data-city-place="${d.location}"`:`data-city-supply="${esc(d.id)}"`} ${!remote&&reason?'disabled':''}>${remote?'낙하 지점 보기':reason||(!d.holder?'보급상자 확보':'쟁탈전 참여')}</button></article>`;}).join(''):`<div class="jc-supply-wait"><img src="${ART}supply-crate-256.webp" alt=""><div><b>도시 관제망이 보급 신호를 기다립니다</b><p>낙하하면 지도와 보급 속보로 장소를 알려드립니다.</p></div></div>`}
  <div class="jc-supply-prizes">${CITY_SUPPLY_WEAPONS.map(w=>`<button data-city-gear="${w.code}" aria-label="${w.name} 보급 무기 정보">${citySupplyArt(w.code,true)}<span><b>${w.name}</b><small>전투력 ${w.power.toLocaleString('ko-KR')} · 50%</small></span></button>`).join('')}</div>
  <p class="jc-supply-help">낙하 후 10분간 쟁탈 · 종료 시 보유자가 무기 1종 획득<br>이동·퇴장·사망·구금 시 상자를 내려놓습니다. 무기는 획득 후 45분이 지나면 소멸합니다. 회차가 먼저 끝나면 함께 소멸합니다.</p>
  ${drops.some(d=>d.status!=='OPEN')?`<ol class="jc-supply-history">${drops.filter(d=>d.status!=='OPEN').map(d=>`<li><span>${d.number}차 · ${cityPlace(d.location).name}</span><b>${d.winner?esc(d.winner.nickname)+' · '+esc(d.weapon?.name):'보유자 없이 종료'}</b></li>`).join('')}</ol>`:''}</section>`;
}
export function citySupplyNews(n){
  const area=cityPlace(n.location)?.name||'도시',won=n.kind==='AWARDED';
  return `<button class="jc-supply-news" data-city-place="${n.location}" data-broadcast-id="${esc(n.id)}"><img src="${ART}supply-crate-256.webp" alt=""><span><small>도시 보급 속보</small><b>${n.kind==='DROP'?area+'에 보급상자 낙하':won?esc(n.winner?.nickname)+' 님 최종 확보':'보급 쟁탈전 종료'}</b><em>${n.kind==='DROP'?'10분 쟁탈 시작 · '+area+'에서 참여':won?area+' · '+esc(n.weapon?.name)+' 획득':area+' · 최종 보유자 없음'}</em></span><i aria-hidden="true">↗</i></button>`;
}
export function citySupplyReceipt(supply){
  if(!supply)return '';
  return `<div class="jc-supply-receipt">${supply.weapon?citySupplyArt(supply.weapon.code,true):`<img src="${ART}supply-crate-256.webp" alt="보급상자">`}<div><small>SUPPLY CONTEST</small><b>${supply.kind==='AWARDED'?esc(supply.weapon?.name)+' 획득':supply.kind==='TAKEN'?esc(supply.holder?.nickname)+' 님이 보급상자를 빼앗았습니다':supply.kind==='CLAIMED'?esc(supply.holder?.nickname)+' 님이 보급상자를 확보했습니다':esc(supply.holder?.nickname)+' 님이 상자를 지켰습니다'}</b><p>${supply.kind==='AWARDED'?(supply.duplicate?'이미 보유한 무기입니다. 수량과 사용 시간은 늘어나지 않습니다.':'도시 인벤토리에서 장착하세요. 획득 후 45분 또는 회차 종료 시 소멸합니다.'):esc(supply.holder?.nickname||'보유자 없음')+' · 최초 10분 종료까지 지켜야 획득합니다.'}</p></div></div>`;
}
export function citySupplyGearDetail(state,code){
  const w=citySupplyWeapon(code);if(!w)return '';
  return `<div class="jc-supply-detail"><small>AIR DROP / EXCLUSIVE WEAPON</small>${citySupplyArt(code)}<h3>${w.name}</h3><strong>${w.power.toLocaleString('ko-KR')}<small>도시 전투력</small></strong><p>보급상자 최종 보유자에게 50% 확률로 지급됩니다.<br>시장 구매·지역 탐색으로는 획득할 수 없습니다.</p>${citySupplyExpiryLabel(state,code)}<footer>무기 1개 장착 · 획득 후 45분 또는 회차 종료 시 소멸</footer></div>`;
}
export const citySupplyRules=()=>'<li><b>보급상자 쟁탈전</b><p>6시간 회차마다 무작위 장소에 2~3회 보급상자가 낙하합니다. 낙하 지점에서 확보하거나 보유자에게 쟁탈전을 걸어 승리하면 빼앗습니다. 무승부는 보유자가 지키며 최초 낙하부터 10분 제한은 연장되지 않습니다. 이동·퇴장·사망·구금으로 지점을 떠나면 내려놓습니다. 종료 시 보유자 1명만 그로자 또는 황금 AKS(각 50%, 전투력 각각 70만)를 받습니다. 쟁탈 교전은 도시 체력 피해와 대기를 적용하며 일반 공격의 현금 강탈·행동 보상·처치/공격 실적에는 포함하지 않습니다. 보급 무기는 획득 후 45분이 지나면 장착 여부·접속 상태와 관계없이 소멸하며, 회차가 먼저 끝나면 함께 소멸합니다. 보유 중 같은 무기를 다시 얻어도 수량과 사용 시간은 늘어나지 않습니다.</p></li>';
