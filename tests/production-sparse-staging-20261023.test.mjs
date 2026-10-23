import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,access,rm,readdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {prepareProductionAssets} from '../scripts/prepare-production-assets.mjs';

async function fixture(){
 const parent=await mkdtemp(path.join(tmpdir(),'cnine-sparse-stage-test-'));
 const primary=path.join(parent,'primary'),root=path.join(parent,'sparse'),deps=path.join(parent,'deps');
 const git=(args,cwd=primary,input)=>execFileSync('git',args,{cwd,input,stdio:['pipe','pipe','pipe']}).toString().trim();
 await mkdir(primary);await mkdir(deps);await mkdir(path.join(primary,'assets'));
 const originals=new Map([
  ['index.html',Buffer.from('<html>committed</html>')],['normal.txt',Buffer.from('normal tracked file')],
  ['assets/unchanged.webp',Buffer.from([0,12,255,10,13,0,77])],
  ['assets/changed.webp',Buffer.from('original sibling image')],
  ['assets/missing.webp',Buffer.from('missing sibling image')],
  ['assets/binary.webp',Buffer.from(Array.from({length:262153},(_,i)=>(i*17)%256))]
 ]);
 for(const [file,bytes] of originals)await writeFile(path.join(primary,file),bytes);
 git(['init','-q']);git(['config','user.name','Sparse staging test']);git(['config','user.email','sparse-test@example.invalid']);git(['config','core.autocrlf','false']);
 git(['add','.']);git(['commit','-qm','fixture']);git(['worktree','add','--detach',root,'HEAD']);
 git(['sparse-checkout','init','--no-cone'],root);
 git(['sparse-checkout','set','--no-cone','--stdin'],root,'/*\n!/assets/\n');
 assert.match(git(['ls-files','-v','--','assets/unchanged.webp'],root),/^S /);
 return {parent,primary,root,deps,git,originals,async close(){
  const actual=await realpath(parent);assert.equal(path.dirname(actual),await realpath(tmpdir()));assert(path.basename(actual).startsWith('cnine-sparse-stage-test-'));
  await rm(actual,{recursive:true,force:true});
 }};
}
test('sparse staging reuses only exact sibling blobs and streams remaining HEAD blobs without expanding checkout',async()=>{
 const f=await fixture();let stage;
 try{
  await writeFile(path.join(f.primary,'assets/changed.webp'),'dirty image must not ship');
  await rm(path.join(f.primary,'assets/missing.webp'));await rm(path.join(f.primary,'assets/binary.webp'));
  stage=await prepareProductionAssets({root:f.root,tempRoot:f.parent,dependencies:f.deps});
  assert.equal(stage.assetCount,7);assert.deepEqual(stage.restored,{hardlinked:1,gitBlobs:3});
  for(const [file,bytes] of f.originals)assert.deepEqual(await readFile(path.join(stage.directory,file)),bytes,file);
  const linked=await stat(path.join(stage.directory,'assets/unchanged.webp'));
  assert.equal(linked.ino,(await stat(path.join(f.primary,'assets/unchanged.webp'))).ino,'verified sibling is hardlinked');
  await assert.rejects(access(path.join(f.root,'assets/unchanged.webp')),{code:'ENOENT'});
  assert.equal(await readFile(path.join(f.primary,'assets/changed.webp'),'utf8'),'dirty image must not ship');
  const manifest=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json'),'utf8'));
  assert(manifest.files.some(row=>row.path==='/assets/binary.webp'&&row.bytes===262153));
  await stage.dispose();stage=null;await access(f.deps);
 }finally{await stage?.dispose();await f.close();}
});
test('a present working-tree change is preserved, never hidden by a HEAD fallback',async()=>{
 const f=await fixture();let stage;
 try{
  await writeFile(path.join(f.root,'index.html'),'<html>local changes</html>');
  stage=await prepareProductionAssets({root:f.root,files:['index.html'],tempRoot:f.parent,dependencies:f.deps});
  assert.equal(await readFile(path.join(stage.directory,'index.html'),'utf8'),'<html>local changes</html>');
  assert.deepEqual(stage.restored,{hardlinked:0,gitBlobs:0});
 }finally{await stage?.dispose();await f.close();}
});
test('missing non-sparse files fail and remove only the failed staging directory',async()=>{
 const f=await fixture();
 try{
  await rm(path.join(f.root,'normal.txt'));
  for(const file of ['normal.txt','unknown.webp'])await assert.rejects(prepareProductionAssets({root:f.root,files:['assets/unchanged.webp',file],tempRoot:f.parent,dependencies:f.deps}),/Refusing to restore missing release file/);
  assert.deepEqual((await readdir(f.parent)).filter(name=>name.startsWith('cnine-release-')),[]);
  assert.equal(await readFile(path.join(f.primary,'normal.txt'),'utf8'),'normal tracked file');
 }finally{await f.close();}
});
test('a changed staged sparse blob cannot silently deploy the old HEAD image',async()=>{
 const f=await fixture();
 try{
  const oid=f.git(['hash-object','-w','--stdin'],f.root,'staged new image');
  f.git(['update-index','--cacheinfo','100644',oid,'assets/unchanged.webp'],f.root);
  f.git(['update-index','--skip-worktree','assets/unchanged.webp'],f.root);
  await assert.rejects(prepareProductionAssets({root:f.root,files:['assets/unchanged.webp'],tempRoot:f.parent,dependencies:f.deps}),/Refusing to restore missing release file/);
  assert.deepEqual((await readdir(f.parent)).filter(name=>name.startsWith('cnine-release-')),[]);
 }finally{await f.close();}
});
