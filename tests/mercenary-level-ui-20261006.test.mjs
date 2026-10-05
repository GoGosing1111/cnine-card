import test from 'node:test';
import assert from 'node:assert/strict';
import {presentLevelReceipt} from '../mercenary-codex/leveling/receipt-presentation.mjs';
import {createLevelClient} from '../mercenary-codex/leveling/client.mjs';
import {levelDemo} from '../mercenary-codex/leveling/demo.mjs';
import {planMercenaryBreakthrough, MERCENARY_LEVEL_RELEASE_ENABLED, mercenaryLevelDraft} from '../shared/mercenary-level-v1.mjs';

function fixture({success=true, final=false}={}) {
  const account=levelDemo(),level=final?20:5;
  const state={level,experience:account.policy.levels[level-1].requiredXp,breakthroughMask:final?7:0,revision:1};
  const result=planMercenaryBreakthrough({policy:account.policy,state,roll:success?0:999999});
  let posts=0, receipt, failRead=false, token='test', failPost=false;
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const client=createLevelClient({accountId:7,storage,token:'test',currentToken:()=>token,locks:null,request:async(path,opts)=>{
    if(path.includes('/receipt'))return receipt;
    if(path.endsWith('/state')){if(failRead)throw Error('STATE_READ_FAILED');return {...account,userId:7,cards:account.cards.map(c=>c.code==='V-004'?{...c,growth:result.after}:c)};}
    posts++;receipt={requestId:opts.body.requestId,status:'COMPLETED',action:'BREAKTHROUGH',mercenaryCode:'V-004',result};if(failPost)throw Error('LOST_RESPONSE');return receipt;
  }});
  return {account,client,result,posts:()=>posts,failRead:v=>failRead=v,failPost:v=>failPost=v,changeAccount:()=>token='other',start:()=>client.run('breakthrough',{mercenaryCode:'V-004',revision:1})};
}
test('skip/close acknowledged only after the completed server result is shown, without another mutation',async()=>{
  const f=fixture(),receipt=await f.start();let finish;
  const applying=presentLevelReceipt({receipt,client:f.client,account:f.account,present:async(result,action,card)=>{
    assert.equal(result,f.result);assert.equal(action,'BREAKTHROUGH');assert.equal(card.code,'V-004');assert.equal(card.growth.level,6);
    return new Promise(r=>finish=r);
  }});
  await new Promise(r=>setImmediate(r));assert.ok(f.client.pending());finish(true);
  const shown=await applying;assert.equal(shown.pending,false);assert.equal(shown.account.cards[0].growth.level,6);assert.equal(f.posts(),1);
});
test('leaving the reveal keeps its receipt and restores the exact failure after a lost POST response',async()=>{
  const f=fixture({success:false});f.failPost(true);await assert.rejects(f.start,/LOST_RESPONSE/);
  const receipt=await f.client.run(null,null,{submit:false});
  const interrupted=await presentLevelReceipt({receipt,client:f.client,account:f.account,present:async()=>false});
  assert.equal(interrupted.pending,true);assert.equal(f.posts(),1);
  const recovered=await f.client.run(null,null,{submit:false});
  const shown=await presentLevelReceipt({receipt:recovered,client:f.client,account:f.account,present:async r=>{assert.equal(r.success,false);assert.equal(r.after.level,5);assert.equal(r.after.experience,0);return true;}});
  assert.equal(shown.pending,false);assert.equal(f.posts(),1);
});
test('failed state refresh or reveal retains pending request for recovery',async()=>{
  const f=fixture(),receipt=await f.start();f.failRead(true);
  await assert.rejects(()=>presentLevelReceipt({receipt,client:f.client,account:f.account,present:()=>assert.fail('must not reveal stale state')}),/STATE_READ_FAILED/);
  assert.ok(f.client.pending());f.failRead(false);
  await assert.rejects(()=>presentLevelReceipt({receipt,client:f.client,account:f.account,present:async()=>{throw Error('RENDER_FAILED');}}),/RENDER_FAILED/);
  assert.ok(f.client.pending());assert.equal(f.posts(),1);
});
test('account switch during animation cannot acknowledge another session',async()=>{
  const f=fixture(),receipt=await f.start();
  await assert.rejects(()=>presentLevelReceipt({receipt,client:f.client,account:f.account,present:async()=>{f.changeAccount();return true;}}),/계정이 변경/);
  assert.ok(f.client.pending());assert.equal(f.posts(),1);
});
test('pending receipt does not reveal or acknowledge; final level remains 20',async()=>{
  const f=fixture({final:true}),receipt=await f.start();
  const pending=await presentLevelReceipt({receipt:{status:'PENDING'},client:f.client,account:f.account,present:()=>assert.fail()});assert.equal(pending.completed,false);assert.equal(pending.pending,true);
  const shown=await presentLevelReceipt({receipt,client:f.client,account:f.account,present:async r=>{assert.equal(r.complete,true);assert.equal(r.after.level,20);assert.equal(r.after.breakthroughMask,15);return true;}});
  assert.equal(shown.pending,false);assert.equal(f.posts(),1);
  assert.equal(MERCENARY_LEVEL_RELEASE_ENABLED,false);assert.equal(mercenaryLevelDraft().sameCardMultiplier,null);assert.equal(mercenaryLevelDraft().mode,'OFF');
});
