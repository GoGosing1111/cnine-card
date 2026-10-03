import test from 'node:test';
import assert from 'node:assert/strict';
import {createLichRoom,addLichMember,setLichLoadout,startLichRoom,tickLichRoom,actLichRoom,lichView} from '../functions/_raid_lich_king.js';
import {REVIEW_DECK,REVIEW_BOSS} from '../preview/lich-king-raid-v1/fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
const choices=a=>(a.reverse?[...a.sequence].reverse():a.sequence).slice(a.index);
function encounter(){
 const room=createLichRoom({id:'SEALBATCH',hostId:'1',mode:'PARTY',rulesVersion:2,cards:REVIEW_DECK,monster:REVIEW_BOSS,now:1000,seed:31});
 for(let i=1;i<=6;i++){addLichMember(room,{id:String(i),name:'검수 '+i,role:['ASSAULT','WARDEN','RESCUE'][(i-1)%3]});setLichLoadout(room,String(i),accountDeck((i-1)%3+1),'검수 '+i);}
 startLichRoom(room,'1',room.clock);tickLichRoom(room,room.clock+12000);let serial=0;
 const get=id=>lichView(room,id).controls.find(a=>a.action==='SEAL');
 const body=(id,targets)=>{const a=get(id);return {requestId:'batch_req_'+(++serial),challengeId:room.challenge.id,action:'SEAL',stepToken:a.token,targets:targets||choices(a)};};
 const act=(id,input)=>actLichRoom(room,id,input,room.clock);
 return {room,get,body,act};
}
test('a single submission validates forward/reverse runes, retains separate wardens, and replays only once',()=>{
 const h=encounter();h.room.challenge.seals[1].reverse=true;
 const a=h.body('2'),b=h.body('5');h.act('2',a);
 assert.deepEqual(h.room.challenge.seals.map(t=>t.index),[3,0]);assert.equal(h.room.challenge.sealed,false);
 h.act('2',a);h.act('2',{...a,requestId:'new_replay_id'});assert.equal(h.room.doom,0);
 assert.throws(()=>h.act('2',{...a,targets:[...a.targets].reverse()}),/같은 요청/);
 h.act('5',b);assert.equal(h.room.challenge.sealed,true);assert.equal(h.room.doom,0);
});
test('a wrong rune resets only its personal seal and cancels the rest of the submitted sequence',()=>{
 const h=encounter(),a=h.body('2');a.targets[1]=a.targets[0];
 h.act('2',a);assert.equal(h.room.doom,1);assert.equal(h.room.statistics.mistakes,1);
 assert.deepEqual(h.room.challenge.seals.map(t=>[t.index,t.epoch]),[[0,1],[0,0]]);
 h.act('2',a);assert.equal(h.room.doom,1);
 assert.throws(()=>h.act('2',{...a,requestId:'late_wrong_keys'}),/갱신/);assert.equal(h.room.doom,1);
 h.act('2',h.body('2'));assert.equal(h.room.challenge.seals[0].index,3);
});
test('batch input keeps role, length, current token, remaining count and link deadline validation',()=>{
 const h=encounter(),a=h.body('2');
 assert.throws(()=>h.act('5',a),/담당 기믹/);
 for(const targets of [[],['달','가시','왕관','달'],['invalid'],[1],null,'달'])assert.throws(()=>h.act('2',{...a,targets}),/봉인 문양/);
 assert.throws(()=>h.act('2',{...a,target:'달'}),/봉인 문양/);
 h.act('2',{...a,targets:a.targets.slice(0,2)});assert.equal(h.room.challenge.seals[0].index,2);
 assert.throws(()=>h.act('2',h.body('2',['달','왕관'])),/남은 봉인/);assert.equal(h.room.challenge.seals[0].index,2);
 h.act('2',h.body('2'));const old=h.body('5');
 tickLichRoom(h.room,h.room.challenge.linkDeadline);assert.equal(h.room.doom,1);
 assert.throws(()=>h.act('5',old),/갱신/);assert.deepEqual(h.room.challenge.seals.map(t=>t.index),[0,0]);
});
test('HTTP batch commits all runes and its receipt atomically, supports retries and old single-rune clients',async t=>{
 const h=await lichLiveFixture({postgres:true});t.after(()=>h.close());const roomId=await h.party();
 for(const id of [1,2,3])await h.command('ready',{roomId,ready:true},id);await h.command('start',{roomId});
 const read=async()=>JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
 const raw=await read();raw.clock=Date.now()-1;raw.challenge.deadline=raw.clock;
 await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(raw),roomId);
 let state=(await h.call('status?roomId='+roomId,{user:2})).body.state,a=state.controls.find(a=>a.action==='SEAL');
 const single=await h.command('action',{roomId,challengeId:state.challenge.id,action:'SEAL',stepToken:a.token,target:choices(a)[0]},2);
 assert.equal(single.status,200);state=single.body.state;a=state.controls.find(a=>a.action==='SEAL');assert.equal(a.index,1);
 const body={requestId:h.uid(),roomId,challengeId:state.challenge.id,action:'SEAL',stepToken:a.token,targets:choices(a)};
 h.inject('INSERT INTO raid_lich_receipts_v1');assert.equal((await h.call('action',{user:2,body})).status,503);h.inject('');
 assert.equal((await read()).challenge.seals[0].index,1);
 const replies=await Promise.all([h.call('action',{user:2,body}),h.call('action',{user:2,body})]);assert.ok(replies.every(r=>r.status===200),JSON.stringify(replies));
 assert.equal((await read()).challenge.sealed,true);assert.equal((await read()).doom,0);
 assert.equal((await h.call('action',{user:2,body:{...body,targets:[...body.targets].reverse()}})).status,409);
 assert.equal(Number((await h.one("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='LICH_KING_ENTRY_TICKET'")).quantity),4);
});
