import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {fixture} from './helpers/cooperative-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=await cooperativeMiniflare(),out=path.join(h.temp,'cms-screenshots');await fs.mkdir(out,{recursive:true});
console.log('CMS UI evidence:',out);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
const errors=[],checks=[];
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]].filter(([label])=>!process.env.COOP_CMS_QA_ONLY||label===process.env.COOP_CMS_QA_ONLY)){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  await context.addInitScript(cards=>{
   localStorage.setItem('cnine_admin_token','local-qa-1');localStorage.setItem('cnine_card_api_token','local-qa-1');
   localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:1,serverUserId:1,nickname:'검수 운영자',role:'OWNER',coin:12345678,cardShards:2000,masterStars:1000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:Object.fromEntries(cards.map(c=>[c.id,13])),history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true}));
   localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
  },fixture.cardsByLevel[13]);
  await context.route('**/*',r=>new URL(r.request().url()).origin===h.origin?r.continue():r.abort());
  await context.route('**/api/admin/dashboard*',r=>r.fulfill({json:{role:'OWNER',admin:{nickname:'검수 운영자',role:'OWNER'},stats:{users:4,cards:0,totalCoin:0,draws24h:0,banned:0,urOwned:0,ssrOwned:0,coupons:0}}}));
  await context.route('**/api/admin/mercenaries/opening',r=>r.fulfill({json:{mode:'OFF',ready:false,rankCounts:{},blockers:[]}}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(label+': '+e.stack));page.on('dialog',d=>d.accept());
  await page.goto(h.origin+'/admin/');
  await page.locator('#nav [data-view="cooperative"]').waitFor({state:'visible'});
  await page.locator('#nav [data-view="cooperative"]').click();
  const root=page.locator('#view-cooperative');await root.locator('form').waitFor({state:'visible'});
  assert.equal(await root.locator('[name="mode"]:checked').inputValue(),'TEST');
  await page.screenshot({path:path.join(out,label+'-01-operation.png'),fullPage:true});
  if(process.env.COOP_CMS_QA_DEBUG)console.log(await page.evaluate(()=>({height:innerHeight,width:innerWidth,scrollY,visual:{height:visualViewport.height,width:visualViewport.width,pageTop:visualViewport.pageTop,offsetTop:visualViewport.offsetTop,scale:visualViewport.scale},elements:['aside','#cms','#view-cooperative','.coop-cms-search','[data-search]'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return {s,x:r.x,y:r.y,w:r.width,h:r.height,position:c.position,transform:c.transform,zoom:c.zoom,overflow:c.overflow};})})));
  await root.locator('[data-query]').fill('분대 4');await root.locator('[data-search]').click();await root.locator('[data-add="4"]').waitFor();await root.locator('[data-add="4"]').click();
  await root.locator('[name="combat.maxBattleSeconds"]').fill('120');
  await root.locator('[data-tab="combat"]').click();
  await root.locator('[name="combat.stages.0.name"]').fill('노심 전초기지');
  await root.locator('[name="combat.difficulties.0.monsters.0.power"]').fill('7777777');
  await page.screenshot({path:path.join(out,label+'-02-monsters.png'),fullPage:true});
  await root.locator('[data-difficulty="1"]').click();await root.locator('[name="combat.difficulties.1.monsters.4.shieldPercent"]').fill('12');
  await root.locator('[data-tab="mechanics"]').click();await root.locator('[name="combat.patterns.rupturePercent"]').fill('11');await root.locator('[name="combat.difficulties.0.responseSeconds"]').fill('10');
  await page.screenshot({path:path.join(out,label+'-03-mechanics.png'),fullPage:true});
  await root.locator('[data-tab="economy"]').click();await root.locator('[name="economyDraft.masterStar"]').fill('300000');
  await root.locator('[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#view-cooperative [data-status]')?.textContent.startsWith('저장 완료'));
  const saved=(await h.request(1,'settings')).settings;assert.equal(saved.combat.difficulties[0].monsters[0].power,7777777);assert.equal(saved.combat.difficulties[1].monsters[4].shieldPercent,12);assert.equal(saved.combat.patterns.rupturePercent,11);assert.equal(saved.economyDraft.masterStar,300000);assert.equal(saved.rewardLocked,true);assert.ok(saved.testUserIds.includes(4));
  await page.screenshot({path:path.join(out,label+'-04-economy.png'),fullPage:true});
  await root.locator('[data-reload]').click();await page.waitForFunction(()=>document.querySelector('#view-cooperative [data-status]')?.textContent.startsWith('저장된 설정'));
  assert.equal(await root.locator('[name="economyDraft.masterStar"]').inputValue(),'300000');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'CMS must fit '+label);
  await root.locator('[data-tab="operation"]').click();await root.locator('[data-remove="4"]').click();
  // A competing OWNER save returns a conflict and preserves the user's edits.
  await h.request(1,'settings',{settings:{mode:'TEST',testUserIds:saved.testUserIds,revision:saved.revision}});
  await root.locator('[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#view-cooperative [data-status]')?.textContent.includes('다른 화면'));
  assert.equal(await root.locator('[data-remove="4"]').count(),0);
  await root.locator('[data-reload]').click();await page.waitForFunction(()=>document.querySelector('#view-cooperative [data-status]')?.textContent.startsWith('저장된 설정'));
  await root.locator('[data-remove="4"]').click();await root.locator('[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#view-cooperative [data-status]')?.textContent.startsWith('저장 완료'));
  await page.reload();await page.locator('#nav [data-view="cooperative"]').click();await page.locator('#view-cooperative form').waitFor();
  assert.equal(await page.locator('#view-cooperative [name="combat.maxBattleSeconds"]').inputValue(),'120');
  await page.evaluate(()=>document.getElementById('roleBadge').textContent='ADMIN');await page.locator('#nav [data-view="cooperative"]').waitFor({state:'hidden'});
  await page.goto(h.origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
  await page.locator('#pveCoopTab').waitFor({state:'visible'});await page.locator('#pveCoopTab').click();await page.waitForFunction(()=>document.querySelector('.coop-meta')?.textContent.includes('120초 전투'));
  assert.match(await page.locator('.coop-operation-strip').textContent(),/노심 전초기지/);
  await page.locator('[data-guide]').click();assert.match(await page.locator('[data-guide-content]').textContent(),/120초/);
  await page.locator('[data-chapter="1"]').click();assert.match(await page.locator('[data-guide-content]').textContent(),/11%/);assert.match(await page.locator('[data-guide-content]').textContent(),/10초 안에 대응/);
  await page.screenshot({path:path.join(out,label+'-05-public-guide.png')});
  checks.push({viewport:label,width,height,cmsMenu:true,saveReload:true,searchAddRemove:true,conflictPreserved:true,publicGuideSynced:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,errors,origin:h.origin},null,2));console.log(JSON.stringify({checks,errors}));
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.log(await page.evaluate(()=>({url:location.href,height:innerHeight,scrollY,visualHeight:visualViewport.height,visualTop:visualViewport.pageTop,hit:(()=>{const e=document.querySelector('#view-cooperative [data-search]');if(!e)return null;const r=e.getBoundingClientRect();return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},stack:document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).slice(0,6).map(e=>e.tagName+'.'+e.className)};})()})).catch(()=>null));}throw error;}finally{await browser.close();await h.dispose();}
