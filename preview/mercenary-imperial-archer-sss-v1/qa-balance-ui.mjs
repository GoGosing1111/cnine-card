import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const file=p=>fileURLToPath(new URL(p,import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const report={scope:'BALANCE_TEXT_AND_POLICY_BINDING_ONLY_VISUAL_TIMELINE_UNCHANGED',screens:[],errors:[],
 previousVisualQa:'qa/arrow-v2/runtime-report.json',bundleSha256:createHash('sha256').update(await fs.readFile(file('preview.bundle.js'))).digest('hex')};
try{
 for(const [name,viewport]of [['desktop',{width:1440,height:1080}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto('http://127.0.0.1:8878/preview/mercenary-imperial-archer-sss-v1/');
  await page.waitForFunction(()=>window.ImperialArcherPreview?.diagnostics().ready,null,{timeout:60000});
  const descriptions=[];
  for(const [mode,ratio,cooldown]of [['skill',680,4],['ultimate',700,5]]){
   await page.locator(`[data-mode="${mode}"]`).click();await page.evaluate(()=>ImperialArcherPreview.fx.seek(.8));
   const text=await page.locator('#description').innerText();assert.ok(text.includes(ratio+'%'));assert.ok(text.includes('재사용 '+cooldown+'행동'));descriptions.push(text);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  const policy=await page.evaluate(()=>ImperialArcherPreview.balance);assert.equal(policy.actionCredit,1.5);assert.equal(policy.runtimeEnabled,false);
  await page.locator('#description').scrollIntoViewIfNeeded();await page.screenshot({path:file('qa/arrow-v2/balance-'+name+'.png')});
  report.screens.push({name,viewport,descriptions,overflow:false,policyVersion:policy.version});await page.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}finally{await fs.writeFile(file('qa/arrow-v2/balance-ui-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log('Archer balance UI: desktop / mobile PASS');
