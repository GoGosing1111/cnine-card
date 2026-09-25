import test from 'node:test';
import assert from 'node:assert/strict';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {prepareDuoAutomation,reconcileDuoSeason,readDuoHonors} from '../functions/_ranked_duo_seasons.js';
import {duoAutomaticConfig,duoTiers,resolveDuoTier} from '../shared/ranked-duo-season-v2.mjs';
import {duoEnergy,validateDuoConfig} from '../shared/ranked-duo-v1.mjs';
import {duoLifecycle} from '../functions/_ranked_duo.js';
import {runDuoSchedule,handleDuoAlarm} from '../workers/clan-draft/src/duo-schedule.js';
const day=86400000;
async function fixture(t,options={}){
 const f=await duoFixture(t,options);
 const settings={enabled:true,seasonName:'시즌 99',startsAt:new Date(f.clock()).toISOString().replace('T',' ').slice(0,19),endsAt:new Date(f.clock()+5*day).toISOString().replace('T',' ').slice(0,19),energy:{maxEnergy:5,rechargeMinutes:30,costPerBattle:1},initialScore:1000,winScore:24,loseScore:16,...duoTiers()};
 await prepareDuoAutomation(f.env);
 const tick=()=>reconcileDuoSeason(f.env,{settings,deps:f.deps,now:f.clock()});
 return {...f,settings,tick,season:()=>duoLifecycle.currentSeason(f.env),
  async active(users=[2,3,4,5]){
   await tick();for(const user of users){const r=await f.call('ranked-duo/join',{user,method:'POST'});assert.equal(r.status,200,JSON.stringify(r));}
   f.advance(day);for(let i=0;i<10;i++){await tick();if((await duoLifecycle.currentSeason(f.env)).status==='ACTIVE')return;}
   throw Error('automatic start did not complete');
  }
 };
}
test('24-hour registration uses ranked UTC dates, matching names/tiers and independent timed energy',()=>{
 const now=Date.parse('2026-09-25T00:00:00Z'),settings={seasonName:'시즌 12',startsAt:'2026-09-25 00:00:00',endsAt:'2026-09-30 00:00:00',energy:{maxEnergy:7,costPerBattle:2,rechargeMinutes:20}};
 const c=validateDuoConfig(duoAutomaticConfig(settings,now));
 assert.equal(c.name,'랭크 듀오 시즌 12');assert.equal(c.startsAt,'2026-09-26T00:00:00.000Z');assert.equal(c.endsAt,'2026-09-30T00:00:00.000Z');
 assert.equal(duoAutomaticConfig(settings,now-day),null);assert.equal(duoAutomaticConfig(settings,now+4*day),null);
 assert.deepEqual(c.tiers.map(t=>t.name),['브론즈','실버','골드','플래티넘','다이아','마스터','그랜드마스터']);
 assert.equal(resolveDuoTier(50000,c,11).name,'그랜드마스터');assert.equal(resolveDuoTier(1,c,10).name,'챌린저');
 assert.equal(duoEnergy(null,c,now).current,7);
 const e={energy:2,energy_day:new Date(now).toISOString()};
 assert.equal(duoEnergy(e,c,now+1199999).current,2);assert.equal(duoEnergy(e,c,now+1200000).current,3);
 assert.equal(duoEnergy(e,c,now+2500000).day,new Date(now+2400000).toISOString());
 assert.equal(duoEnergy(e,c,now+day).current,7);assert.equal(duoEnergy(e,c,now+day).nextResetAt,null);
 const zeroWin=validateDuoConfig(duoAutomaticConfig({...settings,initialScore:1000000,winScore:0,loseScore:100000},now));
 assert.equal(zeroWin.score.win,0);assert.equal(zeroWin.score.initial,1000000);
});
for(const postgres of [false,true,'pipeline'])test(`${postgres||'SQLite'} automatic recruitment, start, atomic finish and exactly one trophy per partner`,async t=>{
 const f=await fixture(t,{postgres});await f.active();
 const s=await f.season();assert.equal(s.config.competitionStartedAt,new Date(f.clock()).toISOString());
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.team.tier.id,'challenger');
 const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'});
 const fight=await f.call('ranked-duo/fight',{user:2,method:'POST',body:{requestId:'auto-duo-battle-0001',matchToken:ticket.data.token}});
 assert.equal(fight.data.status,'COMPLETED',JSON.stringify(fight));
 assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,4);
 assert.equal((await f.call('ranked-duo/status',{user:3})).data.energy.current,5);
 f.advance(30*60000);assert.equal((await f.call('ranked-duo/status',{user:2})).data.energy.current,5);
 f.advance(Date.parse(s.config.endsAt)-f.clock());
 assert.equal((await f.call('ranked-duo/match',{user:2,method:'POST'})).data.code,'DUO_NOT_ACTIVE');
 await f.tick();assert.equal((await f.season()).status,'CLOSED');
 for(const uid of [2,3,4,5])assert.equal((await readDuoHonors(f.env,uid)).count,1);
 await f.tick();assert.equal((await readDuoHonors(f.env,2)).count,1);
 const ranking=await f.call('ranked-duo/ranking',{user:2});assert.equal(ranking.data.settled,true);assert.equal(ranking.data.ranking.length,2);
 f.settings.seasonName='시즌 100';f.settings.startsAt=new Date(f.clock()).toISOString();f.settings.endsAt=new Date(f.clock()+5*day).toISOString();
 await f.tick();assert.equal((await f.season()).status,'RECRUITING');assert.notEqual((await f.season()).id,s.id);assert.equal((await readDuoHonors(f.env,2)).count,1);
});
test('an accepted battle is recovered before final positions and trophies are frozen',async t=>{
 const f=await fixture(t);await f.active();
 const ticket=await f.call('ranked-duo/match',{user:2,method:'POST'}),body={requestId:'auto-recover-00001',matchToken:ticket.data.token};
 f.fail('UPDATE ranked_duo_teams_v1 SET score');await f.call('ranked-duo/fight',{user:2,method:'POST',body});f.fail('');
 f.advance(4*day);await f.tick();assert.equal((await f.season()).status,'SETTLING');
 assert.equal((await readDuoHonors(f.env,2)).count,0);
 await f.tick();assert.equal((await f.season()).status,'CLOSED');
 assert.equal(Number((await f.p('SELECT SUM(wins) AS n FROM ranked_duo_final_v2').first()).n),1);
 const before=(await f.p('SELECT * FROM ranked_duo_final_v2 ORDER BY final_rank').all()).results;
 await f.call('ranked-duo/fight',{user:2,method:'POST',body});await f.tick();
 assert.deepEqual((await f.p('SELECT * FROM ranked_duo_final_v2 ORDER BY final_rank').all()).results,before);
});
test('failed trophy writes roll back the snapshot and safely resume',async t=>{
 const f=await fixture(t,{postgres:true});await f.active();f.advance(4*day);
 f.fail('INSERT INTO ranked_duo_trophies_v2');await assert.rejects(f.tick(),/INJECTED/);f.fail('');
 assert.equal((await f.season()).status,'SETTLING');assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_final_v2').first()).n),0);
 await f.tick();assert.equal((await readDuoHonors(f.env,2)).count,1);
});
test('concurrent scheduler delivery creates and finishes only one official season',async t=>{
 const f=await fixture(t,{postgres:true});await Promise.all([f.tick(),f.tick(),f.tick()]);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_auto_v2').first()).n),1);
 for(const user of [2,3,4,5])await f.call('ranked-duo/join',{user,method:'POST'});
 f.advance(day);for(let i=0;i<7;i++)await f.tick();f.advance(4*day);
 await Promise.all([f.tick(),f.tick(),f.tick()]);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_trophies_v2').first()).n),4);
});
test('additional recruitment preserves published teams and cannot cross the ranked end',async t=>{
 const f=await fixture(t);await f.tick();for(const user of [2,3,4,5])await f.call('ranked-duo/join',{user,method:'POST'});
 f.advance(day);for(let i=0;i<4;i++)await f.tick();
 assert.equal((await f.season()).status,'READY');
 const teams=(await f.p('SELECT id FROM ranked_duo_teams_v1 ORDER BY id').all()).results;
 assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',body:{hours:100}})).status,400);
 assert.equal((await f.call('admin/ranked-duo/recruit',{method:'POST',body:{hours:1}})).status,200);
 for(const user of [6,7])await f.call('ranked-duo/join',{user,method:'POST'});
 f.advance(3600000);for(let i=0;i<8;i++)await f.tick();
 assert.equal((await f.season()).status,'ACTIVE');
 const after=(await f.p('SELECT id FROM ranked_duo_teams_v1 ORDER BY id').all()).results;
 assert.equal(after.length,3);for(const row of teams)assert.ok(after.some(r=>r.id===row.id));
});
test('a participant who removed their deck or was suspended cannot block automatic pairing',async t=>{
 const f=await fixture(t);await f.tick();for(const user of [2,3,4,5,6,7])await f.call('ranked-duo/join',{user,method:'POST'});
 await f.p("UPDATE pvp_decks SET card_ids='[]' WHERE user_id=6").run();await f.p("UPDATE users SET status='BANNED' WHERE id=7").run();
 f.advance(day);for(let i=0;i<8;i++)await f.tick();
 assert.equal((await f.season()).status,'ACTIVE');assert.equal((await f.call('ranked-duo/status',{user:6})).data.waiting,true);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_teams_v1').first()).n),2);
});
test('fewer than two teams never starts or awards a challenger trophy',async t=>{
 const f=await fixture(t);await f.tick();for(const user of [2,3,4])await f.call('ranked-duo/join',{user,method:'POST'});
 f.advance(day);for(let i=0;i<7;i++)await f.tick();assert.equal((await f.season()).status,'READY');
 f.advance(4*day);await f.tick();assert.equal((await f.season()).status,'CLOSED');assert.equal((await readDuoHonors(f.env,2)).count,0);
});
test('ranked schedule edits extend the linked season without duplicate enrollment',async t=>{
 const f=await fixture(t);await f.active();const s=await f.season();
 f.settings.endsAt=new Date(f.clock()+7*day).toISOString();await f.tick();
 assert.equal((await f.season()).id,s.id);assert.equal((await f.season()).config.endsAt,f.settings.endsAt);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_auto_v2').first()).n),1);
});

