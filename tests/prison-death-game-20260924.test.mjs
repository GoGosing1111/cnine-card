import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { deathGameFixture } from './helpers/prison-death-game-fixture.mjs';
import { DEATH_GAME_RULES, ensureDeathGameSchema, createDeathGameTimeline, deathGamePhase, deathGameState,
  operateDeathGame, joinDeathGame, biteDeathGame, handlePrisonDeathGame, deathGameBlockedPath } from '../functions/_prison_death_game.js';
import { clanCampStatusForUser, clanCampActiveProbeSql, clanCampProbeTime, releaseClanCaptives } from '../functions/_clan_prison_camp.js';

const owner = { id:999, role:'OWNER' }, a = { id:101, role:'USER' }, b = { id:102, role:'USER' };
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
async function started(f) {
  const roundId = 'open_round_request_001';
  await operateDeathGame(f.env, owner, 'open', { requestId:roundId }, f.now);
  for (const user of [a,b]) await joinDeathGame(f.env, user, { roundId, acceptDeathPenalty:true }, false, f.now);
  await operateDeathGame(f.env, owner, 'start', { roundId, requestId:'start_round_request_001' }, f.now);
  const round = await f.p('SELECT * FROM prison_death_rounds_v1 WHERE id=?', roundId).first();
  return { roundId, round, watching:JSON.parse(round.timeline_json).find(p => p.type === 'WATCHING') };
}
for (const postgres of [false,true]) {
  const label = postgres ? 'PostgreSQL' : 'SQLite';
  test(`${label}: only OWNER opens/starts multiplayer; waiting never auto-starts; schema has independent marker`, async t => {
    const f = await deathGameFixture(postgres); t.after(f.close);
    await ensureDeathGameSchema(f.env);
    assert.equal((await deathGameState(f.env,a,f.now)).round,null);
    await assert.rejects(operateDeathGame(f.env,a,'open',{requestId:'open_round_request_001'},f.now),e=>e.status===403);
    const s = await operateDeathGame(f.env,owner,'open',{requestId:'open_round_request_001'},f.now), roundId=s.round.id;
    await assert.rejects(joinDeathGame(f.env,a,{roundId},false,f.now),/동의/);
    await joinDeathGame(f.env,a,{roundId,acceptDeathPenalty:true},false,f.now);
    await assert.rejects(operateDeathGame(f.env,owner,'start',{roundId,requestId:'start_round_request_001'},f.now),/2명/);
    assert.equal((await deathGameState(f.env,a,f.now+86400000)).round.status,'LOBBY');
    await joinDeathGame(f.env,b,{roundId,acceptDeathPenalty:true},false,f.now);
    const start = await operateDeathGame(f.env,owner,'start',{roundId,requestId:'start_round_request_001'},f.now);
    assert.equal(start.round.phase.type,'COUNTDOWN'); assert.equal(start.players.length,2);
    const replay = await operateDeathGame(f.env,owner,'start',{roundId,requestId:'start_round_request_001'},f.now+1000);
    assert.equal(replay.round.startsAt,start.round.startsAt);
    assert.equal((await deathGameState(f.env,a,start.round.endsAt+1)).round.status,'FINISHED');
    await assert.rejects(joinDeathGame(f.env,{id:103},{roundId,acceptDeathPenalty:true},false,f.now),/모집/);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM prison_death_operator_log_v1').first()).n),2);
  });
  test(`${label}: server timing, action sequence and rate limits; no client progress or forged victory`, async t => {
    const f=await deathGameFixture(postgres);t.after(f.close);const s=await started(f),when=Number(s.round.starts_at_ms)+100;
    await assert.rejects(biteDeathGame(f.env,a,{roundId:s.roundId,seq:1},f.now),/지금은/);
    await assert.rejects(biteDeathGame(f.env,a,{roundId:s.roundId,seq:24},when),/순서/);
    let result=await biteDeathGame(f.env,a,{roundId:s.roundId,seq:1,bites:24,won:true,clientNow:0},when);
    assert.equal(result.me.bites,1);assert.equal(result.me.status,'ALIVE');
    result=await biteDeathGame(f.env,a,{roundId:s.roundId,seq:1},when+100);
    assert.equal(result.me.bites,1);
    await assert.rejects(biteDeathGame(f.env,a,{roundId:s.roundId,seq:2},when+100),e=>e.status===429);
    await Promise.all([biteDeathGame(f.env,a,{roundId:s.roundId,seq:2},when+700),biteDeathGame(f.env,a,{roundId:s.roundId,seq:2},when+700)]);
    assert.equal((await deathGameState(f.env,a,when+700)).me.bites,2);
    assert.equal((await deathGameState(f.env,b,when+700)).me.bites,0);
    assert.equal(JSON.stringify(result).includes('timeline_json'),false);
    assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=101').first()).coin),123456);
  });
  test(`${label}: death and global five-minute restriction are atomic, persistent, exact and non-extending on retry`, async t => {
    const f=await deathGameFixture(postgres);t.after(f.close);const s=await started(f),when=s.watching.startsAt+500;
    f.fail('INTO event_prison_captives');
    await assert.rejects(biteDeathGame(f.env,a,{roundId:s.roundId,seq:1},when),/INJECTED/);f.fail('');
    assert.equal((await deathGameState(f.env,a,when)).me.status,'ALIVE');
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM event_prison_camps').first()).n),0);
    f.loseCommit();await assert.rejects(biteDeathGame(f.env,a,{roundId:s.roundId,seq:1},when),/LOST_COMMIT/);
    const replay=await biteDeathGame(f.env,a,{roundId:s.roundId,seq:1},when+2000);
    assert.equal(replay.me.status,'DEAD');assert.equal(replay.me.blockedUntil,when+300000);
    const prison=await clanCampStatusForUser(f.env,a.id,when+1);
    assert.equal(prison.facility,'DEATH_GAME');assert.equal(prison.incarcerated,true);
    assert.equal((await clanCampStatusForUser(f.env,a.id,when+299999)).incarcerated,true);
    assert.equal((await clanCampStatusForUser(f.env,a.id,when+300000)).incarcerated,false);
    assert.equal((await clanCampStatusForUser(f.env,b.id,when+1)).incarcerated,false);
    const eventId=`DEATH_GAME:${s.roundId}:${a.id}`;
    assert.equal((await releaseClanCaptives(f.env,owner,{eventId,userId:a.id},when+1000)).releasedCount,0);
    await operateDeathGame(f.env,owner,'cancel',{roundId:s.roundId,requestId:'cancel_round_request_001'},when+3000);
    assert.equal((await clanCampStatusForUser(f.env,a.id,when+3001)).facility,'DEATH_GAME');
  });
  test(`${label}: live prison probe gives death precedence without deleting an older prison sentence`, async t => {
    const f=await deathGameFixture(postgres);t.after(f.close);const s=await started(f),when=s.watching.startsAt+500;
    const format=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
    await f.p('INSERT INTO user_prison_status(user_id,active,reason,jailed_at,jailed_until) VALUES(101,1,?,?,?)','기존 제재',format(when-1000),format(when+3600000)).run();
    await biteDeathGame(f.env,a,{roundId:s.roundId,seq:1},when);
    const source=read('functions/api/[[path]].js');
    const functions=source.slice(source.indexOf('function prisonDateMs'),source.indexOf('async function clearPrisonChatIfEmpty'));
    let clock=when+1;
    class FixedDate extends Date { static now(){return clock} }
    const context={Date:FixedDate,env:f.env,clanCampStatusForUser:(env,id)=>clanCampStatusForUser(env,id,clock),clanCampActiveProbeSql,clanCampProbeTime,
      pulseCoup:async()=>{},ensurePrisonFoundation:async()=>{},reconcileClanCampSeason:async()=>{},ensureClanCampSchema:async()=>{}};
    vm.createContext(context);vm.runInContext(functions,context);
    assert.equal((await context.prisonStatusForUser(f.env,101)).facility,'DEATH_GAME');
    clock=when+300000;const original=await context.prisonStatusForUser(f.env,101);
    assert.equal(original.reason,'기존 제재');assert.equal(original.incarcerated,true);
  });
  test(`${label}: 24 valid bites finish, rivals share a timeline, and completed players cannot die`, async t=>{
    const f=await deathGameFixture(postgres);t.after(f.close);const s=await started(f),timeline=JSON.parse(s.round.timeline_json);
    let seq=0,last=0,result;
    for(const phase of timeline.filter(p=>p.type==='READING')){
      for(let at=Math.max(phase.startsAt+100,last+700);at<phase.endsAt&&seq<24;at+=700){result=await biteDeathGame(f.env,a,{roundId:s.roundId,seq:++seq},at);last=at;}
      if(seq===24)break;
    }
    assert.equal(result.me.status,'FINISHED');assert.equal(result.me.bites,24);
    const nextWatch=timeline.find(p=>p.type==='WATCHING'&&p.startsAt>last);
    const finished=await biteDeathGame(f.env,a,{roundId:s.roundId,seq:25},nextWatch.startsAt+500);
    assert.equal(finished.me.status,'FINISHED');assert.equal(finished.me.blockedUntil,0);
    const other=await deathGameState(f.env,b,last);assert.deepEqual(result.round.phase,other.round.phase);
    assert.equal(other.players[0].userId,a.id);
  });
}

