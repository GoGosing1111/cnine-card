import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {planRoomRepairs,planHash,repairRooms,verifyRoomRepairs,readReceipt} from '../scripts/ops/varsen-weekly-outcomes-20261121.mjs';

test('repair restores the original combat result across a week boundary and preserves unrelated state and rewards',async t=>{
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE TABLE raid_madara_rooms_v1(room_id text PRIMARY KEY,status text,version bigint,state_json text);
    CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at timestamptz);
    CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);
    CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
    INSERT INTO users VALUES(1,'OWNER','ACTIVE');`);
  const db={query:async(s,p)=>{const result=await pg.query(s,p);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  const ended=Date.parse('2026-11-15T23:59:58+09:00'),left=ended+5000;
  const event={type:'MADARA_RESULT',code:'VICTORY',winner:'A',at:ended};
  const original={status:'CANCELLED',releaseMode:'ON',startedAt:ended-80000,finishedAt:left,initialMembers:['1','2','3'],members:[{id:'1',left:true},{id:'2',left:true},{id:'3',left:true}],events:[event],clearRewards:{1:{granted:true}},failure:null};
  const room=async(id,changes)=>{const state={...original,...changes};await pg.query("INSERT INTO raid_madara_rooms_v1 VALUES($1,$2,8,$3)",[id,state.status,JSON.stringify(state)]);};
  await room('won',{});await room('lost',{events:[{...event,code:'STRAIN',winner:'B'}],failure:{code:'STRAIN'},clearRewards:null});
  await room('left',{events:[{...event,code:'MEMBER_LEFT',winner:'B'}],failure:{code:'MEMBER_LEFT'}});
  await room('no-battle',{events:[]});await room('test',{releaseMode:'TEST'});await room('already-clear',{status:'CLEAR',finishedAt:ended});
  await room('invalid-clock',{events:[{...event,at:left+1000}]});await room('ambiguous',{events:[event,event]});
  await room('still-present',{members:[{id:'1',left:false}]});await room('inconsistent',{failure:{code:'STRAIN'}});
  const plan=await planRoomRepairs(db),reviewed=planHash(plan);
  assert.deepEqual(plan.map(r=>[r.room_id,r.outcome,r.ended_at]),[['lost','FAILED',String(ended)],['won','CLEAR',String(ended)]]);
  await assert.rejects(repairRooms(db,{reviewed:'changed'}),/changed since review/);
  for(const failAt of ['rooms','audit','receipt']){
    await assert.rejects(repairRooms(db,{reviewed,commit:true,checkpoint:at=>{if(at===failAt)throw Error(at);}}),e=>e.message===failAt);
    assert.equal(planHash(await planRoomRepairs(db)),reviewed);assert.equal(await readReceipt(db),null);
    assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM admin_logs')).rows[0].n,0);
  }
  const rehearsal=await repairRooms(db,{reviewed});assert.equal(rehearsal.committed,false);assert.equal(planHash(await planRoomRepairs(db)),reviewed);
  const applied=await repairRooms(db,{reviewed,commit:true});assert.equal(applied.verified.verified,2);assert.equal(applied.receipt.clears,1);
  assert.deepEqual(await verifyRoomRepairs(db,plan),{found:2,verified:2});assert.deepEqual(await planRoomRepairs(db),[]);
  const replay=await repairRooms({query:(s,p)=>{assert.match(s,/^SELECT /);return db.query(s,p);}},{reviewed,commit:true});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.receipt,applied.receipt);
  const won=JSON.parse((await pg.query("SELECT state_json FROM raid_madara_rooms_v1 WHERE room_id='won'")).rows[0].state_json);
  assert.deepEqual(won,{...original,status:'CLEAR',finishedAt:ended});
});
