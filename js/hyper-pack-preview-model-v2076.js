export const HYPER_PREVIEW_KINDS = ['MISS','MASTER_STAR','MYSTIC_ENERGY','MERCENARY'];
export const HYPER_PREVIEW_LABELS = { MISS:'꽝', MASTER_STAR:'마스터의 별', MYSTIC_ENERGY:'미스틱 에너지', MERCENARY:'용병카드' };
// Scripted QC fixtures, NOT a probability model, reward pool or server grant.
export function buildHyperPreview(count, scenario = 'MIXED') {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('1~10회만 미리볼 수 있습니다.');
  if (scenario !== 'MIXED' && !HYPER_PREVIEW_KINDS.includes(scenario)) throw new Error('알 수 없는 연출입니다.');
  const sequence = ['MASTER_STAR','MISS','MYSTIC_ENERGY','MISS','MASTER_STAR','MERCENARY','MISS','MYSTIC_ENERGY','MASTER_STAR','MERCENARY'];
  return Array.from({length:count},(_,index)=>({ index, kind:scenario === 'MIXED' ? (count === 1 ? 'MERCENARY' : sequence[index]) : scenario,
    preview:true, granted:false, quantity:null }));
}
