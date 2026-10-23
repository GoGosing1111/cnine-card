import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {BLOODMOON_MERCENARIES as cards} from '../../../shared/mercenary-bloodmoon-catalog-v1.mjs';
const base='https://cnine-card.pages.dev',out='docs/qa/bloodmoon-codex-20261023';
const sha=b=>createHash('sha256').update(b).digest('hex');
const api=await fetch(base+'/api/mercenary-codex');assert.equal(api.status,200);const catalog=await api.json(),published=catalog.cards.filter(c=>c.season==='BLOODMOON');
assert.deepEqual(published.map(c=>c.code),cards.map(c=>c.code));
for(const c of published){assert.equal(c.rank,'SS');assert.equal(c.serverLimit,10);assert.equal(c.acquisitionEnabled,false);assert.equal(c.deploymentEnabled,false);assert.equal(c.basePower,356400);}
const featureResponse=await fetch(base+'/api/mercenaries/v3/bloodmoon-pack/feature');assert.equal(featureResponse.status,200);const feature=await featureResponse.json();
assert.equal(feature.packSettings.mode,'OFF');assert.equal(feature.userOpeningEnabled,false);assert(feature.stock.every(s=>s.limit===10&&s.issued===0&&s.remaining===10));
const rejected=await fetch(base+'/api/mercenaries/v3/bloodmoon-pack/open',{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify({count:1})});const rejection=await rejected.json();assert.equal(rejected.status,423);assert.equal(rejection.code,'MERCENARY_BLOODMOON_CLOSED');
const paths=[...cards.flatMap(c=>[c.sourceArt,c.battleSprite,c.thumbnailArt,c.displayArt]),'mercenary-codex/index.html','mercenary-codex/app.mjs','mercenary-codex/model.mjs','mercenary-codex/limited.css','shared/mercenary-bloodmoon-catalog-v1.mjs','shared/mercenary-bloodmoon-pack-v1.mjs','shared/mercenary-limited-catalog-v1.mjs'];
const files=await Promise.all(paths.map(async path=>{const response=await fetch(base+'/'+path+'?bloodmoonVerify=01be0a216');assert.equal(response.status,200,path);const actual=Buffer.from(await response.arrayBuffer()),expected=await fs.readFile(path);assert.equal(sha(actual),sha(expected),path);return {path,sha256:sha(actual)};}));
const {chromium}=createRequire(import.meta.url)('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'chrome',headless:true}),screens=[];
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block',isMobile:width<700,hasTouch:width<700}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/mercenary-codex/?view=limited&q=블러드문&rank=SS#V-960');await page.locator('.roster-row').first().waitFor({timeout:30000});assert.equal(await page.locator('.roster-row').count(),5);
  await page.locator('[data-code="V-960"]').click();await page.locator('.source-art').evaluate(img=>img.decode());await page.locator('.card-frame').evaluate(img=>img.decode());
  assert.match(await page.locator('.deployment-card').innerText(),/현재 개봉 불가/);assert.match(await page.locator('.deployment-card').innerText(),/10장/);assert.equal(await page.locator('[data-equip]').count(),0);
  await page.locator('.portrait-stage').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/production-'+label+'.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);screens.push({label,width,height,visibleCards:5,openingDisabled:true,errors});await page.close();
 }
}finally{await browser.close();}
const report={status:'VERIFIED',checkedAt:new Date().toISOString(),deployment:'209f615d',sourceCommit:'01be0a216644cc160d39d2f066bccdf2bb21e85e',url:base+'/mercenary-codex/?view=limited&q=블러드문&rank=SS#V-960',cards:published.map(c=>({code:c.code,name:c.name,rank:c.rank,limit:c.serverLimit})),packMode:feature.packSettings.mode,stock:feature.stock,openingProbe:{status:rejected.status,...rejection},files,screens,accountWrites:0};
await fs.writeFile(out+'/production.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cards:report.cards.length,mode:report.packMode,stock:report.stock,openingStatus:rejected.status,matchedFiles:files.length,screens,accountWrites:0}));
