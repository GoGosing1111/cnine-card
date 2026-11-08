import test from 'node:test';import assert from 'node:assert/strict';
import {emptyAccount,seasonState,applyEvent,craftItem,convertExpired,levelOf,schedule,publicSeason,exchangeMaterial} from '../shared/season-s1.mjs';
import {RUNE_TYPE,runeCopies,socketRune,itemRuneBonus} from '../shared/character-runes.mjs';
import {seasonFixture} from './helpers/season-s1-db.mjs';
import {seasonAwardStatements,seasonAccount,seasonMutation,seasonStatus,handleSeasonS1,S1_OPENING_KEY} from '../functions/_season_s1.js';
import {applySeasonFighterBonus} from '../shared/season-s1-combat.mjs';
const user={id:4242},req=(recipeId,extra={})=>({requestId:crypto.randomUUID(),recipeId,...extra});
const D=86400000,start=Date.parse('2026-11-01T00:00:00+09:00'),settings={PVE:{start},PVP:{start:start+2*D}},now=start+25*D;
const play=(s,source,extra={},at=now)=>applyEvent(s,{source,won:false,...extra},settings,at);
for(const postgres of [false,true])test('live opening starts both tracks on the recorded server instant and observes the crafting grace period ('+(postgres?'PostgreSQL':'SQLite')+')',async t=>{
 const {env}=await seasonFixture(t,{postgres});
 const metaSchema='CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)';
 if(env.DB.execSchema)await env.DB.execSchema([metaSchema]);else await env.DB.prepare(metaSchema).run();
 env.SEASON_S1_SCHEDULE='live';let current=start;env.SEASON_S1_NOW=()=>current;
 assert.equal((await seasonStatus(env,user.id)).tracks.PVE.phase,'UNSCHEDULED');
 assert.deepEqual(await seasonAwardStatements(env,{userId:user.id,eventId:'before-start',source:'HUNT'}),[]);
 await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(S1_OPENING_KEY,JSON.stringify({PVE:{start},PVP:{start}})).run();
 for(const [days,phase]of [[0,'ACTIVE'],[30,'CRAFTING'],[37,'CLOSED']]){
  current=start+days*D;const status=await seasonStatus(env,user.id);
  for(const track of Object.values(status.tracks)){assert.equal(track.phase,phase);assert.equal(track.start,start);assert.equal(track.craftEnd,start+37*D);}
 }
});
test('separate schedules and cumulative limits; each single mode reaches Lv.50 and five runes without a win/tier',()=>{
 assert.equal(schedule(settings,'PVP',start+D).phase,'UPCOMING');assert.equal(schedule(settings,'PVE',start+30*D).phase,'CRAFTING');assert.equal(schedule(settings,'PVE',start+37*D).phase,'CLOSED');
 for(const source of ['PVP','HUNT']){
  const mode=source==='PVP'?'PVP':'PVE',opens=settings[mode].start,grants=[];let s=emptyAccount(),first50,firstTitle;
  for(let day=1;day<=26;day++){
   const at=opens+(day-1)*D;
   for(let i=0;i<(source==='PVP'?7:9);i++){const r=play(s,source,{score:0},at);s=r.state;if(r.award?.runes.length)grants.push(day);}
   const view=publicSeason(s,settings,at);
   if(view.tracks[mode].level===50)first50??=day;
   if(view.common.pacing.titleReady)firstTitle??=day;
   if(day===23)assert.throws(()=>craftItem(s,{recipeId:'COMMON_TITLE'},settings,at),/레벨|참여/);
   if(day===24)assert.equal(craftItem(s,{recipeId:'COMMON_TITLE'},settings,at).reward.code,'COMMON_S1_TITLE');
  }
  assert.deepEqual([first50,firstTitle,grants],[24,24,[5,10,15,20,25]]);
  const t=s.tracks[mode];assert.equal(levelOf(t),50);assert.equal(t.achievementXp,1400);assert.equal(t.participation,3500);assert.equal(t.earned[mode+'_DUST'],1200);assert.equal(t.wins,0);assert.equal(runeCopies(s).length,5);assert.equal(s.tracks[mode==='PVE'?'PVP':'PVE'].events,0);
  t.materials[mode+'_DUST']=0;assert.equal(play(s,source,{},opens+25*D).state.tracks[mode].materials[mode+'_DUST'],0);
 }
});
test('tower once from any floor, normal losses and varied activities share a cumulative 20-completion payout',()=>{
 let s=emptyAccount();const day0=start+3*D;const sources=['TOWER',...Array(5).fill('LEGION'),...Array(5).fill('COOP'),...Array(5).fill('DEFENSE'),...Array(4).fill('PVP')];
 for(const [i,source] of sources.entries()){
  const at=day0+Math.floor(i/4)*D,r=play(s,source,{floor:1,score:0},at);s=r.state;
  if(i===0){assert.deepEqual(r.award.achievements,['tower1']);assert.equal(play(s,'TOWER',{floor:90},at+D).award,null);}
  if(i===18){assert.equal(s.common.activities,19);assert.equal(runeCopies(s).length,0);}
  if(i===19)assert.equal(r.award.runes.length,1);
 }
 assert.equal(s.tracks.PVP.achievementXp,100);assert.equal(s.tracks.PVP.participation,100);assert.equal(s.tracks.PVE.counts.ALL,16);
 for(const code of ['legion5','coop5','defense5','tower1'])assert(s.tracks.PVE.achievements.includes(code));assert(!s.tracks.PVP.achievements.some(x=>x.startsWith('tier')));
});
test('invalid, abandoned and pre-season encounters earn nothing; grace stops combat grants',()=>{
 for(const extra of [{eligible:false},{startedAt:start-1},{startedAt:'invalid'}])assert.equal(play(emptyAccount(),'TOWER',extra).award,null);
 assert.equal(applyEvent(emptyAccount(),{source:'HUNT',won:true},settings,start+30*D).award,null);
});
test('common workshop spends mixed balances once; separated expiries and external limits cannot be bypassed by switching modes',()=>{
 let s=emptyAccount();for(let i=0;i<3;i++)s=play(s,'HUNT',{},now-(2-i)*D).state;s.tracks.PVE.participation=900;s.tracks.PVE.materials={PVE_DUST:130,TOWER_SIGIL:1};s.tracks.PVP.materials={PVP_DUST:90};s=exchangeMaterial(s,{code:'TOWER_SIGIL'},settings,now).state;
 const {state,reward}=craftItem(s,{recipeId:'COMMON_CORE'},settings,now);assert.equal(reward.copyId,RUNE_TYPE+':1');assert.equal(state.tracks.PVE.materials.PVE_DUST,0);assert.equal(state.tracks.PVP.materials.PVP_DUST,20);assert.equal(state.common.crafts.COMMON_CORE,1);
 assert.throws(()=>craftItem(s,{recipeId:'COMMON_CORE'},settings,start+38*D),/레벨|재료/);assert.equal(publicSeason(s,settings,start+38*D).common.balances.DUST,90);
 s.tracks.PVE.materials.PVE_DUST=400;for(let i=0;i<4;i++)s=craftItem(s,{recipeId:'COMMON_GROWTH'},settings,now).state;assert.throws(()=>craftItem(s,{recipeId:'COMMON_GROWTH'},settings,now),/한도/);
});
test('legacy ownership, placements, upgrades and XP survive migration and expiry; read migration is idempotent',()=>{
 const old=emptyAccount();old.schemaVersion=1;delete old.common;old.tracks.PVE.events=20;old.tracks.PVE.achievementXp=600;old.tracks.PVE.achievements=['tower50','tower70','tower90'];
 old.owned={S1_IMMORTAL_SEAL:{mode:'PVE',kind:'CORE',upgraded:true},S1_IMMORTAL_CREST:{mode:'PVP',kind:'CORE'}};old.itemRunes={101:'S1_IMMORTAL_SEAL',107:'S1_IMMORTAL_CREST'};
 const s=seasonState(old);assert.equal(s.tracks.PVE.achievementXp,600);assert.equal(s.tracks.PVE.counts.TOWER,1);assert.equal(runeCopies(s).length,2);assert.equal(publicSeason(s,settings,now).common.pacing.playDays,0);assert.equal(itemRuneBonus(s,'PVE',[101]).attackBp,1000);assert.deepEqual(seasonState(s),s);
 const view=publicSeason(s,settings,now,{owned:[101],equipped:[101]});assert.equal(view.runes.placements[107],undefined);const moved=socketRune(s,{instanceId:102,code:s.itemRunes[107]});assert(!moved.itemRunes[107]);
 const a=convertExpired(moved,settings,start+40*D),b=convertExpired(a.state,settings,start+41*D);assert.deepEqual(a.state,b.state);assert.equal(runeCopies(b.state).length,2);
});
test('combat bonuses capped at 50%, additive across gear, one application per battle; suits unaffected',()=>{
 const f=[{attack:10000,maxHp:10000,hp:10000},{actorKind:'BATTLE_SUIT',attack:10000,hp:10000,maxHp:10000}];applySeasonFighterBonus(f,{attackBp:9000},'PVE');applySeasonFighterBonus(f,{attackBp:5000},'PVE');assert.equal(f[0].attack,15000);assert.equal(f[1].attack,10000);assert.equal(f[0].maxHp,10000);
 const p=[{attack:100,maxHp:1000,hp:500}];applySeasonFighterBonus(p,{hpBp:4800,attackBp:4800},'PVP');assert.deepEqual([p[0].maxHp,p[0].hp,p[0].attack],[1480,740,100]);
});
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(label+': twentieth award and content receipt roll back together; retry grants one common copy',async t=>{
  const f=await seasonFixture(t,{postgres});for(let i=0;i<19;i++){f.setClock(f.start+(2+Math.floor(i/4))*D);await f.award('PVP',{won:false,score:0});}
  const event={userId:user.id,eventId:'reward-boundary',source:'LEGION',won:false};
  const commit=async()=>f.DB.batch([f.DB.prepare('INSERT INTO content_rewards(id) VALUES(?)').bind(event.eventId),...await seasonAwardStatements(f.env,event)]);
  f.setFailure('UPDATE season_s1_accounts');await assert.rejects(commit());assert.equal(await f.DB.prepare('SELECT * FROM content_rewards').first(),null);assert.equal((await seasonStatus(f.env,user.id)).common.owned,0);
  f.setFailure('');await commit();assert.equal((await seasonAwardStatements(f.env,event)).length,0);const status=await seasonStatus(f.env,user.id);assert.equal(status.common.owned,1);assert.equal(status.common.activities,20);
 });
 test(label+': external inventory craft rolls back deductions; lost response recovers original receipt',async t=>{
  const f=await seasonFixture(t,{postgres});for(let i=0;i<40;i++){f.setClock(f.start+Math.floor(i/10)*D);await f.award();}const before=await seasonAccount(f.env,user.id),body=req('COMMON_GROWTH');
  f.setFailure('INSERT INTO inventory_logs');await assert.rejects(seasonMutation(f.env,user,'craft',body));assert.deepEqual(await seasonAccount(f.env,user.id),before);
  f.setFailure('');f.afterCommit(()=>{throw Error('LOST_ACK');});assert.equal((await seasonMutation(f.env,user,'craft',body)).replayed,true);f.afterCommit(null);await seasonMutation(f.env,user,'craft',body);assert.equal(Number((await f.DB.prepare('SELECT quantity FROM cnine_user_inventory').first()).quantity),100000);
  await assert.rejects(seasonMutation(f.env,user,'craft',{...body,recipeId:'COMMON_CORE'}),/같은 요청/);
 });
 test(label+': stale concurrent awards cannot overwrite another activity; retry preserves both',async t=>{
  const f=await seasonFixture(t,{postgres}),a={userId:user.id,eventId:'a',source:'HUNT',won:true},b={...a,eventId:'b',source:'PVP',won:false};
  const wa=await seasonAwardStatements(f.env,a),wb=await seasonAwardStatements(f.env,b);await f.DB.batch(wa);await assert.rejects(f.DB.batch(wb));await f.DB.batch(await seasonAwardStatements(f.env,b));const view=await seasonStatus(f.env,user.id);assert.equal(view.common.activities,2);assert.equal(view.tracks.PVP.participation,25);
 });
}
test('production route rejects client combat grants; authentication required; default feature off',async t=>{
 const f=await seasonFixture(t),deps={json:(v,status=200)=>Response.json(v,{status}),authenticate:async()=>user,withUserMutationLock:async(_e,_u,_p,fn)=>fn()};
 assert.equal((await handleSeasonS1({path:'season/award',request:new Request('https://local/api/season/award',{method:'POST',body:'{}'}),env:f.env,deps})).status,404);
 assert.equal((await handleSeasonS1({path:'season/status',request:new Request('https://local/api/season/status'),env:f.env,deps:{...deps,authenticate:async()=>null}})).status,401);assert.equal((await seasonStatus({SEASON_S1_ENABLED:'0'},4242)).enabled,false);
});
