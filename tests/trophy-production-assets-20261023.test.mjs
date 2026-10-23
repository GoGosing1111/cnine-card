import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isProductionFile,prepareProductionAssets,trophyNodeQaOnly} from '../scripts/prepare-production-assets.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const assetRoot='assets/ui/player-card/milestones-20261023/';
const read=file=>readFile(path.join(root,file));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=args=>execFileSync('git',args,{cwd:root,maxBuffer:40e6}).toString();

test('only new trophy authoring and three exact Node validators leave the Pages artifact',async()=>{
 const manifest=JSON.parse(await read(assetRoot+'manifest.json'));
 assert.equal(manifest.assets.length,3);
 for(const asset of manifest.assets){
  assert.equal(isProductionFile(assetRoot+asset.runtime),true);
  assert.equal(isProductionFile(assetRoot+asset.original),false);
  assert.equal(hash(await read(assetRoot+asset.runtime)),asset.runtimeSha256);
  assert.equal(hash(await read(assetRoot+asset.original)),asset.originalSha256);
 }
 for(const name of ['prompts.json','manifest.json'])assert.equal(isProductionFile(assetRoot+name),false);
 assert.deepEqual([...trophyNodeQaOnly],['scripts/validate-v1676.mjs','scripts/validate-v1677.mjs','scripts/validate-v1680.mjs']);
 for(const file of trophyNodeQaOnly){assert.equal(isProductionFile(file),false);assert.match((await read(file)).toString(),/from 'node:fs'/);}
 // No neighboring originals, new runtime metadata or unrelated scripts are swept up.
 for(const file of ['assets/ui/player-card/legacy-original.png',assetRoot+'runtime.json',assetRoot+'nested/original.png','scripts/validate-unrelated.mjs'])assert.equal(isProductionFile(file),true,file);
});

test('three trophy WebPs ship intact, original files survive staging and projected main fits Pages cap',async()=>{
 const manifest=JSON.parse(await read(assetRoot+'manifest.json'));
 const runtime=manifest.assets.map(asset=>assetRoot+asset.runtime);
 const authoring=[...manifest.assets.map(asset=>assetRoot+asset.original),assetRoot+'prompts.json',assetRoot+'manifest.json'];
 const files=[...runtime,...authoring,...trophyNodeQaOnly],originals=new Map();
 for(const file of files)originals.set(file,hash(await read(file)));
 const main=git(['ls-tree','-r','--name-only','-z','origin/main']).split('\0').filter(Boolean);
 for(const file of trophyNodeQaOnly)assert(main.includes(file),'Validator remains preserved in Git: '+file);
 const candidate=[...new Set([...main,...runtime,...authoring])];
 const count=candidate.filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file)).length+1;
 assert(count<=20000,`Projected Pages file count ${count} exceeds 20000`);
 const stage=await prepareProductionAssets({root,files});
 try{
  assert.equal(stage.assetCount,4,'Three WebPs and the generated desktop manifest');
  for(const file of runtime)assert.equal(hash(await readFile(path.join(stage.directory,file))),originals.get(file));
  for(const file of [...authoring,...trophyNodeQaOnly])await assert.rejects(access(path.join(stage.directory,file)),{code:'ENOENT'});
  const desktop=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json')));
  for(const file of runtime)assert(desktop.files.some(item=>item.path==='/'+file));
 }finally{await stage.dispose();}
 for(const [file,sha] of originals)assert.equal(hash(await read(file)),sha,'Repository original retained: '+file);
 console.log(`Trophy delivery projected main: ${count}/20000 files; three WebPs ship and all originals remain.`);
});
