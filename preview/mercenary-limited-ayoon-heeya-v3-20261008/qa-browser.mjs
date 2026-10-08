import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {file} from './inspect-assets.mjs';
const {chromium}=await import(pathToFileURL('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
await fs.mkdir(file('qa'),{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const report=[];
try{for(const [name,viewport]of [['pc',{width:1440,height:1100}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:8848/preview/mercenary-limited-ayoon-heeya-v3-20261008/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.LimitedDuoPreview?.fx,{timeout:45000}).catch(e=>{throw Error(e.message+' '+errors.join('|')+' '+page.url());});
 for(const code of ['V-997','V-998']){
  await page.selectOption('#character',code);await page.waitForFunction(c=>window.LimitedDuoPreview.fx?.plan.code===c,code);
  for(const mode of ['basic','skill']){
   await page.selectOption('#mode',mode);await page.waitForFunction(m=>window.LimitedDuoPreview.fx?.plan.mode===m,mode);
   const contacts=await page.evaluate(()=>window.LimitedDuoPreview.fx.plan.contacts.map(c=>c.at));
   for(let i=0;i<contacts.length;i++){
    const d=await page.evaluate(at=>{const f=window.LimitedDuoPreview.fx;f.seek(at);return f.diagnostics();},contacts[i]);
    await page.screenshot({path:file('qa/'+name+'-'+code+'-'+mode+'-'+i+'.png'),fullPage:true});report.push({name,code,mode,contact:i,...d});
   }
   const controls=await page.evaluate(async()=>{
    const f=window.LimitedDuoPreview.fx;f.seek(.2);f.pause();const before=f.time;await new Promise(r=>setTimeout(r,140));const pauseFixed=f.time===before;
    f.seek(.1);f.setSpeed(2);f.play();const start=f.time;await new Promise(r=>setTimeout(r,160));f.pause();const doubleDelta=f.time-start;
    f.showEffects=false;f.seek(f.plan.contacts.at(-1).at);const effectsHidden=f.diagnostics().visibleEffects===0;
    f.cancel();const end=f.diagnostics();f.showEffects=true;
    return{pauseFixed,doubleDelta,effectsHidden,end};
   });report.push({name,code,mode,controls});
   if(!controls.pauseFixed||!controls.effectsHidden||controls.end.visibleEffects||controls.end.registeredTimelines)throw Error('Control cleanup regression');
  }
 }
 report.push({name,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
 if(errors.length)throw Error(errors.join('|'));await page.close();
}}finally{await browser.close();await fs.writeFile(file('qa/browser-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({checks:report.length,errors:report.filter(r=>r.errors?.length)}));
