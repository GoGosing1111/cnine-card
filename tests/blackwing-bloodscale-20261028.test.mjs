import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {blackwingView,actBlackwingRoom,tickBlackwingRoom} from '../functions/_raid_blackwing.js';
import {openBlackwingScale,scalePending} from '../functions/_raid_blackwing_scale.js';
import {blackwingCommands,blackwingScaleMarkup} from '../raid/blackwing/commands.mjs';
import {blackwingLiveFixture} from './helpers/blackwing-live-fixture.mjs';
import {room,action,members,scale,solveViews,play,debt,hearts,sever,damage,ward} from './helpers/blackwing-scale-scenario.mjs';

const views=r=>members.map(([id])=>blackwingView(r,id));
const put=(r,p)=>{for(const[id]of members)action(r,id,'PLACE',p[id]);};
const lock=r=>{for(const[id]of members){if(r.status==='ACTIVE')action(r,id,'LOCK');}};
const results={cooperative:[],blind:[]};
for(const branch of ['WING','BLADE'])test('v3 '+branch+' visible-clue coordination clears 32 seeds with 12s deliberation and 3s confirmation',()=>{
 const times=[];
 for(let seed=1;seed<=32;seed++){
  const r=play(seed,branch);assert.equal(r.status,'CLEAR',JSON.stringify({seed,branch,failure:r.failure}));
  assert.equal(r.strain,0);assert.equal(r.statistics.scaleRounds,branch==='WING'?8:9);assert.ok(r.resources.heal<4);
  assert.ok(r.clock<r.endsAt);times.push((r.clock-r.startedAt)/1000);
 }
 results.cooperative.push({branch,runs:32,clears:32,planningSeconds:12,commitSpreadSeconds:2.5,minSeconds:Math.min(...times),maxSeconds:Math.max(...times)});
});

