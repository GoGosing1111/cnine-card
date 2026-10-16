import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {WEEKLY_RAID_BOSSES_V1,WEEKLY_RAID_ROTATION_V1,WEEKLY_RAID_DAY_LABELS} from '../functions/_raid_weekly_bosses_v1.js';
import {presentOriginalIpResponse,originalRaidPresentation} from '../shared/monster-original-ip-presentation-v1.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(process.env.WORLD_RAID_QA_OUTPUT||path.join(root,'docs/qa/world-raid-original-ip-20261017'));
fs.mkdirSync(output,{recursive:true});
const port=Number(process.env.WORLD_RAID_QA_PORT||8993),origin='http://127.0.0.1:'+port;
let selected='ICHIGO';
const ids={NAGATO:4,YORIICHI:6,ICHIGO:8},weekdays={NAGATO:1,YORIICHI:2,ICHIGO:6};
function status(){
  const profiles=WEEKLY_RAID_BOSSES_V1.map(row=>({...row,id:ids[row.code],image:row.sourceArt,isActive:true,openCost:0,powerRating:5_000_000}));
  const weeklyBosses=WEEKLY_RAID_ROTATION_V1.map((code,weekday)=>({...profiles.find(row=>row.code===code),weekday,dayLabel:WEEKLY_RAID_DAY_LABELS[weekday]}));
  const todayBoss=weeklyBosses[weekdays[selected]];
  return presentOriginalIpResponse('raid/status',{
    current:null,settings:{title:'월드 레이드',dailyEntries:2,maxParticipants:30,minParticipants:1,scheduleMode:'ALWAYS'},
    schedule:{isOpen:true,canEnter:true},availableBosses:[todayBoss],weeklyBosses,todayBoss,
    dailyEntry:{count:0,limit:2,remaining:2},dailyEntryUsed:false,rooms:[],participants:[],me:null,serverNow:new Date().toISOString()
  });
}
const server=spawn(process.execPath,['scripts/serve-world-raid-v2.mjs'],{cwd:root,env:{...process.env,WORLD_RAID_QA_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',data=>serverLog+=data);server.stderr.on('data',data=>serverLog+=data);
const report={scope:'Actual index.html/app.js with loopback-only API fixtures; no production account actions',checks:[],screens:[],errors:[]};
let browser;
try{
  for(let attempt=0;attempt<50;attempt++){try{if((await fetch(origin+'/api/service/status')).ok)break;}catch{}if(attempt===49)throw Error(serverLog||'QA server did not start');await new Promise(resolve=>setTimeout(resolve,200));}
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
  for(const width of [1440,390]){
    selected='ICHIGO';
    const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},isMobile:width<500,hasTouch:width<500,serviceWorkers:'block'});
    await context.route('**/api/**',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/api/raid/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(status())});
      return route.continue();
    });
    const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.goto(origin+'/review/?screen=battle',{waitUntil:'domcontentloaded'});
    await page.locator('[data-pve-mode="raid"]').first().click({timeout:45000});
    await page.locator('#pveRaidView .raid-open-boss').waitFor({state:'visible',timeout:30000});
    for(const code of width===1440?['ICHIGO','NAGATO','YORIICHI']:['ICHIGO']){
      selected=code;
      await page.evaluate(async()=>{clearApiCache('raid/status');await loadRaidView();});
      const entry=originalRaidPresentation(ids[code]);
      await page.waitForFunction(name=>document.querySelector('#pveRaidView .raid-open-boss h3')?.textContent===name,entry.name);
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('#pveRaidView .raid-open-boss img')).every(img=>img.complete&&img.naturalWidth>0));
      const view=await page.locator('#pveRaidView').evaluate(el=>({
        text:el.innerText,
        caption:el.querySelector('.raid-weekly-roster header>span')?.textContent,
        image:el.querySelector('.raid-open-boss img')?.getAttribute('src'),
        sourceImage:el.querySelector('.raid-open-boss img')?.dataset.cnineOriginalSrc||el.querySelector('.raid-open-boss img')?.getAttribute('src'),
        imageLoaded:el.querySelector('.raid-open-boss img')?.naturalWidth>0,
        buttonBossId:el.querySelector('.raidOpenBtn')?.dataset.bossId,
        overflow:document.documentElement.scrollWidth>innerWidth
      }));
      assert.doesNotMatch(view.text,/나가토|요리이치|이치고/);
      assert.equal(view.caption,'오르제 · 렌조 · 제노 3종 로테이션');
      assert.equal(view.sourceImage,entry.battleSprite);
      assert.equal(view.buttonBossId,String(ids[code]));
      assert.equal(view.imageLoaded,true);
      assert.equal(view.overflow,false);
      report.checks.push({width,boss:entry.name,...view});
      if(code==='ICHIGO'){
        const name='world-raid-'+width+'.png';
        await page.locator('#pveRaidView .raid-weekly-roster').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,name)});
        report.screens.push(name);
        const button=page.locator('#pveRaidView .raidOpenBtn');
        await button.scrollIntoViewIfNeeded();
        assert.equal(await button.isVisible(),true);
        const nameBottom='world-raid-'+width+'-boss.png';
        await page.screenshot({path:path.join(output,nameBottom)});
        report.screens.push(nameBottom);
      }
    }
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
  report.passed=true;
}finally{
  await browser?.close();
  server.kill();
  fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.map(({width,boss,image,overflow})=>({width,boss,image,overflow})),screens:report.screens,errors:report.errors}));
