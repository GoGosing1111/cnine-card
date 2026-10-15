import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir,stat,utimes} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ResourceStore,fileResponse} from '../packaging/windows-client/lib/resource-store.mjs';
import {validateManifest,safePublicPath,manifestEntry,GAME_ORIGIN,allowedNavigation} from '../packaging/windows-client/lib/policy.mjs';
import {buildClientManifest} from '../scripts/build-windows-client-manifest.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const row=(p,body,essential=true)=>({path:p,bytes:Buffer.byteLength(body),sha256:hash(body),essential});
const manifest=(files)=>validateManifest({schema:1,origin:GAME_ORIGIN,releaseId:hash(JSON.stringify(files)),files});
async function fixture(t,bodies){
 const root=await mkdtemp(path.join(os.tmpdir(),'soop-client-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const requests=[],fetcher=async(url,options)=>{const pathname=new URL(url).pathname;requests.push({pathname,options});return new Response(bodies[pathname]??'missing',{status:Object.hasOwn(bodies,pathname)?200:404});};
 const store=new ResourceStore({root,fetcher});await store.initialize();return {root,store,requests,bodies};
}
test('only public game assets can enter the native disk store',()=>{
 for(const p of ['/api/account','/admin/index.html','/functions/_auth.js','/scripts/ops/grant.mjs','/assets/../private.json','//assets/a.png','/assets/%2e%2e/a.png','/assets/a.png?x=1','/assets\\a.png'])assert.equal(safePublicPath(p),false,p);
 for(const p of ['/index.html','/js/app.js','/assets/ui/가나다.webp'])assert.equal(safePublicPath(p),true,p);
 assert.equal(allowedNavigation('file:///C:/secrets.txt'),false);assert.equal(allowedNavigation('https://cnine-card.pages.dev.evil.test'),false);
 assert.equal(allowedNavigation('https://www.playdk.kr/oauth/authorize'),true);
});
test('rejects duplicate paths, non-hashes, traversal and a missing entry document',()=>{
 const base={schema:1,origin:GAME_ORIGIN,releaseId:'a'.repeat(64),files:[row('/index.html','hello')]};
 assert.throws(()=>validateManifest({...base,files:[...base.files,...base.files]}));
 assert.throws(()=>validateManifest({...base,files:[{...base.files[0],sha256:'../escape'}]}));
 assert.throws(()=>validateManifest({...base,origin:'https://example.com'}));
 assert.throws(()=>validateManifest({...base,files:[row('/js/app.js','hello')]}));
});
test('first installation verifies every required object and publishes the release together',async t=>{
 const f=await fixture(t,{'/index.html':'<html>OK</html>','/js/app.js':'window.ok=true','/assets/a.png':'image'});
 const m=manifest(Object.entries(f.bodies).map(([p,b])=>row(p,b,!p.startsWith('/assets'))));
 const result=await f.store.prepare(m);assert.equal(result.files,2);assert.equal(f.requests.length,2);
 assert.equal((await f.store.readActive()).releaseId,m.releaseId);assert.equal(await f.store.has(m.files[2]),false);
  assert.equal(f.requests.every(r=>r.options.credentials==='omit'&&r.options.redirect==='manual'),true);
});
test('another launcher session reuses verified files without downloading them again',async t=>{
 const f=await fixture(t,{'/index.html':'page','/js/app.js':'script'}),m=manifest(Object.entries(f.bodies).map(([p,b])=>row(p,b)));
 await f.store.prepare(m);const second=new ResourceStore({root:f.root,fetcher:()=>{throw Error('Network should not be needed');}});await second.initialize();
 const result=await second.prepare(m);assert.equal(result.transferred,0);assert.equal(second.hits,2);
});
test('updates fetch changed content only',async t=>{
 const f=await fixture(t,{'/index.html':'page','/js/app.js':'v1'}),m=manifest(Object.entries(f.bodies).map(([p,b])=>row(p,b)));
 await f.store.prepare(m);f.bodies['/js/app.js']='v2';const next=manifest([m.files[0],row('/js/app.js','v2')]);
 await f.store.prepare(next);assert.equal(f.requests.length,3);assert.equal((await f.store.readActive()).releaseId,next.releaseId);
});
test('an optional-only release activates cached essentials without downloads or rewriting an unchanged manifest',async t=>{
 const f=await fixture(t,{'/index.html':'page','/js/app.js':'script'}),m=manifest(Object.entries(f.bodies).map(([p,b])=>row(p,b)));
 await f.store.prepare(m);const next=manifest([...m.files,row('/assets/new.png','new image',false)]);
 assert.equal((await f.store.plan(next)).downloadBytes,0);await f.store.activateCached(next);
 assert.equal((await f.store.readActive()).releaseId,next.releaseId);assert.equal(f.requests.length,2);
 const activeFile=path.join(f.root,'active.json');await utimes(activeFile,new Date(1000),new Date(1000));
 await f.store.activateCached(next);assert.equal((await stat(activeFile)).mtimeMs,1000);
});
test('cached activation rejects same-size corruption and cancellation without publishing a release',async t=>{
 const f=await fixture(t,{'/index.html':'good'}),m=manifest([row('/index.html','good')]);await f.store.prepare(m);
 const next=manifest([...m.files,row('/assets/new.png','image',false)]);
 await assert.rejects(f.store.activateCached(next,{signal:AbortSignal.abort()}));
 await writeFile(f.store.objectPath(m.files[0].sha256),'evil');
 const plan=await f.store.plan(next);assert.equal(plan.missingFiles,1);assert.equal(plan.downloadBytes,4);
 await assert.rejects(f.store.activateCached(next),/준비되지 않은/);assert.equal((await f.store.readActive()).releaseId,m.releaseId);
 const progress=[];await f.store.prepare(next,{onProgress:p=>progress.push(p)});
 assert.equal(progress.at(-1).downloadTotal,4);assert.equal(progress.at(-1).transferred,4);
 assert.equal(await readFile(f.store.objectPath(m.files[0].sha256),'utf8'),'good');
});
test('download totals count only changed unique objects, separate from all checked bytes',async t=>{
 const f=await fixture(t,{'/index.html':'a long unchanged page','/js/app.js':'old'}),m=manifest(Object.entries(f.bodies).map(([p,b])=>row(p,b)));
 await f.store.prepare(m);f.bodies['/js/app.js']='new';f.bodies['/js/alias.js']='new';
 const next=manifest([m.files[0],row('/js/app.js','new'),row('/js/alias.js','new')]),plan=await f.store.plan(next);
 assert.equal(plan.files,2);assert.equal(plan.missingFiles,1);assert.equal(plan.downloadBytes,3);
 const progress=[];await f.store.prepare(next,{onProgress:p=>progress.push(p)});
 assert.equal(f.requests.length,3);assert.equal(progress.at(-1).transferred,3);assert.equal(progress.at(-1).downloadTotal,3);
 assert.equal(progress.at(-1).total,24);assert.equal(progress.at(-1).done,2);
});
test('a broken download cannot replace the working release and partial files are removed',async t=>{
 const f=await fixture(t,{'/index.html':'old'}),old=manifest([row('/index.html','old')]);await f.store.prepare(old);
 f.bodies['/index.html']='new';f.bodies['/js/app.js']='bad';const next=manifest([row('/index.html','new'),row('/js/app.js','good')]);
 await assert.rejects(f.store.prepare(next));assert.equal((await f.store.readActive()).releaseId,old.releaseId);
 assert.equal((await readdir(f.store.objects)).some(n=>n.endsWith('.part')),false);
 f.bodies['/js/app.js']='good';await f.store.prepare(next);assert.equal((await f.store.readActive()).releaseId,next.releaseId);
});
test('same-length corrupted files are repaired before launch',async t=>{
 const f=await fixture(t,{'/index.html':'good'}),m=manifest([row('/index.html','good')]);await f.store.prepare(m);
 await writeFile(f.store.objectPath(m.files[0].sha256),'evil');await f.store.prepare(m,{repair:true});
 assert.equal(await readFile(f.store.objectPath(m.files[0].sha256),'utf8'),'good');assert.equal(f.requests.length,2);
});
test('simultaneous asset requests share one verified download',async t=>{
 const f=await fixture(t,{'/index.html':'page'}),entry=row('/index.html','page');
 await Promise.all([f.store.ensure(entry,'a'.repeat(64)),f.store.ensure(entry,'a'.repeat(64))]);assert.equal(f.requests.length,1);
});
test('cancelled installation leaves the previous active version intact',async t=>{
 const f=await fixture(t,{'/index.html':'old'}),old=manifest([row('/index.html','old')]);await f.store.prepare(old);
 const controller=new AbortController();controller.abort();await assert.rejects(f.store.prepare(manifest([row('/index.html','new')]),{signal:controller.signal}));
 assert.equal((await f.store.readActive()).releaseId,old.releaseId);
});
test('game API responses and writes never resolve to cached assets',()=>{
 const m=manifest([row('/index.html','page'),row('/js/app.js','script')]);
 assert.equal(manifestEntry(m,GAME_ORIGIN+'/api/account'),null);assert.equal(manifestEntry(m,GAME_ORIGIN+'/js/app.js','POST'),null);
 assert.equal(manifestEntry(m,'https://other.example/js/app.js'),null);
 assert.equal(manifestEntry(m,GAME_ORIGIN+'/?source=windows-client').path,'/index.html');
 assert.equal(manifestEntry(m,GAME_ORIGIN+'/js/app.js?v=old').sha256,m.files[1].sha256);
});
test('cached media supports range, suffix, HEAD and invalid seek requests',async t=>{
 const f=await fixture(t,{'/assets/a.mp3':'0123456789'}),entry={...row('/assets/a.mp3','0123456789',false),type:'audio/mpeg'};
 const file=await f.store.ensure(entry,'a'.repeat(64));
 const a=fileResponse(file,entry,new Request(GAME_ORIGIN+'/assets/a.mp3',{headers:{Range:'bytes=2-5'}}));assert.equal(a.status,206);assert.equal(await a.text(),'2345');assert.equal(a.headers.get('Content-Range'),'bytes 2-5/10');
 assert.equal(await fileResponse(file,entry,new Request(GAME_ORIGIN+'/assets/a.mp3',{headers:{Range:'bytes=-3'}})).text(),'789');
 assert.equal(fileResponse(file,entry,new Request(GAME_ORIGIN+'/assets/a.mp3',{headers:{Range:'bytes=99-'}})).status,416);
 const head=fileResponse(file,entry,new Request(GAME_ORIGIN+'/assets/a.mp3',{method:'HEAD'}));assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Length'),'10');
});
test('storage cleanup only removes optional content inside the app cache',async t=>{
 const f=await fixture(t,{'/index.html':'page','/assets/a.png':'unused'}),m=manifest([row('/index.html','page'),row('/assets/a.png','unused',false)]);
 await f.store.prepare(m);await f.store.ensure(m.files[1],m.releaseId);f.store.budget=4;await f.store.prune(m);
 assert.equal(await f.store.has(m.files[0]),true);assert.equal(await f.store.has(m.files[1]),false);
});
test('deployment manifest hashes staged bytes and excludes account/tool files',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'soop-manifest-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const input={'index.html':'<html>\r\n</html>','js/app.js':'app','assets/a.png':'png','functions/_auth.js':'secret','scripts/ops/grant.json':'secret','packaging/windows-client/main.mjs':'native','_redirects':'/events/chuseok/* /events/golden-axe/ 302\n','events/chuseok/old.js':'retired','preview/account-rank-v1/mobile-review.html':'private review','preview/account-rank-v1/mock.json':'private fixture','preview/account-rank-v1/app.mjs':'public app'};
 for(const [file,content]of Object.entries(input)){await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),content);}
 const m=validateManifest(await buildClientManifest({root,files:Object.keys(input)}));assert.deepEqual(m.files.map(f=>f.path),['/assets/a.png','/index.html','/js/app.js','/preview/account-rank-v1/app.mjs']);
 assert.equal(m.files.find(f=>f.path==='/index.html').sha256,hash(input['index.html']));
});

test('Pages HTML canonical redirects stay on the game origin and verify content',async t=>{
 const f=await fixture(t,{}),calls=[];
 f.store.fetcher=async url=>{calls.push(url);return new URL(url).pathname==='/index.html'?new Response(null,{status:308,headers:{Location:'/?desktopRelease=test'}}):new Response('canonical');};
 await f.store.ensure(row('/index.html','canonical'),'a'.repeat(64));assert.equal(calls.length,2);assert.equal(new URL(calls[1]).origin,GAME_ORIGIN);
 const second=await fixture(t,{});second.store.fetcher=async()=>new Response(null,{status:302,headers:{Location:'https://other.example/index.html'}});
 await assert.rejects(second.store.ensure(row('/index.html','canonical'),'b'.repeat(64)),/다운로드 주소/);
 assert.equal((await readdir(second.store.objects)).length,0);
});
