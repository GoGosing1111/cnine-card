import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root='C:/Users/User/.codex/worktrees/reverse-call-world-story/cnine-card';
const output='C:/Users/User/.codex/tmp/reverse-call-world-navigation-live-20261018';
const base='https://cnine-card.pages.dev',report={at:new Date().toISOString(),files:[],views:[]};
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(output,{recursive:true});
for(const file of ['index.html','service-worker.js','js/adventure-lobby-v2107.js','world/index.html']){
 const response=await fetch(base+'/'+file+'?worldNavCheck=20261018-v2',{cache:'no-store'});
 assert.equal(response.status,200,file);
 const local=await readFile(root+'/'+file),remote=Buffer.from(await response.arrayBuffer());
 assert.equal(hash(remote),hash(local),file);
 report.files.push({file,sha256:hash(remote)});
}
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:960},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
  await context.route('**/api/**',route=>route.fulfill({contentType:'application/json',body:'{"ok":true,"features":{}}'}));
  await context.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.resolve();});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/world/#scene=request');
  await page.locator('soop-adventure-lobby .side-link[data-route="world"]').waitFor({state:'attached'});
  await page.evaluate(()=>{
   document.querySelector('soop-adventure-lobby').remove();
   const lobby=SoopAdventureLobby.create();
   lobby.setAttribute('data-shared-navigation','');lobby.dataset.standalone='world';lobby.dataset.route='world';
   document.body.append(lobby);
  });
  const menu=page.locator('soop-adventure-lobby');
  if(mobile)await menu.locator('.mobile-dock [data-category="all"]').click();
  await menu.locator(mobile?'#menu-results [data-route="world"]':'.side-link[data-route="world"]').click();
  await page.waitForURL(base+'/world/',{timeout:10000});
  assert.equal(await page.locator('#cover').isVisible(),true);
  await page.locator('#start-story').click();await page.waitForURL('**#scene=rewrite');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:output+'/'+(mobile?'mobile':'pc')+'.png',animations:'disabled'});
  report.views.push({viewport:page.viewportSize(),entry:mobile?'mobile-all-menu':'pc-sidebar',defaultGameVisibility:true,url:page.url(),errors});
  await context.close();
 }
}finally{await browser.close();}
await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
