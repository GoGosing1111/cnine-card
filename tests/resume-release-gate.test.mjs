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
test('changed tests in a completed stage rerun that stage without invalidating unrelated passes',()=>{
  const plan=fullGateResumePlan(fixture({changed:['tests/a.test.mjs','docs/release.md']}));
  assert.equal(plan.reused,0);assert.equal(plan.commands[1],'npm run test:a');
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
  for(const runtime of ['preview/project-v-mercenary-system-v1/source/MercenarySkillFX.js','preview/project-v-v3/source/battle/RenderAuthoredSkill.js','functions/_battle_v2_preview.js']){
    assert.throws(()=>fullGateResumePlan(withProof({...proof,sources:[...proof.sources,{file:runtime,sha256:hash}]})),/Only isolated/);
  }
});
