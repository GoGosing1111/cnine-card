const clamp=(value,min,max,fallback=min)=>{
  const parsed=Number(value);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
};

export const PVE_NIGHTMARE='NIGHTMARE';
export const PVE_APOCALYPSE='APOCALYPSE';
export const APOCALYPSE_ENERGY_CONFIG=Object.freeze({enabled:true,maxEnergy:5,rechargeMinutes:30,costPerBattle:1,adminUnlimited:true,testUnlimited:true});

const text=(value,fallback='',max=120)=>String(value??fallback).trim().slice(0,max)||String(fallback).slice(0,max);

function normalizeNightmareBossProfiles(raw={}){
  const source=raw?.bossProfiles&&typeof raw.bossProfiles==='object'&&!Array.isArray(raw.bossProfiles)?raw.bossProfiles:{};
  const profiles={};
  for(const [rawId,value] of Object.entries(source).slice(0,300)){
    const id=Math.floor(Number(rawId));
    if(!Number.isInteger(id)||id<1||!value||typeof value!=='object')continue;
    const profile={
      battlePower:clamp(value.battlePower,1,1000000000,1),
      rewardCoin:clamp(value.rewardCoin,0,1000000000,0),
      hpPercent:clamp(value.hpPercent,100,1000,200),
      attackPercent:clamp(value.attackPercent,100,1000,160),
      defensePercent:clamp(value.defensePercent,100,1000,150),
      speedPercent:clamp(value.speedPercent,100,300,120),
      rewardPercent:clamp(value.rewardPercent,100,2000,250),
      bossUltimateCapPercent:clamp(value.bossUltimateCapPercent,100,500,120)
    };
    profiles[String(id)]=profile;
  }
  return profiles;
}

function normalizeApocalypseMonsterProfiles(raw={}){
  const source=raw?.monsterProfiles&&typeof raw.monsterProfiles==='object'&&!Array.isArray(raw.monsterProfiles)?raw.monsterProfiles:{};
  const profiles={};
  for(const [rawId,value] of Object.entries(source).slice(0,300)){
    const id=Math.floor(Number(rawId));
    if(!Number.isInteger(id)||id<1||!value||typeof value!=='object')continue;
    profiles[String(id)]={
      battlePower:clamp(value.battlePower,1,1000000000,1),
      rewardCoin:clamp(value.rewardCoin,0,1000000000,0),
      hpPercent:clamp(value.hpPercent,240,1200,260),
      attackPercent:clamp(value.attackPercent,190,1200,220),
      defensePercent:clamp(value.defensePercent,175,1200,190),
      speedPercent:clamp(value.speedPercent,140,500,160),
      rewardPercent:clamp(value.rewardPercent,300,3000,400),
      shieldPercent:clamp(value.shieldPercent,15,300,40),
      attackCount:Math.floor(clamp(value.attackCount,2,5,2)),
      forcedActionEvery:Math.floor(clamp(value.forcedActionEvery,2,6,4)),
      skillEnabled:value.skillEnabled!==false,
      skillName:text(value.skillName,'종말 집행',60),
      skillDescription:text(value.skillDescription,'전투 개시와 동시에 모든 출전 카드에 종말 피해를 가합니다.',300),
      skillDamagePercent:clamp(value.skillDamagePercent,20,100,28)
    };
  }
  return profiles;
}

// NIGHTMARE is a continuation of the final HELL boss, not a second copy of the
// old HELL curve. Ratios describe the effective values players see after the
// global NIGHTMARE multipliers are applied.
export const NIGHTMARE_PROGRESSION=Object.freeze([
  Object.freeze({key:'ZORO',powerRatio:1.10,rewardRatio:1.15}),
  Object.freeze({key:'SASUKE',powerRatio:1.22,rewardRatio:1.30}),
  Object.freeze({key:'ITACHI',powerRatio:1.36,rewardRatio:1.48}),
  Object.freeze({key:'ZENITSU',powerRatio:1.52,rewardRatio:1.68}),
  Object.freeze({key:'KYOJURO',powerRatio:1.70,rewardRatio:1.91}),
  Object.freeze({key:'SHUNSUI',powerRatio:1.90,rewardRatio:2.17}),
  Object.freeze({key:'ANBU_ITACHI',powerRatio:2.13,rewardRatio:2.47}),
  Object.freeze({key:'SESSHOMARU',powerRatio:2.39,rewardRatio:2.81}),
  Object.freeze({key:'LUFFY',powerRatio:2.68,rewardRatio:3.20})
]);

