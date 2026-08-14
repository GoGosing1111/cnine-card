const clamp=(value,min,max,fallback=min)=>{
  const parsed=Number(value);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
};

export const PVE_NIGHTMARE='NIGHTMARE';

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
    bossUltimateCapPercent:clamp(raw.bossUltimateCapPercent??120,100,500,120)
  };
}

export function nightmareChallengeMultiplier(raw={}){
  const settings=normalizeNightmareSettings(raw);
  return (settings.hpPercent*.35+settings.attackPercent*.30+settings.defensePercent*.25+settings.speedPercent*.10)/100;
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
  return ({GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'})[raw]||(['NORMAL','HARD','HELL','NIGHTMARE'].includes(raw)?raw:'NORMAL');
}

export function pveDifficultyRuntime(settings={},monster={}){
  const difficulty=monsterPveDifficulty(monster),nightmare=normalizeNightmareSettings(settings.nightmare||{}),isNightmare=difficulty===PVE_NIGHTMARE;
  const hpPercent=isNightmare?nightmare.hpPercent:100,attackPercent=isNightmare?nightmare.attackPercent:100,defensePercent=isNightmare?nightmare.defensePercent:100,speedPercent=isNightmare?nightmare.speedPercent:100;
  const challengeMultiplier=isNightmare?nightmareChallengeMultiplier(nightmare):1;
  const basePower=Math.max(1,Number(monster.battle_power??monster.battlePower??1)),baseReward=Math.max(0,Number(monster.reward_coin??monster.rewardCoin??0));
  return {
    difficulty,isNightmare,enabled:!isNightmare||nightmare.enabled,
    hpPercent,attackPercent,defensePercent,speedPercent,
    rewardPercent:isNightmare?nightmare.rewardPercent:100,
    bossUltimateCapPercent:isNightmare&&nightmare.bossUltimateUnlocked?nightmare.bossUltimateCapPercent:100,
    bossUltimateUnlocked:isNightmare&&nightmare.bossUltimateUnlocked,
    effectiveBattlePower:Math.max(1,Math.round(basePower*challengeMultiplier)),
    effectiveRewardCoin:Math.max(0,Math.floor(baseReward*(isNightmare?nightmare.rewardPercent:100)/100)),
    engineMonster:{...monster,pve_difficulty:difficulty,pve_hp_percent:hpPercent,pve_attack_percent:attackPercent,pve_defense_percent:defensePercent,pve_speed_percent:speedPercent}
  };
}
