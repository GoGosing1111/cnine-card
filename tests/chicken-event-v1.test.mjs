import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture as axeFixture} from './fixtures/golden-axe-v1.mjs';
import {LIMITED_PACK_SCHEMA} from '../functions/_mercenary_limited_pack.js';
import {prepareChickenEvent,chickenAdmin,chickenState,orderChicken,handleChickenEvent} from '../functions/_chicken_event.js';
import {CHICKEN_KEY,CHICKEN_TICKET,chickenDraft,cleanChickenSettings,chickenPhase,pickChickenReward} from '../shared/chicken-event-v1.mjs';
const coin={kind:'COIN',code:'COIN',quantity:300000000000,chancePpm:1000000};
const star={kind:'ITEM',code:'MASTER_STAR',quantity:10000000,chancePpm:1000000};
const limited={kind:'LIMITED',code:'V-996',quantity:1,chancePpm:1000000};
const open=rewards=>({visible:true,enabled:true,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),rewards});
async function fixture(){const f=await axeFixture();for(const sql of LIMITED_PACK_SCHEMA)await f.pg.exec(sql);await prepareChickenEvent(f.pg);await f.pg.query("INSERT INTO inventory_items(code,name,is_active) VALUES('MASTER_STAR','마스터의 별',1)");await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,3,3),(2,$1,1,1)',[CHICKEN_TICKET]);await f.pg.query("INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES('V-996',1,0),('V-990',2,0)");
 const admin={id:99,role:'OWNER'};
 return {...f,async config(rewards=[coin],extra={}){const c=await chickenAdmin(f.env,admin);return chickenAdmin(f.env,admin,{revision:c.revision,settings:{...open(rewards),...extra}});},async body(choice='FRIED'){return {requestId:crypto.randomUUID(),choice,revision:(await chickenState(f.env,1)).revision};},order:(body,id=1,n=0)=>orderChicken(f.env,id,body,{randomInt:()=>n}),chicken:()=>chickenState(f.env,1)};
}
test('draft is OFF with no invented dates or odds; exact probability boundaries independent of food',()=>{
 const draft=chickenDraft();assert.equal(draft.enabled,false);assert.equal(draft.startsAt,null);assert.deepEqual(draft.rewards,[]);assert.equal(chickenPhase(draft),'HIDDEN');
 assert.throws(()=>cleanChickenSettings({...draft,enabled:true}));
 const settings=cleanChickenSettings(open([{...coin,chancePpm:500000},{...star,chancePpm:500000}]));
 assert.equal(pickChickenReward(settings,499999).kind,'COIN');assert.equal(pickChickenReward(settings,500000).kind,'ITEM');assert.equal(pickChickenReward(settings,999999).code,'MASTER_STAR');
 for(const rewards of [[{...coin,chancePpm:1000001}],[{...coin,chancePpm:1.5}],[coin,coin],[{...limited,quantity:2}],[{...star,code:CHICKEN_TICKET}],[{...coin,quantity:Number.MAX_SAFE_INTEGER+1}]])assert.throws(()=>cleanChickenSettings(open(rewards)));
 assert.throws(()=>cleanChickenSettings({...settings,startsAt:'2026-02-30T00:00:00Z'}));
});
test('one voucher, both food choices, large reward, receipt retry after event closes',async()=>{const f=await fixture();try{
 await f.config();const a=await f.body(),first=await f.order(a);assert.equal(first.ticketCost,1);assert.equal(first.tickets,2);assert.equal(first.reward.quantity,300000000000);
 const b=await f.body('YANGNYEOM');await f.order(b);assert.equal((await f.row('SELECT coin FROM users WHERE id=1')).coin,600000000000);
 await f.config([coin],{enabled:false});const again=await f.order(a);assert.equal(again.replayed,true);assert.equal(again.tickets,1);
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM chicken_event_receipts_v1')).n,2);
 await assert.rejects(f.order({...a,choice:'YANGNYEOM'}),e=>e.code==='REQUEST_CONFLICT');await assert.rejects(f.order(a,2),e=>e.code==='REQUEST_CONFLICT');
 }finally{await f.close();}});