export function normalizeNightmareSettings(raw={}){
  return {
    enabled:raw.enabled!==false,
    hpPercent:clamp(raw.hpPercent??200,100,1000,200),
    attackPercent:clamp(raw.attackPercent??160,100,1000,160),
    defensePercent:clamp(raw.defensePercent??150,100,1000,150),
    speedPercent:clamp(raw.speedPercent??120,100,300,120),
    rewardPercent:clamp(raw.rewardPercent??250,100,2000,250),
    bossUltimateUnlocked:raw.bossUltimateUnlocked!==false,
    bossUltimateCapPercent:clamp(raw.bossUltimateCapPercent??120,100,500,120),
    bossProfiles:normalizeNightmareBossProfiles(raw)
  };
}

export function normalizeApocalypseSettings(raw={}){
  return {
    enabled:raw.enabled!==false,
    hpPercent:clamp(raw.hpPercent??260,240,1200,260),
    attackPercent:clamp(raw.attackPercent??220,190,1200,220),
    defensePercent:clamp(raw.defensePercent??190,175,1200,190),
    speedPercent:clamp(raw.speedPercent??160,140,500,160),
    rewardPercent:clamp(raw.rewardPercent??400,300,3000,400),
    shieldPercent:clamp(raw.shieldPercent??40,15,300,40),
    attackCount:Math.floor(clamp(raw.attackCount??2,2,5,2)),
    forcedActionEvery:Math.floor(clamp(raw.forcedActionEvery??4,2,6,4)),
    skillEnabled:raw.skillEnabled!==false,
    skillName:text(raw.skillName,'종말 집행',60),
    skillDescription:text(raw.skillDescription,'전투 개시와 동시에 모든 출전 카드에 종말 피해를 가합니다.',300),
    skillDamagePercent:clamp(raw.skillDamagePercent??28,20,100,28),
    energy:{...APOCALYPSE_ENERGY_CONFIG},
    monsterProfiles:normalizeApocalypseMonsterProfiles(raw)
  };
}

export function nightmareChallengeMultiplier(raw={}){
  const settings=normalizeNightmareSettings(raw);
  return (settings.hpPercent*.35+settings.attackPercent*.30+settings.defensePercent*.25+settings.speedPercent*.10)/100;
}

export function apocalypseChallengeMultiplier(raw={}){
  const settings=normalizeApocalypseSettings(raw);
  const statWeight=(settings.hpPercent*.28+settings.attackPercent*.24+settings.defensePercent*.18+settings.speedPercent*.10)/100;
  const shieldWeight=settings.shieldPercent/100*.30;
  const repeatWeight=(settings.attackCount-1)*.25;
  const cadenceWeight=Math.max(0,8-settings.forcedActionEvery)*.04;
  const skillWeight=settings.skillEnabled?settings.skillDamagePercent/100*.20:0;
  return statWeight+shieldWeight+repeatWeight+cadenceWeight+skillWeight;
}

export function nightmareProgressionKey(name=''){
  const value=String(name).normalize('NFKC').replace(/\s+/g,'');
  if(value.includes('조로'))return 'ZORO';
  if(value.includes('사스케'))return 'SASUKE';
  if(value.includes('암부')&&value.includes('이타치'))return 'ANBU_ITACHI';
  if(value.includes('이타치'))return 'ITACHI';
  if(value.includes('젠이츠'))return 'ZENITSU';
  if(value.includes('코쥬로')||value.includes('쿄쥬로'))return 'KYOJURO';
  if(value.includes('슌스이'))return 'SHUNSUI';
  if(value.includes('셋쇼마루'))return 'SESSHOMARU';
  if(value.includes('루피'))return 'LUFFY';
  return '';
}

