// Cosmetic only: never used by power, damage, acquisition or rewards.
export const EQUIPMENT_SET_VISUAL_VERSION = 1;
export const EQUIPMENT_SET_PARTS = Object.freeze({
  EMPEROR: Object.freeze({TOP:'EMPEROR_TOP',BOTTOM:'EMPEROR_BOTTOM',SHOES:'EMPEROR_SHOES',ACCESSORY:'EMPEROR_DUAL_DISK'}),
  ARDEN: Object.freeze({TOP:'ARDEN_TOP',BOTTOM:'ARDEN_BOTTOM',SHOES:'ARDEN_SHOES',ACCESSORY:'ARDEN_DUAL_DISK'})
});

// The caller supplies equipped loadout rows, not best-owned inventory rows.
export function equipmentSetVisualFromRows(rows, ownerId) {
  const equipped = (Array.isArray(rows)?rows:[]).filter(row=>row.equipped!==false && (row.equipped_count===undefined || Number(row.equipped_count)>0));
  for(const [set,parts] of Object.entries(EQUIPMENT_SET_PARTS)) {
    const selected = Object.entries(parts).map(([slot,code])=>equipped.filter(row=>row.slot===slot && row.code===code));
    if(selected.some(matches=>matches.length!==1))continue;
    const levels=selected.map(([row])=>Number(row.level));
    if(levels.some(level=>!Number.isInteger(level)||level<10||level>15))continue;
    return {version:EQUIPMENT_SET_VISUAL_VERSION,set,minimumLevel:Math.min(...levels),ownerId:Number(ownerId)||null};
  }
  return null;
}

export function equipmentSetVisual(value) {
  if(!value || value.version!==1 || !Object.hasOwn(EQUIPMENT_SET_PARTS,value.set) || !Number.isInteger(value.minimumLevel) || value.minimumLevel<10 || value.minimumLevel>15)return null;
  return {version:1,set:value.set,minimumLevel:value.minimumLevel,ownerId:Number(value.ownerId)||null};
}

export function equipmentSetVisualGroups(payload) {
  if(payload?.sceneAssetKey==='JOKGAK_CITY')return [];
  const groups=[];
  for(const side of ['A','B']) {
    const team=payload?.battleV2?.teams?.[side];
    if(!team)continue;
    if(Array.isArray(team.members) && team.members.length) {
      for(const member of team.members) {
        const visual=equipmentSetVisual(member.equipmentSetVisual),ownerId=Number(member.ownerId);
        if(visual && Number.isSafeInteger(ownerId) && ownerId>0 && visual.ownerId===ownerId)groups.push({...visual,side,ownerId,scope:'OWNER'});
      }
    } else {
      const visual=equipmentSetVisual(team.equipmentSetVisual || (side==='A'?payload?.characterBonus?.pveEquipmentRuntime?.equipmentSetVisual:null));
      if(visual)groups.push({...visual,side,scope:'SIDE'});
    }
  }
  return groups;
}

export function equipmentSetOwnsActor(group, actor, side) {
  return group.side===side && actor?.battleActive!==false && !actor?.isMercenary && !actor?.battleCard?.isMercenary && (group.scope==='SIDE' || Number(actor.ownerId)===group.ownerId);
}
