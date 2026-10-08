const bounded=(value,max)=>Math.max(0,Math.min(max,Number(value)||0));
export function normalizedEquipmentEffects(raw={}){
  const limits={hpPercent:30,attackPercent:30,speedPercent:15,shieldPercent:25,damageReductionPercent:15,criticalChancePoints:15,criticalDamagePoints:50,penetrationPoints:20,bossDamagePercent:40,shieldDamagePercent:30,leechPercent:5,criticalExtraPercent:15,echoEvery:12,echoPercent:40,uniqueEchoEvery:12,uniqueEchoPercent:40};
  return Object.fromEntries(Object.entries(limits).map(([key,max])=>[key,bounded(raw[key],max)]));
}
export function applyPveEquipmentGrowth(fighters,runtime){
  if(!runtime?.effects||!Object.values(runtime.effects).some(Number))return fighters;
  const effects=normalizedEquipmentEffects(runtime.effects);
  for(const fighter of fighters){
    if(fighter.isMonster||fighter.battleMode==='PVP')continue;
    fighter.equipmentEffects={...effects};
    fighter.attack=Math.round(fighter.attack*(1+effects.attackPercent/100));
    if(fighter.isBattleSuit)continue;
    fighter.maxHp=Math.round(fighter.maxHp*(1+effects.hpPercent/100));fighter.hp=Math.round(fighter.hp*(1+effects.hpPercent/100));
    fighter.speed*=1+effects.speedPercent/100;
    const shield=Math.round(fighter.maxHp*effects.shieldPercent/100);fighter.shield+=shield;fighter.maxShield+=shield;
  }
  return fighters;
}
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
