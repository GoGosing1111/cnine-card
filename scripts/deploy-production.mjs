import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {verifyProductionHyperdriveCache} from './verify-hyperdrive-cache.mjs';
import {runScopedReleaseChecks} from './scoped-release-checks.mjs';

const args=process.argv.slice(2),assetsOnly=args.length===1&&args[0]==='--assets-only';
const scoped=args.length===1&&args[0]==='--scoped';
if(args.length&&!assetsOnly&&!scoped)throw Error('Supported options: --assets-only or --scoped');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
const run=(command,a,env=process.env)=>{const r=spawnSync(command,a,{stdio:'inherit',env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);};
const productionEnv={...process.env,CLOUDFLARE_ACCOUNT_ID:'1e7c59450a8b6e34a9d87f92ca02aeaa'};
const assetConnectionOnly=(path,base)=>{
  const cacheFiles=new Set(['index.html','js/app.js','js/project-v-battle-art-adapter-v1.js']);
  if(!cacheFiles.has(path)&&path!=='js/responsive-battle-sprites-v1815.js')return false;
  const previous=git('show',`${base}:${path}`).replace(/\r\n/g,'\n').trim();
  const current=readFileSync(path,'utf8').replace(/\r\n/g,'\n').trim();
  if(cacheFiles.has(path)){
    // An SD asset release may refresh this query value, never battle logic or versions.
    const withoutSdCache=text=>text.replace(/([?&](?:amp;)?sd=)[A-Za-z0-9_-]+/g,'$1<asset-cache>');
    return withoutSdCache(previous)===withoutSdCache(current);
  }
  if(!current.startsWith(previous+'\n'))return false;
  const added=current.slice(previous.length).trim();
  const match=added.match(/^window\.CNineResponsiveBattleSprites=Object\.freeze\(Object\.assign\(\{\},window\.CNineResponsiveBattleSprites\|\|\{\},(\{[^\n]+\})\)\);$/);
  if(!match)return false;
  let rows;try{rows=Object.entries(JSON.parse(match[1]));}catch{return false;}
  return rows.length>0&&rows.every(([source,target])=>{
    if(!/^assets\/ui\/project-v\/characters\/[a-z-]+\/[a-z0-9-]+\.png$/.test(source))return false;
    if(!/^\/assets\/responsive\/project-v\/[a-z-]+\/[a-z0-9-]+-768\.webp$/.test(target))return false;
    if(target.split('/').at(-1)!==source.split('/').at(-1).replace(/\.png$/,'-768.webp'))return false;
    try{return readFileSync(source).length>0&&readFileSync(target.slice(1)).length>0;}catch{return false;}
  });
};
if(assetsOnly){
  // Explicit user instruction, 2026-09-19: image uploads skip the full game suite.
  // Require a known deployed base and keep runtime/backend changes out of this path.
  const base=process.env.ASSET_DEPLOY_BASE;
  if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('Set ASSET_DEPLOY_BASE to the last deployed commit SHA.');
  if(git('status','--porcelain','--untracked-files=all'))throw Error('Commit the asset release before deploying.');
  if(git('ls-files','--others','--ignored','--exclude-standard'))throw Error('Keep ignored files outside the deployment directory.');
  if(git('rev-parse','HEAD')!==git('rev-parse','origin/main'))throw Error('Push the release to origin/main first.');
  git('merge-base','--is-ancestor',base,'HEAD');
  const changed=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean);
  const controls=new Set(['AGENTS.md','package.json','scripts/deploy-production.mjs','scripts/scoped-release-checks.mjs','tests/scoped-release-policy-20260923.test.mjs','tests/project-v-zenith-sd-assets-v1.mjs']);
  if(changed.some(p=>!controls.has(p)&&! /^(assets|preview|docs)\//.test(p)&&!assetConnectionOnly(p,base)))throw Error('Runtime changes require the normal production release gate.');
  if(changed.includes('package.json')){
    const previous=JSON.parse(git('show',`${base}:package.json`)),current=JSON.parse(readFileSync('package.json','utf8'));
    for(const pkg of [previous,current])for(const name of Object.keys(pkg.scripts||{}))
      if(name==='deploy:production'||name==='release:gate'||name.startsWith('test:'))delete pkg.scripts[name];
    if(JSON.stringify(previous)!==JSON.stringify(current))throw Error('Only deployment/test scripts may change in an asset-only package update.');
  }
  console.log('Asset-only release: full game tests skipped by explicit user instruction.');
}else if(scoped){
  runScopedReleaseChecks({env:process.env,git,run,scripts:JSON.parse(readFileSync('package.json','utf8')).scripts});
}else if(process.platform==='win32')run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run release:gate']);
else run('npm',['run','release:gate']);
const wrangler=join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
verifyProductionHyperdriveCache({wrangler,env:productionEnv,message:'Hyperdrive query cache must be disabled for cnine-card (stale reads break draw/raid/energy).'});
run(process.execPath,[wrangler,'pages','deploy','.','--project-name','cnine-card','--branch','main'],productionEnv);
if(!assetsOnly)run(process.execPath,[wrangler,'deploy','--config','workers/clan-draft/wrangler.jsonc'],productionEnv);
