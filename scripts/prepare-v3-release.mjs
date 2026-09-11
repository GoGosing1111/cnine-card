import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const npmCli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const directory=path.resolve(process.env.V3_PREPARE_OUTPUT||'tmp/v3-overhaul-ready-20260911/release');fs.mkdirSync(directory,{recursive:true});
const commands=pkg.scripts['release:gate'].split(' && ').filter(c=>c!=='node scripts/verify-production-release.mjs');
const results=[];let passed=true;
for(const command of commands){
  let args;if(/^npm run [a-zA-Z0-9:-]+$/.test(command))args=[npmCli,'run',command.slice(8)];else if(/^node scripts\/[a-zA-Z0-9_.-]+\.mjs$/.test(command))args=[command.slice(5)];else throw new Error('Unexpected release gate command: '+command);
  console.log(`[PREPARE] ${command}`);const started=Date.now();const run=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
  const file=`${results.length+1}-${command.replace(/[^a-zA-Z0-9-]/g,'_')}.log`;fs.writeFileSync(path.join(directory,file),(run.stdout||'')+(run.stderr||''));
  results.push({command,passed:run.status===0,exitCode:run.status,durationMs:Date.now()-started,log:file});
  console.log(`${run.status===0?'PASS':'FAIL'} ${command}`);if(run.status!==0){console.error(((run.stdout||'')+(run.stderr||'')).split('\n').filter(l=>l.length<500).slice(-45).join('\n'));passed=false;break;}
}
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const files=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json','utf8')).outputs.map(r=>({file:r.file,sha256:createHash('sha256').update(fs.readFileSync(r.file)).digest('hex')}));
const report={preparedAt:new Date().toISOString(),head:git(['rev-parse','HEAD']),originMain:git(['rev-parse','origin/main']),regressionsPassed:passed,productionGateRun:false,deployAuthorized:false,
  reason:'User holds V3 activation. This command executes all release regressions but never deploys, changes origin/main, or bypasses the production gate. The final clean/main-aligned release:gate is still mandatory.',results,files};
fs.writeFileSync(path.join(directory,'preparation.json'),JSON.stringify(report,null,2)+'\n');
if(!passed)process.exitCode=1;else console.log('All release regressions passed. Production activation remains held.');
