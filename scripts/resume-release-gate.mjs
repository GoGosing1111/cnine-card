import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Reuse only a completed prefix of the exact full gate, after test/document fixes.
// Backend, shared renderer, dependency, schema and gate-command changes require
// a fresh gate. Isolated raid views, the limited-pack view and the offline skill catalog may retain
// unrelated passes only with a successful browser run bound to source hashes.
const offlineSkillPreview=new Set([
  'preview/project-v-mercenary-system-v1/skill-rehearsal.mjs',
  'preview/project-v-mercenary-system-v1/source/AreaSkillRehearsalFX.js',
  'preview/project-v-mercenary-system-v1/source/skills-lab.src.js',
  'preview/project-v-mercenary-system-v1/skills.bundle.js',
  'preview/project-v-mercenary-system-v1/skills-battle.html'
]);
const limitedPackView='js/mercenary-limited-pack-live.mjs';
const limitedPackBrowser='tests/mercenary-limited-shop-20261006.browser.mjs';
const gateTestPath=path=>/^(?:tests\/[^/]+\.mjs|preview\/[a-zA-Z0-9_-]+\/qa\.test\.mjs)$/.test(path);
// Legacy `node tests/*.mjs` assertions exit without a node:test summary.
// Recognize only an uncaught assertion plus Node's terminal version footer;
// its whole failed stage is rerun, with the same hash/source/continuity guards.
const failedGateStage=text=>/^ℹ fail [1-9]/m.test(text)||(!/^ℹ fail \d+/m.test(text)&&/^AssertionError \[ERR_ASSERTION\]:/m.test(text)&&/^Node\.js v\d+(?:\.\d+)+\s*$/m.test(text));
function mainCacheQueryOrderOnly(before,after){
  const normalize=text=>{
    let count=0;
    const source=text.replace(/\r\n/g,'\n').trim().replace(/(\bsrc=")(js\/app\.js\?[^"\s]+)(")/g,(_,start,src,end)=>{
      count++;const url=new URL(src.replaceAll('&amp;','&'),'https://cache.invalid/');url.searchParams.sort();
      return start+url.pathname+url.search+end;
    });
    return {source,count};
  };
  const a=normalize(before),b=normalize(after);
  return a.count===1&&b.count===1&&a.source===b.source;
}
function mainShellVersionOnly(before,after,worker){
  const shell=worker.match(/const SHELL_CACHE=['"]soop-card-shell-v([^'"]+)['"]/)?.[1];
  if(!shell)return false;
  const current=after.match(/\bsrc="js\/app\.js\?v=([^&"]+)/g);
  const previous=before.match(/\bsrc="js\/app\.js\?v=([^&"]+)/g);
  if(current?.length!==1||previous?.length!==1||current[0]!==`src="js/app.js?v=${shell}`)return false;
  return after.replace(current[0],previous[0]).replace(/\r\n/g,'\n').trim()===before.replace(/\r\n/g,'\n').trim();
}
export function fullGateResumePlan({env,git,scripts,logText,read=path=>readFileSync(path,'utf8'),readBytes=path=>readFileSync(path)}){
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
  const changed=git('diff','--name-only',base,'HEAD').split('\n').filter(Boolean),bgmAdditions=new Set(),artAdditions=new Set();
  // A fixture used only by directly registered gate tests may be repaired.
  // Every importing stage is rechecked; runtime, shared-helper and unregistered
  // test consumers still require a fresh gate.
  const helperStages=new Map(),gateInputs=new Map();
  for(let i=0;i<names.length-1;i++)for(const file of scripts[names[i]].split(/\s+/).filter(p=>/^(?:tests|preview)\/.*\.mjs$/.test(p))){
    if(!gateInputs.has(file))gateInputs.set(file,[]);gateInputs.get(file).push(i);
  }
  for(const helper of changed.filter(p=>/^tests\/helpers\/[a-zA-Z0-9_-]+\.mjs$/.test(p))){
    const leaf=helper.split('/').at(-1),stages=new Set();
    const sources=git('ls-files','*.js','*.mjs','*.cjs','*.html').split('\n').filter(Boolean);
    for(const source of sources){if(source===helper||!read(source).includes(leaf))continue;
      if(!gateInputs.has(source))throw Error(`Shared fixture consumer (${source}): run a fresh full gate.`);
      for(const index of gateInputs.get(source))stages.add(index);
    }
    if(!stages.size)throw Error('Unregistered fixture repair: run a fresh full gate.');
    helperStages.set(helper,stages);
  }
  // An equivalent query permutation or sole main-app version alignment with
  // the already-tested shell cache does not change runtime source. Recheck HTML contracts.
  const cacheOrderOnly=changed.includes('index.html')&&(mainCacheQueryOrderOnly(git('show',`${base}:index.html`),read('index.html'))||mainShellVersionOnly(git('show',`${base}:index.html`),read('index.html'),read('service-worker.js')));
  // A concurrent, additive audio upload cannot change game execution. Keep its
  // exact source bytes and paired, unreferenced receipt bound to their hash.
  for(const path of changed.filter(path=>/^assets\/bgm\/[a-z0-9-]+\.mp3$/.test(path))){
    const receipt=path.replace(/\.mp3$/,'.json'),added=git('diff','--name-only','--diff-filter=A',base,'HEAD').split('\n');
    if(!changed.includes(receipt)||!added.includes(path)||!added.includes(receipt))throw Error('BGM reuse requires a new audio file and its new receipt.');
    const metadata=JSON.parse(read(receipt)),bytes=readBytes(path);
    if(metadata.path!=='/'+path||metadata.bytes!==bytes.length||metadata.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('BGM receipt does not match audio bytes.');
    const runtime=git('ls-files','functions','workers','shared','js','admin','scripts','index.html','service-worker.js').split('\n').filter(file=>/\.(?:[cm]?js|jsonc?|html)$/.test(file)&&file!=='scripts/resume-release-gate.mjs');
    if(runtime.some(file=>{const source=read(file);return source.includes(receipt)||source.includes(receipt.split('/').at(-1));}))throw Error('BGM receipt is runtime configuration: run a fresh full gate.');
    bgmAdditions.add(path);bgmAdditions.add(receipt);
  }
  // Concurrent authoring-only art is inert: require entirely new image files,
  // a byte/hash-bound manifest, and no reference from any game/tool source.
  for(const manifest of changed.filter(p=>/^assets\/ui\/[a-z0-9_/-]+\/manifest\.json$/.test(p))){
    const directory=manifest.slice(0,-'/manifest.json'.length),metadata=JSON.parse(read(manifest));
    if(metadata.scope?.resourceOnly!==true)continue;
    const files=metadata.files,added=new Set(git('diff','--name-only','--diff-filter=A',base,'HEAD').split('\n'));
    if(!Array.isArray(files)||!files.length||files.length>20)throw Error('Additive art requires a bounded image manifest.');
    const expected=new Set([manifest]);
    for(const row of files){
      if(typeof row.path!=='string'||!row.path.startsWith(directory+'/')||!/^[-a-z0-9_]+\.(?:png|webp)$/.test(row.path.slice(directory.length+1))||expected.has(row.path))throw Error('Art receipt may contain only distinct sibling images.');
      const bytes=readBytes(row.path);
      if(row.bytes!==bytes.length||row.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('Art receipt does not match image bytes.');
      expected.add(row.path);
    }
    const actual=changed.filter(p=>p.startsWith(directory+'/'));
    if(actual.length!==expected.size||[...expected].some(p=>!added.has(p)||!actual.includes(p)))throw Error('Authoring art reuse allows new files only.');
    const sources=git('ls-files','functions','workers','shared','js','admin','scripts','raid','index.html','service-worker.js').split('\n').filter(p=>/\.(?:[cm]?js|jsonc?|html|css)$/.test(p));
    if(sources.some(p=>read(p).includes(directory)))throw Error('Authoring art is referenced by runtime/tooling: run a fresh full gate.');
    for(const p of expected)artAdditions.add(p);
  }
  // An npm gate stage may invoke another registered test script. Keep those
  // headers inside their parent stage so a failure reruns the entire parent.
  // Only the exact nested commands in the unchanged package scripts qualify.
  const nestedStages=(name,ancestors=[])=>{
    if(ancestors.includes(name))throw Error('Cyclic nested gate command.');
    return String(scripts[name]||'').split(' && ').flatMap(command=>{
      const child=command.match(/^npm run ((?:test|check):[\w:-]+)$/)?.[1];
      if(!child)return [];
      if(!scripts[child])throw Error('Unknown nested gate command.');
      return [child,...nestedStages(child,[...ancestors,name])];
    });
  };
  const stageNames=text=>{
    const stages=[];let pending=[];
    for(const match of text.matchAll(/^> ((?:test|check):[\w:-]+)\r?$/gm)){
      const name=match[1];
      if(pending.length){if(name!==pending.shift())throw Error('Missing or unexpected nested gate stage.');}
      else{stages.push(name);pending=nestedStages(name);}
    }
    if(pending.length&&text.includes('[PRODUCTION RELEASE'))throw Error('Completed gate is missing nested stages.');
    return stages;
  };
  let seen=stageNames(logText),changesAfterLastRun=null;
  if(!seen.length||seen.some((name,i)=>name!==names[i]))throw Error('Log is not a contiguous gate prefix.');
  // A resumed run can expose a later stale test. Keep both original logs intact,
  // validate their hashes and candidate ancestry, and join only contiguous stages.
  // After the continuation candidate, only test/document/tooling repairs qualify.
  const continuations=env.RELEASE_GATE_RESUME_CONTINUATIONS?JSON.parse(env.RELEASE_GATE_RESUME_CONTINUATIONS):env.RELEASE_GATE_RESUME_CONTINUATION_LOG?[{log:env.RELEASE_GATE_RESUME_CONTINUATION_LOG,base:env.RELEASE_GATE_RESUME_CONTINUATION_BASE,sha256:env.RELEASE_GATE_RESUME_CONTINUATION_SHA256}]:[];
  if(!Array.isArray(continuations)||continuations.length>16)throw Error('At most sixteen hash-bound continuation logs are supported.');
  let previousCandidate=base;
  for(const continuationSpec of continuations){
    const continuation=read(continuationSpec.log),candidate=continuationSpec.base;
    if(!/^[a-f0-9]{40}$/.test(candidate||''))throw Error('Continuation requires its actual candidate SHA.');
    if(createHash('sha256').update(continuation).digest('hex')!==continuationSpec.sha256)throw Error('Continuation log hash mismatch.');
    git('merge-base','--is-ancestor',previousCandidate,candidate);previousCandidate=candidate;git('merge-base','--is-ancestor',candidate,'HEAD');
    if(JSON.stringify(JSON.parse(git('show',`${candidate}:package.json`)).scripts)!==JSON.stringify(scripts))throw Error('Continuation gate commands changed: run a fresh full gate.');
    const start=seen.length-1,originalLast=logText.lastIndexOf(`> ${seen.at(-1)}`),continued=stageNames(continuation);
    if(!failedGateStage(logText.slice(originalLast))||/^ℹ fail [1-9]/m.test(logText.slice(0,originalLast)))throw Error('Continuation requires the original failed final stage.');
    // A repair may rerun earlier affected stages before reaching the failed
    // stage. Keep the immutable log, validate those reruns and join only the
    // contiguous continuation after them into the original gate history.
    const resumeAt=continued.indexOf(names[start]),rechecked=continued.slice(0,resumeAt);
    const earlier=rechecked.map(name=>names.indexOf(name));
    const marker=`[FULL RELEASE RESUME] Reuse ${start-rechecked.length} completed stages from ${base}; execute every remaining stage and production guard.`;
    if(resumeAt<0||!continuation.includes(marker)||earlier.some((index,i)=>index<0||index>=start||(i>0&&index<=earlier[i-1]))||continued.slice(resumeAt).some((name,i)=>name!==names[start+i]))throw Error('Continuation must start at the original failed stage without gaps.');
    const continuationStart=continuation.indexOf(`> ${continued[resumeAt]}\n`)>=0?continuation.indexOf(`> ${continued[resumeAt]}\n`):continuation.indexOf(`> ${continued[resumeAt]}\r\n`);
    if(/^ℹ fail [1-9]/m.test(continuation.slice(0,continuationStart)))throw Error('Continuation guard tests failed.');
    changesAfterLastRun=new Set(git('diff','--name-only',candidate,'HEAD').split('\n').filter(Boolean));
    const repairTools=new Set(['scripts/deploy-production.mjs','scripts/resume-release-gate.mjs','tests/resume-release-gate.test.mjs']);
    for(const path of changesAfterLastRun)if(path!=='AGENTS.md'&&!(path==='index.html'&&cacheOrderOnly)&&!path.startsWith('docs/')&&!gateTestPath(path)&&!helperStages.has(path)&&!repairTools.has(path)&&!bgmAdditions.has(path)&&!artAdditions.has(path)&&!(env.RELEASE_GATE_RESUME_UI_REPORT&&/^raid\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(?:mjs|css)$/.test(path))&&!/^preview\/[a-zA-Z0-9_-]+\/qa\/production\.json$/.test(path))throw Error(`Runtime changed after continuation (${path}): run a fresh full gate.`);
    logText=logText.slice(0,originalLast)+continuation.slice(continuationStart);
    seen=stageNames(logText);
  }
  // A concurrent documentation/operations commit can advance main after every
  // test passed. Reuse that complete gate only when its exact candidate reached
  // the final source-identity guard. All runtime/dependency checks below remain.
  const sourceGuardBlocked=seen.length===names.length-1
    &&logText.includes(`[PRODUCTION RELEASE BLOCKED] deploy source differs from origin/main: HEAD=${previousCandidate} origin/main=`)
    &&!/^ℹ fail [1-9]/m.test(logText);
  const failedIndex=sourceGuardBlocked?names.length-1:seen.length-1,last=logText.lastIndexOf(`> ${seen.at(-1)}`),prefix=logText.slice(0,last);
  const tail=logText.slice(last),failed=failedGateStage(tail);
  // An interrupted process has no final Node test summary. Always rerun that
  // whole stage; never treat individual passing test lines as stage completion.
  const interrupted=env.RELEASE_GATE_RESUME_INTERRUPTED==='1'&&!/^ℹ fail \d+/m.test(tail)
    &&String(env.RELEASE_GATE_RESUME_REASON||'').trim().length>=20;
  if(/^ℹ fail [1-9]/m.test(prefix)||(!failed&&!interrupted&&!sourceGuardBlocked))throw Error('Resume requires a failed or explicitly interrupted final stage, or the exact completed source-identity guard.');
  const rerun=new Set(),operationTests=new Set();
  if(cacheOrderOnly&&(!changesAfterLastRun||changesAfterLastRun.has('index.html'))){
    for(let i=0;i<failedIndex;i++){
      const inputs=scripts[names[i]].split(/\s+/).filter(p=>/^(?:tests|preview)\/.*\.(?:mjs|js)$/.test(p));
      if(inputs.some(input=>read(input).includes('index.html')))rerun.add(i);
    }
  }
  // Another task may append its deployment receipt while this gate is running.
  // Treat only unreferenced JSON QA receipts as documentation; runtime manifests,
  // executable preview files and referenced configuration still require a new gate.
  const qaReceipts=changed.filter(path=>/^preview\/[a-zA-Z0-9_-]+\/qa\/production\.json$/.test(path));
  if(qaReceipts.length){
    for(const path of qaReceipts){
      const value=JSON.parse(read(path));
      if(!value||Array.isArray(value)||typeof value!=='object')throw Error('QA deployment receipt must be a JSON object.');
    }
    const candidates=git('ls-files').split('\n').filter(path=>/\.(?:[cm]?js|json|html|css)$/.test(path)
      &&!path.startsWith('docs/')&&!path.startsWith('tests/')&&!path.includes('/qa/')
      &&path!=='scripts/resume-release-gate.mjs');
    for(const path of candidates){
      const source=read(path);
      if(qaReceipts.some(receipt=>source.includes(receipt)||source.includes(receipt.split('/').at(-1))))
        throw Error(`QA receipt is referenced by runtime/tooling (${path}): run a fresh full gate.`);
    }
  }
  const operations=changed.filter(path=>/^scripts\/ops\/[a-zA-Z0-9_-]+\.(?:mjs|json)$/.test(path));
  if(operations.length){
    const runtimeFiles=git('ls-files','functions','workers','shared','js','admin','scripts','index.html','service-worker.js').split('\n').filter(path=>!path.startsWith('scripts/ops/')&&/\.(?:[cm]?js|jsonc?|html)$/.test(path));
    for(const file of runtimeFiles){
      const source=read(file);
      if(operations.some(path=>source.includes(path)||source.includes(path.split('/').at(-1))))throw Error(`Operational file is referenced by runtime/tooling (${file}): run a fresh full gate.`);
    }
  }
  const browserProof=new Set();
  if(env.RELEASE_GATE_RESUME_UI_REPORT){
    const raw=read(env.RELEASE_GATE_RESUME_UI_REPORT);
    if(createHash('sha256').update(raw).digest('hex')!==env.RELEASE_GATE_RESUME_UI_SHA256)throw Error('Browser report hash mismatch.');
    const proof=JSON.parse(raw),runner=proof.command?.match(/^node (tests\/[a-zA-Z0-9_-]+\.browser\.mjs)$/)?.[1];
    if(proof.exitCode!==0||!runner||!Array.isArray(proof.sources)||!proof.sources.some(row=>row.file===runner))throw Error('A successful browser run and test source are required.');
    if(proof.sources.some(row=>row.file===limitedPackView)&&runner!==limitedPackBrowser)throw Error('Limited-pack view proof requires its price-confirmation and receipt-recovery browser runner.');
    if(proof.sources.some(row=>offlineSkillPreview.has(row.file))&&[...offlineSkillPreview].some(file=>!proof.sources.some(row=>row.file===file)))throw Error('Offline skill proof requires the source, rehearsal, wrapper, bundle and HTML together.');
    for(const row of proof.sources){
      if(row.file!==runner&&row.file!==limitedPackView&&!offlineSkillPreview.has(row.file)&&!/^raid\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(?:mjs|css)$/.test(row.file))throw Error('Only isolated raid views, the limited-pack view or the offline skill catalog may use browser proof.');
      const hash=createHash('sha256').update(read(row.file).replace(/\r\n/g,'\n')).digest('hex');
      if(hash!==row.sha256)throw Error(`Browser proof source changed: ${row.file}`);
      browserProof.add(row.file);
    }
    // A catalog-only rebuild changes one aggregate receipt row. Bind that row
    // to the browser-tested bundle and reject changes to any common source,
    // other output, layout client or metadata in this shared receipt.
    const receipt='preview/project-v-v3/grid-build-report.json',bundle='preview/project-v-mercenary-system-v1/skills.bundle.js';
    if(changed.includes(receipt)){
      if(!browserProof.has(bundle))throw Error('Grid receipt update requires browser-tested skill bundle.');
      const before=JSON.parse(git('show',`${base}:${receipt}`)),after=JSON.parse(read(receipt));
      const oldRows=before.outputs?.filter(row=>row.file===bundle),newRows=after.outputs?.filter(row=>row.file===bundle);
      if(oldRows?.length!==1||newRows?.length!==1)throw Error('Grid receipt requires exactly one skill output.');
      const expected=createHash('sha256').update(read(bundle).replace(/\r\n/g,'\n')).digest('hex');
      if(newRows[0].sha256!==expected)throw Error('Grid receipt skill bundle hash mismatch.');
      oldRows[0].sha256=newRows[0].sha256;
      if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Only the offline skill output hash may change in the grid receipt.');
      browserProof.add(receipt);
    }
    // Re-run completed static contracts that directly inspect a changed view.
    for(let i=0;i<failedIndex;i++){
      const inputs=scripts[names[i]].split(/\s+/).filter(p=>/^(?:tests|preview)\/.*\.(?:mjs|js)$/.test(p));
      for(const input of inputs){const source=read(input);if(changed.some(p=>(!changesAfterLastRun||changesAfterLastRun.has(p))&&browserProof.has(p)&&source.includes(p)))rerun.add(i);}
    }
  }
  const tooling=new Set(['scripts/deploy-production.mjs','scripts/resume-release-gate.mjs','tests/resume-release-gate.test.mjs']);
  // Reconcile the isolated menu/icon authoring sources. A rebuilt bundle may
  // differ only by the exact replacement of those source blocks; template,
  // component, builder and every other runtime change still require a new gate.
  const lobbySources=new Set(['ui/adventure-lobby/icons.js','preview/lobby-clarity-v1/app.js']);
  const lobbySourceRepair=changed.some(path=>lobbySources.has(path));
  let lobbyBundleRepair=false;
  if(lobbySourceRepair){
    const bundle='js/adventure-lobby-v2107.js',normalize=value=>value.replace(/\r\n/g,'\n').trim();
    const previousBundle=normalize(git('show',`${base}:${bundle}`)),currentBundle=normalize(read(bundle));
    if(previousBundle!==currentBundle){
      let expected=previousBundle;
      for(const source of lobbySources){
        const before=normalize(git('show',`${base}:${source}`)),after=normalize(read(source));
        if(before===after)continue;
        if(!before||expected.split(before).length!==2)throw Error('Lobby source block cannot be verified: run a fresh full gate.');
        expected=expected.replace(before,()=>after);
      }
      if(expected!==currentBundle)throw Error('Lobby runtime changed outside menu/icon sources: run a fresh full gate.');
      lobbyBundleRepair=true;
    }
    const stage=names.findIndex(name=>scripts[name]?.startsWith('node scripts/build-adventure-lobby-v2107.mjs --check && '));
    if(stage<0)throw Error('Lobby source repair requires the complete source integrity gate.');
    if(stage<failedIndex&&(!changesAfterLastRun||[...lobbySources,bundle].some(path=>changesAfterLastRun.has(path))))rerun.add(stage);
  }
  for(const path of changed){
    if(helperStages.has(path)){if(!changesAfterLastRun||changesAfterLastRun.has(path))for(const index of helperStages.get(path))if(index<failedIndex)rerun.add(index);continue;}
    if(path==='index.html'&&cacheOrderOnly)continue;
    if(path==='AGENTS.md'||path.startsWith('docs/')||path==='preview/project-v-mercenary-system-v1/README.md'||tooling.has(path))continue;
    if(bgmAdditions.has(path))continue;
    if(artAdditions.has(path))continue;
    if(qaReceipts.includes(path))continue;
    if(operations.includes(path))continue;
    if(browserProof.has(path))continue;
    if(lobbySourceRepair&&(lobbySources.has(path)||(lobbyBundleRepair&&path==='js/adventure-lobby-v2107.js')))continue;
    // Legacy gate entry points also use .mjs without the .test suffix. Require
    // direct membership in a gate command below; shared helpers remain excluded.
    if(!gateTestPath(path))throw Error(`Runtime/shared helper changed (${path}): run a fresh full gate.`);
    let matched=false;
    for(let i=0;i<names.length-1;i++)if(scripts[names[i]].split(/\s+/).includes(path)){matched=true;if(i<failedIndex&&(!changesAfterLastRun||changesAfterLastRun.has(path)))rerun.add(i);}
    if(!matched&&operations.length&&path.endsWith('.test.mjs')&&operations.some(operation=>read(path).includes('../'+operation)))operationTests.add(path);
    else if(!matched)throw Error(`Cannot map changed test to the full gate: ${path}`);
  }
  // The resume implementation is itself verified, including on its first use.
  return {base,reused:failedIndex-rerun.size,commands:[
    'node --test tests/resume-release-gate.test.mjs tests/scoped-release-policy-20260923.test.mjs tests/hyperdrive-cache-deploy-guard.test.mjs',
    ...[...operationTests].map(path=>'node --test '+path),
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
