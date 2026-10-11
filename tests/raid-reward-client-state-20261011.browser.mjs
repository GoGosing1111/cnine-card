import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://127.0.0.1:8993',out=new URL('../docs/qa/raid-reward-client-state-20261011/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const report={scope:'Actual main application, loopback-only synthetic raid and claims',viewports:[],errors:[]};
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const room=99000+viewport.width;
  await fetch(origin+'/qa/control',{method:'POST',body:JSON.stringify({room,status:'ENDED',claimed:false})});
  const page=await browser.newPage({viewport,serviceWorkers:'block'});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(id=>{
   localStorage.setItem(`cnine_raid_claimed_${id}`,'1');
   localStorage.setItem(`cnine_raid_result_revealed_${id}`,'1');
  },room);
  await page.goto(origin+'/review/?screen=battle');
  await page.locator('[data-pve-mode="raid"]').first().click({timeout:45000});
  const claim=page.locator('#raidClaim');await claim.waitFor({state:'visible',timeout:30000});
  assert.equal(await claim.isEnabled(),true);
  assert.equal(await claim.textContent(),'보상 받기');
  assert.equal(await page.evaluate(id=>localStorage.getItem(`cnine_raid_claimed_${id}`),room),'1');
  await claim.scrollIntoViewIfNeeded();
  const box=await claim.boundingBox();assert(box&&box.x>=0&&box.x+box.width<=viewport.width+1);
  await page.screenshot({path:fileURLToPath(new URL(`reward-${viewport.width}.png`,out))});
  await claim.click();
  const back=page.locator('#raidSettledRefresh');await back.waitFor({state:'visible',timeout:30000});
  await back.scrollIntoViewIfNeeded();
  await page.screenshot({path:fileURLToPath(new URL(`settled-${viewport.width}.png`,out))});
  const before=await(await fetch(origin+'/qa/state')).json();
  const refreshed=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/raid/status'&&!url.searchParams.has('instanceId')});
  await back.click();await refreshed;
  const after=await(await fetch(origin+'/qa/state')).json();
  assert(after.requests>before.requests);assert.equal(after.claims,before.claims);
  report.viewports.push({...viewport,claimVisible:true,claimEnabledWithStaleLocalFlag:true,returnToRooms:true,claimInViewport:true});
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.message;throw error;}
finally{await browser.close();fs.writeFileSync(new URL('browser-report.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
