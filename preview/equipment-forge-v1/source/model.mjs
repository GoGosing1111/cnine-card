// Review-only economy. These fixtures are never loaded by account or reward APIs.
export const PREVIEW_POLICY = Object.freeze({
  previewOnly: true, liveEnabled: false, minimumSuccess: 10,
  protectionSources: ['GAMEPLAY'], boxAcquisition: false,
  protectionConsumption: 'ON_PREVENTED_DESTRUCTION',
  restorationEligibility: 'DEMO_RECORDS_ONLY',
});

const weaponRoot = '/assets/ui/project-v/account-battle-suits/weapons/';
export const EQUIPMENT = Object.freeze([
  { id: 'demo-gold-ar', name: '금룡 돌격소총', collection: '동방무기상', kind: 'rifle', kindLabel: '돌격소총', image: weaponRoot + 'gilded-dragon-ar-v1.png', grade: 'MYTHIC', level: 7, basePower: 240000 },
  { id: 'demo-sks', name: '소버린 SKS', collection: '소버린', kind: 'rifle', kindLabel: '지정사수소총', image: weaponRoot + 'sovereign-sks-v1.png', grade: 'MYTHIC', level: 5, basePower: 210000 },
  { id: 'demo-m200', name: '인피니티 M200', collection: '인피니티', kind: 'sniper', kindLabel: '저격소총', image: weaponRoot + 'infinity-m200-v1.png', grade: 'MYTHIC', level: 9, basePower: 230000 },
  { id: 'demo-m4', name: '아발론 M4A1', collection: '아발론', kind: 'rifle', kindLabel: '돌격소총', image: weaponRoot + 'avalon-m4a1-v1.png', grade: 'LEGENDARY', level: 3, basePower: 150000 },
  { id: 'demo-ak', name: '인피니티 AK', collection: '인피니티', kind: 'rifle', kindLabel: '돌격소총', image: weaponRoot + 'infinity-ak-v1.png', grade: 'LEGENDARY', level: 6, basePower: 180000 },
  { id: 'demo-gold-sniper', name: '금룡 대물저격총', collection: '동방무기상', kind: 'sniper', kindLabel: '대물저격총', image: weaponRoot + 'gilded-dragon-antimateriel-v1.png', grade: 'MYTHIC', level: 10, basePower: 280000 },
]);

export const DEFAULT_RATES = Object.freeze([
  [100, 0, 0], [90, 10, 0], [80, 20, 0], [70, 30, 0], [60, 35, 5],
  [50, 42, 8], [40, 50, 10], [30, 55, 15], [25, 55, 20], [20, 55, 25],
  [18, 52, 30], [15, 50, 35], [12, 48, 40], [10, 45, 45], [10, 40, 50],
].map(([success, maintain, destroy]) => Object.freeze({ success, maintain, destroy })));

export function validateRates(input) {
  const keys = ['success', 'maintain', 'destroy'];
  if (!input || keys.some(key => typeof input[key] !== 'number' || !Number.isFinite(input[key]))) throw new Error('세 확률을 숫자로 입력하세요.');
  if (input.success < 10 || input.success > 100) throw new Error('성공률은 10% 이상, 100% 이하여야 합니다.');
  if (keys.some(key => input[key] < 0 || input[key] > 100 || Math.abs(input[key] * 100 - Math.round(input[key] * 100)) > 1e-7)) throw new Error('확률은 0~100%, 소수 둘째 자리까지 입력하세요.');
  const units = keys.map(key => Math.round(input[key] * 100));
  if (units.reduce((sum, value) => sum + value, 0) !== 10000) throw new Error('성공·유지·파괴 확률의 합은 100%여야 합니다.');
  return Object.fromEntries(keys.map((key, index) => [key, units[index] / 100]));
}

export function rollOutcome(rates, roll) {
  const r = validateRates(rates);
  if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('추첨 값은 0 이상 1 미만이어야 합니다.');
  const value = roll * 100;
  return value < r.success ? 'success' : value < r.success + r.maintain ? 'maintain' : 'destroy';
}

export function displayedRates(rates, protectedAttempt) {
  const r = validateRates(rates);
  return protectedAttempt ? { success: r.success, maintain: +(r.maintain + r.destroy).toFixed(2), destroy: 0 } : r;
}

