import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots,rankedOwnedMercenaries} from '../functions/_mercenary_account.js';
import {handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {JINMU_CODE,jinmuAccountAllowed} from '../shared/mercenary-jinmu-v1.mjs';
import {JOKRO_CODE,JOKRO_LOAN,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';

const cases=[
 {code:JINMU_CODE,allowed:[4651,4817],blocked:[303,7,4977,5950],limit:4},
 {code:JOKRO_CODE,allowed:[303,4817],blocked:[4651,7,4977,5950],limit:2}
];

test('approved direct gifts permit only their exact account and mercenary pairs',()=>{
 for(const id of [1,2,5663,4651,4817])assert.equal(jinmuAccountAllowed(id,JINMU_CODE),true);
 for(const id of [303,7,4977,5950])assert.equal(jinmuAccountAllowed(id,JINMU_CODE),false);
 for(const id of [1,303,4817])assert.equal(jokroAccountAllowed(id,JOKRO_CODE,JOKRO_LOAN.expiresAt+1),true);
 for(const id of [4651,7,4977,5950])assert.equal(jokroAccountAllowed(id,JOKRO_CODE,JOKRO_LOAN.expiresAt+1),false);
 assert.equal(jinmuAccountAllowed(7,JINMU_CODE,true),true);
 assert.equal(jokroAccountAllowed(7,JOKRO_CODE,JOKRO_LOAN.expiresAt+1,true),true);
});

for(const {code,allowed,blocked,limit} of cases)test(`${code} gifts require ownership and work in collection, PVE, PVP, ranked and growth without numbered stock`,async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),ids=[...allowed,...blocked];
 await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
 for(const id of ids.filter(id=>id!==7))await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',id,'exact-account-'+id).run();
 await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,?,?)',code,limit,limit).run();
 const stock=await f.p('SELECT * FROM mercenary_limited_stock_v1 WHERE code=?',code).first();
 for(const id of allowed){
  const user={id,role:'OWNER'};
  assert.equal((await mercenaryAccountState(f.env,user)).cards.length,0);
  await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:code,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 }
 for(const id of ids)await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',id,code,'direct-gift','direct-gift').run();
 for(const id of allowed){
  const user={id,role:'OWNER'},card=(await mercenaryAccountState(f.env,user)).cards.find(c=>c.code===code);
  assert(card);assert.equal(card.canDeploy,true);assert.equal(card.exclusiveGrant,true);assert.equal(card.excludedFromLimitedCount,true);
  for(const mode of ['PVE','PVP']){
   await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision:0});
   assert.equal((await loadMercenaryBattleSnapshot(f.env,user,mode)).code,code);
  }
  const leveling=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',request:new Request('http://qa.test/api/mercenaries/v3/leveling/state'),env:f.env,deps:{authenticate:async()=>user,json:body=>body}});
  assert(leveling.cards.some(c=>c.code===code));
 }
 for(const mode of ['PVE','PVP']){
  const batch=await releasedMercenarySnapshots(f.env,ids,mode);
  for(const id of allowed)assert.equal(batch.get(id)?.code,code);
  for(const id of blocked){
   assert.equal(batch.has(id),false);
   await assert.rejects(saveMercenaryLoadout(f.env,{id,role:'OWNER'},{requestId:crypto.randomUUID(),mode,mercenaryCode:code,revision:0}),{code:'MERCENARY_NOT_OWNED'});
  }
 }
 const ranked=await rankedOwnedMercenaries(f.env,ids);
 for(const id of allowed)assert(ranked.get(id).some(c=>c.code===code));
 for(const id of blocked)assert.equal(ranked.get(id).length,0);
 assert.deepEqual(await f.p('SELECT * FROM mercenary_limited_stock_v1 WHERE code=?',code).first(),stock);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM mercenary_limited_issues_v1').first()).n),0);
});
