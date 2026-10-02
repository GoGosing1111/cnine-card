import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {APOCALYPSE_SHANKS_SHISUI_BOSSES as BOSSES} from '../shared/apocalypse-shanks-shisui-v1.mjs';
import {apocalypseLegionBoss,apocalypseLegionSuitDefense} from '../shared/apocalypse-legion-v1.mjs';
import {pveDifficultyRuntime,normalizeApocalypseSettings,preserveApocalypseUltimateSettings} from '../functions/_pve_nightmare.js';
import {createPveBattleV2,buildPvePlayerTeam,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {SKILL_CHIP_CATALOG} from '../shared/battle-suit-skill-chips.mjs';
import {registerShanksShisui,OPERATION_KEY} from '../scripts/ops/apocalypse-shanks-shisui-release-20261003.mjs';
const profile={battlePower:80000000,rewardCoin:15000000,rewardPercent:1000,hpPercent:350,attackPercent:475,defensePercent:375,speedPercent:375,shieldPercent:70,attackCount:2,forcedActionEvery:4,skillEnabled:true,legionUltimate:{enabled:true,attackPercent:20,shieldPiercePercent:40}};
const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:'NEW-BOSS-'+i,power:40000000,power_type,rarity:'FUR'}));
const runtime=(boss,extra={})=>pveDifficultyRuntime({apocalypse:{monsterProfiles:{[boss.monsterId]:{...profile,battlePower:boss.battlePower,legionUltimate:{...boss.skills[2],enabled:true},...extra}}}},{id:boss.monsterId,name:boss.name,pve_tab:'APOCALYPSE',is_boss:1});

