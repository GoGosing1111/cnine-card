import {accountRankAward} from '../../functions/_account_rank.js';
import fs from 'node:fs';
import {loadScrapyardV3Snapshot} from '../../functions/_scrapyard_v3.js';
import {buildTowerV3Battle,TOWER_V3_DRAFT} from '../../functions/_tower_v3.js';

// Execute the actual operating route block against isolated SQLite/PostgreSQL.
const source=fs.readFileSync(new URL('../../functions/api/[[path]].js',import.meta.url),'utf8');
const block=source.slice(source.indexOf("    if(path==='tower/config'"),source.indexOf("    if(path==='deck-synergy/status'"));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const names=['accountRankAward','authenticate','json','readBody','towerSettings','isAdminRole','raidDeckPower','battleSettings','evaluateDeckSynergies','resolveUniqueBattleRuntime','loadScrapyardV3Snapshot','cardBattlePower','magicBattleLoadout','selectActivatedUltimate','releasedMercenarySnapshot','buildTowerV3Battle','TOWER_V3_DRAFT','magicSettings','magicRewardForTowerFloor','resolveMagicCrystalReward','safeEquipmentDrop','rollBlackMiracleDrop','deferWrite','grantWeeklyPremiumCube','uniqueBattleResponsePayload','grantHighGradeRerollDrop','userEquipmentBonuses','pveDeckCards'];
const execute=new AsyncFunction('path','request','env','deps',`const {${names.join(',')}}=deps;\n${block}`);
export async function operatingTowerFixture(f,{floorNo=1,maxFloor=70,monsterPower=1000000,rewardCoin=1000000}={}){
  const integer=f.env.DB.dialect==='postgres'?'BIGINT':'INTEGER';
  const ddl=sql=>f.pg?f.pg.exec(sql):f.p(sql).run();
  for(const [table,columns] of [
    ['tower_user_progress',[['season_id',`${integer} DEFAULT 1`],['current_floor',`${integer} DEFAULT 1`],['highest_reached_at','TEXT'],['updated_at','TEXT']]],
    ['tower_floor_ranges',[['power_override',integer],['is_boss',integer]]],
    ['tower_floors',[['monster_id',integer],['power_override',integer],['is_boss',integer]]],
    ['tower_clear_history',[['season_id',integer],['user_id',integer],['floor_no',integer],['monster_power',integer],['result','TEXT']]],
    ['battle_monsters',['ultimate_enabled','ultimate_name','ultimate_description','ultimate_trigger','ultimate_chance','ultimate_damage_percent','ultimate_tower_damage_percent','ultimate_force_cast','ultimate_target','ultimate_theme','ultimate_warning_text','ultimate_shake','ultimate_zoom','ultimate_media_url','ultimate_sound_url','ultimate_duration_ms','ultimate_volume_percent'].map(key=>[key,'TEXT'])]
  ])for(const [column,type] of columns)await ddl(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  await ddl('CREATE UNIQUE INDEX tower_live_progress_qa ON tower_user_progress(season_id,user_id)');
  await ddl(`CREATE TABLE user_cards(user_id ${integer},card_id TEXT,breakthrough_level ${integer})`);
  await ddl(`CREATE TABLE cards_effective_v1210(id TEXT,title TEXT,rarity TEXT,image_url TEXT,focus_x ${integer},focus_y ${integer})`);
  const deck=await f.deps.raidDeckPower(f.env,7,null,'TOWER');
  for(const card of deck.cards){await f.p('INSERT INTO user_cards VALUES(?,?,0)',7,String(card.id)).run();await f.p('INSERT INTO cards_effective_v1210 VALUES(?,?,?,?,50,50)',String(card.id),card.title,card.rarity,card.image).run();}
  await f.p('INSERT INTO tower_user_progress(user_id,season_id,current_floor,highest_floor) VALUES(7,1,?,?)',floorNo,floorNo-1).run();
  await f.p('INSERT INTO battle_monsters(id,name,image_url,battle_power,is_boss) VALUES(28,?,?,?,1)','아이젠 소스케','assets/ui/project-v/monsters/hunt-tower/tower-028-violet-magus-boss-sd-v1.png',monsterPower).run();
  await f.p('INSERT INTO tower_floor_ranges(id,season_id,start_floor,end_floor,reward_coin,monster_id,is_active,power_override,is_boss) VALUES(2094,1,1,?,?,28,1,?,1)',maxFloor,rewardCoin,monsterPower).run();
  const baseDeck=f.deps.raidDeckPower;
  const deps={accountRankAward,...f.deps,readBody:r=>r.json(),towerSettings:async()=>({enabled:true}),isAdminRole:u=>u.role==='OWNER',
    raidDeckPower:async(...args)=>{const d=await baseDeck(...args);return {...d,basePower:d.cards.reduce((n,c)=>n+Number(c.base_power),0)};},
    battleSettings:async()=>({engine:{}}),evaluateDeckSynergies:async()=>({totals:{attackPercent:0,bossDamagePercent:0}}),resolveUniqueBattleRuntime:()=>null,
    loadScrapyardV3Snapshot,buildTowerV3Battle,TOWER_V3_DRAFT,releasedMercenarySnapshot:async()=>null,
    magicSettings:async()=>({acquisition:{tower:{enabled:false}}}),magicRewardForTowerFloor:()=>0,resolveMagicCrystalReward:async()=>null,
    safeEquipmentDrop:async()=>null,rollBlackMiracleDrop:async()=>null,grantWeeklyPremiumCube:async()=>null,
    uniqueBattleResponsePayload:()=>null,grantHighGradeRerollDrop:async()=>null,deferWrite:(_name,work)=>void work(),
    userEquipmentBonuses:async()=>({pve:0}),pveDeckCards:async()=>deck.ids};
  return {handle:(path,request)=>execute(path,request,f.env,deps),setFloor:floor=>f.p('UPDATE tower_user_progress SET current_floor=?,highest_floor=? WHERE user_id=7',floor,floor-1).run()};
}
