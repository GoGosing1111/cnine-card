import test from 'node:test';import assert from 'node:assert/strict';
import {clanReformFixture} from './helpers/clan-reform-fixture.mjs';
import {clanReformState,clanReadyAlert,saveWeeklyAvailability,saveWarReadiness,clanFieldAction} from '../functions/_clan_war_reform.js';
import {refreshClanExecutives,clanExecutive} from '../functions/_clan_governance.js';
import {weekOf,weekDates,readyOpen,supportEnergy,applyFieldAction,newField,fieldTeam,CLAN_SKILLS} from '../shared/clan-war-reform-v1.mjs';
import {activateClanReform} from '../scripts/ops/clan-reform-20261005.mjs';
import {mutateFaction} from '../functions/_clan_faction.js';
const id=()=>crypto.randomUUID();
test('approved operation ceiling: 9 mission + 3 combo + 3 supplier credit; repeated combos and refunds cannot create extra points',()=>{
  const start=Date.parse('2026-10-06T12:00:00Z'),war={status:'ACTIVE',starts_at:new Date(start).toISOString(),ends_at:new Date(start+7200000).toISOString(),clan_a_id:1,clan_b_id:2};
  for(const markKey of Object.keys(CLAN_SKILLS)){
    const state=newField(),members=[1,2,3,4];let awarded=0;
    const act=(userId,kind,offset)=>{const r=applyFieldAction(state,{war,userId,clanId:1,kind,now:start+offset,markKey,memberIds:members,executive:userId===4});
      assert.equal(r.points,r.contributions.reduce((n,c)=>n+c.points,0));awarded+=r.points;return r;};
    for(let round=0;round<3;round++)for(const [i,kind] of ['assault','disrupt','support'].entries())act(i+1,kind,round*6000);
    for(const userId of [1,2,3]){assert.equal(state.users[userId].missionPoints,9);assert.equal(state.users[userId].comboPoints,3);assert.equal(state.users[userId].points,12);}
    assert.throws(()=>act(1,'support',120000),/3회를 모두/);
    const first=act(4,'skill',120000);assert.equal(first.points,9);assert.deepEqual(first.contributions.map(c=>c.userId),[1,2,3]);assert.equal(state.users[4].points,0,'commander does not take supplier credit');
    for(let turn=2;turn<30;turn++){
      const before=JSON.stringify(state);try{assert.equal(act(4,'skill',turn*120000).points,0);}catch(error){assert.match(error.message,/지휘력/);assert.equal(JSON.stringify(state),before);break;}
    }
    for(const userId of [1,2,3]){assert.equal(state.users[userId].skillPoints,3);assert.equal(state.users[userId].points,15);}
    assert.equal(awarded,45);assert.equal(state.teams[1].points,45);assert.equal(state.teams[1].command,state.teams[1].supplies.reduce((n,s)=>n+s.amount,0));
  }
});
test('single-player role switching cannot earn a group bonus; departing supplier is never credited; tactical effects do not subtract clan score',()=>{
  const start=Date.parse('2026-10-06T12:00:00Z'),war={status:'ACTIVE',starts_at:new Date(start).toISOString(),ends_at:new Date(start+7200000).toISOString(),clan_a_id:1,clan_b_id:2},state=newField();
  for(const [i,kind] of ['assault','disrupt','support'].entries())applyFieldAction(state,{war,userId:1,clanId:1,kind,now:start+i*6000,markKey:'DK',memberIds:[1,2,3]});
  assert.equal(state.users[1].points,9);assert.equal(state.teams[1].combos,0);
  const team=fieldTeam(state,1),enemy=fieldTeam(state,2);team.supplies.push({userId:2,amount:30},{userId:3,amount:30});team.command+=60;
  enemy.supplies=[{userId:7,amount:60}];enemy.command=60;enemy.guard=3;enemy.points=40;
  const r=applyFieldAction(state,{war,userId:3,clanId:1,kind:'skill',now:start+120000,markKey:'HANWHA',memberIds:[2,3],executive:true});
  assert.equal(r.points,6);assert.equal(state.users[1].skillPoints,0);assert.equal(enemy.command,30);assert.equal(enemy.guard,3);assert.equal(enemy.points,40);
});
test('KST week, ready window and two-hour action boundaries',()=>{
  assert.equal(weekOf(Date.parse('2026-10-04T14:59:59Z')),'2026-09-28');
  assert.equal(weekOf(Date.parse('2026-10-04T15:00:00Z')),'2026-10-05');
  assert.deepEqual(weekDates(Date.parse('2026-10-05T00:00:00Z')).map(d=>d.date),['2026-10-06','2026-10-08','2026-10-10','2026-10-11']);
  const start=Date.parse('2026-10-06T12:00:00Z'),war={status:'SCHEDULED',starts_at:new Date(start).toISOString(),ends_at:new Date(start+7200000).toISOString(),clan_a_id:1,clan_b_id:2};
  assert.equal(readyOpen(war,start-900001),false);assert.equal(readyOpen(war,start-900000),true);assert.equal(readyOpen(war,start),false);
  war.status='ACTIVE';const input={war,userId:1,clanId:1,kind:'support',markKey:'DK'};
  assert.equal(applyFieldAction(newField(),{...input,now:start+7199999}).points,3);
  assert.throws(()=>applyFieldAction(newField(),{...input,now:start+7200000}),/진행 중/);
  assert.equal(supportEnergy(war,12,start+7200000).available,0);
});
test('PostgreSQL clan reform: authority, signup, readiness and exactly-once support',async t=>{
  const f=await clanReformFixture(),{env,season,p}=f;let now=f.start;
  try{
    await t.test('three strongest members get authority; legacy master and fourth place do not',async()=>{
      const executives=await refreshClanExecutives(env,f.deps,7,1,{force:true});assert.deepEqual(executives.map(e=>e.userId),[6,4,5]);
      assert.equal(await clanExecutive(env,7,1),false);assert.equal(await clanExecutive(env,7,3),false);assert.equal(await clanExecutive(env,7,4),true);
      const formation={attack1:[2],attack2:[],defense1:[],defense2:[]};
      await assert.rejects(()=>mutateFaction(env,season,{id:1},'formation',{requestId:id(),formation},f.deps),/집행관/);
      await mutateFaction(env,season,{id:4},'formation',{requestId:id(),formation},f.deps);
    });
    await t.test('current week persists, empty selection allowed; invalid days/stale weeks rejected',async()=>{
      await saveWeeklyAvailability(env,{id:1},season,{weekStart:'2026-10-05',days:[2,4,4]},now);
      let state=await clanReformState(env,{id:1},season,now);assert.deepEqual(state.myDays,[2,4]);assert.equal(state.submitted,true);
      await assert.rejects(()=>saveWeeklyAvailability(env,{id:1},season,{weekStart:'2026-09-28',days:[2]},now),/週|주간/);
      await assert.rejects(()=>saveWeeklyAvailability(env,{id:1},season,{weekStart:'2026-10-05',days:[1]},now),/화·목/);
      await saveWeeklyAvailability(env,{id:1},season,{weekStart:'2026-10-05',days:[]},now);
      state=await clanReformState(env,{id:1},season,now);assert.deepEqual(state.myDays,[]);assert.equal(state.submitted,true);
      await assert.rejects(()=>saveWeeklyAvailability(env,{id:9999},season,{weekStart:'2026-10-05',days:[2]},now),/가입/);
    });
    await t.test('15-minute alert includes nonsignups; response persisted/revisable; never gates joining',async()=>{
      await p("UPDATE clan_wars SET status='SCHEDULED' WHERE id=17").run();
      assert.equal((await clanReadyAlert(env,{id:2},season,now-900001)).alert,null);
      assert.equal((await clanReadyAlert(env,{id:2},season,now-900000)).alert.warId,17);
      await saveWarReadiness(env,{id:2},season,{warId:17,status:'READY'},now-900000);
      assert.equal((await clanReadyAlert(env,{id:2},season,now-10000)).alert,null);
      await saveWarReadiness(env,{id:2},season,{warId:17,status:'ABSENT'},now-10000);
      const state=await clanReformState(env,{id:2},season,now-10000);assert.equal(state.war.myReady,'ABSENT');
      await assert.rejects(()=>saveWarReadiness(env,{id:201},season,{warId:17,status:'READY'},now-1000),/클랜원/);
      await assert.rejects(()=>saveWarReadiness(env,{id:2},season,{warId:17,status:'READY'},now),/15분/);
      await p("UPDATE clan_wars SET status='ACTIVE' WHERE id=17").run();
      assert.equal((await clanFieldAction(env,{id:2},season,{warId:17,kind:'support',requestId:id()},now)).points,3);
    });
    await t.test('support adds team score and own contribution exactly once, ignores card power',async()=>{
      const body={warId:17,kind:'assault',requestId:id()};const first=await clanFieldAction(env,{id:1},season,body,now);
      assert.equal(first.points,3);assert.equal((await clanFieldAction(env,{id:1},season,body,now)).replayed,true);
      assert.equal(Number((await p('SELECT contribution_score FROM clan_members WHERE season_id=7 AND user_id=1').first()).contribution_score),3);
      assert.equal(Number((await p('SELECT score_a FROM clan_wars WHERE id=17').first()).score_a),6);
      await assert.rejects(()=>clanFieldAction(env,{id:1},season,{...body,kind:'support'},now),/같은 요청/);
      await assert.rejects(()=>clanFieldAction(env,{id:201},season,{...body,requestId:id()},now),/참여하는 클랜/);
    });
    await t.test('cooldowns, finite orders and rollback prevent repeated farming',async()=>{
      const before=Number((await p('SELECT score_a FROM clan_wars WHERE id=17').first()).score_a);
      await assert.rejects(()=>clanFieldAction(env,{id:1},season,{warId:17,kind:'support',requestId:id()},now),/5초/);
      now+=6000;const request={warId:17,kind:'support',requestId:id()};f.setFailure('UPDATE clan_members');
      await assert.rejects(()=>clanFieldAction(env,{id:1},season,request,now),/INJECTED_FAILURE/);f.setFailure('');
      assert.equal(Number((await p('SELECT score_a FROM clan_wars WHERE id=17').first()).score_a),before);
      assert.equal((await clanFieldAction(env,{id:1},season,request,now)).points,3);
      now+=6000;await clanFieldAction(env,{id:1},season,{warId:17,kind:'assault',requestId:id()},now);
      now+=6000;await assert.rejects(()=>clanFieldAction(env,{id:1},season,{warId:17,kind:'assault',requestId:id()},now),/3회를 모두/);
    });
    await t.test('three members complete an operation; one player cannot farm the bonus; command uses information/protection',async()=>{
      now+=300000;
      await assert.rejects(()=>clanFieldAction(env,{id:1},season,{warId:17,kind:'disrupt',requestId:id()},now),/3회를 모두/);
      let field=JSON.parse((await p('SELECT state_json FROM clan_war_field_state WHERE war_id=17').first()).state_json);
      assert.equal(Object.keys(field.teams[1].operation).length,2);assert.equal(field.teams[1].combos,0);
      const teamPlay=await clanFieldAction(env,{id:3},season,{warId:17,kind:'disrupt',requestId:id()},now);assert.equal(teamPlay.combo,true);assert.equal(teamPlay.points,12);
      assert.equal(teamPlay.contributions.reduce((n,c)=>n+c.points,0),12);assert.equal(teamPlay.contributions.length,3);
      field=JSON.parse((await p('SELECT state_json FROM clan_war_field_state WHERE war_id=17').first()).state_json);assert.equal(field.teams[1].combos,1);assert.equal(Object.keys(field.teams[1].operation).length,0);
      await assert.rejects(()=>clanFieldAction(env,{id:1},season,{warId:17,kind:'commander',targetUserId:2,requestId:id()},now),/집행관/);
      await clanFieldAction(env,{id:6},season,{warId:17,kind:'commander',targetUserId:2,requestId:id()},now);
      field=JSON.parse((await p('SELECT state_json FROM clan_war_field_state WHERE war_id=17').first()).state_json);field.teams[1].command=100;field.teams[1].supplies=[{userId:1,amount:30},{userId:2,amount:30},{userId:3,amount:40}];field.teams[1].intel=2;field.teams[2].guard=1;field.teams[2].command=50;field.teams[2].supplies=[{userId:7,amount:50}];
      await p('UPDATE clan_war_field_state SET state_json=? WHERE war_id=17',JSON.stringify(field)).run();
      await assert.rejects(()=>clanFieldAction(env,{id:6},season,{warId:17,kind:'skill',requestId:id()},now),/지정된 지휘관/);
      const skill={warId:17,kind:'skill',requestId:id()};assert.equal((await clanFieldAction(env,{id:2},season,skill,now)).points,6);
      assert.equal((await clanFieldAction(env,{id:2},season,skill,now)).replayed,true);
      field=JSON.parse((await p('SELECT state_json FROM clan_war_field_state WHERE war_id=17').first()).state_json);assert.equal(field.teams[1].command,80);assert.equal(field.teams[1].intel,0);assert.equal(field.teams[2].guard,0);
    });
    await t.test('departed executive loses permission immediately and ended war cannot award points',async()=>{
      await p('DELETE FROM clan_members WHERE season_id=7 AND user_id=6').run();assert.equal(await clanExecutive(env,7,6),false);
      await assert.rejects(()=>clanFieldAction(env,{id:6},season,{warId:17,kind:'commander',targetUserId:2,requestId:id()},now),/소속/);
      await p("UPDATE clan_wars SET status='CLOSING' WHERE id=17").run();
      await assert.rejects(()=>clanFieldAction(env,{id:4},season,{warId:17,kind:'support',requestId:id()},now),/진행 중/);
    });
  }finally{await f.close();}
});
test('release migration is reversible in dry run, preserves completed games, extends only future rounds and replays safely',async()=>{
  const f=await clanReformFixture();
  try{
    await f.DB.execSchema(['ALTER TABLE clan_seasons ADD COLUMN updated_at TEXT']);
    await f.p("INSERT INTO app_meta(key,value) VALUES('clan_settings_v1',?)",JSON.stringify({mode:'ON',participationEnabled:true,openDays:[0,2,4,6],warDurationMinutes:60})).run();
    const start=new Date(f.start).toISOString(),end=new Date(f.start+3600000).toISOString();
    await f.p("UPDATE clan_wars SET status='SCHEDULED',ends_at=? WHERE id=17",end).run();
    await f.p("INSERT INTO clan_wars(id,season_id,round_no,clan_a_id,clan_b_id,status,score_a,score_b,starts_at,ends_at) VALUES(16,7,0,1,2,'COMPLETED',51,48,?,?)",start,end).run();
    const client={query:(text,values=[])=>f.DB.client.query({text,values})};
    assert.equal((await activateClanReform(client,{dryRun:true,now:f.start-3600000})).updatedWars,1);
    assert.equal((await f.p('SELECT ends_at FROM clan_wars WHERE id=17').first()).ends_at,end);
    await activateClanReform(client,{now:f.start-3600000});
    assert.equal((await f.p('SELECT ends_at FROM clan_wars WHERE id=17').first()).ends_at,new Date(f.start+7200000).toISOString());
    const completed=await f.p('SELECT * FROM clan_wars WHERE id=16').first();assert.equal(completed.ends_at,end);assert.equal(Number(completed.score_a),51);
    assert.equal((await activateClanReform(client,{now:f.start-3600000})).replayed,true);
  }finally{await f.close();}
});
