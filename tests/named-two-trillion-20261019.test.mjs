import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {TARGETS,PLAN,PLAN_HASH,REASON,grant,verify} from '../scripts/ops/named-two-trillion-20261019.mjs';
async function fixture(t){
 const c=new PGlite();t.after(()=>c.close());
 await c.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'운영자','ACTIVE','OWNER',999,5,6),(99999,'비대상','ACTIVE','USER',123,9,8);
 CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,admin_id bigint,created_at text);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text,created_at text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);`);
 for(const u of TARGETS)await c.query("INSERT INTO users VALUES($1,$2,'ACTIVE',$3,12345,67,89)",[u.userId,u.nickname,u.role]);
 const snapshot=async()=>{const r={};for(const table of ['users','coin_logs','admin_logs','app_meta'])r[table]=(await c.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return r;};
 return {c,snapshot,run:options=>grant(c,{expectedPlanHash:PLAN_HASH,commit:true,...options})};
}
test('all 39 exact accounts including Mild7 get 2 trillion each; dry-run and replay preserve state',async t=>{
 const {c,snapshot,run}=await fixture(t),before=await snapshot();await run({commit:false});assert.deepEqual(await snapshot(),before);
 const r=await run();assert.equal(r.verification.totalCoin,'78000000000000');assert.equal(r.verification.coinLogs,39);
 const after=await snapshot(),ids=new Set(TARGETS.map(t=>t.userId));
 for(const u of after.users){const old=before.users.find(o=>o.id===u.id);assert.equal(BigInt(u.coin)-BigInt(old.coin),ids.has(String(u.id))?2000000000000n:0n);assert.deepEqual({...u,coin:old.coin},old);}
 assert.equal(after.coin_logs.filter(r=>r.reason===REASON).length,39);assert.equal((await verify(c)).duplicates,0);
 const noWrites={query:(s,a)=>{assert(!/^\s*(INSERT|UPDATE|DELETE|WITH)\b/i.test(s));return c.query(s,a);}};
 assert.equal((await grant(noWrites,{expectedPlanHash:PLAN_HASH,commit:true})).replayed,true);assert.deepEqual(await snapshot(),after);
});
test('partial credit, coin ledger, audit and receipt failure each roll back every account',async t=>{
 const {c,snapshot,run}=await fixture(t),before=await snapshot();
 for(const table of ['coin_logs','admin_logs','app_meta']){
  const fault={query:(s,a)=>{if(s.includes('INSERT INTO '+table))throw Error('Injected write failure');return c.query(s,a);}};
  await assert.rejects(grant(fault,{expectedPlanHash:PLAN_HASH,commit:true}),/Injected write failure/);assert.deepEqual(await snapshot(),before);
 }
 await c.exec(`CREATE FUNCTION skip_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=${Number(TARGETS[0].userId)} THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION skip_credit();`);
 await assert.rejects(run());assert.deepEqual(await snapshot(),before);
});
test('changed identity, bad plan and unsafe balances cannot grant; lost commit response replays once',async t=>{
 const {c,snapshot,run}=await fixture(t);await assert.rejects(run({expectedPlanHash:'bad'}));
 const target=TARGETS.find(t=>t.nickname==='Mild7');await c.query("UPDATE users SET nickname='다른계정' WHERE id=$1",[target.userId]);let before=await snapshot();await assert.rejects(run());assert.deepEqual(await snapshot(),before);
 await c.query('UPDATE users SET nickname=$2,coin=9007199254740991 WHERE id=$1',[target.userId,target.nickname]);before=await snapshot();await assert.rejects(run());assert.deepEqual(await snapshot(),before);
 await c.query('UPDATE users SET coin=12345 WHERE id=$1',[target.userId]);
 const lost={query:async(s,a)=>{const r=await c.query(s,a);if(s==='COMMIT')throw Error('Lost commit response');return r;}};
 await assert.rejects(grant(lost,{expectedPlanHash:PLAN_HASH,commit:true}),/Lost commit response/);before=await snapshot();assert.equal((await run()).replayed,true);assert.deepEqual(await snapshot(),before);assert.equal(PLAN.recipientCount,39);
});
