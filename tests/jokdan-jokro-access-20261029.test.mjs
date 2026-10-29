import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {ensureMercenaryLevelSchema} from '../functions/_mercenary_level_policy.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots,rankedOwnedMercenaries,selectedMercenaryBattleSnapshots} from '../functions/_mercenary_account.js';
import {handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {JOKRO_CODE,JOKRO_LOAN,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';

test('Jokdan stock-exempt Jokro gift allows only the approved account and preserves prior guards',()=>{
 const now=JOKRO_LOAN.expiresAt+1;
 for(const id of [1,2,3,4582,303,525,4866,1768,4817,5008,5147,5663])assert.equal(jokroAccountAllowed(id,JOKRO_CODE,now),true,`approved ${id}`);
 for(const id of [4,7,4651,4865,4867,4977,5950])assert.equal(jokroAccountAllowed(id,JOKRO_CODE,now),false,`unapproved ${id}`);
 assert.equal(jokroAccountAllowed(7,JOKRO_CODE,now,true),true);
 assert.equal(jokroAccountAllowed(5950,JOKRO_CODE,JOKRO_LOAN.expiresAt-1),true);
 assert.equal(jokroAccountAllowed(5950,JOKRO_CODE,JOKRO_LOAN.expiresAt),false);
});

test('Jokdan existing holding appears in codex, growth, ranked and both battle modes without another grant',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),user={id:4582,role:'USER'},blocked={id:4,role:'USER'};
 await ensureLimitedPackSchema(f.env);await ensureMercenaryLevelSchema(f.env);
 for(const [id,name]of [[4582,'족단'],[4,'other-account']])await f.p('INSERT INTO users(id,nickname,role) VALUES(?,?,?)',id,name,'USER').run();
 for(const [code,limit,issued]of [[JOKRO_CODE,3,3],['SSS_MIRACLE_CUBE:'+JOKRO_CODE,5,0]])await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,?,?)',code,limit,issued).run();
 const stock=(await f.p('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code').all()).results;
 assert.equal((await mercenaryAccountState(f.env,user)).cards.some(c=>c.code===JOKRO_CODE),false);
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:JOKRO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const id of [4582,4])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',id,JOKRO_CODE,'existing-grant','existing-grant').run();
 const owned=(await f.p('SELECT * FROM user_mercenary_cards_v1 ORDER BY user_id,mercenary_code').all()).results;
 const state=await mercenaryAccountState(f.env,user),card=state.cards.find(c=>c.code===JOKRO_CODE);
 assert(card);assert.equal(card.totalCopies,1);assert.equal(card.canDeploy,true);assert.equal(card.exclusiveGrant,true);assert.equal(card.excludedFromLimitedCount,true);
 assert.equal((await mercenaryAccountState(f.env,blocked)).cards.some(c=>c.code===JOKRO_CODE),false);
 for(const candidate of [user,blocked]){
  const growth=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',request:new Request('http://qa.test/api/mercenaries/v3/leveling/state'),env:f.env,deps:{authenticate:async()=>candidate,json:body=>body}});
  assert.equal(growth.cards.some(c=>c.code===JOKRO_CODE),candidate.id===4582);
 }
 for(const mode of ['PVE','PVP']){
  assert.equal((await selectedMercenaryBattleSnapshots(f.env,user,[JOKRO_CODE],mode))[0].code,JOKRO_CODE);
  await assert.rejects(selectedMercenaryBattleSnapshots(f.env,blocked,[JOKRO_CODE],mode),{code:'MERCENARY_NOT_OWNED'});
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:JOKRO_CODE,revision:0});
  assert.equal((await loadMercenaryBattleSnapshot(f.env,user,mode)).code,JOKRO_CODE);
  const batch=await releasedMercenarySnapshots(f.env,[4582,4],mode);assert.equal(batch.get(4582)?.code,JOKRO_CODE);assert.equal(batch.has(4),false);
  await assert.rejects(saveMercenaryLoadout(f.env,blocked,{requestId:crypto.randomUUID(),mode,mercenaryCode:JOKRO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 }
 const ranked=await rankedOwnedMercenaries(f.env,[4582,4]);assert(ranked.get(4582).some(c=>c.code===JOKRO_CODE));assert.equal(ranked.get(4).length,0);
 assert.deepEqual((await f.p('SELECT * FROM user_mercenary_cards_v1 ORDER BY user_id,mercenary_code').all()).results,owned);
 assert.deepEqual((await f.p('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code').all()).results,stock);
 for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])assert.equal(Number((await f.p(`SELECT COUNT(*) n FROM ${table}`).first()).n),0);
});
