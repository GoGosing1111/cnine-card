import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {readBlueEmpireHonors,readLoyalServicePostHonors,readCodexSssLimitedCodes,readLimitedEditionHonors,readNewTrophyMilestones} from '../functions/_trophy_milestones.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';

async function fixture(t){
 const f=await limitedFixture(t);
 await f.pg.exec(`SET TIME ZONE 'UTC'; CREATE FUNCTION sqlite_datetime(text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',$1::timestamptz),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE pvp_season_settlements(id int,season_key text,status text,completed_at text);
 CREATE TABLE pvp_season_settlement_ranks(settlement_id int,user_id bigint,tier_id text,final_rank int);
 CREATE TABLE quest_weekly_claims_v1(user_id bigint,week_key text,quest_id text,status text,message_id bigint,reward_type text,reward_amount bigint);
 CREATE TABLE user_messages(id bigint,user_id bigint,campaign_key text,hidden_at text);
 CREATE TABLE user_message_rewards(id bigint,message_id bigint,user_id bigint,reward_type text,reward_amount bigint,claimed_at text);
 CREATE TABLE user_message_reward_claim_receipts_v1222(reward_id bigint,message_id bigint,user_id bigint,reward_type text,reward_amount bigint,credited_at text);`);
 const own=async(code,copies=1,id=1)=>f.pg.query("INSERT INTO user_mercenary_cards_v1 VALUES($1,$2,$3,$4,'2026-10-01','2026-10-01') ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=excluded.total_copies,duplicate_count=excluded.duplicate_count",[id,code,copies,copies-1]);
 const readonly=async(fn)=>{f.stats.sql.length=0;const result=await fn();assert.ok(f.stats.sql.every(s=>/^\s*(SELECT|WITH)\b/i.test(s)),f.stats.sql.join('\n'));return result;};
 return {...f,own,readonly};
}
test('blue empire counts distinct completed official challenger seasons and dates the twentieth, never current ranks or duplicate rows',async t=>{
 const f=await fixture(t);
 for(let i=1;i<=19;i++){
  await f.pg.query("INSERT INTO pvp_season_settlements VALUES($1,$2,'COMPLETED',$3)",[i,'season-'+i,'2026-01-'+String(i).padStart(2,'0')]);
  await f.pg.query("INSERT INTO pvp_season_settlement_ranks VALUES($1,1,'challenger',20)",[i]);
 }
 await f.pg.exec("INSERT INTO pvp_season_settlement_ranks VALUES(1,1,'challenger',1); INSERT INTO pvp_season_settlements VALUES(101,'season-1','COMPLETED','2026-01-01'); INSERT INTO pvp_season_settlement_ranks VALUES(101,1,'challenger',1)");
 for(const [id,status,tier,rank,at] of [[20,'PROCESSING','challenger',1,'2026-01-20'],[21,'COMPLETED','master',1,'2026-01-21'],[22,'COMPLETED','challenger',21,'2026-01-22'],[23,'COMPLETED','challenger',1,null]]){
  await f.pg.query('INSERT INTO pvp_season_settlements VALUES($1,$2,$3,$4)',[id,'season-'+id,status,at]);
  await f.pg.query('INSERT INTO pvp_season_settlement_ranks VALUES($1,1,$2,$3)',[id,tier,rank]);
 }
 assert.deepEqual(await f.readonly(()=>readBlueEmpireHonors(f.env,1)),{count:0,progress:19,goal:20,acquiredAt:null});
 await f.pg.exec("UPDATE pvp_season_settlements SET status='COMPLETED' WHERE id=20");
 assert.deepEqual(await f.readonly(()=>readBlueEmpireHonors(f.env,1)),{count:1,progress:20,goal:20,acquiredAt:'2026-01-20 00:00:00'});
 assert.equal((await readBlueEmpireHonors(f.env,2)).progress,0);
});

test('loyal service requires twenty distinct POST weeks with matching actual credited reward receipts, including archived messages',async t=>{
 const f=await fixture(t);await f.setting('quest_hub_foundation_20260924_v1',1);
 for(let i=1;i<=24;i++){
  const week='week-'+i,at='2026-01-'+String(i).padStart(2,'0'),quest=i===21?'CORE_RAID':'POST';
  await f.pg.query("INSERT INTO quest_weekly_claims_v1 VALUES(1,$1,$2,'COMPLETED',$3,'COIN',100)",[week,quest,i]);
  await f.pg.query("INSERT INTO user_messages VALUES($1,1,$2,'2026-02-01')",[i,'weekly-quest:'+week+':'+quest]);
  await f.pg.query("INSERT INTO user_message_rewards VALUES($1,$1,1,'COIN',100,$2)",[i,i===20?null:at]);
  if(i!==22)await f.pg.query("INSERT INTO user_message_reward_claim_receipts_v1222 VALUES($1,$1,$2,'COIN',$3,$4)",[i,i===23?2:1,i===24?200:100,at]);
 }
 await f.pg.exec("INSERT INTO quest_weekly_claims_v1 SELECT * FROM quest_weekly_claims_v1 WHERE message_id=1; INSERT INTO user_message_reward_claim_receipts_v1222 SELECT * FROM user_message_reward_claim_receipts_v1222 WHERE reward_id=1");
 assert.deepEqual(await f.readonly(()=>readLoyalServicePostHonors(f.env,1)),{count:0,progress:19,goal:20,acquiredAt:null});
 await f.pg.exec("UPDATE user_message_rewards SET claimed_at='2026-01-20' WHERE id=20");
 assert.deepEqual(await f.readonly(()=>readLoyalServicePostHonors(f.env,1)),{count:1,progress:20,goal:20,acquiredAt:'2026-01-20 00:00:00'});
 assert.equal((await readLoyalServicePostHonors(f.env,2)).progress,0);
 await f.pg.exec('DROP TABLE user_message_reward_claim_receipts_v1222');
 await assert.rejects(readLoyalServicePostHonors(f.env,1),/does not exist/,'installed but unavailable proof must fail closed');
});

