const ROOT='/assets/ui/project-v/monsters';
const HUNT=`${ROOT}/hunt-tower`;
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

// JS weekday: 0 Sunday ... 6 Saturday. KST selection is handled below.
export const WEEKLY_RAID_BOSSES_V1=Object.freeze([
  {
    weekday:0,dayLabel:'일',code:'HASHIRAMA',name:'센쥬 하시라마',title:'목룡의 신',accent:'#6de0a2',powerRating:6_100_000,maxHp:190_000_000,defenseRate:24,
    sourceArt:'/assets/tower/SENJU.jpg',battleSprite:`${RESP}/hunt-074-wood-dragon-boss-sd-v1-768.webp`,
    ultimate:{code:'TRUE_THOUSAND_HANDS',name:'진수천수·정상화불',everyAttacks:4,multiplier:1.62,atlas:'/assets/ui/project-v/fx/apocalypse-signature-v2048/wood-dragon-impact-atlas-v2.json',framePrefix:'wood-dragon_'},
    minions:[add('WOOD_SAGE','목둔 선인',`${RESP}/tower-022-green-spirit-boss-sd-v1-768.webp`,25_000_000,1,.132,'EQUIPMENT_SUPPLY_BOX'),add('FOREST_GUARD','수계 수호자',`${RESP}/hunt-032-sun-god-boss-sd-v1-768.webp`,29_000_000,.55,.153,'MASTER_STAR')],
    rewards:rewards(4_000_000,28_000_000,'MASTER_STAR','EQUIPMENT_SUPPLY_BOX',2)
  },
  {
    weekday:1,dayLabel:'월',code:'NAGATO',name:'나가토',title:'천도의 지배자',accent:'#b77cff',powerRating:5_800_000,maxHp:180_000_000,defenseRate:22,
    sourceArt:`${WEEKLY}/nagato-source.jpg`,battleSprite:`${WEEKLY}/nagato-sd-v2-768.webp`,
    ultimate:{code:'CELESTIAL_GRAVITY',name:'초신성 천도',everyAttacks:5,multiplier:1.55,atlas:`${FX}/nagato-impact-atlas-v1.json`,framePrefix:'nagato_'},
    minions:[add('PAIN_ANIMAL','축생도 소환체',`${RESP}/hunt-030-black-ops-boss-sd-v1-768.webp`,22_000_000,1,.122,'MAGIC_CARD_PACK'),add('PAIN_ASURA','수라도 기갑체',`${RESP}/hunt-015-crimson-eye-boss-sd-v1-768.webp`,26_000_000,.55,.144,'EQUIPMENT_SUPPLY_BOX')],
    rewards:rewards(3_000_000,22_000_000,'MAGIC_CARD_PACK','PREMIUM_CUBE',1)
  },
  {
    weekday:2,dayLabel:'화',code:'OBITO',name:'오비토',title:'허공의 가면',accent:'#6dc8ff',powerRating:6_000_000,maxHp:186_000_000,defenseRate:25,
    sourceArt:`${HUNT}/hunt-062-obito-boss-sd-v1.png`,battleSprite:`${RESP}/hunt-062-obito-boss-sd-v1-768.webp`,
    ultimate:{code:'VOID_SEVERANCE',name:'신위·허공단절',everyAttacks:5,multiplier:1.58,atlas:`${FX}/obito-impact-atlas-v1.json`,framePrefix:'obito_'},
    minions:[add('WHITE_ZETSU','백색 잠복체',`${RESP}/tower-024-blood-crow-sd-v1-768.webp`,23_000_000,1,.124,'EQUIPMENT_SUPPLY_BOX'),add('MASKED_GUARD','신위 수호체',`${RESP}/hunt-014-lightning-rival-boss-sd-v1-768.webp`,27_000_000,.55,.145,'PREMIUM_CUBE')],
    rewards:rewards(3_200_000,23_000_000,'EQUIPMENT_SUPPLY_BOX','PREMIUM_CUBE',1)
  },
  {
    weekday:3,dayLabel:'수',code:'YORIICHI',name:'요리이치',title:'태양의 검성',accent:'#ff9d4c',powerRating:6_200_000,maxHp:192_000_000,defenseRate:23,
    sourceArt:`${WEEKLY}/yoriichi-source.jpg`,battleSprite:`${WEEKLY}/yoriichi-sd-v1-768.webp`,
    ultimate:{code:'SUN_THIRTEENTH',name:'해의 호흡·십삼형',everyAttacks:4,multiplier:1.65,atlas:`${FX}/yoriichi-impact-atlas-v1.json`,framePrefix:'yoriichi_'},
    minions:[add('FLAME_DISCIPLE','해의 검귀',`${RESP}/hunt-026-flame-pillar-boss-sd-v1-768.webp`,24_000_000,1,.125,'MAGIC_CARD_PACK'),add('MOON_DISCIPLE','달의 검귀',`${RESP}/hunt-031-moon-demon-boss-sd-v1-768.webp`,29_000_000,.55,.151,'MASTER_STAR')],
    rewards:rewards(3_400_000,24_000_000,'MASTER_STAR','MAGIC_CARD_PACK',1)
  },
  {
    weekday:4,dayLabel:'목',code:'GILGAMESH',name:'길가메시',title:'황금의 왕',accent:'#ffd56a',powerRating:6_400_000,maxHp:198_000_000,defenseRate:26,
    sourceArt:'/assets/tower/gg123.jpg',battleSprite:`${RESP}/hunt-061-golden-king-boss-sd-v1-768.webp`,
    ultimate:{code:'KINGS_TREASURY',name:'왕의 보물고·종언',everyAttacks:4,multiplier:1.68,atlas:`${FX}/gilgamesh-impact-atlas-v1.json`,framePrefix:'gilgamesh_'},
    minions:[add('GOLDEN_SENTINEL','황금 파수병',`${RESP}/tower-021-fallen-paladin-sd-v1-768.webp`,25_000_000,1,.126,'PREMIUM_CUBE'),add('TREASURY_ARCHER','보구 사수',`${RESP}/hunt-012-hawkeye-boss-sd-v1-768.webp`,30_000_000,.55,.152,'MASTER_STAR')],
    rewards:rewards(3_600_000,25_000_000,'PREMIUM_CUBE','MASTER_STAR',2)
  },
  {
    weekday:5,dayLabel:'금',code:'ICHIGO',name:'이치고',title:'검은 월아',accent:'#ff596f',powerRating:6_500_000,maxHp:204_000_000,defenseRate:24,
    sourceArt:`${WEEKLY}/ichigo-source.jpg`,battleSprite:`${WEEKLY}/ichigo-sd-v1-768.webp`,
    ultimate:{code:'MUGETSU',name:'무월·검은 월아',everyAttacks:4,multiplier:1.72,atlas:`${FX}/ichigo-impact-atlas-v1.json`,framePrefix:'ichigo_'},
    minions:[add('HOLLOW_REAPER','호로우 사신',`${RESP}/tower-027-moon-wraith-sd-v1-768.webp`,26_000_000,1,.127,'MAGIC_CARD_PACK'),add('SOUL_CAPTAIN','영혼 대장',`${RESP}/hunt-029-flower-captain-boss-sd-v1-768.webp`,31_000_000,.55,.152,'PREMIUM_CUBE')],
    rewards:rewards(3_800_000,26_000_000,'PREMIUM_CUBE','MAGIC_CARD_PACK',2)
  },
  {
    weekday:6,dayLabel:'토',code:'MIGHT_GUY',name:'마이트 가이',title:'팔문둔갑의 극의',accent:'#ff5b4d',powerRating:7_000_000,maxHp:216_000_000,defenseRate:27,
    sourceArt:'/assets/tower/GAI.jpg',battleSprite:`${RESP}/hunt-073-night-guy-boss-sd-v1-768.webp`,
    ultimate:{code:'NIGHT_GUY',name:'야가이',everyAttacks:3,multiplier:1.78,atlas:'/assets/ui/project-v/fx/apocalypse-signature-v2048/night-guy-impact-atlas-v2.json',framePrefix:'night-guy_'},
    minions:[add('GREEN_BEAST','청춘의 맹수',`${RESP}/hunt-025-green-swordsman-boss-sd-v1-768.webp`,28_000_000,1,.13,'EQUIPMENT_SUPPLY_BOX'),add('LIGHTNING_DISCIPLE','뇌광 체술가',`${RESP}/hunt-016-thunder-swordsman-boss-sd-v1-768.webp`,34_000_000,.55,.157,'MASTER_STAR')],
    rewards:rewards(4_200_000,30_000_000,'MASTER_STAR','PREMIUM_CUBE',2)
  }
]);

