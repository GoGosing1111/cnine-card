import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const client=read('js/territory-war-v1811.js');
const base=(frontId=101,energy=9)=>({mode:'ON',round:{id:70,status:'ACTIVE',current_front_index:4},front:{id:frontId},settings:{energyMax:15},mine:{side:'A',energy},network:{nodes:[]}});
const stale=()=>Object.assign(new Error('SQLITE_CONSTRAINT: CHECK constraint failed: ok=1'),{code:'TERRITORY_STATE_CHANGED',refreshState:true,retryable:false,status:409});
const result=()=>({battleV2:{timeline:[]},attackerWon:true,damage:123});

function runtime(respond){
  const events=[],calls=[],alerts=[],saves=[],retry={addEventListener(type,handler){this[type]=handler}};
  const modal={innerHTML:'',classList:{add(){},remove(){},toggle(){}},querySelectorAll:()=>[],querySelector:selector=>selector==='[data-retry]'?retry:null};
  let sequence=0,payloadFront=101;
  const sandbox={
    console,AbortController,
    document:{hidden:false,querySelector:()=>null,removeEventListener(){}},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    crypto:{randomUUID:()=>String(++sequence)},
    alert:text=>alerts.push(text),
    loadUser:()=>({coin:500,cardShards:7}),saveUser:user=>saves.push({...user}),
    CNineTerritoryBattlefield:{attackPayload:()=>({objective:'SIEGE',frontId:payloadFront})},
    apiRequest:async(path,options,config)=>{
      const call={path,method:options.method||'GET',body:options.body?JSON.parse(options.body):null,config};
      calls.push(call);events.push({kind:'request',path});
      return respond(call,calls);
    },
    qaRender:next=>{payloadFront=next.front.id;events.push({kind:'render',frontId:next.front.id,energy:next.mine.energy})},
    qaPlay:data=>events.push({kind:'play',data}),
    qaToast:text=>events.push({kind:'toast',text}),
    qaClose:()=>events.push({kind:'close'})
  };
  const cut=client.lastIndexOf("  document.addEventListener('visibilitychange'");
  assert.ok(cut>0);
  vm.runInNewContext(client.slice(0,cut)+[
    'render=()=>globalThis.qaRender(state);',
    'tickSkills=()=>{};',
    'prepareTerritoryBattle=async()=>{battleModal={remove:globalThis.qaClose};return {}};',
    'playTerritoryBattle=async(data)=>globalThis.qaPlay(data);',
    'showToast=(text)=>globalThis.qaToast(text);',
    'globalThis.qa={attack,loadFull,setup:(value,element)=>{state=value;modal=element;selectedNodeIndex=3;lastFrontId=value.front.id},snapshot:()=>({state,selectedNodeIndex,lastFrontId,pendingAttackId,pendingAttackPayload,busy,battleOpen:Boolean(battleModal)}),setPoll:(value)=>{pollController=value}};',
    '})();'
  ].join('\n'),sandbox);
  sandbox.qa.setup(base(),modal);
  return{...sandbox,events,calls,alerts,saves,modal,retry};
}
const attackCalls=r=>r.calls.filter(call=>call.method==='POST');

test('state-change rejection discards the old request, bypasses cached state and renders the selected replacement front before notifying',async()=>{
  let attacks=0;
  const r=runtime(call=>{
    if(call.method==='POST'){
      if(++attacks===1)throw Object.assign(stale(),{retryable:true});
      return{result:result(),state:base(202,7)};
    }
    assert.equal(call.path,'territory-war/state?nodeIndex=3');
    assert.equal(call.config.replaceInflight,true);
    assert.equal(call.config.microcache,false);
    return base(202,8);
  });
  let aborted=0;r.qa.setPoll({abort(){aborted++}});
  await r.qa.attack();
  const after=r.qa.snapshot();
  assert.equal(after.pendingAttackId,'');assert.equal(after.pendingAttackPayload,null);
  assert.equal(after.selectedNodeIndex,3);assert.equal(after.lastFrontId,202);
  assert.equal(after.state.front.id,202);assert.equal(after.state.mine.energy,8);
  assert.equal(after.busy,false);assert.equal(after.battleOpen,false);
  assert.equal(aborted,1);assert.equal(attackCalls(r).length,1);
  assert.equal(r.calls.some(call=>call.path.includes('action-status')),false);
  assert.deepEqual(r.alerts,[]);assert.deepEqual(r.saves,[]);
  const renderAt=r.events.findIndex(event=>event.kind==='render');
  const toastAt=r.events.findIndex(event=>event.kind==='toast');
  assert.ok(renderAt>=0&&toastAt>renderAt);
  assert.equal(r.events.filter(event=>event.kind==='toast').length,1);
  assert.doesNotMatch(r.events[toastAt].text,/SQL|constraint/);
  // Only another user attack sends a new ID and the freshly rendered front.
  await r.qa.attack();
  const posts=attackCalls(r);
  assert.equal(posts.length,2);assert.notEqual(posts[0].body.requestId,posts[1].body.requestId);
  assert.equal(posts[0].body.frontId,101);assert.equal(posts[1].body.frontId,202);
  assert.equal(posts[1].body.nodeIndex,3);
});

