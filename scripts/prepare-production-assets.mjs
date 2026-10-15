import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,link,copyFile,symlink,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildClientManifest} from './build-windows-client-manifest.mjs';
// Preserve originals, preview pages and fixture imports. Executable test runners
// and QA audit reports stay in Git/release checks without consuming Pages assets.
// Game/preview code has no docs/qa imports; approved assets and previews stay intact.
export const isProductionFile=file=>! /^(?:tests|preview)\/.*(?:\.test\.[cm]?js|\.browser\.mjs)$/.test(file)&&!file.startsWith('packaging/windows-client/')&&!file.startsWith('docs/qa/');
export async function prepareProductionAssets({root=process.cwd(),files,tempRoot=tmpdir(),dependencies}={}){
 files||=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const selected=files.filter(isProductionFile),assetCount=selected.filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 if(assetCount>20000)throw Error('Pages asset count exceeds the verified 20,000-file limit: '+assetCount);
 const directory=await mkdtemp(path.join(tempRoot,'cnine-release-')),prefix=path.resolve(root)+path.sep;
 for(const file of selected){const source=path.resolve(root,file),target=path.resolve(directory,file);if(!source.startsWith(prefix)||!target.startsWith(directory+path.sep))throw Error('Invalid release path');await mkdir(path.dirname(target),{recursive:true});try{await link(source,target);}catch{await copyFile(source,target);}}
 await buildClientManifest({root:directory,files:selected,writeTo:path.join(directory,'client/windows/manifest.json')});
 dependencies||=path.dirname(path.dirname(createRequire(import.meta.url).resolve('pg/package.json')));
 await symlink(dependencies,path.join(directory,'node_modules'),process.platform==='win32'?'junction':'dir');
 return {directory,assetCount,excluded:files.length-selected.length,async dispose(){
  const actual=await realpath(directory),parent=await realpath(tempRoot);
  if(path.dirname(actual)!==parent||!path.basename(actual).startsWith('cnine-release-'))throw Error('Refusing cleanup outside the release staging directory');
  await rm(actual,{recursive:true,force:true});
 }};
}
