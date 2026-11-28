import {createPveBattleV2} from './_battle_v2_preview.js';
import {companionBattleOptions} from '../shared/companion-battle-snapshot-v1.mjs';
import {finalizeEscortObjectiveTimeline} from './_escort_operation.js';
import {battlePlan} from '../shared/field-operation-battle-plan.mjs';

const art={guard:'/preview/scrapyard-v3-v1/assets/polarity-sd-v1.png',boss:'/preview/scrapyard-v3-v1/assets/atlas-sd-v1.png',escort:'/assets/ui/escort/bosses/velkar-siege-commander-v1.webp',truck:'/assets/ui/escort/escort-armored-carrier-v1.webp'};
function simulate(s,mode,t,seed){
 const yard=mode==='yard',p=yard?t.yard:t.escort;
 const foe=(id,name,power,boss,image)=>({id,name,battle_power:Math.round(power),is_boss:boss?1:0,image,pve_stat_caps_unlocked:yard&&t.breakCaps===true});
 const guard=foe('POLARITY','극성 회수기',p*.24,false,art.guard),boss=yard?foe('ATLAS','유압거신 아틀라스',p,true,art.boss):foe('VELKAR','습격 지휘관',p,true,art.escort);
 const encounter={initialCount:1,maxActions:t.actions??155,maxDuration:t.clock??3.4,forcedMonsterEvery:4,instances:[{instanceId:'POLARITY',slot:0,monster:guard},{instanceId:'ATLAS',slot:1,afterClear:true,monster:boss}]};
 const objective={id:'ESCORT_OBJECTIVE',name:'장갑 수송차',hp:100,maxHp:100,image:art.truck};
 const b=createPveBattleV2({pet:s.pet,pveEquipmentRuntime:s.characterBonus?.pveEquipmentRuntime,cards:s.cards,magicCards:s.magicCards,characterBonus:s.cardSupportBonus,battleSuit:s.battleSuit,...companionBattleOptions(s),singleHealerBonus:s.singleHealerBonus,ultimateDamage:s.ultimateDamage,seed,...(yard?{encounter}:{monster:boss,escortObjective:objective})});
 const bossId=yard?b.encounter.instances[1].id:b.teams.B.cards[0].id,guardId=yard?b.encounter.instances[0].id:null;
 let rows=b.result.timeline,hull=100,cargo=100,reason=b.result.reason,strikes=0;
 if(!yard){
  const attacks=rows.filter(e=>e.type==='ESCORT_OBJECTIVE_ATTACK');
  const formation=b.teams.A.cards;
  const guardCount=formation.filter(a=>a.type==='DEFENSE').length;
  const coverage=formation.some(a=>a.type==='SPEED');
  const perStrike=t.hit*(1-.07*Math.min(2,guardCount));
  finalizeEscortObjectiveTimeline(b,{hpBefore:1000,maxHp:1000,totalDamage:Math.round(attacks.length*perStrike*10),burstEvery:3,burstShare:.52});
  let stop=-1;
  for(const [i,e] of rows.entries()){
   if(e.type!=='ESCORT_OBJECTIVE_ATTACK')continue;
   strikes++; hull=Math.round(e.objectiveHpAfter/10);if(e.objectiveHpAfter>0)hull=Math.max(1,hull);
   const loss=strikes%2===0?Math.round(t.cargo*(coverage ? .55 : 1)):0;
   cargo=Math.max(0,cargo-loss);Object.assign(e,{hullPercent:hull,cargoPercent:cargo,cargoDamage:loss});
   if(!e.objectiveHpAfter||!cargo){stop=i;reason=cargo?'VEHICLE_DESTROYED':'CARGO_LOST';break;}
  }
  if(stop!==-1){
   const last={...rows.at(-1),seq:rows[stop].seq+1,step:rows[stop].step,time:rows[stop].time,type:'RESULT',winner:'B',reason};
   rows=b.result.timeline=[...rows.slice(0,stop+1),last];b.result.winner='B';b.result.reason=reason;b.result.finalAtObjectiveLoss=true;
  }
 }
 return {b,bossId,guardId,boss,objective,won:b.result.winner==='A'&&(yard||hull>0&&cargo>0),reason,strikes,hull,cargo,events:rows.length};
}

export function buildFieldOperation(snapshot, mode, tier, seed) {
  const yard = mode === 'yard';
  const {b,bossId,guardId,boss,objective,won,reason,hull,cargo,strikes} = simulate(snapshot,mode,tier,seed);
  const cards = snapshot.cards.map(card => ({
    id:card.id, title:card.title, name:card.name, memberName:card.memberName||card.member,
    rarity:card.rarity||card.grade, image:card.image||card.image_url
  }));
  const payload = {
    mode:yard?'HUNT':'ESCORT', battlefieldMode:yard?'HUNT':'ESCORT', title:yard?'폐차장':'호송작전',
    battleV2:b, cards, accountNickname:snapshot.accountNickname,
    equippedBattleSuit:snapshot.battleSuit, equippedWeapon:snapshot.battleSuit?.weapon||null
  };
  if (yard) {
    payload.continuousEncounter = {total:2,normalCount:1,initialIds:[guardId],
      instances:b.encounter.instances.map((row,index) => ({...row,boss:index===1,name:row.title,
        displayName:row.title,sourceArt:index?art.boss:art.guard,battleSprite:index?art.boss:art.guard}))};
  } else {
    payload.monster = {id:'VELKAR',name:boss.name,isBoss:true,projectVMonsterArt:{kind:'ESCORT_SD',primaryUrl:art.escort,approved:true}};
    payload.objective = objective;
  }
  const deckPower=Object.values(snapshot.power).reduce((sum,n)=>sum+Number(n||0),0);
  const result={mode,tier,deckPower,payload,bossId,guardId,receipt:{won,reason,hull,cargo,strikes}};
  result.settlement=battlePlan(mode,result).at(-1).state;
  return result;
}