test('pending-result and timeout-recovery state changes refresh once without resending an attack',async()=>{
  for(const mode of ['pending','timeout']){
    const r=runtime(call=>{
      if(call.method==='POST'){
        if(mode==='timeout')throw Object.assign(new Error('timeout'),{retryable:true});
        return{pending:true,requestId:'server-request'};
      }
      if(call.path.includes('action-status'))throw stale();
      return base(202);
    });
    await r.qa.attack();
    assert.equal(attackCalls(r).length,1);
    assert.equal(r.calls.filter(call=>call.path.includes('action-status')).length,1);
    assert.equal(r.calls.filter(call=>call.path.startsWith('territory-war/state?')).length,1);
    assert.equal(r.qa.snapshot().pendingAttackId,'');
    assert.equal(r.qa.snapshot().pendingAttackPayload,null);
    assert.equal(r.qa.snapshot().state.front.id,202);
    assert.equal(r.events.filter(event=>event.kind==='play').length,0);
    assert.deepEqual(r.alerts,[]);assert.deepEqual(r.saves,[]);
  }
});

test('failed recovery removes stale state and leaves only a safe retry view until a fresh state succeeds',async()=>{
  let reads=0;
  const r=runtime(call=>{
    if(call.method==='POST')throw stale();
    if(++reads===1)throw new Error('SQL internal failure');
    return base(303);
  });
  await r.qa.attack();
  assert.equal(r.qa.snapshot().state,null);
  assert.equal(r.qa.snapshot().selectedNodeIndex,3);
  assert.equal(r.qa.snapshot().pendingAttackId,'');
  assert.equal(r.qa.snapshot().pendingAttackPayload,null);
  assert.match(r.modal.innerHTML,/data-retry/);
  assert.doesNotMatch(r.modal.innerHTML,/SQL|internal failure|data-tw3-attack/);
  assert.equal(r.events.filter(event=>event.kind==='render').length,0);
  assert.deepEqual(r.alerts,[]);assert.deepEqual(r.saves,[]);
  await r.retry.click();
  assert.equal(r.qa.snapshot().state.front.id,303);
  assert.equal(r.qa.snapshot().selectedNodeIndex,3);
  assert.equal(attackCalls(r).length,1);
});

test('confirmed results with reconciliation pending still play before refreshing and never invent balances',async()=>{
  for(const mode of ['direct','timeout']){
    const receipt={ok:true,result:result(),replayed:true,refreshState:true,reconciliationPending:true};
    const r=runtime(call=>{
      if(call.method==='POST'){
        if(mode==='timeout')throw Object.assign(new Error('timeout'),{retryable:true});
        return receipt;
      }
      if(call.path.includes('action-status'))return receipt;
      return base(404,6);
    });
    await r.qa.attack();
    const playAt=r.events.findIndex(event=>event.kind==='play');
    const refreshAt=r.events.findIndex(event=>event.kind==='request'&&event.path.startsWith('territory-war/state?'));
    assert.ok(playAt>=0&&refreshAt>playAt);
    assert.equal(r.events[playAt].data,receipt);
    assert.equal(r.qa.snapshot().state.front.id,404);
    assert.equal(r.qa.snapshot().state.mine.energy,6);
    assert.equal(r.qa.snapshot().battleOpen,true);
    assert.equal(r.qa.snapshot().pendingAttackId,'');
    assert.equal(attackCalls(r).length,1);
    assert.deepEqual(r.alerts,[]);assert.deepEqual(r.saves,[]);
  }
});

test('ordinary success keeps its existing single-request flow and syncs only authoritative account balances',async()=>{
  const r=runtime(()=>({ok:true,result:result(),state:base(101,8),coinAfter:750,cardShardsAfter:11}));
  await r.qa.attack();
  assert.equal(r.calls.length,1);
  assert.equal(r.events.filter(event=>event.kind==='play').length,1);
  assert.equal(r.events.filter(event=>event.kind==='toast').length,0);
  assert.equal(r.qa.snapshot().battleOpen,true);
  assert.deepEqual(r.saves,[{coin:750,cardShards:11}]);
  assert.equal(r.qa.snapshot().state.mine.energy,8);
});

test('shared apiRequest forwards the server state-change contract intact',async()=>{
  const app=read('js/app.js'),start=app.indexOf('async function apiRequest('),end=app.indexOf('const ACCOUNT_SYNC_PENDING=',start);
  const payload={error:'전황이 변경되었습니다.',code:'TERRITORY_STATE_CHANGED',refreshState:true,retryable:false};
  const sandbox={
    apiCacheKey:path=>path,API_CACHE_TTL:{},API_GET_MICROCACHE_TTL:1000,
    PLAYER_STATE_MUTATION_EPOCH:0,API_GET_CACHE:new Map(),API_INFLIGHT:new Map(),API_TOKEN:'fixture',
    fetchWithTimeout:async()=>({ok:false,status:409,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(payload)}),
    playerClientId:()=> 'fixture',window:{},d1BookmarkHeader:()=>({}),rememberD1Bookmark(){},BATTLE_ACTION_LOCK_RETRY_PATHS:new Set()
  };
  vm.runInNewContext(app.slice(start,end)+'globalThis.qaApi=apiRequest;',sandbox);
  await assert.rejects(sandbox.qaApi('territory-war/attack',{method:'POST',body:'{}'}),error=>{
    assert.equal(error.code,payload.code);assert.equal(error.refreshState,true);
    assert.equal(error.retryable,false);assert.equal(error.status,409);
    assert.equal(error.message,payload.error);return true;
  });
});

test('only the territory client cache receives the new state-recovery key',()=>{
  assert.match(read('index.html'),/js\/territory-war-v1811\.js\?v=2062-my-team-emphasis[^"]*&amp;stateRecovery=20261015-v1/);
});
