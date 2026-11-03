import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url),out=new URL('evidence/',dir);await fs.mkdir(out,{recursive:true});
let result,exitCode=0;try{result=execFileSync(process.execPath,['--test','--test-reporter=tap',fileURLToPath(new URL('grant.test.mjs',dir))],{encoding:'utf8',windowsHide:true,timeout:120000});}catch(e){result=String(e.stdout||'')+String(e.stderr||'');exitCode=e.status||1;}
await fs.writeFile(new URL('tests.log',out),result,{flag:'wx'});
const report={exitCode,passed:Number(result.match(/# pass (\d+)/)?.[1]||0),failed:Number(result.match(/# fail (\d+)/)?.[1]||0),grantSha256:createHash('sha256').update(await fs.readFile(new URL('grant.mjs',dir))).digest('hex'),checkedAt:new Date().toISOString()};
await fs.writeFile(new URL('tests.json',out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(result);console.log(JSON.stringify(report));process.exitCode=exitCode;
