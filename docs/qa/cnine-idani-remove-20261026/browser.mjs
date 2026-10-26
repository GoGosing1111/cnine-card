import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = process.cwd(), out = process.env.QA_OUT || path.join(root, 'docs/qa/cnine-idani-remove-20261026');
const publicBase = process.env.QA_PUBLIC_BASE || '';
const roster = await (await fetch('https://cnine-card.pages.dev/api/streamer-profiles')).json();
const expected = [['kaja0011','여을'],['chocho12','초초'],['yjk011599','나무늘봉순'],['lcy011027','BJ채리'],['wkao85guo','꾸까'],['mew030709','남수댕'],['zalalz','조은'],['qpqpro','디임']];
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const missing = [], writes = [];
const apiPayload = pathname => pathname === '/api/streamer-profiles' ? roster : { maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[] };
const moduleHtml = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/cnine-roster-v1.css?v=20261026-v4-portrait-spacing"></head><body style="margin:0;background:#071427"><soop-adventure-lobby data-view="home" data-route="home"></soop-adventure-lobby><script type="module">import {mountCnineLobby} from "/js/cnine-roster-v1.js?v=20261026-v5";document.querySelector("soop-adventure-lobby").attachShadow({mode:"open"}).innerHTML="<slot name=cnine-roster></slot>";mountCnineLobby();</script></body></html>';
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
  if (!fs.existsSync(file)) file = path.resolve('C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site', '.' + decodeURIComponent(url.pathname));
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
  for (const width of (process.env.QA_BEFORE ? [1440] : [1440,390])) {
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


    assert.equal(await board.locator('[data-cnine-member="0929kelly"]').count(),0,'Idani is excluded from the roster');
    assert.equal(await board.locator('.c9-roster-nav [data-cnine-view="female"]').textContent(),'여캠부5');
    assert.deepEqual(await board.locator('[data-cnine-page="female"] .c9-member h3').allTextContents(),['여을','초초','나무늘봉순','BJ채리','꾸까']);
    const bounds=await board.locator('.c9-department-entry').evaluateAll(cards=>cards.map(card=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      const count=card.querySelector('.c9-entry-count'),action=card.querySelector('.c9-roster-action');
      return {count:rect(count),action:rect(action),portraits:[...card.querySelectorAll('.c9-member-portrait')].map(frame=>({frame:rect(frame),image:rect(frame.querySelector('img'))}))};
    }));
    if(process.env.QA_BEFORE)assert(bounds.some(card=>card.portraits.some(p=>p.image.height>p.frame.height+1)),'Reproduce portrait overflowing its entry frame');
    else for(const card of bounds){
      for(const p of card.portraits){
        assert(Math.abs(p.image.width-p.image.height)<1,'Entrance portrait must be square');
        assert(p.image.height<=p.frame.height+1&&p.image.width<=p.frame.width+1,'Image remains inside its frame');
        assert(p.image.bottom<=p.frame.bottom+1,'Image does not overflow below its frame');
        assert(p.image.width<=(width<760?36:56)+1,'Compact entrance image size');
        assert(card.count.y-p.image.bottom>=12,'At least 12px between the image and member count');
        assert(card.action.y-p.image.bottom>=40,'At least 40px between the image and entrance button');
      }
      assert(card.action.y-card.count.bottom>=12,'Count and button remain separate');
    }
    assert(await board.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow');
    await page.screenshot({path:path.join(out,'home-'+width+'.png')});
    if(!process.env.QA_BEFORE){
      for(const id of ['female','star']){
        await board.locator('.c9-roster-nav [data-cnine-view="'+id+'"]').click();
        const department=board.locator('[data-cnine-page="'+id+'"]');assert(await department.isVisible());assert.equal(await department.locator('.c9-department-members').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3,'Three columns remain');
        const expectedRows=id==='female'?expected.slice(0,5):expected.slice(5);
        assert.deepEqual(await department.locator('.c9-member h3').allTextContents(),expectedRows.map(row=>row[1]));if(id==='female')await page.screenshot({path:path.join(out,'female-'+width+'.png')});
        const profileBoxes=await department.locator('.c9-member-portrait').evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return [r.width,r.height];}));
        assert(profileBoxes.every(([w,h])=>w===(width<760?72:120)&&h===w),'Department member portraits retain their original size');
      }
    }
    await page.keyboard.press('Escape');assert.equal(await board.count(),0);assert(await entrance.evaluate(el=>el===document.activeElement));
    assert.deepEqual(errors,[]);reports.push({width,bounds,errors,noOverflow:true});console.log((process.env.QA_BEFORE?'REPRODUCED ':'PASS ')+width+': Idani excluded; female 5 / star 3; portrait spacing retained');await page.close();
  }
  assert.deepEqual(writes,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(out,process.env.QA_BEFORE?'before.json':'browser.json'),JSON.stringify({status:process.env.QA_BEFORE?'REPRODUCED':'PASSED',surface:publicBase?'deployed component':'actual local main',reports,productionWrites:0},null,2)+'\n');
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
