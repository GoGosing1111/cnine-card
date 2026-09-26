// Preparation data only. This module is not imported by the live game or API.
export const preparation = Object.freeze({
  season: 'S2', version: '20260926-v1', status: 'ART_AND_DESIGN_REVIEW',
  runtimeEnabled: false, drawEnabled: false, pricing: null, dropWeights: null,
  sourceDocument: 'docs/magic-card-season-2-design-draft.md',
  sourceCommit: '6092a5b59fa062f6efb9b6bdc7fff588fe4e7251',
  baselineKind: 'REPOSITORY_DEFAULTS_NOT_LIVE_CMS',
  balanceStatus: 'PROPOSED_NOT_BATTLE_SIMULATED'
});

export const growth = [1, 1.03, 1.06, 1.09, 1.12, 1.15, 1.18, 1.22, 1.26, 1.30];
export const s1TriggerRates = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50];
export const s1Cards = [
  ['OPENING_ATTACK', '선봉의 마력검', 18, 1, '공격력 증가', 'opening-attack-768-v1500.webp'],
  ['GUARD_BARRIER', '성역의 수호결계', 20, 1, '시작 보호막 / 최대 HP', 'guard-barrier-768-v1500.webp'],
  ['LIFE_AMPLIFY', '생명의 근원', 16, 1, '최대 HP 증가', 'life-amplify-768-v1500.webp'],
  ['CRISIS_HEAL', '긴급 치유의 빛', 28, 2, 'HP 30% 이하 회복 / 최대 HP', 'crisis-heal-768-v1500.webp'],
  ['PUNISH_TRAP', '응징의 마법진', 14, 2, '피격 응징 / 최대 HP', 'punish-trap-768-v1500.webp'],
  ['ARCANE_COUNTER', '비전 반격', 16, 2, '반격 / 공격력', 'arcane-counter-768-v1500.webp'],
  ['FOLLOWUP_HASTE', '질풍의 연계', 22, 2, '자신 행동 게이지', 'followup-haste-768-v1500.webp'],
  ['ARCANE_SEAL', '봉인의 칙령', 1, 2, '다음 마법 발동 시도 봉인', 'arcane-seal-768-v1665.webp'],
  ['DOOM_MARK', '파멸의 낙인', 18, 3, '3중첩 폭발 / 대상 최대 HP', 'doom-mark-768-v1665.webp'],
  ['SHIELD_SIPHON', '강탈의 성배', 60, 2, '현재 보호막 강탈', 'shield-siphon-768-v1665.webp'],
  ['TIME_DISTORTION', '시간의 족쇄', 30, 2, '대상 행동 게이지 감소', 'time-distortion-768-v1665.webp'],
  ['PHOENIX_REVIVE', '불사조의 계약', 22, 1, '부활 / 최대 HP', 'phoenix-revive-768-v1665.webp'],
  ['PURIFY_LIGHT', '정화의 성광', 12, 2, '정화 + 회복 / 최대 HP', 'purify-light-768-v1665.webp'],
  ['CHAIN_ECHO', '연쇄의 잔영', 45, 2, '실제 피해 비례 추가 피해', 'chain-echo-768-v1665.webp']
].map(([effect, name, value, limit, meaning, image]) => ({effect, name, value, limit, meaning, image: `../../assets/ui/magic-cards/${image}`}));

