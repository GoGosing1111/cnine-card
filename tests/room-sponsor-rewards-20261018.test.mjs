import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PLAN,PLAN_HASH,OPERATION_KEY,PACK_KEY,TARGETS,IDS,grantSponsorRewards,verifySponsorRewards} from '../scripts/ops/room-sponsor-rewards-20261018.mjs';
import {readFileSync} from 'node:fs';
const identities=JSON.parse(readFileSync(new URL('./helpers/room-sponsor-reward-identities-20261018.json',import.meta.url)));
const opts=()=>({approvedPlanHash:PLAN_HASH,lockDeadline:Date.now()+120000,dryRun:false});
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id bigint PRIMARY KEY,nickname text,role text,status text,coin bigint,card_shards bigint,magic_crystals bigint);
 INSERT INTO users VALUES(1,'OWNER','OWNER','ACTIVE',777,888,999),(999999,'unrelated','USER','ACTIVE',11,22,33);
 CREATE TABLE user_second_verifications(user_id bigint,provider text,provider_user_id text);
 CREATE TABLE inventory_items(code text PRIMARY KEY,name text,is_active int);INSERT INTO inventory_items VALUES('SUIT_CORE_6','슈트 코어 6',1),('MASTER_STAR','마스터의 별',1);
 CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
 CREATE TABLE coin_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,admin_id bigint,created_at text);
 CREATE TABLE inventory_logs(id bigserial PRIMARY KEY,user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text,admin_id bigint,created_at text);
 CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
 CREATE TABLE mercenary_limited_stock_v1(code text PRIMARY KEY,stock_limit bigint,issued bigint,revision bigint,last_token text,CHECK(stock_limit>=issued));
 INSERT INTO mercenary_limited_stock_v1 VALUES('V-996',12,11,21,'old'),('V-999',7,6,11,'old'),('V-990',6,4,9,'other');
 CREATE TABLE mercenary_limited_issues_v1(acquisition_id text PRIMARY KEY,request_id text,user_id bigint,code text,serial bigint,created_at text,UNIQUE(code,serial));
 INSERT INTO mercenary_limited_issues_v1 SELECT 'v-'||n,'old',999999,'V-996',n,'old' FROM generate_series(1,11)n;
 INSERT INTO mercenary_limited_issues_v1 SELECT 'h-'||n,'old',999999,'V-999',n,'old' FROM generate_series(1,6)n;
 CREATE TABLE user_mercenary_cards_v1(user_id bigint,mercenary_code text,total_copies int CHECK(total_copies>=1),duplicate_count int CHECK(duplicate_count=total_copies-1),first_obtained_at text,last_obtained_at text,PRIMARY KEY(user_id,mercenary_code));
 INSERT INTO user_mercenary_cards_v1 VALUES(4774,'V-996',1,0,'first','first'),(4965,'V-996',1,0,'first','first'),(4774,'V-021',3,2,'first','first');
 CREATE TABLE mercenary_card_acquisitions_v1(acquisition_id text PRIMARY KEY,user_id bigint,mercenary_code text,is_duplicate int,total_copies_after int,duplicate_count_after int,created_at text);
 CREATE TABLE user_mercenary_loadout_v1(user_id bigint PRIMARY KEY,mercenary_code text,revision int,updated_at text);
 INSERT INTO user_mercenary_loadout_v1 VALUES(4774,'V-996',27,'old'),(4965,'V-996',6,'old');
 CREATE TABLE user_mercenary_growth_v1(user_id bigint,mercenary_code text,level int);INSERT INTO user_mercenary_growth_v1 VALUES(4774,'V-996',5),(4965,'V-996',7);
 CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);`);
 for(const t of TARGETS){await db.query("INSERT INTO users VALUES($1,$2,'USER','ACTIVE',12345,91,82)",[t.userId,t.nickname]);const v=identities.find(i=>i.id===t.userId);await db.query('INSERT INTO user_second_verifications VALUES($1,$2,$3)',[v.id,v.provider,v.provider_user_id]);await db.query("INSERT INTO cnine_user_inventory VALUES($1,'MASTER_STAR',123,11,'old','old')",[t.userId]);if(t.order%2===0)await db.query("INSERT INTO cnine_user_inventory VALUES($1,'SUIT_CORE_6',9,2,'old','old')",[t.userId]);}
 const pack={revision:17,settings:{mode:'ON',stockLimits:{'V-996':12,'V-999':7,'V-990':6},prices:{single:888},rates:{test:19}},updatedAt:'old',updatedBy:1,lastRequestId:'old'};
 for(const [key,value]of [[PACK_KEY,pack],['mercenary_pvp_loadout_v1:4774',{mercenaryCode:'V-996',revision:31}],[PLAN.revoke.sourceGrantKey,{status:'COMPLETED',operationKey:PLAN.revoke.sourceGrantKey,grants:[{userId:4774,code:'V-996',copiesAfter:1}]}],['mercenary_limited_draw_policy_v1',{rates:'unchanged'}],['mercenary_halloween_pack_v1',{mode:'ON',revision:13}]])await db.query("INSERT INTO app_meta VALUES($1,$2,'old')",[key,JSON.stringify(value)]);
 const snapshot=async()=>{const s={};for(const table of ['users','user_second_verifications','cnine_user_inventory','coin_logs','inventory_logs','app_meta','mercenary_limited_stock_v1','mercenary_limited_issues_v1','user_mercenary_cards_v1','mercenary_card_acquisitions_v1','user_mercenary_loadout_v1','user_mercenary_growth_v1','admin_logs'])s[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return s;};
 return {db,snapshot,pack};
}
test('38 recipients / 70 units, stock-neutral four card grants and one recall are atomic and idempotent',async t=>{
 const {db,snapshot,pack}=await fixture(t),before=await snapshot();
 const dry=await grantSponsorRewards(db,{...opts(),dryRun:true});assert.equal(dry.verification.totalCoin,'140000000000000');assert.equal(dry.verification.totalCores,700);assert.deepEqual(await snapshot(),before);
 const result=await grantSponsorRewards(db,opts()),after=await snapshot();assert.equal(result.receipt.recipients.filter(r=>r.units===2).length,32);assert.equal(result.receipt.recipients.filter(r=>r.units===1).length,6);
 assert.deepEqual(result.receipt.grants.map(r=>[r.userId,r.code,r.copiesBefore,r.copiesAfter,r.serial]),[['4965','V-996',1,2,12],['4817','V-996',0,1,13],['4933','V-996',0,1,14],['4774','V-999',0,1,7]]);
 assert.deepEqual(result.receipt.stockAfter,[{code:'V-996',limit:15,issued:14,remaining:1},{code:'V-999',limit:8,issued:7,remaining:1}]);assert.deepEqual(result.receipt.revocation.clearedModes,['PVE','PVP']);
 assert.deepEqual(after.user_mercenary_growth_v1,before.user_mercenary_growth_v1);assert.deepEqual(after.cnine_user_inventory.filter(r=>r.item_code==='MASTER_STAR'),before.cnine_user_inventory.filter(r=>r.item_code==='MASTER_STAR'));
 const expected=structuredClone(pack.settings);expected.stockLimits['V-996']=15;expected.stockLimits['V-999']=8;assert.deepEqual(JSON.parse(after.app_meta.find(r=>r.key===PACK_KEY).value).settings,expected);
 const noWrites={query:(s,v)=>{assert(!/^(UPDATE|INSERT|DELETE|WITH)/.test(s));return db.query(s,v);}};assert.equal((await grantSponsorRewards(noWrites,opts())).replayed,true);assert.deepEqual(await snapshot(),after);
 // Historical proof remains valid after normal spending and nickname changes.
 await db.exec("UPDATE users SET coin=0,nickname='renamed' WHERE id=4965;UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0 WHERE user_id=4965 AND item_code='SUIT_CORE_6'");assert.equal((await verifySponsorRewards(db)).missing,0);
});
test('partial coin, inventory, capacity, card, recall, audit and receipt writes roll back together',async t=>{
 const {db,snapshot}=await fixture(t),before=await snapshot();
 for(const pattern of [/INSERT INTO inventory_logs/,/^UPDATE mercenary_limited_stock/,/^INSERT INTO user_mercenary_cards/,/^INSERT INTO mercenary_limited_issues/,/^DELETE FROM user_mercenary_cards/,/^INSERT INTO admin_logs/,/^INSERT INTO app_meta/]){
  let fired=false;const fault={query:(s,v)=>{if(!fired&&pattern.test(s)){fired=true;throw Error('Injected boundary failure');}return db.query(s,v);}};await assert.rejects(grantSponsorRewards(fault,opts()),/Injected boundary failure/);assert(fired);assert.deepEqual(await snapshot(),before);
 }
});
test('identity, count, catalog, lease and plan guards reject changes; lost commit returns the same receipt',async t=>{
 const {db,snapshot}=await fixture(t);
 await assert.rejects(grantSponsorRewards(db,{...opts(),approvedPlanHash:'wrong'}),/Reviewed plan/);await assert.rejects(grantSponsorRewards(db,{...opts(),lockDeadline:Date.now()}),/Gameplay leases/);
 for(const [mutate,restore]of [["UPDATE users SET nickname='different' WHERE id=4817","UPDATE users SET nickname='음주' WHERE id=4817"],["UPDATE user_mercenary_cards_v1 SET total_copies=2,duplicate_count=1 WHERE user_id=4774 AND mercenary_code='V-996'","UPDATE user_mercenary_cards_v1 SET total_copies=1,duplicate_count=0 WHERE user_id=4774 AND mercenary_code='V-996'"],["UPDATE inventory_items SET is_active=0 WHERE code='SUIT_CORE_6'","UPDATE inventory_items SET is_active=1 WHERE code='SUIT_CORE_6'"],["UPDATE users SET coin=9007199254740991 WHERE id=22","UPDATE users SET coin=12345 WHERE id=22"]]){await db.exec(mutate);const state=await snapshot();await assert.rejects(grantSponsorRewards(db,opts()));assert.deepEqual(await snapshot(),state);await db.exec(restore);}
 let lost=false;const fault={query:async(s,v)=>{const r=await db.query(s,v);if(s==='COMMIT'&&!lost){lost=true;throw Error('Lost response');}return r;}};
 await assert.rejects(grantSponsorRewards(fault,opts()),/Lost response/);const committed=await snapshot();assert.equal((await grantSponsorRewards(db,opts())).replayed,true);assert.deepEqual(await snapshot(),committed);
});
