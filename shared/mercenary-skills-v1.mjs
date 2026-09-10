// Authored skill proposals and offline rehearsal only. Never imported by live battle routes.
export const SKILL_VERSION = 2;
export const SKILL_STORAGE_KEY = 'cnine.mercenarySkills.draft.v1';
const definition = (id, code, name, role, target, mechanic, trigger, effect, counterplay, bossRule, visual, steps) => ({
  id, code, name, role, target, mechanic, trigger, effect, counterplay, bossRule, visual, steps,
  status: 'DRAFT', runtimeEnabled: false,
  balance: {status: 'PENDING_REVIEW', damageRatio: null, cooldownTurns: null, cost: null},
  procRule: '추가 타격·반격·지휘 보너스는 스킬 발동 자원이 되지 않는다. 재귀 발동과 처치 초기화는 금지한다.'
});
const art = (asset, motion, windup, impacts, duration, color) => ({asset, motion, windup, impacts, duration, color});
export const MERCENARY_SKILLS = [
  {...definition('MS-021', 'V-021', '종언의 사건지평선', 'VANGUARD', 'FRONT_GROUP', 'RIFT_MARK_DETONATION',
    '오메가-X 전용. 살아 있는 적 전열 최대 2명을 고정하고 성좌 균열을 준비한다. 전열이 없으면 단일 표적만 지정한다.',
    '첫 검격이 맞은 생존 표적에 균열을 새긴다. 재차 대검을 내리쳐 남은 균열만 한 번 폭발시킨다. 두 단계 각각의 전체 피해 예산을 처음 지정한 대상 수로 나눈다.',
    '두 타격 사이 균열을 정화하거나 오메가를 제압한다. 사라진 표적의 몫은 이전하지 않는다. 성공·실패와 무관하게 과부하가 남아 다음 기본 공격 준비가 늦어진다.',
    '보스는 단일 대상으로 같은 예산을 적용한다. 최대 HP 비례·즉사·강제 이동·방어 무시를 추가하지 않는다. 균열은 해제 가능한 공격 표식이며 제어 면역을 우회하는 스턴이 아니다.',
    art('omega-event-horizon', 'EVENT_HORIZON', .65, [1.05, 2.25], 4.2, '#ffc56b'),
    ['전열 고정 · 성좌 압축', '첫 검격으로 균열 부여', '남은 균열만 종언 폭발', '과부하 · 다음 기본 공격 지연']),
    exclusivity: {code: 'V-021', rank: 'SSS', transferable: false}},
  definition('MS-003', 'V-003', '황금 구명선', 'GUARDIAN', 'ALLY_LOW_HP', 'INTERCEPT_ONE_HIT',
    'HP 비율이 가장 낮은 아군에게 단일 직접 공격이 예고되면 호위한다.',
    '첫 타격의 피해 일부를 솔바인이 대신 받는다. 피해 총량은 늘지 않으며 한 번 막으면 연결이 끊어진다.',
    '광역·지속 피해는 가로채지 못한다. 호위자를 먼저 제압하거나 연타로 보호 횟수를 소모한다.',
    '보스의 일반 단일 공격만 허용한다. 광역 기믹·즉사·고정 피해는 이전하지 않는다.',
    art('golden-lifeline', 'INTERCEPT', .55, [1.05], 2.8, '#efc66b'), ['위기 아군 지정', '황금 방벽 연결', '피해 분담 1회', '호위 연결 소멸']),
  definition('MS-004', 'V-004', '루비 최후통첩', 'SNIPER', 'BACK_THREAT', 'LOCKED_THREAT_SHOT',
    '스킬 사용 시 살아 있는 후열 중 전투 시작 공격력이 가장 높은 적을 고정한다.',
    '조준을 드러낸 뒤 고정 표적을 한 발로 타격한다. 후열 우회는 이 기술에만 적용한다.',
    '준비 중 제압하거나 표적을 보호한다. 표적이 사라지면 탄을 다른 적에게 순간 이전하지 않는다.',
    '후열이 없는 보스전에서는 전열 단일로 전환한다. 조준 후 대상 상실 시 취소한다.',
    art('ruby-warrant', 'PRECISION', 1.2, [1.6], 3.0, '#ef6680'), ['핵심 위협 고정', '붉은 조준 예고', '정밀탄 1회', '조준 해제']),
  definition('MS-006', 'V-006', '흑철 해체', 'VANGUARD', 'FRONT_ENEMY', 'BREAK_ARMOR_WINDOW',
    '적 전열 우선 규칙으로 단단한 방어선과 맞붙는다.',
    '방호를 깨는 첫 베기로 보호막을 우선 소모하고 짧은 방어 약화 창을 연다. 후속 아군의 정면 공격을 돕는다.',
    '접근을 끊거나 약화를 해제한다. 방호가 없는 적에게는 파쇄 추가 이득이 없다.',
    '보스 방어를 0으로 만들지 않는다. 약화 상한·중첩·지속은 별도 밸런스 검수 대상이다.',
    art('iron-unmaking', 'FRACTURE', .6, [.95, 1.35], 2.8, '#d9aa7b'), ['중검 준비', '보호막 균열', '약점 창 생성', '근접 복귀']),
  definition('MS-005', 'V-005', '탄착 교정', 'MARKSMAN', 'FRONT_ENEMY', 'SAME_TARGET_CALIBRATION',
    '같은 표적에 연속으로 명중해야 교정이 쌓인다.',
    '세 번의 점사를 한 표적에 유지하면 마지막 탄이 교정 보너스를 얻는다. 표적 변경·빗나감은 교정을 초기화한다.',
    '도발·회피·표적 교체로 연속 명중을 끊는다. 교정을 다른 적에게 넘길 수 없다.',
    '같은 단일 보스에는 유지하기 쉽지만 보호막·회피를 무시하지 않는다.',
    art('emerald-calibration', 'CONVERGE', .45, [.8, 1.25, 1.7], 2.7, '#60d4ab'), ['초탄 관측', '탄착 보정', '동일 표적 보너스', '교정 소모']),
  definition('MS-013', 'V-013', '일제 사격 명령', 'SUPPORT', 'ALLY_TEAM', 'NEXT_BASIC_ORDER',
    '살아 있는 일반 카드 5장과 용병에게 한 번씩 지휘권을 건다.',
    '각자의 다음 기본 공격에만 지휘 보너스를 더하고 소모한다. 새 행동을 생성하거나 즉시 전원이 공격하지 않는다.',
    '기본 공격 전에 버프를 해제하거나 행동을 막는다. 이미 공격을 마친 아군에게 소급 적용하지 않는다.',
    '보스에도 기본 공격 한정. 스킬·추가타·반격·배틀슈트·호송 목표물은 지휘 소비 대상에서 제외한다.',
    art('command-feathers', 'RELAY', .5, [.7, 1.15, 1.7], 3.0, '#bc95ed'), ['편성에 명령 전달', '다음 기본 공격 대기', '각자 1회 소비', '연쇄 발동 차단']),
  definition('MS-015', 'V-015', '독사 그림자', 'ASSASSIN', 'BACK_THREAT', 'INFILTRATE_DELAYED_VENOM',
    '적 후열 핵심 위협을 지정하고 침투 경로를 예고한다.',
    '짧게 파고들어 독 표식을 남긴 뒤 원위치로 돌아온다. 즉시 피해와 뒤늦은 표식 피해의 시점이 나뉜다.',
    '침투 예고 중 제압하거나 귀환 전 공격한다. 독을 해제하면 지연 피해를 없앨 수 있다.',
    '제어 면역과 별개로 독 면역을 검사한다. 보스의 최대 HP 비례 피해는 사용하지 않는다.',
    art('serpent-shadow', 'INFILTRATE', .55, [.9, 1.85], 3.0, '#a1d974'), ['독사 경로 예고', '후열 접촉', '귀환 후 독 발현', '표식 정리']),
  definition('MS-016', 'V-016', '황혼 봉인', 'CONTROLLER', 'FRONT_GROUP', 'FRONT_OFFENSE_VEIL',
    '적 전열 집단을 대상으로 장막을 준비한다. 전열이 없으면 단일 표적으로 제한한다.',
    '장막에 걸린 적의 다음 공격 스킬 위력을 낮춘다. 기본 공격이나 아군을 돕는 기술에는 소모되지 않는다.',
    '장막을 해제하거나 기본 공격으로 버틴다. 후열까지 자동 확장되거나 행동 자체가 취소되지는 않는다.',
    '보스 기믹·고정 피해는 약화하지 않는다. 일반 공격 스킬에만 감쇠 상한을 적용한다.',
    art('dusk-veil', 'VEIL', .65, [1.05], 3.0, '#d19ce8'), ['전열 장막 예고', '공격술 봉인 부착', '다음 공격 스킬 감쇠', '장막 소멸']),
  definition('MS-018', 'V-018', '생명선 봉합', 'SUPPORT', 'ALLY_LOW_HP', 'CLEANSE_THEN_MEND',
    '생존 아군 중 HP 비율이 가장 낮은 대상을 지정한다.',
    '해제 가능한 지속 피해 하나를 먼저 제거하고, 봉합이 끝날 때 단일 회복한다. 정화와 회복은 서로 다른 시점이다.',
    '봉합 완료 전에 회복 억제를 걸거나 대상을 처치한다. 사망자를 부활시키지 않으며 회복 대상을 다시 고르지 않는다.',
    '보스 고유 낙인·기믹 디버프는 해제하지 않는다. 정화할 효과가 없어도 회복은 진행한다.',
    art('life-stitch', 'STITCH', .45, [.8, 1.65], 3.0, '#75e6bd'), ['위기 아군 고정', '지속 피해 1개 정화', '봉합 완료 회복', '초과 회복 절삭']),
  definition('MS-023', 'V-023', '푸른 응수', 'VANGUARD', 'FRONT_ENEMY', 'MELEE_PARRY_RIPOSTE',
    '자신을 향한 전열의 근접 직접 공격 한 번을 기다린다.',
    '유효한 근접 공격을 받아내면 피해를 줄이고 그 공격자에게만 응수한다. 아군 피해를 대신 받지는 않는다.',
    '사격·지속 피해·기다리기로 응수 창을 낭비시킨다. 상대의 반격은 다시 응수를 발동하지 않는다.',
    '보스의 반격 불가·즉사 기믹은 막지 않는다. 허용된 근접 일반 공격만 처리한다.',
    art('blue-riposte', 'RIPOSTE', .6, [1.0, 1.4], 2.8, '#78b7f2'), ['세이버 방어 자세', '근접 공격 받아내기', '공격자에게 응수', '방어 창 종료']),
  definition('MS-025', 'V-025', '백색 정적', 'SNIPER', 'BACK_THREAT', 'UNDISTURBED_FIRST_SHOT',
    '피격 없이 긴 조준을 끝냈을 때 첫 저격 기회가 강화된다.',
    '피격되지 않은 준비 시간에만 집중 보너스가 생긴다. 준비 중 맞으면 기본 저격만 남고 집중은 소멸한다.',
    '약한 견제라도 조준 중 명중시키면 보너스를 끊는다. 피해를 막은 보호막 접촉도 피격으로 판정한다.',
    '후열 부재 시 보스를 겨눈다. 첫 발 보너스는 한 전투에서 한 번이며 처치로 재충전하지 않는다.',
    art('white-stillness', 'STILLNESS', 1.65, [2.05], 3.4, '#bde5ee'), ['숨죽인 조준', '무피격 집중 유지', '첫 저격 강화', '전투 1회 소모']),
  definition('MS-027', 'V-027', '폐쇄 사선', 'CONTROLLER', 'FRONT_GROUP', 'ADVANCE_SUPPRESSION',
    '적 전열의 접근 경로에 기관총 사격 구역을 만든다.',
    '전열 두 명까지 진입 동작을 지연시킨다. 범위 사격의 전체 예산을 나누며 적 수만큼 단일 피해를 복제하지 않는다.',
    '후열 사격과 고정 위치 기술은 억제 대상이 아니다. 준비 중 케일을 제압하면 사선이 열리지 않는다.',
    '이동 불가·제어 면역 보스는 지연하지 않고 예고된 사격 피해만 받는다.',
    art('closed-firelane', 'BARRAGE', .55, [.85, 1.25, 1.65], 2.9, '#edb477'), ['사선 고정', '교차 엄호 사격', '전열 진입 지연', '사격 구역 종료']),
  definition('MS-028', 'V-028', '연화 결계', 'SUPPORT', 'ALLY_FRONT', 'FRONT_SHARED_BARRIER',
    '생존 아군 전열을 보호한다. 전열이 없으면 가장 위급한 아군 한 명을 선택한다.',
    '유한한 전체 보호막 예산을 대상들에게 나눈다. 피해를 대신 받거나 HP를 회복하지 않는 선제 방호다.',
    '보호막 파괴·제거·지속 압박으로 소모시킨다. 같은 결계를 다시 걸어 무제한 중첩할 수 없다.',
    '관통·즉사·보호막 무시 기믹에 적용하지 않는다. 보스 수와 무관하게 전체 방호 예산은 일정하다.',
    art('lotus-barrier', 'BLOOM', .55, [1.0], 2.9, '#ee9cc4'), ['전열에 연잎 전개', '방호 예산 분배', '피해를 보호막으로 흡수', '잔여 꽃잎 소멸']),
  definition('MS-032', 'V-032', '마지막 약실', 'ASSASSIN', 'LOW_HP_ENEMY', 'FINISHER_WITH_RELOAD',
    '살아 있는 적 중 HP 비율이 가장 낮은 대상을 고른다.',
    '명중 시점에 마무리 기준을 만족하면 강화탄을 쓴다. 처치하지 못하면 다음 기본 공격에 재장전 부담을 남긴다.',
    '타격 직전 회복·보호막으로 마무리를 막는다. 즉사 기술이 아니며 처치해도 스킬을 초기화하지 않는다.',
    '보스는 처형 대상이 아니다. 낮은 HP 기준의 제한된 추가 피해만 허용하고 최대 HP 비례 피해는 금지한다.',
    art('last-chamber', 'FINISH', .8, [1.2], 3.0, '#bca2ee'), ['약화 표적 선택', '마지막 탄 발사', '타격 시 HP 조건 검사', '실패 시 재장전 부담']),
  definition('MS-038', 'V-038', '업무 종료', 'CONTROLLER', 'FRONT_ENEMY', 'INTERRUPT_WINDUP',
    '적 전열 우선 대상의 기술 준비 동작을 확인한다.',
    '건틀릿 충돌 순간 아직 준비 중인, 중단 가능한 기술 하나를 끊는다. 이미 끝난 기술이나 다음 기술까지 잠그지 않는다.',
    '빠른 발동·기본 공격·중단 면역으로 헛치게 만든다. 준비 상태가 아니면 일반 타격만 남는다.',
    '보스 제어 면역과 끊기 불가 기믹을 존중한다. 면역 시 임의 스턴·게이지 삭제를 대체 지급하지 않는다.',
    art('closing-punch', 'INTERRUPT', .45, [.85], 2.5, '#7dd8df'), ['준비 동작 포착', '건틀릿 접근', '현재 기술만 중단', '다음 행동은 허용']),
  definition('MS-042', 'V-042', '현행범 체포', 'CONTROLLER', 'FRONT_ENEMY', 'REPEAT_OFFENDER_RESTRAINT',
    '선택된 전열 적이 아군에게 직접 공격을 반복하면 위반 표식을 쌓는다.',
    '표식이 충족된 적에게 권총 제압탄을 쏘고 다음 기본 공격 한 번을 약화한다. 행동 전체를 봉쇄하는 스턴은 아니다.',
    '스킬·지원 행동으로 공격 패턴을 바꾸거나 표식을 해제한다. 다른 적의 공격 기록을 합산하지 않는다.',
    '보스에도 단일 기본 공격 감쇠만 허용한다. 광역 기믹·고정 피해·추가타는 위반 기록에서 제외한다.',
    art('police-restraint', 'RESTRAIN', .55, [.95, 1.45], 2.8, '#69b8f5'), ['동일 공격자 위반 기록', '제압탄 발사', '다음 기본 공격 약화', '기록과 제약 소모']),
  definition('MS-043', 'V-043', '퇴근길 앙코르', 'MARKSMAN', 'FRONT_ENEMY', 'TWO_BEAT_FOLLOWUP',
    '적 전열 우선 대상에게 박자가 다른 권총 두 발을 준비한다.',
    '첫 탄 뒤 짧은 빈틈을 두고 같은 적에게 둘째 탄을 쏜다. 첫 탄이 빗나가거나 대상이 사라지면 둘째 탄을 취소한다.',
    '첫 탄 회피·타격 사이 제압으로 후속타를 끊는다. 남은 탄을 다른 적에게 넘기지 않으며 종료 뒤 재장전한다.',
    '단일 보스에도 같은 명중·중단 조건을 쓴다. 추가타 자체로 다른 스킬을 연쇄 발동하지 않는다.',
    art('evening-encore', 'DOUBLE_BEAT', .45, [.8, 1.55], 2.7, '#ed9aba'), ['첫 박자 사격', '명중 확인과 빈틈', '같은 표적 앙코르', '재장전']),
];

