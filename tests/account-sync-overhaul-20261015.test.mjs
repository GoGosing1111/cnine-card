import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {ACCOUNT_SYNC_SCHEMA_SQL,accountSyncTriggersSql} from '../scripts/ops/account-sync-schema-20261015.mjs';
import {changedAccountDomains,normalizeAccountSync} from '../shared/account-sync-v1.mjs';
import {createServerClock} from '../shared/server-clock-v1.mjs';
import {createPvpReceiptStore} from '../js/pvp-request-recovery-v1.mjs';
import {createAccountSyncClient} from '../js/account-sync-client-v1.mjs';

test('account versions commit with the exact account mutation, roll back with it, and coalesce a batch by account',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec("CREATE TABLE users(id bigint PRIMARY KEY,coin bigint,last_login_at text); CREATE TABLE user_cards(user_id bigint,card_id text,quantity int); CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);");
 await db.exec(ACCOUNT_SYNC_SCHEMA_SQL+accountSyncTriggersSql(['users','user_cards','app_meta']));
 await db.exec("INSERT INTO users VALUES(1,100,'before'),(2,50,'before'); INSERT INTO user_cards VALUES(1,'A',1),(1,'B',2),(2,'C',1);");
 const state=async id=>(await db.query('SELECT revision,domains FROM account_sync_versions_v1 WHERE user_id=$1',[id])).rows[0];
 assert.equal(Number((await state(1)).revision),2);assert.deepEqual(changedAccountDomains({revision:'1',domains:{wallet:'1'}},await state(1)),['collection']);
 const before=await state(1);await db.exec("BEGIN; UPDATE users SET coin=10 WHERE id=1; DELETE FROM user_cards WHERE user_id=1; ROLLBACK;");assert.deepEqual(await state(1),before);
 await db.exec("UPDATE users SET last_login_at='after' WHERE id=1; UPDATE user_cards SET quantity=quantity WHERE user_id=1;");assert.deepEqual(await state(1),before);
 await db.exec("UPDATE user_cards SET quantity=quantity+1 WHERE user_id=1;");assert.equal(Number((await state(1)).revision),3);assert.equal(Number((await state(2)).revision),2);
 await db.exec("INSERT INTO app_meta VALUES('mercenary_pvp_loadout_v1:1','new','now'),('pet_collection_v1:2','pet','now'),('unrelated:1','ignore','now');");
 assert.equal((await state(1)).domains.loadout,'4');assert.equal((await state(2)).domains.collection,'3');
 await db.exec("DELETE FROM user_cards WHERE user_id=1;");assert.equal((await state(1)).domains.collection,'5');
});
test('account version comparison survives large counters and ignores duplicate/out-of-order packets',()=>{
 const old=normalizeAccountSync({revision:'9007199254740993',domains:{wallet:'9007199254740993'}});
 assert.deepEqual(changedAccountDomains(old,{revision:'9007199254740994',domains:{wallet:'9007199254740994'}}),['wallet']);
 assert.deepEqual(changedAccountDomains(old,{revision:'2',domains:{wallet:'2'}}),[]);assert.deepEqual(changedAccountDomains(old,old),[]);
});
test('battle clock compensates RTT, rejects congestion spikes and never reverses or follows a device clock jump',()=>{
 let mono=100,wall=10000;const clock=createServerClock({now:()=>mono,wallNow:()=>wall});
 clock.sample(20000,{sentAt:0,receivedAt:100});assert.equal(clock.now(),20050);
 for(let i=0;i<3;i++){mono+=100;clock.sample(20000+mono-100,{sentAt:mono-100,receivedAt:mono});clock.now();}
 assert.equal(clock.sample(25000,{sentAt:mono-2000,receivedAt:mono}),false);
 const old=clock.now();wall=-500000;mono+=100;assert(clock.now()>=old);assert(clock.now()<old+150);
 clock.sample(19000,{sentAt:mono-100,receivedAt:mono});mono+=20;assert(clock.now()>=old);
});
test('a lost PVP response reuses the original receipt across reloads and never starts a second match',async()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const first=createPvpReceiptStore(storage,{uuid:()=> 'request-1'});let writes=0;const request=async(path,options)=>{const b=JSON.parse(options.body);assert.equal(b.requestId,'request-1');assert.equal(b.matchToken,'match-1');if(!writes++)throw Object.assign(Error('response lost'),{status:503});return {replayed:true,result:'WIN'};};
 await assert.rejects(first.execute(5,{matchToken:'match-1',opponentId:9},request));
 const reloaded=createPvpReceiptStore(storage,{uuid:()=> 'must-not-be-used'});assert.equal(reloaded.read(6),null);
 const result=await reloaded.execute(5,{matchToken:'new-match',opponentId:8},request);assert.equal(result.replayed,true);assert.equal(reloaded.read(5),null);assert.equal(writes,2);
});

