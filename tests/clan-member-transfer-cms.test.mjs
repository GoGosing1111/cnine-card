import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveReplacement,validateReplacementPreview,ReplacementSession} from '../admin/clan-member-transfer.js';
const state={season:{id:4,seasonNo:1,phase:'ACTIVE'},clans:[{id:2,name:'목적',active:true},{id:3,name:'출발',active:true}]};
const incoming={player:{id:10,nickname:'이적유저',clan:{id:3,name:'출발',season:1,role:'클랜원'}}};
const outgoing={player:{id:20,nickname:'추방유저',clan:{id:2,name:'목적',season:1,role:'클랜원'}}};
const target=resolveReplacement(incoming,outgoing,state,'이적유저','추방유저',2);
const removals=[{userId:20,nickname:'추방유저',clanId:2,memberRole:'MEMBER'}];
const preview={...target,ok:true,previewId:'11111111-1111-4111-8111-111111111111',confirmation:'TRANSFER_EXPLICIT_CLAN_MEMBER',verified:true,rankedDeckReady:true,currentMembership:{clanId:3,clanName:'출발',memberRole:'MEMBER'},removals,gift:null,memberCount:22,afterCount:22,maxMembers:22};
const result={...target,ok:true,previewId:preview.previewId,memberRole:'MEMBER',removedCount:1,removed:removals,gift:null,completedAt:'2026-09-06T12:00:00Z',beforeCount:22,memberCount:22,maxMembers:22};
test('resolves exact two members and the source clan without capacity override or gift',()=>{
  assert.equal(target.fromClanId,3);assert.deepEqual(target.removeMembers,[{userId:20,nickname:'추방유저'}]);assert.equal(target.clanGift,undefined);
  for(const bad of [{id:3,name:'출발',season:1,role:'클랜원'},{id:2,name:'목적',season:2,role:'클랜원'},{id:2,name:'목적',season:1,role:'클랜장'}])assert.throws(()=>resolveReplacement(incoming,{player:{...outgoing.player,clan:bad}},state,'이적유저','추방유저',2));
  assert.throws(()=>resolveReplacement(incoming,outgoing,state,'틀린유저','추방유저',2));
  const free=resolveReplacement({player:{id:10,nickname:'이적유저',clan:null}},outgoing,state,'이적유저','추방유저',2);assert.equal(free.fromClanId,undefined);
});
test('preview rejects identity, extra removals, wrong source, gift and capacity changes',()=>{
  assert.equal(validateReplacementPreview(preview,target),preview);
  for(const bad of [{userId:11},{removals:[]},{removals:[...removals,...removals]},{gift:{coin:1}},{clanGift:{coin:1}},{maxMembers:23},{afterCount:23},{verified:false},{currentMembership:{clanId:5,clanName:'출발'}},{confirmation:'ASSIGN_UNAFFILIATED_CLAN_MEMBER'}])assert.throws(()=>validateReplacementPreview({...preview,...bad},target));
});
test('lost apply response restores the same receipt and exact confirmation without duplicating changes',async()=>{
  let saved,lose=true;const calls=[];
  const request=async(path,body)=>{calls.push(body);if(body.action==='preview')return preview;if(lose){lose=false;throw Error('timeout');}return result;};
  const a=new ReplacementSession(request,r=>{saved=structuredClone(r);});await a.preview(target);await assert.rejects(a.apply());
  await assert.rejects(a.preview(target));const b=new ReplacementSession(request,r=>{saved=structuredClone(r);},saved);
  assert.equal(await b.apply(),result);assert.deepEqual(calls[1],calls[2]);assert.deepEqual(Object.keys(calls[2]).sort(),['action','confirmation','previewId']);await b.apply();assert.equal(calls.length,3);
});
test('storage failure blocks mutation; wrong completion never reports success',async()=>{
  let calls=0;const a=new ReplacementSession(async()=>{calls++;},()=>{throw Error('storage');},{target,preview,started:false});await assert.rejects(a.apply());assert.equal(calls,0);
  const b=new ReplacementSession(async()=>({...result,removedCount:2}),()=>{},{target,preview,started:false});await assert.rejects(b.apply());assert.equal(b.receipt.result,undefined);
});
