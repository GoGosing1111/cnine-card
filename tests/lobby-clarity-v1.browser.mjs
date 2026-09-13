import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const base=process.env.LOBBY_QA_ORIGIN||'http://127.0.0.1:4197';
const out=process.env.LOBBY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'lobby-clarity-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const checks=[],errors=[];
function check(value,label){assert.ok(value,label);checks.push(label);}
async function noOverflow(page,label){check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label);}
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1440,height:560}]){
    const page=await browser.newPage({viewport,deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
    const writes=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
    await page.goto(base+'/preview/lobby-clarity-v1/tutorial/');
    await page.locator('.menu-result').first().waitFor();await page.evaluate(()=>document.fonts.ready);
    const size=viewport.width+'x'+viewport.height;
    check(await page.locator('dialog[open]').count()===0,size+' no automatic tutorial');
    await noOverflow(page,size+' lobby width');
    const expected=await page.evaluate(()=>window.SoopketmonV21NavigationContract.menuGroupOrder.reduce((n,g)=>n+window.SoopketmonV21NavigationContract.groups[g].routes.length,0)+2);
    check(await page.locator('.menu-result').count()===6,size+' initial directory limits choices to six');
    await page.screenshot({path:path.join(out,`lobby-${size}.png`),fullPage:false});
    if(viewport.width===1440&&viewport.height===1000||viewport.width===390)await page.screenshot({path:path.join(out,`lobby-full-${size}.png`),fullPage:true});
    await page.locator('#category-tabs [data-category="all"]').click();
    check(await page.locator('.menu-result').count()===expected,size+' all existing menu routes retained');
    const ids=await page.locator('.menu-result').evaluateAll(els=>els.map(e=>e.dataset.route));check(new Set(ids).size===ids.length,size+' menu entries are unique');
    await page.locator('#category-tabs [data-category="growth"]').click();
    check(await page.locator('.menu-result').filter({hasText:'장비 강화'}).count()===1,size+' growth category contains forge');
    await page.locator('#menu-search').fill('출석');
    check(await page.locator('.menu-result b').allTextContents().then(t=>t.includes('접속 보상')),size+' search understands attendance synonym');
    await page.locator('#menu-search').fill('강화');
    check((await page.locator('.menu-result b').allTextContents()).includes('장비 강화'),size+' search reaches forge across categories');
    await page.locator('.menu-result[data-route="equipmentForge"]').click();
    check(await page.locator('#destination-link').getAttribute('href')==='/equipment-forge/',size+' forge uses actual existing route');
    await page.keyboard.press('Escape');
    await page.locator('#menu-search').fill('없는메뉴<script>');check(await page.locator('#empty-search').isVisible(),size+' empty search is explained');
    await page.locator('#reset-search').click();check(await page.locator('.menu-result').count()===expected,size+' empty search reset restores all');
    await page.locator('#start-tutorial').click();
    for(let step=0;step<5;step++){
      check(await page.locator('#tutorial-progress').textContent().then(t=>t.includes(`${step+1} / 5`)),size+` tutorial step ${step+1}`);
      await page.waitForTimeout(240);
      const geometry=await page.evaluate(()=>{const a=document.querySelector('.tutorial-spotlight').getBoundingClientRect(),b=document.querySelector('.tutorial-card').getBoundingClientRect();return {fits:b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1,target:a.top>=0&&a.bottom<=innerHeight+1,overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};});
      check(geometry.fits,size+` tutorial card ${step+1} stays visible`);check(geometry.target,size+` tutorial target ${step+1} stays visible`);check(!geometry.overlap,size+` tutorial target ${step+1} unobscured`);
      if(step===2||step===4)await page.screenshot({path:path.join(out,`tutorial-${step+1}-${size}.png`)});
      if(step===2){await page.keyboard.press('Escape');check(await page.locator('#tutorial-dialog').evaluate(e=>!e.open),size+' tutorial can be dismissed');await page.reload();check(await page.locator('dialog[open]').count()===0,size+' reload never restarts guide');await page.locator('#start-tutorial').click();check(await page.locator('#tutorial-progress').textContent().then(t=>t.includes('3 / 5')),size+' optional guide resumes saved step');}
      await page.locator('#tutorial-next').click();
    }
    check(await page.locator('#tutorial-dialog').evaluate(e=>!e.open),size+' guide completes without route mutation');
    await page.locator('#start-tutorial').click();check(await page.locator('#tutorial-progress').textContent().then(t=>t.includes('1 / 5')),size+' completed guide can restart');await page.keyboard.press('Escape');
    await noOverflow(page,size+' width after interactions');check(writes.length===0,size+' prototype sends no mutation requests');
    await page.close();
  }
  // Actual production hangar code with an isolated mock account. A lost
  // loadout response must still recover the same request after removing draws.
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));
    const state={accountId:42,coin:1000000000,available:true,loadout:{mercenaryCode:null,revision:1},cards:[{code:'V-004',name:'베스페라',rank:'SS',level:1,duplicates:0,basePower:120000,sourceArt:'assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png',skills:[]},{code:'V-013',name:'라비에나',rank:'S',level:1,duplicates:2,basePower:70000,sourceArt:'assets/ui/project-v/mercenaries/short-bob-k2-amethyst-officer-mercenary-source-art-v1.png',skills:[]}]};
    let lost=true,effects=0;const posts=[],receipts=new Map();
    await page.route('**/api/**',async route=>{const req=route.request(),pathname=new URL(req.url()).pathname;if(req.method()==='POST'){const data=req.postDataJSON();posts.push({path:pathname,...data});check(pathname==='/api/mercenaries/v3/loadout','hangar only sends loadout writes');if(!receipts.has(data.requestId)){state.loadout={mercenaryCode:data.mercenaryCode,revision:state.loadout.revision+1};receipts.set(data.requestId,{replayed:false});effects++;}else receipts.set(data.requestId,{replayed:true});if(lost){lost=false;return route.abort('failed');}return route.fulfill({json:receipts.get(data.requestId)});}return route.fulfill({json:pathname.endsWith('/state')?state:{connected:true,userOpeningEnabled:true}});});
    await page.goto(base+'/mercenary-hangar/');await page.locator('#roster [data-code]').first().waitFor();
    check(await page.locator('#open,#draw-count,#draw-cost,.contract').count()===0,`${width} opening panel absent`);
    check(!(await page.locator('#message').textContent()).includes('5억'),`${width} opening feature polling does not advertise draws`);
    await page.locator('[data-code="V-013"]').click();check(await page.locator('#name').textContent()==='라비에나',`${width} selecting a mercenary still updates detail`);
    await page.locator('#equip').click();await page.locator('#recover').waitFor({state:'visible'});await page.locator('#recover').click();
    await page.waitForFunction(()=>document.getElementById('slot').textContent.includes('라비에나 · 편성 중'));
    check(posts.length===2&&posts[0].requestId===posts[1].requestId&&effects===1,`${width} lost loadout response recovers once`);
    await page.locator('#unequip').click();await page.waitForFunction(()=>document.getElementById('slot').textContent.includes('비어'));
    check(effects===2,`${width} unequip works without a paid draw`);
    await noOverflow(page,`${width} hangar width`);
    await page.screenshot({path:path.join(out,`hangar-${width}.png`),fullPage:true});
    check(state.coin===1000000000,`${width} selection does not spend coins`);
    await page.close();
  }
  // Browser storage may be unavailable; reading the optional guide must not
  // stop the menu or force the tour to open.
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};});
  await page.goto(base+'/preview/lobby-clarity-v1/tutorial/');await page.locator('#start-tutorial').click();check(await page.locator('#tutorial-dialog').evaluate(e=>e.open),'tour works when storage is blocked');await page.keyboard.press('Escape');await page.close();
  check(errors.length===0,'no browser JavaScript errors: '+errors.join(' | '));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();}
