import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const out=new URL('./evidence/',import.meta.url);await fs.mkdir(out,{recursive:true});
let output,exitCode=0;try{output=execFileSync(process.execPath,['--test','--test-reporter=tap',fileURLToPath(new URL('./correct.test.mjs',import.meta.url))],{encoding:'utf8',windowsHide:true,timeout:120000});}catch(e){output=String(e.stdout||'')+String(e.stderr||'');exitCode=e.status||1;}
const name='tests-'+Date.now(),report={exitCode,passed:Number(output.match(/# pass (\d+)/)?.[1]||0),failed:Number(output.match(/# fail (\d+)/)?.[1]||0),correctSha256:createHash('sha256').update(await fs.readFile(new URL('./correct.mjs',import.meta.url))).digest('hex'),checkedAt:new Date().toISOString()};
await fs.writeFile(new URL(name+'.log',out),output,{flag:'wx'});await fs.writeFile(new URL(name+'.json',out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});if(exitCode===0)await fs.writeFile(new URL('tests.json',out),JSON.stringify(report,null,2)+'\n');console.log(output);console.log(JSON.stringify(report));process.exitCode=exitCode;
