import test from 'node:test';
import assert from 'node:assert/strict';
import {handleClan} from '../functions/_clan.js';
import {handleRestoredClanMemberKick} from '../functions/_organization.js';
import {organizationKickFixture} from './helpers/organization-kick-fixture.mjs';
test('the actual classic clan route is OFF for all roles and cannot mutate either roster',async t=>{
 const f=await organizationKickFixture(t),before=await f.snapshot();
 for(const user of [1,2,3,5]){
  const r=await handleClan({path:'clan/member/kick',env:f.env,deps:f.deps,request:new Request('https://example.test/api/clan/member/kick',{method:'POST',headers:{'x-qa-user':String(user)},body:JSON.stringify({seasonId:5,targetUserId:5,joinedAt:'2026-10-29',requestId:crypto.randomUUID(),confirmation:'KICK_CLAN_MEMBER'})})});
  assert.equal(r.status,409);assert.equal((await r.json()).code,'CLAN_MEMBER_KICK_DISABLED');
 }
 assert.deepEqual(await f.snapshot(),before);
});
test('OFF precedes lifecycle, resumption, legacy fallback, payload parsing and receipt replay',async()=>{
 const env=new Proxy({},{get(){throw Error('OFF must not access database or lifecycle');}});
 const deps={authenticate:async()=>({id:2,role:'USER'}),json:(data,status,headers)=>Response.json(data,{status,headers})};
 for(const method of ['POST','GET']){
  const request=new Request('https://example.test/api/clan/member/kick',{method,...(method==='POST'?{body:'invalid-json'}:{})});
  const r=await handleClan({path:'clan/member/kick',request,env,deps});assert.equal(r.status,409);assert.equal(r.headers.get('cache-control'),'no-store');
 }
 const r=await handleRestoredClanMemberKick({request:{},env,deps,user:{id:2}});assert.equal(r.status,409);
});
test('OFF preserves authentication requirements',async()=>{
 const deps={authenticate:async()=>null,json:(data,status,headers)=>Response.json(data,{status,headers})};
 const r=await handleClan({path:'clan/member/kick',request:new Request('https://example.test'),env:{},deps});assert.equal(r.status,401);
});
