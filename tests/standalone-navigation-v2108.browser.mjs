// Public page navigation and phone layout. All API calls stay in this fixture.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {WISH_CHOICES,cleanWishSettings,wishChoicePool} from '../js/wish-lamp-model-v2077.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.LOBBY_QA_ORIGIN||'http://127.0.0.1:4197',out=process.env.LOBBY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'standalone-navigation-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],writes=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const card={code:'V-004',name:'베스페라',title:'붉은 저격수',position:'REAR',role:'SNIPER',rank:'SS',level:1,duplicates:0,basePower:120000,sourceArt:'assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png',skills:[],specialty:'후열 표적 타격',weakness:'근접 전투',basicTarget:'후열 단일 대상'};
const settings=cleanWishSettings({visible:true,enabled:false,coinCost:500000000,ticketCost:1});
const endpoints={
 'shell/summary':{avatarFeature:{visible:true},alchemyFeature:{visible:false}},
 'events/wish-lamp/feature':{visible:true,phase:'PAUSED'},
 'events/wish-lamp/state':{phase:'PAUSED',coin:1000000000,tickets:0,coinCost:500000000,ticketCost:1,choices:WISH_CHOICES.map(c=>wishChoicePool(settings,c.id)),startsAt:null,endsAt:null,serverNow:new Date().toISOString(),history:[]},
 'mercenary-codex':{version:'mercenary-codex-2098',revision:1,roles:{SNIPER:{label:'저격수'}},cards:[card]},
 'mercenaries/v3/state':{accountId:4242,coin:1000000000,available:true,loadout:{mercenaryCode:null,revision:1},cards:[card]},
 'character/equipment/forge/status':{publicVisible:true,notice:'보유 장비를 선택해 주세요.'},
 'character/equipment/forge/state':{accountId:4242,publicVisible:true,canEnhance:true,notice:'보유 장비를 선택해 주세요.',items:[],records:[],history:[],wallet:{coins:1000000000,protection:0,masterStars:0},policy:{protection:{itemCode:'PROTECTION'}},nextCursor:null}
};
try{
 for(const viewport of [{width:1440,height:1000},{width:1024,height:768},{width:390,height:844},{width:320,height:740}]){
  const page=await browser.newPage({viewport,serviceWorkers:'block'}),size=viewport.width+'x'+viewport.height;
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','navigation-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:4242,nickname:'검수 계정'}));});
  await page.route('**/api/**',r=>{const key=new URL(r.request().url()).pathname.slice(5);if(!['GET','HEAD'].includes(r.request().method()))writes.push(key);return r.fulfill({json:endpoints[key]||{enabled:false,visible:false,items:[]}});});
  for(const [url,route,ready] of [['/equipment-forge/','equipmentForge','#inventory-note'],['/mercenary-codex/','mercenaryDex','.roster-row'],['/mercenary-hangar/','mercenaryHangar','#roster [data-code]'],['/events/wish-lamp/','wishLamp','#wishStatus']]){
   await page.goto(base+url,{waitUntil:'domcontentloaded'});await page.locator(ready).first().waitFor();
   const menu=page.locator('soop-adventure-lobby');await menu.waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),size+' '+route+' no horizontal page clipping');
   check(await menu.getAttribute('data-route')===route,size+' '+route+' correct shared menu location');
   const category=viewport.width>980?'shop':'all';await menu.locator((viewport.width>980?'.sidebar ':'.mobile-dock ')+`[data-category="${category}"]`).click();
   if(category==='all')await menu.locator('.category-jump[data-category="shop"]').click();
   check(await menu.locator('.menu-result').count()===5,size+' '+route+' category contains only shop routes');
   const dialog=await menu.locator('#menu-dialog').boundingBox();check(dialog.x>=0&&dialog.y>=0&&dialog.x+dialog.width<=viewport.width+1&&dialog.y+dialog.height<=viewport.height+1,size+' '+route+' menu dialog fits');
   await menu.locator('#menu-search').fill('토벌');check(await menu.locator('.menu-result').count()===0,size+' '+route+' search remains scoped');await menu.locator('#close-menu').click();
   await menu.locator(viewport.width>980?'.sidebar [data-category="all"]':'.mobile-dock [data-category="all"]').click();
   check(await menu.locator('.category-divider').count()===6,size+' '+route+' bottom all-menu keeps all categories');await page.keyboard.press('Escape');
   if(route==='equipmentForge'){
    await page.locator('#tab-restore').click();check(await page.locator('#restore-options').isVisible(),size+' forge native restore tab remains usable');
    await page.locator('#rules-button').click();check(await page.locator('#rules-dialog').isVisible(),size+' forge native guide remains above navigation');await page.keyboard.press('Escape');
    await page.locator('#tab-enhance').click();
   }
   if(route==='mercenaryDex'){await page.locator('.roster-row').click();check(await page.locator('.stage-heading h2').textContent()===card.name,size+' codex selection still works');}
   await page.screenshot({path:path.join(out,route+'-'+size+'.png'),fullPage:true});
  }
  await page.close();
 }
 check(!errors.length,'no standalone JavaScript errors: '+errors.join(' | '));check(!writes.length,'navigation never sends a purchase, draw or equipment write');
 fs.writeFileSync(path.join(out,'standalone-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();}
