export const POLICY = Object.freeze({
  revision: 'mercenary-advancement-20261113-v1',
  minimumLevel: 16,
  ranks: Object.freeze(['SS', 'SSS']),
  cost: Object.freeze({ coin: '10000000000000', MASTER_STAR: '50000000' })
});
const rows=[
 ['vanguard','선봉장','공격','첫 공격을 강하게','전투에서 자신의 첫 공격 피해가 40% 증가합니다.','첫 공격 1회'],
 ['duelist','결투가','공격','한 명을 끝까지','같은 적을 연속 공격하면 두 번째 공격부터 피해가 15% 증가합니다. 대상을 바꾸면 초기화됩니다.','동일 대상 연속 공격'],
 ['executioner','처형자','공격','약해진 적을 마무리','체력이 30% 이하인 적에게 주는 피해가 25% 증가합니다.','적 체력 30% 이하'],
 ['berserker','광전사','공격','위기에서 더 강하게','자신의 체력이 50% 이하일 때 주는 피해가 20% 증가합니다.','자신의 체력 50% 이하'],
 ['breaker','파괴자','공격','보호막을 깨뜨리기','적 보호막에 주는 피해가 50% 증가합니다.','보호막 공격'],
 ['combo','연격자','공격','세 번마다 추가타','공격 3회마다 주 대상에게 30% 위력의 추가타를 가합니다. 추가타로 다시 발동하지 않습니다.','공격 행동 3회마다'],
 ['vampire','흡혈귀','생존','공격하며 체력 회복','공격으로 피해를 주면 자신의 최대 체력 5%를 회복합니다.','공격 피해 발생'],
 ['avenger','복수자','공격','맞은 뒤 강한 반격','공격 피해를 받으면 다음 공격 피해가 20% 증가합니다. 충전은 중첩되지 않습니다.','피격 충전 → 다음 공격'],
 ['shield-knight','방패기사','생존','초반 세 번을 버티기','처음 받는 공격 3회의 피해를 30% 줄입니다. 남은 횟수만큼 방패가 표시됩니다.','받는 공격 3회'],
 ['barrier','결계사','생존','보호막과 함께 시작','전투 시작 시 자신의 최대 체력 20%만큼 보호막을 얻습니다.','전투 시작'],
 ['undying','불사자','생존','한 번 더 살아남기','전투당 한 번, 치명 피해를 막고 최대 체력 10%로 생존합니다.','치명 피해 · 전투당 1회'],
 ['regenerator','재생자','생존','꾸준한 자가 회복','자신의 행동이 끝날 때마다 최대 체력 4%를 회복합니다.','자신의 행동 종료'],
 ['healer','치유사','지원','가장 위급한 아군 치유','행동 종료마다 자신을 포함해 체력 비율이 가장 낮은 아군 1명의 최대 체력 3%를 회복합니다.','자신의 행동 종료'],
 ['guardian','수호자','지원','아군에게 보호막 전달','자신의 행동 3회마다 체력 비율이 가장 낮은 다른 아군에게 대상 최대 체력 12%의 보호막을 부여합니다.','자신의 행동 3회마다'],
 ['cleanser','정화사','지원','해로운 효과 해제','행동 시작 시 해로운 효과가 있는 아군 1명의 해제 가능한 효과 1개를 제거합니다.','자신의 행동 시작'],
 ['commander','지휘관','지원','아군 전체 화력 강화','자신이 살아 있는 동안 아군 전체의 공격력이 8% 증가합니다. 같은 지휘 효과는 중첩되지 않습니다.','생존 중 상시']
];
export const ROLES=Object.freeze(rows.map(([id,name,group,tagline,description,trigger])=>Object.freeze({id,name,group,tagline,description,trigger})));
export const ROLE_BY_ID=new Map(ROLES.map(role=>[role.id,role]));
export function amount(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw Error('재화 정보를 확인할 수 없습니다. 다시 불러와 주세요.');
  }
  return BigInt(value);
}

const units = ['', '만', '억', '조', '경', '해'];
export function formatAmount(value) {
  let left = amount(String(value));
  if (!left) return '0';
  const parts = [];
  for (let i = 0; left > 0n; i++, left /= 10000n) {
    const group = left % 10000n;
    if (group) parts.unshift(group.toLocaleString('ko-KR') + (units[i] ?? `×10^${4*i}`));
  }
  return parts.join(' ');
}
export function eligibility(card){
 if(!card||!(card.totalCopies>0))return '보유한 용병만 전직할 수 있습니다.';
 if(!POLICY.ranks.includes(card.rank))return 'SS급 이상 용병부터 전직할 수 있습니다.';
 if(!Number.isInteger(card.growth?.level)||card.growth.level<POLICY.minimumLevel)return '용병 16레벨부터 전직할 수 있습니다.';
 return '';
}
export function quote(snapshot, code, roleId) {
  const card = snapshot.cards.find(entry => entry.code === code);
  const role = ROLE_BY_ID.get(roleId);
  let unavailable = eligibility(card);
  if (!unavailable && !role) unavailable = '전직을 선택해 주세요.';
  if (!unavailable && card.advancement?.id === roleId) unavailable = '이미 선택한 전직입니다.';
  const missing = {};
  for (const [currency, cost] of Object.entries(POLICY.cost)) {
    const difference = amount(cost) - amount(snapshot.wallet[currency]);
    missing[currency] = difference > 0n ? difference : 0n;
  }
  const insufficient = missing.coin > 0n || missing.MASTER_STAR > 0n;
  return { card, role, change: Boolean(card?.advancement?.id), unavailable, missing, insufficient,
    canSubmit: !unavailable && !insufficient, cost: POLICY.cost };
}
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
