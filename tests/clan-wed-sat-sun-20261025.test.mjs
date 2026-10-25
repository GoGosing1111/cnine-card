import test from 'node:test';
import assert from 'node:assert/strict';
import {clanResumeFixture} from './helpers/clan-resume-fixture.mjs';
import {inspectResume,applyResume} from '../scripts/ops/clan-resume-20261025.mjs';
import {inspectSchedule,applySchedule,verifySchedule} from '../scripts/ops/clan-wed-sat-sun-20261025.mjs';
import {reconcileClanDraft} from '../functions/_clan.js';
const at=s=>Date.parse(s+'+09:00');
async function fixture(t){const f=await clanResumeFixture(t);t.mock.method(Date,'now',f.clock);const before=await inspectResume(f.pg);await applyResume(f.pg,{now:f.clock(),expectedReviewHash:before.reviewHash,dryRun:false,random:()=>0});return f;}
const expected=['2026-10-28','2026-10-31','2026-11-01','2026-11-04','2026-11-07','2026-11-08','2026-11-11'].map(d=>d+'T12:00:00.000Z');
async function snapshot(db){const out={};for(const table of ['app_meta','admin_logs','clan_seasons','clan_wars','clan_members','clan_season_teams','clan_weekly_availability','organization_faction_state_v1','organization_members_v1','users','user_messages'])out[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1')).rows;return out;}

test('28 existing matches move to seven Wed/Sat/Sun rounds from October 28; unrelated state and replay remain intact',async t=>{
 const f=await fixture(t),plan=await inspectSchedule(f.pg),old=await snapshot(f.pg),options={now:f.clock(),expectedReviewHash:plan.reviewHash};
 assert.deepEqual([...new Set(plan.plan.wars.map(w=>w.starts_at))],expected);
 const dry=await applySchedule(f.pg,options);assert(dry.verified&&dry.receipt.protectedUnchanged);assert.deepEqual(await snapshot(f.pg),old);
 for(const match of ['UPDATE clan_wars w','UPDATE clan_seasons SET','UPDATE app_meta SET','UPDATE organization_faction_state_v1 SET','INSERT INTO admin_logs','INSERT INTO app_meta']){
  await assert.rejects(applySchedule({query:(sql,args)=>{if(sql.includes(match))throw Error('INJECTED');return f.pg.query(sql,args);}},{...options,dryRun:false}),/INJECTED/);assert.deepEqual(await snapshot(f.pg),old);
 }
 const r=await applySchedule(f.pg,{...options,dryRun:false});assert.equal(r.warCount,28);assert.deepEqual(r.roundStarts,expected);assert.equal(r.endsAt,'2026-11-11T13:00:00.000Z');
 const after=await snapshot(f.pg);for(const table of ['clan_members','clan_season_teams','clan_weekly_availability','organization_members_v1','users','user_messages'])assert.deepEqual(after[table],old[table]);
 const replay=await applySchedule({query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}});assert(replay.replayed);assert.deepEqual(await snapshot(f.pg),after);
 assert((await verifySchedule(f.pg)).verified);
});

test('changed plans or started matches cannot be rescheduled; partial updates roll back',async t=>{
 const f=await fixture(t),plan=await inspectSchedule(f.pg),options={now:f.clock(),dryRun:false,expectedReviewHash:plan.reviewHash};
 await f.pg.query("UPDATE clan_wars SET status='ACTIVE' WHERE id=(SELECT MIN(id) FROM clan_wars WHERE season_id=$1)",[plan.before.resumption.seasonId]);
 const changed=await snapshot(f.pg);await assert.rejects(applySchedule(f.pg,options),/Schedule changed/);assert.deepEqual(await snapshot(f.pg),changed);
 const fresh=await inspectSchedule(f.pg);await assert.rejects(applySchedule(f.pg,{...options,expectedReviewHash:fresh.reviewHash}));assert.deepEqual(await snapshot(f.pg),changed);
 await f.pg.query("UPDATE clan_wars SET status='SCHEDULED' WHERE season_id=$1",[plan.before.resumption.seasonId]);
 await f.pg.exec("CREATE FUNCTION skip_schedule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.round_no=1 AND NEW.clan_a_id=1 THEN RETURN NULL; END IF; RETURN NEW; END; $$; CREATE TRIGGER skip_one BEFORE UPDATE ON clan_wars FOR EACH ROW EXECUTE FUNCTION skip_schedule();");
 const partial=await snapshot(f.pg),review=await inspectSchedule(f.pg);await assert.rejects(applySchedule(f.pg,{...options,expectedReviewHash:review.reviewHash}));assert.deepEqual(await snapshot(f.pg),partial);
});

test('real overview, availability, scheduler and entry agree; Sunday saves and removed Tuesday/Thursday reject',async t=>{
 const f=await fixture(t),plan=await inspectSchedule(f.pg);await applySchedule(f.pg,{now:f.clock(),expectedReviewHash:plan.reviewHash,dryRun:false});
 const view=await f.call('clan/overview',{regular:true});assert.equal(view.status,200);assert.deepEqual(view.data.rules.openDays,[3,6,0]);assert.match(view.data.restoration.message,/수·토·일 21:00~22:00/);
 assert.deepEqual(view.data.reform.days.map(d=>d.day),[3,6,0]);assert.equal(view.data.war.startsAt,expected[0]);
 const body={weekStart:view.data.reform.weekStart,days:[3,6,0]};const saved=await f.call('clan/war/availability',{regular:true,body});assert.equal(saved.status,200,JSON.stringify(saved));assert.deepEqual(saved.data.days,[0,3,6]);
 for(const day of [2,4]){const rejected=await f.call('clan/war/availability',{regular:true,body:{...body,days:[day]}});assert.equal(rejected.status,400);assert.match(rejected.data.error,/수·토·일/);}
 await f.pg.query('UPDATE clan_weekly_availability SET days_json=$1 WHERE user_id=2',[JSON.stringify([2,3,4,6])]);
 const filtered=await f.call('clan/overview',{regular:true});assert.deepEqual(filtered.data.reform.myDays,[3,6]);
 assert.equal((await f.pg.query('SELECT days_json FROM clan_weekly_availability WHERE user_id=2')).rows[0].days_json,'[2,3,4,6]');
 f.advance(at('2026-10-27T21:00:00')-f.clock());assert.equal((await reconcileClanDraft(f.env)).nextCheckAt,expected[0]);
 const action={warId:view.data.war.id,requestId:crypto.randomUUID(),kind:'assault'};
 assert.equal((await f.call('clan/war/field',{regular:true,body:action})).status,409);
 f.advance(at('2026-10-28T21:00:00')-f.clock());await reconcileClanDraft(f.env);
 const battle=await f.call('clan/war/field',{regular:true,body:action});assert.equal(battle.status,200,JSON.stringify(battle));assert.equal(battle.data.points,3);
});
