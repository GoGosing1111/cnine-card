import {buildFighter,buildMonsterFighter,buildBattleSuitFighter,publicFighter,teamSummary} from './_battle_v2_preview.js';
import {jointError} from './_joint_request.js';
import {buildMercenaryFighter} from './_mercenary_combat.js';

// Projection of the EXISTING server idle-clock outcome. This module neither
// simulates another winner nor settles, advances, stops or claims an expedition.
export function buildIdleV3Playback(snapshot,state){
  if(snapshot?.cards?.length!==5||new Set(snapshot.cards.map(c=>String(c.id))).size!==5||!state?.encounter?.monster||typeof state.encounter.canClear!=='boolean')throw jointError('IDLE_V3_SNAPSHOT','원정 편성과 전황을 확인할 수 없습니다.',503);
  const current=state.encounter,progress=state.progress,win=current.canClear;
  const team=snapshot.cards.map((c,i)=>buildFighter(c,i,'A',c.uniqueAbility||null,'PVE'));
  const suit=snapshot.battleSuit?buildBattleSuitFighter(snapshot.battleSuit,5):null;
  const mercenary=buildMercenaryFighter(snapshot.mercenary,'A','PVE'),startMercenary=mercenary?[publicFighter(mercenary)]:[];
  const target=buildMonsterFighter({...current.monster,id:`IDLE:${progress.difficulty}:${progress.currentFloor}`,name:current.monster.name,
    image:current.monster.image,battle_power:current.requiredPower,is_boss:current.isBoss?1:0});
  const startA=team.map(publicFighter),startB=publicFighter(target),support=suit?[publicFighter(suit)]:[];
  const timeline=[],durationMs=Math.max(1000,Math.round(Number(current.effectiveFloorSeconds)*1000));
  let step=0;
  const hit=(actor,victim,damage,at)=>{
    const applied=Math.min(victim.hp,Math.max(0,Math.round(damage)));victim.hp-=applied;
    timeline.push({type:'TURN',seq:++step,time:at/1000,combatAtMs:at,actorId:actor.id,actorIndex:actor.slot,side:actor.side,
      actorKind:actor===suit?'BATTLE_SUIT':actor===mercenary?'MERCENARY':actor===target?'MONSTER':'CARD',damageSource:actor===suit?'BATTLE_SUIT_INDEPENDENT':'IDLE_CLOCK',
      targetId:victim.id,damage:applied,absorbed:0,critical:false,targetHpAfter:victim.hp,targetMaxHp:victim.maxHp,targetShieldAfter:0});
    if(victim.hp<=0){victim.alive=false;timeline.push({type:'KO',seq:++step,time:at/1000,combatAtMs:at,targetId:victim.id,side:victim.side});}
  };
  const attackers=[...team,...(suit?[suit]:[]),...(mercenary?[mercenary]:[])],sum=attackers.reduce((n,a)=>n+Math.max(1,a.power),0);
  const planned=target.maxHp*(win?1:.55);
  for(let round=0;round<2;round++)for(let i=0;i<attackers.length;i++){
    const at=Math.floor((round*attackers.length+i+1)/(2*attackers.length+2)*durationMs),last=round===1&&i===attackers.length-1;
    hit(attackers[i],target,last&&win?target.hp:planned*Math.max(1,attackers[i].power)/sum/2,at);
  }
  for(let i=0;i<team.length;i++)hit(target,team[i],team[i].maxHp*(win?.12:1),Math.floor(durationMs*(win?.35:.82+i*.03)));
  if(mercenary)hit(target,mercenary,mercenary.maxHp*(win?.12:1),Math.floor(durationMs*.97));
  timeline.sort((a,b)=>a.combatAtMs-b.combatAtMs||a.seq-b.seq);
  const result={winner:win?'A':'B',reason:win?'IDLE_FLOOR_CLEAR':'PARTY_WIPE',timeline:[...timeline,{type:'RESULT',combatAtMs:durationMs,time:durationMs/1000,winner:win?'A':'B',reason:win?'IDLE_FLOOR_CLEAR':'PARTY_WIPE'}],
    final:{A:team.map(publicFighter),B:[publicFighter(target)],...(mercenary?{mercenaries:{A:[publicFighter(mercenary)],B:[]}}:{})},supports:{A:support,B:[]},authority:'IDLE_SERVER_CLOCK'};
  const battleV2={schemaVersion:2,engine:'BATTLE_ENGINE_V2',rules:{outcomeAuthority:'IDLE_SERVER_CLOCK',presentationOnly:true,settlementAuthority:'idle_dungeon_progress',maxDuration:durationMs/1000,
    battleSuitTargetable:false,battleSuitOccupiesCardSlot:false},teams:{A:{cards:startA,summary:teamSummary(team),supports:support,...(mercenary?{mercenaries:startMercenary}:{})},B:{cards:[startB],summary:teamSummary([target])}},result};
  return {mode:'HUNT',battlefieldMode:'HUNT',title:'방치형 원정',phaseLabel:`${progress.difficulty} · ${progress.currentFloor}층`,cards:snapshot.cards,
    monster:{...current.monster,image:current.monster.image,battle_power:current.requiredPower},characterBonus:snapshot.characterBonus,
    equippedBattleSuit:snapshot.characterBonus?.equippedBattleSuit,equippedWeapon:snapshot.characterBonus?.equippedWeapon,
    accountNickname:snapshot.accountNickname,playerName:snapshot.accountNickname,opponentName:current.monster.name,battleV2,
    idleClock:{key:`${progress.difficulty}:${progress.currentFloor}:${progress.resets}`,durationMs,serverNow:state.serverNow,running:progress.running,offlineProgress:true,
      rewardCoin:progress.coinPerClear,claimsFromPlayback:false}};
}
