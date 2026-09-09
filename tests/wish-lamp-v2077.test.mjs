import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {WISH_CHOICES,WISH_REWARDS,WISH_TICKET,cleanWishSettings,wishSettingsComplete,wishEventPhase,wishChoicePool} from '../js/wish-lamp-model-v2077.js';
import {ensureWishLamp,wishLampState,wishLampAdmin,openWishLamp,selectWishReward,handleWishLamp} from '../functions/_wish_lamp.js';
const admin={id:99,role:'OWNER'},KEY='pingdu_wish_lamp_v2077';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function settings(extra={}){
 return {visible:true,enabled:true,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),coinCost:500000000,ticketCost:2,choices:Object.fromEntries(WISH_CHOICES.map(c=>[c.id,{rates:{...Object.fromEntries(c.keys.map(k=>[k,50/c.keys.length])),MISS:50}}])),...extra};
}
async function fixture(){
 const pg=new PGlite();await pg.exec(`
 CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE users(id BIGINT PRIMARY KEY,status TEXT,coin BIGINT);
 INSERT INTO users VALUES(1,'ACTIVE',5000000000),(2,'ACTIVE',5000000000),(99,'ACTIVE',0);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order BIGINT,is_active BIGINT);
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
 INSERT INTO cnine_user_inventory VALUES(1,'PINGDU_WISH_TICKET',10,10,NULL),(2,'PINGDU_WISH_TICKET',10,10,NULL);
 CREATE TABLE inventory_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
 CREATE TABLE coin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,code TEXT UNIQUE,name TEXT,slot TEXT,image_url TEXT,is_active BIGINT,is_public BIGINT);
 CREATE TABLE character_garage_items(id BIGINT PRIMARY KEY,code TEXT UNIQUE,name TEXT,image_url TEXT,is_active BIGINT,is_public BIGINT);
 CREATE TABLE user_equipment_instances(id BIGINT GENERATED ALWAYS AS IDENTITY,user_id BIGINT,equipment_id BIGINT,source_type TEXT,source_id TEXT,request_id TEXT UNIQUE);
 CREATE TABLE user_garage_vehicles(user_id BIGINT,garage_id BIGINT,source_type TEXT,source_id TEXT,PRIMARY KEY(user_id,garage_id));
 `);
 for(const [i,r] of Object.values(WISH_REWARDS).entries())if(r.type==='VEHICLE')await pg.query('INSERT INTO character_garage_items VALUES($1,$2,$3,$4,1,1)',[i+1,r.code,r.name,r.image]);else await pg.query('INSERT INTO character_equipment_items VALUES($1,$2,$3,$4,$5,1,1)',[i+1,r.code,r.name,r.slot,r.image]);
 let fault=null,clockReads=0,expireAtSecondClock=false;
 const client={async query(input){
   const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
   if(fault&&sql.includes(fault))throw new Error('QA injected failure');
   if(sql==='SELECT clock_timestamp() AS now'&&expireAtSecondClock&&++clockReads===2)return {rows:[{now:new Date(Date.now()+2*86400000)}],rowCount:1};
   const result=await pg.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};
 }};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 const row=async(sql,args=[])=>(await pg.query(sql,args)).rows[0];
 const configure=async(extra={})=>{const current=await wishLampAdmin(env,admin);return wishLampAdmin(env,admin,{...settings(extra),revision:current.revision})};
 const body=async(choiceId='EQUIPMENT',id=1)=>{const s=await wishLampState(env,id);return {requestId:crypto.randomUUID(),choiceId,revision:s.revision,quote:s.choices.find(c=>c.id===choiceId).quote}};
 return {pg,env,row,configure,body,state:(id=1)=>wishLampState(env,id),open:(b,id=1,unit=0)=>openWishLamp(env,id,b,{random:()=>unit}),setFault:f=>{fault=f},expireDuringOpen:()=>{expireAtSecondClock=true;clockReads=0},close:()=>pg.close()};
}
async function unchanged(f){
 assert.equal(Number((await f.row('SELECT coin FROM users WHERE id=1')).coin),5000000000);
 assert.equal(Number((await f.row('SELECT quantity FROM cnine_user_inventory WHERE user_id=1')).quantity),10);
 for(const table of ['user_equipment_instances','user_garage_vehicles','coin_logs','inventory_logs','wish_lamp_receipts_v2077'])assert.equal(Number((await f.row('SELECT COUNT(*) n FROM '+table)).n),0,table);
}
test('settings have no economic defaults; dates and literal percentages are strictly validated',()=>{
 const s=cleanWishSettings();assert.equal(s.enabled,false);assert.equal(s.visible,false);assert.equal(s.coinCost,null);assert.equal(s.ticketCost,null);assert.equal(wishSettingsComplete(s),false);assert.equal(wishEventPhase(s),'HIDDEN');
 for(const extra of [{coinCost:-1},{coinCost:1.2},{coinCost:'500'},{ticketCost:0},{startsAt:'2026-02-30T00:00:00+09:00'},{startsAt:'2026-09-01T24:00:00Z'},{startsAt:'2026-09-01'},{endsAt:'2020-01-01T00:00:00Z'},{visible:false},{choices:{}}])assert.throws(()=>cleanWishSettings(settings(extra)),JSON.stringify(extra));
 const invalid=settings();invalid.choices.VEHICLE.rates.VENENO=90;assert.throws(()=>cleanWishSettings(invalid));
 assert.equal(cleanWishSettings(settings()).duplicatePolicy,'EXCLUDE_OWNED');
 const parsed=cleanWishSettings(settings({startsAt:'2026-09-09T20:00:00+09:00',endsAt:'2026-09-10T20:00:00+09:00'}));assert.equal(parsed.startsAt,'2026-09-09T11:00:00.000Z');
 assert.equal(wishEventPhase(parsed,Date.parse(parsed.startsAt)-1),'SCHEDULED');assert.equal(wishEventPhase(parsed,Date.parse(parsed.startsAt)),'OPEN');assert.equal(wishEventPhase(parsed,Date.parse(parsed.endsAt)),'ENDED');
});
test('9 exact rewards, disjoint category selection, owned vehicles excluded without increasing miss chance',()=>{
 assert.equal(Object.keys(WISH_REWARDS).length,9);const s=cleanWishSettings(settings());
 const p=wishChoicePool(s,'VEHICLE',[WISH_REWARDS.VENENO.code]);assert.equal(p.items[0].rate,0);assert.equal(p.items[1].rate,50);assert.equal(p.missRate,50);assert.equal(p.available,true);
 assert.equal(wishChoicePool(s,'VEHICLE',[WISH_REWARDS.VENENO.code,WISH_REWARDS.IGNIS_X.code]).available,false);
 for(const c of WISH_CHOICES){const pool=wishChoicePool(s,c.id);for(let i=0;i<100;i++){const result=selectWishReward(pool,i/100);if(result)assert(c.keys.includes(result.key));}assert.equal(selectWishReward(pool,.99),null)}
 assert.throws(()=>selectWishReward(p,1));assert.throws(()=>selectWishReward(p,-1));
});
test('CMS is versioned, defaults OFF, registers ticket but never grants or changes reward definitions',async()=>{
 const f=await fixture();try{
  const before=await wishLampAdmin(f.env,admin);assert.equal(before.settings.enabled,false);assert.equal(before.revision,null);assert.equal(Object.keys(before.items).length,9);
  assert.equal((await f.row('SELECT code FROM inventory_items')).code,WISH_TICKET);await unchanged(f);
  const a=await f.configure({enabled:false});assert(a.revision);
  await assert.rejects(wishLampAdmin(f.env,admin,{...settings(),revision:null}),e=>e.code==='REVISION_CONFLICT');
  await f.pg.exec('UPDATE character_equipment_items SET is_active=0 WHERE id=3');await assert.rejects(f.configure(),e=>e.code==='CATALOG_INVALID');assert.equal((await wishLampAdmin(f.env,admin)).settings.enabled,false);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM admin_logs')).n),1);
 }finally{await f.close()}
});
test('missing config / hidden / paused / future / expired event never charges',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.open(await f.body()),e=>e.code==='EVENT_CLOSED');
  for(const extra of [{enabled:false},{enabled:false,visible:false},{startsAt:new Date(Date.now()+300000).toISOString()},{startsAt:'2020-01-01T00:00:00Z',endsAt:'2020-02-01T00:00:00Z'}]){await f.configure(extra);await assert.rejects(f.open(await f.body()),e=>e.code==='EVENT_CLOSED')}
  await unchanged(f);
 }finally{await f.close()}
});
for(const choice of WISH_CHOICES)test(choice.id+' grants one actual item with one coin/ticket debit and durable receipt',async()=>{
 const f=await fixture();try{
  await f.configure();const result=await f.open(await f.body(choice.id));assert.equal(result.kind,choice.id);assert.equal(result.reward.quantity,1);assert(choice.keys.includes(result.reward.key));assert.equal(result.coin,4500000000);assert.equal(result.tickets,8);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM '+(choice.id==='VEHICLE'?'user_garage_vehicles':'user_equipment_instances'))).n),1);
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),1);assert.equal(Number((await f.row('SELECT change_amount FROM inventory_logs')).change_amount),-2);
  const saved=JSON.parse((await f.row('SELECT result_json FROM wish_lamp_receipts_v2077')).result_json);assert.deepEqual(saved,result);
  assert.equal((await f.state()).history[0].requestId,result.requestId);
 }finally{await f.close()}
});
test('miss consumes exactly configured cost and no reward; HTTP cannot supply its own roll or grant',async()=>{
 const f=await fixture();try{await f.configure();const r=await f.open({...await f.body(),reward:'E_BODY',coinCost:1,random:0},1,.9);assert.equal(r.kind,'MISS');assert.equal(r.reward,null);assert.equal(r.coin,4500000000);assert.equal(r.tickets,8);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),0)}finally{await f.close()}
});
test('duplicate clicks / lost response / replay after event ends do not reroll or charge twice',async()=>{
 const f=await fixture();try{
  await f.configure();const b=await f.body('BATTLE_SUIT');const r=await Promise.all([f.open(b),f.open(b,1,.9),f.open(b)]);assert.equal(r.filter(x=>!x.replayed).length,1);assert(r.every(x=>x.reward.code===WISH_REWARDS.E_BODY.code));
  await f.configure({enabled:false});const replay=await f.open(b);assert.equal(replay.replayed,true);assert.equal(replay.coin,4500000000);
  await assert.rejects(f.open(b,2),e=>e.code==='REQUEST_CONFLICT');await assert.rejects(f.open({...b,choiceId:'VEHICLE'}),e=>e.code==='REQUEST_CONFLICT');
  assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),1);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),1);
 }finally{await f.close()}
});
test('cost / probability revision and account-specific vehicle quotes must be reconfirmed',async()=>{
 const f=await fixture();try{
  await f.configure();const b=await f.body();await f.configure({coinCost:1});await assert.rejects(f.open(b),e=>e.code==='QUOTE_CHANGED');await unchanged(f);
  const v=await f.body('VEHICLE');await f.pg.exec("INSERT INTO user_garage_vehicles VALUES(1,1,'QA','QA')");await assert.rejects(f.open(v),e=>e.code==='QUOTE_CHANGED');
  const s=await f.state();assert.equal(s.choices[0].items[0].rate,0);assert.equal(s.choices[0].items[1].rate,50);
  const won=await f.open(await f.body('VEHICLE'));assert.equal(won.reward.code,WISH_REWARDS.IGNIS_X.code);assert.equal((await f.state()).choices[0].available,false);
  await assert.rejects(f.open(await f.body('VEHICLE')),e=>e.code==='POOL_UNAVAILABLE');assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),1);
 }finally{await f.close()}
});
test('insufficient funds, disabled ticket, inactive user and missing reward fail closed',async()=>{
 const f=await fixture();try{await f.configure();const b=await f.body();
  await f.pg.exec('UPDATE users SET coin=1 WHERE id=1');await assert.rejects(f.open(b),e=>e.code==='INSUFFICIENT_BALANCE');
  await f.pg.exec('UPDATE users SET coin=5000000000 WHERE id=1; UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=1');await assert.rejects(f.open(b),e=>e.code==='INSUFFICIENT_BALANCE');
  await f.pg.exec("UPDATE cnine_user_inventory SET quantity=10 WHERE user_id=1; UPDATE inventory_items SET is_active=0");await ensureWishLamp(f.env);await assert.rejects(f.open(b),e=>e.code==='TICKET_DISABLED');
  await f.pg.exec("UPDATE inventory_items SET is_active=1;UPDATE users SET status='BANNED' WHERE id=1");await assert.rejects(f.open(b),e=>e.code==='USER_INACTIVE');
  await f.pg.exec("UPDATE users SET status='ACTIVE' WHERE id=1;UPDATE character_equipment_items SET is_active=0 WHERE id=3");await assert.rejects(f.open(b),e=>e.code==='POOL_UNAVAILABLE');await unchanged(f);
 }finally{await f.close()}
});
test('actual affected-row checks: zero-row item/vehicle grants roll back without payment or completed receipt',async()=>{
 for(const choice of ['EQUIPMENT','VEHICLE']){
  const f=await fixture();try{await f.configure();const table=choice==='VEHICLE'?'user_garage_vehicles':'user_equipment_instances';
   await f.pg.exec(`CREATE FUNCTION suppress_grant() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL; END;$$;CREATE TRIGGER skip_grant BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION suppress_grant();`);
   await assert.rejects(f.open(await f.body(choice)),e=>e.code==='GRANT_FAILED');await unchanged(f);
  }finally{await f.close()}
 }
});
test('debit, audit, receipt failure or period expiry during transaction rolls back all mutations',async()=>{
 for(const fault of ['UPDATE cnine_user_inventory','INSERT INTO coin_logs','INSERT INTO inventory_logs','INSERT INTO wish_lamp_receipts_v2077','period']){
  const f=await fixture();try{await f.configure();const b=await f.body();if(fault==='period')f.expireDuringOpen();else f.setFault(fault);await assert.rejects(f.open(b));f.setFault(null);await unchanged(f)}finally{await f.close()}
 }
});
test('API permissions, cross-origin checks and unsupported DB cannot be bypassed',async()=>{
 const json=(body,status=200)=>({body,status}),deps={json,readBody:async r=>r.json(),authenticate:async()=>null,requirePermission:async()=>null};
 for(const path of ['admin/wish-lamp','events/wish-lamp/state','events/wish-lamp/open']){const r=await handleWishLamp({path,env:{},request:new Request('https://game.test/api/'+path),deps});assert.equal(r.status,path.startsWith('admin')?403:401)}
 const r=await handleWishLamp({path:'events/wish-lamp/open',env:{},request:new Request('https://game.test/api/events/wish-lamp/open',{method:'POST',headers:{origin:'https://evil.test'}}),deps:{...deps,authenticate:async()=>({id:1})}});assert.equal(r.status,403);
 await assert.rejects(ensureWishLamp({DB:{dialect:'sqlite'}}),e=>e.code==='DATABASE_UNSUPPORTED');
});
test('menu, CMS, independent preview and real Pixi/GSAP assets are wired without touching battle assets',()=>{
 const nav=read('js/soopketmon-v21-exact-shell-adapter.js'),api=read('functions/api/[[path]].js'),cms=read('admin/wish-lamp-v2077.js'),page=read('js/wish-lamp-page-v2077.js'),fx=read('js/wish-lamp-fx-v2077.src.js');
 assert.match(nav,/wishLamp: Object.freeze/);assert.match(nav,/route==='wishLamp'&&!wishLampVisible/);assert.match(api,/handleWishLamp\(/);
 assert.match(cms,/view-settings/);assert.match(cms,/합계를 정확히 100%/);assert.match(cms,/cnine_admin_token/);
 assert.match(read('admin/index.html'),/wish-lamp-v2077.js/);assert(!read('admin/wish-lamp-v2077.css').includes(':root'));
 assert.match(page,/if\(preview\)throw new Error/);assert.match(page,/cnine_card_api_token/);assert.match(page,/cnine_wish_pending_v2077/);assert(!page.includes('cnine_admin_token'));
 assert.match(read('preview/wish-lamp-v1/entry.js'),/preview:true/);assert.match(read('events/wish-lamp/entry.js'),/startWishLamp\(\)/);
 assert.match(fx,/from 'pixi.js'/);assert.match(fx,/from 'gsap'/);assert.match(fx,/gsap.timeline/);assert.match(fx,/this.pendingDestroy.clear/);
 assert.match(api,/PINGDU_WISH_TICKET'\) THEN 0/);assert.match(api,/x.code==='PINGDU_WISH_TICKET'\?'핑두의 소원램프에서 사용'/);assert.match(cms,/option.value='PINGDU_WISH_TICKET'/);
 assert.match(page,/!pending&&\(!fxReady/);assert.match(page,/if\(fxReady\)/);
 assert(!/Oscillator|AudioContext|Math.random.*reward/.test(fx));
 for(const r of Object.values(WISH_REWARDS))assert(existsSync(new URL('..'+r.image,import.meta.url)),r.image);
});
