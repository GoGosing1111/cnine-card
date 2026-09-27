// CMS weight zero is the single acquisition OFF setting. Missing weights keep
// their existing registration defaults; ownership and combat are independent.
export const mercenaryAcquisitionEnabled=(code,rules)=>rules?.cardWeights?.[code]!==0;
export function assertMercenaryAcquisitionEnabled(code,rules){
 if(!mercenaryAcquisitionEnabled(code,rules))throw Object.assign(Error('현재 획득이 중지된 용병입니다.'),{code:'MERCENARY_ACQUISITION_DISABLED',status:409,terminal:true});
}
