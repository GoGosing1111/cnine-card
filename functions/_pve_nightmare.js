const clamp=(value,min,max,fallback=min)=>{
  const parsed=Number(value);
  return Math.max(min,Math.min(max,Number.isFinite(parsed)?parsed:fallback));
};

export const PVE_NIGHTMARE='NIGHTMARE';

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

export function monsterPveDifficulty(monster={}){
  const raw=String(monster.pve_tab??monster.pveTab??monster.difficulty??'').trim().toUpperCase();
  return ({GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'})[raw]||(['NORMAL','HARD','HELL','NIGHTMARE'].includes(raw)?raw:'NORMAL');
}

export function pveDifficultyRuntime(settings={},monster={}){
  const difficulty=monsterPveDifficulty(monster),nightmare=normalizeNightmareSettings(settings.nightmare||{}),isNightmare=difficulty===PVE_NIGHTMARE;
  const hpPercent=isNightmare?nightmare.hpPercent:100,attackPercent=isNightmare?nightmare.attackPercent:100,defensePercent=isNightmare?nightmare.defensePercent:100,speedPercent=isNightmare?nightmare.speedPercent:100;
  const challengeMultiplier=isNightmare?(hpPercent*.35+attackPercent*.30+defensePercent*.25+speedPercent*.10)/100:1;
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
