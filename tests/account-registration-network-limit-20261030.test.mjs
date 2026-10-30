import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const slice=(start,end)=>{const a=api.indexOf(start),b=api.indexOf(end,a);assert(a>=0&&b>a);return api.slice(a,b);};
const branch=slice("    if(path==='auth/register'&&request.method==='POST'){","    if(path==='auth/login'&&request.method==='POST'){");
const hash=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,{coin=12500}={}){
 const pg=new PGlite();t.after(()=>pg.close());const queries=[];
 await pg.exec(`
  CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE FUNCTION sqlite_datetime(value text,VARIADIC modifiers text[] DEFAULT '{}') RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP)+COALESCE(modifiers[1],'0 days')::interval,'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE TABLE users(id bigserial PRIMARY KEY,nickname text NOT NULL UNIQUE,private_key_hash text NOT NULL UNIQUE,coin bigint,role text DEFAULT 'USER',status text DEFAULT 'ACTIVE');
  CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id bigint NOT NULL,expires_at text NOT NULL,client_id text NOT NULL DEFAULT '');
  CREATE TABLE revoked_player_sessions_v1533(token_hash text PRIMARY KEY,user_id bigint NOT NULL,reason text NOT NULL,revoked_at text NOT NULL DEFAULT sqlite_now());
  CREATE TABLE account_ip_registrations(id bigserial PRIMARY KEY,user_id bigint UNIQUE,ip_hash text UNIQUE);
  CREATE TABLE account_ip_exceptions(ip_hash text PRIMARY KEY,expires_at text);
  INSERT INTO users(nickname,private_key_hash,coin) VALUES('existing-player','existing-private-key-hash',987654);
  INSERT INTO account_ip_registrations(user_id,ip_hash) VALUES(1,'shared-carrier-ip');
 `);
 const client={async query(input){queries.push(typeof input==='string'?input:input.text);const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 const ctx=vm.createContext({console,Response,Request,hash,createToken:randomUUID,
  readBody:request=>request.json(),requestIpHash:async()=> 'shared-carrier-ip',
  metaValue:async(_env,key)=>{assert.equal(key,'new_user_coin');return {value:String(coin)};},
  profile:async(_env,user)=>({id:user.id,nickname:user.nickname,coin:user.coin,role:user.role,status:user.status}),
  json:(data,status)=>Response.json(data,{status})
 });
 vm.runInContext(api.split('\n').find(line=>line.startsWith('const safeName='))+'\n'+api.split('\n').find(line=>line.startsWith('const createPrivateKey='))+'\n'+slice('const requestAuthenticationCache=','// These caches are isolate-local burst protection')+'\nglobalThis.register=async(request,env)=>{const path="auth/register";'+branch+'};',ctx);
 const register=(nickname,clientId='client-'+randomUUID())=>ctx.register(new Request('https://cnine-card.pages.dev/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'192.0.2.50','x-cnine-client-id':clientId},body:JSON.stringify({nickname,clientId})}),env);
 return {pg,env,queries,register};
}
test('multiple new accounts on an already used network receive independent keys and sessions',async t=>{
 const {pg,queries,register}=await fixture(t);
 const results=await Promise.all([register('new-android'),register('new-windows')]);
 assert.deepEqual(results.map(r=>r.status),[201,201]);
 const bodies=await Promise.all(results.map(r=>r.json()));
 assert.notEqual(bodies[0].privateKey,bodies[1].privateKey);assert.notEqual(bodies[0].token,bodies[1].token);
 for(const body of bodies){
  assert.match(body.privateKey,/^CN-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);assert.equal(body.user.coin,12500);
  const stored=(await pg.query('SELECT * FROM users WHERE id=$1',[body.user.id])).rows[0];assert.equal(stored.private_key_hash,hash(body.privateKey));
  assert.equal((await pg.query('SELECT user_id FROM sessions WHERE token_hash=$1',[hash(body.token)])).rows[0].user_id,body.user.id);
 }
 assert(!queries.some(sql=>/account_ip_(?:registrations|exceptions)/.test(sql)),'no new IP gate or IP registration write');
 assert.deepEqual((await pg.query('SELECT * FROM account_ip_registrations')).rows,[{id:1,user_id:1,ip_hash:'shared-carrier-ip'}]);
 assert.equal((await pg.query('SELECT coin FROM users WHERE id=1')).rows[0].coin,987654);
});
test('duplicate nickname is still rejected without an extra account or session',async t=>{
 const {pg,register}=await fixture(t);const response=await register('existing-player');assert.equal(response.status,409);
 assert.equal((await response.json()).error,'이미 사용 중인 닉네임입니다.');
 assert.equal((await pg.query('SELECT count(*) count FROM users')).rows[0].count,1);
 assert.equal((await pg.query('SELECT count(*) count FROM sessions')).rows[0].count,0);
});
test('simultaneous duplicate nickname requests create exactly one account',async t=>{
 const {pg,register}=await fixture(t);const responses=await Promise.all([register('same-name'),register('same-name')]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
 assert.equal((await pg.query("SELECT count(*) count FROM users WHERE nickname='same-name'")).rows[0].count,1);
 assert.equal((await pg.query('SELECT count(*) count FROM sessions')).rows[0].count,1);
});
test('blank nickname remains rejected before any database change',async t=>{
 const {queries,register}=await fixture(t);const response=await register('   ');assert.equal(response.status,400);assert.equal((await response.json()).error,'닉네임을 입력하세요.');assert.equal(queries.length,0);
});
test('nickname normalization, starting currency and client identity retain existing behavior',async t=>{
 const {pg,register}=await fixture(t,{coin:76543});const response=await register('   정상 가입   ','android-store-client-20261030');assert.equal(response.status,201);const data=await response.json();assert.equal(data.user.nickname,'정상 가입');assert.equal(data.user.coin,76543);assert.equal(data.user.role,'USER');assert.equal(data.user.status,'ACTIVE');
 assert.equal((await pg.query('SELECT client_id FROM sessions WHERE token_hash=$1',[hash(data.token)])).rows[0].client_id,'android-store-client-20261030');
});
