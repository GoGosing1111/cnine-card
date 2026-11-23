// Boss identity and move definitions are shared by the server, CMS and V3 playback.
const artRoot = '/assets/ui/project-v/monsters/apocalypse-knights-20261124';

function move(kind, name, description, properties) {
  return {kind, name, description, ...properties};
}

// Contact is expressed in painted exposures, zero-based. The same event owns the entire cast.
const timing = {
  'rahden-seal': [1.76, .82, 6], 'rahden-curse': [2.06, 1.04, 7], 'rahden-ultimate': [2.62, 1.30, 6],
  'velsir-curse': [2.16, 1.13, 7], 'velsir-seal': [2.12, 1.12, 7], 'velsir-ultimate': [2.94, 1.58, 7]
};

function battleMove(def, skill) {
  const asset = def.key + '-' + skill.kind;
  const [duration, impactAt, collisionFrame] = timing[asset];
  return {...skill, boss:def.key, code:asset.replace('-', '_').toUpperCase(), visual:'KNIGHT_SEQUENCE',
    tint:def.color, atlas:artRoot+'/skills/'+asset+'-v2.json', asset, duration, impactAt, collisionFrame};
}

const definitions = [
  {
    monsterId: 84, key: 'rahden', name: '라흐덴', subtitle: '흑철의 집행관',
    equipmentBenchmark: {tier: 8, level: 10}, color: 0xe96150, battlePower: 3_000_000_000_000, battleSuitSkillDefensePercent: 52,
    tuning: {hpPercent: 625, attackPercent: 375, defensePercent: 375, speedPercent: 350, shieldPercent: 70, forcedActionEvery: 4},
    skills: [
      move('seal', '흑철 낙인', '공격력이 높은 두 명의 기술을 각자 3행동 동안 봉인합니다.', {targetCount: 2, statusActions: 3, dispel: true}),
      move('curse', '홍련의 계율', '공격력이 높은 세 명의 회복·재생·흡혈을 각자 4행동 동안 차단합니다.', {targetCount: 3, statusActions: 4, healReductionPercent: 100, dispel: true}),
      move('ultimate', '단죄의 낙검', '보호막이 많이 남은 두 명에게 집행검을 내립니다. 보호막 동률에서는 공격력이 높은 적을 겨눕니다.', {targetCount: 2, targetOrder: 'SHIELD', attackPercent: 142, shieldPiercePercent: 60})
    ]
  },
  {
    monsterId: 85, key: 'velsir', name: '벨시르', subtitle: '침수 천문대의 파수자',
    equipmentBenchmark: {tier: 10, level: 15}, color: 0x67dfff, battlePower: 3_400_000_000_000, battleSuitSkillDefensePercent: 55,
    tuning: {hpPercent: 530, attackPercent: 650, defensePercent: 200, speedPercent: 220, shieldPercent: 50, forcedActionEvery: 5},
    skills: [
      move('curse', '침성의 조류', '모든 적의 회복·재생·흡혈을 각자 4행동 동안 차단합니다.', {targetCount: 'ALL', statusActions: 4, healReductionPercent: 100, dispel: true}),
      move('seal', '궤도 동결', '공격력이 높은 네 명의 기술을 각자 3행동 동안 봉인합니다.', {targetCount: 4, statusActions: 3, dispel: true}),
      move('ultimate', '낙성의 자오선', '전원에게 청염을 내립니다. 회복 차단이 남은 적은 이 기술의 피해가 20% 증가합니다.', {targetCount: 'ALL', attackPercent: 55, shieldPiercePercent: 72, cursedDamageBonusPercent: 20})
    ]
  }
];

export const APOCALYPSE_KNIGHTS = Object.freeze(definitions.map(def => ({
  ...def, code: 'APOCALYPSE_' + def.key.toUpperCase(), actionCadence: 'PARTY_ACTIONS',
  artFacing: -1, battleScale: 1.12,
  sourceArt: artRoot + '/' + def.key + '-portrait.png',
  battleSprite: artRoot + '/' + def.key + '-battle.png',
  skills: def.skills.map(skill => battleMove(def,skill))
})));

export function knightProfile(boss, morgas) {
  if (!APOCALYPSE_KNIGHTS.includes(boss) || !Number.isFinite(morgas?.battlePower)) throw new Error('모르가스 CMS 프로필이 필요합니다.');
  const ultimate = boss.skills.find(skill => skill.kind === 'ultimate');
  return {...structuredClone(morgas), ...boss.tuning, battlePower: boss.battlePower, skillEnabled: true,
    skillName: boss.skills.map(skill => skill.name).join(' · '),
    skillDescription: boss.skills.map(skill => skill.description).join(' '),
    battleSuitSkillDefensePercent: boss.battleSuitSkillDefensePercent,
    legionUltimate: {enabled: true, attackPercent: ultimate.attackPercent, shieldPiercePercent: ultimate.shieldPiercePercent}};
}
