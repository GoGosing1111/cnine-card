import test from 'node:test';
import assert from 'node:assert/strict';
import {UserMutationLock} from '../workers/user-lock/src/index.js';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear,lichFinishingAction} from './helpers/lich-clear-fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';

async function heldAccount(h){
 const lock=new UserMutationLock({}),call=(action,body={})=>lock.fetch(new Request('https://lock/'+action,{method:'POST',body:JSON.stringify(body)})).then(r=>r.json());
 await call('acquire',{token:'previous-account-request',actionPath:'raid/lich/action',leaseMs:20000});
 h.deps.withUserMutationLock=async(_env,_id,path,work)=>{
  const token=crypto.randomUUID();
  if(!(await call('acquire',{token,actionPath:path,leaseMs:20000})).acquired)
   throw Object.assign(Error('같은 계정의 요청을 처리 중입니다. 잠시 후 다시 확인하세요.'),{code:'JOINT_LOCK_BUSY',status:409});
  try{return await work();}finally{await call('release',{token});}
 };
 return ()=>call('state');
}
async function readRoom(h,id){return JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',id)).state_json);}
async function saveRoom(h,room){await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),room.id);}

test('four valid attacks complete the final window despite a retained 20s account lock',async t=>{
 const h=await lichLiveFixture();t.after(()=>h.close());
 const deck=accountDeck(1),combat=deck.mercenary.combat;delete deck.mercenary;
 deck.mercenaries=['V-978','V-965'].map(code=>({...limitedDeploymentSnapshot(code),combat,level:21}));h.setDeck(1,deck);
 const {roomId}=await readyLichClear(h),room=await readRoom(h,roomId),now=Date.now();
 room.boss.maxHp=25714920;room.boss.hp=285722*3+114284;room.challenge.deadline=now+12000;
 await saveRoom(h,room);const lockState=await heldAccount(h);
 t.mock.timers.enable({apis:['Date'],now});
 const amounts=[];
 for(let i=0;i<4;i++){
  const body=await lichFinishingAction(h,roomId),r=await h.call('action',{body});
  assert.equal(r.status,200,JSON.stringify(r.body));amounts.push(r.body.state.bossHp);
  assert.equal(r.body.state.status,i===3?'CLEAR':'ACTIVE');
  const replay=await h.call('action',{body});assert.deepEqual(replay.body.state.bossHp,r.body.state.bossHp);
  t.mock.timers.tick(1400);
 }
 assert.deepEqual(amounts,[685728,400006,114284,0]);
 assert.equal((await lockState()).held,true,'action does not release or steal another request lock');
 assert.equal((await h.command('assign',{roomId,targetId:'1',role:'WARDEN'})).body.code,'JOINT_LOCK_BUSY','lobby commands retain account serialization');
 assert.equal((await readRoom(h,roomId)).events.filter(e=>e.type==='RESULT').length,1);
 assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs WHERE user_id=1')).n),1);
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} room CAS protects overlapping final inputs, rollback and retries without the outer account lock`,async t=>{
 const h=await lichLiveFixture({postgres});t.after(()=>h.close());
 const {roomId,body}=await readyLichClear(h),other=await lichFinishingAction(h,roomId,2),lockState=await heldAccount(h);
 h.inject('INSERT INTO coin_logs');assert.equal((await h.call('action',{body})).status,503);h.inject('');
 assert.equal((await readRoom(h,roomId)).status,'ACTIVE');
 assert.equal(Number((await h.one('SELECT COUNT(*) n FROM coin_logs')).n),0);
 assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_lich_receipts_v1 WHERE request_id=?','1:'+body.requestId)).n),0);
 const attempts=await Promise.all([h.call('action',{body}),h.call('action',{body}),h.call('action',{body:other,user:2})]);
 assert(attempts.some(r=>r.status===200),JSON.stringify(attempts));
 const replay=await h.call('action',{body});
 // If the other member won the CAS, the original uncommitted request is correctly finished.
 assert([200,409].includes(replay.status));if(replay.status===409)assert.equal(replay.body.code,'LICH_FINISHED');
 assert.equal((await readRoom(h,roomId)).events.filter(e=>e.type==='RESULT').length,1);
 const paid=await h.all('SELECT user_id,COUNT(*) n FROM coin_logs GROUP BY user_id');assert.equal(paid.length,3);assert(paid.every(r=>Number(r.n)===1));
 assert.equal((await lockState()).held,true);
 const invalid=await h.call('action',{body:{...body,requestId:h.uid()},user:4});assert.equal(invalid.status,403);assert.equal(invalid.body.code,'LICH_NOT_MEMBER');
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} overlapping clicks on one personal attack token apply damage once`,async t=>{
 const h=await lichLiveFixture({postgres});t.after(()=>h.close());
 const {roomId,body}=await readyLichClear(h),room=await readRoom(h,roomId);
 room.boss.hp=room.boss.maxHp;await saveRoom(h,room);await heldAccount(h);
 const second={...body,requestId:h.uid()};
 const results=await Promise.all([h.call('action',{body}),h.call('action',{body}),h.call('action',{body:second})]);
 assert(results.every(r=>r.status===200),JSON.stringify(results));
 const after=await readRoom(h,roomId),damage=room.boss.hp-after.boss.hp;
 assert(damage>0);assert.equal(after.status,'ACTIVE');assert.equal(after.statistics.damage-room.statistics.damage,damage);
 assert(results.every(r=>r.body.state.bossHp===after.boss.hp),'same token never applies another attack');
 assert.equal(after.challenge.inputEpochs['strike-1'],1);assert.equal(after.challenge.inputEpochs['burst-1'],1);
 assert.equal(Number((await h.one('SELECT COUNT(*) n FROM raid_lich_receipts_v1 WHERE request_id IN (?,?)','1:'+body.requestId,'1:'+second.requestId)).n),2);
});
