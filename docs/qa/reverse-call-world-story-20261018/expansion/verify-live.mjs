import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {SCENES,artUrl} from '../../../../world/world.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../../../../',import.meta.url),output=new URL('./live/',import.meta.url);
const base='https://cnine-card.pages.dev',nonce=Date.now(),hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile(new URL('assets/ui/reverse-call/world-story-v2/manifest.json',root)));
const paths=['world/index.html','world/world.js','world/expansion.js','js/adventure-lobby-v2107.js','service-worker.js','assets/ui/reverse-call/world-story-v2/manifest.json',...manifest.files.map(f=>f.file)];
const files=[];
for(const file of paths){
  const response=await fetch(base+'/'+file+'?verify='+nonce);assert.equal(response.status,200,file);
  const actual=hash(Buffer.from(await response.arrayBuffer())),expected=hash(await readFile(new URL(file,root)));
  assert.equal(actual,expected,file);files.push({file,sha256:actual});
}
const browser=await chromium.launch({channel:'chrome',headless:true}),screens=[],errors=[];
try{
  for(const mobile of [false,true]){
    const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:960},isMobile:mobile,hasTouch:mobile});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":true,"features":{}}'}));
    await page.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>Promise.resolve();});
    await page.goto(base+'/world/');await page.locator('#cover-chapters button').first().waitFor();
    assert.equal(await page.locator('#cover-chapters button').count(),8);
    if(!mobile){
      await page.evaluate(()=>localStorage.setItem('reverse-call:world-story:v1',JSON.stringify({version:1,sceneId:'no-record',completed:true})));
      await page.reload();await page.locator('#resume-story').click();await page.waitForURL('**#scene=outpost-brief');
    }else await page.goto(base+'/world/#scene=frozen-names');
    const id=mobile?'frozen-names':'outpost-brief',scene=SCENES.find(s=>s.id===id);
    await page.waitForFunction(({title,art})=>document.getElementById('scene-title').textContent===title&&[...document.querySelectorAll('.scene-art.is-visible')].some(i=>i.complete&&i.naturalWidth&&i.currentSrc===new URL(art,location.href).href&&getComputedStyle(i).opacity==='1')&&document.getElementById('character-art').complete&&document.getElementById('character-art').naturalWidth>0,{title:scene.title,art:artUrl(scene.art)});
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.currentSrc&&!i.closest('[hidden]')).map(i=>i.decode()));});
    assert.equal(await page.locator('#speaker-label').innerText(),mobile?'크라이베른':'베스페라');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const file=mobile?'mobile-live.png':'pc-live.png';
    await page.screenshot({path:fileURLToPath(new URL(file,output)),fullPage:true,animations:'disabled'});
    if(mobile){await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const box=await page.locator('#next-scene').boundingBox();assert(box.y+box.height<784);await page.screenshot({path:fileURLToPath(new URL('mobile-controls-live.png',output)),animations:'disabled'});}
    screens.push({file,scene:id,viewport:page.viewportSize()});await page.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(new URL('verification.json',output),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files,screens,errors,api:'fixture; no account writes',completedPrologueUpgrade:true},null,2)+'\n');
  console.log('Production: '+files.length+' file hashes, PC/mobile illustrations and bookmark upgrade PASS');
}finally{await browser.close();}
