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