test('HTTP auth and death gates: spectator cannot eat, ordinary user cannot operate, dead user cannot join or act',async t=>{
  const f=await deathGameFixture();t.after(f.close);const s=await started(f);
  const call=(path,method,user,body={},prison={incarcerated:false})=>handlePrisonDeathGame({path,env:f.env,request:new Request('http://local/api/'+path,{method,...method==='POST'?{body:JSON.stringify(body)}:{}}),
    deps:{authenticate:async()=>user,prisonStatusForUser:async()=>prison,readBody:r=>r.json(),json:(d,status=200)=>Response.json(d,{status})}});
  assert.equal((await call('prison-death-game/status','GET',null)).status,401);
  assert.equal((await call('admin/prison-death-game/open','POST',a,{requestId:'new_round_request_001'})).status,403);
  assert.equal((await call('prison-death-game/join','POST',a,{}, {incarcerated:true,facility:'DEATH_GAME'})).status,423);
  assert.equal((await call('prison-death-game/bite','POST',{id:103},{roundId:s.roundId,seq:1})).status,403);
  for(const path of ['prison-camp/chat','prison/hit','prison/fund','coup/vote','coup/attack-result','user/runtime-command'])assert.equal(deathGameBlockedPath(path),true);
  const server=read('functions/api/[[path]].js');
  assert.ok(server.indexOf('if(deathGameBlockedPath(path)')<server.indexOf('handleClanPrisonCamp({path'));
  assert.ok(server.indexOf('const prisonExempt=')<server.indexOf('const clanResponse=await handleClan('));
});

