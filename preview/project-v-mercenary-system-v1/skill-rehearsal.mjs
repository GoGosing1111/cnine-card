import {skillById, SCENARIOS} from '../../shared/mercenary-skills-v1.mjs';

// All numbers below are deliberately confined to this offline, 100-HP rehearsal.
// Production balance remains null. The renderer consumes this resolved log only.
const clone = value => JSON.parse(JSON.stringify(value));
export function rehearsalSnapshot(scenario = 'normal') {
  const actor = (id, team, row, hp, attack, extra = {}) => ({id, team, row, hp, maxHp: 100, attack,
    shield: 0, flags: {}, alive: hp > 0, ...extra});
  return [
    ...[24,78,68,91,85].map((hp,i) => actor(`A${i+1}`, 'ALLY', i < 2 ? 'FRONT' : 'BACK', hp, 100)),
    actor('M', 'ALLY', 'FRONT', 92, 100),
    ...[76,85,44,100,63].map((hp,i) => actor(`E${i+1}`, 'ENEMY', i < 2 ? 'FRONT' : 'BACK', hp,
      [130,110,145,180,150][i], {shield: i === 0 ? 18 : 0, boss: scenario === 'boss'}))
  ].filter(a => scenario !== 'boss' || a.team === 'ALLY' || a.id === 'E1');
}
function validateSnapshot(snapshot) {
  if (!Array.isArray(snapshot) || snapshot.length > 11 || !snapshot.some(a => a.id === 'M')) throw new Error('검수 편성은 일반 5 + 용병 1, 적 최대 5명입니다.');
  const seen = new Set();
  for (const a of snapshot) {
    if (!/^(?:A[1-5]|E[1-5]|M)$/.test(a.id) || seen.has(a.id) ||
      a.team !== (a.id.startsWith('E') ? 'ENEMY' : 'ALLY') || !['FRONT','BACK'].includes(a.row) ||
      ![a.hp,a.maxHp,a.shield,a.attack].every(Number.isFinite) || a.hp < 0 || a.hp > a.maxHp ||
      a.maxHp <= 0 || a.shield < 0 || a.attack < 0) throw new Error('검수 유닛 상태가 올바르지 않습니다.');
    seen.add(a.id);
  }
}
export function selectSkillTargets(target, snapshot) {
  const living = team => snapshot.filter(a => a.team === team && a.hp > 0);
  const hpOrder = (a,b) => a.hp/a.maxHp-b.hp/b.maxHp || a.id.localeCompare(b.id);
  const enemy = living('ENEMY'), ally = living('ALLY');
  const front = enemy.filter(a => a.row === 'FRONT');
  const firstFront = () => [...(front.length ? front : enemy)].sort(hpOrder).slice(0,1);
  if (target === 'FRONT_ENEMY') return firstFront();
  if (target === 'LOW_HP_ENEMY') return [...enemy].sort(hpOrder).slice(0,1);
  if (target === 'BACK_THREAT') {
    const back = enemy.filter(a => a.row === 'BACK');
    return back.length ? back.sort((a,b) => b.attack-a.attack || a.id.localeCompare(b.id)).slice(0,1) : firstFront();
  }
  if (target === 'FRONT_GROUP') return front.length ? front.sort((a,b) => a.id.localeCompare(b.id)).slice(0,2) : firstFront();
  if (target === 'ALLY_LOW_HP') return [...ally].sort(hpOrder).slice(0,1);
  if (target === 'ALLY_TEAM') return ally;
  if (target === 'ALLY_FRONT') {
    const frontAlly = ally.filter(a => a.row === 'FRONT');
    return frontAlly.length ? frontAlly : [...ally].sort(hpOrder).slice(0,1);
  }
  throw new Error('허용되지 않은 스킬 표적입니다.');
}

