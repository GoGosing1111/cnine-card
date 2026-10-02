import test from 'node:test';
import assert from 'node:assert/strict';
import {createLichRoom,addLichMember,setLichLoadout,startLichRoom,tickLichRoom,actLichRoom,lichView,removeLichLoadout} from '../functions/_raid_lich_king.js';
import {reconcileCoopDuties} from '../functions/_raid_lich_coop.js';
import {REVIEW_DECK,REVIEW_BOSS} from '../preview/lich-king-raid-v1/fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';

function encounter(size=6,seed=31,weak=false){
 const room=createLichRoom({id:'COOPTEST',hostId:'1',mode:'PARTY',rulesVersion:2,cards:REVIEW_DECK,monster:REVIEW_BOSS,now:1000,seed});
 for(let i=1;i<=size;i++){
  addLichMember(room,{id:String(i),name:'검수 '+i,role:['ASSAULT','WARDEN','RESCUE'][(i-1)%3]});
  const deck=weak?{cards:REVIEW_DECK.map(c=>({...c,power:10})),ids:REVIEW_DECK.map(c=>c.id)}:accountDeck((i-1)%3+1);
  setLichLoadout(room,String(i),deck,'검수 '+i);
 }
 let n=0;
 const view=id=>lichView(room,String(id));
 const act=(id,a,target,extra={})=>{
  assert.ok(a,'expected action');
  const expected=a.action==='SEAL'?(a.reverse?[...a.sequence].reverse():a.sequence)[a.index]:a.rune||a.target||'';
  return actLichRoom(room,String(id),{requestId:'coop_req_'+(++n),challengeId:room.challenge.id,action:a.action,stepToken:a.token,target:target??expected,...extra},room.clock);
 };
 const get=(id,action)=>view(id).controls.find(c=>c.action===action);
 const tick=ms=>tickLichRoom(room,room.clock+ms);
 startLichRoom(room,'1',room.clock);tick(12000);
 return {room,act,get,view,tick};
}
function seals(h){for(const m of h.room.members)while(h.get(m.id,'SEAL')&&!h.get(m.id,'SEAL').blocked)h.act(m.id,h.get(m.id,'SEAL'));}
function solve(h,{heal=true,skip=null}={}){
 for(let guard=0;h.room.status==='ACTIVE'&&guard<3000;guard++){
  if(h.room.step==='TRANSITION'){h.tick(3000);continue;}
  for(const m of h.room.members){
   if(h.room.status!=='ACTIVE'||h.room.step==='TRANSITION')break;
   const actions=h.view(m.id).controls;
   for(const a of actions){
    if(skip?.(m,a)||a.blocked||a.startsAt>h.room.clock||a.deadline&&a.deadline<=h.room.clock)continue;
    if(a.action==='HEAL'){
     if(!heal||!h.room.fighters.some(f=>f.hp>0&&f.hp/f.maxHp<.53))continue;
    }else if(a.action==='REVIVE'||a.action==='BURST')continue;
    if(a.action==='SHATTER'&&!h.room.challenge.breathResolved)continue;
    h.act(m.id,a);
    break;
   }
  }
  if(h.room.status==='ACTIVE')h.tick(350);
 }
 return h.room;
}

