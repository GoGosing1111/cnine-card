// Local Worker compile only. Never log environment values or publish a Worker.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../..'),require=createRequire(path.join(root,'package.json'));
const packagePath=require.resolve('wrangler/package.json'),pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
const cli=path.resolve(path.dirname(packagePath),typeof pkg.bin==='string'?pkg.bin:pkg.bin.wrangler);
const args=[cli,'deploy','--dry-run','--config','workers/api-runtime/wrangler.jsonc','--outdir',path.join(root,'tmp/icon-techniques-worker-dry-run')];
const result={startedAt:new Date().toISOString(),wranglerVersion:pkg.version,command:'wrangler deploy --dry-run --config workers/api-runtime/wrangler.jsonc --outdir tmp/icon-techniques-worker-dry-run',productionWrites:false};
let stdout='',stderr='';
const exitCode=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,CI:'true',WRANGLER_LOG:'error',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_SEND_METRICS:'false'},windowsHide:true});
 child.stdout.on('data',chunk=>{stdout+=chunk.toString()});child.stderr.on('data',chunk=>{stderr+=chunk.toString()});
 child.on('error',reject);child.on('close',code=>resolve(code??1));
});
Object.assign(result,{finishedAt:new Date().toISOString(),exitCode,ok:exitCode===0,stdoutBytes:Buffer.byteLength(stdout),stderrBytes:Buffer.byteLength(stderr)});
if(exitCode!==0){
 const redact=text=>text.replace(/(Bearer\s+)\S+/gi,'$1[REDACTED]').replace(/((?:password|token|secret|api[_ -]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi,'$1[REDACTED]').replace(/(postgres(?:ql)?:\/\/)[^@]+@/gi,'$1[REDACTED]@');
 result.error=redact(stderr||stdout).slice(-4000);
}
const out=path.join(root,'tmp/icon-techniques-worker-dry-run');
if(fs.existsSync(out))result.artifacts=fs.readdirSync(out).filter(file=>fs.statSync(path.join(out,file)).isFile()).map(file=>{const data=fs.readFileSync(path.join(out,file));return{file:'tmp/icon-techniques-worker-dry-run/'+file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}});
fs.writeFileSync(path.join(directory,'worker-dry-run.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
process.exitCode=exitCode;
