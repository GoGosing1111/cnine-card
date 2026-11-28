import {apportionUnits} from './reward-apportionment-v1.mjs';

export const RATE_TOTAL = 100_000_000;
export const BREAD_COIN_MAX = 500_000_000_000_000;
export const BREAD_STAR_MAX = 1_000_000_000;
export function breadRewardLimit(code) {
  if (code === 'COIN') return BREAD_COIN_MAX;
  if (code === 'MASTER_STAR') return BREAD_STAR_MAX;
  return Number.MAX_SAFE_INTEGER;
}
// Keep every digit when a tier is not an exact multiple of a Korean large-number unit.
export function rewardAmount(quantity) {
  for (const [scale, unit] of [[1e12,'조'],[1e8,'억'],[1e4,'만']]) {
    if (quantity >= scale && quantity % scale === 0) return (quantity / scale).toLocaleString('ko-KR') + unit;
  }
  return quantity.toLocaleString('ko-KR');
}
export const percent = units => Number((units / 1_000_000).toFixed(6)).toString();
export function percentUnits(input) {
  const text = String(input).trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) throw Error('확률은 소수점 여섯 자리까지 입력하세요.');
  const [whole, fraction = ''] = text.split('.');
  const units = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(units) || units > RATE_TOTAL) throw Error('확률은 0~100% 범위로 입력하세요.');
  return units;
}
export function breadOdds(input) {
  if (!Array.isArray(input) || !input.length) throw Error('개봉할 보상을 한 종류 이상 추가하세요.');
  let fixed = 0;
  const rows = input.map(item => {
    if (typeof item?.code !== 'string' || !item.code || !Number.isSafeInteger(item.quantity) || item.quantity < 1) throw Error('아이템과 지급 수량을 확인하세요.');
    if (item.quantity > breadRewardLimit(item.code)) throw Error(item.code === 'COIN' ? '일반 코인은 한 마리당 최대 500조까지 설정할 수 있습니다.' : '마스터의 별은 한 마리당 최대 10억 개까지 설정할 수 있습니다.');
    if (item.mode === 'auto') {
      if (!Number.isSafeInteger(item.weight) || item.weight < 1 || item.weight > RATE_TOTAL) throw Error('자동 배분 가중치는 1~1억 사이 정수로 입력하세요.');
      return {code:item.code, quantity:item.quantity, mode:'auto', weight:item.weight};
    }
    if (item.mode && item.mode !== 'fixed') throw Error('확률 배분 방식을 확인하세요.');
    const units = item.fixedUnits ?? item.units ?? item.chance * 10000;
    if (!Number.isSafeInteger(units) || units < 0 || units > RATE_TOTAL) throw Error('고정 확률은 0~100% 범위로 입력하세요.');
    fixed += units;
    return {code:item.code, quantity:item.quantity, mode:'fixed', fixedUnits:units, units};
  });
  if (fixed > RATE_TOTAL) throw Error('고정 확률 합계가 100%를 넘습니다.');
  const auto = rows.flatMap((row, i) => row.mode === 'auto' ? [{position:i, units:row.weight}] : []);
  if (!auto.length && fixed !== RATE_TOTAL) throw Error('자동 배분 행을 추가하거나 입력 비율을 100%로 맞춰 주세요.');
  for (const row of apportionUnits(auto, RATE_TOTAL - fixed)) rows[row.position].units = row.units;
  return rows;
}

export function scaleFixedRates(values) {
  if (!values.some(units => units > 0)) throw Error('비례 조정에 사용할 확률을 하나 이상 입력하세요.');
  return apportionUnits(values.map(units => ({units})), RATE_TOTAL).map(row => row.units);
}

export const STARTER_REWARDS = [
  ['COIN', 10_000_000_000_000, 16], ['COIN', 100_000_000_000_000, 3], ['COIN', BREAD_COIN_MAX, 1],
  ['MASTER_STAR', 1_000_000, 40], ['MASTER_STAR', 100_000_000, 8], ['MASTER_STAR', BREAD_STAR_MAX, 2],
  ['ARMOR_ENHANCEMENT_SCROLL', 1, 50], ['WEAPON_ENHANCEMENT_SCROLL', 1, 36], ['RANK_EXP_POTION_2X_60M', 1, 24],
  ['CNINE_STREAMER_SHARD', 1, 14], ['SUIT_CORE_8', 1, 4], ['CNINE_WINTER_BOX', 1, 2]
].map(([code,quantity,weight]) => ({code,quantity,mode:'auto',weight}));