export function nightmareProgressionPlan({anchorPower=1,anchorReward=0,anchorDisplayOrder=0,anchorSortOrder=0,settings={}}={}){
  const normalized=normalizeNightmareSettings(settings);
  const challengeMultiplier=nightmareChallengeMultiplier(normalized);
  const rewardMultiplier=normalized.rewardPercent/100;
  const hellPower=Math.max(1,Math.floor(Number(anchorPower)||1));
  const hellReward=Math.max(100,Math.floor(Number(anchorReward)||0));
  const displayOrder=Math.floor(Number(anchorDisplayOrder)||0);
  const sortOrder=Math.floor(Number(anchorSortOrder)||0);
  const ceilTo=(value,step)=>Math.ceil(value/step-1e-9)*step;
  return NIGHTMARE_PROGRESSION.map((entry,index)=>{
    const effectiveBattlePower=ceilTo(hellPower*entry.powerRatio,5000);
    const effectiveRewardCoin=ceilTo(hellReward*entry.rewardRatio,100);
    return {
      ...entry,
      battlePower:Math.max(1,Math.ceil(effectiveBattlePower/challengeMultiplier)),
      rewardCoin:Math.max(1,Math.ceil(effectiveRewardCoin/rewardMultiplier)),
      effectiveBattlePower,
      effectiveRewardCoin,
      pveDisplayOrder:displayOrder+index+1,
      sortOrder:sortOrder+index+1
    };
  });
}

export function monsterPveDifficulty(monster={}){
  const raw=String(monster.pve_tab??monster.pveTab??monster.difficulty??'').trim().toUpperCase();
  return ({GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'})[raw]||(['NORMAL','HARD','HELL','NIGHTMARE','APOCALYPSE'].includes(raw)?raw:'NORMAL');
}

export function pveDifficultyRuntime(settings={},monster={}){
  const difficulty=monsterPveDifficulty(monster),nightmare=normalizeNightmareSettings(settings.nightmare||{}),apocalypse=normalizeApocalypseSettings(settings.apocalypse||{}),isNightmare=difficulty===PVE_NIGHTMARE,isApocalypse=difficulty===PVE_APOCALYPSE;
  const monsterId=String(Math.floor(Number(monster.id)||0));
  const profile=isNightmare?nightmare.bossProfiles?.[monsterId]:isApocalypse?apocalypse.monsterProfiles?.[monsterId]:null;
  const baseTuning=isApocalypse?apocalypse:nightmare,tuning=profile?{...baseTuning,...profile}:baseTuning;
  const special=isNightmare||isApocalypse;
  const hpPercent=special?tuning.hpPercent:100,attackPercent=special?tuning.attackPercent:100,defensePercent=special?tuning.defensePercent:100,speedPercent=special?tuning.speedPercent:100;
  const challengeMultiplier=isNightmare?nightmareChallengeMultiplier(tuning):isApocalypse?apocalypseChallengeMultiplier(tuning):1;
  const storedPower=Math.max(1,Number(monster.battle_power??monster.battlePower??1)),storedReward=Math.max(0,Number(monster.reward_coin??monster.rewardCoin??0));
  const basePower=special&&profile?profile.battlePower:storedPower,baseReward=special&&profile?profile.rewardCoin:storedReward;
  const shieldPercent=isApocalypse?Number(tuning.shieldPercent||0):0,attackCount=isApocalypse?Number(tuning.attackCount||1):1,forcedActionEvery=isApocalypse?Number(tuning.forcedActionEvery||8):0;
  const apocalypseSkill=isApocalypse?{enabled:tuning.skillEnabled!==false,name:tuning.skillName,description:tuning.skillDescription,damagePercent:Number(tuning.skillDamagePercent||0)}:null;
  return {
    difficulty,isNightmare,isApocalypse,enabled:isNightmare?nightmare.enabled:isApocalypse?apocalypse.enabled:true,
    hpPercent,attackPercent,defensePercent,speedPercent,
    rewardPercent:special?tuning.rewardPercent:100,
    shieldPercent,attackCount,forcedActionEvery,apocalypseSkill,
    bossUltimateCapPercent:isNightmare&&nightmare.bossUltimateUnlocked?tuning.bossUltimateCapPercent:isApocalypse?500:100,
    bossUltimateUnlocked:isNightmare?nightmare.bossUltimateUnlocked:isApocalypse,
    profileSource:isNightmare&&profile?'BOSS':isApocalypse&&profile?'MONSTER':'GLOBAL',
    effectiveBattlePower:Math.max(1,Math.round(basePower*challengeMultiplier)),
    effectiveRewardCoin:Math.max(0,Math.floor(baseReward*(special?tuning.rewardPercent:100)/100)),
    engineMonster:{...monster,battle_power:basePower,battlePower:basePower,pve_difficulty:difficulty,pve_hp_percent:hpPercent,pve_attack_percent:attackPercent,pve_defense_percent:defensePercent,pve_speed_percent:speedPercent,pve_shield_percent:shieldPercent,pve_attack_count:attackCount,pve_forced_action_every:forcedActionEvery,pve_apocalypse_skill:apocalypseSkill}
  };
}
