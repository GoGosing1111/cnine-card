import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {UserMutationLock} from '../workers/user-lock/src/index.js';

const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const slice=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};

async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`
  CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE FUNCTION sqlite_datetime(value text,VARIADIC modifiers text[] DEFAULT '{}') RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP)+COALESCE(modifiers[1],'0 days')::interval,'YYYY-MM-DD HH24:MI:SS')$$;
  CREATE TABLE users(id bigint PRIMARY KEY,role text,status text,banned_until text,coin bigint);
  CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id bigint NOT NULL,expires_at text NOT NULL,client_id text NOT NULL DEFAULT '');
  CREATE TABLE revoked_player_sessions_v1533(token_hash text PRIMARY KEY,user_id bigint NOT NULL,reason text NOT NULL,revoked_at text NOT NULL DEFAULT sqlite_now());
  INSERT INTO users VALUES(1,'USER','ACTIVE',NULL,123),(2,'OWNER','ACTIVE',NULL,456),(3,'USER','ACTIVE',NULL,789);
 `);
 const client={async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 const ctx=vm.createContext({console,hash,createToken:randomUUID});
 vm.runInContext(slice(api,'const requestAuthenticationCache=','// These caches are isolate-local burst protection')+'\nglobalThis.auth={makeSession,authenticate,forgetSessionUser};',ctx);
 const login=(id,clientId)=>ctx.auth.makeSession(env,id,clientId);
 const user=(token,method='POST')=>ctx.auth.authenticate(new Request('https://qa.invalid/api/me',{method,headers:{authorization:'Bearer '+token}}),env);
 const clear=token=>ctx.auth.forgetSessionUser(hash(token));
 return {pg,env,login,user,clear};
}

test('PC and mobile remain authenticated together, including renewal and concurrent logins',async t=>{
 const {pg,login,user}=await fixture(t);
 const pc=await login(1,'pc-browser-123'),mobile=await login(1,'mobile-browser-456');
 for(const method of ['GET','POST'])for(const token of [pc,mobile])assert.equal(Number((await user(token,method)).id),1);
 assert.equal((await pg.query('SELECT * FROM sessions WHERE user_id=1')).rows.length,2);
 const nextMobile=await login(1,'mobile-browser-456');
 assert.equal(await user(mobile),null);assert.equal(Number((await user(pc)).id),1);assert.equal(Number((await user(nextMobile)).id),1);
 assert.deepEqual((await pg.query('SELECT reason FROM revoked_player_sessions_v1533')).rows,[{reason:'SAME_CLIENT_REFRESHED'}]);
 const both=await Promise.all([login(1,'pc-installed-client'),login(1,'android-installed-client')]);
 for(const token of [pc,nextMobile,...both])assert.equal(Number((await user(token)).id),1);
 assert.deepEqual((await pg.query('SELECT coin FROM users ORDER BY id')).rows.map(r=>Number(r.coin)),[123,456,789]);
});

test('legacy clients and operator sessions coexist; expired, logged-out, banned and reset tokens stay invalid',async t=>{
 const {pg,env,login,user,clear}=await fixture(t);
 const legacy=await login(1),pc=await login(1,'pc-1234567890'),mobile=await login(1,'mobile-1234567890'),other=await login(3,'pc-1234567890');
 assert.equal(Number((await user(legacy)).id),1);assert.equal(Number((await user(other)).id),3);
 const owner=await login(2,'owner-pc'),ownerAgain=await login(2,'owner-pc');
 for(const token of [owner,ownerAgain])assert.equal(Number((await user(token)).id),2);
 await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash(pc)).run();clear(pc);
 assert.equal(await user(pc),null);assert.equal(Number((await user(mobile)).id),1);
 await pg.query("UPDATE sessions SET expires_at='2000-01-01 00:00:00' WHERE token_hash=$1",[hash(legacy)]);clear(legacy);assert.equal(await user(legacy),null);
 await pg.query("UPDATE users SET status='BANNED' WHERE id=1");clear(mobile);assert.equal(await user(mobile),null);
 await pg.query("UPDATE users SET status='ACTIVE' WHERE id=1");assert.equal(Number((await user(mobile)).id),1);
 await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(1).run();clear(mobile);assert.equal(await user(mobile),null);
 assert.equal(Number((await user(other)).id),3);assert.equal(await user('unknown-token'),null);
 assert.equal((await pg.query('SELECT * FROM sessions WHERE user_id=1')).rows.length,0);
});

test('old multi-client responses cannot trigger a popup, clear login or redirect the client',async()=>{
 const effects=[];
 const ctx=vm.createContext({
  console,Date,Map,Set,Math,API_TOKEN:'pc-token',PLAYER_STATE_MUTATION_EPOCH:0,
  API_CACHE_TTL:{},API_GET_MICROCACHE_TTL:1000,API_GET_CACHE:new Map(),API_INFLIGHT:new Map(),
  apiCacheKey:p=>p,playerClientId:()=> 'pc-1234567890',d1BookmarkHeader:()=>({}),rememberD1Bookmark:()=>{},
  BATTLE_ACTION_LOCK_RETRY_PATHS:new Set(),window:{location:{replace:()=>effects.push('redirect')}},
  alert:()=>effects.push('alert'),clearPlayerLogin:()=>effects.push('clear'),stopRuntimeCommandPoll:()=>effects.push('stop'),
  fetchWithTimeout:async()=>Response.json({error:'expired',code:'MULTI_CLIENT_BLOCKED'},{status:401})
 });
 vm.runInContext(slice(app,'async function apiRequest(','const ACCOUNT_SYNC_PENDING=')+'\nglobalThis.request=apiRequest;',ctx);
 for(let i=0;i<4;i++)await assert.rejects(ctx.request('me',{}, {microcache:false}),e=>e.status===401);
 assert.deepEqual(effects,[]);assert.equal(ctx.API_TOKEN,'pc-token');
 assert.doesNotMatch(api,/MULTI_CLIENT_REPLACED|MULTI_CLIENT_BLOCKED/);
});

test('simultaneous PC/mobile actions still use the same account mutation lock',async()=>{
 const lock=new UserMutationLock({}),call=(path,body)=>lock.fetch(new Request('https://lock.invalid/'+path,{method:'POST',body:JSON.stringify(body)})).then(r=>r.json());
 assert.equal((await call('acquire',{token:'pc',actionPath:'draw',leaseMs:60000})).acquired,true);
 assert.equal((await call('acquire',{token:'mobile',actionPath:'draw',leaseMs:60000})).acquired,false);
 await call('release',{token:'mobile'});assert.equal((await call('state',{})).held,true);
 await call('release',{token:'pc'});assert.equal((await call('acquire',{token:'mobile',actionPath:'draw',leaseMs:60000})).acquired,true);
});
