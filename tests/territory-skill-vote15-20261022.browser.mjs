import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TERRITORY_VOTE_QA_URL;
assert.equal(new URL(origin).hostname,'127.0.0.1');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'territory-vote15-'));
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
let activePage;
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,isMobile:viewport.width<700,hasTouch:viewport.width<700,serviceWorkers:'block'});
  let lastState,activated=false,voteCalls=0;
  const project=state=>{
   const s=structuredClone(state);assert.equal(s.counter.requiredVotes,15);
   s.battlefield.A.charge=s.battlefield.config.chargeMax;
   for(const skill of Object.values(s.counter.A.skills))skill.votes=0;
   const skill=s.counter.A.skills.INFILTRATION;
   Object.assign(skill,{votes:activated?0:14,voted:activated,ready:!activated,readyAt:activated?new Date(Date.now()+45*60000).toISOString():null});
   s.counter.A.skills.SIEGE_CANNON.votes=14;
   return s;
  };
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin)return route.abort();
   if(['/api/territory-war/state','/api/territory-war/state-lite'].includes(url.pathname)){
    const response=await route.fetch();lastState=await response.json();return route.fulfill({response,json:project(lastState)});
   }
   if(url.pathname==='/api/territory-war/vote-operation'){
    const body=route.request().postDataJSON();assert.equal(body.operation,'INFILTRATION');assert.match(body.voteKey,/^V25:/);
    voteCalls++;activated=true;
    return route.fulfill({json:{ok:true,activated:true,result:{voted:true,votes:15,requiredVotes:15},state:project(lastState)}});
   }
   return route.continue();
  });
  const page=await context.newPage(),errors=[];activePage=page;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(origin+'/');await page.locator('#qaTerritoryOpen').click();await page.locator('.tw4-shell').waitFor();
  await page.locator('.tw-vote-notice').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-vote-count]').innerText(),'14/15');
  await page.locator('.tw-vote-open').click();
  const skills=page.locator('.tw4-drawer-panel[data-tw4-panel="operations"]');await skills.waitFor({state:'visible'});
  assert.equal(await skills.locator('.tw5-skill-heading h3').innerText(),'15명 도달 시 자동 발동');
  const card=skills.locator('[data-tw3-operation="INFILTRATION"]');await card.scrollIntoViewIfNeeded();
  assert.match(await card.locator('[data-skill-status]').innerText(),new RegExp('14 / 15명'));assert.equal(await card.isDisabled(),false);
  await page.screenshot({path:path.join(out,'skills-'+viewport.width+'.png'),fullPage:true});
  await page.locator('.tw4-drawer header [data-tw4-drawer-close]').click();
  await page.locator('[data-tw4-drawer="facilities"]').first().dispatchEvent('click');
  const facilities=page.locator('.tw4-drawer-panel[data-tw4-panel="facilities"]');await facilities.waitFor({state:'visible'});
  const cannon=facilities.locator('[data-tw3-operation="SIEGE_CANNON"]');await cannon.scrollIntoViewIfNeeded();
  assert.match(await cannon.locator('[data-skill-status]').innerText(),new RegExp('14 / 15명'));
  await page.screenshot({path:path.join(out,'cannon-'+viewport.width+'.png'),fullPage:true});
  await page.locator('.tw4-drawer header [data-tw4-drawer-close]').click();
  await page.locator('.tw4-action-dock [data-tw4-drawer="operations"]').click();
  await card.scrollIntoViewIfNeeded();await card.click();
  await page.locator('.tw3-toast').filter({hasText:'15명 투표 달성'}).waitFor();
  assert.equal(voteCalls,1);assert.equal(await card.isDisabled(),true);assert.match(await card.locator('[data-skill-status]').innerText(),/재사용/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,'activation-'+viewport.width+'.png'),fullPage:true});
  await page.goto(origin+'/qa-territory-admin');await page.locator('#tw3State').waitFor();
  assert.match(await page.locator('#territoryWarAdminRoot').innerText(),/같은 진영 15명 투표/);
  assert.deepEqual(errors,[]);
  reports.push({width:viewport.width,threshold:15,heading:true,alert:true,skillCard:true,cannon:true,activationToast:true,voteCalls,cooldown:true,cms:true,pageErrors:errors});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({reports},null,2));console.log(JSON.stringify({out,reports}));
}catch(error){if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error('Artifacts:',out);throw error;}
finally{await browser.close();}
