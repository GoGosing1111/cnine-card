import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {BATHORY_CODE as CODE,BATHORY_COMBAT,BATHORY_ART,BATHORY_SKILL} from '../shared/mercenary-bathory-v1.mjs';
import {HALLOWEEN_COMBAT} from '../shared/mercenary-halloween-combat-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {ssLimitedProfile,mercenaryCombatRank} from '../shared/mercenary-ss-limited-v1.mjs';
import {HALLOWEEN_PACK_KEY,halloweenPackDraft,readHalloweenPackSettings,halloweenPackState,validateHalloweenPack} from '../shared/mercenary-halloween-pack-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {registerBathory,verifyBathoryRegistration,documentHash,OPERATION_KEY} from '../scripts/ops/bathory-registration-20261019.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {balanceSnapshot,balanceFormations} from '../scripts/measure-ss-mercenary-balance-20261019.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {mercenaryLevelXpMultiplier} from '../shared/mercenary-level-v1.mjs';
const root='preview/mercenary-bathory-halloween-20261019-v1/';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
test('Bathory is one SS seasonal identity, canonical power/skill, with original art and fixed ten-copy policy',()=>{
 assert.equal(BATHORY_ART.rank,'SS');assert.equal(BATHORY_ART.serverLimit,10);assert.equal(BATHORY_ART.season,'HALLOWEEN');
 assert.equal(hash(BATHORY_ART.sourceArt),BATHORY_ART.sourceArtSha256);assert.equal(hash(BATHORY_ART.battleSprite),BATHORY_ART.battleSpriteSha256);assert.equal(hash(BATHORY_ART.frame),BATHORY_ART.frameSha256);
 const doc=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})),rows=doc.cards.filter(c=>c.code===CODE);
 assert.equal(rows.length,1);assert.equal(rows[0].rank,'SS');assert.equal(rows[0].basePower,297000);assert.equal(rows[0].skills[0].id,BATHORY_SKILL.id);
 assert(!LIMITED_MERCENARIES.some(c=>c.code===CODE));assert(!MERCENARY_CMS_SEED.document.mercenaries.some(c=>c.code===CODE));
 for(const mode of ['PVE','PVP']){
  const fighter=buildMercenaryFighter({...balanceSnapshot(CODE),rank:'C',basePower:1,skills:[]},'A',mode,buildFighter);
  assert.equal(fighter.rank,'SS');assert.equal(fighter.basePower,297000);assert.equal(fighter.skills[0].id,'MS-977');assert.equal(mercenaryCombatRank(fighter),'SSS');
 }
 for(const p of Object.values(HALLOWEEN_COMBAT)){assert.equal(p.basePower,237600);assert(BATHORY_COMBAT.scale>p.scale);}
 assert.equal(ssLimitedProfile({code:CODE,isMercenary:false}),null);
});
test('old ON pack config gains only Bathory 0% and ten stock, no implicit opening or price/rate changes',()=>{
 for(const mode of ['OFF','ON']){
  const original=halloweenPackDraft();original.mode=mode;original.prices={single:100,ten:900};delete original.cardRatesPpm[CODE];delete original.stockLimits[CODE];
  for(const code of Object.keys(HALLOWEEN_COMBAT))original.stockLimits[code]=10;
  original.cardRatesPpm=Object.fromEntries(Object.keys(original.cardRatesPpm).map(code=>[code,code==='V-980'?1000000:0]));original.normalSssRatePpm=0;
  original.normalRankRatesPpm={C:0,B:0,A:0,S:0,SS:0,SSS:1000000};original.missRatePpm=0;
  const frozen=structuredClone(original),next=readHalloweenPackSettings(original);
  assert.equal(next.cardRatesPpm[CODE],0);assert.equal(next.stockLimits[CODE],10);assert.equal(next.mode,mode);assert.deepEqual(original,frozen);
  const stripped=structuredClone(next);delete stripped.cardRatesPpm[CODE];delete stripped.stockLimits[CODE];assert.deepEqual(stripped,original);
  const state=halloweenPackState(next,[{code:'V-980',stock_limit:10,issued:0}],[{code:'V-001',name:'일반',rank:'SSS',weight:1}]);
  assert.equal(state.userOpeningEnabled,mode==='ON');
  for(const limit of [9,11,null]){const invalid=structuredClone(next);invalid.stockLimits[CODE]=limit;assert.throws(()=>validateHalloweenPack(invalid));}
 }
});
test('each paid cast emits one server hit, not two animation hits',()=>{
 const f=balanceFormations[1],b=createPveBattleV2({cards:f.cards,mercenary:balanceSnapshot(CODE),monster:{id:1,name:'검증',battle_power:5e9},seed:9771901});
 const es=b.result.timeline.filter(e=>e.actorId==='A:MERCENARY:'+CODE&&e.skillId==='MS-977');
 const hits=es.filter(e=>e.type==='MERCENARY_HIT'),casts=es.filter(e=>e.type==='MERCENARY_WINDUP');assert(hits.length>0);assert.equal(hits.length,casts.length);
 assert(hits.every(e=>e.targetMaxHp>0&&e.targetHpAfter>=0));
});

