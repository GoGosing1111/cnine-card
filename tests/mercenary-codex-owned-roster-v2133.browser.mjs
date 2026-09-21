import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.LOBBY_QA_ORIGIN||'http://127.0.0.1:4197';
const out=process.env.LOBBY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'mercenary-codex-v2133-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const roles={SNIPER:{label:'저격'},VANGUARD:{label:'돌격'}};
const card=(code,name,rank,role,position,sourceArt)=>({code,name,rank,role,position,sourceArt,battleSprite:null,title:name+'의 칭호',basePower:rank==='SSS'?300000:120000,skills:[],specialty:'선명한 강점',weakness:'분명한 약점',basicTarget:'적 전열'});
const cards=[
 card('V-004','베스페라','SS','SNIPER','REAR','assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png'),
 card('V-013','라비에나','S','VANGUARD','FRONT','assets/ui/project-v/mercenaries/short-bob-k2-amethyst-officer-mercenary-source-art-v1.png'),
 card('V-021','오메가-X','SSS','VANGUARD','FRONT','assets/ui/project-v/mercenaries/omega-x-user-source-v1.jpg')
];

try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]){
    const page=await browser.newPage({viewport,serviceWorkers:'block'}),size=viewport.width+'x'+viewport.height,writes=[];
    const state={accountId:4242,available:true,coin:1000000000,loadout:{mercenaryCode:'V-013',revision:1},cards:cards.slice(0,2).map(c=>({...c,level:1,duplicates:c.code==='V-013'?2:0,canDeploy:true}))};
    page.on('pageerror',error=>errors.push(size+': '+error.message));
    await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','mercenary-codex-qa');localStorage.setItem('cnine_card_user_v10',JSON.stringify({id:4242,nickname:'검수 계정'}));});
    await page.route('**/api/**',route=>{const request=route.request(),key=new URL(request.url()).pathname.slice(5);
      if(key==='mercenary-codex')return route.fulfill({json:{version:'mercenary-codex-2098',revision:1,roles,cards}});
      if(key==='mercenaries/v3/state')return route.fulfill({json:state});
      if(key==='mercenaries/v3/loadout'&&request.method()==='POST'){const body=request.postDataJSON();writes.push(body);state.loadout={mercenaryCode:body.mercenaryCode,revision:state.loadout.revision+1};return route.fulfill({json:{replayed:false}});}
      return route.fulfill({json:{visible:false,enabled:false,items:[]}});
    });
    await page.goto(base+'/mercenary-codex/',{waitUntil:'domcontentloaded'});await page.locator('.roster-row').first().waitFor();await page.evaluate(()=>document.fonts.ready);
    check(await page.locator('#ownedView').getAttribute('aria-selected')==='true',size+' opens on owned roster');
    check(await page.locator('.roster-row').count()===2,size+' shows only owned mercenaries first');
    check(await page.locator('#loadoutName').textContent()==='라비에나',size+' current deployment is immediately visible');
    check(await page.locator('.row-active').count()===1,size+' active mercenary is visibly marked');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),size+' has no horizontal clipping');
    await page.locator('[data-code="V-004"]').click();await page.locator('[data-equip="V-004"]').click();await page.waitForFunction(()=>document.getElementById('loadoutName').textContent==='베스페라');
    check(writes.length===1&&writes[0].mercenaryCode==='V-004'&&writes[0].revision===1,size+' equips from the selected detail');
    await page.locator('[data-unequip]').click();await page.waitForFunction(()=>document.getElementById('loadoutName').textContent==='미편성');
    check(writes.length===2&&writes[1].mercenaryCode===null&&writes[1].revision===2,size+' unequips from the same detail');
    await page.locator('#allView').click();check(await page.locator('.roster-row').count()===3,size+' switches to full catalog in place');
    await page.screenshot({path:path.join(out,'codex-'+size+'.png'),fullPage:true});
    if(viewport.width===390){await page.goto(base+'/mercenary-hangar/',{waitUntil:'domcontentloaded'});await page.waitForURL('**/mercenary-codex/?view=owned');check(new URL(page.url()).pathname==='/mercenary-codex/',size+' legacy hangar redirects to owned roster');}
    await page.close();
  }
  check(!errors.length,'no browser JavaScript errors: '+errors.join(' | '));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));
  console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();}
