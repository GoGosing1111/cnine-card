import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[];
const settled=page=>page.waitForFunction(()=>!advancementReview.advancementWindow.audit().busy);
async function reset(page){await page.evaluate(async()=>{const a=advancementReview;a.advancementWindow.close();a.fixtureAdapter.reset();await a.advancementWindow.open('V-996');});await settled(page);}
try{
 for(const [name,width,height]of [['pc',1440,950],['mobile',390,844],['narrow',320,740]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[],writes=[],checks={};page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push({method:r.method(),url:r.url()});});
  await page.goto('http://127.0.0.1:18804/');await page.waitForFunction(()=>advancementReview?.ready||advancementReview?.errors.length,null,{timeout:90000});
  await reset(page);await page.evaluate(()=>document.fonts.ready);
  checks.all16=(await page.locator('[data-action="role"]').count())===16;
  checks.costs=(await page.locator('.adv-costs').textContent()).includes('10조')&&(await page.locator('.adv-costs').textContent()).includes('5,000만');
  checks.singleCanvas=await page.locator('canvas').count()===1;
  checks.noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.adv-window').scrollWidth<=document.querySelector('.adv-window').clientWidth+1);
  checks.approvedImageBorders=await page.locator('.adv-frame').evaluate(e=>getComputedStyle(e).borderImageSource.includes('panel-v3.webp'));
  checks.categoryTextAboveFrame=await page.locator('.adv-role').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().bottom-e.querySelector('small').getBoundingClientRect().bottom>=10));
  checks.nameAndCategorySeparate=await page.locator('.adv-role').evaluateAll(es=>es.every(e=>e.querySelector('b').getBoundingClientRect().bottom<=e.querySelector('small').getBoundingClientRect().top+.5));
  await page.screenshot({path:dir+name+'-selection.png'});
  const ids=await page.locator('[data-action="role"]').evaluateAll(es=>es.map(e=>e.dataset.value));
  for(const id of ids){await page.locator(`[data-action="role"][data-value="${id}"]`).click();checks['select_'+id]=await page.evaluate(id=>advancementReview.advancementWindow.audit().selected===id&&document.querySelector('.adv-description').textContent.includes(advancementReview.catalog.find(r=>r.id===id).name),id);}
  if(width<720)checks.mobileSelectedDescriptionVisible=await page.locator('.adv-description').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.querySelector('.adv-scroll').getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=b.bottom+1;});
  await page.screenshot({path:dir+name+'-selected-detail.png'});
  await page.locator('[data-action="filter"][data-value="지원"]').click();checks.supportFilter=await page.locator('[data-action="role"]').count()===4;
  await page.locator('[data-action="filter"][data-value="전체"]').click();
  await page.locator('[data-value="vanguard"][data-action="role"]').click();
  await page.keyboard.press('ArrowRight');checks.keyboardArrow=await page.evaluate(()=>document.activeElement.dataset.value==='duelist');
  await page.keyboard.press('End');checks.keyboardEnd=await page.evaluate(()=>document.activeElement.dataset.value==='commander');
  checks.focusTrap=await page.evaluate(()=>{const d=document.querySelector('.adv-window');return document.activeElement.closest('dialog')===d&&d.matches(':modal');});
  await page.locator('[data-action="confirm"]').click();checks.confirmCosts=(await page.locator('.adv-confirm').textContent()).includes('함께 소모');
  await page.screenshot({path:dir+name+'-confirm.png'});
  await page.locator('[data-action="commit"]').click();await settled(page);
  checks.firstPaid=await page.evaluate(()=>{const a=advancementReview.fixtureAdapter.audit();return a.commits===1&&a.snapshot.wallet.coin==='25000000000000'&&a.snapshot.wallet.MASTER_STAR==='70000000'&&a.snapshot.cards[0].advancement.id==='vanguard';});
  await page.screenshot({path:dir+name+'-success.png'});
  await page.locator('[data-action="continue"]').click();checks.sameClassDisabled=await page.locator('[data-focus="submit"]').isDisabled();
  await page.locator('[data-action="role"][data-value="guardian"]').click();checks.changeLabel=(await page.locator('[data-focus="submit"]').textContent())==='전직 변경';
  await page.locator('[data-action="confirm"]').click();await page.locator('[data-action="commit"]').click();await settled(page);
  checks.changePaidSame=await page.evaluate(()=>{const a=advancementReview.fixtureAdapter.audit();return a.commits===2&&a.snapshot.wallet.coin==='15000000000000'&&a.snapshot.wallet.MASTER_STAR==='20000000';});
  await page.locator('[data-action="continue"]').click();await page.locator('[data-action="role"][data-value="healer"]').click();
  checks.insufficientStars=(await page.locator('.adv-costs').textContent()).includes('3,000만 부족')&&await page.locator('[data-focus="submit"]').isDisabled();
  await page.screenshot({path:dir+name+'-insufficient.png'});
  await page.locator('[data-action="mercenary"]').selectOption('V-049');checks.level15Blocked=(await page.locator('.adv-feedback').textContent()).includes('16레벨')&&await page.locator('[data-focus="submit"]').isDisabled();
  await page.locator('[data-action="mercenary"]').selectOption('V-013');checks.rankSBlocked=(await page.locator('.adv-feedback').textContent()).includes('SS급')&&await page.locator('[data-focus="submit"]').isDisabled();
  await reset(page);await page.locator('[data-action="mercenary"]').selectOption('V-004');await page.locator('[data-action="role"][data-value="commander"]').click();checks.ssLevel16Eligible=!await page.locator('[data-focus="submit"]').isDisabled();
  await reset(page);await page.evaluate(()=>advancementReview.fixtureAdapter.setFault('lost-response'));
  await page.locator('[data-action="confirm"]').click();await page.locator('[data-action="commit"]').click();await settled(page);
  checks.unknownPreservesRequest=await page.evaluate(()=>!!advancementReview.advancementWindow.audit().pending&&advancementReview.fixtureAdapter.audit().commits===1);
  checks.unknownBlocksSelection=await page.locator('[data-action="mercenary"]').isDisabled();await page.screenshot({path:dir+name+'-recovery.png'});
  await page.locator('[data-action="close"]').first().click();await page.click('#openAdvancement');await settled(page);checks.pendingSurvivesClose=await page.locator('[data-action="recover"]').isVisible();
  await page.locator('[data-action="recover"]').click();await settled(page);checks.retryNoDoubleSpend=await page.evaluate(()=>advancementReview.fixtureAdapter.audit().commits===1&&advancementReview.advancementWindow.audit().view==='success');
  await reset(page);await page.evaluate(()=>advancementReview.fixtureAdapter.setFault('reject'));await page.locator('[data-action="confirm"]').click();await page.locator('[data-action="commit"]').click();await settled(page);checks.failureNoSpend=await page.evaluate(()=>advancementReview.fixtureAdapter.audit().commits===0&&!advancementReview.advancementWindow.audit().pending);
  await reset(page);await page.evaluate(async()=>{advancementReview.fixtureAdapter.setWallet({coin:'0'});await advancementReview.advancementWindow.refresh();});checks.coinInsufficient=await page.locator('[data-focus="submit"]').isDisabled()&&(await page.locator('.adv-costs').textContent()).includes('10조 부족');
  await reset(page);await page.evaluate(async()=>{const a=advancementReview,s=await a.fixtureAdapter.read();s.cards=[];a.fixtureAdapter.reset(s);await a.advancementWindow.refresh();});checks.emptyOwned=(await page.locator('.adv-empty').textContent()).includes('보유한 용병이 없습니다');
  await reset(page);await page.keyboard.press('Escape');checks.escapeCloses=!await page.locator('.adv-window').isVisible();
  checks.noNetworkMutations=writes.length===0;checks.noPageErrors=errors.length===0;
  reports.push({name,width,height,checks,errors,writes});await page.close();
 }
 await fs.writeFile(dir+'verification.json',JSON.stringify({productionAdapter:false,physicalDeviceTest:false,reports},null,2));
 const failed=reports.flatMap(r=>Object.entries(r.checks).filter(([,v])=>!v).map(([k])=>r.name+':'+k));console.log(JSON.stringify({checks:reports.reduce((n,r)=>n+Object.keys(r.checks).length,0),failed}));if(failed.length)process.exitCode=1;
}finally{await browser.close();}
