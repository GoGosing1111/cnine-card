import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { deathGameFixture } from './helpers/prison-death-game-fixture.mjs';
import { DEATH_GAME_RULES, createDeathGameTimeline, deathGameState, operateDeathGame, joinDeathGame, biteDeathGame } from '../functions/_prison_death_game.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const owner={id:999,role:'OWNER'}, people=[101,102,103,104].map(id=>({id,role:'USER'}));
const source=read('js/prison-death-game-20260924.js');
for(const postgres of [false,true]) {
  test(`${postgres?'PostgreSQL':'SQLite'}: four seats, concurrent last slot, leave/rejoin and spectator event timestamps`,async t=>{
    const f=await deathGameFixture(postgres);t.after(f.close);
    await f.p("INSERT INTO users(id,nickname,role) VALUES(104,'참가자 넷','USER')").run();
    const roundId='four_seats_round_001',join=user=>joinDeathGame(f.env,user,{roundId,acceptDeathPenalty:true},false,f.now);
    await operateDeathGame(f.env,owner,'open',{requestId:roundId},f.now);
    assert.equal(DEATH_GAME_RULES.maxPlayers,4);
    for(const user of people.slice(0,3))await join(user);
    const attempts=await Promise.allSettled([join(people[3]),join(owner)]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(attempts.filter(r=>r.status==='rejected')[0].reason.status,409);
    assert.equal((await join(people[0])).players.length,4,'same-player retry never claims a second seat');
    await joinDeathGame(f.env,people[0],{roundId},true,f.now);
    assert.equal((await join(people[0])).players.length,4);
    const spectator=attempts[0].status==='rejected'?people[3]:owner;
    const s=await operateDeathGame(f.env,owner,'start',{roundId,requestId:'four_seats_start_001'},f.now);
    const at=s.round.startsAt+100;
    const receipt=await biteDeathGame(f.env,people[0],{roundId,seq:1,lastBiteAt:1,bites:24},at);
    const observer=await deathGameState(f.env,spectator,at+200);
    assert.equal(observer.me,null);
    assert.equal(observer.players.find(p=>p.userId===101).lastBiteAt,at);
    assert.equal(observer.players.find(p=>p.userId===101).lastSeq,1);
    assert.equal(observer.players.find(p=>p.userId===101).bites,1);
    assert.deepEqual(observer.round.phase,receipt.round.phase);
    await biteDeathGame(f.env,people[0],{roundId,seq:1},at+300);
    const afterRetry=await deathGameState(f.env,spectator,at+300);
    assert.equal(afterRetry.players.find(p=>p.userId===101).lastBiteAt,at,'receipt retry does not replay animation');
    await assert.rejects(biteDeathGame(f.env,spectator,{roundId,seq:1},at),e=>e.status===403);
    const row=await f.p('SELECT timeline_json FROM prison_death_rounds_v1 WHERE id=?',roundId).first();
    const watching=JSON.parse(row.timeline_json).find(p=>p.type==='WATCHING');
    const before=await biteDeathGame(f.env,people[1],{roundId,seq:1},watching.startsAt+99);
    assert.equal(before.me.status,'ALIVE','100ms network grace still applies');
    const boundary=await biteDeathGame(f.env,people[2],{roundId,seq:1},watching.startsAt+100);
    assert.equal(boundary.me.status,'DEAD','guard catches at the shortened boundary');
    assert.equal(boundary.me.blockedUntil,watching.startsAt+100+300000);
  });
}

test('harder guard patrol has short irregular reading windows, 650ms warning and a reachable 24-bite goal',()=>{
  assert.equal(DEATH_GAME_RULES.warningMs,650);assert.equal(DEATH_GAME_RULES.networkGraceMs,100);
  for(const random of [()=>0,()=>0.999999]){
    const timeline=createDeathGameTimeline(10000,random);
    assert.ok(timeline.at(-1).endsAt>=10000+DEATH_GAME_RULES.durationMs);
    let capacity=0;
    for(let i=0;i<timeline.length;i++){
      const phase=timeline[i],duration=phase.endsAt-phase.startsAt;
      if(i)assert.equal(phase.startsAt,timeline[i-1].endsAt);
      if(phase.type==='READING'){
        assert.ok(duration>=1000&&duration<2800);
        const available=Math.min(phase.endsAt,10000+DEATH_GAME_RULES.durationMs)-phase.startsAt-100;
        capacity+=Math.max(0,Math.ceil(available/700));
      }else if(phase.type==='WARNING')assert.equal(duration,650);
      else assert.ok(duration>=1100&&duration<2800);
    }
    assert.ok(capacity>=24,'difficulty must not make legitimate completion impossible');
  }
});

test('shared timestamp seeks the eating frame; stale, future and expired events stay idle',()=>{
  const context={};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  function mealFrame('),source.indexOf('  function paintMeals(')),context);
  for(const [elapsed,frame] of [[-1,0],[0,1],[119,1],[120,2],[249,2],[250,3],[459,3],[460,2],[570,1],[680,0],[2000,0]])
    assert.equal(context.mealFrame(10000,10000+elapsed),frame);
  assert.equal(context.mealFrame(0,100),0);
  assert.equal(context.mealFrame(10000,10200),2,'a delayed spectator seeks lift, not the start of a new animation');
});

test('network midpoint correction and local danger transitions keep the faster guard visible between polls',async()=>{
  let at=1000;
  const context={Date:{now:()=>at},apiRequest:async()=>{at=1400;return{serverNow:1210};}};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  const request ='),source.indexOf('  const on ='))+'\nthis.request=request;',context);
  assert.equal((await context.request('status')).clockOffsetMs,10);
  const heading={textContent:''},root={isConnected:true,dataset:{},classList:{toggle(){}},querySelector:()=>heading};
  const ctx={root,state:{round:{status:'RUNNING',endsAt:10000,phase:{type:'READING',endsAt:2000}},rules:{warningMs:650}},now:()=>at,shotUntil:0,paintMeals(){},time:String,titleFor:x=>x};
  vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function tick()'),source.indexOf('  async function refresh()')),ctx);
  at=2100;ctx.tick();assert.equal(root.dataset.phase,'WARNING');
  at=2650;ctx.tick();assert.equal(root.dataset.phase,'WATCHING');
  ctx.state.round.phase={type:'WARNING',endsAt:3000};at=3000;ctx.tick();assert.equal(root.dataset.phase,'WATCHING');
  ctx.state.round.phase={type:'WATCHING',endsAt:4000};at=4500;ctx.tick();assert.equal(root.dataset.phase,'WATCHING','never invent a safe window while disconnected');
});

test('one input predicts motion immediately but never progress; no held/queued requests, failed motion clears',async()=>{
  let resolve,reject,requests=0,paints=0,schedules=0;
  const context={document:{hidden:false},meals:new Map(),now:()=>10000,generation:1,acting:false,
    state:{round:{id:'test'},me:{userId:101,status:'ALIVE',lastSeq:0,bites:0,nextBiteAt:0}},
    root:{isConnected:true,querySelector:()=>({disabled:false}),classList:{add(){}}},
    paintMeals:()=>paints++,stopEating(){},notice(){},schedule:()=>schedules++,
    request:()=>{requests++;return new Promise((res,rej)=>{resolve=res;reject=rej;});},apply:data=>{context.state=data;}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  async function bite()'),source.indexOf('  async function command(')),context);
  const pending=context.bite();
  assert.equal(paints,1);assert.equal(context.meals.get(101).predicted,true);
  assert.equal(context.state.me.bites,0,'no optimistic food, victory or death');
  await context.bite();assert.equal(requests,1,'duplicate input while receipt is pending is dropped');
  resolve({...context.state,me:{...context.state.me,lastSeq:1,bites:1,nextBiteAt:10700}});await pending;
  await context.bite();assert.equal(requests,1,'cooldown input is not queued');
  context.state.me.nextBiteAt=0;
  const failure=context.bite();reject(Error('offline'));await failure;
  assert.equal(context.meals.size,0);assert.equal(schedules,2);
  context.document.hidden=true;await context.bite();assert.equal(requests,2);
});

test('space works without eat-button focus, ignores repeats and form controls, and unregisters with the dialog',()=>{
  let calls=0,handler;
  const context={window:{},eat:{},on:(target,type,fn)=>{handler=fn;},bite:()=>{calls++;}};
  const start=source.indexOf("    on(window, 'keydown'");
  const end=source.indexOf("    on(window, 'keyup'",start);
  vm.runInNewContext(source.slice(start,end),context);
  const key=(target=null,repeat=false)=>handler({code:'Space',key:' ',target,repeat,preventDefault(){}});
  key();assert.equal(calls,1);key(null,true);assert.equal(calls,1);
  key({closest:()=>({tagName:'INPUT'})});assert.equal(calls,1);
  key({closest:()=>context.eat});assert.equal(calls,2);
  assert.match(source,/cleanup\.splice\(0\)\.forEach/);
  assert.match(source,/pointermove.*Math\.hypot/);
  assert.doesNotMatch(source,/setInterval\(bite|setTimeout\(bite/);
});

test('standalone preview uses the live runtime and never connects to account APIs; asset and cache links exist',()=>{
  const html=read('preview/prison-death-game-v2/index.html'),preview=read('preview/prison-death-game-v2/preview.js'),index=read('index.html');
  assert.match(html,/connect-src 'none'/);assert.match(html,/실제 계정/);
  assert.match(html,/prison-death-game-20260924\.js\?v=20260924-2/);
  assert.doesNotMatch(preview,/fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
  assert.match(index,/prison-death-game-20260924\.(?:js|css)\?v=20260924-2/);
  const atlas=readFileSync(new URL('../assets/ui/prison/death-game-diners-table-atlas-20260924.png',import.meta.url));
  assert.equal(atlas[25],6,'sprites retain actual RGBA transparency');
  assert.match(source,/lastBiteAt > \(seatEvents\.get/);
  assert.match(source,/Number\(data.serverNow\) < Number\(state.serverNow\)/);
});