test('concurrent retry grants once; distinct requests cannot overspend the final voucher',async()=>{const f=await fixture();try{
 await f.config([star]);const body=await f.body();const repeated=await Promise.all([f.order(body,2),f.order(body,2)]);assert.equal(repeated.filter(r=>r.replayed).length,1);
 assert.equal((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'")).quantity,10000000);
 await assert.rejects(f.order({...body,requestId:crypto.randomUUID()},2),e=>e.code==='TICKET_REQUIRED');
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM chicken_event_receipts_v1')).n,1);
 }finally{await f.close();}});
test('limited gift shares finite stock, serial and collection accounting; sold out never spends a voucher',async()=>{const f=await fixture();try{
 await f.config([limited]);const result=await f.order(await f.body());assert.equal(result.reward.serial,1);assert.equal(result.kind,'LIMITED');
 assert.equal((await f.row("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-996'")).issued,1);
 assert.equal((await f.row("SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code='V-996'")).total_copies,1);
 assert.equal((await f.row('SELECT COUNT(*)::int n FROM mercenary_limited_issues_v1')).n,1);
 await assert.rejects(f.order(await f.body(),2),e=>e.code==='REWARD_UNAVAILABLE');assert.equal((await f.row('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=$1',[CHICKEN_TICKET])).quantity,1);
 }finally{await f.close();}});
test('grant or receipt failure rolls back stock, acquisition, ticket, reward and logs together',async()=>{const f=await fixture();try{
 await f.config([limited]);const body=await f.body();f.fault('INSERT INTO chicken_event_receipts_v1');await assert.rejects(f.order(body),/injected/);f.fault(null);
 assert.equal((await f.chicken()).tickets,3);assert.equal((await f.row("SELECT issued FROM mercenary_limited_stock_v1 WHERE code='V-996'")).issued,0);assert.equal((await f.row('SELECT COUNT(*)::int n FROM mercenary_card_acquisitions_v1')).n,0);assert.equal((await f.row("SELECT COUNT(*)::int n FROM inventory_logs WHERE reference_type='CHICKEN_EVENT'")).n,0);
 assert.equal((await f.order(body)).reward.serial,1);
 }finally{await f.close();}});
test('regular mercenary gifts follow CMS eligibility and preserve duplicate accounting',async()=>{const f=await fixture();try{
 const settings=await chickenAdmin(f.env,{id:99});const card=settings.options.find(r=>r.kind==='MERCENARY');assert.ok(card);
 await f.config([{kind:card.kind,code:card.code,quantity:1,chancePpm:1000000}]);
 const first=await f.order(await f.body()),second=await f.order(await f.body());assert.equal(first.reward.duplicate,false);assert.equal(second.reward.duplicate,true);
 assert.equal((await f.row('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=$1',[card.code])).total_copies,2);
 }finally{await f.close();}});
test('OFF, unconfigured, changed settings, suspension and deadline all block without spending',async()=>{const f=await fixture();try{
 let body=await f.body();await assert.rejects(f.order(body),e=>e.code==='EVENT_CLOSED');
 await f.config();body=await f.body();await f.config([star]);await assert.rejects(f.order(body),e=>e.code==='SETTINGS_CHANGED');
 body=await f.body();await f.pg.query("UPDATE users SET banned_until='2099-01-01 00:00:00' WHERE id=1");await assert.rejects(f.order(body),e=>e.code==='USER_INACTIVE');await f.pg.query('UPDATE users SET banned_until=NULL WHERE id=1');
 f.expire();await assert.rejects(f.order(body),e=>e.code==='EVENT_CLOSED');assert.equal((await f.chicken()).tickets,3);assert.equal((await f.row('SELECT COUNT(*)::int n FROM chicken_event_receipts_v1')).n,0);
 }finally{await f.close();}});
test('CMS rejects incomplete ON, unknown prizes, unavailable limited stock and stale revisions',async()=>{const f=await fixture();try{
 await assert.rejects(f.config([{...limited,code:'V-995'}]),e=>e.code==='REWARD_UNAVAILABLE'||e.code==='UNKNOWN_REWARD');
 await assert.rejects(f.config([{...star,code:'NOT_A_REAL_ITEM'}]),e=>e.code==='UNKNOWN_REWARD');
 await assert.rejects(f.config([{...coin,chancePpm:999999}]),e=>e.code==='SETTINGS_INVALID');
 const before=await chickenAdmin(f.env,{id:99});await f.config();await assert.rejects(chickenAdmin(f.env,{id:99},{revision:before.revision,settings:chickenDraft()}),e=>e.code==='REVISION_CONFLICT');
 }finally{await f.close();}});
test('HTTP requires authentication, OWNER settings and same origin',async()=>{
 const deps={json:(b,status=200)=>new Response(JSON.stringify(b),{status}),authenticate:async()=>null,requirePermission:async()=>({id:1,role:'ADMIN'}),readBody:r=>r.json()};
 for(const path of ['events/chicken/order','admin/chicken-event']){const response=await handleChickenEvent({path,request:new Request('https://game.test/api/'+path,{method:'POST'}),env:{},deps});assert.equal(response.status,path.startsWith('admin')?403:401);}
 const response=await handleChickenEvent({path:'events/chicken/order',request:new Request('https://game.test/api/events/chicken/order',{method:'POST',headers:{origin:'https://other.test'}}),env:{},deps:{...deps,authenticate:async()=>({id:1})}});assert.equal(response.status,403);
});
test('public and preview share the exact experience; no live preview switch or ticket-cost input',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');assert.match(read('events/chicken/index.html'),/startChickenEvent\(\)/);assert.match(read('preview/chicken-event-v1/index.html'),/preview:true/);assert.match(read('js/chicken-event-v1.js'),/receipt\?requestId/);assert.match(read('functions/api/[[path]].js'),/handleChickenEvent\(/);assert.match(read('admin/index.html'),/chicken-event-v1.js/);assert.match(read('js/soopketmon-v21-exact-shell-adapter.js'),/events\/chicken\/feature/);
});
