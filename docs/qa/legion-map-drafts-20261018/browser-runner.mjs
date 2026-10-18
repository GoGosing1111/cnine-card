import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='C:/Users/User/.codex/worktrees/jokro-live/cnine-card/docs/qa/legion-map-drafts-20261018';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),report=[];
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8987/review/cms');await page.getByRole('button',{name:'군단토벌',exact:true}).click();
 const root=page.locator('.legion-regions-cms'),editor=root.locator('.legion-region-drop-editor');await editor.waitFor();
 await assert.equal(await root.locator('select[name=mode]').inputValue(),'OFF');
 const weight=root.locator('[name="regions.0.fieldDrops.items.0.weight"]');await weight.fill('23.456');
 await root.locator('[data-drop-region="1"]').click();assert.equal(await root.locator('[name="regions.1.fieldDrops.items.0.weight"]').inputValue(),width===1440?'15':'15');
 await root.locator('[data-drop-region="0"]').click();assert.equal(await weight.inputValue(),'23.456');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/legion-hunt/regions')&&r.request().method()==='PATCH');
 await root.getByRole('button',{name:'지역 설정 저장',exact:true}).click();assert.equal((await response).status(),200);
 await root.getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.waitForTimeout(250);assert.equal(await weight.inputValue(),'23.456');
 await weight.fill('15');await root.getByRole('button',{name:'지역 설정 저장',exact:true}).click();await page.waitForTimeout(200);
 await root.locator('[data-field-search]').fill('연마석');await root.locator('[data-field-add]').click();assert.equal(await editor.locator('.legion-cms-items article').count(),13);await root.locator('[data-field-remove="12"]').click();assert.equal(await editor.locator('.legion-cms-items article').count(),12);
 const counts=[];for(let i=0;i<5;i++){await root.locator(`[data-drop-region="${i}"]`).click();counts.push(await editor.locator('.legion-cms-items article').count());assert.equal(counts.at(-1),12);}
 await root.locator('[data-drop-region="0"]').click();await editor.scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,-40));
 await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.legion-regions-cms img')].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));});
 await page.screenshot({path:dir+`/cms-${width}.png`});
 const measure=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,missing:[...document.querySelectorAll('.legion-regions-cms img')].filter(i=>i.getBoundingClientRect().height&&(!i.complete||!i.naturalWidth)).map(i=>i.src),frame:getComputedStyle(document.querySelector('.legion-cms-map-tabs button')).borderImageSource}));
 assert.ok(measure.scrollWidth<=width+1,JSON.stringify(measure));assert.equal(errors.length,0,errors.join('\n'));assert.equal(measure.missing.length,0,JSON.stringify(measure.missing));assert.ok(measure.frame.includes('frame-20261018.webp'));
 if(width===390){await editor.locator('.legion-cms-pool-title').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/cms-mobile-items.png'});}
 report.push({width,counts,mode:await root.locator('select[name=mode]').inputValue(),...measure,errors});await page.close();
}}finally{await browser.close();}
await writeFile(dir+'/browser.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