test('owned Bathory saves independently in PVE/PVP, survives reload and retains SS growth',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),user={...f.user,role:'USER'};
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',CODE,'2026-10-19','2026-10-19').run();
 const coin=await f.coin();
 for(const mode of ['PVE','PVP']){
  const body={requestId:crypto.randomUUID(),mode,mercenaryCode:CODE,revision:0};
  assert.equal((await saveMercenaryLoadout(f.env,user,body)).revision,1);
  assert.equal((await saveMercenaryLoadout(f.env,user,body)).replayed,true);
  const single=await loadMercenaryBattleSnapshot(f.env,user,mode),batch=await releasedMercenarySnapshots(f.env,[7,8],mode);
  assert.deepEqual(batch.get(7),single);assert.equal(batch.has(8),false);assert.equal(single.rank,'SS');assert.equal(single.basePower,297000);assert.equal(single.skills[0].id,'MS-977');assert.equal(mercenaryLevelXpMultiplier(single),5);
 }
 const state=await mercenaryAccountState(f.env,user);assert(state.cards.find(c=>c.code===CODE).canDeploy);assert.equal(state.loadouts.PVE.mercenaryCode,CODE);assert.equal(state.loadouts.PVP.mercenaryCode,CODE);
 await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:null,revision:1});
 assert.equal(await loadMercenaryBattleSnapshot(f.env,user,'PVE'),null);assert.equal((await loadMercenaryBattleSnapshot(f.env,user,'PVP')).code,CODE);assert.equal(await f.coin(),coin);
});
test('tenth Bathory copy is global, atomic, replay safe; concurrent eleventh falls back to ordinary SSS',async t=>{
 const f=await halloweenFixture(t);f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code===CODE?1000000:0]));await f.configure();
 await f.pg.query('UPDATE mercenary_limited_stock_v1 SET issued=9 WHERE code=$1',[CODE]);
 const batch=f.DB.batch.bind(f.DB);let raced=false,winner;f.DB.batch=async statements=>{if(!raced){raced=true;winner=await f.service.open(f.env,{id:2},f.body());}return batch(statements);};
 const body=f.body(),loser=await f.service.open(f.env,f.user,body);
 assert.equal(winner.draws[0].mercenaryCode,CODE);assert.equal(winner.draws[0].serial,10);assert.equal(loser.draws[0].outcomeId,'CARD_SSS');
 assert.deepEqual((await f.service.open(f.env,f.user,body)).draws,loser.draws);
 assert.equal((await f.state()).stock.find(c=>c.code===CODE).issued,10);assert.equal(await f.coin(),999900);assert.equal(await f.coin(2),999900);
 assert.equal((await f.pg.query('SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1',[CODE])).rows.length,1);
});
test('registration remains local until approval; transaction rollback, partial failure and replay preserve other stock/settings',async t=>{
 const f=await halloweenFixture(t);await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT;");
 delete f.settings.cardRatesPpm[CODE];delete f.settings.stockLimits[CODE];await f.configure();await f.pg.query('DELETE FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE]);
 const stored=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value,options={expectedDocumentHash:documentHash(stored)};
 const snapshot=async()=>({stock:(await f.pg.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows,meta:(await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows,logs:(await f.pg.query('SELECT * FROM admin_logs')).rows,owned:(await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows});
 const before=await snapshot();await assert.rejects(registerBathory(f.pg,{...options,dryRun:false}),/approval/);
 await registerBathory(f.pg,options);assert.deepEqual(await snapshot(),before);
 await assert.rejects(registerBathory(f.pg,{expectedDocumentHash:'stale'}),/changed/);assert.deepEqual(await snapshot(),before);
 const broken={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('INJECTED')):f.pg.query(sql,args)};
 await assert.rejects(registerBathory(broken,options),/INJECTED/);assert.deepEqual(await snapshot(),before);
 const applied=await registerBathory(f.pg,{...options,dryRun:false,releaseApproved:true,approvalReference:'ISOLATED_TEST_ONLY'});
 assert.equal(applied.stock.stock_limit,10);assert.equal(applied.stock.issued,0);assert.equal((await registerBathory(f.pg,options)).replayed,true);await verifyBathoryRegistration(f.pg);
 const after=await snapshot();assert.deepEqual(after.stock.filter(s=>s.code!==CODE),before.stock);assert.deepEqual(after.owned,before.owned);assert.equal(after.logs.length,1);
 const config=JSON.parse(after.meta.find(m=>m.key===HALLOWEEN_PACK_KEY).value);assert.equal(config.settings.mode,'ON');assert.equal(config.settings.cardRatesPpm[CODE],0);
 assert(after.meta.some(m=>m.key===OPERATION_KEY));
});
