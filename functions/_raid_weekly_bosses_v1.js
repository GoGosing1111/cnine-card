const ROOT='/assets/ui/project-v/monsters';
const WEEKLY=`${ROOT}/weekly-raid-v1`;
const RESP='/assets/responsive/project-v/monsters';
const FX='/assets/ui/project-v/fx/weekly-raid-v1';

const rewards=(participation,clear,bonusType,rareType,coreAmount=1)=>({
  participation:[{type:'COIN',amount:participation}],
  clear:[{type:'COIN',amount:clear},{type:'CARD_SHARD',amount:80},{type:'CORE_RAID_ENTRY_TICKET',amount:coreAmount}],
  minionClear:[{type:'COIN',amount:Math.floor(clear*.12)},{type:bonusType,amount:1}],
  damageMilestones:[
    {damage:5_000_000,rewards:[{type:'MAGIC_CARD_PACK',amount:1}]},
    {damage:15_000_000,rewards:[{type:bonusType,amount:1}]},
    {damage:30_000_000,rewards:[{type:'CORE_RAID_ENTRY_TICKET',amount:1}]}
  ],
  rankRewards:[
    {from:1,to:1,rewards:[{type:'PREMIUM_CUBE',amount:2},{type:bonusType,amount:2}]},
    {from:2,to:3,rewards:[{type:'PREMIUM_CUBE',amount:1},{type:bonusType,amount:1}]},
    {from:4,to:10,rewards:[{type:'MAGIC_CARD_PACK',amount:1}]}
  ],
  rareDrops:[{type:rareType,amount:1,chance:4},{type:'CORE_RAID_ENTRY_TICKET',amount:1,chance:8}]
});

const add=(code,name,sprite,maxHp,spawnAtHpPct,hpPercent,rewardType)=>({code,name,sprite,maxHp,spawnAtHpPct,hpPercent,rewardType});

// Only the three user-supplied bosses belong to this raid rotation.
export const WEEKLY_RAID_ROTATION_V1=Object.freeze(['NAGATO','NAGATO','YORIICHI','ICHIGO','NAGATO','YORIICHI','ICHIGO']);
export const WEEKLY_RAID_DAY_LABELS=Object.freeze(['일','월','화','수','목','금','토']);
export const WEEKLY_RAID_BOSSES_V1=Object.freeze([
  {
    weekday:1,dayLabel:'월',code:'NAGATO',name:'나가토',title:'천도의 지배자',accent:'#b77cff',powerRating:5_800_000,maxHp:180_000_000,defenseRate:22,
    sourceArt:`${WEEKLY}/nagato-source.jpg`,battleSprite:`${WEEKLY}/nagato-sd-v2-768.webp`,
    ultimate:{code:'CELESTIAL_GRAVITY',name:'초신성 천도',everyAttacks:5,multiplier:1.55,atlas:`${FX}/nagato-impact-atlas-v1.json`,framePrefix:'nagato_'},
    minions:[add('PAIN_ANIMAL','축생도 소환체',`${RESP}/hunt-030-black-ops-boss-sd-v1-768.webp`,22_000_000,1,.122,'MAGIC_CARD_PACK'),add('PAIN_ASURA','수라도 기갑체',`${RESP}/hunt-015-crimson-eye-boss-sd-v1-768.webp`,26_000_000,.55,.144,'EQUIPMENT_SUPPLY_BOX')],
    rewards:rewards(3_000_000,22_000_000,'MAGIC_CARD_PACK','PREMIUM_CUBE',1)
  },
  {
    weekday:2,dayLabel:'화',code:'YORIICHI',name:'요리이치',title:'태양의 검성',accent:'#ff9d4c',powerRating:6_200_000,maxHp:192_000_000,defenseRate:23,
    sourceArt:`${WEEKLY}/yoriichi-source.jpg`,battleSprite:`${WEEKLY}/yoriichi-sd-v1-768.webp`,
    ultimate:{code:'SUN_THIRTEENTH',name:'해의 호흡·십삼형',everyAttacks:4,multiplier:1.65,atlas:`${FX}/yoriichi-impact-atlas-v1.json`,framePrefix:'yoriichi_'},
    minions:[add('FLAME_DISCIPLE','해의 검귀',`${RESP}/hunt-026-flame-pillar-boss-sd-v1-768.webp`,24_000_000,1,.125,'MAGIC_CARD_PACK'),add('MOON_DISCIPLE','달의 검귀',`${RESP}/hunt-031-moon-demon-boss-sd-v1-768.webp`,29_000_000,.55,.151,'MASTER_STAR')],
    rewards:rewards(3_400_000,24_000_000,'MASTER_STAR','MAGIC_CARD_PACK',1)
  },
  {
    weekday:3,dayLabel:'수',code:'ICHIGO',name:'이치고',title:'검은 월아',accent:'#ff596f',powerRating:6_500_000,maxHp:204_000_000,defenseRate:24,
    sourceArt:`${WEEKLY}/ichigo-source.jpg`,battleSprite:`${WEEKLY}/ichigo-sd-v1-768.webp`,
    ultimate:{code:'MUGETSU',name:'무월·검은 월아',everyAttacks:4,multiplier:1.72,atlas:`${FX}/ichigo-impact-atlas-v1.json`,framePrefix:'ichigo_'},
    minions:[add('HOLLOW_REAPER','호로우 사신',`${RESP}/tower-027-moon-wraith-sd-v1-768.webp`,26_000_000,1,.127,'MAGIC_CARD_PACK'),add('SOUL_CAPTAIN','영혼 대장',`${RESP}/hunt-029-flower-captain-boss-sd-v1-768.webp`,31_000_000,.55,.152,'PREMIUM_CUBE')],
    rewards:rewards(3_800_000,26_000_000,'PREMIUM_CUBE','MAGIC_CARD_PACK',2)
  }
]);

