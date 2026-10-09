import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fullGateResumePlan} from '../scripts/resume-release-gate.mjs';

const base='a'.repeat(40),head='b'.repeat(40);
function fixture({changed=['tests/b.test.mjs'],dirty='',ignored='',remote=head,log,previous,ancestor=true}={}){
  const scripts={'test:a':'node --test tests/a.test.mjs','test:b':'node --test tests/b.test.mjs','test:c':'node --test tests/c.test.mjs','release:gate':'npm run test:a && npm run test:b && npm run test:c && node scripts/verify-production-release.mjs'};
  const logText=log??`> release:gate\n> ${scripts['release:gate']}\n> test:a\nℹ fail 0\n> test:b\nℹ fail 4\n`;
  const env={RELEASE_GATE_RESUME_BASE:base,RELEASE_GATE_RESUME_SHA256:createHash('sha256').update(logText).digest('hex')};
  const git=(...args)=>{
    if(args[0]==='status')return dirty;
    if(args[0]==='ls-files')return ignored;
    if(args[0]==='rev-parse')return args[1]==='HEAD'?head:remote;
    if(args[0]==='merge-base'){if(!ancestor)throw Error('unrelated');return '';}
    if(args[0]==='show')return JSON.stringify({scripts:previous||scripts});
    if(args[0]==='diff')return changed.join('\n');
    throw Error('Unexpected git command');
  };
  return {env,git,scripts,logText};
}
test('full gate resumes a proven prefix and retains failed, remaining and final release guards',()=>{
  const plan=fullGateResumePlan(fixture());assert.equal(plan.reused,1);
  assert.deepEqual(plan.commands.slice(1),['npm run test:b','npm run test:c','node scripts/verify-production-release.mjs']);
  assert.match(plan.commands[0],/resume-release-gate\.test\.mjs/);
});

test('only an equivalent main asset query permutation retains backend passes and rechecks HTML contracts',()=>{
  const f=fixture({changed:['index.html']}),before='<script src="js/app.js?city=1&amp;v=20261009"></script>',after='<script src="js/app.js?v=20261009&amp;city=1"></script>';
  const git=f.git;f.git=(...a)=>a[0]==='show'&&a[1]===base+':index.html'?before:git(...a);
  f.read=p=>p==='index.html'?after:'';
  assert.equal(fullGateResumePlan(f).reused,1);
  assert.equal(fullGateResumePlan({...f,read:p=>p==='index.html'?after+'\r\n':''}).reused,1);
  assert.equal(fullGateResumePlan({...f,read:p=>p==='tests/a.test.mjs'?"read('index.html')":f.read(p)}).reused,0);
  for(const invalid of [after.replace('city=1','city=2'),after.replace('app.js','other.js'),after+'<script>run()</script>',after.replace('city=1','city=1&amp;extra=1')]){
    assert.throws(()=>fullGateResumePlan({...f,read:p=>p==='index.html'?invalid:''}),/fresh full gate/);
  }
});

test('isolated lobby menu/icon rebuild must exactly replace source blocks and rerun source integrity',()=>{
 const bundle='js/adventure-lobby-v2107.js',icons='ui/adventure-lobby/icons.js',app='preview/lobby-clarity-v1/app.js';
 const f=fixture({changed:[bundle,icons,app]});
 f.scripts['test:a']='node scripts/build-adventure-lobby-v2107.mjs --check && node --test tests/a.test.mjs';
 const oldFiles={[bundle]:'template\noldIcons\noldMenu\ncomponent',[icons]:'oldIcons',[app]:'oldMenu'};
 const newFiles={[bundle]:'template\nnewIcons\nnewMenu\ncomponent',[icons]:'newIcons',[app]:'newMenu'};
 const git=f.git;f.git=(...a)=>a[0]==='show'&&a[1].startsWith(base+':')&&oldFiles[a[1].slice(41)]!==undefined?oldFiles[a[1].slice(41)]:git(...a);
 f.read=p=>newFiles[p]||'';
 const plan=fullGateResumePlan(f);assert.equal(plan.reused,0);assert.equal(plan.commands[1],'npm run test:a');
 assert.throws(()=>fullGateResumePlan({...f,read:p=>p===bundle?newFiles[p]+'\nchangedComponent':f.read(p)}),/outside menu/);
 assert.throws(()=>fullGateResumePlan({...f,git:(...a)=>a[0]==='show'&&a[1]===base+':'+icons?'missing block':f.git(...a)}),/source block/);
});

