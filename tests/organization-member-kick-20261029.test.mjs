import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationKickFixture} from './helpers/organization-kick-fixture.mjs';

test('OFF blocks elders, members, OWNER and concurrent kick requests without writes',async t=>{
 const f=await organizationKickFixture(t),before=await f.snapshot();
 const results=await Promise.all([1,2,3,4,5,6].map(user=>f.kick({},user)));
 for(const r of results){assert.equal(r.status,409);assert.equal(r.data.code,'CLAN_MEMBER_KICK_DISABLED');}
 assert.deepEqual(await f.snapshot(),before);
});
test('OFF hides all kick permissions while keeping elder join-review authority and member visibility',async t=>{
 const f=await organizationKickFixture(t);
 for(const user of [2,3,5]){const r=await f.overview(user);assert.equal(r.status,200);assert.equal(r.data.roster.length,4);assert(r.data.roster.every(m=>m.canKick===false));assert.equal(r.data.join.canReview,user!==5);}
});
test('OFF rejects stale dialogs and successful receipt replay before reading request bodies or writing',async t=>{
 const f=await organizationKickFixture(t),requestId='previous-successful-kick';
 await f.pg.query('INSERT INTO organization_receipts_v1 VALUES($1,$2,$3,$4,$5)',[2,requestId,'old-fingerprint',JSON.stringify({ok:true,removedUserId:5}),f.clock()]);
 const before=await f.snapshot();
 assert.equal((await f.kick({requestId})).data.code,'CLAN_MEMBER_KICK_DISABLED');
 assert.equal((await f.post('organization/member/kick',{targetUserId:999999,confirmation:''},{user:2})).data.code,'CLAN_MEMBER_KICK_DISABLED');
 assert.equal((await f.kick({},0)).status,401);assert.deepEqual(await f.snapshot(),before);
});
