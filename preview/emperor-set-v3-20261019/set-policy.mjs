export const EMPEROR_PARTS=Object.freeze({TOP:'EMPEROR_TOP',BOTTOM:'EMPEROR_BOTTOM',SHOES:'EMPEROR_SHOES',ACCESSORY:'EMPEROR_DUAL_DISK'});
// Preview contract: the server will supply the equipped instances when released.
export function emperorSetEligible(equipped=[]){
 return Object.entries(EMPEROR_PARTS).every(([slot,code])=>equipped.some(item=>item.slot===slot&&item.code===code&&item.equipped===true&&Number(item.level)>=10));
}
export const PREVIEW_LOADOUT=Object.freeze(Object.entries(EMPEROR_PARTS).map(([slot,code])=>Object.freeze({slot,code,level:10,equipped:true})));