test('shortening a ranked season past its recruitment window closes cleanly and cannot reopen the same season',async t=>{
 const f=await fixture(t);await f.tick();const id=(await f.season()).id;
 f.settings.endsAt=new Date(f.clock()+3600000).toISOString();await f.tick();
 const s=await f.season();assert.equal(s.status,'CLOSED');assert.equal(s.config.endsAt,f.settings.endsAt);assert.equal(s.config.startsAt,null);
 assert.equal((await readDuoHonors(f.env,2)).count,0);
 f.settings.endsAt=new Date(f.clock()+7*day).toISOString();await f.tick();
 assert.equal((await f.season()).id,id);assert.equal((await f.season()).status,'CLOSED');
});

test('tenth-place ties award both partners once and the eleventh team earns no trophy',async t=>{
 const f=await fixture(t);await f.active();const s=await f.season();
 await f.p('DELETE FROM ranked_duo_teams_v1 WHERE season_id=?',s.id).run();
 for(let i=0;i<11;i++){
  const a=100+i*2,b=a+1,id='boundary-'+String(i).padStart(2,'0');
  for(const user of [a,b])await f.p("INSERT INTO users(id,nickname,role,status) VALUES(?,?,'USER','ACTIVE')",user,'경계'+user).run();
  await f.p('INSERT INTO ranked_duo_teams_v1(id,season_id,user_a,user_b,seed_power,score,wins,losses,created_at) VALUES(?,?,?,?,1000,1000,0,0,?)',id,s.id,a,b,new Date(f.clock()).toISOString()).run();
 }
 f.advance(4*day);await f.tick();
 const r=await f.call('ranked-duo/ranking',{user:2});assert.equal(r.data.ranking.length,11);
 assert.equal(r.data.ranking[9].tier.id,'challenger');assert.equal(r.data.ranking[10].tier.id,'bronze');
 assert.equal((await readDuoHonors(f.env,102)).count,1);assert.equal((await readDuoHonors(f.env,103)).count,1);
 assert.equal((await readDuoHonors(f.env,100)).count,0);assert.equal((await readDuoHonors(f.env,101)).count,0);
});
test('scheduler connection and alarm recover after database failure; no player visit required',async()=>{
 let closed=0,alarm;
 const db={prepare:()=>({bind:()=>({run:async()=>{}})})},openDatabase=async()=>({db,close:async()=>closed++});
 await runDuoSchedule({},{openDatabase,reconcile:async()=>({phase:'ACTIVE'})});
 await assert.rejects(runDuoSchedule({},{openDatabase,reconcile:async()=>{throw Error('offline')}}),/offline/);assert.equal(closed,2);
 const storage={setAlarm:async value=>alarm=value};
 await assert.rejects(handleDuoAlarm(storage,{}, {now:()=>1000,run:async()=>{throw Error('offline')}}),/offline/);assert.equal(alarm,61000);
 await handleDuoAlarm(storage,{}, {now:()=>1000,run:async()=>({nextCheckAt:new Date(2000).toISOString()})});assert.equal(alarm,2000);
});

