import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {mercenaryCodexDocument} from '../../functions/_mercenary_codex.js';import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';import {halloweenFixture} from '../../tests/helpers/halloween-pack-fixture.mjs';
import {prepareHalloweenBathoryLaunch,ORIGINAL_CODES} from '../../scripts/ops/halloween-bathory-launch-20261019.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const cleanup=[],f=await halloweenFixture({after:fn=>cleanup.push(fn)}),catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
const approved=JSON.parse(await fs.readFile(new URL('qa/live-readonly-preflight.json',import.meta.url)));
Object.assign(f.settings,prepareHalloweenBathoryLaunch(approved.pack.settings,approved.halloweenStock));await f.configure(15);
for(const row of approved.halloweenStock)await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=$1,issued=$2,revision=$3 WHERE code=$4',[Number(row.stock_limit)+(ORIGINAL_CODES.includes(row.code)?1:0),Number(row.issued),Number(row.revision),row.code]);
const state=await f.state();assert(ORIGINAL_CODES.every(code=>catalog.cards.find(c=>c.code===code).serverLimit===11));
const browser=await chromium.launch({channel:'chrome',headless:true}),report={screens:[],errors:[]};
try{for(const [name,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport});page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/mercenary-codex/**',async route=>{const u=new URL(route.request().url()),rel=u.pathname.replace(/^\//,'')+(u.pathname.endsWith('/')?'index.html':'');const body=await fs.readFile(new URL('../../'+rel,import.meta.url));return route.fulfill({status:200,contentType:rel.endsWith('.html')?'text/html; charset=utf-8':rel.endsWith('.css')?'text/css':'text/javascript',body});});
 await page.route('**/admin/**',async route=>{const u=new URL(route.request().url()),rel=u.pathname.slice(1),body=await fs.readFile(new URL('../../'+rel,import.meta.url));return route.fulfill({status:200,contentType:rel.endsWith('.css')?'text/css':'text/javascript',body});});
 await page.route('**/api/**',route=>{const u=new URL(route.request().url());assert.equal(route.request().method(),'GET');const body=u.pathname==='/api/mercenary-codex'?catalog:u.pathname==='/api/admin/mercenaries/halloween-pack'?state:{available:true,cards:[],items:[],enabled:false,loadouts:{PVE:{revision:0},PVP:{revision:0}},leveling:{enabled:false},deployment:{enabled:true}};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('http://127.0.0.1:8973/mercenary-codex/?view=limited&q=V-977#V-977');await page.locator('[data-code="V-977"]').waitFor();await page.locator('[data-code="V-977"]').click();await page.locator('.source-art').evaluate(i=>i.decode());
 assert.match(await page.locator('.power-summary').innerText(),/297,000/);assert.equal(await page.locator('.skill-entry').count(),1);
 assert.match(await page.locator('.limited-record').innerText(),/서버 10장/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:fileURLToPath(new URL('qa/catalog-'+name+'.png',import.meta.url)),fullPage:true});
 await page.locator('#sdTab').click();await page.locator('.sd-display img').evaluate(i=>i.decode());await page.screenshot({path:fileURLToPath(new URL('qa/catalog-sd-'+name+'.png',import.meta.url)),fullPage:true});
 await page.goto('http://127.0.0.1:8973/preview/mercenary-bathory-halloween-20261019-v1/qa/cms.html');await page.locator('[data-halloween-mode]').waitFor();
 const row=page.locator('.mlc-cards article').filter({hasText:'바토리'});assert.equal(await row.count(),1);assert.match(await row.innerText(),/10/);
 assert.match(await row.innerText(),/0\.00025%/);assert.equal(await row.locator('input').inputValue(),'0.5');
 const original=page.locator('.mlc-cards article').filter({has:page.locator('[data-halloween-rate="V-980"]')});assert.match(await original.innerText(),/한도 11장/);assert.match(await original.innerText(),/잔여 1/);
 await row.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:fileURLToPath(new URL('qa/cms-'+name+'.png',import.meta.url)),fullPage:true});report.screens.push({name,catalog:'PASS',cms:'PASS',stock:state.stock.find(s=>s.code==='V-977'),rate:state.settings.cardRatesPpm['V-977']});await page.close();
}assert.deepEqual(report.errors,[]);await fs.writeFile(new URL('qa/catalog-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}finally{await browser.close();for(const fn of cleanup.reverse())await fn();}
