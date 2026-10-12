import {COOP_SPECIES} from '/shared/cooperative-roster-v3.mjs?v=20261012-random-v3';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function rosterMarkup(encounter){
 if(!encounter)return '';
 const image=(s,cls='')=>`<img class="${cls}" src="${esc(s.art)}" alt="${esc(s.name)}" decoding="async">`;
 return `<header><div><small>이번 방의 정찰 정보</small><h3>적을 확인하고 조합하세요</h3></div><span>방 생성 시 확정</span></header><div class="coop-scout-grid"><article class="coop-scout-boss">${image(encounter.boss)}<div><small>03 · 최종 보스</small><h4>${esc(encounter.boss.name)}</h4><p>${esc(encounter.boss.hint)}</p></div></article><div class="coop-scout-side"><article class="coop-scout-elite">${image(encounter.elite)}<div><small>02 · 준보스</small><h4>${esc(encounter.elite.name)}</h4><p>${esc(encounter.elite.hint)}</p></div></article><div class="coop-scout-mobs">${encounter.mobs.map(s=>`<article>${image(s)}<div><b>${esc(s.name)}</b><small>${esc(s.hint)}</small></div></article>`).join('')}</div></div></div>`;
}
export function automaticGuide(index,configuration,encounter){
 if(index===0)return `<p><b>몬스터 3기 → 준보스 → 최종 보스</b>를 ${configuration.maxBattleSeconds}초 안에 격파하세요. 몬스터 5종과 보스 4종 중 방마다 다른 적을 만납니다.</p><p>방 생성 시 적 구성이 확정됩니다. 출전 전에 정찰 정보를 보고 동료의 카드·용병과 역할을 맞추세요. 준보스와 최종 보스는 서로 다른 종류입니다.</p><p><b>전투는 끝까지 자동으로 진행됩니다.</b> 단계 사이에 체력·방벽·스킬 사용 횟수와 대기 시간이 이어집니다. 별도 회복이나 부활은 없습니다.</p>${encounter?`<p>이번 최종 보스: <b>${esc(encounter.boss.name)}</b> · ${esc(encounter.boss.hint)}</p>`:''}`;
 if(index===1)return `<p><b>보스의 특성에 맞는 카드와 용병을 준비하세요.</b> 전투 중 조작 버튼 없이 실제 공격·보호·회복·약화 효과로 맞섭니다.</p><ul>${COOP_SPECIES.filter(s=>s.kind==='BOSS').map(s=>`<li><b>${esc(s.name)}</b><p>${esc(s.hint)}</p></li>`).join('')}</ul><p>철벽은 방벽이 유지되는 동안 피해를 줄입니다. 방벽 파괴나 실제 방어 약화로 대응하세요. 역병의 독·감전 약화는 정화할 수 있고, 회복 억제는 보스의 재생을 줄입니다.</p><p>적의 기본 공격은 살아 있는 분대를 번갈아 노립니다. 각 분대의 생존과 화력을 함께 준비하세요.</p>`;
 return null;
}
