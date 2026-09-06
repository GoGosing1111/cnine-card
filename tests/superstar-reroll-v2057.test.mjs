import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('js/app.js'),api=read('functions/api/[[path]].js');
const clientMeta=app.slice(app.indexOf('const RETIREMENT_REROLL_META='),app.indexOf('function inventoryView('));
const serverMeta=api.slice(api.indexOf('const CUBE_CODES='),api.indexOf('function defaultCubeSettings('));
const openSource=app.slice(app.indexOf('async function openInventoryPack('),app.indexOf('async function openMagicCardPack('));
const route=api.slice(api.indexOf("    if(path==='inventory/use'&&request.method==='POST')"),api.indexOf("    if(path==='attendance/claim'"));

test('every server retirement reroll ticket has matching client entry and grade',()=>{
  const c=vm.createContext({});vm.runInContext(clientMeta+serverMeta+'\nthis.front=RETIREMENT_REROLL_META;this.back=RETIREMENT_REROLL_TICKETS;',c);
  for(const [grade,item] of Object.entries(c.back)){
    assert.equal(c.front[item.code]?.grade,grade,item.code+' is missing from the inventory open screen');
    assert.equal(c.front[item.code]?.title,item.name);
  }
  assert.equal(c.front.SUPERSTAR_REROLL_TICKET.theme,'superstar');
});

test('SUPERSTAR ticket opens, confirms once, keeps acquisition FX and shows its real result',async()=>{
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{className:'',innerHTML:'',textContent:'',disabled:false,classList:{add(){},remove(){}},querySelector(){return node('panel')},querySelectorAll(){return []}});return nodes.get(id)};
  const calls=[],alerts=[],fx=[],cleared=[];let finish;
  const card={id:'valid-superstar',grade:'SUPERSTAR',title:'현역 슈퍼스타',name:'멤버',image:'/assets/test.png'};
  const c=vm.createContext({document:{getElementById:node},window:{},crypto:webcrypto,cards:[card],setTimeout:resolve=>resolve(),
    escapeHtml:String,alert:message=>alerts.push(message),clearApiCache:key=>cleared.push(key),mergeClientCards:()=>{},saveUser:()=>{},apiUserToLocal:u=>u,
    cardHtml:card=>'<article data-card="'+card.id+'">'+card.title+'</article>',playConfiguredAcquisitionCutscene:async card=>fx.push(card.id),
    apiRequest:async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return new Promise(resolve=>{finish=resolve})}});
  vm.runInContext(clientMeta+openSource+'\nthis.open=openInventoryPack;',c);
  await c.open('SUPERSTAR_REROLL_TICKET',1);
  assert.deepEqual(alerts,[]);assert.match(node('modal').className,/inventory-open-superstar/);
  assert.match(node('modal').innerHTML,/슈퍼스타 재뽑기권/);assert.match(node('modal').innerHTML,/SUPERSTAR 활성 카드/);
  assert.equal(calls.length,0,'opening the confirmation must not spend a ticket');
  const first=node('inventoryOpenConfirm').onclick();await node('inventoryOpenConfirm').onclick();
  assert.equal(calls.length,1,'double confirmation cannot issue a second request');assert.equal(node('inventoryOpenConfirm').disabled,true);
  assert.equal(calls[0].path,'inventory/use');assert.equal(calls[0].body.itemCode,'SUPERSTAR_REROLL_TICKET');assert.equal(calls[0].body.count,1);assert.ok(calls[0].body.requestId);
  finish({ok:true,card,duplicate:false,remaining:0,shardGained:0,masterStarGained:0,user:{id:1}});await first;
  assert.deepEqual(fx,['valid-superstar']);assert.match(node('panel').innerHTML,/재뽑기 완료/);assert.match(node('panel').innerHTML,/현역 슈퍼스타/);
  assert.deepEqual(cleared,['inventory','shell/summary','cards']);assert.deepEqual(alerts,[]);
});

