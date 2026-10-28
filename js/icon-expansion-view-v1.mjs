import {preparedIconForCode} from '../shared/icon-expansion-v1.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function preparedIconDescriptionHtml(selection){
 const card=preparedIconForCode(selection?.code);if(!card)return '';
 const description={RETURN_OATH:'쓰러진 아군에게 귀환 서약을 겁니다. 봉순의 5행동 안에 지정한 적을 처치하면 체력 35%로 부활합니다. 단일 보스는 최대 체력의 10%만큼 실제 피해를 주는 조건입니다. 전투당 최대 2회, 같은 아군은 한 번만 부활합니다.',CROWN_USURP:'적의 강화 효과를 빼앗아 자신에게 이전합니다.',AUTONOMOUS_WEAPON:'별도의 체력을 가진 병기를 소환합니다. 병기는 독립적으로 행동하고 공격을 받으며, 주인이 쓰러지면 소멸합니다.',SKILL_ADVANCE:'아군 ICON의 남은 스킬 대기를 앞당겨 다음 본인 행동에 사용하게 합니다. 앞당긴 만큼 그다음 재사용 대기가 늘어나며, 추가 행동을 만들지 않습니다.'}[card.techniqueCode]||'전용 스킬을 준비하고 있습니다.';
 return `<section class="ir-profile is-compact" data-icon-role="${esc(card.code)}"><header><div><small>ICON · ${card.acquisitionEnabled?'제작 가능':'제작 잠금'}</small><h3>${esc(card.name)} <span>${esc(card.techniqueName)}</span></h3></div></header><div class="ir-abilities"><article><small>SIGNATURE · 전용 스킬</small><h4>${esc(card.techniqueName)}</h4><p>${description}</p></article><article><small>BATTLE RESOURCE · 전투 리소스</small><h4>SD · 스킬</h4><p><a href="${esc(card.preview)}" target="_blank" rel="noopener">${esc(card.name)} SD와 스킬 미리보기 ↗</a></p></article></div>${card.acquisitionEnabled?'':'<p class="ir-disabled">현재 제작이 잠겨 있습니다.</p>'}</section>`;
}
