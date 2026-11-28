import {apportionUnits} from './reward-apportionment-v1.mjs';

export const RATE_TOTAL = 100_000_000;
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
  ['MASTER_STAR', 1_000_000, 35], ['ARMOR_ENHANCEMENT_SCROLL', 1, 25],
  ['WEAPON_ENHANCEMENT_SCROLL', 1, 18], ['RANK_EXP_POTION_2X_60M', 1, 12],
  ['CNINE_STREAMER_SHARD', 1, 7], ['SUIT_CORE_8', 1, 2], ['CNINE_WINTER_BOX', 1, 1]
].map(([code,quantity,weight]) => ({code,quantity,mode:'auto',weight}));
