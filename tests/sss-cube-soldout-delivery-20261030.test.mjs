import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import {SSS_CUBE_KEY,ensureSssCubeCatalog,handleSssCube} from '../functions/_sss_miracle_cube.js';

test('shipped state route exposes current odds and preserves CMS policy without a write',async t=>{
 const f=await mercenaryFixture(t);await ensureLimitedPackSchema(f.env);await ensureSssCubeCatalog(f.env);
 await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES(?,5,5)','SSS_MIRACLE_CUBE:V-996').run();
 const setting={revision:4,policy:{mode:'ON',cards:{'V-021':9500000000,'V-996':500000000},stockLimits:{'V-996':5},notes:'owner only'}};
 await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',SSS_CUBE_KEY,JSON.stringify(setting)).run();
 const prepare=f.env.DB.prepare.bind(f.env.DB);f.env.DB.prepare=sql=>{assert.match(sql,/^SELECT /,'GET must remain read-only');return prepare(sql);};
 const request=new Request('https://game.test/api/sss-miracle-cube/state');
 const response=await handleSssCube({path:'sss-miracle-cube/state',request,env:f.env,deps:{authenticate:async()=>({id:7,role:'USER'}),json:(body,status,headers)=>Response.json(body,{status,headers})}});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const state=await response.json();
 assert.equal(state.mode,'ON');assert.equal(state.openingEnabled,true);assert.deepEqual(state.excludedCodes,['V-996']);assert.equal(state.policy.notes,'');
 assert.equal(state.catalog.find(c=>c.code==='V-021').percent,'100');assert.equal(state.catalog.find(c=>c.code==='V-021').configuredPercent,'95');assert.equal(state.catalog.find(c=>c.code==='V-996').percent,'0');
 assert.deepEqual(state.policy.cards,setting.policy.cards);assert.equal(state.revision,4);
 const index=fs.readFileSync(new URL('../sss-miracle-cube/index.html',import.meta.url),'utf8');assert.match(index,/app\.mjs\?v=20261030-soldout1/);assert.match(index,/남은 용병의 설정 비율을 합계 100%로 환산/);
 const admin=fs.readFileSync(new URL('../admin/sss-miracle-cube.html',import.meta.url),'utf8');assert.match(admin,/sss-miracle-cube\.mjs\?v=20261030-soldout1/);
});
