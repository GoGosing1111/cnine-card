import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {APOCALYPSE_KNIGHTS, knightProfile} from '../shared/apocalypse-knights-v1.mjs';
import {apocalypseMonsterLimits, apocalypseLegionUltimate} from '../shared/apocalypse-legion-v1.mjs';
import {pveDifficultyRuntime, normalizeApocalypseSettings} from '../functions/_pve_nightmare.js';
import {castApocalypseAction, finishApocalypseAction, apocalypseHealing, clearApocalypseStatus} from '../functions/_apocalypse_legion.js';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {snapshot} from './helpers/helios-king-balance-20261106.mjs';
import {registerKnights} from '../scripts/ops/apocalypse-knights-20261124.mjs';
import {configureTrioActor} from '../preview/project-v-v3/source/battle/trio/TrioActorMotion.mjs';

const anchor = {battlePower:6600000000, rewardCoin:400000000, clearBonus:{coinPercent:null,masterStars:3000000,mysticEnergy:null},
  hpPercent:350, attackPercent:475, defensePercent:375, speedPercent:375, rewardPercent:1000, shieldPercent:70,
  attackCount:2, forcedActionEvery:4, skillEnabled:true, skillName:'모르가스', skillDescription:'모르가스',
  skillDamagePercent:95, legionUltimate:{enabled:true,attackPercent:30,shieldPiercePercent:65}, battleSuitSkillDefensePercent:50};

for (const boss of APOCALYPSE_KNIGHTS) test(boss.name + ' uses its saved profile and its own three actions in a seven-enemy battle', () => {
  const id = boss.monsterId, profile = knightProfile(boss, anchor);
  const settings = {apocalypse:{enabled:true,monsterProfiles:{[id]:profile}}};
  const runtime = pveDifficultyRuntime(settings,{id,name:boss.name,pve_tab:'APOCALYPSE',is_boss:1});
  assert.deepEqual(normalizeApocalypseSettings(settings.apocalypse).monsterProfiles[id],profile);
  assert.equal(runtime.effectiveRewardCoin,id===84?10_000_000_000:20_000_000_000);
  assert.equal(profile.clearBonus.masterStars,id===84?1_000_000:2_000_000);
  assert.deepEqual(runtime.equipmentBenchmark,id===84?{tier:8,level:10}:{tier:10,level:15});
  const cards = ['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((type,i) => ({id:'QA-'+i,power:2e8,power_type:type,rarity:i<2?'FUR':'ZENITH'}));
  const input = {cards,mercenaries:['V-966','V-953'].map(c => snapshot(c,21,'PVE',1e8)),seed:17};
  const battle = createPveBattleV2({...input,monster:runtime.engineMonster});
  assert.equal(battle.rules.victoryCondition,'ALL_ENEMIES_DEFEATED');
  const [leader,...minions] = battle.teams.B.cards;
  assert.equal(minions.length,6);
  assert.equal(leader.projectVMonsterArt.primaryUrl,boss.battleSprite);
  assert.equal(leader.projectVMonsterArt.artFacing,-1);
  assert.equal(leader.projectVMonsterArt.kind,'MONSTER_FULL_BODY');
  assert.equal(leader.battleSuitSkillDefensePercent,boss.battleSuitSkillDefensePercent);
  for (const url of [boss.battleSprite,boss.sourceArt]) {
    const png=fs.readFileSync(new URL('..'+url,import.meta.url));
    assert.equal(png.toString('ascii',1,4),'PNG');
    assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[1024,1536]);
    if (url === boss.battleSprite) assert.equal(png[25],6);
  }
  const casts=battle.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL');
  assert.deepEqual(casts.map(e=>e.skillCode),boss.skills.map(m=>m.code));
  assert.deepEqual(casts.map(e=>e.hits.length),id===84?[2,3,2]:[7,4,7]);
  for (const e of casts) assert.equal(new Set(e.hits.map(h=>h.targetId)).size,e.hits.length);
  const ordinary = pveDifficultyRuntime(settings,{id,is_boss:1,pve_tab:'NORMAL',battle_power:200});
  assert.equal(ordinary.equipmentBenchmark,undefined);
  assert.equal(createPveBattleV2({...input,monster:ordinary.engineMonster}).teams.B.cards.length,1);
});

