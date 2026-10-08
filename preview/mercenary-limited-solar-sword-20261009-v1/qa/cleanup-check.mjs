import fs from'node:fs/promises';import{fileURLToPath}from'node:url';import {chromium}from'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const file=p=>fileURLToPath(new URL(p,import.meta.url)),b=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),report=[];
try{for(const [name,viewport]of[['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
const p=await b.newPage({viewport}),errors=[];p.on('pageerror',e=>errors.push(e.stack));await p.goto('http://127.0.0.1:8914/preview/mercenary-limited-solar-sword-20261009-v1/');await p.waitForFunction(()=>window.SolarPreview);
const result=await p.evaluate(()=>{const r=window.SolarPreview,f=r.fx;f.setMode('ultimate');f.seek(2.5);f.play();r.dispose();f.cancel();r.dispose();return{disposed:f.disposed,frontDestroyed:f.front.destroyed,backDestroyed:f.back.destroyed,timelineGone:f.timeline===null};});
await p.waitForTimeout(500);await p.close();report.push({name,errors,...result});}}finally{await b.close();}
await fs.writeFile(file('cleanup-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.some(r=>r.errors.length||!r.disposed||!r.frontDestroyed||!r.backDestroyed||!r.timelineGone))process.exitCode=1;