export const cards = [
  {
    code: 'S2_ECLIPSE_PROPHECY', slug: 'eclipse-prophecy', number: '01', name: '월식의 예언서',
    role: '공격', accent: '#f2c16a', motif: '월식 · 예언서', scopes: ['PVE', 'PVP'],
    hook: '한 명을 겨누는 순간, 모든 공격이 달라진다.',
    novelty: '아군이 함께 소비하는 집중 표식. 표식 대상이 쓰러지면 남은 타수가 다음 적에게 이어집니다.',
    trigger: '전투 시작 시 공격력이 가장 높은 적 1명', target: '표식 대상에게 적중하는 아군의 직접 공격', limit: '팀당 표식 1개 · 직접 타격 총 6회',
    stats: [{key:'bonus',label:'표식 추가 피해',base:12,unit:'%'}],
    fixed: {hits:6,teamBudget:1},
    steps: ['최강 적에게 표식', '직접 공격이 적중', '추가 피해 · 잔여 타수 차감', '처치되면 표식 이전'],
    guards: ['반격·도트·추가 피해는 잔여 타수를 소비하거나 새 추가 피해를 만들지 않음', '중복 장착 시 팀 표식 예산은 하나만 사용', '아포칼립스 추가 피해 상한을 그대로 적용'],
    compare: ['OPENING_ATTACK','DOOM_MARK'],
    advantage: '확률에 기대는 개인 버프와 달리, +0부터 팀의 집중 공격 6회를 확정 강화합니다.',
    tradeoff: '표식 대상에게 직접 공격이 적중해야 하며, 분산 공격에서는 이득이 줄어듭니다.',
    synergy: '빠른 다중 공격 편성 · 단일 핵심 적 집중',
    example: {label:'표식 대상에게 적중한 직접 피해 합계',value:600000,unit:'피해'}
  },
  {
    code:'S2_CAUSAL_SEVER',slug:'causal-sever',number:'02',name:'인과 절단',role:'공격',accent:'#b6a6ff',motif:'은빛 칼날 · 인과의 실',scopes:['PVE','PVP'],
    hook:'세 번째 검격은 방어의 규칙을 벤다.',
    novelty:'세 번째 공격에 방어 무시와 보호막 관통을 결합합니다. 확률 추가타와 다른 공격 판정입니다.',
    trigger:'장착자의 직접 공격 행동 3회마다',target:'해당 공격의 주 대상',limit:'전투당 2회 · 한 행동을 한 번만 집계',
    stats:[{key:'ignore',label:'방어력 무시',base:50,unit:'%'},{key:'pierce',label:'보호막 관통',base:30,unit:'%'}],fixed:{every:3,activations:2},
    steps:['직접 공격 행동 집계','3번째 공격 예고','회피 판정 통과 · 방어 일부 무시','최종 피해 일부를 HP에 전달'],
    guards:['관통 피해는 최종 피해의 분할이며 별도 피해를 중복 생성하지 않음','연타 한 행동·반격·복제는 공격 횟수를 추가하지 않음','무적을 무시하지 않으며 아포칼립스 슈트 요구와 관통 상한을 우회하지 않음'],
    compare:['CHAIN_ECHO','ARCANE_COUNTER'],advantage:'+0부터 세 번째 공격을 예측 가능하게 강화하며, 보호막 뒤 HP에도 압박을 가합니다.',tradeoff:'세 번 행동하기 전에 쓰러지면 발동하지 않고 무적에는 막힙니다.',synergy:'생존 가능한 주력 공격수 · 고방어/보호막 상대',
    example:{label:'방어 판정 후 확정된 해당 공격 피해',value:100000,unit:'피해'}
  },
  {
    code:'S2_FATE_INTERCEPT',slug:'fate-intercept',number:'03',name:'운명의 대리',role:'생존',accent:'#ff9099',motif:'붉은 인연 · 희생의 수호패',scopes:['PVE','PVP'],
    hook:'동료의 마지막 순간을, 내가 대신 받는다.',
    novelty:'다른 아군의 치명 피해를 가로채 HP 1을 남기고, 초과분을 장착자가 대신 받습니다.',
    trigger:'다른 일반 아군에게 치명 직접 피해가 확정될 때',target:'위기에 처한 아군 1명과 살아 있는 장착자',limit:'팀당 1회 · 같은 피해의 생존 효과 1개',
    stats:[{key:'mitigation',label:'이전 피해 경감',base:20,unit:'%'}],fixed:{activations:1,survivingHp:1},
    steps:['보호막·피해 감소 정산','치명 피해와 대리 가능 여부 확인','피보호자 HP 1 유지','경감한 초과 피해를 장착자에게 이전'],
    guards:['장착자는 이전 피해로 사망할 수 있음','이전 피해는 대리·반격·흡혈·부활을 재귀 발동시키지 않음','같은 피해의 전직 생존·불사조와 공용 생존 예산을 사용'],
    compare:['PHOENIX_REVIVE','CRISIS_HEAL'],advantage:'자신만 살리는 확률 부활과 달리 +0부터 핵심 아군의 첫 치명타를 대신 받습니다.',tradeoff:'탱커의 HP를 소모하며, 남은 아군이 없거나 이미 사용했다면 발동하지 않습니다.',synergy:'체력이 높은 수호자 + 후열 핵심 공격수',
    example:{label:'HP 60,000인 아군이 받는 최종 직접 피해',value:150000,unit:'피해'}
  },
  {
    code:'S2_OVERHEAL_FORGE',slug:'overheal-forge',number:'04',name:'생명 연성진',role:'생존',accent:'#8be6b5',motif:'생명의 샘 · 결정 보호막',scopes:['PVE','PVP'],
    hook:'넘친 치유는 사라지지 않고 갑옷이 된다.',
    novelty:'실제 회복 풀을 쓴 뒤 남은 초과 회복을 보호막으로 굳힙니다. 회복 편성의 낭비를 전력으로 바꿉니다.',
    trigger:'아군이 실제 회복을 정산한 직후',target:'초과 회복이 발생한 일반 아군',limit:'팀당 3회 · 대상별 생성 보호막 상한',
    stats:[{key:'conversion',label:'초과 회복 전환',base:60,unit:'%'},{key:'cap',label:'최대 HP 대비 상한',base:18,unit:'%'}],fixed:{teamActivations:3},
    steps:['남은 회복 풀에서 회복 승인','실제 회복과 초과분 분리','초과분을 보호막으로 변환','대상별 상한·팀 발동 횟수 적용'],
    guards:['회복 풀에서 승인되지 않은 요청량은 초과 회복으로 세지 않음','이 보호막은 회복으로 취급하지 않아 재귀 변환하지 않음','상한에 막혀 생성량이 0이면 발동 횟수를 소비하지 않음'],
    compare:['GUARD_BARRIER','PURIFY_LIGHT'],advantage:'시작 시 한 번 받는 확률 보호막과 달리, 전투 중 필요한 대상에게 보호막을 다시 만들 수 있습니다.',tradeoff:'회복원과 실제 초과 회복이 필요합니다. 이 카드 자체는 HP를 회복시키지 않습니다.',synergy:'회복 용병/치유 편성 · 유지력 위주 전투',
    example:{label:'HP 450,000/500,000인 아군의 승인된 회복량',value:100000,unit:'회복'}
  },
  {
    code:'S2_CONSTELLATION_SHIFT',slug:'constellation-shift',number:'05',name:'성좌 전환',role:'제어',accent:'#82ceff',motif:'성좌의 · 교대하는 두 탑',scopes:['PVE','PVP'],
    hook:'무너지는 전열에, 새로운 별이 들어선다.',
    novelty:'위기의 전열과 건강한 후열을 실제로 교대합니다. 후퇴한 아군이 다음 행동까지 버틸 여유도 줍니다.',
    trigger:'살아 있는 전열 일반 아군의 HP가 35% 이하',target:'해당 전열 + HP 비율이 가장 높은 교대 가능한 후열',limit:'팀당 1회 · 진행 중인 공격 정산 후',
    stats:[{key:'gauge',label:'후퇴 아군 게이지',base:20,unit:''},{key:'reduction',label:'후퇴 직후 피해 감소',base:20,unit:'%'}],fixed:{threshold:35,hits:2,teamActivations:1},
    steps:['전열 위기 조건 확인','교대 가능한 건강한 후열 선택','현재 공격이 끝난 뒤 위치 교대','후퇴 아군 게이지·2타 보호'],
    guards:['상태만 바꾸지 않고 서버 위치·표적 선택·V3 배치를 같은 이벤트로 갱신해야 함','교대할 후열이 없으면 발동 횟수를 소비하지 않음','후퇴 보호는 다음 직접 피격 2회이며 다른 감소와 합산해 무적을 만들지 않음'],
    compare:['FOLLOWUP_HASTE','TIME_DISTORTION'],advantage:'게이지만 조정하던 S1에서 더 나아가 공격을 받을 위치 자체를 바꾸고 위기 아군을 보호합니다.',tradeoff:'후열이 필요하며 이미 확정된 공격을 취소하거나 사망한 아군을 되살리지 않습니다.',synergy:'전열/후열이 모두 살아 있는 균형 편성',
    example:{label:'후퇴 직후 다음 직접 피격 1회의 감소 전 피해',value:100000,unit:'피해'}
  },
  {
    code:'S2_SHIELD_LEDGER',slug:'shield-ledger',number:'06',name:'붕괴 장부',role:'공격',accent:'#ffb06b',motif:'흑요 장부 · 붕괴하는 방패',scopes:['PVE','PVP'],
    hook:'막아낸 모든 충격이, 파괴의 빚으로 돌아온다.',
    novelty:'보호막에 가한 실제 피해를 저장하다가 보호막이 깨지는 순간 HP 피해와 방어 약화로 돌려줍니다.',
    trigger:'장착자의 직접 공격으로 기록 대상의 보호막이 0이 될 때',target:'기록 중인 보호막 대상 1명',limit:'전투당 폭발 1회 · 기록 상한 공격력 200%',
    stats:[{key:'record',label:'보호막 피해 기록',base:50,unit:'%'},{key:'breakDefense',label:'폭발 후 방어 감소',base:12,unit:'%'}],fixed:{release:60,recordAttackCap:200,hits:2,activations:1},
    steps:['실제 보호막 피해를 기록','보호막 파괴 확인','기록량의 60%를 HP 피해로 방출','다음 직접 피격 2회 방어 약화'],
    guards:['표적 변경 시 기존 기록을 합치지 않고 비움','도트·반격·복제·장부 폭발은 기록을 채우지 않음','기록 상한과 아포칼립스 마법 피해 상한을 함께 적용'],
    compare:['SHIELD_SIPHON','DOOM_MARK'],advantage:'확률 강탈 대신 보호막을 직접 깨는 공격 편성에 확정 폭발과 다음 공격의 방어 약화를 제공합니다.',tradeoff:'보호막이 없거나 파괴 전에 다른 적으로 바꾸면 이득을 얻기 어렵습니다.',synergy:'보호막이 큰 적 · 집중 파괴 후 연속 타격',
    example:{label:'공격력 100,000인 장착자의 누적 실제 보호막 피해',value:200000,unit:'피해'}
  },
  {
    code:'S2_FALLEN_STAR',slug:'fallen-star',number:'07',name:'별의 유언',role:'지원',accent:'#f2cfaf',motif:'마지막 별 · 이어받는 성광',scopes:['PVE','PVP'],
    hook:'한 별이 지면, 남은 별들이 더 밝게 타오른다.',
    novelty:'부활까지 끝난 최종 사망을 계기로 생존 일반 아군 전체의 공격력과 행동 게이지를 끌어올립니다.',
    trigger:'아군 일반 카드의 첫 최종 사망',target:'생존한 일반 아군 전체',limit:'팀당 1회 · 부활/생존 판정 완료 후',
    stats:[{key:'attack',label:'생존 아군 공격력',base:8,unit:'%'},{key:'gauge',label:'생존 아군 게이지',base:12,unit:''}],fixed:{teamActivations:1},
    steps:['치명 피해와 생존 효과 정산','최종 사망만 확정','생존 일반 아군에게 공격력 부여','행동 게이지 즉시 충전'],
    guards:['부활한 아군·소환체의 소멸은 최종 사망으로 집계하지 않음','장착자 자신의 최종 사망에도 예약된 유언은 1회 실행','대리 피해에서 발생한 사망까지 정산한 뒤 살아 있는 대상만 적용'],
    compare:['OPENING_ATTACK','PHOENIX_REVIVE'],advantage:'실패한 자기 부활을 기다리는 대신, 첫 전사 이후 남은 팀 전체의 역전 기회를 확정 지원합니다.',tradeoff:'아군 사망 전에는 이득이 없고 이미 사망한 아군을 되살리지 않습니다.',synergy:'장기전 · 생존한 공격수가 여럿인 편성',
    example:{label:'생존 일반 아군 4명의 개별 기본 공격력',value:100000,unit:'공격력'}
  },
  {
    code:'S2_ARCANE_MIRROR',slug:'arcane-mirror',number:'08',name:'만상 거울',role:'제어',accent:'#cfadff',motif:'흑은 거울 · 뒤집힌 마법',scopes:['PVP'],
    hook:'상대가 꺼낸 한 수를, 나의 수로 되돌린다.',
    novelty:'상대가 처음 성공한 복제 가능한 마법을 한 번 따라 합니다. 상대 편성에 따라 얻는 효과가 달라집니다.',
    trigger:'상대의 복제 허용 마법이 처음 성공한 직후',target:'효과의 아군/적군 방향을 장착자 기준으로 재지정',limit:'전투당 1회 · PVP 전용 · 원본 1개',
    stats:[{key:'efficiency',label:'원본 효과 복제 효율',base:70,unit:'%'}],fixed:{activations:1},
    steps:['상대의 실제 성공 이벤트 확인','복제 허용 목록·미복제 원본 확인','장착자 기준으로 대상·효과량 산정','복제 표시를 남기고 1회 사용 완료'],
    guards:['부활·대리·거울·전투 시작 효과·봉인·낙인·S2 효과는 1차 복제 목록에서 제외','이미 복제된 이벤트는 다시 복제하지 않음','회복 풀·보호막 상한·피해 상한은 원본과 동일하게 적용'],
    compare:['CHAIN_ECHO','PURIFY_LIGHT'],advantage:'+0부터 상대의 성공 이벤트를 확정 포착하므로 공격·회복·보호막 상황에 유연하게 대응합니다.',tradeoff:'상대에게 복제 가능한 마법 발동이 없으면 효과가 없습니다. PVE 범용 카드로 취급하지 않습니다.',synergy:'복제 가능한 S1을 쓰는 상대를 겨냥한 PVP 대응',
    example:{label:'상대 연쇄의 잔영이 만든 실제 추가 피해',value:45000,unit:'피해'}
  }
].map(card=>({...card,art:`../../assets/ui/magic-cards/season2/${card.slug}-source-v1.png`,activationModel:'CONDITIONAL',season:'S2',rarity:'MAGIC'}));

export const mirrorAllowlist = ['CRISIS_HEAL','PUNISH_TRAP','ARCANE_COUNTER','FOLLOWUP_HASTE','SHIELD_SIPHON','TIME_DISTORTION','PURIFY_LIGHT','CHAIN_ECHO'];
export function effectAt(card, level) {
  if(!Number.isInteger(level)||level<0||level>9)throw new RangeError('강화는 +0~+9 정수입니다.');
  return Object.fromEntries(card.stats.map(stat=>[stat.key,Math.round(stat.base*growth[level]*10)/10]));
}