export function weeklyRaidBossForKst(nowMs=Date.now(),rotation=WEEKLY_RAID_ROTATION_V1,profiles=WEEKLY_RAID_BOSSES_V1){
  const weekday=new Date(nowMs+9*60*60*1000).getUTCDay();
  const profile=profiles.find(row=>row.code===rotation[weekday]);
  return profile?{...profile,weekday,dayLabel:WEEKLY_RAID_DAY_LABELS[weekday]}:null;
}

export function weeklyRaidBossByName(name){return WEEKLY_RAID_BOSSES_V1.find(row=>row.name===String(name||''))||null;}
export function weeklyRaidBossByCode(code){return WEEKLY_RAID_BOSSES_V1.find(row=>row.code===String(code||'').toUpperCase())||null;}

export const WEEKLY_RAID_SETTINGS_KEY='raid_weekly_boss_settings_v2141';
const ready=new WeakSet();
export async function ensureWeeklyRaidBossesV1(env){
    if(ready.has(env.DB))return true;
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v2141_three_raid_bosses'").first();
    if(marker?.value==='1'){ready.add(env.DB);return true;}
    const statements=[];
    for(const boss of WEEKLY_RAID_BOSSES_V1){
      statements.push(env.DB.prepare('INSERT INTO raid_bosses(name,image_url,max_hp,defense_rate,is_active,sort_order) SELECT ?,?,?,?,1,? WHERE NOT EXISTS(SELECT 1 FROM raid_bosses WHERE name=?)').bind(boss.name,boss.sourceArt,boss.maxHp,boss.defenseRate,boss.weekday,boss.name));
    }
    // Retire only the four mistakenly added raid records; historical rooms stay intact.
    statements.push(env.DB.prepare("UPDATE raid_bosses SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE name IN ('센쥬 하시라마','오비토','길가메시','마이트 가이')"));
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(WEEKLY_RAID_SETTINGS_KEY,'{}'));
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v2141_three_raid_bosses','1',CURRENT_TIMESTAMP)"));
    await env.DB.batch(statements);
    ready.add(env.DB);
    return true;
}

export function weeklyRaidBossSettings(base,boss){
  const profile=boss||weeklyRaidBossForKst();
  return {...base,
    participationCoin:profile.rewards.participation.filter(row=>row.type==='COIN').reduce((sum,row)=>sum+row.amount,0),
    clearCoin:profile.rewards.clear.filter(row=>row.type==='COIN').reduce((sum,row)=>sum+row.amount,0),
    rewardShards:profile.rewards.clear.filter(row=>row.type==='CARD_SHARD').reduce((sum,row)=>sum+row.amount,0),
    bossAttackPower:Number(profile.bossAttackPower??Math.max(Number(base?.bossAttackPower||850),Math.floor(profile.powerRating/2300))),
    bossAttackIntervalMs:Number(profile.bossAttackIntervalMs??Math.max(3200,Number(base?.bossAttackIntervalMs||5000))),
    clearMysticEnergy:Number(base?.clearMysticEnergy||0),
    rewards:profile.rewards,
    bossProfile:{...profile,minionGuardRatio:profile.minionGuardRatio??.65}
  };
}