test('new boss progression and real seven-enemy encounter keep Kaneki action mechanics',()=>{
 assert.ok(BOSSES[0].battlePower>profile.battlePower&&BOSSES[1].battlePower>BOSSES[0].battlePower);
 assert.ok(BOSSES[0].skills[2].attackPercent>20&&BOSSES[1].skills[2].attackPercent>BOSSES[0].skills[2].attackPercent);
 for(const boss of BOSSES){
  assert.equal(apocalypseLegionBoss({id:'B:0:MONSTER:'+boss.monsterId}),boss);
  const r=runtime(boss),fight=createPveBattleV2({cards,monster:r.engineMonster,seed:83});
  assert.equal(fight.teams.B.cards.length,7);assert.equal(fight.rules.victoryCondition,'ALL_ENEMIES_DEFEATED');
  assert.equal(fight.teams.B.cards[0].battleSuitSkillDefensePercent,boss.battleSuitSkillDefensePercent);
  assert.ok(fight.teams.B.cards.slice(1).every(c=>c.isApocalypseMinion&&!c.battleSuitSkillDefensePercent));
  assert.equal(fight.result.timeline.some(e=>e.type==='BOSS_ULTIMATE'),false);
  const casts=fight.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL');assert.deepEqual(casts.map(e=>e.kind),['seal','curse','ultimate']);
  assert.equal(casts[0].hits.length,boss.skills[0].targetCount);assert.ok(casts[0].hits.every(h=>h.remainingActions===boss.skills[0].statusActions));
  assert.equal(casts[2].attackPercent,boss.skills[2].attackPercent);
  const off=createPveBattleV2({cards,monster:runtime(boss,{skillEnabled:false}).engineMonster,seed:83});assert.equal(off.teams.B.cards.length,7);assert.ok(!off.result.timeline.some(e=>e.type==='APOCALYPSE_SKILL'));
 }
});
test('dedicated defense supports explicit zero, bounds, CMS compatibility and immutable battle snapshots',()=>{
 assert.equal(apocalypseLegionSuitDefense(77),35);assert.equal(apocalypseLegionSuitDefense(78),50);assert.equal(apocalypseLegionSuitDefense(76),0);
 assert.equal(apocalypseLegionSuitDefense(77,0),0);assert.equal(apocalypseLegionSuitDefense(77,-2),0);assert.equal(apocalypseLegionSuitDefense(78,999),100);
 const previous={monsterProfiles:{77:{...profile,battleSuitSkillDefensePercent:62.5}}};
 const older=preserveApocalypseUltimateSettings({monsterProfiles:{77:{...profile}}},previous);assert.equal(normalizeApocalypseSettings(older).monsterProfiles[77].battleSuitSkillDefensePercent,62.5);
 assert.equal(normalizeApocalypseSettings(preserveApocalypseUltimateSettings({monsterProfiles:{77:{...profile,battleSuitSkillDefensePercent:0}}},previous)).monsterProfiles[77].battleSuitSkillDefensePercent,0);
 const r=runtime(BOSSES[0]),battle=createPveBattleV2({cards,monster:r.engineMonster,seed:83});r.engineMonster.pve_battle_suit_skill_defense_percent=90;assert.equal(battle.teams.B.cards[0].battleSuitSkillDefensePercent,35);
 assert.equal(pveDifficultyRuntime({apocalypse:previous},{id:77,pve_tab:'NORMAL',is_boss:1}).battleSuitSkillDefensePercent,0);
});
test('real skill-chip hits mitigate shield and pierce together; normal firing is preserved and full defense blocks all skill damage',()=>{
 const suit={code:'BATTLE_SUIT_03',pvePower:300000,weapon:{code:'EQ_1785427638137'},skillChips:SKILL_CHIP_CATALOG.map(c=>c.code)};
 const team=()=>buildPvePlayerTeam({cards:cards.map(c=>({...c,power:400000})),battleSuit:suit}).simulationTeamA;
 const fight=defense=>{const enemy=buildMonsterFighter({id:68,name:'DEFENSE QA',battle_power:300000,is_boss:1,pve_difficulty:'APOCALYPSE',pve_hp_percent:1200,pve_attack_percent:100,pve_shield_percent:300});enemy.battleSuitSkillDefensePercent=defense;return simulateBattleV2Preview({teamA:team(),teamB:[enemy],seed:2011,maxActions:80});};
 const base=fight(0),half=fight(50),full=fight(100);
 const first=result=>result.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&!e.dodge);assert.ok(first(base)&&first(half)&&first(full));
 assert.equal(first(half).calculatedDamage,Math.round(first(base).calculatedDamage*.5));assert.equal(first(full).calculatedDamage,0);
 const firstCast=result=>result.timeline.findIndex(e=>e.type==='SKILL_CHIP_CAST');assert.deepEqual(half.timeline.slice(0,firstCast(half)),base.timeline.slice(0,firstCast(base)),'Ordinary shots changed');
 const hits=full.timeline.filter(e=>e.type==='SKILL_CHIP_HIT');assert.ok(hits.length);assert.ok(hits.every(e=>e.damage===0&&e.absorbed===0&&!e.apocalypsePierce));
 assert.ok(half.timeline.filter(e=>e.type==='SKILL_CHIP_HIT').every(e=>e.battleSuitSkillDefensePercent===50));
});
test('source art, alpha sprites and six distinct authored twelve-frame atlases are complete',()=>{
 const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/monsters/apocalypse-shanks-shisui-v1/manifest.json'));
 assert.equal(manifest.files.length,10);assert.equal(manifest.pixelEdits,false);
 for(const boss of BOSSES){assert.notEqual(boss.sourceArt,boss.battleSprite);assert.ok(fs.existsSync('.'+boss.sourceArt)&&fs.existsSync('.'+boss.battleSprite));for(const skill of boss.skills){const atlas=JSON.parse(fs.readFileSync('.'+skill.atlas));assert.equal(Object.keys(atlas.frames).length,12);assert.equal(atlas.meta.collisionFrame,6);const sheet=manifest.files.find(f=>f.path===skill.atlas.slice(1).replace('-atlas.json','-sheet.png'));assert.equal(new Set(sheet.frames.map(f=>f.sha256)).size,12);assert.ok(sheet.transparentRatio>.10);}}
});
test('X and Z intrinsic area skills apply defense per enemy while unprotected minions retain their damage',()=>{
 for(const code of ['BATTLE_SUIT_X_BODY','BATTLE_SUIT_Z_BODY']){
  const run=defenses=>simulateBattleV2Preview({
   teamA:buildPvePlayerTeam({cards,battleSuit:{code,pvePower:300000}}).simulationTeamA,
   teamB:defenses.map((defense,i)=>({...buildMonsterFighter({id:68+i,name:'AREA QA '+i,battle_power:300000,is_boss:1,pve_difficulty:'APOCALYPSE'}),id:'B:'+i+':MONSTER:'+(68+i),slot:i,hp:1e12,maxHp:1e12,shield:1e14,maxShield:1e14,attack:1,battleSuitSkillDefensePercent:defense})),
   seed:2011,maxActions:80
  });
  const base=run([0,0,0]),protectedFight=run([35,50,0]),blocked=run([100,100,0]);
  const cast=result=>result.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&e.damageSource==='BATTLE_SUIT_INTRINSIC_SKILL');
  const a=cast(base),b=cast(protectedFight),c=cast(blocked);assert.equal(b.targets.length,3);
  for(let i=0;i<3;i++)assert.equal(b.targets[i].calculatedDamage,Math.round(a.targets[i].calculatedDamage*(1-[35,50,0][i]/100)));
  assert.equal(c.targets[0].calculatedDamage,0);assert.equal(c.targets[1].calculatedDamage,0);assert.equal(c.targets[2].calculatedDamage,a.targets[2].calculatedDamage);
  const hits=blocked.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===c.castId&&e.targetId!==c.targets[2].targetId);
  assert.ok(hits.length);assert.ok(hits.every(e=>e.damage===0&&e.absorbed===0&&!e.apocalypsePierce));
 }
});
test('Postgres registration preserves old profiles, supports rollback, rejects unpublished assets and replays once',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);CREATE TABLE battle_monsters(id bigint GENERATED BY DEFAULT AS IDENTITY (START WITH 75) PRIMARY KEY,name text,image_url text,battle_power bigint,reward_coin bigint,is_boss int,is_active int,sort_order int,monster_category text,pve_tab text,pve_display_order int,pve_enabled int,tower_enabled int,tower_only int,ultimate_enabled int,ultimate_name text,ultimate_description text);CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);CREATE TABLE admin_logs(id serial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);INSERT INTO users VALUES(1,'OWNER','ACTIVE');INSERT INTO battle_monsters(id,name,pve_tab,pve_display_order,sort_order) VALUES(13,'샹크스','HARD',13,13),(76,'카네키 켄','APOCALYPSE',40,40);`);
  const settings={enabled:true,monsterProfiles:{76:profile},unrelated:'KEEP'};await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['battle_apocalypse_settings_v1',JSON.stringify(settings)]);
  const client={query:(sql,args)=>db.query(sql,args)};
  const dry=await registerShanksShisui(client);assert.equal(dry.committed,false);assert.equal(dry.registered.length,2);assert.equal((await db.query('SELECT id FROM battle_monsters')).rows.length,2);
  await assert.rejects(registerShanksShisui(client,{commit:true}),/Published asset not verified/);
  const assets=BOSSES.flatMap(b=>[b.sourceArt,b.battleSprite,...b.skills.flatMap(s=>[s.atlas,s.atlas.replace('-atlas.json','-sheet.png')])]).map(path=>({path,sha256:'a'.repeat(64),verified:true}));
  const saved=await registerShanksShisui(client,{commit:true,assets});assert.equal(saved.committed,true);const after=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',['battle_apocalypse_settings_v1'])).rows[0].value);assert.deepEqual(after.monsterProfiles[76],profile);assert.equal(after.unrelated,'KEEP');assert.equal(after.monsterProfiles[78].battleSuitSkillDefensePercent,50);
  assert.equal((await registerShanksShisui(client,{commit:true,assets})).replayed,true);assert.equal((await db.query('SELECT id FROM admin_logs')).rows.length,1);assert.equal((await db.query('SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,1);
  assert.equal(Number((await db.query("INSERT INTO battle_monsters(name) VALUES('NEXT QA') RETURNING id")).rows[0].id),79,'Future CMS monster IDs must skip the registered IDs');
 }finally{await db.close();}
});
