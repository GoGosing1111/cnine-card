import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleCooperative} from '../functions/_cooperative_live.js';
import {defaultCoopCombat,validateCoopCombat} from '../shared/cooperative-settings-v1.mjs';
import {createCoopRoom,coopCommand,coopView,advanceCoopRoom} from '../functions/_cooperative_room.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {coopSquads} from './helpers/cooperative-fixture.mjs';
async function fixture(postgres){
 let pg,sql,DB,queries=[],race=false;
 if(postgres){pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");DB=new __postgresCompatTest.PostgresD1Database({async query(q){const source=q.text||q;queries.push(source);const r=await pg.query(source,q.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});}
 else{sql=new DatabaseSync(':memory:');DB={prepare(source){return {args:[],bind(...a){this.args=a;return this;},async first(){queries.push(source);return sql.prepare(source).get(...this.args)||null;},async all(){queries.push(source);return {results:sql.prepare(source).all(...this.args)};},async run(){queries.push(source);if(race&&source.startsWith('UPDATE app_meta')){race=false;return {meta:{changes:0}};}return {meta:{changes:Number(sql.prepare(source).run(...this.args).changes)}};}};}};}
 const schema="CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,coin INTEGER DEFAULT 777);INSERT INTO users(id,nickname) VALUES(1,'운영자'),(2,'참여자'),(3,'다른 운영자');";
 if(pg)await pg.exec(schema);else sql.exec(schema);
 let user={id:1,role:'OWNER',nickname:'운영자'};const rooms=new Map(),pointer={room:null,async getRoom(){return this.room;},async setRoom(v){this.room=v;}};
 const env={DB,COOP_PLAYERS:{getByName:()=>pointer},COOP_ROOMS:{getByName:id=>({async create(input){rooms.set(id,createCoopRoom({...input,now:1000}));return {ok:true,roomId:id};},async state(u){return coopView(rooms.get(id),u,1000);}})}};
 const deps={authenticate:async()=>user,json:(body,status=200,headers={})=>({body,status,headers}),withUserMutationLock:async(_env,_id,_path,work)=>work()};
 const call=(path,body,options={})=>handleCooperative({path:path.split('?')[0],env,deps,request:new Request('https://game.test/api/'+path,{method:body?'POST':'GET',headers:{origin:options.origin||'https://game.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
 return {call,rooms,setUser:v=>user=v,reset:()=>queries.length=0,queries,race:()=>race=true,close:()=>pg?pg.close():sql.close()};
}
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} CMS: OWNER gate, persistence, conflicts, legacy preservation and room snapshot`,async()=>{
 const f=await fixture(postgres);
 try{
  for(const user of [null,{id:2,role:'USER'},{id:2,role:'ADMIN'}]){f.setUser(user);for(const path of ['admin/coop/settings','admin/coop/test-users?q=2'])assert.equal((await f.call(path)).status,user?403:401);assert.equal((await f.call('admin/coop/settings',{settings:{}})).status,user?403:401);}
  f.setUser({id:1,role:'OWNER',nickname:'운영자'});f.reset();const initial=await f.call('admin/coop/settings');assert.equal(initial.status,200);assert.equal(initial.body.settings.mode,'TEST');assert.ok(f.queries.every(q=>!/^\s*(UPDATE|INSERT|DELETE)/.test(q)));
  assert.equal((await f.call('admin/coop/test-users?q='+encodeURIComponent('참여자'))).body.users[0].id,2);
  let s=initial.body.settings;s.testUserIds=[2];s.combat.maxBattleSeconds=120;s.combat.stages[0].name='전초기지';s.combat.difficulties[0].monsters[0].power=7777777;s.economyDraft={entryItemCode:'COOP_TOKEN',entryQuantity:1,payer:'EACH',coin:3000000,masterStar:500,mysticEnergy:20};
  assert.equal((await f.call('admin/coop/settings',{settings:s},{origin:'https://evil.test'})).status,403);
  let r=await f.call('admin/coop/settings',{settings:s});assert.equal(r.status,200);assert.equal(r.body.settings.revision,1);assert.equal(r.body.settings.updatedBy,1);assert.equal(r.body.testUsers[0].nickname,'참여자');
  assert.deepEqual((await f.call('admin/coop/settings')).body.settings,r.body.settings);
  assert.equal((await f.call('admin/coop/settings',{settings:s})).status,409,'Retry cannot apply twice');
  r=await f.call('coop/settings',{settings:{mode:'TEST',testUserIds:[2],revision:1}});assert.equal(r.status,200);assert.deepEqual(r.body.settings.combat,s.combat);assert.deepEqual(r.body.settings.economyDraft,s.economyDraft);
  const created=await f.call('coop/create',{difficulty:'NORMAL',clientId:'cms-qa-client-one',requestId:'cms-create-request'});assert.equal(created.status,200);const room=f.rooms.get(created.body.roomId);assert.equal(room.combat.maxBattleSeconds,120);assert.equal(room.settingsRevision,2);
  s=r.body.settings;s.combat.maxBattleSeconds=180;s.combat.difficulties[0].monsters[0].power=8888888;
  assert.equal((await f.call('admin/coop/settings',{settings:s})).status,200);assert.equal(room.combat.maxBattleSeconds,120);assert.equal(room.combat.difficulties[0].monsters[0].power,7777777);
  assert.equal((await f.call('coop/feature')).body.configuration.maxBattleSeconds,180);
  s=(await f.call('admin/coop/settings')).body.settings;
  for(const bad of [{...s,testUserIds:[999]},{...s,testUserIds:[2,2]},{...s,rewardLocked:false},{...s,economyEnabled:true},{...s,combat:{...s.combat,maxBattleSeconds:10000}},{...s,economyDraft:{...s.economyDraft,coin:-1}}])assert.equal((await f.call('admin/coop/settings',{settings:bad})).status,400);
  if(!postgres){f.race();assert.equal((await f.call('admin/coop/settings',{settings:s})).status,409);assert.equal((await f.call('admin/coop/settings')).body.settings.revision,s.revision);}
  assert.ok(!f.queries.some(q=>/^\s*(UPDATE|INSERT|DELETE)\s+(?:INTO |FROM )?(?:users|cnine_user_inventory|inventory_logs)/i.test(q)),'No account cost or grant is implemented by draft settings');
 }finally{await f.close();}
});
test('CMS numbers reach every wave, retain default balance, and remain frozen across battle rebuilds',()=>{
 const squads=coopSquads(),combat=defaultCoopCombat(),before=createCooperativeBattle({squads,seed:7919}),same=createCooperativeBattle({squads,seed:7919,combat});
 assert.deepEqual(same,before,'Adding CMS must not retune current default combat');
 combat.maxBattleSeconds=100;const d=combat.difficulties[0];for(const m of d.monsters){m.power*=2;m.shieldPercent=25;m.attackCount=3;}
 const b=createCooperativeBattle({squads,seed:7919,combat});assert.equal(b.payload.battleV2.rules.maxCombatDurationMs,100000);
 for(let i=0;i<5;i++){const m=b.payload.cooperativeEncounter.instances[i],old=before.payload.cooperativeEncounter.instances[i];assert.ok(m.maxHp>old.maxHp);assert.ok(m.shield>0);}
 const room=createCoopRoom({id:'012345ABCD',user:{id:1,nickname:'운영자'},clientId:'cms-client-11111',difficulty:'NORMAL',seed:7919,now:0,combat});
 combat.maxBattleSeconds=180;assert.equal(room.combat.maxBattleSeconds,100);
 for(const id of [2,3])coopCommand(room,{id,nickname:'참여자'},'join',{clientId:'cms-client-'+id+'1111'},0);
 for(const id of [1,2,3])coopCommand(room,{id},'ready',{clientId:'cms-client-'+id+'1111',loadout:squads[id-1]},1);
 assert.equal(room.payload.battleV2.rules.maxCombatDurationMs,100000);
 coopCommand(room,{id:1},'leave',{clientId:'cms-client-11111'},2);assert.equal(room.payload.battleV2.rules.maxCombatDurationMs,100000);
 assert.equal(coopView(room,{id:2},2).state.configuration.maxBattleSeconds,100);
});
test('CMS mechanic timing, window and damage are authoritative; invalid definitions fail before storage',()=>{
 const c=defaultCoopCombat();c.patterns={firstSeconds:2,intervalSeconds:20,count:4,rupturePercent:13};c.difficulties[0].responseSeconds=5;
 const room=createCoopRoom({id:'012345ABCD',user:{id:1,nickname:'운영자'},clientId:'cms-client-11111',difficulty:'NORMAL',seed:7919,now:0,combat:c});
 const squads=coopSquads();for(const id of [2,3])coopCommand(room,{id,nickname:'참여자'},'join',{clientId:'cms-client-'+id+'1111'},0);
 for(const id of [1,2,3])coopCommand(room,{id},'ready',{clientId:'cms-client-'+id+'1111',loadout:squads[id-1]},1);
 for(const id of [1,2,3])coopCommand(room,{id},'loaded',{clientId:'cms-client-'+id+'1111'},2);
 const at=room.startsAt+room.bossAtMs+2000;
 for(let time=3000;time<at;time+=1000)for(const id of [1,2,3])coopCommand(room,{id},'ping',{clientId:'cms-client-'+id+'1111'},time);
 advanceCoopRoom(room,at);assert.equal(room.pattern.endsAt-room.pattern.startsAt,5000);
 for(const id of [1,2,3])coopCommand(room,{id},'mechanic',{clientId:'cms-client-'+id+'1111',patternId:room.pattern.id,action:'VENT'},at+1);
 advanceCoopRoom(room,at+5000);assert.equal(room.effects[0].percent,13);
 for(const mutate of [c=>c.patterns.count=7,c=>c.patterns.intervalSeconds=5,c=>c.difficulties[0].monsters[0].key='ARKE',c=>c.difficulties.pop(),c=>c.difficulties[0].monsters[0].power=NaN,c=>c.difficulties[0].monsters[0].attackPercent=99,c=>c.difficulties[0].monsters[0].hpPercent=1201]){const v=defaultCoopCombat();mutate(v);assert.throws(()=>validateCoopCombat(v));}
});