test('Rahden breaks shield ties by attack and slot, Velsir only amplifies damage against an active curse', () => {
  const [red,blue]=APOCALYPSE_KNIGHTS;
  function cast(boss,targets,action=3){
    const actor={id:'B:0',monsterId:boss.monsterId,actions:action,hp:100,attack:1000,damageDealt:0,apocalypseSkillsEnabled:true};
    let event;
    const used=castApocalypseAction(actor,targets,{emit:(_,e)=>event=e,
      damageCombined:(target,normal,pierce)=>({hpDamage:normal+pierce,absorbed:0}),knockout:()=>{}});
    assert(used); return event;
  }
  const target=(id,shield,attack,slot)=>({id,alive:true,hp:5000,maxHp:5000,shield,attack,defense:0,slot});
  const targets=[target('a',0,200,0),target('b',700,50,1),target('c',700,100,2),target('d',700,50,3),
    {...target('suit',2000,999,4),isBattleSuit:true}];
  assert.deepEqual(cast(red,targets).hits.map(h=>h.targetId),['c','b']);
  assert.deepEqual(cast(red,targets,1).hits.map(h=>h.targetId),['a','c']);
  cast(blue,targets,1);
  assert.equal(apocalypseHealing(targets[0],50),0);
  clearApocalypseStatus(targets[1]);
  for(let i=0;i<4;i++) finishApocalypseAction(targets[2]);
  assert.equal(apocalypseHealing(targets[2],50),50);
  const hits=cast(blue,targets).hits;
  const base=10*apocalypseLegionUltimate(blue).attackPercent;
  assert.deepEqual(hits.map(h=>h.damage),[Math.round(base*1.2),base,base,Math.round(base*1.2)]);
});

test('an enemy slot retains native left-facing art across casts and resets on reuse, with limits scoped to the new bosses', () => {
  const actor={battleCard:{cardId:'MONSTER:84',projectVMonsterArt:{artFacing:-1}},applyFacing(){this.direction=this.artFacing;}};
  configureTrioActor(actor); assert.equal(actor.direction,-1);
  actor.battleCard={cardId:'MONSTER:85',projectVMonsterArt:{artFacing:-1}};
  configureTrioActor(actor); assert.equal(actor.direction,-1);
  actor.battleCard={cardId:'PLAYER_CARD'}; configureTrioActor(actor); assert.equal(actor.direction,1);
  assert.equal(apocalypseMonsterLimits(85).battlePower,10e12);
  assert.equal(apocalypseMonsterLimits(83).battlePower,1e12);
  assert.equal(apocalypseMonsterLimits(80).battlePower,1e9);
});

test('registration rolls back as a unit, preserves Morgas, advances the ID sequence and may be retried', async t => {
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at timestamp);
    CREATE TABLE battle_monsters(id bigint GENERATED BY DEFAULT AS IDENTITY (START WITH 83) PRIMARY KEY,name text,image_url text,battle_power bigint,
    reward_coin bigint,is_boss int,is_active int,sort_order int,monster_category text,pve_tab text,pve_display_order int,pve_enabled int,tower_enabled int,tower_only int,
    ultimate_enabled int,ultimate_name text,ultimate_description text);
    CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);
    CREATE TABLE admin_logs(id serial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
    INSERT INTO users VALUES(1,'OWNER','ACTIVE');
    INSERT INTO battle_monsters(name,battle_power,pve_tab,pve_display_order) VALUES('모르가스',6600000000,'APOCALYPSE',46)`);
  const settings={enabled:true,monsterProfiles:{83:anchor},other:'preserved'};
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['battle_apocalypse_settings_v1',JSON.stringify(settings)]);
  const options={expectedMorgas:anchor};
  const previewClient={query:(sql,args)=>{assert.doesNotMatch(sql,/^\s*(?:INSERT|UPDATE|DELETE)\b/i);return db.query(sql,args);}};
  const dry=await registerKnights(previewClient,options);
  assert.equal(dry.committed,false); assert.deepEqual(dry.registered.map(b=>b.order),[47,48]);
  assert.equal((await db.query('SELECT id FROM battle_monsters')).rows.length,1);
  await assert.rejects(registerKnights(db,{expectedMorgas:{}}),/설정/);
  await db.query("INSERT INTO battle_monsters(id,name,pve_tab) VALUES(84,'occupied','NORMAL')");
  await assert.rejects(registerKnights(db,{commit:true}),/이미 사용/);
  await db.query('DELETE FROM battle_monsters WHERE id=84');
  const fail={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('audit')):db.query(sql,args)};
  await assert.rejects(registerKnights(fail,{commit:true}),/audit/);
  assert.equal((await db.query('SELECT id FROM battle_monsters')).rows.length,1);
  const done=await registerKnights(db,{...options,commit:true});
  assert.equal(done.committed,true);
  assert.deepEqual(done.registered.map(b=>[b.coin,b.clearBonus.masterStars]),[[10_000_000_000,1_000_000],[20_000_000_000,2_000_000]]);
  const saved=JSON.parse((await db.query('SELECT value FROM app_meta WHERE key=$1',['battle_apocalypse_settings_v1'])).rows[0].value);
  for(const boss of APOCALYPSE_KNIGHTS){assert.deepEqual(saved.monsterProfiles[boss.monsterId],knightProfile(boss,anchor));delete saved.monsterProfiles[boss.monsterId];}
  assert.deepEqual(saved,settings);
  const readOnly={query:(sql,args)=>{assert.match(sql,/^SELECT /);return db.query(sql,args);}};
  assert.equal((await registerKnights(readOnly,{commit:true})).replayed,true);
  assert.equal((await db.query('SELECT id FROM admin_logs')).rows.length,1);
  assert.equal(Number((await db.query("INSERT INTO battle_monsters(name) VALUES('next') RETURNING id")).rows[0].id),86);
});
