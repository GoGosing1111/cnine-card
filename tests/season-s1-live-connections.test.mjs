import {readFileSync} from 'node:fs';import {HEIR_TITLE} from '../shared/season-s1-title.mjs';import {prepareSeasonSchema} from '../functions/_season_s1.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {SEASON_S1_SCHEMA,seasonStatus,seasonMutation,seasonAwardStatements} from '../functions/_season_s1.js';
import {TOWER_ABYSS_PROTOCOL} from '../functions/_tower_abyss.js';
import {buildPvePlayerTeam,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {seasonFixture} from './helpers/season-s1-db.mjs';
const call=(tower,path,body)=>tower.handle(path,new Request('https://game.example/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-7',origin:'https://game.example','content-type':'application/json'},body:body?JSON.stringify(body):undefined}));
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: real tower replay keeps progress and legacy rewards; season award once; first floor is available once per season`,async t=>{
 const f=await jointFixture(t,{postgres}),tower=await operatingTowerFixture(f,{floorNo:101,maxFloor:100});
 for(const sql of SEASON_S1_SCHEMA){if(postgres)await f.pg.exec(sql.replaceAll('INTEGER','BIGINT'));else await f.p(sql).run();}
 f.env.SEASON_S1_ENABLED='1';f.env.SEASON_S1_NOW=f.deps.now;f.env.SEASON_S1_SCHEDULE={PVE:{start:f.deps.now()-15*86400000},PVP:{start:f.deps.now()-15*86400000}};
 assert.equal((await seasonStatus(f.env,7)).tracks.PVE.participation,0);
 const initial=await(await call(tower,'tower/status')).json();assert.equal(initial.completed,true);assert.deepEqual(initial.seasonReplayFloors,[1]);const coin=await f.coin(),progress=await f.p('SELECT * FROM tower_user_progress WHERE user_id=7').first();
 const body={requestId:'season-tower-replay-0001',floorNo:1,seasonReplay:true,protocol:TOWER_ABYSS_PROTOCOL};
 assert.equal((await call(tower,'tower/start',{...body,seasonReplay:false})).status,409);assert.equal((await call(tower,'tower/start',{...body,floorNo:91})).status,409);
 const start=await(await call(tower,'tower/start',body)).json();assert.equal(start.seasonReplay,true);assert.equal(start.reward,0);assert.equal(start.result,'WIN');assert.equal((await call(tower,'tower/finish',body)).status,409);f.setClock(start.settlement.notBefore);
 f.fail('UPDATE season_s1_accounts');assert.equal((await call(tower,'tower/finish',body)).status,503);f.fail('');
 let failure=null;const batch=f.env.DB.batch.bind(f.env.DB);f.env.DB.batch=async writes=>{try{return await batch(writes);}catch(e){failure={message:e.message,query:e.query};throw e;}};
 const done=await(await call(tower,'tower/finish',body)).json();assert.equal(done.reward,0,JSON.stringify({done,failure}));assert.equal(done.nextFloor,101);assert.equal(done.seasonReward.achievementXp,100);assert.equal(await f.coin(),coin);assert.deepEqual(await f.p('SELECT * FROM tower_user_progress WHERE user_id=7').first(),progress);assert.equal(Number((await f.p('SELECT COUNT(*) n FROM tower_clear_history').first()).n),0);
 await call(tower,'tower/finish',body);assert.equal((await seasonStatus(f.env,7)).tracks.PVE.participation,25);
 const post=await(await call(tower,'tower/status')).json();assert.deepEqual(post.seasonReplayFloors,[]);assert.equal((await call(tower,'tower/start',{...body,requestId:'no-second-season-replay'})).status,409);
});
test('production fighter construction carries equipped benefits into actual PVE and ranked snapshots',async t=>{
 const f=await jointFixture(t),deck=await f.deps.raidDeckPower(f.env,7,null,'TOWER'),cards=deck.cards;
 const a=buildPvePlayerTeam({cards}),b=buildPvePlayerTeam({cards,seasonEquipment:{attackBp:5000,hpBp:0}});assert.equal(a.teamA.length,5);for(let i=0;i<5;i++){assert.equal(b.teamA[i].attack,Math.floor(a.teamA[i].attack*1.5));assert.equal(b.teamA[i].maxHp,a.teamA[i].maxHp);}
 const before=createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:231}),after=createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:231,attackerSeasonEquipment:{hpBp:5000}});
 const base=before.teams.A.cards,boosted=after.teams.A.cards;assert.equal(boosted.length,5);for(let i=0;i<5;i++)assert.equal(boosted[i].maxHp,Math.floor(base[i].maxHp*1.5));assert.deepEqual(before.teams.B,after.teams.B);
});
test('crafted title unlocks the actual character title catalog exactly once',async t=>{
 const f=await seasonFixture(t),uid=4242;for(let day=0;day<24;day++){f.setClock(f.start+day*86400000);for(let i=0;i<9;i++)await f.award('HUNT');}
 const body={requestId:crypto.randomUUID(),recipeId:'COMMON_TITLE'};await seasonMutation(f.env,{id:uid},'craft',body);await seasonMutation(f.env,{id:uid},'craft',body);assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM user_character_titles WHERE user_id=?').bind(uid).first()).n),1);assert.equal((await f.DB.prepare('SELECT t.code FROM user_character_titles u JOIN character_titles t ON u.title_id=t.id').first()).code,'COMMON_S1_TITLE');
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': S1 Heir art and power upgrade in place for existing owners and equipped titles',async t=>{
 const f=await seasonFixture(t,{postgres}),db=f.DB,uid=4242,one=async(code)=>db.prepare('SELECT id,code,image_url,style_preset,pve_power FROM character_titles WHERE code=?').bind(code).first();
 const fresh=await one(HEIR_TITLE.code);assert.equal(fresh.image_url,HEIR_TITLE.image);assert.equal(fresh.style_preset,HEIR_TITLE.style);
 assert.equal(Number(fresh.pve_power),700000);
 const legacy=await one('PVE_S1_TITLE'),legacyPvp=await one('PVP_S1_TITLE');
 await db.prepare("UPDATE character_titles SET image_url=?,style_preset='DEFAULT',pve_power=0 WHERE code=?").bind('/assets/items/season-s1-immortal-king/immortal-seal-v3.webp',HEIR_TITLE.code).run();
 await db.prepare("INSERT INTO user_character_titles(user_id,title_id,source_type,source_id) VALUES(?,?,'SEASON_CRAFT','original-receipt')").bind(uid,fresh.id).run();
 const loadoutSql='CREATE TABLE user_title_loadout(user_id INTEGER PRIMARY KEY,title_id INTEGER)';
 if(postgres)await db.execSchema([loadoutSql]);else await db.prepare(loadoutSql).run();
 await db.prepare('INSERT INTO user_title_loadout(user_id,title_id) VALUES(?,?)').bind(uid,fresh.id).run();
 const migration=readFileSync(new URL('../database/migrations/20261107-season-s1-immortal-heir-art.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
 const power=readFileSync(new URL('../database/migrations/20261107-season-s1-immortal-heir-power.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').trim();
 await db.prepare(migration).run();await db.prepare(migration).run();await db.prepare(power).run();
 assert.deepEqual(await one(HEIR_TITLE.code),fresh);
 await db.prepare(power).run();
 await db.prepare('UPDATE character_titles SET pve_power=0 WHERE code=?').bind(HEIR_TITLE.code).run();
 await prepareSeasonSchema(f.env);await prepareSeasonSchema(f.env);
 assert.deepEqual(await one(HEIR_TITLE.code),fresh);assert.deepEqual(await one('PVE_S1_TITLE'),legacy);
 assert.deepEqual(await one('PVP_S1_TITLE'),legacyPvp);
 assert.equal(Number((await db.prepare('SELECT title_id FROM user_title_loadout WHERE user_id=?').bind(uid).first()).title_id),Number(fresh.id));
 const row=await db.prepare('SELECT title_id,source_id FROM user_character_titles WHERE user_id=?').bind(uid).all();assert.equal(row.results.length,1);assert.equal(Number(row.results[0].title_id),Number(fresh.id));assert.equal(row.results[0].source_id,'original-receipt');
});
