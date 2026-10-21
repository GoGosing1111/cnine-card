import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
const base=process.env.SEAL_ALIGNMENT_BASE||'http://127.0.0.1:8916',live=base.startsWith('https:');
try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const width of (live?[390]:[1440,840,761,760,390,320])){
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/preview/seal-battle-rework-20261021/?review=seal-journey-aligned-20261022');
    await page.locator('.seal-journey').waitFor();
    await page.locator('.seal-journey img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
    const metrics=await page.locator('.seal-journey').evaluate(el=>[...el.children].map(li=>{
      const img=li.querySelector('img'),label=li.querySelector('.seal-journey-label'),marker=li.querySelector('.seal-journey-marker');
      const range=document.createRange();range.selectNodeContents(label);
      return{card:li.getBoundingClientRect().toJSON(),img:img.getBoundingClientRect().toJSON(),label:label.getBoundingClientRect().toJSON(),text:range.getBoundingClientRect().toJSON(),marker:marker.getBoundingClientRect().toJSON(),imageLoaded:img.naturalWidth>0};
    }));
    assert.equal(metrics.length,3);
    const first=metrics[0];
    for(const m of metrics){
      assert(m.imageLoaded);assert.equal(m.img.width,32);assert.equal(m.img.height,32);
      assert(Math.abs(m.card.width-first.card.width)<1);assert(Math.abs(m.card.height-first.card.height)<1);
      assert(Math.abs(m.img.y-first.img.y)<1);assert(Math.abs(m.text.y-first.text.y)<1);
      assert(m.text.x>=m.card.x&&m.text.right<=m.card.right);
      assert(m.text.top>=m.card.top&&m.text.bottom<=m.card.bottom);
      if(width<=760){
        assert(m.marker.bottom<=m.label.top);
        assert(Math.abs(m.label.width/m.label.height-1000/345)<.01);
        assert(m.text.left>=m.label.left+m.label.width*.16&&m.text.right<=m.label.right-m.label.width*.16,'text inside frame sides');
        assert(m.text.top>=m.label.top+m.label.height*.25&&m.text.bottom<=m.label.top+m.label.height*.75,'text inside frame interior');
      }
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.seal-journey').screenshot({path:fileURLToPath(new URL(`${live?'live':'after'}-${width}.png`,import.meta.url))});
    if(width===390||width===1440)await page.screenshot({path:fileURLToPath(new URL(`${live?'live':'after'}-${width}-page.png`,import.meta.url)),fullPage:true});
    results.push({width,metrics});
  }
  for(const [scenario,current] of [['boss',2],['complete',3]]){
    await page.locator('#scenario').selectOption(scenario);
    assert.equal(await page.locator('.seal-journey li[aria-current]').textContent(),current===2?'02용 보스 본체전':'03공동 완료 보상');
    assert.equal(await page.locator('.seal-journey li.done').count(),current-1);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(new URL(`${live?'live':'layout'}-verification.json`,import.meta.url),JSON.stringify({at:new Date().toISOString(),passed:true,base,results,errors,liveAccountWrites:0},null,2));
  console.log(JSON.stringify({passed:true,widths:results.map(x=>x.width),states:['active','boss','complete'],errors}));
}finally{await browser.close();}
