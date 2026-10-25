import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,BLOODMOON_PACK_RELEASE_ENABLED,readBloodmoonPackSettings} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLOODMOON_SSS_STOCK_LIMITS} from '../shared/mercenary-bloodmoon-pool-v3.mjs';
import {PRIME_CRAFT_RELEASE_ENABLED} from '../shared/mercenary-prime-material-v1.mjs';
import {readBloodmoonPackState,saveBloodmoonPack,handleBloodmoonPack} from '../functions/_mercenary_bloodmoon_pack.js';
import {readBloodmoonOpening,enableBloodmoonOpening} from '../scripts/ops/bloodmoon-opening-20261025.mjs';

async function setup(t){
 const f=await bloodmoonFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER';UPDATE users SET role='OWNER' WHERE id=1;DELETE FROM mercenary_limited_stock_v1 WHERE code IN ('V-978','V-974','V-975');INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(1,'V-978',1,0,'before','before'),(2,'V-974',1,0,'before','before'),(3,'V-975',1,0,'before','before');");
 f.settings.mode='OFF';for(const code of Object.keys(BLOODMOON_SSS_STOCK_LIMITS))f.settings.stockLimits[code]=null;await f.configure(3);
 await f.setting('mercenary_halloween_ss_pack_v1',{protected:true});await f.setting('mercenary_prime_craft_v1',{isActive:false,materials:[{quantity:null}]});
 return f;
}
test('approved opening registers historical 5/3/3 pack stock once and preserves direct grants and prices',async t=>{
 assert.equal(BLOODMOON_PACK.name,'블러드문팩');assert.equal(BLOODMOON_PACK_RELEASE_ENABLED,true);assert.equal(PRIME_CRAFT_RELEASE_ENABLED,false);
 const f=await setup(t),before=await readBloodmoonOpening(f.pg),original=structuredClone(before.pack.settings);
 const migrated=readBloodmoonPackSettings(original);assert.deepEqual(Object.fromEntries(Object.keys(BLOODMOON_SSS_STOCK_LIMITS).map(c=>[c,migrated.stockLimits[c]])),BLOODMOON_SSS_STOCK_LIMITS);assert.equal(original.stockLimits['V-975'],null);assert.throws(()=>readBloodmoonPackSettings({...original,stockLimits:{...original.stockLimits,'V-960':null}}),/한도/);
 const dry=await enableBloodmoonOpening(f.pg,{dryRun:true,expectedPackSha256:before.packSha256});assert.equal(dry.status,'DRY_RUN_PASSED');assert.deepEqual(await readBloodmoonOpening(f.pg),before);
 const result=await enableBloodmoonOpening(f.pg,{expectedPackSha256:before.packSha256});assert.equal(result.pack.settings.mode,'ON');assert.equal(result.pack.revision,4);assert.deepEqual(result.stock.map(s=>[s.code,s.stock_limit,s.issued]),[['V-974',3,0],['V-975',3,0],['V-978',5,0]]);assert.equal(result.ownershipSha256,before.ownershipSha256);assert.equal(result.protectedSettingsSha256,before.protectedSettingsSha256);assert.deepEqual(result.pack.settings.prices,original.prices);
 const replay=await enableBloodmoonOpening({query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return f.pg.query(sql,args);}});assert(replay.replayed);assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM admin_logs')).rows[0].n),1);
 assert.equal((await readBloodmoonPackState(f.env)).userOpeningEnabled,true);
});

test('current configured stock supports audited OFF/ON and an authenticated purchase',async t=>{
 const f=await bloodmoonFixture(t);
 const off=await saveBloodmoonPack(f.env,{id:1},{settings:{...f.settings,mode:'OFF'},expectedRevision:1,requestId:crypto.randomUUID(),reason:'검수 판매 중지'});assert.equal(off.userOpeningEnabled,false);
 const on=await saveBloodmoonPack(f.env,{id:1},{settings:{...off.settings,mode:'ON'},expectedRevision:2,requestId:crypto.randomUUID(),reason:'검수 판매 재개'});assert.equal(on.userOpeningEnabled,true);
 const opened=await handleBloodmoonPack({path:BLOODMOON_PACK.openPath,request:new Request('https://qa.test/api/'+BLOODMOON_PACK.openPath,{method:'POST',headers:{'content-type':'application/json',origin:'https://qa.test'},body:JSON.stringify({...f.body(),expectedRevision:3})}),env:f.env,deps:{json:(body,status=200)=>({body,status}),authenticate:async()=>f.user,withUserMutationLock:async(_env,_id,_path,work)=>work()}});
 assert.equal(opened.status,200,JSON.stringify(opened.body));assert.equal(opened.body.status,'COMPLETED');assert.equal(await f.coin(),999900);
});
test('failed activation rolls back both new stock and ON; stale preflight cannot overwrite CMS settings',async t=>{
 const f=await setup(t),before=await readBloodmoonOpening(f.pg);
 await assert.rejects(enableBloodmoonOpening({query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('injected audit failure')):f.pg.query(sql,args)},{expectedPackSha256:before.packSha256}),/injected/);
 assert.deepEqual(await readBloodmoonOpening(f.pg),before);
 await assert.rejects(enableBloodmoonOpening(f.pg,{expectedPackSha256:'outdated'}),/changed since reviewed/);assert.deepEqual(await readBloodmoonOpening(f.pg),before);
 assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query('SELECT COUNT(*) n FROM inventory_logs')).rows[0].n,0);
});
