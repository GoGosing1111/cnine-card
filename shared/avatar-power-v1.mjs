export function avatarPowerScale(percent=0){
  const value=Number(percent);
  return 1+(Number.isFinite(value)?Math.max(0,Math.min(100,value)):0)/100;
}
export function avatarScaledPower(power,percent=0){const scale=avatarPowerScale(percent);return scale===1?Number(power||0):Math.round(Number(power||0)*scale);}
export function avatarPoweredCard(card,percent=0){
  if(avatarPowerScale(percent)===1)return card;
  const supremacy=card.iconRole?.supremacy;
  const reference=supremacy?{...supremacy,power:avatarScaledPower(supremacy.power,percent),
    ...Object.fromEntries(['PVE','PVP','CAPTAIN'].filter(mode=>supremacy[mode]).map(mode=>[mode,
      Object.fromEntries(Object.entries(supremacy[mode]).map(([key,value])=>[key,{...value,base:value.base*avatarPowerScale(percent)}]))
    ]))}:null;
  return {...card,power:avatarScaledPower(card.power,percent),
    ...(reference?{iconRole:{...card.iconRole,supremacy:reference}}:{}),
    ...(card.effectivePower==null?{}:{effectivePower:avatarScaledPower(card.effectivePower,percent)}),
    ...(card.equipmentShare==null?{}:{equipmentShare:avatarScaledPower(card.equipmentShare,percent)})};
}
