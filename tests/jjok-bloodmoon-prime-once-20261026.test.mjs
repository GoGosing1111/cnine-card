import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
import {makeEntitlement,OP} from '../scripts/ops/jjok-bloodmoon-prime-once-20261026.mjs';
import {bloodmoonSsOnceKey} from '../functions/_mercenary_bloodmoon_once.js';
import {PRIME_MATERIAL,isPrimeMaterialDraw} from '../shared/mercenary-prime-material-v1.mjs';

for(const count of [1,10,100000])test(`one armed material in ${count} draws; replay and later openings do not rearm`,async t=>{
 const f=await bloodmoonFixture(t,{randomInt:max=>max-1});await f.pg.exec('ALTER TABLE app_meta ADD COLUMN updated_at TEXT');
 // Keep a valid nonzero SSS rate; deterministic ordinary samples select misses.
 f.settings.normalRankRatesPpm=Object.fromEntries(Object.keys(f.settings.normalRankRatesPpm).map(k=>[k,k==='SSS'?1:0]));f.settings.missRatePpm=999999;
 f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(k=>[k,k==='V-975'?1000000:0]));
 if(count===100000){f.settings.prices={single:1e9,ten:1e10};await f.pg.exec('UPDATE users SET coin=400000000000000 WHERE id IN (1,2)');}
 await f.configure();await f.setting(bloodmoonSsOnceKey(1),{...makeEntitlement(),userId:1});
 const body=f.body(count);if(count===100000)body.budget='100000000000000';
 const result=await f.service.open(f.env,f.user,body);assert.equal(result.draws.filter(isPrimeMaterialDraw).length,1);assert(isPrimeMaterialDraw(result.draws[0]));
 const saved=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',bloodmoonSsOnceKey(1)).first()).value);assert.equal(saved.operationId,OP);assert.equal(saved.status,'CONSUMED');assert.equal(saved.remaining,0);
 await f.service.open(f.env,f.user,body);const next=await f.service.open(f.env,f.user,f.body(1));assert.equal(next.draws.filter(isPrimeMaterialDraw).length,0);
 assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=?',PRIME_MATERIAL.code).first()).quantity),1);
 const other=await f.service.open(f.env,{id:2},f.body(1));assert.equal(other.draws.filter(isPrimeMaterialDraw).length,0);
});
