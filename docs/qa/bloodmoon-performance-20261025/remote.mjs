import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unstable_dev} from 'wrangler';
import {scenarios} from './fixture.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(process.argv[2]),snapshot=JSON.parse(fs.readFileSync(path.join(out,'public-pool-before.json'))),key=crypto.randomUUID();
let worker;const reports=[];
try{
 worker=await unstable_dev(path.join(here,'remote-worker.mjs'),{config:path.join(here,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:8794,logLevel:'warn',persist:false,vars:{BENCH_KEY:key},experimental:{disableExperimentalWarning:true,showInteractiveDevSession:false,watch:false,disableDevRegistry:true}});
 console.log('Cloudflare remote preview ready; production sales remain locked.');
 for(const scenario of scenarios){
  const start=performance.now(),response=await worker.fetch('/benchmark',{method:'POST',headers:{'content-type':'application/json','x-benchmark-key':key},body:JSON.stringify({scenario,normalCards:snapshot.normalCards,iterations:5,returnReceipt:true})});
  const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result));
  fs.writeFileSync(path.join(out,'remote-'+scenario+'-receipt.json'),JSON.stringify(result.lastReceipt));delete result.lastReceipt;
  result.clientRequestMs=performance.now()-start;reports.push(result);fs.writeFileSync(path.join(out,'remote-progress.json'),JSON.stringify({reports},null,2));
  console.log(JSON.stringify({scenario,colo:result.colo,connectMs:result.connectMs,samples:result.samples.map(x=>({ms:x.ms,types:x.ordinaryTypes,serials:x.limitedSerials,sql:x.batchStatements,wire:x.wireCalls})),readOnly:result.readOnly,temporaryTablesRemoved:result.temporaryTablesRemoved,persistentWrites:result.persistentWrites}));
 }
 fs.writeFileSync(path.join(out,'remote.json'),JSON.stringify({status:'PASSED',at:new Date().toISOString(),reports},null,2));
}catch(error){fs.writeFileSync(path.join(out,'remote-failure.json'),JSON.stringify({error:String(error.message),reports},null,2));throw error;}
finally{if(worker){await worker.stop();console.log('Remote preview stopped.');fs.writeFileSync(path.join(out,'remote-cleanup.json'),JSON.stringify({at:new Date().toISOString(),stopped:true,productionWorkerRedeployed:false,persistentTestWorkerCreated:false},null,2));}}
