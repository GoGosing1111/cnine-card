import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const out=process.env.QA_OUTPUT_DIR||path.resolve(import.meta.dirname,'../../../qa-magic-season2-20260930');fs.mkdirSync(out,{recursive:true});
const url=process.env.MAGIC_S2_REVIEW_URL||'http://127.0.0.1:8893/preview/magic-card-season2-v1/';
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{}),args:['--mute-audio','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const results=[],errors=[];
try{
 for(const [name,width,height]of [['desktop',1440,1000],['mobile',390,844]].filter(row=>!process.env.QA_SURFACE||row[0]===process.env.QA_SURFACE)){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:name==='mobile',hasTouch:name==='mobile'});
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({name,error:e.message}));
  await page.goto(url);await page.waitForFunction(()=>window.__magicS2Ready);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.card-tile').count(),10);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(async()=>{for(const img of document.images)img.loading='eager';await Promise.all([...document.images].map(img=>img.decode()));});
  await page.screenshot({path:path.join(out,name+'-collection.png'),fullPage:true});
  await page.locator('[data-card="command-severance"]').click();await page.locator('#levelRange').fill('9');
  assert.ok((await page.locator('#detailEffect').innerText()).includes('13%'));
  await page.locator('#cardDetail').screenshot({path:path.join(out,name+'-detail.png')});await page.keyboard.press('Escape');
  await page.goto(url+'battle.html?card='+(name==='desktop'?'S2_COMMAND_SEVERANCE':'S2_CONSTELLATION_SHIFT'));
  await page.waitForFunction(()=>window.MagicS2Review||document.getElementById('health').textContent.includes('오류'),{},{timeout:60000});
  const status=await page.locator('#health').innerText();assert.ok(!status.includes('오류'),status);
  console.log(name+' V3 ready');
  await page.waitForFunction(n=>window.MagicS2Review.eventsSeen>=n||document.getElementById('health').textContent.includes('완료'),name==='mobile'?1:2,{timeout:45000});
  await page.locator('#stop').click();
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,magic:window.MagicS2Review.engine.diagnostics().magicSeason2,canvases:document.querySelectorAll('canvas').length,sound:localStorage.getItem('cnine_battle_sound'),events:window.MagicS2Review.eventsSeen,actors:window.MagicS2Review.engine.characters.map(a=>({id:a.id,x:a.baseX,y:a.baseY,visible:a.root.visible,cardId:a.cardId,hp:a.hp}))}));
  assert.ok(state.canvases===1);assert.equal(state.sound,'OFF');assert.ok(state.scrollWidth<=width+1);
  if(name==='mobile')assert.equal(Object.keys(state.magic.slots).length,2);
  await page.screenshot({path:path.join(out,name+'-battle.png'),fullPage:true});
  results.push({name,collectionCards:10,detailMax13:true,...state});await context.close();console.log(name+' passed');
 }
 assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify({results,errors},null,2)+'\n');await browser.close();}
