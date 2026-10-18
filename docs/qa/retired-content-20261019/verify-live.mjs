import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..'),base='https://cnine-card.pages.dev';
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex');
const routes=[['siege/state','MONSTER_SIEGE_RETIRED'],['siege/attack','MONSTER_SIEGE_RETIRED'],['admin/siege/settings','MONSTER_SIEGE_RETIRED'],['admin/storage-cleanup/summary','STORAGE_CLEANUP_RETIRED'],['admin/storage-cleanup/delete','STORAGE_CLEANUP_RETIRED'],['admin/chicken-event','CHICKEN_EVENT_RETIRED'],['events/chicken/order','CHICKEN_EVENT_RETIRED'],['admin/golden-axe','GOLDEN_AXE_EVENT_RETIRED'],['events/golden-axe/draw','GOLDEN_AXE_EVENT_RETIRED']];
const api=[];
for(const [route,code] of routes)for(const method of ['GET','POST']){
 const r=await fetch(base+'/api/'+route,{method,cache:'no-store',signal:AbortSignal.timeout(20000)}),v=await r.json();
 assert.equal(r.status,410,route);assert.equal(v.code,code);assert.equal(v.retired,true);assert.equal(r.headers.get('cache-control'),'no-store');api.push({route,method,status:r.status,code});
}
const files=['admin/index.html','admin/admin-v1276.js','admin/admin-v945.css','js/app.js','js/soopketmon-v21-exact-shell-adapter.js','js/adventure-navigation-standalone.js','js/event-vouchers-v1.js','service-worker.js'],assets=[];
for(const file of files){const url=file==='admin/index.html'?'/admin/':'/'+file,r=await fetch(base+url+'?removal='+commit,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,file);const actual=hash(Buffer.from(await r.arrayBuffer())),expected=hash(fs.readFileSync(path.join(root,file)));assert.equal(actual,expected,file);assets.push({file,sha256:actual});}
const redirects=[];
for(const route of ['/events/chicken/','/events/golden-axe/','/events/chuseok/']){const r=await fetch(base+route,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,302,route);const target=new URL(r.headers.get('location'),base);assert.equal(target.pathname,'/');assert.equal(target.search,'?screen=home');redirects.push({route,status:r.status,location:r.headers.get('location')});}
const report={commit,verifiedAt:new Date().toISOString(),retiredRoutesVerified:true,api,assets,redirects};
fs.writeFileSync(path.join(import.meta.dirname,'production.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({commit,verifiedAt:report.verifiedAt,retiredRoutesVerified:true,apiRequests:api.length,assets:assets.length,redirects:redirects.length}));
