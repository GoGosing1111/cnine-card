import {randomUUID,randomInt} from 'node:crypto';
import {buildFighter,buildMonsterFighter,buildBattleSuitFighter,buildPvePlayerTeam,publicFighter,teamSummary,simulateBattleV2Preview} from '../../functions/_battle_v2_preview.js';
import {buildPreviewDeck,BATTLE_SUIT} from '../idle-v3-v1/source/idle-model.mjs';
import {CAPACITY,DIFFICULTIES,PARTIES,MONSTERS,BOSSES,LOOT_ITEMS,selectDifficulty,selectParty,chooseDropPosition,ENGINE_BASE} from './hunt-rules.mjs';
import {compactHuntTimeline} from './timeline.mjs';
import {regionById,regionalDifficulty} from '../../shared/legion-regions-v1.mjs';
import {regionKillLoot,regionBossGuarantee} from '../../shared/legion-region-loot-v1.mjs';
export {DIFFICULTIES,PARTIES};
const secureRandom=()=>randomInt(0,0x100000000)/0x100000000;
export function createHuntSession({snapshot,catalog,equipment,difficulty='normal',regionId=null,regionDifficulty=null,party='standard',seed=randomInt(1,0x7fffffff),now=Date.now,random=secureRandom,limitMs,dropPolicy}={}){
  const region=regionId?regionById(regionId):null;
  if(regionId&&!region)throw Error('INVALID_HUNT_REGION');
  const policy={...(region?regionalDifficulty(difficulty):selectDifficulty(difficulty)),...(regionDifficulty||{}),...(dropPolicy||{}),...(region?{regionId}:{} )},partyPolicy=selectParty(party),id=randomUUID();
  if(!policy.id)throw Error('INVALID_HUNT_DIFFICULTY');
  if(region){policy.regionLoot??={...policy.loot};policy.dropLifeMs??=(policy.regionLoot.lifetimeSeconds||12)*1000;}
  let cards,equippedBattleSuit,equippedWeapon,teamA,support,mercenary=null,simulationTeamA;
  if(snapshot){
    if(snapshot.cards?.length!==5||new Set(snapshot.cards.map(c=>String(c.id))).size!==5)throw Error('HUNT_DECK');
    cards=snapshot.cards;equippedBattleSuit=snapshot.characterBonus?.equippedBattleSuit||null;equippedWeapon=snapshot.characterBonus?.equippedWeapon||null;
    const team=buildPvePlayerTeam({cards,pveEquipmentRuntime:snapshot.characterBonus?.pveEquipmentRuntime,characterBonus:snapshot.cardSupportBonus,battleSuit:snapshot.battleSuit,mercenary:snapshot.mercenary});
    ({teamA,simulationTeamA}=team);support=team.battleSuitFighter;mercenary=team.mercenaryFighter;
  }else{
    cards=buildPreviewDeck(catalog).map(c=>({...c,power:partyPolicy.cardPower}));
    const suit=equipment.suits.find(s=>s.code===BATTLE_SUIT.code),weapon=equipment.weapons.find(w=>w.equipmentCode===BATTLE_SUIT.weaponCode);
    if(!suit||!weapon)throw Error('HUNT_APPROVED_EQUIPMENT_MISSING');
    equippedBattleSuit={code:suit.code,pvePower:partyPolicy.suitPower,appearance:{battleSprite:suit.image,battleHeight:278}};
    equippedWeapon={code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}};
    teamA=cards.map((c,i)=>buildFighter(c,i,'A',c.uniqueAbility||null,'PVE'));
    support=buildBattleSuitFighter({...equippedBattleSuit,weapon:equippedWeapon,accountNickname:'원정대 지원',skillChips:['SKILL_CHIP_HELICOPTER_AIRSTRIKE']});
    simulationTeamA=[...teamA,support];
  }
  const monster=(art,slot,boss=false)=>({...buildMonsterFighter({id:slot+1,name:art.name,battle_power:Math.round((boss?policy.bossPower:policy.power)*art.power),is_boss:boss?1:0,pve_difficulty:region?'LEGION_REGION':'APOCALYPSE',
    pve_attack_percent:policy.attack,pve_shield_percent:boss?policy.shield:0,pve_attack_count:boss?policy.repeat:1}),
    id:'B:'+slot+':ENCOUNTER:'+(boss?'FINAL':'INITIAL'),slot,huntArtId:art.id,...(region?{legionRegion:region.id,legionRole:art.role,legionVulnerability:boss&&region.id==='desert'?.7:!boss&&art.role==='ARMORED'?.9:1}:{})});
  const monsters=region?.monsters||MONSTERS,bosses=region?[region.boss]:BOSSES;
  const fighters=Array.from({length:CAPACITY},(_,slot)=>monster(monsters[slot%monsters.length],slot));
  const templates=monsters.map((art,slot)=>monster(art,slot));
  const finalBoss=monster(region?.boss||BOSSES[2],4,true);
  const finalAdds=region&&['coast','viscera'].includes(region.id)?[0,1].map((slot)=>({...monster(monsters[slot],slot),id:`B:${slot}:BOSS_SUPPORT`,legionBossSupport:true})):[];
  const timeLimit=limitMs??policy.limitMs;
  const result=simulateBattleV2Preview({teamA:simulationTeamA,teamB:fighters,
    sustainedEncounter:{durationMs:policy.huntDurationMs,templates,finalBoss,...(region?{regionId:region.id,finalAdds}:{})},
    encounterCapacity:CAPACITY,maxCombatDurationMs:timeLimit,maxActions:6000,forcedMonsterEvery:policy.forced,healerPenalty:true,seed,
    pets:snapshot?.pet?{A:snapshot.pet}:null,petMode:'PVE',magicA:snapshot?.magicCards||[],singleHealerBonus:snapshot?.singleHealerBonus||{},openingPlayerUltimateDamage:snapshot?.ultimateDamage||0});
  const artMap=new Map([...monsters,...bosses].map(art=>[art.id,art]));
  const instances=result.encounter.instances.map(f=>{
    const art=artMap.get(f.huntArtId),boss=!!f.isBoss;
    return {id:f.id,cardId:f.cardId,slot:f.slot,maxHp:f.maxHp,shield:f.shield,maxShield:f.maxShield,name:f.huntElite?'정예 '+art.name:art.name,displayName:f.huntElite?'정예 '+art.name:art.name,elite:!!f.huntElite,boss,finalBoss:boss,stage:boss?2:1,battleHeight:art.height,battleSprite:art.sprite,sourceArt:art.sprite};
  });
  const instanceMap=new Map(instances.map(r=>[r.id,r]));
  for(const e of result.timeline){
    const monster=instanceMap.get(e.targetId);
    if(e.type==='ENEMY_SPAWN'&&monster){e.name=monster.name;e.label=monster.boss?monster.name+' 출현':'새 무리 진입';e.huntStage=monster.stage;e.finalBoss=!!monster.finalBoss;}
    if(e.type==='KO'&&monster){e.huntKill=true;e.boss=monster.boss;e.elite=monster.elite;e.huntStage=monster.stage;}
  }
  const timeline=compactHuntTimeline(result.timeline);
  const bossEvent=timeline.find(event=>event.finalBoss);
  const playbackFinal=state=>({A:state.A.filter(card=>!card.isMercenary&&!card.isBattleSuit),B:state.B.filter(card=>!card.isMercenary),
    mercenaries:{A:state.A.filter(card=>card.isMercenary),B:state.B.filter(card=>card.isMercenary)}});
  const accountNickname=snapshot?.accountNickname||'검수 원정대',mercenaries=result.openingMercenaries?.A||[];
  const payload={previewOnly:!snapshot,liveRewards:false,engineBase:ENGINE_BASE,title:'군단토벌 · '+(region?.name||'잊혀진 섬'),...(region?{regionId:region.id,regionName:region.name,battlefieldBackground:region.background}:{}),mode:'HUNT',battlefieldMode:'HUNT',accountNickname,playerName:accountNickname,opponentName:'몬스터 군단',
    cards,equippedBattleSuit,equippedWeapon,characterBonus:snapshot?.characterBonus||{battleSuitPve:partyPolicy.suitPower,equippedBattleSuit,equippedWeapon},
    ...(snapshot?{loadoutSource:snapshot.source,mercenary:snapshot.mercenary||null,pet:snapshot.pet||null}:{}),
    huntPolicy:{...policy,limitMs:timeLimit,totalEnemies:instances.length,totalBosses:1,party:snapshot?'account':partyPolicy.id,partyPower:teamSummary(simulationTeamA).power},
    huntPlayback:{limitMs:timeLimit,boss:bossEvent?{combatAtMs:bossEvent.combatAtMs,final:playbackFinal(result.encounter.bossCheckpoint.final),seq:bossEvent.seq,targetId:bossEvent.targetId}:null,
      final:playbackFinal(result.final)},
    continuousEncounter:{schemaVersion:2,capacity:CAPACITY,initialIds:fighters.slice(0,CAPACITY).map(r=>r.id),instances},
    battleV2:{schemaVersion:2,engine:'BATTLE_ENGINE_V2',seed,rules:{battleSuitDamageAuthority:'SERVER_TIMELINE',battleSuitActionClock:'INDEPENDENT_TIME_CADENCE',battleSuitTargetable:false,battleSuitOccupiesCardSlot:false},
      teams:{A:{cards:result.openingTeams?.A.filter(c=>!c.isMercenary&&!c.isBattleSuit)||teamA.map(publicFighter),summary:teamSummary(result.openingTeams?.A.filter(c=>!c.isBattleSuit)||[...teamA,...mercenaries]),...(mercenary?{mercenaries}:{}),...(snapshot?.pet?{pet:snapshot.pet}:{}),supports:support?[{...publicFighter(support),authoritative:true,damageAuthority:'SERVER_TIMELINE'}]:[]},B:{cards:fighters.slice(0,CAPACITY).map(publicFighter),summary:teamSummary(fighters.slice(0,CAPACITY))}},
      result:{winner:null,reason:'RUNNING',timeline,final:{A:result.final.A.filter(c=>!c.isMercenary&&!c.isBattleSuit),B:result.final.B,...(mercenary?{mercenaries:{A:result.final.A.filter(c=>c.isMercenary),B:[]}}:{})}}}};
  return Object.assign(restoreHuntSession({id,policy,timeLimit,magnet:snapshot?.pet?.magnet===true,eventTimes:timeline.map(e=>Math.floor(e.combatAtMs)),timeline:timeline.filter(e=>e.huntKill||e.type==='RESULT').map(({seq,combatAtMs,huntKill,boss,elite,type,winner,reason})=>({seq,combatAtMs,huntKill,boss,elite,type:type==='RESULT'?type:undefined,winner,reason})),outcome:{winner:result.winner,reason:result.reason,events:timeline.length,combatMs:timeline.at(-1)?.combatAtMs}},{now,random}),{payload});
}
// Compact, JSON-safe state is persisted by the account API; no isolate-local session map.
export function restoreHuntSession(state,{now=Date.now,random=secureRandom}={}){
  const {id,policy,timeLimit,timeline,outcome}=state,magnet=state.magnet===true;
  const eventTimes=state.eventTimes||timeline.map(e=>e.combatAtMs),eventsBySeq=new Map(timeline.map(e=>[e.seq,e]));
  let {startedAt=null,lastAck=0,ended=false,receipt=null}=state;
  const drops=new Map(state.drops||[]),claims=new Map(state.claims||[]),inventory=new Map(state.inventory||[]),positions=state.positions||[],claimTimes=state.claimTimes||[];
  const observed=new Map((state.observed||[]).map(([seq,dropId])=>[seq,dropId?drops.get(dropId):null]));
  const guaranteedBosses=new Set(state.guaranteedBosses||[]);
  const addInventory=item=>inventory.set(item.code,{...item,quantity:(inventory.get(item.code)?.quantity||0)+item.quantity});
  function guarantee(event){if(!event?.boss||guaranteedBosses.has(event.seq))return;const item=regionBossGuarantee(policy);if(item){addInventory(item);guaranteedBosses.add(event.seq);}}
  function begin(){if(ended)throw Error('HUNT_ENDED');if(startedAt===null)startedAt=now();return {started:true,serverNow:now()};}
  function acknowledge(seq,commit=true){
    if(startedAt===null||ended)throw Error('HUNT_NOT_ACTIVE');
    if(!Number.isSafeInteger(seq)||seq<0||seq>eventTimes.length)throw Error('INVALID_HUNT_ACK');
    const event=eventsBySeq.get(seq);
    // Timed hunts use 1x; older sessions retain their original playback contract.
    if(seq&&(Number(eventTimes[seq-1])||0)>Math.max(0,now()-startedAt)*(policy.huntDurationMs?1:2)+250)throw Error('HUNT_EVENT_NOT_REACHED');
    if(commit)lastAck=Math.max(lastAck,seq);return event;
  }
  function expire(){for(const d of drops.values())if(d.state==='GROUND'&&now()>=d.expiresAt)d.state='EXPIRED';}
  function revealDrop(seq,settling=false){
    // Late retries reuse their original roll/deadline, never resurrect an earlier unseen kill.
    if(!settling&&Number.isSafeInteger(seq)&&seq<lastAck&&!observed.has(seq))throw Error('HUNT_STALE_DROP_EVENT');
    const event=acknowledge(seq);if(!event?.huntKill)throw Error('HUNT_DROP_REQUIRES_KILL');
    expire();
    if(observed.has(seq))return {drop:observed.get(seq),serverNow:now()};
    if(policy.regionId){
      guarantee(event);
      const rewards=regionKillLoot(policy,event,random);
      if(!rewards.length){observed.set(seq,null);return {drop:null,serverNow:now(),inventory:[...inventory.values()]};}
      const active=[...drops.values()].filter(d=>d.state==='GROUND'),position=chooseDropPosition(random,positions,active.map(d=>d.position));
      if(!position){observed.set(seq,null);return {drop:null,serverNow:now()};}
      const item={...rewards[0],...(rewards.length>1?{name:rewards[0].name+' 외 '+(rewards.length-1)+'종',bundle:true}:{})};
      const drop={id:randomUUID(),token:randomUUID(),seq,item,rewards,position,createdAt:now(),expiresAt:now()+policy.dropLifeMs,state:'GROUND'};
      drops.set(drop.id,drop);positions.push(position);observed.set(seq,drop);if(magnet)collect(drop,true);return {drop,serverNow:now(),inventory:[...inventory.values()]};
    }
    const items=(policy.items||LOOT_ITEMS).filter(row=>row.enabled!==false&&row.weight>0),total=items.reduce((sum,row)=>sum+Math.round(row.weight*1000),0);
    if(!total||random()>=(event.boss?(policy.bossDropChance??.72):policy.dropChance)){observed.set(seq,null);return {drop:null,serverNow:now()};}
    const active=[...drops.values()].filter(d=>d.state==='GROUND');
    const position=chooseDropPosition(random,positions,active.map(d=>d.position));
    if(!position){observed.set(seq,null);return {drop:null,serverNow:now()};}
    let roll=random()*total,item=items.at(-1);
    for(const row of items){roll-=Math.round(row.weight*1000);if(roll<0){item=row;break;}}
    const min=item.minQuantity??1,max=item.maxQuantity??min,quantity=min+Math.floor(random()*(max-min+1));
    const drop={id:randomUUID(),token:randomUUID(),seq,item:{...item,quantity},position,createdAt:now(),expiresAt:now()+policy.dropLifeMs,state:'GROUND'};
    drops.set(drop.id,drop);positions.push(position);observed.set(seq,drop);
    if(magnet)collect(drop,true);
    return {drop,serverNow:now()};
  }
  function reveal(seq){const result=revealDrop(seq);return magnet?{...result,autoClaims:result.drop?[claims.get(result.drop.id)]:[],inventory:[...inventory.values()],picked:claims.size}:result;}
  function revealMany(seqs){
    if(!Array.isArray(seqs)||seqs.length<1||seqs.length>24||!seqs.every((seq,i)=>Number.isSafeInteger(seq)&&seq>0&&(!i||seq>seqs[i-1])))throw Error('HUNT_DROP_BATCH');
    // Validate the complete batch before rolling or advancing any receipt.
    for(const seq of seqs){
      if(seq<lastAck&&!observed.has(seq))throw Error('HUNT_STALE_DROP_EVENT');
      if(!acknowledge(seq,false)?.huntKill)throw Error('HUNT_DROP_REQUIRES_KILL');
    }
    const revealed=seqs.map(seq=>reveal(seq).drop);
    return {drops:revealed,serverNow:now(),...(policy.regionId?{inventory:[...inventory.values()]}:{}),...(magnet?{autoClaims:revealed.filter(Boolean).map(d=>claims.get(d.id)),inventory:[...inventory.values()],picked:claims.size}:{})};
  }
  function claim({dropId,token,x,y}={}){
    const d=drops.get(dropId);if(!d||d.token!==token)throw Error('INVALID_DROP_CLAIM');
    if(claims.has(dropId))return claims.get(dropId);
    if(ended||startedAt===null)throw Error('HUNT_NOT_ACTIVE');
    expire();if(d.state!=='GROUND')throw Error('DROP_EXPIRED');
    if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x-d.position.x)>.085||Math.abs(y-d.position.y)>.095)throw Error('DROP_POSITION_MISMATCH');
    // Rate-limit valid claims without consuming or re-rolling a drop.
    while(claimTimes.length&&now()-claimTimes[0]>1000)claimTimes.shift();
    if(claimTimes.length>=6)throw Error('DROP_CLICK_RATE_LIMIT');
    claimTimes.push(now());return collect(d,false);
  }
  function collect(d,automatic){
    if(claims.has(d.id))return claims.get(d.id);
    d.state='CLAIMED';
    for(const item of d.rewards||[d.item])addInventory(item);
    const r={dropId:d.id,item:d.item,inventory:[...inventory.values()],serverNow:now(),...(automatic?{automatic:true}:{})};
    claims.set(d.id,r);return r;
  }
  function finish(seq){
    if(receipt)return receipt;
    acknowledge(seq);
    // A final acknowledgement also absorbs reached kills whose reveal response
    // was delayed. The start-of-run server snapshot alone grants this ability.
    if(magnet)for(const event of timeline)if(event.seq<=lastAck&&event.huntKill&&!observed.has(event.seq))revealDrop(event.seq,true);
    if(policy.regionId)for(const event of timeline)if(event.seq<=lastAck&&event.huntKill&&event.boss)guarantee(event);
    expire();ended=true;
    for(const d of drops.values())if(d.state==='GROUND')d.state='MISSED';
    const seen=timeline.filter(e=>e.seq<=lastAck),terminal=seen.find(e=>e.type==='RESULT');
    const reason=terminal?(terminal.winner==='A'?'CLEAR':terminal.reason==='TIME_LIMIT'?'TIME_LIMIT':'DEFEAT'):'RETREAT';
    receipt={id,previewOnly:true,liveRewards:false,reason,winner:terminal?.winner||null,difficulty:policy.id,...(policy.regionId?{regionId:policy.regionId}:{}),
      kills:seen.filter(e=>e.huntKill).length,bosses:seen.filter(e=>e.huntKill&&e.boss).length,
      combatMs:Math.min(timeLimit,eventTimes[lastAck-1]||0),inventory:[...inventory.values()],
      picked:claims.size,dropped:drops.size,missed:[...drops.values()].filter(d=>d.state!=='CLAIMED').length};
    return receipt;
  }
  return {id,begin,reveal,revealMany,claim,finish,cancel(){ended=true;},exportState(){return {id,policy,timeLimit,magnet,eventTimes,timeline,outcome,startedAt,lastAck,ended,receipt,drops:[...drops],claims:[...claims],inventory:[...inventory],positions,claimTimes,guaranteedBosses:[...guaranteedBosses],observed:[...observed].map(([seq,d])=>[seq,d?.id||null])};},get diagnostics(){expire();return {startedAt,lastAck,ended,inventory:[...inventory.values()],drops:[...drops.values()].map(({token,...d})=>d),outcome};}};
}
