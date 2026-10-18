import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,link,copyFile,symlink,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildClientManifest} from './build-windows-client-manifest.mjs';
// Preserve originals, preview pages and fixture imports. Executable test runners
// and QA audit reports stay in Git/release checks without consuming Pages assets.
// Game/preview code has no docs/qa imports; approved assets and previews stay intact.
// Jokro reads packed atlases in both preview and live play. The 132 individual
// extraction frames remain in Git for QA; approved source sheets and atlases ship.
// Martial-law authoring originals/prompts and isolated QA stay in Git. Only
// its WebP images, manifest and runtime code consume the bounded Pages budget.
const martialAuthoringOnly=new Set(['assets/ui/martial-law-20261018/illustration-source.png','assets/ui/martial-law-20261018/ui-source.png','assets/ui/martial-law-20261018/prompts.json','tests/helpers/martial-law-fixture.mjs','docs/martial-law-20261018.md']);
// These isolated DB fixtures have no runtime or preview consumers. Keep their
// sources for regression tests without spending the last Pages asset slots.
export const isolatedQaFixtures=new Set(['admin-forge-ticket-fixture','auction-fixture-20260926','funding-gift-fixture','worm-contest-gift-fixture','supporter-pass-fixture','supporter-application-fixture','server-support-fixture','seal-star-fixture','recruitment-gift-fixture','pingdu-thanks-gift-fixture'].map(name=>'tests/helpers/'+name+'.mjs'));
// scripts/qa-* are Node/Playwright runners, not browser imports. Keep them in Git
// alongside the other unshipped runners so new game art fits the Pages file cap.
export const isProductionFile=file=>! /^(?:tests|preview)\/.*(?:\.test\.[cm]?js|\.browser\.mjs)$/.test(file)&&! /^scripts\/qa-[^/]+\.[cm]?js$/.test(file)&&!file.startsWith('packaging/windows-client/')&&!file.startsWith('docs/qa/')&&!file.startsWith('preview/mercenary-jokro-iaido-20261017-v1/assets/frames/')&&!martialAuthoringOnly.has(file)&&!isolatedQaFixtures.has(file);
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