test('3, 4, 5 and 6 participants can clear all seven cooperative rounds with healing',()=>{
 for(const size of [3,4,5,6])for(const seed of [31,44]){
  const h=encounter(size,seed);solve(h);
  assert.equal(h.room.status,'CLEAR',JSON.stringify({size,seed,failure:h.room.failure,challenge:h.room.challenge,hp:h.room.fighters.map(f=>f.hp/f.maxHp)}));
  assert.equal(h.room.statistics.interrupts,7);assert.ok(h.room.resources.heal<4);assert.equal(h.room.resources.cleanse,0);
 }
});
test('two wardens solve separate input sequences; duplicate and delayed step inputs never advance or penalize the next step',()=>{
 const h=encounter();const a=h.get('2','SEAL'),b=h.get('5','SEAL');
 h.act('2',a);h.act('5',b);assert.deepEqual(h.room.challenge.seals.map(t=>t.index),[1,1]);
 const before=structuredClone(h.room.challenge.seals);h.act('2',a);assert.deepEqual(h.room.challenge.seals,before);assert.equal(h.room.doom,0);
 assert.throws(()=>h.act('5',h.get('2','SEAL')),/담당 기믹/);assert.equal(h.room.doom,0);
 h.act('2',h.get('2','SEAL'),'invalid');assert.equal(h.room.doom,1);assert.equal(h.room.challenge.seals[0].index,0);
});
test('both wardens must link; late linking resets personal slots with fresh tokens',()=>{
 const h=encounter();for(let i=0;i<3;i++)h.act('2',h.get('2','SEAL'));
 assert.equal(h.room.challenge.sealed,false);const old=h.get('5','SEAL');h.tick(7000);
 assert.equal(h.room.doom,1);assert.deepEqual(h.room.challenge.seals.map(t=>t.index),[0,0]);
 assert.notEqual(h.get('5','SEAL').token,old.token);assert.throws(()=>h.act('5',old),/갱신/);
});
test('legacy encounter prison waits for manual chains; early break still harms existing fights',()=>{
 for(const early of [false,true]){
  const h=encounter();h.room.combatRevision=1;h.room.round=1;h.room.step='TRANSITION';h.room.challenge.deadline=h.room.clock;h.tick(0);seals(h);
  if(early){h.act('1',h.get('1','SHATTER'));assert.equal(h.room.doom,1);}
  h.tick(8000);assert.equal(h.room.challenge.prison,true);assert.equal(h.room.challenge.breathResolved,true);
  if(early)assert.ok(h.room.fighters.every(f=>f.hp/f.maxHp<.4));
  h.tick(6000);assert.equal(h.room.failure.code,'PRISON_CRUSH');
 }
});
test('seals gate chains, chains gate plague and souls, and the assigned interrupt rotates',()=>{
 const h=encounter();assert.throws(()=>h.act('1',h.get('1','SHATTER')),/결계/);
 assert.equal(h.get('3','TRANSFER').blocked,true);seals(h);
 h.act('1',h.get('1','SHATTER'));assert.equal(h.room.challenge.prisonBroken,false);
 h.act('4',h.get('4','SHATTER'));assert.equal(h.room.challenge.prisonBroken,true);
 assert.equal(h.get('3','TRANSFER').blocked,false);assert.equal(h.get('6','RESCUE').blocked,false);
 assert.equal(h.room.challenge.interruptOwner,'2');
 h.room.step='TRANSITION';h.room.challenge.deadline=h.room.clock;h.tick(0);assert.equal(h.room.challenge.interruptOwner,'5');
});
test('each attack uses only the sender deck and has independent cooldown and burst charges',()=>{
 const h=encounter();h.room.step='EXPOSED';h.room.challenge.deadline=h.room.clock+11000;h.room.boss.hp=h.room.boss.maxHp=100000000;
 const before=h.room.eventSeq,otherHp=h.room.fighters.filter(f=>f.ownerId==='2').map(f=>f.hp);
 const old=h.get('1','STRIKE');h.act('1',old);
 const hits=h.room.events.filter(e=>e.seq>before&&e.damage>0);assert.ok(hits.length);assert.ok(hits.every(e=>e.actorId.startsWith('A:OWNER:1:')));
 assert.deepEqual(h.room.fighters.filter(f=>f.ownerId==='2').map(f=>f.hp),otherHp);
 assert.throws(()=>h.act('1',h.get('1','STRIKE')),/아직/);
 const bossHp=h.room.boss.hp;h.act('1',old);assert.equal(h.room.boss.hp,bossHp);
 h.act('2',h.get('2','BURST'));assert.ok(h.room.boss.hp<bossHp);assert.equal(h.room.personalBurst['1'],2);assert.equal(h.room.personalBurst['2'],1);
});
test('mandatory survival pressure prevents no-heal clear; weak decks fail the damage window',()=>{
 const h=encounter();solve(h,{heal:false});assert.equal(h.room.status,'FAILED');assert.equal(h.room.failure.code,'PARTY_DEAD');
 const weak=encounter(3,31,true);solve(weak);assert.equal(weak.room.status,'FAILED');assert.equal(weak.room.failure.code,'DPS_CHECK');
});
test('AFK extra warden/assault/rescue cannot be carried through the assigned obligation',()=>{
 for(const inactive of ['4','5','6']){const h=encounter();solve(h,{skip:m=>m.id===inactive});assert.equal(h.room.status,'FAILED');}
});
test('active reassignment does not remove work; departed work is inherited without extending deadlines',()=>{
 const h=encounter(),before=h.room.challenge.deadline;
 h.room.members.find(m=>m.id==='2').role='ASSAULT';reconcileCoopDuties(h.room);assert.ok(h.get('2','SEAL'));
 h.room.members=h.room.members.filter(m=>m.id!=='2');removeLichLoadout(h.room,'2');
 assert.equal(h.room.challenge.seals[0].ownerId,'5');assert.equal(h.room.challenge.deadline,before);
});
test('live concurrent personal inputs, replay and failed transaction preserve exactly one step and one ticket',async t=>{
 const h=await lichLiveFixture({postgres:true});t.after(()=>h.close());const roomId=await h.party();
 for(const user of [6,7,8])assert.equal((await h.command('join',{roomId},user)).status,200);
 for(const [targetId,role]of [['6','ASSAULT'],['7','WARDEN'],['8','RESCUE']])await h.command('assign',{roomId,targetId,role});
 for(const user of [1,2,3,6,7,8])await h.command('ready',{roomId,ready:true},user);
 await h.command('start',{roomId});
 const raw=JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
 raw.clock=Date.now()-1;raw.challenge.deadline=raw.clock;await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(raw),roomId);
 const views=await Promise.all([2,7].map(user=>h.call('status?roomId='+roomId,{user})));
 const bodies=views.map((v,i)=>{const a=v.body.state.controls.find(a=>a.action==='SEAL');return {requestId:h.uid(),roomId,challengeId:v.body.state.challenge.id,action:'SEAL',target:a.sequence[0],stepToken:a.token};});
 const results=await Promise.all(bodies.map((body,i)=>h.call('action',{user:[2,7][i],body})));assert.ok(results.every(r=>r.status===200),JSON.stringify(results));
 const state=(await h.call('status?roomId='+roomId,{user:2})).body.state;assert.deepEqual(state.challenge.seals.map(t=>t.index),[1,1]);assert.equal(state.doom,0);
 await h.call('action',{user:2,body:bodies[0]});await h.call('action',{user:2,body:{...bodies[0],requestId:h.uid()}});
 const a=state.controls.find(a=>a.action==='SEAL'),next={requestId:h.uid(),roomId,challengeId:state.challenge.id,action:'SEAL',target:a.sequence[a.index],stepToken:a.token};
 h.inject('INSERT INTO raid_lich_receipts_v1');assert.equal((await h.call('action',{user:2,body:next})).status,503);h.inject('');
 assert.equal((await h.call('status?roomId='+roomId,{user:2})).body.state.challenge.seals[0].index,1);
 assert.equal((await h.call('action',{user:2,body:next})).status,200);assert.equal((await h.call('status?roomId='+roomId,{user:2})).body.state.challenge.seals[0].index,2);
 assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='LICH_KING_ENTRY_TICKET'")).quantity),4);
});
