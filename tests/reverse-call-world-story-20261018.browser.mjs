import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {CHAPTERS,SCENES,SCENE_CHARACTERS,CHARACTERS,artUrl,portraitUrl} from '../world/world.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.WORLD_QA_URL||'http://127.0.0.1:8899';
const output=path.resolve(process.env.WORLD_QA_OUTPUT||'docs/qa/reverse-call-world-story-20261018');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],records=[];
async function context(options={}) {
  const c=await browser.newContext(options);
  // Shared menu account reads are outside this public static reader's scope.
  await c.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":true,"features":{}}'}));
  await c.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.resolve();});
  return c;
}
async function ready(page) {
  await page.locator('#cover-chapters button').first().waitFor({state:'attached'});
  const scene=SCENES.find(s=>s.id===new URLSearchParams(new URL(page.url()).hash.slice(1)).get('scene'));
  const character=CHARACTERS[SCENE_CHARACTERS[scene?.id]?.character];
  await page.waitForFunction(({title,art,portrait})=>{
    const loaded=(image,src)=>image.complete&&image.naturalWidth>0&&image.currentSrc===new URL(src,location.href).href;
    const background=[...document.querySelectorAll('.scene-art.is-visible')].find(i=>loaded(i,art)&&Number(getComputedStyle(i).opacity)===1);
    const sceneReady=title?document.getElementById('scene-title').textContent===title:!document.getElementById('cover').hidden;
    const portraitReady=!portrait||(!document.getElementById('story-portrait').hidden&&loaded(document.getElementById('character-art'),portrait));
    return sceneReady&&background&&portraitReady;
  },{title:scene?.title,art:artUrl(scene?.art||'city'),portrait:character?portraitUrl(character):null});
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.images].filter(i=>i.currentSrc&&!i.closest('[hidden]')).map(i=>i.decode()));
    await Promise.all(['panel','button'].map(name=>{const i=new Image();i.src='/assets/ui/reverse-call/world-story-v1/'+name+'.webp';return i.decode();}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}
async function capture(page,name) {
  await ready(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' horizontal overflow');
  await page.screenshot({path:path.join(output,name+'.png'),fullPage:true,animations:'disabled'});
  records.push({name,url:page.url(),viewport:page.viewportSize(),overflow:false,art:await page.locator('.scene-art.is-visible').getAttribute('src'),portrait:await page.locator('#story-portrait').isVisible()?await page.locator('#character-art').getAttribute('src'):null});
}
try {
  const c=await context({viewport:{width:1440,height:960}}),page=await c.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/world/');await capture(page,'pc-cover');
  await page.locator('#start-story').click();
  assert.equal(await page.locator('#previous-scene').isDisabled(),true);
  await page.keyboard.press('ArrowRight');assert(page.url().endsWith('scene=erased'));
  await page.keyboard.press('ArrowLeft');assert(page.url().endsWith('scene=rewrite'));
  await page.locator('.skip-link[href="#story-main"]').evaluate(el=>el.click());assert(page.url().endsWith('scene=rewrite'));
  await page.locator('#open-chapters').click();await page.keyboard.press('ArrowRight');assert(page.url().endsWith('scene=rewrite'));
  await page.keyboard.press('Escape');assert.equal(await page.locator('#chapter-dialog').evaluate(d=>d.open),false);
  await page.goto(base+'/world/#scene=request');await capture(page,'pc-sister');
  assert.equal(await page.locator('#speaker-label').innerText(),'의뢰인');
  const menu=page.locator('soop-adventure-lobby');
  const side=menu.locator('.side-link[data-route="world"]');
  assert.equal(await side.locator('svg').count(),1);
  assert.equal(await side.locator('img').count(),0);
  assert.equal(await side.evaluate(b=>getComputedStyle(b).borderImageSource),'none');
  await page.goto(base+'/world/');await page.locator('#resume-story').click();assert(page.url().endsWith('scene=request'));
  await page.goto(base+'/world/#scene=train');await capture(page,'pc-brother');
  assert.equal(await page.locator('#character-art').getAttribute('src'),'/assets/ui/reverse-call/world-story-v1/brother.webp');
  await page.goto(base+'/world/#scene=no-record');await page.locator('#next-scene').click();assert(page.url().endsWith('scene=outpost-brief'));
  await page.goto(base+'/world/#scene=returning-call');await page.locator('#next-scene').click();
  assert.equal(await page.locator('#cover').isVisible(),true);assert.match(await page.locator('#reading-note').innerText(),/모두 읽었/);
  await page.reload();assert.equal(await page.locator('#resume-story').isVisible(),false);
  await page.goto(base+'/world/#scene=unknown');assert.equal(await page.locator('#cover').isVisible(),true);
  assert.equal(await page.locator('#cover-chapters button').count(),8);
  for(let i=3;i<CHAPTERS.length;i++){
    await page.locator('#open-chapters').click();await page.locator('#dialog-chapters [data-chapter="'+i+'"]').click();
    assert(page.url().endsWith('scene='+CHAPTERS[i].start));await capture(page,'pc-chapter-'+i);
  }
  for(const id of ['crystal-record','gilded-anchor','throne-offer','unbroken-line','light-for-return','circuit-of-names']){
    await page.goto(base+'/world/#scene='+id);await capture(page,'pc-'+id);
  }
  await page.goto(base+'/world/');
  await page.evaluate(()=>localStorage.setItem('reverse-call:world-story:v1',JSON.stringify({version:1,sceneId:'no-record',completed:true})));
  await page.reload();await page.locator('#resume-story').click();assert(page.url().endsWith('scene=outpost-brief'));
  const mobile=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));
  await m.goto(base+'/world/');await capture(m,'mobile-cover');
  await m.locator('#start-story').click();await ready(m);
  const box=await m.locator('#swipe-surface').boundingBox(),cdp=await mobile.newCDPSession(m),y=Math.round(box.y+box.height/2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:290,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90,y:y+3}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await m.waitForURL('**#scene=erased',{timeout:5000});
  await m.goto(base+'/world/#scene=request');await capture(m,'mobile-sister');
  await m.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const next=await m.locator('#next-scene').boundingBox();assert(next.y+next.height<844-60,'reading controls clear the fixed dock after scrolling');
  await m.screenshot({path:path.join(output,'mobile-controls.png'),animations:'disabled'});
  await m.locator('#open-chapters').click();await capture(m,'mobile-chapters');
  await m.locator('#dialog-chapters [data-chapter="2"]').click();assert(m.url().endsWith('scene=station'));
  await m.goto(base+'/world/#scene=no-record');await capture(m,'mobile-echo');
  for(const id of ['outpost-brief','crystal-record','gilded-anchor','frozen-names','throne-offer','core-judgment','returning-call']){
    await m.goto(base+'/world/#scene='+id);await capture(m,'mobile-'+id);
    await m.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const control=await m.locator('#next-scene').boundingBox();assert(control.y+control.height<844-60,id+' controls clear mobile dock');
  }
  await m.locator('#open-chapters').click();await capture(m,'mobile-expanded-chapters');
  await m.locator('#dialog-chapters [data-chapter="7"]').click();assert(m.url().endsWith('scene=core-judgment'));
  await m.setViewportSize({width:320,height:740});await m.goto(base+'/world/#scene=third-answer');await capture(m,'mobile-320');
  await m.setViewportSize({width:768,height:1024});await m.goto(base+'/world/#scene=request');await capture(m,'tablet-sister');
  await m.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await m.locator('.scene-art').first().evaluate(i=>getComputedStyle(i).transitionDuration),'0s');
  const denied=await context({viewport:{width:390,height:844}});
  await denied.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked');}}));
  const d=await denied.newPage();d.on('pageerror',e=>errors.push(e.message));
  await d.goto(base+'/world/');await d.locator('#start-story').click();await d.locator('#next-scene').click();assert(d.url().endsWith('scene=erased'));
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'browser-report.json'),JSON.stringify({passed:true,records,errors,sharedAccountReads:'local fixture',keyboard:true,swipe:true,resume:true,completedPrologueUpgrade:true,chapterDialog:true,deniedStorage:true,reducedMotion:true,sidebarUsesExistingStyle:true},null,2)+'\n');
  console.log('World reader PC/mobile, portraits, menu, bookmarks, keyboard and touch PASS');
} finally {await browser.close();}
