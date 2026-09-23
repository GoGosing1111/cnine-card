import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {scopedReleasePlan,runScopedReleaseChecks} from '../scripts/scoped-release-checks.mjs';

const base='a'.repeat(40),head='b'.repeat(40),path='tests/mercenary-police-restraint-20260923.test.mjs';
function fixture({changed=['js/example.js'],dirty='',ignored='',remote=head,ancestor=true,tracked=true,dependencies=false}={}){
 const env={SCOPED_DEPLOY_BASE:base,SCOPED_DEPLOY_REASON:'One local bug: reproduce it and verify only its affected paths',SCOPED_DEPLOY_TESTS:JSON.stringify([path])};
 const scripts={'test:release-policy':'node --test tests/scoped-release-policy-20260923.test.mjs','check:worker':'node scripts/check-worker-build.mjs'};
 const git=(...args)=>{
  if(args[0]==='status')return dirty;
  if(args[0]==='ls-files'){if(args.includes('--error-unmatch')){if(!tracked)throw Error('untracked test');return path;}return ignored;}
  if(args[0]==='rev-parse')return args[1]==='HEAD'?head:remote;
  if(args[0]==='merge-base'){if(!ancestor)throw Error('unrelated base');return '';}
  if(args[0]==='diff')return changed.join('\n');
  if(args[0]==='show')return JSON.stringify({dependencies:{pixi:dependencies&&args[1].startsWith('HEAD:')?'2':'1'}});
  throw Error('Unexpected git '+args.join(' '));
 };
 return {env,scripts,git};
}
test('focused selection stays small and deduplicates files without invoking the full gate',()=>{
 const f=fixture();f.env.SCOPED_DEPLOY_TESTS=JSON.stringify([path,path]);
 assert.deepEqual(scopedReleasePlan(f).tests,[path]);assert.deepEqual(scopedReleasePlan(f).checks,[]);
});
test('scoped deployment preserves clean commit, ignored-file, main and ancestor guards',()=>{
 for(const options of [{dirty:'M js/a.js'},{ignored:'.cache/x'},{remote:base},{ancestor:false},{tracked:false},{changed:[]}])
  assert.throws(()=>scopedReleasePlan(fixture(options)));
 for(const fields of [{SCOPED_DEPLOY_BASE:'HEAD~1'},{SCOPED_DEPLOY_REASON:'short'},{SCOPED_DEPLOY_TESTS:'[]'},{SCOPED_DEPLOY_TESTS:'[]',SCOPED_DEPLOY_CHECKS:'["check:worker"]'}])
  assert.throws(()=>scopedReleasePlan({...fixture(),env:{...fixture().env,...fields}}));
});
test('selection rejects malformed arrays, traversal, glob, shell flags and non-test scripts',()=>{
 for(const input of ['{}','not JSON','[3]','["tests/../package.json"]','["/tmp/test.mjs"]','["tests/*.mjs"]','["--test"]'])
  assert.throws(()=>scopedReleasePlan({...fixture(),env:{...fixture().env,SCOPED_DEPLOY_TESTS:input}}));
 for(const input of ['["release:gate"]','["deploy:production"]','["test:missing"]','["test:a & echo bad"]'])
  assert.throws(()=>scopedReleasePlan({...fixture(),env:{...fixture().env,SCOPED_DEPLOY_CHECKS:input}}));
});
test('DB, auth, infrastructure and dependency changes retain the full-release requirement',()=>{
 for(const file of ['wrangler.toml','workers/clan-draft/wrangler.jsonc','package-lock.json','migrations/001.mjs','scripts/ops/change.sql','functions/_postgres_d1_compat.js','functions/_auth.js','functions/_schema.js','functions/_db.js'])
  assert.throws(()=>scopedReleasePlan(fixture({changed:[file]})),/full release gate/);
 assert.throws(()=>scopedReleasePlan(fixture({changed:['package.json'],dependencies:true})),/full release gate/);
 assert.doesNotThrow(()=>scopedReleasePlan(fixture({changed:['package.json']})));
});
test('small backend and V3 fixes automatically retain compilation and real loader regressions',()=>{
 const plan=scopedReleasePlan(fixture({changed:['functions/_mercenary_combat.js','preview/project-v-v3/source/battle/MercenaryCombatPlayback.js','js/battle-v3-live.js']}));
 assert.deepEqual(plan.checks,['check:worker']);assert.deepEqual(plan.tests,[path,'tests/pve-battlefield-entry-v2117.test.mjs']);
});
test('selected tests run once, guard follows them, and a failed test stops execution',()=>{
 for(const platform of ['win32','linux']){
  const calls=[],f=fixture({changed:['functions/_mercenary_combat.js']});
  runScopedReleaseChecks({...f,platform,execPath:'node',run:(...args)=>calls.push(args),log:()=>{}});
  assert.deepEqual(calls[0],['node',['--test',path]]);
  assert.deepEqual(calls[1],platform==='win32'?['cmd.exe',['/d','/s','/c','npm run check:worker']]:['npm',['run','check:worker']]);
  assert.deepEqual(calls[2],['node',['scripts/verify-production-release.mjs']]);
  let invoked=0;assert.throws(()=>runScopedReleaseChecks({...f,run:()=>{invoked++;throw Error('failed test');},log:()=>{}}),/failed test/);assert.equal(invoked,1);
 }
});
test('actual deploy entry supports scoped checks and preserves cache guard before both uploads',()=>{
 const url=new URL('../scripts/deploy-production.mjs',import.meta.url);
 const source=readFileSync(url,'utf8').replace(/^import .*;\r?$/gm,'').replaceAll('import.meta.url',JSON.stringify(url.href));
 for(const platform of ['win32','linux'])for(const fail of [false,true]){
  const calls=[],f=fixture();
  const context={console:{log:()=>{}},process:{argv:['node','deploy-production.mjs','--scoped'],platform,execPath:'node',env:f.env,exit:code=>{throw Error('exit '+code);}},
   execFileSync:(command,args)=>{assert.equal(command,'git');return f.git(...args);},
   spawnSync:(command,args)=>{calls.push([command,...args]);return {status:fail&&args[0]==='--test'?1:0};},
   runScopedReleaseChecks:options=>runScopedReleaseChecks({...options,platform,execPath:'node',log:()=>{}}),
   verifyProductionHyperdriveCache:()=>calls.push(['cache guard']),
   createRequire:()=>({resolve:()=>'/tools/wrangler/package.json'}),dirname:()=>'/tools/wrangler',join:(...p)=>p.join('/'),
   readFileSync:p=>{assert.equal(p,'package.json');return JSON.stringify({scripts:f.scripts});}};
  if(fail){assert.throws(()=>runInNewContext(source,context),/exit 1/);assert.equal(calls.length,1);}
  else{runInNewContext(source,context);assert.equal(calls.length,5);assert.deepEqual(calls[2],['cache guard']);assert.equal(calls[3][2],'pages');assert.equal(calls[4][2],'deploy');}
 }
});
test('policy-only commits do not block the next asset release, while dependencies still do',()=>{
 const url=new URL('../scripts/deploy-production.mjs',import.meta.url);
 const source=readFileSync(url,'utf8').replace(/^import .*;\r?$/gm,'').replaceAll('import.meta.url',JSON.stringify(url.href));
 for(const dependencies of [false,true]){
  const calls=[],before={dependencies:{pixi:'1'},scripts:{'deploy:production':'node scripts/deploy-production.mjs','release:gate':'old tests'}},
   current={dependencies:{pixi:dependencies?'2':'1'},scripts:{...before.scripts,'release:gate':'new tests','test:release-policy':'node --test tests/scoped-release-policy-20260923.test.mjs'}},
   f=fixture({changed:['package.json','scripts/scoped-release-checks.mjs','tests/scoped-release-policy-20260923.test.mjs','assets/new.png']});
  const context={console:{log:()=>{}},process:{argv:['node','deploy-production.mjs','--assets-only'],platform:'linux',execPath:'node',env:{ASSET_DEPLOY_BASE:base},exit:code=>{throw Error('exit '+code);}},
   execFileSync:(_command,args)=>args[0]==='show'?JSON.stringify(before):f.git(...args),
   spawnSync:(command,args)=>{calls.push([command,...args]);return {status:0};},
   verifyProductionHyperdriveCache:()=>calls.push(['cache guard']),
   createRequire:()=>({resolve:()=>'/tools/wrangler/package.json'}),dirname:()=>'/tools/wrangler',join:(...p)=>p.join('/'),readFileSync:()=>JSON.stringify(current)};
  if(dependencies){assert.throws(()=>runInNewContext(source,context),/Only deployment\/test/);assert.equal(calls.length,0);}
  else{runInNewContext(source,context);assert.equal(calls.length,2);assert.deepEqual(calls[0],['cache guard']);assert.equal(calls[1][2],'pages');}
 }
});
