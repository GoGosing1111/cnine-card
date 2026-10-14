import {jointFixture} from './joint-db.mjs';
import {emptyPetDraft,emptyPetCmsDocument,PET_CMS_KEY} from '../../shared/pet-cms-v1.mjs';
import {emptyTrophyBonuses,TROPHY_BONUSES_KEY} from '../../shared/trophy-bonuses-v1.mjs';
import {PET_ART_CATALOG} from '../../shared/pet-art-catalog-v1.mjs';
export async function collectionFixture(t,{postgres=false}={}){
  const f=await jointFixture(t,{postgres});
  if(postgres)await f.pg.exec("CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT CASE WHEN $1='now' THEN sqlite_now() ELSE to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS') END$$;");
  const sql=[
    'CREATE TABLE pvp_season_settlements(id INTEGER,season_name TEXT,started_at TEXT,completed_at TEXT,status TEXT)',
    'CREATE TABLE pvp_season_settlement_ranks(settlement_id INTEGER,user_id INTEGER,tier_id TEXT,tier_name TEXT,final_rank INTEGER,season_score INTEGER,wins INTEGER,losses INTEGER)',
    'CREATE TABLE clan_season_settlements(season_id INTEGER,champion_clan_id INTEGER,status TEXT,completed_at TEXT,reward_status TEXT)',
    'CREATE TABLE clan_seasons(id INTEGER,phase TEXT)',
    'CREATE TABLE clan_members(season_id INTEGER,clan_id INTEGER,user_id INTEGER,joined_at TEXT)',
    'CREATE TABLE clan_organizations(id INTEGER)',
    'CREATE TABLE clan_championship_rewards(season_id INTEGER,user_id INTEGER,completed_at TEXT,reward_type TEXT,reward_amount INTEGER,status TEXT)',
    'CREATE TABLE clan_championships(season_id INTEGER,winner_clan_id INTEGER,status TEXT,completed_at TEXT,reward_status TEXT)',
    'CREATE TABLE clan_championship_members(season_id INTEGER,user_id INTEGER,clan_id INTEGER)'
  ];
  if(postgres)await f.env.DB.execSchema(sql);else for(const s of sql)await f.p(s).run();
  const write=(key,value)=>f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
  const art=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON'),pet={...emptyPetDraft(art.code),name:art.name,sourceArt:art.sourceArt,battleSprite:art.sourceArt,liveEnabled:true,buffs:[{type:'ATTACK_PERCENT',percent:10}],rewardBonuses:{dropPercent:10,accountXpPercent:20,coinPercent:30}};
  const pets={revision:1,audit:[],document:{...emptyPetCmsDocument(),pets:[pet]}};
  const trophies=emptyTrophyBonuses();trophies.trophies.find(t=>t.code==='RANKED_CHAMPION').rewardBonuses={dropPercent:5,accountXpPercent:10,coinPercent:15};trophies.trophies.find(t=>t.code==='CITY_TOP_25').rewardBonuses={dropPercent:2,accountXpPercent:5,coinPercent:5};
  await write(PET_CMS_KEY,pets);await write('pet_collection_v1:7',{revision:1,pets:{[pet.code]:10}});await write('pet_loadout_v1:7',{revision:1,petCode:pet.code,audit:[]});await write(TROPHY_BONUSES_KEY,{revision:1,audit:[],document:trophies});
  await write('trophy_lich_legacy_baseline_v1',{ready:true});await write('trophy_city_top_v1:7',{count:25,acquiredAt:'2026-10-14T00:00:00Z'});
  for(const id of [1,2]){await f.p('INSERT INTO pvp_season_settlements VALUES(?,?,?,?,?)',id,'시즌 '+id,'2026-08-0'+id,'2026-09-0'+id,'COMPLETED').run();await f.p("INSERT INTO pvp_season_settlement_ranks VALUES(?,7,'challenger','챌린저',1,3000,10,0)",id).run();}
  return {...f,write,pet,pets,trophies};
}
