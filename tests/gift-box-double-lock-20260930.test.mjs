import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;

test('funding and recruitment openings use only the outer inventory/use lock',async()=>{
 const actionSource=api.match(/function serializedGameAction\(path,method\)\{[\s\S]*?\n\}/)?.[0];
 const prefixesSource=api.match(/const SERIALIZED_GAME_PREFIXES=(\[[^\n]+\]);/)?.[1];
 assert.ok(actionSource&&prefixesSource,'Request-level lock routing changed');
 const prefixes=Function(`return ${prefixesSource}`)();
 const serialized=Function('SERIALIZED_GAME_ACTIONS','SERIALIZED_GAME_PREFIXES','isPveV3Path',
  'mercenaryUsesInnerLock','FORGE_RUNTIME_RELEASE_ENABLED','isForgeRuntimePath','V3_JOINT_RELEASE_ENABLED',
  `${actionSource}; return serializedGameAction;`)(new Set(),prefixes,()=>false,()=>false,false,()=>false,false);
 assert.equal(serialized('inventory/use','POST'),true,'Inventory opening must keep the request-level lock');

 const start=api.indexOf("    if(path==='inventory/use'");
 const end=api.indexOf('      if(itemCode===TOURNAMENT_GIFT.code)',start);
 assert.ok(start>=0&&end>start,'Gift opening route changed');
 const route=new AsyncFunction('deps',`const {env,request,authenticate,readBody,json,withJointUserMutationLock,openFundingGift,openRecruitmentGift}=deps;
  const path='inventory/use';${api.slice(start,end)}}`);
 for(const itemCode of ['FUNDING_GIFT_BOX','RECRUITMENT_GIFT_BOX']){
  let held=false,outerAcquires=0,nestedAcquires=0,opened=0;
  const requestId=crypto.randomUUID();
  const deps={env:{},request:new Request('https://qa.test/api/inventory/use',{method:'POST',
   body:JSON.stringify({itemCode,count:1,requestId})}),
   authenticate:async()=>({id:1}),readBody:request=>request.json(),
   json:(body,status=200)=>Response.json(body,{status}),
   withJointUserMutationLock:async(_env,_id,_path,work)=>{nestedAcquires++;if(held)throw Error('JOINT_LOCK_BUSY');return work();},
   openFundingGift:async(_env,_user,options)=>{opened++;assert.equal(held,true);assert.equal(options.requestId,requestId);return {ok:true};},
   openRecruitmentGift:async(_env,_user,options)=>{opened++;assert.equal(held,true);assert.equal(options.requestId,requestId);return {ok:true};}};
  const invoke=async()=>{outerAcquires++;held=true;try{return await route(deps);}finally{held=false;}};
  const response=await invoke();
  assert.equal(response.status,200,`${itemCode} rejected by a nested lock`);
  assert.equal((await response.json()).ok,true);
  assert.deepEqual({outerAcquires,nestedAcquires,opened},{outerAcquires:1,nestedAcquires:0,opened:1});
 }
});
