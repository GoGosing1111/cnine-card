import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
 for(const width of [390,320]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
  await page.goto('http://127.0.0.1:8949/world/#scene=old-order');
  await page.locator('#next-scene').scrollIntoViewIfNeeded();
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const next=await page.locator('#next-scene').boundingBox();
  const dock=await page.locator('soop-adventure-lobby').locator('.mobile-dock').boundingBox();
  assert(next.y+next.height<=dock.y,'next button is above the fixed dock');
  await page.screenshot({path:fileURLToPath(new URL(`./screens/controls-${width}.png`,import.meta.url))});
  results.push({width,next,dock});await page.close();
 }
 await writeFile(new URL('./screens/controls.json',import.meta.url),JSON.stringify(results,null,2));console.log('Mobile controls are above the shared navigation dock.');
}finally{await browser.close();}
