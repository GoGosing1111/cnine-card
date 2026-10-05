import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {FUR_MAX_ENHANCEMENT,extendFurHighBreakthrough} from '../../functions/_fur_enhancement_v2114.js';
import {UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS} from '../../functions/_unique_advancement.js';
export const live=JSON.parse(fs.readFileSync(new URL('./icon-fur15-reference-20261005.json',import.meta.url)));
const api=fs.readFileSync(new URL('../../functions/api/[[path]].js',import.meta.url),'utf8');
const names=['defaultBattleSettings','cleanBattleSettingsPayload','cleanHighBreakthroughSteps','cleanFurMasterStarBreakthrough','readBattleSettings','cardPowerBase','breakthroughBonusPercent','cardBattlePower'];
const context=vm.createContext({FUR_MAX_ENHANCEMENT,extendFurHighBreakthrough,normalizeBattleEngineSettings:x=>x||{},normalizeNightmareSettings:x=>x||{},normalizeApocalypseSettings:x=>x||{},normalizeUltimateRequiredGrade:x=>x});
const constants=['BATTLE_POWER_DEFAULT','BATTLE_BREAKTHROUGH_DEFAULT','HIGH_BREAKTHROUGH_BONUS_DEFAULT','FUR_MASTER_STAR_BREAKTHROUGH_DEFAULT','FAKER_CHAMPIONSHIP_CARD_ID','FAKER_FLAT_POWER_BONUS'];
vm.runInContext(constants.map(n=>api.match(new RegExp('^const '+n+'\\s*=.*;$','m'))[0]).concat(names.map(n=>{
 const i=api.search(new RegExp('^(?:async )?function '+n+'\\(','m'));
 return api.slice(i).split(/\r?\n(?=(?:async )?function |const |let )/)[0];
})).join('\n'),context);
export const canonicalPower=async(rows,battle,high)=>{
 const settings=await context.readBattleSettings({DB:{prepare:()=>({all:async()=>({results:[{key:'battle_settings_v1',value:JSON.stringify(battle)},{key:'fur_master_star_breakthrough_v1802',value:JSON.stringify(high)}]})})}});
 return rows.map(c=>context.cardBattlePower({...c,rarity:'FUR'},15,settings));
};
export function iconFurFixture({rows=live.cards,battle=live.battle,high=live.high}={}){
 const db=new DatabaseSync(':memory:'),queries=[];
 db.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,power_type TEXT,base_power REAL);CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,attack_percent REAL,defense_percent REAL,hp_percent REAL,speed_percent REAL,effect_name TEXT,effect_description TEXT,effect_type TEXT,trigger_type TEXT,effect_value REAL,trigger_chance REAL,max_activations INTEGER,scope_pve INTEGER,scope_pvp INTEGER,scope_captain INTEGER,is_active INTEGER);CREATE TABLE card_unique_advancements_v1937(user_id INTEGER,card_id TEXT,class_code TEXT,dominant_type TEXT,config_version INTEGER,modifiers_json TEXT,activated_at TEXT);");
 const save=(k,v)=>db.prepare('INSERT INTO app_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(v));
 save('battle_settings_v1',battle);save('fur_master_star_breakthrough_v1802',high);save('card_unique_effect_settings_v1',{enabled:true});save('card_unique_advancement_settings_v1937_release',{mode:'ON'});
 for(const c of rows){
  db.prepare('INSERT INTO cards_effective_v1210 VALUES(?,?,?,?,?)').run(c.id,c.title,'FUR',c.power_type||'FIXED',Number(c.base_power)||0);
  db.prepare('INSERT INTO card_unique_effects VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(c.id,...['attack_percent','defense_percent','hp_percent','speed_percent'].map(k=>Number(c[k])||0),'','','NONE','PASSIVE',0,100,1,...['scope_pve','scope_pvp','scope_captain','is_active'].map(k=>Number(c[k])||0));
  const ordered=[['ATTACK',c.attack_percent],['DEFENSE',c.defense_percent],['SPEED',c.speed_percent],['HP',c.hp_percent]],type=ordered.sort((a,b)=>b[1]-a[1])[0][0];
  const d=Object.values(UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS).find(x=>x.dominantType===type);
  if(Number(c.is_active))db.prepare('INSERT INTO card_unique_advancements_v1937 VALUES(1,?,?,?,1,?,?)').run(c.id,d.classCode,type,JSON.stringify(d.modifiers),'2026-10-05');
 }
 const env={DB:{prepare(sql){queries.push(sql);const stmt=db.prepare(sql);let args=[];const wrap={bind(...values){args=values;return wrap},async all(){return {results:stmt.all(...args)}},async first(){return stmt.get(...args)||null}};return wrap}}};
 return {db,env,save,queries,close:()=>db.close()};
}
