import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fixture} from './fixtures/chuseok-v1.mjs';
import {chuseokAdmin,chuseokState,drawChuseok,handleChuseok} from '../functions/_chuseok.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('retired Chuseok is hidden and cannot be reopened or charged; existing receipts still replay',async t=>{
 const f=await fixture();t.after(()=>f.close());const body={requestId:crypto.randomUUID(),event:'songpyeon',choice:0};const before=await f.row('SELECT coin FROM users WHERE id=1');
 for(const run of [()=>chuseokState(f.env,1),()=>chuseokAdmin(f.env,{id:99},{visible:true}),()=>drawChuseok(f.env,1,body)])await assert.rejects(run(),e=>e.code==='EVENT_RETIRED'&&e.status===410);
 assert.deepEqual(await f.row('SELECT coin FROM users WHERE id=1'),before);assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='CHUSEOK_COIN'")).quantity),20);
 await f.pg.query('INSERT INTO chuseok_receipts_v1(request_id,user_id,event,choice,result_json) VALUES($1,1,$2,0,$3)',[body.requestId,body.event,JSON.stringify({ok:true,requestId:body.requestId,kind:'COIN',reward:{amount:99}})]);
 assert.equal((await drawChuseok(f.env,1,body)).replayed,true);await assert.rejects(drawChuseok(f.env,2,body),e=>e.code==='REQUEST_CONFLICT');assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),0);
 const feature=await handleChuseok({path:'events/chuseok/feature',request:new Request('https://qa.test/api/events/chuseok/feature'),env:{},deps:{json:(v,s=200)=>Response.json(v,{status:s})}});assert.deepEqual(await feature.json(),{visible:false,phase:'RETIRED',replacement:'/events/golden-axe/'});
});
test('old pages and CMS are removed; navigation, redirect and prize vouchers use golden axe',()=>{
 for(const path of ['events/chuseok/index.html','events/chuseok/entry.js','admin/chuseok-v1.js','admin/chuseok-v1.css','js/chuseok-page-v1.js','css/chuseok-v1.css'])assert(!existsSync(new URL('../'+path,import.meta.url)),path);
 for(const path of ['admin/index.html','js/soopketmon-v21-exact-shell-adapter.js','js/adventure-navigation-standalone.js','js/adventure-lobby-v2107.js'])assert(!read(path).includes('/events/chuseok/'));
 assert.match(read('_redirects'),/\/events\/chuseok\/\* \/events\/golden-axe\/ 302/);assert.match(read('js/app.js'),/\/events\/golden-axe\/\?use=/);assert.match(read('js/soopketmon-v21-exact-shell-adapter.js'),/goldenAxe: Object.freeze/);assert.match(read('admin/index.html'),/golden-axe-v1.js/);
});
test('retired routes retain authentication and same-origin checks',async()=>{
 const deps={json:(v,s=200)=>Response.json(v,{status:s}),authenticate:async()=>null,requirePermission:async()=>null,readBody:r=>r.json()};
 for(const path of ['events/chuseok/draw','admin/chuseok'])assert.equal((await handleChuseok({path,request:new Request('https://qa.test/api/'+path),env:{},deps})).status,path.startsWith('admin')?403:401);
 assert.equal((await handleChuseok({path:'events/chuseok/draw',request:new Request('https://qa.test/api/events/chuseok/draw',{method:'POST',headers:{origin:'https://elsewhere.test'}}),env:{},deps:{...deps,authenticate:async()=>({id:1})}})).status,403);
});
