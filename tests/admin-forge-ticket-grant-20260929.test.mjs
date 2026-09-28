import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {forgeTicketFixture} from './helpers/admin-forge-ticket-fixture.mjs';

const REPAIR='PINGDU_REPAIR_COUPON',PROTECTION='EQUIPMENT_PROTECTION_TICKET';
for(const itemCode of [REPAIR,PROTECTION])test(`${itemCode}: route credits the target once, records the admin, and returns the balance`,async t=>{
 const f=await forgeTicketFixture(t),requestId=crypto.randomUUID(),payload={userId:1,action:'INVENTORY',itemCode,amount:3,reason:'장비 지원',requestId};
 const started=performance.now(),response=await f.response(payload),data=await response.json();assert.equal(response.status,200);assert.equal(data.balance,3);
 const firstQueries=f.queries();t.diagnostic(JSON.stringify({itemCode,sqlStatements:firstQueries,elapsedMs:Math.round(performance.now()-started)}));assert(firstQueries<=35);
 assert.equal((await (await f.response(payload)).json()).replayed,true);assert.equal(await f.quantity(itemCode),3);
 assert.equal(await f.quantity(itemCode,2),0);assert.deepEqual(await f.one('SELECT coin,card_shards FROM users WHERE id=1'),{coin:1234,card_shards:45});
 assert.deepEqual(await f.one('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=$1',[itemCode]),{quantity:3,unseen_quantity:3});
 const log=await f.one('SELECT * FROM admin_logs');assert.equal(log.admin_id,9);assert.equal(log.action_type,'INVENTORY');assert.equal(JSON.parse(log.after_data).itemCode,itemCode);
 assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,1);assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,1);
 assert.deepEqual(f.locks,[{userId:1,path:'admin/forge-tickets/grant'},{userId:1,path:'admin/forge-tickets/grant'}]);
 const next=await f.grant({itemCode,amount:2});assert.equal(next.balance,5);
});

test('permissions: unauthenticated, USER and admin without USER_MANAGE are denied; non-owner cannot change OWNER',async t=>{
 const f=await forgeTicketFixture(t),payload={userId:1,action:'INVENTORY',itemCode:REPAIR,amount:3,requestId:crypto.randomUUID()};
 for(const admin of [null,{id:1,role:'USER',permissions:['USER_MANAGE']},{id:10,role:'ADMIN',permissions:[]}])assert.equal((await f.response(payload,admin)).status,403);
 const staff={id:10,role:'ADMIN',permissions:['USER_MANAGE']};assert.equal((await f.response({...payload,userId:9},staff)).status,403);
 assert.equal((await f.response({...payload,userId:999},staff)).status,404);assert.equal(f.locks.length,0);
 assert.equal((await f.response({...payload,adminId:1},staff)).status,200);assert.equal((await f.one('SELECT admin_id FROM admin_logs')).admin_id,10);
});

test('invalid item, quantity, request ID, account and disabled catalog never grant',async t=>{
 const f=await forgeTicketFixture(t);
 for(const amount of [0,-1,1.5,10000,Number.MAX_SAFE_INTEGER,NaN])await assert.rejects(f.grant({amount}),/수량/);
 await assert.rejects(f.grant({itemCode:'MASTER_STAR'}),/아이템/);await assert.rejects(f.grant({requestId:'bad'}),/요청 번호/);
 await assert.rejects(f.grant({userId:0}),/계정/);await assert.rejects(f.grant({userId:999}));
 assert.equal(await f.quantity(REPAIR),0);assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,0);
 await f.grant();await f.pg.query('UPDATE inventory_items SET is_active=0 WHERE code=$1',[REPAIR]);await assert.rejects(f.grant(),/지급할 수 없는/);
 assert.equal((await f.one('SELECT is_active FROM inventory_items WHERE code=$1',[REPAIR])).is_active,0);assert.equal(await f.quantity(REPAIR),3);
});

test('same request cannot change recipient, admin, item, quantity or reason',async t=>{
 const f=await forgeTicketFixture(t),requestId=crypto.randomUUID();await f.grant({requestId});
 for(const override of [{userId:2},{itemCode:PROTECTION},{amount:4},{reason:'다른 사유'}])await assert.rejects(f.grant({requestId,...override}),/다른 내용/);
 await assert.rejects(f.grant({requestId},{id:10,role:'ADMIN'}),/다른 내용/);assert.equal(await f.quantity(REPAIR),3);assert.equal(await f.quantity(PROTECTION),0);
});

