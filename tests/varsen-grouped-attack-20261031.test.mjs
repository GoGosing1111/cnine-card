import test from 'node:test';
import assert from 'node:assert/strict';
import {madaraStrikePackets,actMadaraRoom,madaraView} from '../functions/_raid_madara.js';
import {madaraLiveFixture} from './helpers/madara-live-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';
import {imperialArcherCandidate} from '../shared/mercenary-kangyun-v1.mjs';
import {MERCENARY_COMBAT_DRAFT} from '../shared/mercenary-combat-policy-v1.mjs';

const users=[1,2,3,6];
const damageOf=e=>Array.isArray(e.hits)?e.hits.reduce((n,h)=>n+h.damage,0):Number(e.damage||0);
async function setup(t,{postgres=false,rewards=false}={}){
 const h=await madaraLiveFixture({postgres});t.after(()=>h.close());
 await h.configure({mode:'ON',rewardsEnabled:rewards,coinReward:1000,masterStarReward:2,petEssenceReward:1});
 for(const uid of users)h.setDeck(uid,{cards:REVIEW_DECK,mercenary:imperialArcherCandidate(MERCENARY_COMBAT_DRAFT)});
 const roomId=(await h.command('create')).body.roomId;
 for(const [uid,role]of [[2,'ASSAULT'],[3,'RESCUE'],[6,'WARDEN']])assert.equal((await h.command('join',{roomId,role},uid)).status,200);
 for(const uid of users)assert.equal((await h.command('ready',{roomId,ready:true},uid)).status,200);
 assert.equal((await h.command('start',{roomId})).status,200);
 const room=JSON.parse((await h.one('SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).state_json);
 room.step='DAMAGE';room.challenge.tasks.forEach(task=>task.done=true);room.challenge.deadline=Date.now()+30000;
 room.challenge.damageBy={};room.challenge.lastStrike={};room.boss.hp=room.boss.maxHp=86551300;
 // Fast ranged skills eliminate the simulated boss before any scalar card hit.
 for(const f of room.fighters){f.speed=f.isMercenary?60000:1;f.hp=f.maxHp=4000000;if(f.isMercenary)f.attack=1251558;}
 const save=()=>h.run('UPDATE raid_madara_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
 await save();return {h,roomId,room,save};
}

test('grouped hits count once, preserve scalar hits, and exclude another actor or target',()=>{
 const source=[{id:'own',attack:100}],timeline=[
  {type:'TURN',actorId:'own',targetId:'boss',damage:70},
  {type:'SKILL',actorId:'own',damage:9999,targetId:'other',hits:[{targetId:'boss',damage:120},{targetId:'other',damage:500},{targetId:'boss',damage:80}]},
  {actorId:'foreign',targetId:'boss',damage:1000},
  {actorId:'own',targetId:'boss',damage:999,hits:[]},
  {actorId:'own',hits:[{targetId:'boss',damage:0},{targetId:'boss',damage:NaN}]}
 ];
 const before=structuredClone(timeline),packets=madaraStrikePackets(source,timeline,'boss');
 assert.deepEqual(packets.map(p=>p.damage),[70,180]);assert.equal(packets[1].hits.length,2);assert.equal(packets[1].targetId,'boss');assert.deepEqual(timeline,before);
});

test('Kangyun grouped-only strikes deal positive capped damage with exact visible HP and retry invariants',async t=>{
 const {room}=await setup(t);const input={requestId:'grouped-attack-0001',action:'STRIKE',token:room.challenge.id};
 const before=room.boss.hp,seq=room.eventSeq,view=madaraView(room,'1');
 actMadaraRoom(room,'1',input,room.clock);
 const dealt=before-room.boss.hp,events=room.events.filter(e=>e.seq>seq&&e.actorId?.includes('MERCENARY'));
 assert.ok(dealt>0);assert.ok(dealt<=Math.ceil(view.attackShare/3));assert.ok(events.some(e=>e.type==='MERCENARY_IMPERIAL_ARROW_VOLLEY'));
 assert.equal(events.reduce((sum,e)=>sum+damageOf(e),0),dealt);let hp=before;
 for(const event of events){if(event.hits)assert.equal(event.damage,undefined);for(const hit of event.hits||[event]){hp-=hit.damage;assert.equal(hit.targetHpAfter,hp);assert.equal(hit.targetMaxHp,room.boss.maxHp);assert.equal(hit.absorbed,0);}}
 assert.equal(hp,room.boss.hp);assert.equal(room.challenge.damageBy['1'],dealt);
 const saved=room.boss.hp;actMadaraRoom(room,'1',input,room.clock);assert.equal(room.boss.hp,saved);
 assert.throws(()=>actMadaraRoom(room,'1',{...input,requestId:'grouped-attack-0002'},room.clock+1199),{code:'COOLDOWN'});
 for(let n=2;n<=3;n++)actMadaraRoom(room,'1',{...input,requestId:'grouped-attack-000'+n},room.clock+1200);
 assert.equal(madaraView(room,'1').attackRemaining,0);assert.equal(room.step,'DAMAGE');
 assert.throws(()=>actMadaraRoom(room,'1',{...input,requestId:'grouped-attack-0004'},room.clock+1200),{code:'SHARE_COMPLETE'});
 assert.equal(before-room.boss.hp,view.attackShare);
});

test('four concurrent players plus state polls persist all grouped damage and cross the phase once',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const {h,roomId,room}=await setup(t);let damage=0;
 for(let round=0;round<3;round++){
  now+=1300;
  const requests=users.map(uid=>({uid,body:{roomId,requestId:`parallel-${uid}-${round}`,action:'STRIKE',token:room.challenge.id}}));
  const responses=await Promise.all([...requests.map(({uid,body})=>h.call('action',{user:uid,body})),...users.map(user=>h.call('state?roomId='+roomId,{user}))]);
  for(const r of responses)assert.equal(r.status,200,JSON.stringify(r.body));
  const saved=JSON.parse((await h.one('SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).state_json);
  assert.ok(saved.statistics.damage>damage);damage=saved.statistics.damage;
  for(const {uid,body}of requests){assert.equal((await h.call('action',{user:uid,body})).status,200);assert.ok(saved.challenge.damageBy[String(uid)]>0);}
 }
 const saved=JSON.parse((await h.one('SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).state_json);
 assert.equal(saved.step,'TRANSITION');assert.equal(saved.boss.hp,Math.round(saved.boss.maxHp*.78));
 assert.equal(Object.values(saved.challenge.damageBy).reduce((a,b)=>a+b,0),saved.boss.maxHp-saved.boss.hp);
 assert.equal(Number((await h.one("SELECT COUNT(*) n FROM raid_madara_receipts_v1 WHERE room_id=? AND kind='action'",roomId)).n),12);
 assert.equal(saved.events.filter(e=>e.type==='MADARA_PHASE_CLEAR').length,1);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} grouped final strike rolls back on reward failure and pays exactly once on retry`,async t=>{
 const {h,roomId,room,save}=await setup(t,{postgres,rewards:true});
 room.phase=4;room.boss.hp=1;room.challenge.kind='FINAL';room.challenge.tasks=[];room.challenge.damageBy={};room.challenge.lastStrike={};await save();
 const body={requestId:'grouped-final-0001',roomId,action:'STRIKE',token:room.challenge.id};
 h.inject('INSERT INTO coin_logs');assert.equal((await h.call('action',{body})).status,503);h.inject('');
 let saved=JSON.parse((await h.one('SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).state_json);
 assert.equal(saved.boss.hp,1);assert.equal(saved.status,'ACTIVE');assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),0);
 assert.equal((await h.call('action',{body})).body.state.status,'CLEAR');assert.equal((await h.call('action',{body})).body.state.status,'CLEAR');
 saved=JSON.parse((await h.one('SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id=?',roomId)).state_json);
 assert.equal(saved.boss.hp,0);assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),4);
 for(const uid of users){assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',uid)).coin),1000);assert.equal((await h.call('lobby',{user:uid})).body.weeklyReward.used,1);}
});