test('UI links, exact death wording, touch/keyboard release, cleanup, escaped names and production assets',()=>{
  const client=read('js/prison-death-game-20260924.js'),app=read('js/app.js'),index=read('index.html');
  assert.match(client,/사망하였습니다/);assert.match(client,/숲켓몬 전체 플레이가 일시 제한/);
  for(const event of ['pointerup','pointercancel','lostpointercapture','blur','visibilitychange','keyup'])assert.ok(client.includes(`'${event}'`));
  assert.match(client,/esc\(p.nickname\)/);assert.match(client,/lastSeq \+ 1/);assert.match(client,/if \(version !== generation\) return/);
  assert.match(app,/prisonUiState.facility==='DEATH_GAME'/);assert.match(app,/PrisonDeathGame.bindLock\(prisonUiState\)/);
  assert.match(read('js/clan-prison-camp-v2083.js'),/data-camp-death-game/);
  assert.match(index,/prison-death-game-20260924\.js\?v=/);assert.match(index,/prison-death-game-20260924\.css\?v=/);
  const png=readFileSync(new URL('../assets/ui/prison/death-game-overseer-atlas-20260924.png',import.meta.url));
  assert.equal(png[25],6,'new atlas retains genuine RGBA alpha');
  const context={window:{}};vm.runInNewContext(client,context);assert.match(context.window.PrisonDeathGame.lockView(),/data-death-lock-timer/);
  assert.match(read('css/prison-death-game-20260924.css'),/prefers-reduced-motion/);
});

test('first visit to an unopened game handles null round; a slow poll cannot revert a bite receipt',()=>{
  const source=read('js/prison-death-game-20260924.js'),context={};vm.createContext(context);
  vm.runInContext(`let state=null,offset=0,shotUntil=0;const root={isConnected:true},paint=()=>{};${source.slice(source.indexOf('  function apply(data)'),source.indexOf('  function paint()'))}`,context);
  context.apply({round:null,players:[],me:null,serverNow:1000});
  assert.equal(vm.runInContext('state.round',context),null);
  context.apply({round:{id:'room'},players:[],me:{lastSeq:2},serverNow:2000});
  context.apply({round:{id:'room'},players:[],me:{lastSeq:1},serverNow:1900});
  assert.equal(vm.runInContext('state.me.lastSeq',context),2);
});