export function compileRehearsal(id, scenario = 'normal', snapshot = rehearsalSnapshot(scenario)) {
  if (!Object.hasOwn(SCENARIOS, scenario)) throw new Error('알 수 없는 검수 상황입니다.');
  validateSnapshot(snapshot);
  const skill = skillById(id), initial = clone(snapshot), work = clone(initial), events = [];
  const targets = selectSkillTargets(skill.target, work).map(a => a.id), t = targets[0];
  const source = work.find(a => a.id === 'M');
  const get = id => work.find(a => a.id === id);
  const counter = scenario === 'counter', boss = scenario === 'boss';
  const add = (at, kind, label, ids = [], changes = {}, extra = {}) => {
    for (const [id, patch] of Object.entries(changes)) Object.assign(get(id), clone(patch));
    events.push({id: `${skill.id}:${events.length}`, at, kind, label, targets: ids, changes: clone(changes), ...extra});
  };
  const flag = (at, id, key, value, label, kind = 'STATUS') => add(at, kind, label, [id], {[id]: {flags: {...get(id).flags, [key]: value}}});
  const hit = (at, id, amount, label, extra = {}) => {
    const a = get(id); if (!a || a.hp <= 0) return;
    const shieldUse = Math.min(amount, a.shield), hp = Math.max(0, a.hp-(amount-shieldUse));
    add(at, 'HIT', label, [id], {[id]: {hp, shield: a.shield-shieldUse, alive: hp > 0}}, {amount, ...extra});
  };
  const mark = (at, label, ids = targets, kind = 'STATUS') => add(at, kind, label, ids);
  const explain = {normal: '특기를 살릴 수 있는 상황입니다.', counter: skill.counterplay, boss: skill.bossRule};
  if (!source || source.hp <= 0 || !targets.length) {
    add(0, 'CANCEL', source?.hp <= 0 ? '용병이 전투 불능이라 발동하지 않습니다.' : '유효한 생존 표적이 없습니다.');
    return {skillId: id, scenario, initial, targets: [], events, duration: skill.visual.duration, explanation: explain[scenario], previewOnly: true};
  }
  mark(0, skill.steps[0], targets, 'WINDUP');
  switch (skill.mechanic) {
    case 'INTERCEPT_ONE_HIT':
      if (t === 'M') {mark(.55, '자기 자신은 호위 피해를 다시 이전하지 않습니다.', ['M'], 'BLOCKED');break;}
      flag(.55, t, '호위', true, '단일 직접 피해 1회 호위');
      if (counter) {mark(.9, '광역 피해: 호위 적용 대상 아님', [t], 'BLOCKED');hit(1.05, t, 24, '광역 피해는 이전하지 않음');}
      else {hit(1.05, t, 6, '원래 대상의 잔여 피해 6');hit(1.05, 'M', 18, '솔바인이 피해 18 분담');}
      flag(1.35, t, '호위', false, '호위 연결 1회 소모');break;
    case 'LOCKED_THREAT_SHOT':
      flag(.4, t, '조준', true, '후열 핵심 위협에 조준 고정');
      if (counter) {add(1.1, 'SCENARIO', '동료 공격으로 고정 표적이 먼저 전투 불능', [t], {[t]: {hp: 0, alive: false}});mark(1.6, '표적 상실: 다른 적에게 탄을 넘기지 않음', [t], 'CANCEL');}
      else hit(1.6, t, 34, boss ? '전열 보스에 정밀탄' : '후열 고정 표적에 정밀탄');
      flag(1.9, t, '조준', false, '조준 해제');break;
    case 'BREAK_ARMOR_WINDOW':
      if (counter) {add(.5, 'SCENARIO', '이미 보호막이 없는 상황', [t], {[t]: {shield: 0}});}
      hit(.95, t, 22, '파쇄 베기: 보호막부터 소모');
      flag(1.35, t, '방어 약화', true, '방어 약화 창 생성 — 방어 0 처리 아님');
      if (counter) flag(1.65, t, '방어 약화', false, '상대 정화로 약화 해제', 'BLOCKED');break;
    case 'SAME_TARGET_CALIBRATION': {
      const alternate = work.find(a => a.team === 'ENEMY' && a.hp > 0 && a.id !== t)?.id || t;
      let locked = t, stacks = 0;
      [.8,1.25,1.7].forEach((at,i) => {
        const next = counter && i > 0 ? alternate : t;
        if (next !== locked) {flag(at-.1, locked, '교정', 0, '도발로 표적 변경: 교정 초기화', 'BLOCKED');stacks = 0;locked = next;}
        stacks++;hit(at, locked, stacks === 3 ? 16 : 9, stacks === 3 ? '동일 표적 3회: 교정 보너스' : `점사 ${i+1}`);
        flag(at, locked, '교정', stacks === 3 ? 0 : stacks, stacks === 3 ? '교정 보너스 소비' : `교정 ${stacks}`);
      });break;
    }
    case 'NEXT_BASIC_ORDER':
      for (const id of targets) flag(.7, id, '지휘권', true, '다음 기본 공격 1회 지휘권');
      if (counter) {for (const id of targets) flag(1.05, id, '지휘권', false, '기본 공격 전 지휘 해제', 'BLOCKED');}
      else {
        const opponent = selectSkillTargets('FRONT_ENEMY', work)[0]?.id;
        for (const [i,id] of targets.slice(0,2).entries()) {
          const at = i ? 1.7 : 1.15;
          flag(at, id, '지휘권', false, '원래 예정된 기본 공격: 지휘권 1회 소비');
          if (opponent) hit(at, opponent, 12, '기본 공격 9 + 지휘 보너스 3', {sourceId: id, procEligible: false});
        }
      }break;
    case 'INFILTRATE_DELAYED_VENOM':
      hit(.9, t, 12, '후열 접촉 타격');flag(.9, t, '독 표식', true, '독 표식 1개');
      mark(1.25, '원래 용병 슬롯으로 귀환', ['M'], 'RETURN');
      if (counter) flag(1.5, t, '독 표식', false, '독 정화: 지연 피해 차단', 'BLOCKED');
      else {hit(1.85, t, 12, '귀환 뒤 독 표식 피해');flag(1.85, t, '독 표식', false, '독 표식 소모');}break;
    case 'FRONT_OFFENSE_VEIL':
      for (const id of targets) flag(1.05, id, '공격술 감쇠', true, '다음 공격 스킬 1회 감쇠');
      if (counter) {for (const id of targets) flag(1.6, id, '공격술 감쇠', false, '장막을 정화하여 감쇠 제거', 'BLOCKED');}
      else {flag(1.8, t, '공격술 감쇠', false, '예정된 공격 스킬 1회 감쇠·소모');hit(1.8, 'A1', 10, '검수 공격술 피해 16 → 10');}break;
    case 'CLEANSE_THEN_MEND':
      flag(.3, t, '지속 피해', true, '해제 가능한 지속 피해 부여 — 검수 상황', 'SCENARIO');
      flag(.8, t, '지속 피해', false, '지속 피해 1개 정화', 'CLEANSE');
      if (counter) {flag(1.15, t, '회복 억제', true, '봉합 도중 회복 억제', 'BLOCKED');}
      {const amount = counter ? 9 : 24, a = get(t);add(1.65, 'HEAL', counter ? '회복 억제로 봉합 효과 감소' : '봉합 완료: 생존 표적 단일 회복', [t], {[t]: {hp: Math.min(a.maxHp, a.hp+amount)}}, {amount});}break;
    case 'MELEE_PARRY_RIPOSTE':
      flag(.6, 'M', '응수 자세', true, '근접 직접 공격 1회 대기');
      hit(1.0, 'M', counter ? 18 : 6, counter ? '원거리 사격: 받아내기 불가' : '근접 타격 받아내기');
      if (counter) mark(1.4, '원거리 공격에는 응수하지 않음', ['M'], 'BLOCKED');
      else hit(1.4, t, 22, '실제 근접 공격자에게 응수', {procEligible: false});
      flag(1.7, 'M', '응수 자세', false, '응수 창 종료');break;
    case 'UNDISTURBED_FIRST_SHOT':
      flag(.4, 'M', '첫 저격 집중', true, '전투 1회 집중 준비');
      if (counter) {hit(1.2, 'M', 4, '준비 중 견제 명중');flag(1.2, 'M', '첫 저격 집중', false, '피격으로 집중 보너스 상실', 'BLOCKED');}
      hit(2.05, t, counter ? 21 : 39, counter ? '집중이 끊긴 기본 저격' : '무피격 집중 첫 저격');
      flag(2.1, 'M', '첫 저격 집중', false, '첫 저격 기회 소모');break;
    case 'ADVANCE_SUPPRESSION':
      if (counter) {mark(.55, '준비 중 제압: 사선 전개 취소', ['M'], 'CANCEL');break;}
      for (const at of [.85,1.25,1.65]) for (const id of targets) hit(at, id, 6/targets.length, '범위 사격: 전체 예산 분배');
      for (const id of targets) flag(1.65, id, '진입 지연', !boss, boss ? '이동·제어 면역: 진입 지연 불가' : '전열 진입 1회 지연', boss ? 'IMMUNE' : 'STATUS');break;
    case 'FRONT_SHARED_BARRIER': {
      const budget = 30, share = budget/targets.length;
      for (const id of targets) {const a = get(id);add(1, 'SHIELD', '전체 방호 예산 30을 전열에 분배', [id], {[id]: {shield: Math.max(a.shield, share)}}, {amount: share});}
      if (counter) {for (const id of targets) add(1.4, 'BLOCKED', '상대 보호막 제거', [id], {[id]: {shield: 0}});}
      hit(1.75, t, 12, '결계 뒤 예정된 적 공격');break;
    }
    case 'FINISHER_WITH_RELOAD':
      if (counter) {add(.9, 'SCENARIO', '충돌 직전 상대 회복', [t], {[t]: {hp: Math.min(get(t).maxHp, get(t).hp+35)}});}
      {const eligible = get(t).hp/get(t).maxHp <= .45;
        hit(1.2, t, eligible ? 50 : 22, eligible ? '충돌 시 저체력 기준 충족: 강화탄' : '기준 미달: 일반 마무리탄');
        if (get(t).hp > 0) flag(1.5, 'M', '재장전 부담', true, '처치 실패: 다음 기본 공격에 부담', 'BLOCKED');
        else mark(1.5, '처치 성공 — 스킬 초기화 없음', ['M']);}break;
    case 'INTERRUPT_WINDUP':
      flag(.3, t, '기술 준비', !counter, counter ? '상대가 기본 공격을 선택한 상황' : '적 기술 준비 동작', 'SCENARIO');
      hit(.85, t, 12, '건틀릿 접촉 타격');
      if (boss || counter) mark(.85, boss ? '보스 중단 면역: 타격만 적용' : '준비 기술이 없어 중단 불발', [t], boss ? 'IMMUNE' : 'BLOCKED');
      else flag(.85, t, '기술 준비', false, '현재 준비 중 기술 1개만 중단', 'INTERRUPT');break;
    case 'REPEAT_OFFENDER_RESTRAINT':
      flag(.3, t, '위반', counter ? 1 : 2, counter ? '공격 패턴 전환: 위반 1회' : '동일 적 직접 공격 2회 기록', 'SCENARIO');
      hit(.95, t, 9, '권총 제압탄');
      if (counter) mark(1.45, '동일 공격자 기록 부족: 기본 공격 약화 불발', [t], 'BLOCKED');
      else {flag(1.45, t, '기본 공격 약화', true, '다음 기본 공격 1회 약화');flag(1.45, t, '위반', 0, '위반 기록 소모');
        hit(1.85, 'A1', 8, '기본 공격 감쇠: 검수 피해 14 → 8');flag(1.85, t, '기본 공격 약화', false, '기본 공격 약화 1회 소모');}break;
    case 'TWO_BEAT_FOLLOWUP':
      if (counter) {mark(.8, '상대가 첫 탄 회피', [t], 'MISS');mark(1.55, '초탄 빗나감: 앙코르 취소', [t], 'CANCEL');}
      else {hit(.8, t, 12, '첫 박자 사격');if (get(t).hp > 0) hit(1.55, t, 16, '같은 표적에 두 번째 박자', {procEligible: false});else mark(1.55, '표적 전투 불능: 후속타 취소', [t], 'CANCEL');}
      flag(1.95, 'M', '재장전', true, '두 박자 종료 뒤 재장전');break;
    default: throw new Error('검수 실행기가 없는 스킬입니다.');
  }
  events.sort((a,b) => a.at-b.at || Number(a.id.split(':')[1])-Number(b.id.split(':')[1]));
  return {skillId: id, scenario, initial, targets, events, duration: skill.visual.duration,
    explanation: explain[scenario], previewOnly: true, damageAuthority: 'OFFLINE_RESOLVED_FIXTURE'};
}
export function sampleRehearsal(plan, time) {
  if (!Number.isFinite(time)) throw new Error('유효한 재생 시각이 필요합니다.');
  const actors = clone(plan.initial), events = plan.events.filter(event => event.at <= Math.max(0,time));
  for (const event of events) for (const [id, patch] of Object.entries(event.changes)) Object.assign(actors.find(a => a.id === id), clone(patch));
  return {actors, events, current: events.at(-1) || null, time: Math.max(0,Math.min(plan.duration,time))};
}
