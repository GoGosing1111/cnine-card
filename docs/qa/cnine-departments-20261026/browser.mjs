import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = process.cwd(), out = process.env.QA_OUT || path.join(root, 'docs/qa/cnine-departments-20261026');
const publicBase = process.env.QA_PUBLIC_BASE || '';
const roster = await (await fetch('https://cnine-card.pages.dev/api/streamer-profiles')).json();
const expected = [['kaja0011','여을'],['chocho12','초초'],['yjk011599','나무늘봉순'],['lcy011027','BJ채리'],['wkao85guo','꾸까'],['mew030709','남수댕'],['zalalz','조은'],['qpqpro','디임']];
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const missing = [], writes = [];
const apiPayload = pathname => pathname === '/api/streamer-profiles' ? roster : { maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[] };
const moduleHtml = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/cnine-roster-v1.css?v=20261026-v3"></head><body style="margin:0;background:#071427"><soop-adventure-lobby data-view="home" data-route="home"></soop-adventure-lobby><script type="module">import {mountCnineLobby} from "/js/cnine-roster-v1.js?v=20261026-v3";document.querySelector("soop-adventure-lobby").attachShadow({mode:"open"}).innerHTML="<slot name=cnine-roster></slot>";mountCnineLobby();</script></body></html>';
fs.mkdirSync(out, { recursive:true });
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  if (url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') { writes.push(url.pathname); return res.writeHead(405).end(); }
    res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify(apiPayload(url.pathname)));
  }
  if (url.pathname === '/__qa/cnine-roster') { res.writeHead(200, {'content-type':mime['.html']}); return res.end(moduleHtml); }
  let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (file !== root && !file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { if (url.pathname !== '/favicon.ico') missing.push(url.pathname); return res.writeHead(404).end(); }
  res.writeHead(200, {'content-type':mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(process.env.QA_PORT ? Number(process.env.QA_PORT) : 0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
console.log('Preview: ' + origin + '/__qa/cnine-roster');
if (process.argv.includes('--serve')) await new Promise(() => {});
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}), reports = [];
try {
  for (const width of (publicBase ? [390] : [1440,390,360])) {
    const page = await browser.newPage({viewport:{width,height:width < 600 ? 844 : 1100},deviceScaleFactor:width < 600 ? 2 : 1,serviceWorkers:'block'}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_lobby_bgm','OFF');HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };});
    await page.context().route('https://www.sooplive.com/station/**', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Station link QA</title>'}));
    if (publicBase) {
      await page.route(publicBase + '/api/**', route => { assert.equal(route.request().method(),'GET'); return route.fulfill({json:apiPayload(new URL(route.request().url()).pathname)}); });
      await page.route(publicBase + '/__qa/cnine-roster', route => route.fulfill({contentType:'text/html; charset=utf-8',body:moduleHtml}));
      await page.goto(publicBase + '/__qa/cnine-roster', {waitUntil:'domcontentloaded'});
      await page.locator('[data-cnine-lobby-open]').waitFor();
    } else {
      await page.goto(origin + '/', {waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(() => window.StreamerLounge && window.SoopketmonV21ExactShell && typeof renderShell === 'function');
      await page.evaluate(async () => {
        API_MODE = false; API_TOKEN = '';
        localStorage.setItem(STORAGE_KEY, JSON.stringify({nickname:'현황판 검수',serverUserId:7,role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));
        renderShell('home'); document.querySelector('[data-miracle-close]')?.click(); await StreamerLounge.mount();
      });
      await page.waitForSelector('[data-streamer-lounge-host]', {state:'attached'});
      await page.evaluate(async () => {await StreamerLounge.mount();});
    }
    const entrance = page.locator('[data-cnine-lobby-open]:visible');
    await entrance.waitFor();
    const entryBox=await entrance.boundingBox();assert(entryBox.width<=170&&entryBox.height<=49&&entryBox.height>=44,'Compact lobby entry');
    assert.equal(await page.locator('dialog[open]').count(),0,'Lobby entry requires no menu or lounge');
    if(!publicBase){
      const audio=await page.locator('soop-adventure-lobby .scene-audio').boundingBox();
      assert(!audio||entryBox.y>=audio.y+audio.height-1,'Entry does not overlap the music control');
      assert.equal(await page.locator('soop-adventure-lobby').getAttribute('data-route'),'home');
    }
    await page.screenshot({path:path.join(out, 'lobby-entry-'+width+'.png')});
    await entrance.click();
    const board = page.locator('#cnineRosterV1[open]'); await board.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.c9-member-portrait img')].every(image => image.complete && image.naturalWidth > 0));
    await page.evaluate(async () => {await document.fonts.ready;const bg=new Image();bg.src='/assets/ui/streamer-lounge/cnine-roster-20261026/celestial-board.webp';await bg.decode();});
    assert.equal(await board.getByRole('heading',{name:'씨나인 현황판',exact:true}).count(),1);
    assert.equal(await board.getByRole('button',{name:'← 로비로'}).count(),1);

    const home=board.locator('[data-cnine-page="home"]');
    assert(await home.isVisible(),'First screen is department selection');
    assert.equal(await board.locator('.c9-member:visible').count(),0,'No mixed department list on entry');
    assert.equal(await home.getByRole('button').count(),2);
    await page.screenshot({path:path.join(out,'home-'+width+'.png')});
    await home.getByRole('button',{name:'여캠부 5명 · 페이지 입장'}).click();
    const female=board.locator('[data-cnine-page="female"]'),star=board.locator('[data-cnine-page="star"]');
    assert(await female.isVisible());assert(!(await home.isVisible()));assert(!(await star.isVisible()));
    assert.deepEqual(await female.locator('.c9-member h3').allTextContents(),expected.slice(0,5).map(row=>row[1]));
    assert.equal(await board.locator('.c9-roster-nav [aria-current="page"]').textContent(),'여캠부5');
    assert(await female.locator('h2').evaluate(el=>el===document.activeElement),'Focus follows the selected page');
    const rows=await female.locator('.c9-member').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
    assert(rows[0].y===rows[1].y&&rows[1].y===rows[2].y&&rows[3].y===rows[4].y&&rows[3].y>rows[0].y,'Three columns, additions continue in second row');
    assert(Math.abs(rows[0].x-rows[3].x)<1&&Math.abs(rows[1].x-rows[4].x)<1);
    assert(await board.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Female page has no horizontal overflow');
    await page.screenshot({path:path.join(out,'female-'+width+'.png')});
    const links=await board.locator('.c9-member').evaluateAll(els=>els.map(el=>({href:el.getAttribute('href'),target:el.target,rel:el.rel})));
    assert.deepEqual(links.map(row=>row.href),expected.map(([id])=>'https://www.sooplive.com/station/'+id));
    assert(links.every(row=>row.target==='_blank'&&row.rel.includes('noopener')&&row.rel.includes('noreferrer')));
    const portraits=await female.locator('.c9-member-portrait img').evaluateAll(els=>els.map(el=>({loaded:el.naturalWidth>0,display:el.getBoundingClientRect().width,native:Math.min(el.naturalWidth,el.naturalHeight),density:devicePixelRatio})));
    assert(portraits.every(p=>p.loaded&&(p.display-2)*p.density<=p.native+1),'Original profile pixels are not enlarged');
    const buttonColor=await female.locator('.c9-member-link').first().evaluate(el=>getComputedStyle(el).color);assert.equal(buttonColor,'rgb(17, 38, 63)');
    for(const [id,name] of expected.slice(3,5)){
      const popupPromise=page.waitForEvent('popup');await female.getByRole('link',{name:name+' SOOP 방송국 바로가기 (새 탭)'}).click();
      const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),'https://www.sooplive.com/station/'+id);assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();
    }
    await board.locator('.c9-roster-nav [data-cnine-view="star"]').click();
    assert(await star.isVisible());assert(!(await female.isVisible()));
    assert.deepEqual(await star.locator('.c9-member h3').allTextContents(),expected.slice(5).map(row=>row[1]));
    const starRows=await star.locator('.c9-member').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().y));assert(starRows.every(y=>y===starRows[0]),'Star department has three columns');
    assert(await board.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Star page has no horizontal overflow');
    await page.screenshot({path:path.join(out,'star-'+width+'.png')});
    const select=board.locator('.c9-roster-nav [data-cnine-view="home"]');await select.focus();await page.keyboard.press('Enter');assert(await home.isVisible(),'Keyboard returns to department selection');
    await home.getByRole('button',{name:'스타부 3명 · 페이지 입장'}).click();assert(await star.isVisible(),'Star entry on the first screen works');
    await page.keyboard.press('Escape');assert.equal(await board.count(),0);
    assert.equal(await page.locator('#streamerLoungeV2036[open]').count(),0);
    assert.equal(await page.locator('soop-adventure-lobby').getAttribute('data-route'),'home');
    assert(await entrance.evaluate(el=>el===document.activeElement));
    await entrance.click();assert(await home.isVisible(),'Reopening begins at department selection');await page.locator('[data-cnine-roster-close]').click();assert.equal(await board.count(),0);
    assert(await entrance.evaluate(el=>el===document.activeElement));
    if(!publicBase){
      await page.evaluate(()=>document.querySelector('soop-adventure-lobby').openMenu('social'));
      await page.locator('[data-streamer-lounge-open]:visible').click();
      assert.deepEqual(await page.locator('.sl40-station-link').evaluateAll(els=>els.map(el=>el.getAttribute('href'))),roster.profiles.map(row=>row.stationUrl));
      await page.keyboard.press('Escape');
      await page.locator('soop-adventure-lobby #close-menu').click();
      assert.equal(await entrance.count(),1,'The existing lounge does not duplicate the lobby entry');
    }
    assert.deepEqual(errors,[]);
    reports.push({width,entryBox,links,portraits,departments:true,directLobbyEntrance:true,keyboardAndBackButtonToLobby:true,newTabOpenerNull:true,noOverflow:true,buttonColor,errors});
    console.log('PASS '+width+': lobby → department selector → female 5 / star 3 in separate 3-column pages → new station links → lobby');
    await page.close();
  }
  assert.deepEqual(writes,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({status:'PASSED',surface:publicBase?'deployed component':'actual main lobby',reports,missing,productionWrites:0},null,2));
} finally { await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
