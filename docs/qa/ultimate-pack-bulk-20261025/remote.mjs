import fs from 'node:fs';import path from 'node:path';import {unstable_dev} from 'wrangler';
const out=path.resolve(process.argv[2]),snapshot=JSON.parse(fs.readFileSync(path.join(out,'production-before.json'))),key=crypto.randomUUID();let worker;const reports=[];
try{
 worker=await unstable_dev(path.join(import.meta.dirname,'remote-worker.mjs'),{config:path.join(import.meta.dirname,'wrangler.jsonc'),local:false,ip:'127.0.0.1',port:8795,logLevel:'warn',persist:false,vars:{BENCH_KEY:key},experimental:{disableExperimentalWarning:true,showInteractiveDevSession:false,watch:false,disableDevRegistry:true}});
 console.log('Ephemeral Cloudflare preview ready; benchmark uses READ ONLY and temporary tables.');
 for(const scenario of ['live','stock','soldout','maximum']){
  const r=await worker.fetch('/benchmark',{method:'POST',headers:{'content-type':'application/json','x-benchmark-key':key},body:JSON.stringify({scenario,pack:snapshot.pack,context:snapshot.context,critical:snapshot.critical})}),report=await r.json();if(!r.ok)throw Error(JSON.stringify(report));
  fs.writeFileSync(path.join(out,'remote-'+scenario+'-receipt.json'),JSON.stringify(report.receipt));delete report.receipt;reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(out,'remote.json'),JSON.stringify({reports},null,2));
 }
}finally{if(worker){await worker.stop();fs.writeFileSync(path.join(out,'remote-cleanup.json'),JSON.stringify({at:new Date().toISOString(),stopped:true,permanentWorkerCreated:false,productionWrites:0},null,2));console.log('Remote preview stopped.');}}