test('100 seeded sequences remain solvable and cannot repeat any member’s last successful pad',()=>{
 for(let seed=1;seed<=100;seed++){
  const r=room(seed);
  for(let cycle=0;cycle<10;cycle++){
   const vv=views(r),solutions=solveViews(vv);assert.equal(solutions.length,1,'a unique legal assignment for this seed');
   const p=solutions[0];for(const m of vv[0].challenge.scale.members)assert.notEqual(p[m.id],m.previous);
   put(r,p);lock(r);assert.equal(r.challenge.scale.done,true);openBlackwingScale(r);
  }
 }
});
test('individual clues and pending snapshots never disclose another weight or answer',()=>{
 const r=room(19),before=JSON.stringify(r.challenge.scale);
 for(const[id]of members){
  const v=blackwingView(r,id),s=v.challenge.scale;assert.equal(s.ownWeight,r.challenge.scale.weights[id]);
  assert.equal(s.weights,undefined);assert.equal(s.answer,undefined);assert.equal(s.solution,undefined);
  assert.ok(s.members.every(m=>!Object.hasOwn(m,'weight')));assert.equal(v.seed,undefined);
  assert.ok(!v.combatLog.some(e=>e.placements));
 }
 assert.equal(JSON.stringify(r.challenge.scale),before,'polling does not regenerate the problem');
});
test('all three placement choices remain clickable, including wrong and previous pads',()=>{
 const r=room(21);scale(r);openBlackwingScale(r);
 for(const v of views(r)){
  const choices=blackwingCommands(v,r.clock).buttons.filter(b=>b.action==='PLACE');
  assert.equal(choices.length,3);assert.ok(choices.every(c=>!c.disabled));
  assert.match(blackwingScaleMarkup(v,r.clock),/내 잔상/);
  assert.equal(blackwingCommands(v,r.clock).buttons.find(b=>b.action==='LOCK').disabled,true);
 }
});
test('wrong full-team assignment records actual names, totals and missing conditions; one penalty only',()=>{
 const r=room(31),deadline=r.challenge.scale.deadline;put(r,Object.fromEntries(members.map(([id])=>[id,0])));lock(r);
 assert.equal(r.strain,1);assert.equal(r.challenge.scale.cycle,2);assert.equal(r.challenge.scale.deadline,deadline);
 assert.equal(r.challenge.scale.locked.length,0);assert.deepEqual(r.wards,[2,2,2]);
 const e=r.combatLog.find(e=>e.type==='BLACKWING_SCALE');assert.equal(e.outcome,'FAILED');assert.equal(e.ownerId,undefined);
 assert.match(e.reason,/참가자 1\(\d\).*목표/);assert.equal(e.placements.length,6);assert.equal(r.combatLog.findLast(e=>e.action==='LOCK').outcome,'SUBMITTED');
 assert.equal(r.combatLog.find(e=>e.cueKey==='MISTAKE').ownerId,undefined);
});
test('commits and stale requests cannot double-lock or submit a later puzzle',()=>{
 const r=room(32),p=solveViews(views(r))[0];put(r,p);
 const token=blackwingView(r,'1').challenge.tokens.LOCK,input={requestId:'replay_scale_lock_01',action:'LOCK',token};
 actBlackwingRoom(r,'1',input);const count=r.combatLog.length;actBlackwingRoom(r,'1',input);
 assert.equal(r.challenge.scale.locked.length,1);assert.equal(r.combatLog.length,count);
 assert.equal(action(r,'1','PLACE',2).code,'BLACKWING_SCALE_LOCKED');
 for(const[id]of members.slice(1))action(r,id,'LOCK');assert.equal(r.challenge.scale.done,true);openBlackwingScale(r);
 assert.equal(action(r,'1','LOCK',undefined,r.clock,{token}).ignored,true);assert.deepEqual(r.challenge.scale.locked,[]);
});
test('six-second lock boundary is exclusive and reports missing people, never the next requester',()=>{
 const r=room(33);put(r,solveViews(views(r))[0]);action(r,'1','LOCK');const first=r.clock;
 for(const[id]of members.slice(1,5))action(r,id,'LOCK',undefined,first+5999);
 assert.equal(r.strain,0);const old=blackwingView(r,'8').challenge.tokens.LOCK;
 action(r,'8','LOCK',undefined,first+6000,{token:old});assert.equal(r.strain,1);
 const e=r.combatLog.find(e=>e.type==='BLACKWING_SCALE');assert.match(e.reason,/6초.*참가자 8/);assert.equal(e.ownerId,undefined);
 assert.equal(r.challenge.scale.cycle,2);assert.equal(r.challenge.scale.locked.length,0);
});
test('planning pauses mechanic windows, but pressure and overall enrage keep running',()=>{
 const r=room(34),opens=r.challenge.debt.opensAt,end=r.endsAt,deadline=r.challenge.scale.deadline;
 assert.equal(action(r,'1','CHARGE').code,'BLACKWING_SCALE_REQUIRED');
 tickBlackwingRoom(r,r.clock+17000);assert.equal(r.strain,0);assert.equal(r.challenge.debt.cycle,1);
 assert.ok(r.combatLog.some(e=>e.type==='BOSS_ULTIMATE'));assert.equal(r.endsAt,end);assert.equal(r.challenge.scale.deadline,deadline);
 put(r,solveViews(views(r))[0]);lock(r);assert.equal(r.challenge.debt.opensAt,opens+17000);
 tickBlackwingRoom(r,end);assert.equal(r.status,'FAILED');
 const r2=room(35);tickBlackwingRoom(r2,r2.challenge.scale.deadline);assert.equal(r2.failure.code,'SCALE_TIMEOUT');assert.match(r2.failure.reason,/참가자 1/);
});
test('JSON restart retains choices, first-commit deadline and previous positions',()=>{
 let r=room(36);scale(r);openBlackwingScale(r);put(r,solveViews(views(r))[0]);action(r,'1','LOCK');
 const before=blackwingView(r,'7');r=JSON.parse(JSON.stringify(r));assert.deepEqual(JSON.parse(JSON.stringify(blackwingView(r,'7'))),JSON.parse(JSON.stringify(before)));
 tickBlackwingRoom(r,r.challenge.scale.firstLockAt+6000);assert.equal(r.strain,1);
 tickBlackwingRoom(r,r.clock+1);assert.equal(r.strain,1);assert.deepEqual(r.challenge.scale.previous,r.scalePositions);
});
test('phase four and five require six fresh commitments before every breath',()=>{
 const r=room(37);scale(r);debt(r);damage(r);scale(r);hearts(r);damage(r);scale(r);sever(r,'BLADE');damage(r);
 const n=r.statistics.scaleRounds;ward(r,0);assert.equal(r.statistics.scaleRounds,n+1);assert.ok(scalePending(r));
 assert.equal(action(r,'6','WARD',1).code,'BLACKWING_SCALE_REQUIRED');assert.equal(r.challenge.scale.locked.length,0);
 ward(r,1);ward(r,0);damage(r);assert.equal(r.phase,4);assert.ok(scalePending(r));assert.deepEqual(r.wards,[0,1,2]);
});
test('even perfect v3 decisions cannot clear without healing',()=>{
 for(const branch of ['WING','BLADE']){const r=play(38,branch,{healing:false});assert.equal(r.status,'FAILED');assert.ok(['MEMBER_DEAD','PARTY_DEAD'].includes(r.failure.code));assert.equal(r.strain,0);}
});
// These bots get perfect old mechanics and healing. Only the new scale is blind,
// making this a stronger comparison than randomizing every raid button.
for(const mode of ['fixed','rotation','random'])test(mode+' blind placement cannot clear 100 seeds in either branch',()=>{
 for(const branch of ['WING','BLADE']){
  let clears=0,firstSolved=0;
  for(let seed=1;seed<=100;seed++){
   let rng=seed*1234567,round=0;
   const base=[0,1,1,2,2,0];
   const blind=()=>{round++;return Object.fromEntries(members.map(([id],i)=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return [id,mode==='fixed'?base[i]:mode==='rotation'?(base[i]+round)%3:rng%3];}));};
   const r=play(seed,branch,{planning:500,gap:100,blind});if(r.status==='CLEAR')clears++;if(r.statistics.scaleRounds>0)firstSolved++;
  }
  assert.equal(clears,0);results.blind.push({mode,branch,runs:100,clears,firstSolved});
 }
});
for(const postgres of [false,true])test('six-account scale commits survive receipt rollback/retry '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const h=await blackwingLiveFixture({postgres});t.after(()=>h.close());const roomId=await h.party();
 for(const[id]of members)await h.command('ready',{roomId,ready:true},Number(id));await h.command('start',{roomId});
 const vv=await Promise.all(members.map(async([id])=>(await h.call('state?roomId='+roomId,{user:Number(id)})).body.state));
 const solution=solveViews(vv)[0];assert.ok(solution);
 const command=async(id,a,target)=>{const v=(await h.call('state?roomId='+roomId,{user:Number(id)})).body.state;return h.command('action',{roomId,action:a,target,token:v.challenge.tokens[a]},Number(id));};
 for(const[id]of members)assert.equal((await command(id,'PLACE',String(solution[id]))).status,200);
 for(const[id]of members.slice(0,5))assert.equal((await command(id,'LOCK')).status,200);
 const before=await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId),v=(await h.call('state?roomId='+roomId,{user:8})).body.state;
 const body={requestId:h.uid(),roomId,action:'LOCK',token:v.challenge.tokens.LOCK};h.inject('INSERT INTO raid_blackwing_receipts');
 assert.equal((await h.call('action',{body,user:8})).status,503);h.inject('');
 assert.deepEqual(await h.one('SELECT state_json,version FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId),before);
 assert.equal((await h.call('action',{body,user:8})).status,200);assert.equal((await h.call('action',{body,user:8})).status,200);
 const r=JSON.parse((await h.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);
 assert.equal(r.statistics.scaleRounds,1);assert.equal(r.challenge.scale.locked.length,6);assert.equal(r.combatLog.filter(e=>e.type==='BLACKWING_SCALE').length,1);
 assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),0);
});
test('write reproducible challenge comparison when an external QA directory is supplied',()=>{
 if(process.env.BLACKWING_QA_DIR){fs.mkdirSync(process.env.BLACKWING_QA_DIR,{recursive:true});fs.writeFileSync(process.env.BLACKWING_QA_DIR+'/difficulty.json',JSON.stringify({conditions:{bossCombatPower:45000000,enrageSeconds:300,mechanicTimePercent:100,cardPower:10000000,scope:'synthetic six-player coordination; not human win rates'},...results},null,2));}
});