async function fixture(t,{quantity=1,owned=0,eligible=true}={}){
  const pg=new PGlite();t.after(()=>pg.close());
  await pg.exec(`
    CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT CURRENT_TIMESTAMP::text$$;
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,card_shards bigint DEFAULT 0);
    INSERT INTO users VALUES(1,'synthetic',0),(2,'other',0);
    CREATE TABLE members(id bigint PRIMARY KEY,name text);INSERT INTO members VALUES(1,'멤버');
    CREATE TABLE cards(id text PRIMARY KEY,member_id bigint,title text,rarity text,image_url text,focus_x int DEFAULT 50,focus_y int DEFAULT 50,power_type text,base_power int,
      limited_total int,issued_count int DEFAULT 0,is_active int DEFAULT 1,card_status text DEFAULT 'PUBLIC',reroll_result_enabled int DEFAULT 1);
    INSERT INTO cards(id,member_id,title,rarity,is_active,card_status,reroll_result_enabled,limited_total) VALUES
      ('valid-superstar',1,'현역 슈퍼스타','SUPERSTAR',1,'PUBLIC',1,NULL),('retired-zeus',1,'퇴사 Zeus','SUPERSTAR',0,'PUBLIC',1,NULL),
      ('hidden-superstar',1,'미공개','SUPERSTAR',1,'PRIVATE',1,NULL),('disabled-reroll',1,'결과제외','SUPERSTAR',1,'PUBLIC',0,NULL),
      ('sold-out',1,'소진','SUPERSTAR',1,'PUBLIC',1,0),('wrong-grade',1,'다른등급','FUR',1,'PUBLIC',1,NULL);
    CREATE VIEW cards_effective_v1210 AS SELECT * FROM cards;
    CREATE TABLE user_cards(user_id bigint,card_id text,quantity bigint,breakthrough_level int,last_obtained_at text,PRIMARY KEY(user_id,card_id));
    CREATE TABLE cnine_user_inventory(user_id bigint,item_code text,quantity bigint,unseen_quantity bigint DEFAULT 0,created_at text,updated_at text,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_use_receipts(request_id text PRIMARY KEY,user_id bigint,item_code text,status text,response_json text,error_message text,created_at text,updated_at text);
    CREATE TABLE inventory_logs(user_id bigint,item_code text,change_amount bigint,balance_after bigint,reason text,reference_type text,reference_id text);
    CREATE TABLE shard_logs(user_id bigint,change_amount bigint,balance_after bigint,reason text,card_id text);
  `);
  await pg.query("INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(1,'SUPERSTAR_REROLL_TICKET',$1)",[quantity]);
  if(owned)await pg.query("INSERT INTO user_cards VALUES(1,'valid-superstar',$1,12,NULL)",[owned]);
  if(!eligible)await pg.exec("UPDATE cards SET is_active=0 WHERE id='valid-superstar'");
  const db=new __postgresCompatTest.PostgresD1Database({async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}});
  const c=vm.createContext({crypto:webcrypto,authenticate:async request=>request.userId===0?null:{id:request.userId||1,nickname:'synthetic'},readBody:async request=>request.body,
    json:(body,status=200)=>({body,status}),UNIQUE_ADVANCEMENT_PASS_CODE:'UNIQUE_ADVANCEMENT_PASS',PREMIUM_CUBE_OPEN_COUNTS:new Set([1,10,100]),
    cubeSettings:async()=>({PREMIUM_CUBE:{MA:100}}),ensureHighGradeRerollFoundation:async()=>{},weightedPick:rows=>rows[0],
    cardAcquisitionEffectsByGrade:async()=>({}),cardWithAcquisitionEffect:card=>card,profile:async(_env,user)=>user});
  vm.runInContext(serverMeta+'\n'+api.match(/^const SHARD_REWARD=.*$/m)[0]+'\nthis.use=async function(request,env,path){'+route+'};',c);
  return {pg,use:async(body={},userId=1)=>c.use({method:'POST',userId,body:{itemCode:'SUPERSTAR_REROLL_TICKET',requestId:'synthetic-superstar-2057',count:1,...body}},{DB:db},'inventory/use'),
    quantity:async()=>Number((await pg.query("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='SUPERSTAR_REROLL_TICKET'")).rows[0].quantity)};
}

test('server awards only an eligible SUPERSTAR, consumes one ticket and replays the receipt exactly once',async t=>{
  const f=await fixture(t,{quantity:2});const r=await f.use();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.card.id,'valid-superstar');assert.equal(r.body.card.grade,'SUPERSTAR');
  assert.equal(r.body.isReroll,true);assert.equal(r.body.duplicate,false);assert.equal(await f.quantity(),1);
  const replay=await f.use();assert.equal(replay.status,200);assert.equal(replay.body.card.id,r.body.card.id);assert.equal(await f.quantity(),1);
  assert.equal(Number((await f.pg.query("SELECT quantity FROM user_cards WHERE user_id=1 AND card_id='valid-superstar'")).rows[0].quantity),1);
  assert.equal((await f.pg.query('SELECT * FROM inventory_logs')).rows.length,1);
  assert.equal((await f.pg.query('SELECT * FROM user_cards WHERE user_id=2')).rows.length,0);
});

test('duplicate SUPERSTAR remains a real extra copy, preserves enhancement and adds 600 shards',async t=>{
  const f=await fixture(t,{owned:2}),r=await f.use();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.duplicate,true);assert.equal(r.body.shardGained,600);assert.equal(await f.quantity(),0);
  const [card]=(await f.pg.query('SELECT quantity,breakthrough_level FROM user_cards')).rows;assert.equal(Number(card.quantity),3);assert.equal(card.breakthrough_level,12);
  assert.equal(Number((await f.pg.query('SELECT card_shards FROM users WHERE id=1')).rows[0].card_shards),600);
});

test('no candidates, no tickets, invalid count and unauthenticated requests cannot consume a reward',async t=>{
  const f=await fixture(t,{eligible:false});assert.equal((await f.use({count:10})).status,400);assert.equal((await f.use({},0)).status,401);assert.equal(await f.quantity(),1);
  const empty=await f.use();assert.equal(empty.status,409);assert.match(empty.body.error,/활성 카드가 없습니다/);assert.equal(await f.quantity(),1);
  assert.equal((await f.pg.query('SELECT * FROM user_cards')).rows.length,0);
  await f.pg.exec("UPDATE cnine_user_inventory SET quantity=0;UPDATE cards SET is_active=1 WHERE id='valid-superstar'");
  assert.equal((await f.use({requestId:'empty-ticket'})).status,409);assert.equal(await f.quantity(),0);
  assert.equal((await f.pg.query('SELECT * FROM user_cards')).rows.length,0);
});
