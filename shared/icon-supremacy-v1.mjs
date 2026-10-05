// Highest-grade floor; source photography/collection base power stays unchanged.
export const ICON_SUPREMACY = Object.freeze({version:'20261005-fur15-v1',deckLimit:2,margin:1.2});
export const ICON_ROLE_STAT_BONUS = Object.freeze({
 ATTACK:{attack:1.12},ASSASSIN:{attack:1.06,speed:1.08},ASSAULT:{attack:1.06,maxHp:1.08},
 DEFENSE:{defense:1.15,maxHp:1.12},CURSE:{speed:1.08},MAGIC:{attack:1.12},SUPPORT:{maxHp:1.12}
});
export function validatedIconSupremacy(value){
 if(!value||value.version!==ICON_SUPREMACY.version||!Number.isFinite(value.power)||value.power<=0||value.power>1e15)return null;
 for(const mode of ['PVE','PVP',...(value.CAPTAIN?['CAPTAIN']:[])])for(const key of ['maxHp','attack','defense','speed']){
  const x=value[mode]?.[key];if(!x||!Number.isFinite(x.base)||!Number.isFinite(x.perPower)||x.base<0||x.base>1e15||x.perPower<0||x.perPower>1e6)return null;
 }
 return value;
}
export function iconStatFloor(reference,mode,key,equipmentShare=0,role=''){
 const row=reference?.[mode]?.[key];if(!row)return 0;
 // Reserve one integer unit for the comparator's final stat rounding.
 return Math.ceil((row.base+(equipmentShare>0?1:0)+Math.max(0,equipmentShare)*row.perPower)*ICON_SUPREMACY.margin*(ICON_ROLE_STAT_BONUS[role]?.[key]||1));
}
