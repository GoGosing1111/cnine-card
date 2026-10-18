import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {SCENES,artUrl} from '../../../../world/world.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=new URL('./screens/',import.meta.url);await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[],errors=[];
try{
  for(const viewport of [{width:1440,height:960},{width:390,height:844}]){
    const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":true,"features":{}}'}));
    const prefix=viewport.width>1000?'pc':'mobile';
    for(const scene of SCENES.filter(s=>['orze','renzo','zeno','varsen','isgen','valter','helios'].includes(s.art))){
      await page.goto('http://127.0.0.1:8899/world/#scene='+scene.id);
      await page.waitForFunction(({title,art,position})=>document.getElementById('scene-title')?.textContent===title&&[...document.querySelectorAll('.scene-art.is-visible')].some(i=>i.complete&&i.naturalWidth&&i.currentSrc===new URL(art,location.href).href&&getComputedStyle(i).opacity==='1'&&getComputedStyle(i).objectPosition===position),{title:scene.title,art:artUrl(scene.art),position:scene.position});
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.currentSrc&&!i.closest('[hidden]')).map(i=>i.decode()));});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const file=prefix+'-focus-'+scene.art+'.png';
      await page.screenshot({path:new URL(file,output).pathname.slice(1),animations:'disabled',fullPage:true});
      results.push({scene:scene.id,viewport,position:scene.position,file});
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(new URL('focus-report.json',output),JSON.stringify({passed:true,results,errors},null,2)+'\n');
  console.log('Seven source-art compositions verified at PC and mobile sizes.');
}finally{await browser.close();}
