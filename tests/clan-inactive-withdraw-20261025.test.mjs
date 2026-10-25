import test from 'node:test';
import assert from 'node:assert/strict';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
import {TARGETS,inspectWithdrawal,withdrawInactive} from '../scripts/ops/clan-inactive-withdraw-20261025.mjs';
async function fixture(t){
 const f=await clanResumeFixture(t);
 for(const [i,target] of TARGETS.entries()){
  const slot=[13,15,16][i],old=(await f.pg.query('SELECT user_id FROM organization_members_v1 WHERE organization_id=$1 AND slot=$2',[target.clanId,slot])).rows[0].user_id;
  await f.pg.query("INSERT INTO users VALUES($1,$2,'USER','ACTIVE',NULL)",[target.id,target.nickname]);await f.pg.query('UPDATE organization_members_v1 SET user_id=$1 WHERE user_id=$2',[target.id,old]);
  await f.pg.query('INSERT INTO organization_surveys_v1(round_id,user_id,preferred_id,updated_at,answers_json) VALUES($1,$2,$3,$4,$5)',[f.roundId,target.id,target.clanId,f.clock(),'{}']);
 }
 const review=await inspectResume(f.pg),r=await applyResume(f.pg,{dryRun:false,expectedReviewHash:review.reviewHash,now:f.clock(),random:()=>0}),sid=r.receipt.seasonId;
 const moved=(await f.pg.query('SELECT user_id FROM organization_members_v1 WHERE organization_id=1 AND slot=17')).rows[0].user_id;
 await f.pg.query('UPDATE organization_members_v1 SET organization_id=8,slot=16 WHERE user_id=$1',[moved]);await f.pg.query('UPDATE clan_members SET clan_id=8,draft_pick_no=16 WHERE season_id=$1 AND user_id=$2',[sid,moved]);await f.pg.query('UPDATE clan_draft_pool SET drafted_clan_id=8,pick_no=16 WHERE season_id=$1 AND user_id=$2',[sid,moved]);
 const state=JSON.parse((await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows[0].state_json);state.formations[5].attack4=[4084,76];state.captains[5]={attack4:4084};state.strikeReady[4084]=f.clock()+100;
 await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(state)]);
 return {...f,seasonId:sid};
}
test('three exact accounts leave both current rosters, surveys stop reallocation, other people and all history survive',async t=>{
 const f=await fixture(t),before=await inspectWithdrawal(f.pg),options={now:f.clock()};
 const dry=await withdrawInactive(f.pg,options);assert(dry.verified&&dry.protectedUnchanged);assert.deepEqual(await inspectWithdrawal(f.pg),before);
 for(const stop of ['DELETE FROM clan_members','UPDATE organization_surveys_v1','INSERT INTO admin_logs','INSERT INTO app_meta']){await assert.rejects(withdrawInactive({query:(sql,args)=>{if(sql.includes(stop))throw Error('INJECTED');return f.pg.query(sql,args);}},{...options,dryRun:false}),/INJECTED/);assert.deepEqual(await inspectWithdrawal(f.pg),before);}
 const applied=await withdrawInactive(f.pg,{...options,dryRun:false});assert.equal(applied.clans.reduce((n,c)=>n+c.count,0),125);assert.deepEqual(applied.clans.map(c=>c.count),[16,16,16,16,15,15,15,16]);
 for(const t of TARGETS){const v=await f.call('clan/overview',{regular:true,user:t.id});assert.equal(v.status,200);assert.equal(v.data.membership,null);}
 const replay=await withdrawInactive({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}});assert(replay.replayed);assert.equal((await f.pg.query('SELECT count(*)::int n FROM user_messages')).rows[0].n,0);
});
test('identity mismatch or active faction session aborts before roster mutation',async t=>{
 const f=await fixture(t),options={now:f.clock(),dryRun:false};
 await f.pg.query("UPDATE users SET nickname='different' WHERE id=4084");let before=await inspectWithdrawal(f.pg);await assert.rejects(withdrawInactive(f.pg,options));assert.deepEqual(await inspectWithdrawal(f.pg),before);
 await f.pg.query("UPDATE users SET nickname='게임닉네임' WHERE id=4084");const row=(await f.pg.query('SELECT state_json FROM organization_faction_state_v1')).rows[0],state=JSON.parse(row.state_json);state.session={status:'ACTIVE'};await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1',[JSON.stringify(state)]);before=await inspectWithdrawal(f.pg);await assert.rejects(withdrawInactive(f.pg,options));assert.deepEqual(await inspectWithdrawal(f.pg),before);
});
