import {iconHealingAmount} from '../shared/icon-roles-v1.mjs';
const living=a=>a?.alive&&a.hp>0&&!a.untargetable;
// Per-simulation state; no global turn counters, DB calls or extra actions.
export function createCoopTraitRuntime({allies,emit}){
 const cursors=new Map(),regenSpent=new Map();
 return {
  targetTeam(actor,team){
   if(!actor.coopTraits)return team;
   const owners=[...new Set(allies.map(a=>a.ownerId))].filter(id=>team.some(a=>a.ownerId===id&&living(a)));
   if(!owners.length)return team;
   const cursor=cursors.get(actor.id)??(actor.slot%owners.length),id=owners[cursor%owners.length];
   cursors.set(actor.id,cursor+1);return team.filter(a=>a.ownerId===id);
  },
  beforeDamage(target,amount){
   const t=target.coopTraits;if(!t||target.shield<=0||!t.wardResistancePercent)return amount;
   // Actual debuffs remove the ward resistance. No unit/rarity whitelist.
   const exposed=target.iconVulnerability||target.defense<target.coopBaseDefense;
   return Math.round(amount*(1-(exposed?0:t.wardResistancePercent)/100));
  },
  beforeAction(actor){
   const t=actor.coopTraits;if(!t||!living(actor))return;
   if(t.regenPercent&&actor.hp<actor.maxHp){
    const spent=regenSpent.get(actor.id)||0,budget=actor.maxHp*t.regenBudgetPercent/100;
    const amount=Math.max(0,Math.floor(Math.min(actor.maxHp-actor.hp,budget-spent,iconHealingAmount(actor,actor.maxHp*t.regenPercent/100))));
    if(amount){actor.hp+=amount;regenSpent.set(actor.id,spent+amount);emit('REGEN',{actorId:actor.id,targetId:actor.id,amount,hpAfter:actor.hp,maxHp:actor.maxHp,label:'역병 재생',cooperativeTrait:true});}
   }
   if(t.wardPercent&&actor.actions%3===0){
    const amount=Math.max(0,Math.floor(Math.min(actor.maxHp*t.wardPercent/100,actor.maxHp*t.wardCapPercent/100-actor.shield)));
    if(amount){actor.shield+=amount;actor.maxShield=Math.max(actor.maxShield,actor.shield);emit('START_EFFECT',{actorId:actor.id,targetId:actor.id,effect:'SHIELD',amount,shieldAfter:actor.shield,label:'철벽 재생',cooperativeTrait:true});}
   }
  },
  afterHit(actor,target){
   const t=actor.coopTraits;if(!t||!living(target))return;
   if(t.venomPercent&&!target.poisonImmune){
    target.iconCurse={sourceId:actor.id,stacks:1,remaining:3,damage:Math.round(actor.attack*t.venomPercent/100),healReductionPercent:20};
    emit('ICON_STATUS',{actorId:actor.id,targetId:target.id,status:'CURSE',remaining:3,healReductionPercent:20,label:'역병 독 · 정화 가능',cooperativeTrait:true});
   }
   if(t.vulnerabilityPercent&&!target.controlImmune){
    target.iconVulnerability={sourceId:actor.id,percent:t.vulnerabilityPercent,remaining:2};
    emit('ICON_STATUS',{actorId:actor.id,targetId:target.id,status:'VULNERABLE',percent:t.vulnerabilityPercent,remaining:2,label:'감전 약화 · 정화 가능',cooperativeTrait:true});
   }
  }
 };
}
