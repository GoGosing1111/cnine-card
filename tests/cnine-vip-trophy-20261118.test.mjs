import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {readCnineVipHonor,CNINE_VIP_AVATAR_CODES,CNINE_VIP_GOAL} from '../functions/_cnine_vip_trophy.js';
import {readCollectionBonuses} from '../functions/_collection_bonuses.js';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js';
import {emptyTrophyBonuses,validateTrophyBonuses,TROPHY_BONUSES_KEY} from '../shared/trophy-bonuses-v1.mjs';

async function fixture(t,postgres){
 const f=await collectionFixture(t,{postgres});
 const own=(code,id=7,expiry=null)=>f.p('INSERT INTO avatar_user_ownership_v1 VALUES(?,?,?) ON CONFLICT(user_id,avatar_code) DO NOTHING',id,code,expiry).run();
 return {...f,own};
}
for(const postgres of [false,true]){
 const label=postgres?'Postgres':'SQLite';
 test(label+': exact four avatar identities, dealer rename, no duplicate-kind credit, isolation and expiry boundary',async t=>{
  const f=await fixture(t,postgres);assert.equal(CNINE_VIP_GOAL,4);
  const empty={count:0,progress:0,goal:4,acquiredAt:null};assert.deepEqual(await readCnineVipHonor(f.env,7),empty);
  for(const code of CNINE_VIP_AVATAR_CODES.slice(0,3))await f.own(code);
  await f.own('SANTA_JOEUN');await f.own('IYEJUN');await f.own('FAKE_SANTA');await f.own('SANTA_SUDAENG',8);
  assert.equal((await readCnineVipHonor(f.env,7)).progress,3);assert.equal((await readCnineVipHonor(f.env,8)).count,0);
  await f.own('SANTA_SUDAENG',7,'2000-01-01T00:00:00Z');assert.equal((await readCnineVipHonor(f.env,7)).count,0);
  await f.p("UPDATE avatar_user_ownership_v1 SET expires_at=datetime('now') WHERE user_id=7 AND avatar_code='SANTA_SUDAENG'").run();assert.equal((await readCnineVipHonor(f.env,7)).count,0);
  await f.p("UPDATE avatar_user_ownership_v1 SET expires_at='2099-01-01T00:00:00Z' WHERE user_id=7 AND avatar_code='SANTA_SUDAENG'").run();
  const statements=[],prepare=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{statements.push(sql);return prepare(sql);};
  assert.deepEqual(await readCnineVipHonor(f.env,7),{count:1,progress:4,goal:4,acquiredAt:null});assert.equal(statements.length,1);assert.match(statements[0],/^SELECT /);assert(!statements[0].includes('avatar_catalog'));
  assert.deepEqual(await readCnineVipHonor(f.env,7),{count:1,progress:4,goal:4,acquiredAt:null});
  await assert.rejects(readCnineVipHonor(f.env,0),/INVALID_CNINE_VIP_OWNER/);await assert.rejects(readCnineVipHonor(f.env,'7 OR 1=1'),/INVALID_CNINE_VIP_OWNER/);
  // Schema DDL is ignored by the production compatibility adapter; exercise a
  // missing relation using the isolated fixture's native schema connection.
  if(postgres)await f.pg.exec('DROP TABLE avatar_user_ownership_v1');
  else await f.p('DROP TABLE avatar_user_ownership_v1').run();
  await assert.rejects(readCnineVipHonor(f.env,7),/does not exist|no such table/);
 });
 test(label+': zero default skips ownership work; an explicitly configured VIP bonus follows live four-kind ownership',async t=>{
  const f=await fixture(t,postgres),queries=[],prepare=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{queries.push(sql);return prepare(sql);};
  await readCollectionBonuses(f.env,7);assert(!queries.some(sql=>sql.includes('avatar_user_ownership_v1')));
  for(const row of f.trophies.trophies)row.rewardBonuses={dropPercent:0,accountXpPercent:0,coinPercent:0};
  f.trophies.trophies.find(x=>x.code==='CNINE_VIP').rewardBonuses={dropPercent:1,accountXpPercent:2,coinPercent:3};
  await f.write(TROPHY_BONUSES_KEY,{revision:2,audit:[],document:f.trophies});
  for(const code of CNINE_VIP_AVATAR_CODES.slice(0,3))await f.own(code);
  assert(!((await readCollectionBonuses(f.env,7)).trophies.some(x=>x.code==='CNINE_VIP')));
  await f.own('SANTA_SUDAENG');queries.length=0;const awarded=await readCollectionBonuses(f.env,7),vip=awarded.trophies.find(x=>x.code==='CNINE_VIP');
  assert.equal(vip.count,1);assert.equal(vip.progress,4);assert.deepEqual(awarded.trophyBonuses,{dropPercent:1,accountXpPercent:2,coinPercent:3});assert.equal(queries.filter(sql=>sql.includes('avatar_user_ownership_v1')).length,1);
  await f.p("UPDATE avatar_user_ownership_v1 SET expires_at='2000-01-01' WHERE avatar_code='SANTA_SUDAENG'").run();assert.equal((await readCollectionBonuses(f.env,7)).trophies.some(x=>x.code==='CNINE_VIP'),false);
 });
}
test('previous CMS documents retain every saved rate and add only a zero VIP row; current full saves require VIP',()=>{
 const full=emptyTrophyBonuses(),vip=full.trophies.find(x=>x.code==='CNINE_VIP');assert.deepEqual(vip.rewardBonuses,{dropPercent:0,accountXpPercent:0,coinPercent:0});
 const legacy={...full,trophies:full.trophies.filter(x=>x.code!=='CNINE_VIP')};legacy.trophies[0].rewardBonuses.coinPercent=12.34;
 const normalized=validateTrophyBonuses(legacy,{allowLegacy:true});assert.deepEqual(normalized.trophies.filter(x=>x.code!=='CNINE_VIP'),legacy.trophies);assert.deepEqual(normalized.trophies.find(x=>x.code==='CNINE_VIP'),vip);assert.throws(()=>validateTrophyBonuses(legacy));
 const card=TROPHY_CATALOG.find(x=>x.code==='CNINE_VIP');assert.equal(card.name,'씨나인 VIP');assert.match(card.rule,/딜러 남수댕/);assert.match(card.rule,/기존 산타걸 남수댕/);assert.equal(TROPHY_CATALOG.filter(x=>x.code==='CNINE_VIP').length,1);
});
