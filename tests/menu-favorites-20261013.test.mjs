import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleMenuFavorites,FAVORITE_MENU_ROUTES} from '../functions/_menu_favorites.js';

const source=fs.readFileSync(new URL('../ui/adventure-lobby/favorites.js',import.meta.url),'utf8');
function client(options={}){
  const context={};context.window=context;vm.createContext(context);vm.runInContext(source,context);
  const cache=new Map();
  return context.SoopMenuFavorites.create({getAccountId:()=>1,routeIds:FAVORITE_MENU_ROUTES,storage:{getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)},...options});
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('authenticated favorites persist independently and retries never duplicate or lose other menus (PostgreSQL)',async()=>{
  const db=new PGlite();
  try{
    await db.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)');
    const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const result=await db.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}});
    const call=(id,body,method=body?'POST':'GET')=>handleMenuFavorites({path:'me/menu-favorites',env:{DB},request:new Request('https://qa.invalid/api/me/menu-favorites',{method,...(body?{body:JSON.stringify(body)}:{})}),deps:{authenticate:async()=>id?{id}:null,readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
    assert.equal((await call(null)).status,401);
    assert.equal((await call(1,null,'DELETE')).status,405);
    for(const body of [{route:'admin',favorite:true},{route:'hunt',favorite:'true'},{route:'../other',favorite:true}])assert.equal((await call(1,body)).status,400);
    await Promise.all([call(1,{route:'hunt',favorite:true}),call(1,{route:'pvp',favorite:true}),call(10,{route:'petDex',favorite:true})]);
    await call(1,{route:'hunt',favorite:true});
    assert.deepEqual(new Set((await call(1)).body.routes),new Set(['hunt','pvp']));
    assert.deepEqual((await call(10)).body.routes,['petDex']);
    await call(1,{route:'hunt',favorite:false});await call(1,{route:'hunt',favorite:false});
    assert.deepEqual((await call(1)).body.routes,['pvp']);
    assert.deepEqual((await call(10)).body.routes,['petDex']);
    assert.equal((await db.query('SELECT COUNT(*)::int AS count FROM app_meta')).rows[0].count,2);
  }finally{await db.close();}
});

test('server accepts every shared public menu and standalone destination',()=>{
  const context={document:{currentScript:{dataset:{enabled:'false'}},readyState:'loading',documentElement:{dataset:{}},addEventListener(){}},location:{search:''},URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval};context.window=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../js/soopketmon-v21-exact-shell-adapter.js',import.meta.url),'utf8'),context);
  const nav=context.SoopketmonV21NavigationContract;
  const routes=nav.menuGroupOrder.flatMap(id=>Array.from(nav.groups[id].routes));
  assert.deepEqual(new Set(FAVORITE_MENU_ROUTES),new Set([...routes,'mercenaryEquipment','equipmentForge','seasonPass']));
});

test('failed writes keep confirmed state, and retry adds once',async()=>{
  let fail=true;
  const store=client({request:async body=>{if(!body)return {userId:1,routes:['hunt']};if(fail)throw Error('offline');return {userId:1,...body};}});
  await store.refresh();await store.toggle('pvp');
  assert.deepEqual(Array.from(store.snapshot().routes),['hunt']);assert.match(store.snapshot().error,/저장하지 못/);
  fail=false;await store.toggle('pvp');assert.deepEqual(Array.from(store.snapshot().routes),['hunt','pvp']);
  await store.toggle('hunt');assert.deepEqual(Array.from(store.snapshot().routes),['pvp']);store.destroy();
});

test('a late read cannot erase an already-confirmed mutation',async()=>{
  const slow=deferred();const store=client({request:body=>body?Promise.resolve({userId:1,...body}):slow.promise});
  const reading=store.refresh();await Promise.resolve();await store.toggle('hunt');
  slow.resolve({userId:1,routes:[]});await reading;
  assert.deepEqual(Array.from(store.snapshot().routes),['hunt']);store.destroy();
});

test('account switches discard previous account reads and writes',async()=>{
  let id=1;const oldRead=deferred(),oldWrite=deferred();
  const store=client({getAccountId:()=>id,request:body=>id===1?(body?oldWrite.promise:oldRead.promise):Promise.resolve({userId:2,routes:['petDex']})});
  const reading=store.refresh();await Promise.resolve();const writing=store.toggle('hunt');
  id=2;await store.refresh();oldRead.resolve({userId:1,routes:['pvp']});oldWrite.resolve({userId:1,route:'hunt',favorite:true});
  await Promise.all([reading,writing]);assert.deepEqual(Array.from(store.snapshot().routes),['petDex']);store.destroy();
});

test('cached favorites are account-scoped, sanitized, and reconciled with another device',async()=>{
  const cache=new Map([['cnine:menu-favorites:v1:1','["hunt","hunt","admin","<script>"]'],['cnine:menu-favorites:v1:2','["petDex"]']]);
  const storage={getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)};
  const store=client({storage,request:async()=>({userId:1,routes:['pvp']})});
  assert.deepEqual(Array.from(store.snapshot().routes),['hunt']);await store.refresh();
  assert.deepEqual(JSON.parse(cache.get('cnine:menu-favorites:v1:1')),['pvp']);
  assert.deepEqual(JSON.parse(cache.get('cnine:menu-favorites:v1:2')),['petDex']);store.destroy();
});

test('parallel clicks for the same menu produce one mutation, different menus coexist',async()=>{
  const pending=new Map();let calls=0;
  const store=client({request:body=>{calls++;const task=deferred();pending.set(body.route,{...task,body});return task.promise;}});
  const first=store.toggle('hunt');await store.toggle('hunt');const second=store.toggle('pvp');assert.equal(calls,2);
  pending.get('pvp').resolve({userId:1,...pending.get('pvp').body});await second;
  pending.get('hunt').resolve({userId:1,...pending.get('hunt').body});await first;
  assert.deepEqual(new Set(store.snapshot().routes),new Set(['hunt','pvp']));store.destroy();
});