export const canAcquireProtection = source => PREVIEW_POLICY.protectionSources.includes(source);
export const powerAt = (item, level = item.level) => Math.round(item.basePower * (1 + level * .06));
export const costAt = level => ({ coins: 25000 * (level + 1), crystals: 2 * (level + 1) });

export class ForgeSimulation {
  constructor() {
    this.items = structuredClone(EQUIPMENT).map(item => ({ ...item, status: 'owned' }));
    this.rates = structuredClone(DEFAULT_RATES);
    this.wallet = { coins: 12840000, crystals: 480, protection: 2, restoration: 1 };
    this.records = [{ id: 'demo-destruction-001', item: { ...structuredClone(EQUIPMENT[1]), id: 'demo-lost-sks', level: 8, status: 'destroyed' }, destroyedAt: '2026-09-10T12:42:00+09:00', restoredAt: null, sample: true }];
    this.history = [];
    this.receipts = new Map();
  }

  setRates(rows) {
    if (!Array.isArray(rows) || rows.length !== DEFAULT_RATES.length) throw new Error('15개 시연 단계의 확률을 모두 입력하세요.');
    const next = rows.map(validateRates); // All-or-nothing validation before replacing the draft.
    this.rates = next;
  }

  enhance({ itemId, protection = false, requestId, roll }) {
    if (!requestId || typeof requestId !== 'string') throw new Error('시연 요청 번호가 필요합니다.');
    if (this.receipts.has(requestId)) return structuredClone(this.receipts.get(requestId));
    const item = this.items.find(row => row.id === itemId && row.status === 'owned');
    if (!item) throw new Error('보유 중인 장비를 선택하세요.');
    if (item.level >= this.rates.length) throw new Error('시연 최대 강화 단계입니다.');
    const rates = validateRates(this.rates[item.level]), cost = costAt(item.level);
    if (this.wallet.coins < cost.coins || this.wallet.crystals < cost.crystals) throw new Error('시연 재료가 부족합니다. 시연 설정에서 초기화할 수 있습니다.');
    if (protection && this.wallet.protection < 1) throw new Error('장비보호권이 없습니다.');
    const outcome = rollOutcome(rates, roll), before = structuredClone(item);
    const protectedDestruction = outcome === 'destroy' && protection;
    this.wallet.coins -= cost.coins;
    this.wallet.crystals -= cost.crystals;
    let recordId = null;
    if (outcome === 'success') item.level++;
    if (protectedDestruction) this.wallet.protection--;
    if (outcome === 'destroy' && !protectedDestruction) {
      item.status = 'destroyed';
      recordId = 'destroy-' + requestId;
      this.records.unshift({ id: recordId, item: { ...before, status: 'destroyed' }, destroyedAt: new Date().toISOString(), restoredAt: null, sample: false });
    }
    const receipt = { requestId, kind: 'enhance', outcome, visual: protectedDestruction ? 'protected' : outcome, protectedDestruction, before, after: structuredClone(item), cost, recordId, at: new Date().toISOString() };
    this.history.unshift(receipt);
    this.receipts.set(requestId, receipt);
    return structuredClone(receipt);
  }

  restore({ recordId, requestId }) {
    if (!requestId || typeof requestId !== 'string') throw new Error('시연 요청 번호가 필요합니다.');
    if (this.receipts.has(requestId)) return structuredClone(this.receipts.get(requestId));
    const record = this.records.find(row => row.id === recordId);
    if (!record || record.restoredAt) throw new Error('복구 가능한 파괴 기록을 선택하세요.');
    if (this.wallet.restoration < 1) throw new Error('장비 복구 쿠폰이 없습니다.');
    const previous = this.items.find(item => item.id === record.item.id);
    if (previous && previous.status !== 'destroyed') throw new Error('이미 보유 중인 장비는 중복 복구할 수 없습니다.');
    const restored = { ...structuredClone(record.item), status: 'owned' };
    if (previous) Object.assign(previous, restored); else this.items.push(restored);
    this.wallet.restoration--;
    record.restoredAt = new Date().toISOString();
    const receipt = { requestId, kind: 'restore', outcome: 'restore', visual: 'restore', before: structuredClone(record.item), after: structuredClone(restored), recordId, at: record.restoredAt };
    this.history.unshift(receipt);
    this.receipts.set(requestId, receipt);
    return structuredClone(receipt);
  }
}