test('limited edition uses all eleven public codex SSS LIMITED kinds including Eunseol and locked cards, independent of acquisition state',async t=>{
 const f=await fixture(t),codes=readCodexSssLimitedCodes();
 const codex=mercenaryCodexDocument(await f.p("SELECT payload_json,revision FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first());
 assert.deepEqual(codes,[...new Set(codex.cards.filter(c=>c.rank==='SSS'&&c.edition==='LIMITED').map(c=>c.code))].sort());
 assert.deepEqual(codes,['V-973','V-974','V-975','V-976','V-978','V-979','V-987','V-988','V-989','V-996','V-999']);
 const unrestricted=codes.filter(c=>!['V-979','V-989'].includes(c));
 for(const code of unrestricted.slice(0,8))await f.own(code);
 await f.own(unrestricted[0],20);await f.own('V-990',20);await f.own('V-001',20);
 await f.own(unrestricted[8],1,2);
 assert.deepEqual(await f.readonly(()=>readLimitedEditionHonors(f.env,1)),{count:0,acquiredAt:null,progress:8,goal:9,total:11});
 await f.own(unrestricted[8]);
 assert.deepEqual(await f.readonly(()=>readLimitedEditionHonors(f.env,1)),{count:1,acquiredAt:null,progress:9,goal:9,total:11});
 assert.equal(f.stats.sql.length,1,'unrestricted ownership needs no pack, stock, craft, cube or CMS queries');
 await f.pg.exec('DROP TABLE mercenary_limited_stock_v1; DROP TABLE mercenary_cms_documents_v1; DROP TABLE app_meta');
 assert.equal((await f.readonly(()=>readLimitedEditionHonors(f.env,1))).count,1,'closed or unavailable acquisition data cannot change the codex denominator');
 codes.pop();assert.equal(readCodexSssLimitedCodes().length,11,'callers cannot mutate the shared catalog');
 await f.pg.query('DELETE FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=$1',[unrestricted[8]]);
 assert.deepEqual(await readLimitedEditionHonors(f.env,1),{count:0,acquiredAt:null,progress:8,goal:9,total:11});
});

test('limited edition preserves account collection entitlements for Jinmu and Jokro, requiring proof for other holders',async t=>{
 const f=await fixture(t);
 for(const code of ['V-979','V-989']){await f.own(code,1,1);await f.own(code,1,3);}
 assert.equal((await f.readonly(()=>readLimitedEditionHonors(f.env,1))).progress,2,'approved direct owner counts actual positive holdings');
 assert.equal((await f.readonly(()=>readLimitedEditionHonors(f.env,3))).progress,0,'stray and recalled holdings are not ownership');
 for(const [code,limit] of [['V-979',3],['V-989',5]]){
  const request='proof-'+code,acquisition='acquisition-'+code;
  await f.pg.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,$2,1)',[code,limit]);
  await f.pg.query("INSERT INTO joint_operations_v1 VALUES($1,3,'MERCENARY_HALLOWEEN_OPEN','hash','{}','COMPLETED','2026-10-01','2026-10-01')",[request]);
  await f.pg.query("INSERT INTO mercenary_card_acquisitions_v1 VALUES($1,3,$2,0,1,0,'2026-10-01')",[acquisition,code]);
  await f.pg.query("INSERT INTO mercenary_limited_issues_v1 VALUES($1,$2,3,$3,1,'2026-10-01')",[acquisition,request,code]);
 }
 assert.equal((await f.readonly(()=>readLimitedEditionHonors(f.env,3))).progress,2,'real completed issuance matches account collection ownership');
 await f.pg.exec("UPDATE joint_operations_v1 SET status='PENDING' WHERE request_id='proof-V-979'");
 assert.equal((await readLimitedEditionHonors(f.env,3)).progress,1);
 await f.pg.exec("DELETE FROM user_mercenary_cards_v1 WHERE user_id=3 AND mercenary_code='V-989'");
 assert.equal((await readLimitedEditionHonors(f.env,3)).progress,0,'proof without current holding is insufficient');
});

test('shared milestone reader remains read only when new sources have no records; limited holdings failures are not invented as zero',async t=>{
 const f=await fixture(t),result=await f.readonly(()=>readNewTrophyMilestones(f.env,1));
 assert.deepEqual(result,{blueEmpire:{count:0,progress:0,goal:20,acquiredAt:null},limitedEdition:{count:0,acquiredAt:null,progress:0,goal:9,total:11},loyalServicePost:{count:0,progress:0,goal:20,acquiredAt:null}});
 await f.pg.exec('DROP TABLE user_mercenary_cards_v1');await assert.rejects(readLimitedEditionHonors(f.env,1),/does not exist/);
});


test('reward callers can skip all zero-rate milestones or read only the configured new benefit',async t=>{
 const f=await fixture(t);
 await f.pg.exec('DROP TABLE user_mercenary_cards_v1; DROP TABLE quest_weekly_claims_v1');
 f.stats.sql.length=0;await readNewTrophyMilestones(f.env,1,{codes:[]});assert.equal(f.stats.sql.length,0);
 const result=await f.readonly(()=>readNewTrophyMilestones(f.env,1,{codes:['BLUE_EMPIRE_20']}));
 assert.equal(result.blueEmpire.progress,0);assert.equal(f.stats.sql.length,1);
 assert.doesNotMatch(f.stats.sql.join(' '),/mercenary|quest_weekly|user_message/);
});