test('lobby authoring repair retains passes only with unchanged live output and a full build check',()=>{
  const f=fixture({changed:['ui/adventure-lobby/icons.js','preview/lobby-clarity-v1/app.js']});
  f.scripts['test:b']='node scripts/build-adventure-lobby-v2107.mjs --check && node --test tests/b.test.mjs';
  const bundle='js/adventure-lobby-v2107.js',git=(...args)=>args[0]==='show'&&args[1]===`${base}:${bundle}`?'live runtime':f.git(...args);
  const plan=fullGateResumePlan({...f,git,read:()=> 'live runtime'});assert.equal(plan.reused,1);assert.ok(plan.commands.includes('npm run test:b'));
  assert.throws(()=>fullGateResumePlan({...f,git,read:()=> 'changed runtime'}),/Lobby (runtime changed|source block cannot be verified)/);
  f.scripts['test:b']='node --test tests/b.test.mjs';
  assert.throws(()=>fullGateResumePlan({...f,git,read:()=> 'live runtime'}),/complete source integrity gate/);
});

test('multiple immutable continuation logs keep contiguous passes and reject a changed log or gap',()=>{
  const f=fixture({changed:['tests/c.test.mjs']}),candidate='c'.repeat(40),next='d'.repeat(40);
  const logs={one:`[FULL RELEASE RESUME] Reuse 1 completed stages from ${base}; execute every remaining stage and production guard.\n> test:b\nℹ fail 0\n> test:c\nℹ fail 1\n`,two:`[FULL RELEASE RESUME] Reuse 2 completed stages from ${base}; execute every remaining stage and production guard.\n> test:c\nℹ fail 1\n`};
  const chain=[{log:'one',base:candidate,sha256:createHash('sha256').update(logs.one).digest('hex')},{log:'two',base:next,sha256:createHash('sha256').update(logs.two).digest('hex')}];
  f.env.RELEASE_GATE_RESUME_CONTINUATIONS=JSON.stringify(chain);f.read=path=>logs[path]||'';
  const plan=fullGateResumePlan(f);assert.equal(plan.reused,2);assert.deepEqual(plan.commands.slice(1),['npm run test:c','node scripts/verify-production-release.mjs']);
  assert.throws(()=>fullGateResumePlan({...f,read:path=>(logs[path]||'')+'changed'}),/log hash/);
  assert.throws(()=>fullGateResumePlan({...f,env:{...f.env,RELEASE_GATE_RESUME_CONTINUATIONS:JSON.stringify([chain[1]])}}),/without gaps/);
  assert.throws(()=>fullGateResumePlan({...f,env:{...f.env,RELEASE_GATE_RESUME_CONTINUATIONS:JSON.stringify(Array(17).fill(chain[0]))}}),/At most sixteen/);
});

test('a continuation validates successful earlier reruns before its contiguous failed-stage suffix',()=>{
 const f=fixture({changed:['tests/c.test.mjs']}),candidate='c'.repeat(40);
 const log=`[FULL RELEASE RESUME] Reuse 0 completed stages from ${base}; execute every remaining stage and production guard.\n> test:a\nℹ fail 0\n> test:b\nℹ fail 0\n> test:c\nℹ fail 1\n`;
 const setup=text=>({...f,read:()=>text,env:{...f.env,RELEASE_GATE_RESUME_CONTINUATION_LOG:'rerun.log',RELEASE_GATE_RESUME_CONTINUATION_BASE:candidate,RELEASE_GATE_RESUME_CONTINUATION_SHA256:createHash('sha256').update(text).digest('hex')}});
 const plan=fullGateResumePlan(setup(log));assert.equal(plan.reused,2);assert.deepEqual(plan.commands.slice(1),['npm run test:c','node scripts/verify-production-release.mjs']);
 assert.throws(()=>fullGateResumePlan(setup(log.replace('> test:a\nℹ fail 0','> test:a\nℹ fail 1'))),/guard tests failed/);
 for(const bad of [log.replace('Reuse 0','Reuse 1'),log.replace('> test:a','> test:c'),log.replace('> test:a','> test:a\nℹ fail 0\n> test:a')])assert.throws(()=>fullGateResumePlan(setup(bad)),/without gaps/);
});

