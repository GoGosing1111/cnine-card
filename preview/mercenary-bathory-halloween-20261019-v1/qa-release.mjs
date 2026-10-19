import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareProductionAssets,isProductionFile} from '../../scripts/prepare-production-assets.mjs';
import {verifyProductionHyperdriveCache} from '../../scripts/verify-hyperdrive-cache.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),require=createRequire(import.meta.url);
const wrangler=join(dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js'),env={...process.env,CLOUDFLARE_ACCOUNT_ID:'1e7c59450a8b6e34a9d87f92ca02aeaa'};
const files=[...new Set(execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,maxBuffer:40e6}).toString().split('\0').filter(Boolean))];
const shipped=files.filter(isProductionFile),index=await fs.readFile(join(root,'index.html'),'utf8'),sw=await fs.readFile(join(root,'service-worker.js'),'utf8');
assert.equal(index.match(/js\/app\.js\?v=([^"'&]+)/)?.[1],sw.match(/soop-card-shell-v([^']+)/)?.[1]);
const required=['shared/mercenary-bathory-v1.mjs',...['source-art.png','sd.png','art-320.webp','art-640.webp'].map(s=>'assets/ui/project-v/mercenaries/bathory-halloween-20261019/'+s),...['index.html','battle.html','preview.bundle.js','preview.css','fit-preview.mjs','manifest.json','motion.mjs','release-plan.json','review-1x.webm',...['idle','dash','attack','skill','hit','defeat'].map(s=>'assets/atlases/'+s+'.png'),...['drive-v1','cut-v2','rupture-v2'].map(s=>'assets/effects/'+s+'.png')].map(s=>'preview/mercenary-bathory-halloween-20261019-v1/'+s)];
for(const file of required)assert(shipped.includes(file),'Missing runtime delivery: '+file);
for(const file of shipped)assert((await fs.stat(join(root,file))).size<25*1024*1024,'Oversized Pages file: '+file);
const hyperdrive=verifyProductionHyperdriveCache({root,wrangler,env});
const stage=await prepareProductionAssets({root,files});
try{
 const compile=spawnSync(process.execPath,[wrangler,'deploy','--config','workers/api-runtime/wrangler.jsonc','--dry-run','--outdir',join(stage.directory,'.worker-compile')],{cwd:stage.directory,env,encoding:'utf8',timeout:60000,windowsHide:true,maxBuffer:20e6});
 if(compile.status!==0)throw Error('Worker dry-run compilation failed: '+(compile.stderr||compile.error?.message||compile.stdout));
 const report={checkedAt:new Date().toISOString(),status:'READY_FOR_USER_REVIEW',productionDeployed:false,productionDatabaseMutated:false,assetCount:stage.assetCount,excluded:stage.excluded,requiredResources:required.length,cacheTagsMatch:true,hyperdrive,workerDryRun:'PASS',approvalGate:'Waiting for user visual/release approval; origin/main and live state are rechecked at release.'};
 await fs.writeFile(new URL('qa/release-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await stage.dispose();}
