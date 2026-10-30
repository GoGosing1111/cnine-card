import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createStoreDistribution} from '../packaging/onestore/windows/distribution.mjs';
import {GAME_ORIGIN,MANIFEST_PATH,MAX_MANIFEST_BYTES} from '../packaging/windows-client/lib/policy.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const entry=(file,value,essential=true)=>({path:file,sha256:hash(value),bytes:Buffer.byteLength(value),essential});
const remote={schema:1,origin:GAME_ORIGIN,releaseId:hash('public release'),minimumClientVersion:'0.1.0',files:[entry('/index.html','remote unrestricted page'),entry('/js/coin-prediction-v1.js','excluded'),entry('/js/clan-prison-camp-v1.js','excluded'),entry('/js/server-support-v1.js','excluded'),entry('/assets/allowed.png','normal',false)]};
async function fixture(fetcher=async()=>new Response(JSON.stringify(remote))){
 const root=await mkdtemp(path.join(process.env.ONESTORE_QA_DIR||os.tmpdir(),'onestore-distribution-'));
 await mkdir(path.join(root,'js'));
 const files=[entry('/index.html','permanent store page'),entry('/js/store-distribution-v1.js','permanent store policy')];
 await writeFile(path.join(root,'index.html'),'permanent store page');
 await writeFile(path.join(root,'js/store-distribution-v1.js'),'permanent store policy');
 await writeFile(path.join(root,'manifest.json'),JSON.stringify({schema:1,channel:'onestore',files}));
 return {root,files,distribution:await createStoreDistribution({bundleRoot:root,fetcher})};
}
test('every public release keeps bundled restrictions and excludes removed assets',async()=>{
 const {distribution,files}=await fixture();const first=distribution.mergeManifest(remote);
 assert.deepEqual(first.files.map(f=>f.path).sort(),['/assets/allowed.png',...files.map(f=>f.path)].sort());
 assert.equal(first.files.find(f=>f.path==='/index.html').sha256,files[0].sha256);
 assert.equal(first.releaseId,distribution.mergeManifest(remote).releaseId);
 assert.notEqual(first.releaseId,distribution.mergeManifest({...remote,releaseId:hash('next release')}).releaseId);
 assert.equal(first.minimumClientVersion,remote.minimumClientVersion);
});
test('root, canonical index and cache-busting aliases use verified local files',async()=>{
 const {distribution,files}=await fixture(()=>{throw Error('Bundled files must not reach network');});
 const manifest=distribution.mergeManifest(remote);
 for(const route of ['/','/index','/index.html?update=next']){
  assert.equal(distribution.entry(manifest,GAME_ORIGIN+route).sha256,files[0].sha256);
  assert.equal(await (await distribution.fetch(GAME_ORIGIN+route)).text(),'permanent store page');
 }
 const head=await distribution.fetch(GAME_ORIGIN+'/index',{method:'HEAD'});
 assert.equal(await head.text(),'');assert.equal(Number(head.headers.get('content-length')),files[0].bytes);
 assert.equal(distribution.entry(manifest,'https://playdk.kr/'),null);
 assert.equal(distribution.entry(manifest,GAME_ORIGIN+'/', 'POST'),null);
});
test('native transport rejects restricted endpoints without calling network',async()=>{
 const {distribution}=await fixture(()=>{throw Error('Forbidden network request');});
 for(const route of ['/api/coin-prediction/join','/api/prison-camp/release','/api/prison-death-game/start','/api/server-support/apply','/api/supporter-season-pass/claim','/api/admin/users','/admin/','/js/coin-prediction-v1.js']){
  assert.equal((await distribution.fetch(GAME_ORIGIN+route,{method:'POST',body:'{}'})).status,403);
 }
});
test('ordinary APIs retain headers, method, body and response',async()=>{
 let captured;const result=new Response('{"ok":true}',{status:201});
 const {distribution}=await fixture(async(url,options)=>{captured={url,options};return result;});
 const options={method:'POST',headers:{authorization:'fixture-token'},body:'{"value":42}'};
 assert.equal(await distribution.fetch(GAME_ORIGIN+'/api/allowed',options),result);
 assert.deepEqual(captured,{url:GAME_ORIGIN+'/api/allowed',options});
});
test('manifest response is merged and invalid or oversized data is rejected',async()=>{
 const {distribution}=await fixture();
 assert.deepEqual(await (await distribution.fetch(GAME_ORIGIN+MANIFEST_PATH)).json(),distribution.mergeManifest(remote));
 const invalid=await fixture(async()=>new Response(JSON.stringify({...remote,files:[entry('/../secrets.txt','bad')]})));
 await assert.rejects(invalid.distribution.fetch(GAME_ORIGIN+MANIFEST_PATH));
 const oversized=await fixture(async()=>new Response('{}',{headers:{'content-length':String(MAX_MANIFEST_BYTES+1)}}));
 await assert.rejects(oversized.distribution.fetch(GAME_ORIGIN+MANIFEST_PATH),/too large/);
});
test('tampered bundled content fails closed before it can run',async()=>{
 const {root,distribution}=await fixture();
 await writeFile(path.join(root,'index.html'),'unrestricted replacement');
 await assert.rejects(distribution.fetch(GAME_ORIGIN+'/'),/verification failed/);
});
test('native ONE store QA stays in Git and outside the bounded Pages artifact',()=>{
 assert.equal(isProductionFile('tests/onestore-windows-20261030.native.mjs'),false);
 assert.equal(isProductionFile('packaging/onestore/windows/distribution.mjs'),false);
 for(const file of ['index.html','js/app.js','functions/api/[[path]].js'])assert.equal(isProductionFile(file),true);
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:40e6}).split('\0').filter(Boolean);
 const count=files.filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file)).length+1;
 assert(count<=20000,'Pages asset count '+count);
});
