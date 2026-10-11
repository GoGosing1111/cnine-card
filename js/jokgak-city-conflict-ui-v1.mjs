import {CITY_PLACES,cityPlace} from '../shared/jokgak-city-v1.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value||0).toLocaleString('ko-KR');
const target='<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="3"/><path d="M16 1v8m0 14v8M1 16h8m14 0h8"/></svg>';
export const cityRiots=(state,now)=>state?.conflicts&&state.conflicts.epoch===state.shift?.id&&state.conflicts.mode===state.mode?(state.conflicts.riots||[]).filter(r=>r.expiresAt>now):[];
export function cityRiotPin(state,location,now){const r=cityRiots(state,now).find(r=>r.location===location);return r?'<span class="jc-riot-pin-tag"><i></i>폭동지역</span>':'';}
export function cityRiotMap(state,now){
 const riots=cityRiots(state,now);if(!riots.length)return '';
 return `<svg class="jc-riot-zones" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${riots.map(r=>{const p=cityPlace(r.location);return p?`<polygon points="${p.shape}" data-intensity="${r.intensity}"/>`:'';}).join('')}</svg><div class="jc-riot-atmosphere" aria-hidden="true">${riots.map(r=>{const p=cityPlace(r.location);return p?`<span class="jc-riot-flare" style="left:${p.labelX}%;top:${p.labelY}%" data-intensity="${r.intensity}"><i></i><i></i><i></i><b></b><b></b><b></b></span>`:'';}).join('')}</div>`;
}
export function cityRiotSummary(state,now){
 const riots=cityRiots(state,now);if(!riots.length)return '';
 return `<div class="jc-riot-summary"><span><i></i><b>폭동지역 ${riots.length}곳</b><small>교전 밀집</small></span><div>${riots.map(r=>`<button data-city-place="${r.location}">${cityPlace(r.location).name}<strong>${r.battles}회</strong><small>최근 ${r.windowMs/60000}분</small></button>`).join('')}</div></div>`;
}
export function cityBountyTag(player,large=false){
 if(!player?.bounty)return '';
 return `<span class="jc-bounty-tag ${large?'is-large':''}">${target}<b>현상금 ${money(player.bounty.amount)}원</b>${large?'<small>처치 시 지급</small>':''}</span>`;
}
export function cityBountyBoard(state,now){
 if(!state||state.conflict?.bounty?.enabled===false)return '';
 const rows=state.conflicts?.epoch===state.shift?.id&&state.conflicts?.mode===state.mode?state.conflicts.bounties||[]:[];
 return `<section class="jc-wanted-board" aria-label="도시 현상수배"><header><div><small>CITY INTELLIGENCE / WANTED</small><h3>도시 현상수배 <b>${rows.length}</b></h3></div><span>처치자에게 현금 지급</span></header>${rows.length?`<div class="jc-wanted-list">${rows.map(row=>`<button class="jc-wanted-ticket" data-city-place="${row.location}" title="${esc(row.nickname)} · ${money(row.amount)}원 · ${cityPlace(row.location)?.name||'도시'} 지역 보기"><span class="jc-wanted-seal">${target}<small>WANTED</small></span><span class="jc-wanted-copy"><b>${esc(row.nickname)}</b><small>이번 회차 ${row.kills}명 처치</small><strong>${money(row.amount)}<em>원</em></strong><span>${row.deadUntil>now?'부활 대기':row.jailedUntil>now?'구금 중':cityPlace(row.location)?.name||'도시'}<i>지역 보기 ↗</i></span></span></button>`).join('')}</div>`:'<div class="jc-wanted-empty">'+target+'<p>현재 발령된 현상수배가 없습니다.<small>처치 실적이 쌓인 유저에게 서버가 현상금을 붙입니다.</small></p></div>'}<footer>일반 공격에서 도시 체력 0으로 처치 · 방어 중 처치 포함 · 체포 보상 제외</footer></section>`;
}
export function cityBountyReceipt(bounty,viewerId){
 const c=bounty?.claimed;if(!c)return '';
 return `<div class="jc-bounty-receipt"><small>BOUNTY COMPLETE</small><b>${esc(c.targetName)} 현상수배범 사망</b><span>${Number(viewerId)===c.killerId?'내 현상금 수령':esc(c.killerName)+' 님 수령'} <strong>+${money(c.amount)}원</strong></span></div>`;
}
export const CITY_BOUNTY_NOTICE_MS=7000;
export function cityConflictRules(state){
 const c=state?.conflict;if(!c)return '';
 return `${c.riot.enabled?`<li><b>폭동지역</b><p>최근 ${c.riot.windowMs/60000}분 동안 교전 ${c.riot.minBattles}회 이상 발생한 지역은 붉은 경계와 폭동지역 표식으로 표시합니다. 교전이 줄어들면 자동 해제됩니다.</p></li>`:''}${c.bounty.enabled?`<li><b>현상수배와 처치 보상</b><p>이번 회차 ${c.bounty.minKills}명 이상 처치하면 이후 처치마다 ${c.bounty.selectionPercent}% 확률로 현상수배가 발령됩니다. 현상금은 ${c.bounty.amounts.map(n=>money(n)+'원').join(' · ')} 중 하나입니다. 일반 공격에서 수배범의 도시 체력을 0으로 만든 처치자가 받으며 방어 중 처치도 포함합니다. 체포와 단순 승리는 지급 대상이 아닙니다. 수배 완료 후 ${c.bounty.cooldownMs/60000}분 동안 다시 선정하지 않으며 회차가 끝나면 처치 실적과 수배가 초기화됩니다.</p></li>`:''}`;
}
export function cityBountyNoticeMarkup(notice,now){
 if(!notice)return '';
 const cleared=notice.kind==='CLAIMED';
 return `<div class="jc-wanted-notice ${cleared?'is-cleared':''}" data-bounty-notice-id="${esc(notice.id)}" style="--elapsed:-${Math.max(0,now-notice.shownAt)}ms"><div class="jc-wanted-notice-mark">${target}</div><div class="jc-wanted-notice-copy"><small>${cleared?'BOUNTY COMPLETE · 수배 완료':'CITY ALERT · 현상수배 발령'}</small><b>${esc(cleared?notice.targetName:notice.nickname)}${cleared?' 현상수배범 사망':' 현상수배'}</b><p>${cleared?esc(notice.killerName)+' 님 처치 · 현상금 지급':'처치 보상 · 현재 '+(cityPlace(notice.location)?.name||'도시')}</p></div><strong>${cleared?'+':''}${money(notice.amount)}<small>원</small></strong><i class="jc-wanted-notice-progress"></i></div>`;
}
