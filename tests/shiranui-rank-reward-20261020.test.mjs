import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {accountRankAward,ensureAccountRank,ensureShiranuiRankReward,readAccountRank,SHIRANUI_MIN_RANK_TICKS} from '../functions/_account_rank.js';
import {SHIRANUI_RANK_CAMPAIGN,shiranuiRankRewardKey} from '../functions/_account_rank_shiranui.js';
import {claimShiranuiMercenaryMessageReward} from '../functions/_mercenary_message_reward.js';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots,rankedOwnedMercenaries,rankedSelectedMercenaries} from '../functions/_mercenary_account.js';
import {rankedOwnershipGuard,saveRankedRoster,readRankedRosters} from '../functions/_ranked_series.js';
import {readShiranuiEligibleUsers} from '../functions/_mercenary_shiranui_access.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {SHIRANUI_CODE,SHIRANUI_ART,SHIRANUI_MIN_ACCOUNT_LEVEL} from '../shared/mercenary-shiranui-v1.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
const rid=()=>crypto.randomUUID(),read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=(f,sql)=>f.pg?f.pg.exec(sql):f.DB.sql.exec(sql);
async function fixture(t,postgres){
 const f=await mercenaryFixture(t,{postgres});await ensureAccountRank(f.env);
 await schema(f,'CREATE TABLE character_titles(id BIGINT PRIMARY KEY,code TEXT UNIQUE,is_active INTEGER);CREATE TABLE user_character_titles(user_id BIGINT,title_id BIGINT,expires_at TEXT,PRIMARY KEY(user_id,title_id))');
 const receiptSchema='CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id BIGINT PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT,claim_token TEXT UNIQUE,balance_before BIGINT,balance_after BIGINT,source TEXT,credited_at TEXT)';
 if(f.pg)await f.pg.exec(receiptSchema);else f.DB.sql.exec(receiptSchema);
 const rank=async ticks=>f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(7,?) ON CONFLICT(user_id) DO UPDATE SET total_ticks=excluded.total_ticks',ticks).run();
 const rewards=async()=>(await f.p('SELECT * FROM user_message_rewards WHERE user_id=7').all()).results;
 const copies=async()=>Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',SHIRANUI_CODE).first())?.total_copies||0);
 return {...f,rank,rewards,copies,award:async event=>f.DB.batch(await accountRankAward(f.env,7,'HUNT',event)),claim:r=>claimShiranuiMercenaryMessageReward(f.env,f.user,r,r.message_id)};
}
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: crossing 234 → 235 delivers once; retry, concurrent claims and deleted inbox cannot duplicate`,async t=>{
  const f=await fixture(t,postgres);await f.rank(SHIRANUI_MIN_RANK_TICKS-4801);await f.award('below');assert.equal((await readAccountRank(f.env,7)).level,234);assert.equal((await f.rewards()).length,0);
  await Promise.all([f.award('cross'),f.award('cross')]);assert.equal((await readAccountRank(f.env,7)).level,235);const [reward]=await f.rewards();assert(reward);assert.equal((await f.rewards()).length,1);assert.equal(await f.copies(),0);
  assert.equal(reward.reward_type,'MERCENARY_SHIRANUI');assert.equal(Number(reward.reward_amount),1);
  await assert.rejects(()=>claimShiranuiMercenaryMessageReward(f.env,{id:8},reward,reward.message_id),/보상/);
  const results=await Promise.all([f.claim(reward),f.claim(reward)]);assert.equal(results.filter(r=>r.credited).length,1);assert.equal(await f.copies(),1);
  await f.award('later');await ensureShiranuiRankReward(f.env,7);assert.equal((await f.rewards()).length,1);
  await f.p('DELETE FROM user_messages WHERE user_id=7').run();await f.award('hidden');await ensureShiranuiRankReward(f.env,7);assert.equal((await f.p('SELECT * FROM user_messages').all()).results.length,0);assert.equal(await f.copies(),1);
 });
 test(`${label}: failed delivery rolls XP and message back; failed claim rolls card, receipt and inbox back`,async t=>{
  const f=await fixture(t,postgres);await f.rank(SHIRANUI_MIN_RANK_TICKS-1);
  for(const point of ['INSERT INTO user_messages','INSERT INTO user_message_rewards']){f.fail(point);await assert.rejects(()=>f.award('cross'),/INJECTED/);f.fail('');assert.equal((await readAccountRank(f.env,7)).level,234);assert.equal((await f.rewards()).length,0);assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',shiranuiRankRewardKey(7)).first(),null);}
  await f.award('cross');const [r]=await f.rewards();
  for(const point of ['INSERT INTO user_mercenary_cards_v1','INSERT INTO mercenary_card_acquisitions_v1','UPDATE user_messages']){f.fail(point);await assert.rejects(()=>f.claim(r),/INJECTED/);f.fail('');assert.equal(await f.copies(),0);assert.equal((await f.p('SELECT * FROM user_message_reward_claim_receipts_v1222').all()).results.length,0);assert.equal((await f.rewards())[0].claimed_at,null);}
  assert.equal((await f.claim(r)).credited,true);assert.equal(await f.copies(),1);
 });
 test(`${label}: catch-up, existing owners, forged message and failed XP guard are isolated`,async t=>{
  const f=await fixture(t,postgres);await f.rank(SHIRANUI_MIN_RANK_TICKS);await f.DB.batch(await accountRankAward(f.env,7,'HUNT','invalid',{guard:'1=0'}));assert.equal((await f.rewards()).length,0);
  await Promise.all([ensureShiranuiRankReward(f.env,7),ensureShiranuiRankReward(f.env,7)]);assert.equal((await f.rewards()).length,1);
  const [r]=await f.rewards();await f.p("UPDATE user_messages SET campaign_key='forged' WHERE id=?",r.message_id).run();await assert.rejects(()=>f.claim(r),/지급 기록/);assert.equal(await f.copies(),0);
  await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(8,?,1,0,?,?)',SHIRANUI_CODE,'old','old').run();await f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(8,?)',SHIRANUI_MIN_RANK_TICKS).run();await ensureShiranuiRankReward(f.env,8);
  assert.equal((await f.p('SELECT value FROM app_meta WHERE key=?',shiranuiRankRewardKey(8)).first()).value,'PREVIOUSLY_OWNED');assert.equal((await f.p('SELECT * FROM user_message_rewards WHERE user_id=8').all()).results.length,0);
 });
 test(`${label}: owner roles cannot bypass rank; PVE/PVP, legacy slots and ranked selections recheck current rank`,async t=>{
  const f=await fixture(t,postgres);await f.rank(SHIRANUI_MIN_RANK_TICKS);await ensureShiranuiRankReward(f.env,7);await f.claim((await f.rewards())[0]);
  for(const mode of ['PVE','PVP'])await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode,mercenaryCodes:[SHIRANUI_CODE],revision:0});
  assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user)).code,SHIRANUI_CODE);assert.equal((await rankedOwnedMercenaries(f.env,[7])).get(7)[0].code,SHIRANUI_CODE);
  await f.rank(SHIRANUI_MIN_RANK_TICKS-1);
  for(const mode of ['PVE','PVP']){await assert.rejects(()=>saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode,mercenaryCodes:[SHIRANUI_CODE],revision:1}),{code:'MERCENARY_ACCOUNT_RANK'});assert.equal(await loadMercenaryBattleSnapshot(f.env,f.user,mode),null);assert.equal((await releasedMercenarySnapshots(f.env,[7],mode)).size,0);}
  const state=await mercenaryAccountState(f.env,f.user);assert.equal(state.cards[0].canDeploy,false);assert.match(state.cards[0].deploymentBlockedReason,/중장/);assert.equal(await f.copies(),1);
  assert.equal((await rankedOwnedMercenaries(f.env,[7])).get(7).length,0);await assert.rejects(()=>rankedSelectedMercenaries(f.env,new Map([[7,[SHIRANUI_CODE,SHIRANUI_CODE,SHIRANUI_CODE]]])),{code:'PVP_SERIES_ROSTER'});
  for(const code of ['V-001','V-002','V-003','V-004','V-005'])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(7,?,1,0,?,?)',code,'now','now').run();
  await assert.rejects(()=>f.DB.batch(rankedOwnershipGuard(f.env,new Map([[7,[SHIRANUI_CODE,'V-001','V-002','V-003','V-004','V-005']]]))));
  await f.rank(SHIRANUI_MIN_RANK_TICKS);await f.DB.batch(rankedOwnershipGuard(f.env,new Map([[7,[SHIRANUI_CODE,'V-001','V-002','V-003','V-004','V-005']]])));
  assert.equal((await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===SHIRANUI_CODE).canDeploy,true);
 });
 test(`${label}: a Bus Driver holding Shiranui can save both modes and ranked at level one without equipping the title`,async t=>{
  const f=await fixture(t,postgres),id=f.user.id;
  await f.p("INSERT INTO character_titles VALUES(14,'RAID_BUS_DRIVER',1),(18,'ANOTHER_DRIVER',1)").run();
  await f.p("INSERT INTO user_character_titles VALUES(7,14,NULL),(8,18,NULL)").run();
  const eligible=async()=>[...await readShiranuiEligibleUsers(f.env,[7,8])].sort();
  assert.deepEqual(await eligible(),[7]);assert.equal((await readAccountRank(f.env,id)).level,1);
  const codes=[SHIRANUI_CODE,'V-001','V-002','V-003','V-004','V-005'];
  const save=(mode,revision)=>saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mode,mercenaryCodes:[SHIRANUI_CODE],revision});
  await assert.rejects(()=>save('PVE',0),{code:'MERCENARY_NOT_OWNED'});
  for(const code of codes)await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(7,?,1,0,?,?)',code,'QA','QA').run();
  for(const mode of ['PVE','PVP']){
   assert.deepEqual((await save(mode,0)).mercenaryCodes,[SHIRANUI_CODE]);
   assert.equal((await loadMercenaryBattleSnapshot(f.env,f.user,mode)).code,SHIRANUI_CODE);
  }
  await schema(f,'CREATE TABLE pvp_ranked_match_tickets_v1671(attacker_id BIGINT,used_at TEXT,expires_at TEXT)');
  assert.equal((await saveRankedRoster(f.env,f.user,{codes,revision:0})).ready,true);
  const roster=async()=>(await readRankedRosters(f.env,[id])).get(id);
  assert.equal((await roster()).ready,true);
  const canDeploy=async()=>(await mercenaryAccountState(f.env,f.user)).cards.find(c=>c.code===SHIRANUI_CODE)?.canDeploy;
  assert.equal(await canDeploy(),true);
  await f.p('UPDATE user_character_titles SET expires_at=? WHERE user_id=7',new Date(Date.now()-1000).toISOString()).run();
  assert.deepEqual(await eligible(),[]);assert.equal(await canDeploy(),false);assert.equal((await roster()).ready,false);
  assert.equal(await loadMercenaryBattleSnapshot(f.env,f.user,'PVP'),null);
  await assert.rejects(()=>save('PVE',1),{code:'MERCENARY_ACCOUNT_RANK'});
  await assert.rejects(()=>f.DB.batch(rankedOwnershipGuard(f.env,new Map([[id,codes]]))));
  await f.p('UPDATE user_character_titles SET expires_at=? WHERE user_id=7',new Date(Date.now()+3600000).toISOString()).run();
  assert.equal(await canDeploy(),true);
  await f.p('UPDATE character_titles SET is_active=0 WHERE id=14').run();assert.deepEqual(await eligible(),[]);
  await f.p('UPDATE character_titles SET is_active=1 WHERE id=14').run();
  await f.p('DELETE FROM user_character_titles WHERE user_id=7').run();assert.deepEqual(await eligible(),[]);
  await ensureShiranuiRankReward(f.env,id);assert.equal((await f.rewards()).length,0);assert.equal(await f.copies(),1);
  await f.rank(SHIRANUI_MIN_RANK_TICKS);assert.deepEqual(await eligible(),[7]);assert.equal((await roster()).ready,true);
 });
}
test('ranked duo rejects cached Shiranui after a rank decrease',async t=>{
 const f=await duoFixture(t,{postgres:true});await f.ready();await ensureAccountRank(f.env);
 await f.pg.exec('ALTER TABLE character_titles ADD COLUMN code TEXT UNIQUE');
 await f.p("INSERT INTO user_mercenary_cards_v1 VALUES(2,'V-987',1)").run();await f.p("INSERT INTO user_mercenary_loadout_v1 VALUES(2,'V-987')").run();
 await f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(2,?)',SHIRANUI_MIN_RANK_TICKS).run();
 await f.p('DELETE FROM ranked_duo_profiles_v1 WHERE user_id=2').run();
 const [ready]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});assert.equal(ready.attack.mercenary.code,SHIRANUI_CODE);
 await f.p('UPDATE account_rank_progress_v1 SET total_ticks=? WHERE user_id=2',SHIRANUI_MIN_RANK_TICKS-1).run();
 const [blocked]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});assert.equal(blocked.attack.mercenary,null);assert.equal(blocked.defense.mercenary,null);assert(!blocked.breakdown.mercenaryRanks.some(m=>m.code===SHIRANUI_CODE));
 await f.p("INSERT INTO character_titles(id,code,pve_power,is_active) VALUES(282,'RAID_BUS_DRIVER',0,1)").run();
 await f.p('INSERT INTO user_character_titles VALUES(2,282,NULL)').run();
 const [holder]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 assert.equal(holder.attack.mercenary.code,SHIRANUI_CODE);assert.equal(holder.defense.mercenary.code,SHIRANUI_CODE);
 await f.p('DELETE FROM user_character_titles WHERE user_id=2 AND title_id=282').run();
 const [revoked]=await loadDuoProfiles(f.env,[2],f.config,f.deps,{now:f.clock()});
 assert.equal(revoked.attack.mercenary,null);assert.equal(revoked.defense.mercenary,null);
});
test('public catalog exposes approved Shiranui art and rank requirement without adding random acquisition',()=>{
 assert.equal(SHIRANUI_MIN_ACCOUNT_LEVEL,235);
 const card=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})).cards.find(c=>c.code===SHIRANUI_CODE);
 assert(card);assert.equal(card.exclusiveGrant,false);assert.equal(card.sourceArt,SHIRANUI_ART.sourceArt);assert.equal(card.acquisition,'ACCOUNT_RANK_REWARD');assert.equal(card.minimumAccountLevel,235);assert.equal(card.packAcquisitionEnabled,false);assert.equal(card.skills[0].ready,true);
 assert.equal(card.basePower,2600000);
 assert.match(card.deploymentRequirement,/중장\(Lv\.235\) 이상 또는 버스기사 칭호 보유/);
 assert.deepEqual(card.skills[0].balance,{damageRatio:25.2,cooldownTurns:4,cost:25});
 assert.match(card.skills[0].effect,/2,520%/);
 assert.equal(card.skills[0].trigger,'PVE · 에너지 25 · 재사용 4행동');
 assert(!MERCENARY_CMS_SEED.catalog.cards.some(c=>c.code===SHIRANUI_CODE));assert(read('mercenary-codex/app.mjs').includes('c.acquisitionDescription'));assert(read('js/app.js').includes("MERCENARY_SHIRANUI:{label:'시라누이 SSS 리미티드'"));
});
