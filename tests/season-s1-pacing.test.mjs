import test from 'node:test';
import assert from 'node:assert/strict';
import {applyEvent,craftItem,emptyAccount,exchangeMaterial,kstDay,publicSeason} from '../shared/season-s1.mjs';
import {seasonAwardStatements,seasonAccount,seasonStatus} from '../functions/_season_s1.js';
import {seasonFixture} from './helpers/season-s1-db.mjs';

const D=86400000,start=Date.parse('2026-11-01T00:00:00+09:00'),at=day=>start+(day-1)*D+12*3600000;
const settings={PVE:{start},PVP:{start}},view=(s,clock)=>publicSeason(s,settings,clock);
const play=(s,source,clock)=>applyEvent(s,{source,won:source==='RAID',score:0},settings,clock);
const core=(s,clock)=>craftItem(s,{recipeId:'COMMON_CORE'},settings,clock);
const title=(s,clock)=>craftItem(s,{recipeId:'COMMON_TITLE'},settings,clock);

test('a new account in week four cannot rush by alternating modes; limits reset at Korean midnight, not with elapsed time or a login',()=>{
 const before=start+24*D-1,after=before+1;let s=emptyAccount();
 for(let i=0;i<120;i++){s=play(s,'RAID',before).state;s=play(s,'PVP',before).state;}
 const r=view(s,before);assert.equal(r.common.owned,0);assert.equal(r.common.activities,4);assert.equal(r.common.pacing.playDays,1);
 for(const mode of ['PVE','PVP']){assert.deepEqual(r.tracks[mode].today,{events:10,xp:175,dust:70});assert(r.tracks[mode].level<10);}
 assert.throws(()=>core(s,before),/레벨|참여/);assert.throws(()=>title(s,before),/레벨|참여/);
 // Abundant old materials and XP alone cannot override the play-day gates.
 const stocked=structuredClone(s);stocked.tracks.PVE.participation=3500;stocked.tracks.PVE.achievementXp=1400;
 stocked.tracks.PVE.materials.PVE_DUST=999;stocked.tracks.PVE.materials.PVE_TOKEN=5;
 assert.throws(()=>core(stocked,before),/참여 3일/);assert.throws(()=>title(stocked,before),/참여 20일/);
 assert.equal(kstDay(after)-kstDay(before),1);
 const reset=view(s,after);assert.equal(reset.common.pacing.today,0);assert.equal(reset.common.pacing.playDays,1);assert.equal(reset.tracks.PVE.today.xp,0);
 const invalid=applyEvent(s,{source:'PVP',startedAt:after+1},settings,after);assert.equal(invalid.award,null);assert.equal(view(invalid.state,after).common.pacing.playDays,1);
 const ended=applyEvent(s,{source:'PVP',startedAt:before},settings,after);assert.equal(ended.award.runeCredit,true);
 assert.deepEqual([view(ended.state,after).common.pacing.playDays,view(ended.state,after).common.activities],[2,5]);
});

test('both modes can finance each direct copy on its own 3/8/13/18/23-day gate; the matching auto milestone never pays twice',()=>{
 let s=emptyAccount();const grants=[],crafts=[],automatic=[5,10,15,20,25],available=[3,8,13,18,23];
 for(let day=1;day<=25;day++){
  const clock=at(day);
  for(let i=0;i<10;i++)for(const source of ['PVP','RAID']){const result=play(s,source,clock);s=result.state;if(result.award?.runes.length)grants.push(day);}
  const c=view(s,clock).common;
  if(available.includes(day)){
   if(!c.balances.TOKEN)s=exchangeMaterial(s,{code:'HONOR_CRYSTAL'},settings,clock).state;
   const count=view(s,clock).common.owned;const result=core(s,clock);s=result.state;
   assert.equal(view(s,clock).common.owned,count+1);crafts.push(day);
  }else if(c.owned<5){assert.throws(()=>core(s,clock),/참여|레벨/);}
  if(automatic.includes(day)){assert.equal(s.common.cycles,automatic.indexOf(day)+1);assert.equal(view(s,clock).common.owned,s.common.cycles);}
 }
 assert.deepEqual(crafts,available);assert.deepEqual(grants,[]);assert.equal(view(s,at(25)).common.activities,100);
 assert.throws(()=>core(s,at(25)),/한도/);
});
test('four free runes then one forged reaches five on participation day 23; skipped dates and switching modes do not advance the count',()=>{
 let s=emptyAccount();
 for(let i=1;i<=23;i++){
  const day=i+(i>=12?2:0),clock=at(day),source=i%2?'RAID':'PVP';
  for(let j=0;j<4;j++)s=play(s,source,clock).state;
  const c=view(s,clock).common;
  assert.equal(c.owned,Math.floor(i/5));assert.equal(c.pacing.playDays,i);
  if(i===21||i===22)assert.throws(()=>core(s,clock),/참여 23일/);
  if(i===23)s=core(s,clock).state;
 }
 assert.equal(view(s,at(25)).common.owned,5);assert.equal(view(s,at(25)).common.activities,92);
});
test('twenty nonconsecutive days can earn the title without attendance streaks or special content',()=>{
 let s=emptyAccount();
 for(const day of [1,2,3,4,5,8,9,10,11,12,15,16,17,18,19,22,23,24,25,26]){
  for(let i=0;i<9;i++)s=play(s,'HUNT',at(day)).state;
  if(day===25){assert.equal(view(s,at(day)).tracks.PVE.playDays,19);assert.throws(()=>title(s,at(day)),/레벨|참여/);}
 }
 const c=view(s,at(26));assert.equal(c.tracks.PVE.playDays,20);assert.equal(c.tracks.PVE.level,50);assert.equal(title(s,at(26)).reward.code,'COMMON_S1_TITLE');
});

