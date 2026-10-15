// Continue the already-run gate after the single V3 stale-source failure.
// No commit, deployment or production approval check is performed here.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const gate=pkg.scripts['release:gate'].split(/\s*&&\s*/);
const first=gate.indexOf('npm run test:wish-lamp');
if(first<0||gate.at(-1)!=='node scripts/verify-production-release.mjs')throw Error('Gate continuation boundary changed');
const commands=['node --test tests/project-v-v3-nonblocking-fx-v2060.test.mjs',...gate.slice(first,-1)];
if(commands.some(command=>!/^npm run [a-z0-9:-]+$/.test(command)&&command!=='node --test tests/project-v-v3-nonblocking-fx-v2060.test.mjs'))throw Error('Unexpected non-npm gate command');
const logPath=path.join(directory,'release-continuation-after-banner.log'),resultPath=path.join(directory,'release-continuation-after-banner.json');
const prefixPath=path.join(directory,'release-gate-prefix.log');
const result={startedAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),prefix:{file:'release-gate-prefix.log',sha256:createHash('sha256').update(fs.readFileSync(prefixPath)).digest('hex'),previousContinuation:'release-continuation.json',failedAt:'test:live-connections',reason:'New IconTechniquePlayback.js omitted from banner-source equality list; only this file is rerun'},skipped:gate.slice(0,first),excluded:['node scripts/verify-production-release.mjs'],commands,steps:[],ok:false};
fs.writeFileSync(logPath,'ICON technique release continuation\n'+JSON.stringify({head:result.head,startedAt:result.startedAt,commands},null,2)+'\n');
const save=()=>fs.writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');
save();
for(const command of commands){
 const step={command,startedAt:new Date().toISOString()};
 console.log('START '+command);
 fs.appendFileSync(logPath,'\n$ '+command+'\n');
 const started=Date.now();let tail='';
 const code=await new Promise((resolve,reject)=>{
  const child=process.platform==='win32'?spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{cwd:root,env:{...process.env,NO_COLOR:'1'},windowsHide:true}):spawn(command.startsWith('node ')?process.execPath:'npm',command.startsWith('node ')?command.slice(5).split(' '):['run',command.slice('npm run '.length)],{cwd:root,env:{...process.env,NO_COLOR:'1'}});
  const receive=chunk=>{const text=chunk.toString();fs.appendFileSync(logPath,text);tail=(tail+text).slice(-18000);};
  child.stdout.on('data',receive);child.stderr.on('data',receive);child.on('error',reject);child.on('close',code=>resolve(code??1));
 });
 Object.assign(step,{finishedAt:new Date().toISOString(),durationMs:Date.now()-started,exitCode:code});
 result.steps.push(step);save();console.log((code===0?'PASS ':'FAIL ')+command+' '+Math.round(step.durationMs/1000)+'s');
 if(code!==0){
  result.failedCommand=command;result.finishedAt=new Date().toISOString();result.failureTail=tail;save();
  console.error(tail.split(/\r?\n/).slice(-48).join('\n'));process.exitCode=code;break;
 }
}
if(!result.failedCommand){result.ok=true;result.finishedAt=new Date().toISOString();save();console.log('PASS continuation; production release verification intentionally excluded.');}
