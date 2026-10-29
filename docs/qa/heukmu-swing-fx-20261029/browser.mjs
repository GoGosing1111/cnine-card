import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout';
const out=path.dirname(new URL(import.meta.url).pathname).replace(/^\/(.:)/,'$1'),publicBase=process.env.QA_PUBLIC_BASE||'';
const baseline='ffe9668ce',baselineFiles=new Set(['js/app.js','js/battle-v3-live.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js']);
const server=spawn(process.execPath,['tests/heukmu-live-20261029.qa-server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,QA_OUT:out,QA_PUBLIC_BASE:publicBase},stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',d=>stderr+=d);
const url=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{for(const line of String(d).split('\n')){try{const j=JSON.parse(line);if(j.url)resolve(j.url);}catch{}}});server.once('exit',code=>reject(Error('QA server '+code+' '+stderr)));});
console.log(JSON.stringify({url,publicBase}));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[],originalFiles=new Map();let activePage;
const sha=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
try{
 for(const width of process.env.QA_WIDTHS?JSON.parse(process.env.QA_WIDTHS):publicBase?[390]:[1440,390]){
  let before;
  for(const baselineMode of publicBase||process.env.QA_CURRENT_ONLY||width===1440?[false]:[true,false]){
   const context=await browser.newContext({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   activePage=page;
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
   await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url()),file=u.pathname.slice(1);
    if(u.origin!==new URL(url).origin)return route.abort();
    if(file==='__qa/client.js'){
     const client=fs.readFileSync(root+'/docs/qa/heukmu-live-20261029/qa-client.js','utf8').replace('state={engine,renderer};','state={engine,renderer};window.__heukmuState=state;');
     return route.fulfill({status:200,contentType:'text/javascript',body:client});
    }
    if(baselineMode&&baselineFiles.has(file)){
     if(!originalFiles.has(file))originalFiles.set(file,execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:32e6,windowsHide:true}));
     return route.fulfill({status:200,contentType:'text/javascript',body:originalFiles.get(file)});
    }
    return route.continue();
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');
   await page.locator('#qa-hunt').click();
   await page.waitForFunction(()=>window.__heukmuState?.engine?.heukmuStates?.size===1&&document.getElementById('qa-status').textContent.includes('initialized'),null,{timeout:60000});
   const sample=await page.evaluate(()=>{
    const e=__heukmuState.engine,f=[...e.heukmuStates.values()][0].fx,rows={};
    for(const mode of ['attack','cross','cast','ultimate']){
     f.begin(mode,e.enemies);const frames=[];
     for(let i=0;i<=Math.ceil(f.plan.duration*50);i++){
      const t=Math.min(i/50,f.plan.duration);f.render(t);frames.push({t,pose:f.pose,effects:f.effectFrames.map(({bank,index,role,size})=>({bank,index,role,size})),contacts:f.contacts.map(({at,target,wave})=>({at,target,wave})),area:f.area.diagnostics()});
     }
     rows[mode]={plan:structuredClone(f.plan),frames};
    }
    return rows;
   });
   if(baselineMode)before=sample;
   else if(before)for(const mode of Object.keys(sample)){
    assert.deepEqual(sample[mode].plan,before[mode].plan,'Authored plan and contacts '+mode);
    const fxSignature=row=>row.frames.map(f=>({t:f.t,effects:f.effects.map(({size,...r})=>r),contacts:f.contacts,area:f.area}));
    assert.deepEqual(fxSignature(sample[mode]),fxSignature(before[mode]),'FX time/frame/contact unchanged '+mode);
    for(let i=0;i<sample[mode].frames.length;i++)for(let j=0;j<sample[mode].frames[i].effects.length;j++){
     const after=sample[mode].frames[i].effects[j],old=before[mode].frames[i].effects[j];
     if(['black-dragon-cataclysm','eclipse-sundering'].includes(after.role))assert(after.size>=old.size,'Field never smaller');
     else assert(Math.abs(after.size/old.size-(mode==='ultimate'?1.6:1.5))<1e-9,mode+' '+after.role);
    }
   }
   const peaks=[];
   for(const [mode,t] of [['attack',.87],['cross',1.3],['cast',2.58],['ultimate',3.77]]){
    peaks.push(await page.evaluate(({mode,t})=>{
     const e=__heukmuState.engine,f=[...e.heukmuStates.values()][0].fx;f.begin(mode,e.enemies);f.render(t);return {mode,...f.diagnostics()};
    },{mode,t}));
    await page.locator('#heukmu-qa').evaluate(el=>el.style.visibility='hidden');
    await page.screenshot({path:path.join(out,(publicBase?'public-':'')+width+'-'+(baselineMode?'before':'after-v3')+'-'+mode+'.png')});
    await page.locator('#heukmu-qa').evaluate(el=>el.style.visibility='visible');
   }
   let checks;
   if(!baselineMode&&!publicBase&&!process.env.QA_SKIP_CHECKS){
    await page.locator('#qa-run').click();await page.waitForFunction(()=>{const s=JSON.parse(document.getElementById('qa-status').textContent);return s.allChecksPassed||s.errors?.length;},null,{timeout:45000});
    checks={pve:JSON.parse(await page.locator('#qa-status').textContent())};
    assert(checks.pve.allChecksPassed,JSON.stringify(checks.pve));
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');
    await page.locator('#qa-pvp').click();await page.waitForFunction(()=>window.__heukmuState?.engine?.heukmuStates?.size===2&&document.getElementById('qa-status').textContent.includes('initialized'),null,{timeout:60000});
    await page.locator('#qa-run').click();await page.waitForFunction(()=>{const s=JSON.parse(document.getElementById('qa-status').textContent);return s.allChecksPassed||s.errors?.length;},null,{timeout:45000});
    checks.pvp=JSON.parse(await page.locator('#qa-status').textContent());
    assert(checks.pvp.allChecksPassed,JSON.stringify(checks.pvp));
   }
   assert.deepEqual(errors,[]);for(const p of peaks){assert.equal(p.sword.handError,0);assert.equal(p.bodyRegistration.renderedReference,285);}
   reports.push({width,baseline:baselineMode,publicBase,sampleHash:sha(sample),frames:Object.fromEntries(Object.entries(sample).map(([k,v])=>[k,v.frames.length])),timingCompared:!!before&&!baselineMode,peaks,checks,errors});
   console.log(JSON.stringify({width,baseline:baselineMode,timingCompared:!!before&&!baselineMode,verified:true}));await context.close();
  }
 }
 fs.writeFileSync(path.join(out,publicBase?'public-browser.json':'browser.json'),JSON.stringify({reports,productionWrites:0},null,2));
}catch(e){let status;try{status=await activePage?.evaluate(()=>({status:document.getElementById('qa-status')?.textContent,visible:__heukmuState.engine.visible,timelines:[...__heukmuState.engine.simpleTimelines].map(t=>({paused:t.instance.paused(),time:t.instance.time(),duration:t.instance.duration(),speed:t.instance.timeScale()}))}));}catch{}fs.writeFileSync(path.join(out,'browser-failure-'+Date.now()+'.json'),JSON.stringify({error:e.stack,status,reports,stderr},null,2));throw e;}
finally{await browser.close();server.kill();}