test('the level, 20 played days and day 24 must belong to the same available mode; grace permits crafting but never accrues days',()=>{
 let s=emptyAccount();for(let day=1;day<=20;day++)s=play(s,'PVP',at(day)).state;
 s.tracks.PVE.participation=3500;s.tracks.PVE.achievementXp=1400;s.tracks.PVE.materials.PVE_DUST=101;
 assert.throws(()=>title(s,at(24)),/참여 20일/);
 for(let day=1;day<=20;day++)s=play(s,'HUNT',at(day)).state;
 assert.throws(()=>title(s,at(23)),/24일차/);
 assert.equal(view(s,at(24)).common.pacing.playDays,20);assert.equal(title(s,at(24)).state.tracks.PVE.materials.PVE_DUST,s.tracks.PVE.materials.PVE_DUST-100);
 assert.equal(play(s,'HUNT',at(31)).award,null);assert.equal(view(s,at(31)).tracks.PVE.playDays,20);assert.equal(title(s,at(37)).reward.code,'COMMON_S1_TITLE');assert.throws(()=>title(s,at(38)),/기간/);
});

for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(label+': capped settlement retains the original content reward and cannot recycle its ID after midnight',async t=>{
  const f=await seasonFixture(t,{postgres}),before=f.start+5*D-1,after=before+1;f.setClock(before);
  for(let i=0;i<10;i++)await f.award('RAID');
  const e={userId:4242,eventId:'capped-ID',source:'RAID',won:true,startedAt:before-1000};
  const account=await seasonAccount(f.env,4242);
  const held=await seasonAwardStatements(f.env,e,{guard:'1=0'});await f.DB.batch(held);
  const writes=await seasonAwardStatements(f.env,e);assert.equal(writes.award,undefined);
  await f.DB.batch([f.DB.prepare('INSERT INTO content_rewards(id) VALUES(?)').bind(e.eventId),...writes]);
  f.setClock(after);assert.equal((await seasonAwardStatements(f.env,e)).length,0);
  assert.deepEqual(await seasonAccount(f.env,4242),account);
  assert.equal(Number((await f.DB.prepare('SELECT paid FROM content_rewards WHERE id=?').bind(e.eventId).first()).paid),1);
  const next=await f.award('RAID',{startedAt:before-10});assert.equal(next.award.xp,75);
  const status=await seasonStatus(f.env,4242);assert.equal(status.common.activities,5);assert.equal(status.tracks.PVE.playDays,2);
 });
 test(label+': dated legacy receipts reconstruct true KST activity without inventing dates or writing on read',async t=>{
  const f=await seasonFixture(t,{postgres}),uid=4242,clock=f.start+4*D;
  f.setClock(clock-1);await f.award('HUNT');await f.award('PVP',{won:false});
  f.setClock(clock);await f.award('RAID');
  f.setClock(clock+7*3600000);await f.award('HUNT');
  f.setClock(clock+11*3600000);await f.award('PVP',{won:false}); // same KST date on opposite sides of UTC midnight
  const getRow=()=>f.DB.prepare('SELECT revision,state_json FROM season_s1_accounts WHERE user_id=?').bind(uid).first();
  const original=await getRow(),legacy=JSON.parse(original.state_json);legacy.schemaVersion=2;
  delete legacy.tracks.PVE.days;delete legacy.tracks.PVP.days;legacy.common.activities=80;
  await f.DB.prepare('UPDATE season_s1_accounts SET state_json=? WHERE user_id=?').bind(JSON.stringify(legacy),uid).run();
  const before=await getRow(),status=await seasonStatus(f.env,uid);
  assert.equal(status.common.activities,80);assert.equal(status.common.owned,0);assert.equal(status.common.pacing.playDays,2);
  assert.equal(status.tracks.PVE.playDays,2);assert.equal(status.tracks.PVP.playDays,2);
  assert.deepEqual(status.tracks.PVE.today,{events:2,xp:95,dust:38});assert.equal(status.common.pacing.today,3);
  assert.deepEqual(await getRow(),before);
  await f.award('HUNT');const saved=await getRow();assert.equal(JSON.parse(saved.state_json).schemaVersion,3);
  assert.equal(Number(saved.revision),Number(original.revision)+1);assert.equal((await seasonStatus(f.env,uid)).common.owned,0);
 });
}