export const SCENARIOS = {normal: '유효한 상황', counter: '약점 공략', boss: '보스 상대'};
const copy = x => JSON.parse(JSON.stringify(x));
export function skillById(id) {
  const skill = MERCENARY_SKILLS.find(x => x.id === id);
  if (!skill) throw new Error('정의되지 않은 용병 스킬입니다.');
  return skill;
}
export function createSkillDraft(rosterVersion) {
  return {format: 'PROJECT_V_MERCENARY_SKILL_DRAFT_V1', version: SKILL_VERSION, revision: 1, rosterVersion,
    status: 'DRAFT', runtimeEnabled: false,
    skills: MERCENARY_SKILLS.map(s => ({id: s.id, code: s.code, name: s.name, review: 'PENDING', note: ''}))};
}
export function validateSkillDraft(draft, rosterVersion) {
  const fail = message => {throw new Error(message)};
  const exact = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
    Object.keys(obj).length === keys.length && keys.every(k => Object.hasOwn(obj, k));
  if (!exact(draft, ['format','version','revision','rosterVersion','status','runtimeEnabled','skills']) ||
    draft.format !== 'PROJECT_V_MERCENARY_SKILL_DRAFT_V1' || draft.version !== SKILL_VERSION ||
    draft.rosterVersion !== rosterVersion || draft.status !== 'DRAFT' || draft.runtimeEnabled !== false ||
    !Number.isSafeInteger(draft.revision) || draft.revision < 1 || draft.revision >= Number.MAX_SAFE_INTEGER)
    fail('초안 형식·버전·운영 미연결 상태를 확인하세요.');
  if (!Array.isArray(draft.skills) || draft.skills.length !== MERCENARY_SKILLS.length) fail(`스킬 ${MERCENARY_SKILLS.length}종이 모두 있어야 합니다.`);
  const seen = new Set();
  for (const row of draft.skills) {
    if (!exact(row, ['id','code','name','review','note'])) fail('허용되지 않은 스킬 설정입니다.');
    const base = MERCENARY_SKILLS.find(s => s.id === row.id && s.code === row.code);
    if (!base || seen.has(row.id)) fail('스킬 배정이 누락·중복되었거나 기준과 다릅니다.');
    seen.add(row.id);
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 40 ||
      typeof row.note !== 'string' || row.note.length > 800 || !['PENDING','REVISE','REVIEWED'].includes(row.review)) fail('이름·검토 상태·메모 형식이 올바르지 않습니다.');
  }
  return copy(draft);
}
export function parseSkillDraft(text, rosterVersion) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 48*1024) throw new Error('초안은 48 KB 이하여야 합니다.');
  let draft = JSON.parse(text);
  if (draft?.format === 'PROJECT_V_MERCENARY_SKILL_DRAFT_V1' && draft.version === 1 &&
      draft.rosterVersion === 10 && rosterVersion === 11 && Array.isArray(draft.skills) && draft.skills.length === 16 &&
      draft.skills.every(row => row?.id !== 'MS-021')) {
    draft = {...draft, version: SKILL_VERSION, rosterVersion,
      skills: [createSkillDraft(rosterVersion).skills.find(row => row.id === 'MS-021'), ...draft.skills]};
  }
  return validateSkillDraft(draft, rosterVersion);
}