test('inventory ledger, audit and completion failures roll back and retry without double credit; lost acknowledgement recovers',async t=>{
 const f=await forgeTicketFixture(t);let expected=0;
 for(const pattern of ['INSERT INTO inventory_logs','INSERT INTO admin_logs',"UPDATE joint_operations_v1 SET status='COMPLETED'"]){
  const requestId=crypto.randomUUID();f.fault({pattern});await assert.rejects(f.grant({requestId}));assert.equal(await f.quantity(REPAIR),expected);
  assert.equal((await f.one('SELECT COUNT(*) n FROM admin_logs')).n,expected/3);await f.grant({requestId});expected+=3;
  await f.grant({requestId});assert.equal(await f.quantity(REPAIR),expected);
 }
 const requestId=crypto.randomUUID();f.fault({ack:true});await f.grant({requestId});await f.grant({requestId});assert.equal(await f.quantity(REPAIR),expected+3);
 assert.equal((await f.one('SELECT COUNT(*) n FROM joint_atomic_guards_v1')).n,0);
});

test('concurrent identical requests credit once; inventory overflow is rejected',async t=>{
 const f=await forgeTicketFixture(t),requestId=crypto.randomUUID();await Promise.all([f.grant({requestId}),f.grant({requestId})]);
 assert.equal(await f.quantity(REPAIR),3);assert.equal((await f.one('SELECT COUNT(*) n FROM inventory_logs')).n,1);
 await f.pg.query('UPDATE cnine_user_inventory SET quantity=$1 WHERE user_id=1 AND item_code=$2',[Number.MAX_SAFE_INTEGER,REPAIR]);
 await assert.rejects(f.grant());assert.equal(await f.quantity(REPAIR),Number.MAX_SAFE_INTEGER);
});

test('UI: both options and balances, exact confirmation, retry ID reuse after lost response and upper-bound validation',async()=>{
 const admin=readFileSync(new URL('../admin/admin-v1276.js',import.meta.url),'utf8'),html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
 for(const code of [REPAIR,PROTECTION])assert(admin.includes(`<option value="${code}">`));
 assert(admin.includes('u.repair_coupons'));assert(admin.includes('u.equipment_protection_tickets'));assert(html.includes('forgeTickets=20260929'));
 const values=new Map(),controls={'#selectedUserId':{value:'1'},'#inventoryItemCode':{value:REPAIR},'#inventoryItemAmount':{value:'3'},'#inventoryItemReason':{value:'지원'},'#userDialog':{close(){}}};
 const sent=[],confirms=[],alerts=[];let fail=true;
 const ctx={state:{admin:{id:9},users:[{id:1,nickname:'검수 유저'}]},crypto,localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
  $:selector=>controls[selector],confirm:message=>(confirms.push(message),true),alert:message=>alerts.push(message),loadUsers:async()=>{},
  api:async(_path,{body})=>{const p=JSON.parse(body);sent.push(p);if(fail){fail=false;throw Error('lost response');}return {balance:3};}};
 vm.createContext(ctx);vm.runInContext(admin.slice(admin.indexOf('function tournamentGiftGrantKey'),admin.indexOf('function prisonAdminTime')),ctx);
 await assert.rejects(ctx.userAction('INVENTORY'),/lost response/);assert.equal(values.size,1);await ctx.userAction('INVENTORY');
 assert.equal(sent[0].requestId,sent[1].requestId);assert.equal(values.size,0);assert.match(confirms[0],/검수 유저.*핑두 리페어권 3장/);assert.match(alerts.at(-1),/현재 보유 3장/);
 controls['#inventoryItemCode'].value=PROTECTION;await ctx.userAction('INVENTORY');assert.notEqual(sent[1].requestId,sent[2].requestId);assert.match(confirms.at(-1),/장비 보호권 3장/);
 controls['#inventoryItemAmount'].value='10000';await ctx.userAction('INVENTORY');assert.equal(sent.length,3);assert.match(alerts.at(-1),/9,999/);
});
