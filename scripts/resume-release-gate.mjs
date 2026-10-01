import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Reuse only a completed prefix of the exact full gate, after test/document fixes.
// Backend, shared renderer, dependency, schema and gate-command changes require
// a fresh gate. A late raid-view fix may retain unrelated passes only with a
// successful browser run bound to both the view and test source hashes.
export function fullGateResumePlan({env,git,scripts,logText,read=path=>readFileSync(path,'utf8')}){
  const base=env.RELEASE_GATE_RESUME_BASE;
  if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('Resume requires the original candidate SHA.');
  if(!/^[a-f0-9]{64}$/.test(env.RELEASE_GATE_RESUME_SHA256||'')||createHash('sha256').update(logText).digest('hex')!==env.RELEASE_GATE_RESUME_SHA256)throw Error('Resume log hash mismatch.');
  if(git('status','--porcelain','--untracked-files=all')||git('ls-files','--others','--ignored','--exclude-standard'))throw Error('Commit the clean release before resuming.');
  if(git('rev-parse','HEAD')!==git('rev-parse','origin/main'))throw Error('Push the release before resuming.');
  git('merge-base','--is-ancestor',base,'HEAD');
  const previous=JSON.parse(git('show',`${base}:package.json`)).scripts;
  if(JSON.stringify(previous)!==JSON.stringify(scripts))throw Error('Gate commands changed: run a fresh full gate.');
  const gate=scripts['release:gate'];
  if(!logText.replace(/\r\n/g,'\n').includes(`> release:gate\n> ${gate}\n`))throw Error('Log does not contain the full gate command.');
  const commands=gate.split(' && '),names=commands.map(command=>command.match(/^npm run ([\w:-]+)$/)?.[1]);
  if(commands.at(-1)!=='node scripts/verify-production-release.mjs'||names.slice(0,-1).some(name=>!name))throw Error('Unsupported full gate structure.');
  const seen=[...logText.matchAll(/^> ((?:test|check):[\w:-]+)\r?$/gm)].map(match=>match[1]);
  if(!seen.length||seen.some((name,i)=>name!==names[i]))throw Error('Log is not a contiguous gate prefix.');
  const failedIndex=seen.length-1,last=logText.lastIndexOf(`> ${seen.at(-1)}`),prefix=logText.slice(0,last);
  const tail=logText.slice(last),failed=/^ℹ fail [1-9]/m.test(tail);
  // An interrupted process has no final Node test summary. Always rerun that
  // whole stage; never treat individual passing test lines as stage completion.
  const interrupted=env.RELEASE_GATE_RESUME_INTERRUPTED==='1'&&!/^ℹ fail \d+/m.test(tail)
    &&String(env.RELEASE_GATE_RESUME_REASON||'').trim().length>=20;
  if(/^ℹ fail [1-9]/m.test(prefix)||(!failed&&!interrupted))throw Error('Resume requires a failed or explicitly interrupted final stage and successful preceding stages.');
  const changed=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean),rerun=new Set();
  const browserProof=new Set();
  if(env.RELEASE_GATE_RESUME_UI_REPORT){
    const raw=read(env.RELEASE_GATE_RESUME_UI_REPORT);
    if(createHash('sha256').update(raw).digest('hex')!==env.RELEASE_GATE_RESUME_UI_SHA256)throw Error('Browser report hash mismatch.');
    const proof=JSON.parse(raw),runner=proof.command?.match(/^node (tests\/[a-zA-Z0-9_-]+\.browser\.mjs)$/)?.[1];
    if(proof.exitCode!==0||!runner||!Array.isArray(proof.sources)||!proof.sources.some(row=>row.file===runner))throw Error('A successful browser run and test source are required.');
    for(const row of proof.sources){
      if(row.file!==runner&&!/^raid\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(?:mjs|css)$/.test(row.file))throw Error('Only isolated raid views may use browser proof.');
      const hash=createHash('sha256').update(read(row.file).replace(/\r\n/g,'\n')).digest('hex');
      if(hash!==row.sha256)throw Error(`Browser proof source changed: ${row.file}`);
      browserProof.add(row.file);
    }
    // Re-run completed static contracts that directly inspect a changed view.
    for(let i=0;i<failedIndex;i++){
      const inputs=scripts[names[i]].split(/\s+/).filter(p=>/^(?:tests|preview)\/.*\.(?:mjs|js)$/.test(p));
      for(const input of inputs){const source=read(input);if(changed.some(p=>browserProof.has(p)&&source.includes(p)))rerun.add(i);}
    }
  }
  const tooling=new Set(['scripts/deploy-production.mjs','scripts/resume-release-gate.mjs','tests/resume-release-gate.test.mjs']);
  for(const path of changed){
    if(path==='AGENTS.md'||path.startsWith('docs/')||tooling.has(path))continue;
    if(browserProof.has(path))continue;
    // Legacy gate entry points also use .mjs without the .test suffix. Require
    // direct membership in a gate command below; shared helpers remain excluded.
    if(!/^tests\/[^/]+\.mjs$/.test(path))throw Error(`Runtime/shared helper changed (${path}): run a fresh full gate.`);
    let matched=false;
    for(let i=0;i<names.length-1;i++)if(scripts[names[i]].split(/\s+/).includes(path)){matched=true;if(i<failedIndex)rerun.add(i);}
    if(!matched)throw Error(`Cannot map changed test to the full gate: ${path}`);
  }
  // The resume implementation is itself verified, including on its first use.
  return {base,reused:failedIndex-rerun.size,commands:[
    'node --test tests/resume-release-gate.test.mjs tests/scoped-release-policy-20260923.test.mjs tests/hyperdrive-cache-deploy-guard.test.mjs',
    ...[...rerun].sort((a,b)=>a-b).map(i=>commands[i]),...commands.slice(failedIndex)
  ]};
}

export function resumeFullReleaseGate({env,git,run,scripts,platform=process.platform,execPath=process.execPath}){
  const plan=fullGateResumePlan({env,git,scripts,logText:readFileSync(env.RELEASE_GATE_RESUME_LOG,'utf8')});
  console.log(`[FULL RELEASE RESUME] Reuse ${plan.reused} completed stages from ${plan.base}; execute every remaining stage and production guard.`);
  for(const command of plan.commands){
    if(command.startsWith('node '))run(execPath,command.slice(5).split(' '));
    else if(platform==='win32')run(env.ComSpec||'cmd.exe',['/d','/s','/c',command]);
    else run('npm',['run',command.slice('npm run '.length)]);
  }
}