test('a completed gate blocked only by concurrent main advancement retains all tests and reruns the production guard',()=>{
  const f=fixture({changed:['docs/operations.json']});
  const log=`> release:gate\n> ${f.scripts['release:gate']}\n> test:a\nℹ fail 0\n> test:b\nℹ fail 0\n> test:c\nℹ fail 0\n[PRODUCTION RELEASE BLOCKED] deploy source differs from origin/main: HEAD=${base} origin/main=${head}\n`;
  const completed=fixture({changed:['docs/operations.json'],log}),plan=fullGateResumePlan(completed);
  assert.equal(plan.reused,3);assert.deepEqual(plan.commands.slice(1),['node scripts/verify-production-release.mjs']);
  for(const changed of [['functions/live.js'],['package.json']])assert.throws(()=>fullGateResumePlan(fixture({changed,log})),/fresh full gate/);
  for(const bad of [log.replace(`HEAD=${base}`,`HEAD=${head}`),log.replace('> test:c\n',''),log.replace('ℹ fail 0','ℹ fail 1'),log.replace('deploy source differs from origin/main','another guard failed')])assert.throws(()=>fullGateResumePlan(fixture({changed:['docs/operations.json'],log:bad})));
});

test('unreferenced operations tooling retains game results but runs its own tests; runtime references fail closed',()=>{
  const operation='scripts/ops/example-grant.mjs',target='tests/example-grant.test.mjs';
  const f=fixture({changed:[operation,'scripts/ops/example-grant-targets.json',target]});
  const read=path=>path===target?`import '../${operation}';`:'';
  const plan=fullGateResumePlan({...f,read});assert.ok(plan.commands.includes('node --test '+target));
  assert.throws(()=>fullGateResumePlan({...f,read:()=>''}),/Cannot map changed test/);
  for(const reference of [operation,'example-grant.mjs']){
    const git=(...args)=>args[0]==='ls-files'&&args[1]==='functions'?'functions/live.js':f.git(...args);
    assert.throws(()=>fullGateResumePlan({...f,git,read:path=>path==='functions/live.js'?`import '${reference}';`:read(path)}),/referenced by runtime/);
  }
});
test('changed tests in a completed stage rerun that stage without invalidating unrelated passes',()=>{
  const plan=fullGateResumePlan(fixture({changed:['tests/a.test.mjs','docs/release.md']}));
  assert.equal(plan.reused,0);assert.equal(plan.commands[1],'npm run test:a');
});

