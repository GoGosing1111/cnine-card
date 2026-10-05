import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: another tab cannot cancel a living winning Apocalypse party`,async t=>{
  const f=await apocalypseFixture({postgres});t.after(()=>f.close());
  const now=Date.now(),requestId='live-owner-protected',runToken=crypto.randomUUID();
  const act=(action,extra={},at=now)=>apocalypseChallengeAction(f.env,f.user,action,{requestId,runToken,...extra},at);
  await reserveApocalypseBattle(f.env,{userId:1,requestId,runToken,monsterId:75},now);
  await registerApocalypseChallenge(f.env,{userId:1,requestId,runToken,monsterId:75,won:true,battleV2:f.battle,plan:f.plan,log:{ids:['1','2','3','4','5'],playerPower:500,monsterPower:200}},now);
  const opened=await act('open');await act('answer',{zone:opened.safeZone},now+200);
  for(const token of [undefined,crypto.randomUUID()]){
    await assert.rejects(act('abandon',{runToken:token},now+500),/시작한 화면/);
    assert.equal((await act('status',{runToken:undefined},now+600)).status,'ANSWERED');
  }
  const done=await act('claim',{played:true},now+8000);
  assert.equal(done.status,'CLAIMED');assert.equal(done.settlement.result,'WIN');
  assert.equal((await act('claim',{played:true},now+9000)).replayed,true);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM battle_logs WHERE result='WIN'").first()).n),1);
});

const clientSource=fs.readFileSync(new URL('../js/apocalypse-challenge-v1.mjs',import.meta.url),'utf8').replace(/^export /gm,'')+'\n;globalThis.qa={beginBattle,mountRecovery};';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function page(shared,transport){
  const listeners=new Map(),panels=[],host={prepend:panel=>panels.push(panel)};
  const context=vm.createContext({crypto:webcrypto,console,setTimeout,clearTimeout,setInterval,clearInterval,performance,Date,
    localStorage:{getItem:key=>shared.get(key)||null,setItem:(key,value)=>shared.set(key,value)},
    document:{querySelector:()=>({}),createElement:()=>({dataset:{},textContent:''}),head:{append(){}},body:{},addEventListener(){},removeEventListener(){}},
    window:{loadUser:()=>({id:1}),addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name),apiRequest:transport}
  });
  vm.runInContext(clientSource,context);
  return {...context,root:{querySelector:()=>host},listeners,panels};
}

test('shared localStorage recovery only reads another tab, never cancels it or floods status on DOM updates',async()=>{
  const shared=new Map(),calls=[];
  const transport=async(path,options)=>{
    const body=JSON.parse(options.body);calls.push({action:path.split('/').at(-1),body});
    return {requestId:body.requestId,status:'ANSWERED',expiresAt:Date.now()+60000,success:true};
  };
  const owner=page(shared,transport),other=page(shared,transport),attempt=owner.qa.beginBattle();
  other.qa.mountRecovery(other.root);await flush();
  assert.deepEqual(calls.map(row=>row.action),['status']);assert.equal(owner.window.__activeApocalypseAttempt,attempt);
  assert.match(other.panels[0].textContent,/진행 중/);
  for(let i=0;i<20;i++)other.qa.mountRecovery(other.root);
  owner.qa.mountRecovery(owner.root);await flush();
  assert.equal(calls.length,1);assert.equal(other.panels.length,1);
  assert.ok(![...shared.values()].some(value=>value.includes(attempt.runToken)),'page nonce must remain in memory');
  attempt.finish();
});

test('the original page sends its nonce on pagehide exactly once; finished battles cannot be abandoned',async()=>{
  const shared=new Map(),calls=[];
  const transport=async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body,keepalive:options.keepalive});return {requestId:body.requestId,status:'FAILED'}};
  const owner=page(shared,transport),attempt=owner.qa.beginBattle();
  owner.listeners.get('pagehide')();attempt.abandon();await flush();
  assert.equal(calls.length,1);assert.equal(calls[0].body.runToken,attempt.runToken);assert.equal(calls[0].keepalive,true);
  const next=owner.qa.beginBattle();next.finish();next.abandon();await flush();assert.equal(calls.length,1);
});
