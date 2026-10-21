// 2026-10-21: after N completed failures, the NEXT attempt is guaranteed.
export const MERCENARY_BREAKTHROUGH_PITY_VERSION='mercenary-breakthrough-pity-20261021-v1';
export const MERCENARY_BREAKTHROUGH_PITY_LIMITS=Object.freeze({5:10,10:10,15:10,20:20});
export function mercenaryBreakthroughPity(level,failures=0){
 const threshold=MERCENARY_BREAKTHROUGH_PITY_LIMITS[level];
 if(!threshold||!Number.isSafeInteger(failures)||failures<0)throw Error('용병 돌파 실패 기록을 확인하세요.');
 return {version:MERCENARY_BREAKTHROUGH_PITY_VERSION,level,failures,threshold,guaranteed:failures>=threshold};
}
export function mercenaryPityResultLabel(result){
 const p=result?.pity;if(!p)return '';
 if(result.success)return p.guaranteed?'천장 적용 · 확정 성공':'해당 단계 실패 누적 초기화';
 return `실패 누적 ${p.failuresAfter} / ${p.threshold}회`+(p.failuresAfter>=p.threshold?' · 다음 돌파 확정 성공':'');
}
