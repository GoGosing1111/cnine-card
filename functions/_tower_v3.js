import {createPveBattleV2} from './_battle_v2_preview.js';

// Release candidate only. The operating tower route continues to use its old contract.
export const TOWER_V3_RELEASE_ENABLED = false;
export const TOWER_V3_ENGINE_VERSION = 'TOWER_LIMIT_PUSH_V1';
export const TOWER_V3_DRAFT = Object.freeze({
  mode:'OFF', rulesVersion:'TOWER_DRAFT_20260911_1', maxTier:160,
  normalCount:24, eliteCount:3, simultaneous:3, normalPoints:2, elitePoints:18,
  basePower:5000, powerGrowth:1.065, hpGrowth:3, attackGrowth:1.2,
  eliteMultiplier:2, guardianMultiplier:5, maxActions:500, forcedMonsterEvery:6,
  combatLimitMs:180000, autoRepeatMax:10, fastUnlockTwo:.4, fastUnlockThree:.6
});
// 60 seconds per gauge-clock unit is a versioned scoring convention, unrelated
// to Pixi/GSAP wall time, frame rate, playback speed or optional suit timelines.
export const TOWER_CLOCK_UNIT_MS = 60000;
const root='/assets/ui/project-v/monsters/hunt-tower/';
export const TOWER_V3_FAMILIES = Object.freeze([
  [17,'위장악성','tower-017-wijang-akseong-sd-v1.png',18,'이그리트','tower-018-igris-boss-sd-v1.png'],
  [19,'뱀파이어','tower-019-vampire-sd-v1.png',20,'히츠가야 토시로','tower-020-ice-swordsman-boss-sd-v1.png'],
  [21,'타락한 성기사','tower-021-fallen-paladin-sd-v1.png',22,'우르키오라','tower-022-green-spirit-boss-sd-v1.png'],
  [24,'블러드 크로우','tower-024-blood-crow-sd-v1.png',23,'쿠치키 뱌쿠야','tower-023-petal-swordsman-boss-sd-v1.png'],
  [27,'달빛 악령','tower-027-moon-wraith-sd-v1.png',28,'아이젠 소스케','tower-028-violet-magus-boss-sd-v1.png']
]);
export function towerError(code,message){return Object.assign(new Error(message),{code});}
export function towerInt(value,min,max,label){
  if(!Number.isSafeInteger(value)||value<min||value>max)throw towerError('TOWER_V3_CONFIG',`${label} 범위를 확인하세요.`);
  return value;
}
export function validateTowerV3Config(input=TOWER_V3_DRAFT){
  const c={...input};
  if(!['OFF','TEST','ON'].includes(c.mode)||!/^TOWER_[A-Z0-9_:-]{1,80}$/.test(c.rulesVersion))throw towerError('TOWER_V3_CONFIG','모드와 난도 버전을 확인하세요.');
  for(const [key,min,max] of [['maxTier',71,1000],['normalCount',3,36],['eliteCount',1,5],['simultaneous',3,3],['normalPoints',1,25],['elitePoints',1,100],['basePower',1000,1e8],['maxActions',10,600],['forcedMonsterEvery',1,20],['combatLimitMs',30000,240000],['autoRepeatMax',1,20]])towerInt(c[key],min,max,key);
  for(const [key,min,max] of [['powerGrowth',1.001,1.2],['hpGrowth',0,10],['attackGrowth',0,10],['eliteMultiplier',1,10],['guardianMultiplier',1,20],['fastUnlockTwo',.1,.8],['fastUnlockThree',.2,.95]]){
    if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)throw towerError('TOWER_V3_CONFIG',`${key} 범위를 확인하세요.`);
  }
  if(c.fastUnlockTwo>=c.fastUnlockThree||c.normalCount+c.eliteCount+1>43||c.normalCount*c.normalPoints+c.eliteCount*c.elitePoints<100||c.normalCount*c.normalPoints>=100)throw towerError('TOWER_V3_CONFIG','진행도·해금 임계값을 확인하세요.');
  const ceiling=c.basePower*Math.pow(c.powerGrowth,c.maxTier-1)*c.guardianMultiplier;
  if(!Number.isFinite(ceiling)||ceiling>1e9)throw towerError('TOWER_V3_CONFIG','최대층의 전투력이 안전 범위를 초과합니다.');
  return c;
}
export function towerCombatIdentity(config){const {mode,autoRepeatMax,...combat}=validateTowerV3Config(config);return JSON.stringify({engine:TOWER_V3_ENGINE_VERSION,clock:TOWER_CLOCK_UNIT_MS,...combat});}
export function validateTowerConfigChange(previous,next){
  const c=validateTowerV3Config(next);
  if(previous&&previous.rulesVersion===c.rulesVersion&&towerCombatIdentity(previous)!==towerCombatIdentity(c))throw towerError('TOWER_V3_VERSION','난도 변경 시 새 기록판 버전이 필요합니다.');
  return c;
}
export function migrateTowerProgress(legacy={}){
  const best=towerInt(Number(legacy.highestFloor||0),0,1000000,'기존 최고층');
  const unlocked=Math.max(1,best+1,towerInt(Number(legacy.currentFloor||1),1,1000001,'기존 도전층'));
  return {bestClearedTier:best,maxUnlockedTier:unlocked,legacyRewardThrough:best,bestRunId:null,bestCombatMs:null};
}
export function towerProgressAfter(progress,battle){
  if(!battle.success)return {...progress};
  return {...progress,bestClearedTier:Math.max(progress.bestClearedTier,battle.tier),
    maxUnlockedTier:Math.max(progress.maxUnlockedTier,battle.tier+battle.unlockStep)};
}
export function buildTowerV3Battle({snapshot,tier,seed,config=TOWER_V3_DRAFT}={}){
  const c=validateTowerV3Config(config);towerInt(tier,1,c.maxTier,'도전층');
  towerInt(seed,0,4294967295,'서버 시드');
  if(snapshot?.cards?.length!==5||new Set(snapshot.cards.map(row=>String(row.id))).size!==5)throw towerError('TOWER_V3_DECK','일반 카드 정확히 5장이 필요합니다.');
  if(snapshot.cards.some(row=>!Number.isFinite(Number(row.power))||Number(row.power)<=0||Number(row.power)>1e12))throw towerError('TOWER_V3_DECK','카드 전투력을 확인하세요.');
  const f=TOWER_V3_FAMILIES[Math.floor((tier-1)/10)%TOWER_V3_FAMILIES.length];
  const base=c.basePower*Math.pow(c.powerGrowth,tier-1), beforeBoss=c.normalCount+c.eliteCount;
  const instances=Array.from({length:beforeBoss+1},(_,i)=>{
    const boss=i===beforeBoss,elite=!boss&&i>=c.normalCount,offset=boss?3:0;
    const name=(elite?'정예 ':'')+f[offset+1],power=Math.round(base*(boss?c.guardianMultiplier:elite?c.eliteMultiplier:1));
    return {instanceId:`TOWER:${tier}:${i+1}`,slot:boss?1:i%c.simultaneous,afterClear:boss||elite,
      monster:{id:f[offset],name,battle_power:power,is_boss:boss?1:0,
        pve_hp_percent:Math.min(1200,100+(tier-1)*c.hpGrowth),
        pve_attack_percent:Math.min(1200,100+(tier-1)*c.attackGrowth),
        pve_defense_percent:Math.min(200,100+(tier-1)*.35)},
      name,elite,boss,points:boss?0:elite?c.elitePoints:c.normalPoints,battleSprite:root+f[offset+2]};
  });
  const battleV2=createPveBattleV2({cards:snapshot.cards,magicCards:snapshot.magicCards||[],characterBonus:snapshot.cardSupportBonus||0,
    battleSuit:snapshot.battleSuit||null,singleHealerBonus:snapshot.singleHealerBonus||{},ultimateDamage:snapshot.ultimateDamage||0,seed,
    encounter:{initialCount:c.simultaneous,instances,maxActions:c.maxActions,maxDuration:c.combatLimitMs/TOWER_CLOCK_UNIT_MS,forcedMonsterEvery:c.forcedMonsterEvery}});
  const rows=battleV2.encounter.instances.map((fighter,i)=>({...fighter,slot:instances[i].slot,boss:instances[i].boss,elite:instances[i].elite,
    points:instances[i].points,name:instances[i].name,displayName:instances[i].boss?instances[i].name:`${instances[i].name} ${i+1}`,sourceArt:null,battleSprite:instances[i].battleSprite}));
  const byId=new Map(rows.map(row=>[row.id,row])),dead=new Set();let points=0,officialClock=0;
  for(const event of battleV2.result.timeline){
    if(event.type==='KO'&&byId.has(event.targetId)&&!dead.has(event.targetId)){dead.add(event.targetId);points+=byId.get(event.targetId).points;}
    officialClock=Math.max(officialClock,Math.min(c.combatLimitMs,Math.round(battleV2.result.duration*TOWER_CLOCK_UNIT_MS),Math.max(0,Math.round(Number(event.at||0)*TOWER_CLOCK_UNIT_MS))));
    event.elapsedCombatMs=officialClock;
    event.remainingCombatMs=c.combatLimitMs-event.elapsedCombatMs;
    event.guardianProgress=Math.min(100,points);
  }
  const underlyingReason=battleV2.result.originalReason||battleV2.result.reason;
  const raw=Math.round(battleV2.result.duration*TOWER_CLOCK_UNIT_MS),elapsedCombatMs=underlyingReason==='TIME_LIMIT'?c.combatLimitMs:Math.min(c.combatLimitMs,raw);
  Object.assign(battleV2.result.timeline.at(-1),{elapsedCombatMs,remainingCombatMs:c.combatLimitMs-elapsedCombatMs});
  const bossId=rows.at(-1).id,success=battleV2.result.winner==='A'&&dead.has(bossId)&&raw<=c.combatLimitMs;
  const remaining=(c.combatLimitMs-elapsedCombatMs)/c.combatLimitMs;
  const reason=success?null:underlyingReason==='TIME_LIMIT'||raw>=c.combatLimitMs?'TIME_LIMIT':battleV2.result.final.A.every(row=>row.hp<=0)?'PARTY_DEFEATED':'GUARDIAN_SURVIVED';
  if(!success&&battleV2.result.winner==='A'){
    battleV2.result.winner='B';battleV2.result.originalReason=battleV2.result.reason;battleV2.result.reason=reason;
    Object.assign(battleV2.result.timeline.at(-1),{winner:'B',reason});
  }
  const guardian=battleV2.result.final.B.find(row=>row.id===bossId);
  return {ok:true,mode:'TOWER',battlefieldMode:'TOWER',title:'무한의탑',phaseLabel:`${tier}층 · 한계 돌파`,tier,
    engineVersion:TOWER_V3_ENGINE_VERSION,rulesVersion:c.rulesVersion,success,elapsedCombatMs,combatLimitMs:c.combatLimitMs,
    unlockStep:success?(remaining>=c.fastUnlockThree?3:remaining>=c.fastUnlockTwo?2:1):0,
    failureReason:reason,guardianProgress:Math.min(100,points),guardianHpPercent:dead.has(bossId)?0:guardian?Math.round(guardian.hp/guardian.maxHp*100):100,
    defeated:dead.size,playerName:snapshot.accountNickname||'탑 원정대',opponentName:`${tier}층 수호자`,cards:snapshot.cards,
    accountNickname:snapshot.accountNickname,characterBonus:snapshot.characterBonus||{},
    equippedBattleSuit:snapshot.characterBonus?.equippedBattleSuit,equippedWeapon:snapshot.characterBonus?.equippedWeapon,battleV2,
    continuousEncounter:{total:rows.length,normalCount:c.normalCount,eliteCount:c.eliteCount,initialIds:battleV2.encounter.initialIds,instances:rows}};
}
