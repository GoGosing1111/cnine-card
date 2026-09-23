// Explicit user policy, 2026-09-23: focused regressions for small changes.
const list=(value,label)=>{
 let items;try{items=JSON.parse(value||'[]');}catch{throw Error(label+' must be a JSON array');}
 if(!Array.isArray(items)||items.some(x=>typeof x!=='string'))throw Error(label+' must be an array of strings');
 return [...new Set(items)];
};
export function scopedReleasePlan({env,git,scripts}){
 const base=env.SCOPED_DEPLOY_BASE,reason=String(env.SCOPED_DEPLOY_REASON||'').trim();
 if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('SCOPED_DEPLOY_BASE must be the last deployed commit SHA');
 if(reason.length<20)throw Error('Explain the change and test selection in SCOPED_DEPLOY_REASON (20+ characters)');
 if(git('status','--porcelain','--untracked-files=all'))throw Error('Commit the scoped release before deploying');
 if(git('ls-files','--others','--ignored','--exclude-standard'))throw Error('Keep ignored files outside the deployment directory');
 if(git('rev-parse','HEAD')!==git('rev-parse','origin/main'))throw Error('Push the scoped release to origin/main first');
 git('merge-base','--is-ancestor',base,'HEAD');
 const changed=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean);
 if(!changed.length)throw Error('No changes since the deployed base');
 if(changed.some(p=>/(?:^|\/)wrangler\.(?:toml|jsonc?)$/.test(p)||/^(?:package-lock\.json|migrations\/|functions\/(?:_postgres_d1_compat|_auth[^/]*|_schema[^/]*|_db[^/]*)\.js)/.test(p)||/\.sql$/.test(p)))
  throw Error('DB, authentication, dependency or infrastructure changes require the full release gate');
 if(changed.includes('package.json')){
  const before=JSON.parse(git('show',base+':package.json')),after=JSON.parse(git('show','HEAD:package.json'));
  for(const key of ['dependencies','devDependencies','optionalDependencies','peerDependencies','overrides','engines'])
   if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error('Dependency changes require the full release gate');
 }
 const tests=list(env.SCOPED_DEPLOY_TESTS,'SCOPED_DEPLOY_TESTS'),checks=list(env.SCOPED_DEPLOY_CHECKS,'SCOPED_DEPLOY_CHECKS');
 if(!tests.length&&!checks.some(name=>name.startsWith('test:')))throw Error('Select at least one related regression test; compilation alone is not enough');
 if(tests.some(p=>!/^(?:tests|preview)\/[a-zA-Z0-9_./-]+\.(?:mjs|cjs|js)$/.test(p)||p.split('/').includes('..')))throw Error('Use exact repository-relative test files; no globs or traversal');
 if(checks.some(name=>!(/^(?:test:[a-zA-Z0-9_-]+|check:worker)$/.test(name))||!Object.hasOwn(scripts,name)))throw Error('Select existing test:* or check:worker npm scripts only');
 if(tests.length)git('ls-files','--error-unmatch','--',...tests);
 if(changed.some(p=>/^(?:functions|workers)\//.test(p))&&!checks.includes('check:worker'))checks.push('check:worker');
 // A small common renderer patch still checks the shipped engine/loader contract.
 if(changed.some(p=>/^preview\/project-v-v3\/(?:source\/|project-v-pixi-battle\.bundle\.js$)/.test(p)||p==='js/battle-v3-live.js')){
  const entry='tests/pve-battlefield-entry-v2117.test.mjs';
  if(!tests.includes(entry)&&!checks.includes('test:live-connections'))tests.push(entry);
 }
 return {base,reason,changed,tests,checks};
}

export function runScopedReleaseChecks({env,git,run,scripts,platform=process.platform,execPath=process.execPath,log=console.log}){
 const plan=scopedReleasePlan({env,git,scripts});
 log('[SCOPED RELEASE] '+JSON.stringify(plan));
 if(plan.tests.length)run(execPath,['--test',...plan.tests]);
 for(const name of plan.checks){
  if(platform==='win32')run(env.ComSpec||'cmd.exe',['/d','/s','/c','npm run '+name]);
  else run('npm',['run',name]);
 }
 // Preserve clean source, approved release flags and cache compatibility checks.
 run(execPath,['scripts/verify-production-release.mjs']);
 return plan;
}