test('account connection rejects stale login responses, duplicate packets and recovers on visibility change',async()=>{
 const calls=[],events=[],sockets=[],timers=new Map();let serial=0;
 const client=createAccountSyncClient({request:(_path,args)=>new Promise(resolve=>calls.push({args,resolve})),openSocket:()=>{const s={readyState:1,close(){this.readyState=3;},send(){}};sockets.push(s);return s;},emit:e=>events.push(e),schedule:(fn,ms)=>{timers.set(++serial,{fn,ms});return serial;},cancel:id=>timers.delete(id)});
 const flush=()=>new Promise(r=>setImmediate(r));
 client.configure('first','client-123456');client.configure('second','client-123456');
 calls[0].resolve({accountId:1,snapshot:{revision:'8',domains:{wallet:'8'}}});await flush();assert.equal(sockets.length,0);assert.equal(events.length,0);
 const [immediate,scheduled]=[...timers.entries()].find(([,t])=>t.ms===0);timers.delete(immediate);scheduled.fn();await flush();assert.equal(calls[1].args.token,'second');
 calls[1].resolve({accountId:2,snapshot:{revision:'3',domains:{wallet:'3'}}});await flush();assert.equal(client.accountId,2);assert.equal(sockets.length,1);
 sockets[0].onopen();const count=events.length;
 for(const revision of ['2','3'])sockets[0].onmessage({data:JSON.stringify({type:'account',snapshot:{revision,domains:{wallet:revision}}})});
 assert.equal(events.length,count);sockets[0].onmessage({data:JSON.stringify({type:'account',snapshot:{revision:'4',domains:{wallet:'4'}}})});assert.deepEqual(events.at(-1).domains,['wallet']);
 client.configure('second','client-123456',false);assert.equal(sockets[0].readyState,3);
 client.configure('second','client-123456',true);calls[2].resolve({accountId:2,snapshot:{revision:'5',domains:{inventory:'5',wallet:'4'}}});await flush();assert.equal(client.revision,'5');assert(events.at(-1).domains.includes('inventory'));
 const before=events.length;sockets[0].onmessage({data:JSON.stringify({type:'account',snapshot:{revision:'99'}})});assert.equal(events.length,before);
 client.destroy();assert.equal(timers.size,0);
});

test('PVP retains a receipt through expired login and clears only an authoritative expired match',async()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},store=createPvpReceiptStore(storage,{uuid:()=> 'receipt-login'});
 for(const error of [{status:401},{status:409,code:'JOINT_LOCK_BUSY'}]){
  await assert.rejects(store.execute(1,{matchToken:'ticket',opponentId:2},async()=>{throw Object.assign(Error('retry'),error);}));assert.equal(store.read(1).requestId,'receipt-login');
 }
 await assert.rejects(store.execute(1,{matchToken:'ticket'},async()=>{throw Object.assign(Error('expired'),{status:409,code:'PVP_MATCH_EXPIRED'});}));assert.equal(store.read(1),null);
});