test('concurrent new BGM retains passes only with its exact bytes and an unreferenced additive receipt',()=>{
  const path='assets/bgm/example.mp3',receipt='assets/bgm/example.json',bytes=Buffer.from('ID3 fixture audio');
  const f=fixture({changed:[path,receipt]}),metadata={path:'/'+path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const setup=({added=[path,receipt],body=metadata,source='',audio=bytes}={})=>({...f,
    git:(...args)=>args.includes('--diff-filter=A')?added.join('\n'):args[0]==='ls-files'&&args[1]==='functions'?'js/live.js':f.git(...args),
    read:file=>file===receipt?JSON.stringify(body):source,readBytes:()=>audio});
  assert.equal(fullGateResumePlan(setup()).reused,1);
  for(const options of [{added:[receipt]},{added:[path]},{body:{...metadata,path:'/wrong.mp3'}},{body:{...metadata,bytes:0}},{audio:Buffer.from('changed')},{source:`fetch('${receipt}')`},{source:"fetch('example.json')"}])assert.throws(()=>fullGateResumePlan(setup(options)));
  assert.throws(()=>fullGateResumePlan({...fixture({changed:[receipt]}),read:()=>JSON.stringify(metadata)}),/fresh full gate/);
});

test('a hash-bound continuation preserves completed stages but reruns changed contracts and fails closed on gaps or runtime edits',()=>{
  const candidate='c'.repeat(40),text=`[FULL RELEASE RESUME] Reuse 1 completed stages from ${base}; execute every remaining stage and production guard.\nℹ fail 0\n> test:b\nℹ fail 0\n> test:c\nℹ fail 1\n`;
  const setup=(log=text,changed=['tests/c.test.mjs'])=>{
    const f=fixture({changed:['tests/b.test.mjs',...changed]});
    f.env.RELEASE_GATE_RESUME_CONTINUATION_LOG='continuation.log';f.env.RELEASE_GATE_RESUME_CONTINUATION_BASE=candidate;f.env.RELEASE_GATE_RESUME_CONTINUATION_SHA256=createHash('sha256').update(log).digest('hex');
    const git=f.git;f.git=(...args)=>args[0]==='diff'&&args[2]===candidate?changed.join('\n'):git(...args);
    f.read=path=>path==='continuation.log'?log:'';return f;
  };
  const plan=fullGateResumePlan(setup());assert.equal(plan.reused,2);assert.deepEqual(plan.commands.slice(1),['npm run test:c','node scripts/verify-production-release.mjs']);
  const changed=fullGateResumePlan(setup(text,['tests/a.test.mjs']));assert.equal(changed.reused,1);assert.equal(changed.commands[1],'npm run test:a');
  const f=setup();assert.throws(()=>fullGateResumePlan({...f,env:{...f.env,RELEASE_GATE_RESUME_CONTINUATION_SHA256:'0'.repeat(64)}}),/Continuation log hash/);
  assert.throws(()=>fullGateResumePlan({...f,env:{...f.env,RELEASE_GATE_RESUME_CONTINUATION_BASE:'bad'}}),/actual candidate/);
  for(const log of [text.replace('Reuse 1','Reuse 0'),text.replace('> test:b','> test:a'),text.replace('> test:b\nℹ fail 0\n',''),text.replace('ℹ fail 0','ℹ fail 1'),text.replace('ℹ fail 1','ℹ fail 0')])assert.throws(()=>fullGateResumePlan(setup(log)));
  for(const runtime of ['js/mercenary-limited-pack-live.mjs','functions/_mercenary_limited_pack.js','shared/mercenary-limited-session-v1.mjs'])assert.throws(()=>fullGateResumePlan(setup(text,[runtime])),/Runtime changed after continuation/);
});

test('concurrent unreferenced JSON production receipts are documentation, never runtime configuration',()=>{
  const receipt='preview/example-feature/qa/production.json',f=fixture({changed:[receipt]});
  const git=(...args)=>args[0]==='ls-files'&&args.length===1?'js/live.js\n'+receipt:f.git(...args);
  const read=path=>path===receipt?'{"verifiedAt":"2026-10-06"}':'const live=true;';
  assert.equal(fullGateResumePlan({...f,git,read}).reused,1);
  for(const reference of [receipt,'./qa/production.json'])
    assert.throws(()=>fullGateResumePlan({...f,git,read:path=>path===receipt?read(path):`fetch('${reference}')`}),/referenced by runtime/);
  for(const invalid of ['broken','[]','null'])assert.throws(()=>fullGateResumePlan({...f,git,read:()=>invalid}));
  for(const changed of [['preview/example-feature/qa/policy.json'],['preview/example-feature/production.json'],['preview/example-feature/qa/production.js']])
    assert.throws(()=>fullGateResumePlan({...fixture({changed}),read}),/fresh full gate/);
});
test('runtime, shared helpers, unknown tests, dirty state and changed gate commands cannot reuse results',()=>{
  for(const changed of [['functions/live.js'],['tests/helpers/db.mjs'],['package.json'],['tests/unknown.test.mjs']])assert.throws(()=>fullGateResumePlan(fixture({changed})));
  for(const options of [{dirty:'M file'},{ignored:'tmp/a'},{remote:base},{ancestor:false},{previous:{'release:gate':'other'}}])assert.throws(()=>fullGateResumePlan(fixture(options)));
});
test('tampered, incomplete or noncontiguous logs fail closed',()=>{
  const f=fixture();assert.throws(()=>fullGateResumePlan({...f,env:{...f.env,RELEASE_GATE_RESUME_SHA256:'0'.repeat(64)}}));
  for(const log of [f.logText.replace('> test:a','> test:c'),f.logText.replace('ℹ fail 4','ℹ fail 0'),f.logText.replace('ℹ fail 0','ℹ fail 1'),f.logText.replace('> release:gate','> something')])assert.throws(()=>fullGateResumePlan(fixture({log})));
});

test('explicit interruption resumes the entire incomplete stage while preserving runtime/hash checks',()=>{
  const f=fixture(),log=f.logText.replace('ℹ fail 4','✔ first test finished');
  const interrupted=fixture({changed:['scripts/resume-release-gate.mjs','tests/resume-release-gate.test.mjs'],log});
  assert.throws(()=>fullGateResumePlan(interrupted));
  const env={...interrupted.env,RELEASE_GATE_RESUME_INTERRUPTED:'1',RELEASE_GATE_RESUME_REASON:'Previous process interrupted before the stage completed'};
  const plan=fullGateResumePlan({...interrupted,env});
  assert.equal(plan.reused,1);assert.equal(plan.commands[1],'npm run test:b');
  assert.throws(()=>fullGateResumePlan({...interrupted,env:{...env,RELEASE_GATE_RESUME_REASON:''}}));
  const passed=fixture({log:f.logText.replace('ℹ fail 4','ℹ fail 0')});
  assert.throws(()=>fullGateResumePlan({...passed,env:{...passed.env,RELEASE_GATE_RESUME_INTERRUPTED:'1',RELEASE_GATE_RESUME_REASON:env.RELEASE_GATE_RESUME_REASON}}));
  const runtime=fixture({changed:['functions/live.js'],log});
  assert.throws(()=>fullGateResumePlan({...runtime,env:{...runtime.env,RELEASE_GATE_RESUME_INTERRUPTED:'1',RELEASE_GATE_RESUME_REASON:env.RELEASE_GATE_RESUME_REASON}}));
});
test('legacy .mjs test entries are reusable only when directly registered in the unchanged gate',()=>{
  const f=fixture({changed:['tests/b.mjs']});
  f.scripts['test:b']='node --test tests/b.mjs';
  assert.equal(fullGateResumePlan(f).reused,1);
  assert.throws(()=>fullGateResumePlan(fixture({changed:['tests/unregistered.mjs']})),/Cannot map changed test/);
});

test('an isolated raid UI fix reuses unrelated stages only with matching successful browser evidence',()=>{
  const file='raid/cooperative/live.mjs',runner='tests/cooperative-battleground.browser.mjs',source='const loaded=true;';
  const proof={command:'node '+runner,exitCode:0,sources:[file,runner].map(file=>({file,sha256:createHash('sha256').update(source).digest('hex')}))};
  const raw=JSON.stringify(proof),f=fixture({changed:[file,runner,'tests/b.test.mjs']});
  f.env.RELEASE_GATE_RESUME_UI_REPORT='browser-proof.json';f.env.RELEASE_GATE_RESUME_UI_SHA256=createHash('sha256').update(raw).digest('hex');
  f.read=p=>p==='browser-proof.json'?raw:[file,runner].includes(p)?source:'';
  assert.equal(fullGateResumePlan(f).reused,1);
  assert.throws(()=>fullGateResumePlan({...f,read:p=>p===file?'changed':f.read(p)}),/source changed/);
  assert.throws(()=>fullGateResumePlan({...f,env:{...f.env,RELEASE_GATE_RESUME_UI_SHA256:'0'.repeat(64)}}),/report hash/);
  const inspected={...f,read:p=>p==='tests/a.test.mjs'?`read('${file}')`:f.read(p)};
  assert.equal(fullGateResumePlan(inspected).reused,0);
  const failedRaw=JSON.stringify({...proof,exitCode:1});
  assert.throws(()=>fullGateResumePlan({...f,read:p=>p==='browser-proof.json'?failedRaw:f.read(p),env:{...f.env,RELEASE_GATE_RESUME_UI_SHA256:createHash('sha256').update(failedRaw).digest('hex')}}),/successful browser/);
  for(const runtime of ['functions/live.js','preview/project-v-v3/source/battle/BattleEngine.js']){
    const forbidden=JSON.stringify({...proof,sources:[...proof.sources,{file:runtime,sha256:proof.sources[0].sha256}]});
    assert.throws(()=>fullGateResumePlan({...f,read:p=>p==='browser-proof.json'?forbidden:f.read(p),env:{...f.env,RELEASE_GATE_RESUME_UI_SHA256:createHash('sha256').update(forbidden).digest('hex')}}),/isolated raid/);
  }
});

test('limited-pack view proof is runner-specific and never permits shared policy, session or server changes',()=>{
  const file='js/mercenary-limited-pack-live.mjs',runner='tests/mercenary-limited-shop-20261006.browser.mjs',source='const isolatedView=true;';
  const hash=createHash('sha256').update(source).digest('hex');
  const proof={command:'node '+runner,exitCode:0,sources:[file,runner].map(file=>({file,sha256:hash}))};
  const withProof=(value=proof,changed=[file,runner],inspecting=false)=>{
    const raw=JSON.stringify(value),f=fixture({changed});
    f.env.RELEASE_GATE_RESUME_UI_REPORT='browser-proof.json';f.env.RELEASE_GATE_RESUME_UI_SHA256=createHash('sha256').update(raw).digest('hex');
    f.read=p=>p==='browser-proof.json'?raw:value.sources.some(row=>row.file===p)?source:inspecting&&p==='tests/a.test.mjs'?`read('${file}')`:'';
    return f;
  };
  assert.equal(fullGateResumePlan(withProof()).reused,1);
  assert.equal(fullGateResumePlan(withProof(proof,undefined,true)).reused,0);
  const f=withProof();assert.throws(()=>fullGateResumePlan({...f,read:p=>p===file?'changed':f.read(p)}),/source changed/);
  assert.throws(()=>fullGateResumePlan(withProof({...proof,exitCode:1})),/successful browser/);
  const wrongRunner='tests/other.browser.mjs';
  assert.throws(()=>fullGateResumePlan(withProof({...proof,command:'node '+wrongRunner,sources:[...proof.sources,{file:wrongRunner,sha256:hash}]})),/Limited-pack view proof requires/);
  for(const runtime of ['shared/mercenary-limited-pack-v1.mjs','shared/mercenary-limited-session-v1.mjs','functions/_mercenary_limited_pack.js','js/hyper-pack-fx-v2076.src.js']){
    assert.throws(()=>fullGateResumePlan(withProof(proof,[file,runner,runtime])),/fresh full gate/);
    assert.throws(()=>fullGateResumePlan(withProof({...proof,sources:[...proof.sources,{file:runtime,sha256:hash}]})),/Only isolated/);
  }
});

test('offline skill preview proof binds source and bundle and reruns contracts that inspect it',()=>{
  const files=[
    'preview/project-v-mercenary-system-v1/skill-rehearsal.mjs',
    'preview/project-v-mercenary-system-v1/source/AreaSkillRehearsalFX.js',
    'preview/project-v-mercenary-system-v1/source/skills-lab.src.js',
    'preview/project-v-mercenary-system-v1/skills.bundle.js',
    'preview/project-v-mercenary-system-v1/skills-battle.html',
    'tests/mercenary-codex-area.browser.mjs'
  ],source='const previewOnly=true;',hash=createHash('sha256').update(source).digest('hex');
  const proof={command:'node '+files.at(-1),exitCode:0,sources:files.map(file=>({file,sha256:hash}))};
  const withProof=(value=proof,inspecting=false)=>{
    const raw=JSON.stringify(value),f=fixture({changed:files});
    f.env.RELEASE_GATE_RESUME_UI_REPORT='browser-proof.json';f.env.RELEASE_GATE_RESUME_UI_SHA256=createHash('sha256').update(raw).digest('hex');
    f.read=p=>p==='browser-proof.json'?raw:files.includes(p)?source:inspecting&&p==='tests/a.test.mjs'?`import '${files[0]}'`:'';
    return f;
  };
  assert.equal(fullGateResumePlan(withProof()).reused,1);
  assert.equal(fullGateResumePlan(withProof(proof,true)).reused,0);
  assert.throws(()=>fullGateResumePlan(withProof({...proof,sources:proof.sources.filter(row=>!row.file.endsWith('skills.bundle.js'))})),/requires the source/);
  const f=withProof();assert.throws(()=>fullGateResumePlan({...f,read:p=>p===files[3]?'stale bundle':f.read(p)}),/source changed/);
  const receipt='preview/project-v-v3/grid-build-report.json';
  const before={sources:[{file:'shared-engine.js',sha256:'fixed'}],outputs:[{file:files[3],sha256:'old'}, {file:'main-battle.js',sha256:'fixed'}]};
  const after=structuredClone(before);after.outputs[0].sha256=hash;
  const withReceipt=value=>({...f,git:(...args)=>args[0]==='diff'?[...files,receipt].join('\n'):args[0]==='show'&&args[1].endsWith(':'+receipt)?JSON.stringify(before):f.git(...args),read:p=>p===receipt?JSON.stringify(value):p==='tests/a.test.mjs'?`read('${receipt}')`:f.read(p)});
  assert.equal(fullGateResumePlan(withReceipt(after)).reused,0,'bundle freshness contract must rerun');
  const badHash=structuredClone(after);badHash.outputs[0].sha256='wrong';assert.throws(()=>fullGateResumePlan(withReceipt(badHash)),/hash mismatch/);
  for(const field of ['sources','outputs']){
    const unrelated=structuredClone(after);unrelated[field].at(-1).sha256='changed';assert.throws(()=>fullGateResumePlan(withReceipt(unrelated)),/Only the offline/);
  }
  for(const runtime of ['preview/project-v-mercenary-system-v1/source/MercenarySkillFX.js','preview/project-v-v3/source/battle/RenderAuthoredSkill.js','functions/_battle_v2_preview.js']){
    assert.throws(()=>fullGateResumePlan(withProof({...proof,sources:[...proof.sources,{file:runtime,sha256:hash}]})),/Only isolated/);
  }
});