test('automatic team publication reads at most forty teams per saved chunk',async t=>{
 const f=await fixture(t);await f.tick();const s=await f.season();
 for(let i=0;i<82;i++){
  const user=100+i;await f.p("INSERT INTO users(id,nickname,role,status) VALUES(?,?,'USER','ACTIVE')",user,'묶음'+user).run();
  await f.p('INSERT INTO ranked_duo_entries_v1(season_id,user_id,seed_power,joined_at) VALUES(?,?,?,?)',s.id,user,1000+i,new Date(f.clock()).toISOString()).run();
 }
 await f.p("UPDATE ranked_duo_seasons_v1 SET status='PAIRING',pair_cursor=10000,pair_policy_revision=(SELECT revision FROM ranked_duo_policy_version_v1 WHERE id=1) WHERE id=?",s.id).run();
 await f.tick();assert.equal((await f.season()).status,'PUBLISHING');
 const chunks=(await f.p('SELECT payload_json FROM ranked_duo_pair_chunks_v2 ORDER BY offset_no').all()).results;
 assert.deepEqual(chunks.map(c=>JSON.parse(c.payload_json).length),[40,1]);
 assert.ok((await f.p('SELECT pairing_json FROM ranked_duo_seasons_v1 WHERE id=?',s.id).first()).pairing_json.length<250);
 await f.tick();assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_teams_v1').first()).n),40);
 await f.tick();assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_teams_v1').first()).n),41);
 assert.equal((await f.season()).status,'READY');assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM ranked_duo_pair_chunks_v2').first()).n),0);
});