for(const postgres of [false,true])test('six simultaneous placements and locks do not lose a participant '+(postgres?'PostgreSQL':'SQLite'),async t=>{
 const h=await blackwingLiveFixture({postgres});t.after(()=>h.close());const roomId=await h.party();
 for(const[id]of members)await h.command('ready',{roomId,ready:true},Number(id));await h.command('start',{roomId});
 const vv=await Promise.all(members.map(async([id])=>(await h.call('state?roomId='+roomId,{user:Number(id)})).body.state)),solution=solveViews(vv)[0];
 const placed=await Promise.all(vv.map(v=>h.command('action',{roomId,action:'PLACE',target:String(solution[v.me.id]),token:v.challenge.tokens.PLACE},Number(v.me.id))));
 assert.deepEqual(placed.map(x=>x.status),[200,200,200,200,200,200]);
 const locked=await Promise.all(vv.map(v=>h.command('action',{roomId,action:'LOCK',token:v.challenge.tokens.LOCK},Number(v.me.id))));
 assert.deepEqual(locked.map(x=>x.status),[200,200,200,200,200,200]);
 const saved=JSON.parse((await h.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);
 assert.equal(saved.statistics.scaleRounds,1);assert.equal(saved.strain,0);assert.equal(saved.challenge.scale.locked.length,6);
});
