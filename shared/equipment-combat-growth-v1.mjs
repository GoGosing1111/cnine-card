const bounded=(value,max)=>Math.max(0,Math.min(max,Number(value)||0));
export const POLISH_EFFECT_KEYS=['attackPercent','criticalChancePoints','criticalDamagePoints','bossDamagePercent','penetrationPoints'];
const polishValue=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
export function normalizedEquipmentEffects(raw={},polish={}){
  const limits={hpPercent:30,attackPercent:30,speedPercent:15,shieldPercent:25,damageReductionPercent:15,criticalChancePoints:15,criticalDamagePoints:50,penetrationPoints:20,bossDamagePercent:40,shieldDamagePercent:30,leechPercent:5,criticalExtraPercent:15,echoEvery:12,echoPercent:40,uniqueEchoEvery:12,uniqueEchoPercent:40};
  return Object.fromEntries(Object.entries(limits).map(([key,max])=>{
    // Earned polish is included in raw. Cap ordinary set bonuses separately.
    const growth=POLISH_EFFECT_KEYS.includes(key)?Math.min(polishValue(raw[key]),polishValue(polish?.[key])):0;
    return [key,bounded((Number(raw[key])||0)-growth,max)+growth];
  }));
}
export function addIndividualEquipmentEffects(standard,individual){
  if(!individual)return standard;
  const effects={...standard};
  for(const [key,value] of Object.entries(individual))effects[key]=(effects[key]||0)+value;
  return effects;
}
function applyEquipmentGrowth(fighters,runtime,allowMercenaryPvp=false,individual=null){
  if(!runtime?.effects||(!individual&&!Object.values(runtime.effects).some(Number)))return fighters;
  for(const fighter of fighters){
    if(fighter.isMonster||fighter.battleMode==='PVP'&&!(allowMercenaryPvp&&fighter.isMercenary))continue;
    const old=fighter.equipmentStandardEffects||fighter.equipmentEffects||{},combined={...runtime.effects};
    for(const [key,value] of Object.entries(old))combined[key]=key==='echoEvery'||key==='uniqueEchoEvery'?Math.min(value||Infinity,combined[key]||Infinity):value+(Number(combined[key])||0);
    for(const key of ['echoEvery','uniqueEchoEvery'])if(combined[key]===Infinity)combined[key]=0;
    const polish={};
    if(fighter.battleMode!=='PVP')for(const key of POLISH_EFFECT_KEYS){
      const value=polishValue(fighter.equipmentPolishEffects?.[key])+polishValue(runtime.polishEffects?.[key]);
      if(value)polish[key]=Math.min(value,polishValue(combined[key]));
    }
    const standard=normalizedEquipmentEffects(combined,polish);
    if(Object.keys(polish).length)fighter.equipmentPolishEffects=polish;
    if(individual&&fighter.isMercenary)fighter.equipmentIndividualEffects=individual;
    const personal=fighter.isMercenary&&fighter.equipmentIndividualEffects;
    if(personal)fighter.equipmentStandardEffects=standard;
    const effects=addIndividualEquipmentEffects(standard,personal);
    // Personal mercenary gear and ordinary account polish can meet here.
    // Recompute from the unmodified entry stats; add polish after set caps.
    const base=fighter.equipmentGrowthBase??={attack:fighter.attack,maxHp:fighter.maxHp,hp:fighter.hp,speed:fighter.speed,shield:fighter.shield,maxShield:fighter.maxShield};
    fighter.equipmentEffects={...effects};
    fighter.attack=Math.round(base.attack*(1+effects.attackPercent/100));
    if(fighter.isBattleSuit)continue;
    fighter.maxHp=Math.round(base.maxHp*(1+effects.hpPercent/100));fighter.hp=Math.round(base.hp*(1+effects.hpPercent/100));
    fighter.speed=base.speed*(1+effects.speedPercent/100);
    const shield=Math.round(fighter.maxHp*effects.shieldPercent/100);fighter.shield=base.shield+shield;fighter.maxShield=base.maxShield+shield;
  }
  return fighters;
}
export const applyPveEquipmentGrowth=(fighters,runtime,individual=null)=>applyEquipmentGrowth(fighters,runtime,false,individual);
export const applyPvpMercenaryEquipmentGrowth=(fighter,effects,individual=null)=>fighter?.isMercenary&&fighter.battleMode==='PVP'?applyEquipmentGrowth([fighter],{effects},true,individual):[fighter];
export function equipmentHitMultiplier(actor,target,critical){
  const fx=actor.equipmentEffects;if(!fx)return 1;
  return 1+(target.isBoss?fx.bossDamagePercent:0)/100+(target.shield>0?fx.shieldDamagePercent:0)/100+(critical?fx.criticalExtraPercent:0)/100;
}
export function equipmentAfterBasic(actor,target,dealt,{damage,knockout,emit}){
  const fx=actor.equipmentEffects;if(!fx||actor.isBattleSuit||actor.isMonster)return;
  actor.equipmentBasicCount=(actor.equipmentBasicCount||0)+1;
  if(fx.leechPercent&&actor.hp>0&&actor.hp<actor.maxHp){
    const totalCap=actor.maxHp*.25,used=actor.equipmentHealUsed||0;
    const amount=Math.max(0,Math.min(actor.maxHp-actor.hp,actor.maxHp*.015,totalCap-used,Math.round(dealt*fx.leechPercent/100)));
    if(amount){actor.hp+=amount;actor.equipmentHealUsed=used+amount;emit('REGEN',{targetId:actor.id,amount,hpAfter:actor.hp,maxHp:actor.maxHp,label:'장비 · 생체 회복'});}
  }
  let ratio=0;
  for(const [every,percent] of [[fx.echoEvery,fx.echoPercent],[fx.uniqueEchoEvery,fx.uniqueEchoPercent]])if(every>=2&&actor.equipmentBasicCount%Math.floor(every)===0)ratio+=percent;
  if(ratio&&target.hp>0){const state=damage(target,Math.round(dealt*Math.min(ratio,60)/100),{actor,direct:false});actor.damageDealt+=state.hpDamage+state.absorbed;emit('TURN',{actorId:actor.id,targetId:target.id,damage:state.hpDamage,absorbed:state.absorbed,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield,label:'장비 · 연속 타격',equipmentEcho:true});knockout(target);}
}