export function weeklyRaidBossForKst(nowMs=Date.now()){
  const weekday=new Date(nowMs+9*60*60*1000).getUTCDay();
  return WEEKLY_RAID_BOSSES_V1.find(row=>row.weekday===weekday)||WEEKLY_RAID_BOSSES_V1[0];
}

export function weeklyRaidBossByName(name){return WEEKLY_RAID_BOSSES_V1.find(row=>row.name===String(name||''))||null;}
export function weeklyRaidBossByCode(code){return WEEKLY_RAID_BOSSES_V1.find(row=>row.code===String(code||'').toUpperCase())||null;}

let ensurePromise=null;
export async function ensureWeeklyRaidBossesV1(env){
  if(ensurePromise)return ensurePromise;
  ensurePromise=(async()=>{
    const marker=await env.DB.prepare("SELECT value FROM app_meta WHERE key='safe_runtime_upgrade_v2140_weekly_raid_bosses'").first();
    if(marker?.value==='1')return true;
    for(const boss of WEEKLY_RAID_BOSSES_V1){
      const existing=await env.DB.prepare('SELECT id FROM raid_bosses WHERE name=? ORDER BY id LIMIT 1').bind(boss.name).first();
      if(existing?.id)await env.DB.prepare('UPDATE raid_bosses SET image_url=?,max_hp=?,defense_rate=?,is_active=1,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(boss.sourceArt,boss.maxHp,boss.defenseRate,boss.weekday+1,existing.id).run();
      else await env.DB.prepare('INSERT INTO raid_bosses(name,image_url,max_hp,defense_rate,is_active,sort_order) VALUES(?,?,?,?,1,?)').bind(boss.name,boss.sourceArt,boss.maxHp,boss.defenseRate,boss.weekday+1).run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO app_meta(key,value,updated_at) VALUES('safe_runtime_upgrade_v2140_weekly_raid_bosses','1',CURRENT_TIMESTAMP)").run();
    return true;
  })().catch(error=>{ensurePromise=null;throw error});
  return ensurePromise;
}

export function weeklyRaidBossSettings(base,boss){
  const profile=boss||weeklyRaidBossForKst();
  return {...base,
    bossAttackPower:Math.max(Number(base?.bossAttackPower||850),Math.floor(profile.powerRating/2300)),
    bossAttackIntervalMs:Math.max(3200,Number(base?.bossAttackIntervalMs||5000)),
    clearMysticEnergy:Number(base?.clearMysticEnergy||0),
    rewards:profile.rewards,
    bossProfile:{...profile,minionGuardRatio:.65}
  };
}
