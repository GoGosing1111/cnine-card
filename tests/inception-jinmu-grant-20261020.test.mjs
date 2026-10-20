import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots,rankedOwnedMercenaries} from '../functions/_mercenary_account.js';
import {handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {JINMU_CODE,jinmuAccountAllowed} from '../shared/mercenary-jinmu-v1.mjs';

test('Inception exact account is a direct Jinmu recipient; other owners, lowercase account and recalled user stay blocked',()=>{
 assert.equal(jinmuAccountAllowed(2,JINMU_CODE),true);
 assert.equal(jinmuAccountAllowed(1,JINMU_CODE),true);
 for(const id of [7,4779,4977])assert.equal(jinmuAccountAllowed(id,JINMU_CODE),false);
 assert.equal(jinmuAccountAllowed(7,JINMU_CODE,true),true);
});

test('Inception must own Jinmu, then can view, equip PVE/PVP, enter ranked selection and growth without using pack stock',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),user={id:2,role:'OWNER'};
 await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
 for(const [id,name]of [[2,'Inception'],[4779,'inception'],[4977,'recalled']])await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',id,name).run();
 await f.p("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-989',3,0)").run();
 const stock=await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-989'").first();
 assert.equal((await mercenaryAccountState(f.env,user)).cards.length,0);
 await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:JINMU_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const id of [2,4779,4977,7])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',id,JINMU_CODE,'grant','grant').run();
 const state=await mercenaryAccountState(f.env,user);
 assert.equal(state.cards[0].code,JINMU_CODE);assert.equal(state.cards[0].canDeploy,true);
 assert.equal(state.cards[0].exclusiveGrant,true);assert.equal(state.cards[0].excludedFromLimitedCount,true);
 for(const mode of ['PVE','PVP']){
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:JINMU_CODE,revision:0});
  assert.equal((await loadMercenaryBattleSnapshot(f.env,user,mode)).code,JINMU_CODE);
  const batch=await releasedMercenarySnapshots(f.env,[2,4779,4977,7],mode);assert.equal(batch.get(2).code,JINMU_CODE);
  for(const id of [4779,4977,7]){
   assert.equal(batch.has(id),false);
   await assert.rejects(saveMercenaryLoadout(f.env,{id,role:'OWNER'},{requestId:crypto.randomUUID(),mode,mercenaryCode:JINMU_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
  }
 }
 const ranked=await rankedOwnedMercenaries(f.env,[2,4779,4977,7]);assert(ranked.get(2).some(c=>c.code===JINMU_CODE));
 for(const id of [4779,4977,7])assert.equal(ranked.get(id).length,0);
 const leveling=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',request:new Request('http://qa.test/api/mercenaries/v3/leveling/state'),env:f.env,deps:{authenticate:async()=>user,json:body=>body}});
 assert(leveling.cards.some(c=>c.code===JINMU_CODE));
 assert.deepEqual(await f.p("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-989'").first(),stock);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_limited_issues_v1').first()).n),0);
});
