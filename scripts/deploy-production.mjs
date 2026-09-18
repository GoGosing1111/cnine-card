import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {readFileSync} from 'node:fs';

const args=process.argv.slice(2),assetsOnly=args.length===1&&args[0]==='--assets-only';
if(args.length&&!assetsOnly)throw Error('Supported option: --assets-only');
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
const run=(command,a)=>{const r=spawnSync(command,a,{stdio:'inherit',env:process.env});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);};
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
  const controls=new Set(['AGENTS.md','package.json','scripts/deploy-production.mjs']);
  if(changed.some(p=>!controls.has(p)&&! /^(assets|preview|docs)\//.test(p)))throw Error('Runtime changes require the normal production release gate.');
  if(changed.includes('package.json')){
    const previous=JSON.parse(git('show',`${base}:package.json`)),current=JSON.parse(readFileSync('package.json','utf8'));
    delete previous.scripts['deploy:production'];delete current.scripts['deploy:production'];
    if(JSON.stringify(previous)!==JSON.stringify(current))throw Error('Only the deployment entry point may change in an asset-only release.');
  }
  console.log('Asset-only release: full game tests skipped by explicit user instruction.');
}else if(process.platform==='win32')run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run release:gate']);
else run('npm',['run','release:gate']);
const wrangler=join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
run(process.execPath,[wrangler,'pages','deploy','.','--project-name','cnine-card','--branch','main']);
if(!assetsOnly)run(process.execPath,[wrangler,'deploy','--config','workers/clan-draft/wrangler.jsonc']);
