import test from 'node:test';
import assert from 'node:assert/strict';
import {createLichRoom,addLichMember,setLichLoadout,startLichRoom,tickLichRoom,actLichRoom,lichView} from '../functions/_raid_lich_king.js';
import {REVIEW_DECK,REVIEW_BOSS} from '../preview/lich-king-raid-v1/fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';

function encounter(size=6){
 const room=createLichRoom({id:'FEEDBACK',hostId:'1',mode:'PARTY',rulesVersion:2,cards:REVIEW_DECK,monster:REVIEW_BOSS,now:1000,seed:31});
 for(let i=1;i<=size;i++){addLichMember(room,{id:String(i),name:'공대원 '+i,role:['ASSAULT','WARDEN','RESCUE'][(i-1)%3]});setLichLoadout(room,String(i),accountDeck((i-1)%3+1),'공대원 '+i);}
 startLichRoom(room,'1',room.clock);tickLichRoom(room,room.startedAt);
 let serial=0;
 const get=(id,action)=>lichView(room,String(id)).controls.find(c=>c.action===action);
 const act=(id,action,target)=>{const c=get(id,action);assert.ok(c);return actLichRoom(room,String(id),{requestId:'feedback_'+(++serial),challengeId:room.challenge.id,action,stepToken:c.token,target:target??c.rune??(c.reverse?[...c.sequence].reverse():c.sequence)?.[c.index]??''},room.clock);};
 return {room,get,act,tick:ms=>tickLichRoom(room,room.clock+ms)};
}

test('new prison inputs stay locked through shelter; early requests cause no damage or penalty, then unlock at absorption',()=>{
 const h=encounter();h.room.round=1;h.room.step='TRANSITION';h.room.challenge.deadline=h.room.clock;h.tick(0);
 for(const id of ['2','5'])for(let i=0;i<3;i++)h.act(id,'SEAL');
 const before=h.room.fighters.map(f=>f.hp);
 assert.equal(h.get('1','SHATTER').blocked,true);assert.throws(()=>h.act('1','SHATTER'),/엄폐/);
 assert.equal(h.room.doom,0);assert.deepEqual(h.room.fighters.map(f=>f.hp),before);
 h.tick(7999);assert.equal(h.get('1','SHATTER').blocked,true);
 h.tick(1);assert.equal(h.get('1','SHATTER').blocked,false);
 h.act('1','SHATTER');h.act('4','SHATTER');assert.equal(h.room.challenge.prisonBroken,true);assert.equal(h.room.doom,0);
});

test('overpowered first strike cannot finish a stage; burst matters and leaving cannot increase the fixed attack share',()=>{
 const h=encounter();h.room.step='EXPOSED';h.room.challenge.deadline=h.room.clock+11000;h.room.boss.hp=h.room.boss.maxHp=100000;
 const legacy=structuredClone(h.room);delete legacy.combatRevision;
 const start=h.room.boss.hp;h.act('1','STRIKE');const normal=start-h.room.boss.hp;
 assert.equal(h.room.step,'EXPOSED');assert.ok(normal>0&&normal<15000/6);
 const burstStart=h.room.boss.hp;h.act('2','BURST');const burst=burstStart-h.room.boss.hp;
 assert.ok(burst>normal*1.7);assert.equal(h.room.personalBurst['2'],1);
 h.room.members=h.room.members.filter(m=>m.id!=='6');h.tick(1400);
 const leaveStart=h.room.boss.hp;h.act('1','STRIKE');assert.equal(leaveStart-h.room.boss.hp,normal);
 const c=lichView(legacy,'1').controls.find(c=>c.action==='STRIKE');
 actLichRoom(legacy,'1',{requestId:'legacy_feedback_1',challengeId:legacy.challenge.id,action:'STRIKE',stepToken:c.token,target:''},legacy.clock);
 assert.equal(legacy.step,'TRANSITION','already-created encounters retain their damage rules');
});

test('a single strong player cannot carry the attack window; coordinated attacks still finish it',()=>{
 for(const size of [3,6]){
  const h=encounter(size);h.room.step='EXPOSED';h.room.challenge.deadline=h.room.clock+11000;h.room.boss.hp=h.room.boss.maxHp=100000;
  for(let i=0;i<8;i++){h.act('1','STRIKE');if(i<7)h.tick(1400);}
  assert.equal(h.room.step,'EXPOSED');
  h.tick(1200);assert.equal(h.room.failure.code,'DPS_CHECK');
  const team=encounter(size);team.room.step='EXPOSED';team.room.challenge.deadline=team.room.clock+11000;team.room.boss.hp=team.room.boss.maxHp=100000;
  for(let i=0;i<3;i++){
   for(const id of team.room.members.map(m=>m.id)){if(team.room.step!=='EXPOSED')break;team.act(id,'STRIKE');}
   if(team.room.step==='EXPOSED')team.tick(1400);
  }
  assert.equal(team.room.step,'TRANSITION');
 }
});

test('failure identifies personal wrong rune and unfinished seal instead of blaming an unavailable chain',()=>{
 const h=encounter();const expected=h.get('2','SEAL').sequence[0];h.act('2','SEAL','잘못된 문양');
 assert.match(h.room.lastMistake.label,new RegExp('공대원 2.*'+expected));assert.equal(h.room.lastMistake.memberId,'2');
 h.room.round=1;h.room.step='TRANSITION';h.room.challenge.deadline=h.room.clock;h.tick(0);h.tick(14000);
 assert.equal(h.room.failure.code,'PRISON_CRUSH');assert.match(h.room.failure.reason,/공대원 2 봉인/);
});
