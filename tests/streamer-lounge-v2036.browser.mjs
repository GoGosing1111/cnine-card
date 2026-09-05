// Optional real-Chrome QA. API reads/writes are fixtures; never uses live users.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_STREAMER_SETTINGS, publicStreamerSettings, validateStreamerSettings } from '../js/streamer-lounge-model-v2036.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.STREAMER_QA_ORIGIN || 'http://127.0.0.1:4186';
const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const styles = [...read('index.html').matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]).filter(url => url.startsWith('css/'));
const ops = read('js/app.js').match(/function liveOperationsHtml\(surface='store'\)\{[\s\S]*?\n\}/)[0];
const loungeScript = read('index.html').match(/src="(js\/streamer-lounge-v2036\.js\?v=[^"]+)"/)[1];
const bgmCss = read('js/lobby-bgm-v1803.js').match(/style.textContent = `([\s\S]*?)`;/)[1];
const burningHud = read('js/app.js').match(/function burningEventHudMarkup\(\)\{[\s\S]*?\n\}/)[0];
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(url => `<link rel="stylesheet" href="/${url}">`).join('')}</head><body><div id="app"><main class="page" data-cnine-shell="1"><!--cnine-route-start--><div></div><!--cnine-route-end--></main></div><script>
window.loadUser=()=>({nickname:'라운지 검수',coin:2800000000,cardShards:3200000,magicCrystals:12400,role:'USER'});window.renderShell=()=>{};window.clanFeatureVisible=()=>true;window.escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');${ops};window.apiRequest=async p=>p==='chief/status'?{chief:{active:true,nickname:'족장',ordinal:10,remainingMs:172800000}}:{};
window.burningEventIsActive=()=>true;window.burningMode=()=>'BURNING';window.burningEventNumbers=()=>({pve:20,pvp:20,minutes:5,coins:5});window.burningMultiplierText=x=>String(x);window.burningRemainingText=()=>'02:59:55 남음';${burningHud};
</script><script defer src="/js/soopketmon-v21-exact-shell-adapter.js?v=21.21.0-streamer-lounge"></script><script type="module" src="/${loungeScript}"></script></body></html>`;
const adminHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/streamer-lounge-admin-v2036.css?v=2036"></head><body><main style="margin:24px auto;width:min(1080px,calc(100% - 32px))"><h1>CMS · 설정</h1><section class="view" id="view-settings"></section></main><script type="module" src="/admin/streamer-lounge-admin-v2036.js?v=2036"></script></body></html>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height, touch = width < 760] of [[1836,1160],[1440,900],[1024,768],[1024,1258,true],[390,844],[360,740],[360,640]]) {
    let settings = structuredClone(DEFAULT_STREAMER_SETTINGS);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
    const page = await context.newPage(), errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(`${origin}/qa-streamer-lounge`, route => route.fulfill({ contentType:'text/html; charset=utf-8',body:html }));
    await page.route(`${origin}/api/**`, async route => { calls.push(route.request().url()); assert.equal(route.request().method(),'GET'); await route.fulfill({json:publicStreamerSettings(settings)}); });
    await page.goto(`${origin}/qa-streamer-lounge`);
    const entry = page.locator('[data-streamer-lounge-open]:visible');
    await entry.waitFor();
    // Freeze inherited Burning/lobby pulses for deterministic geometry snapshots.
    await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
    // Include the production BGM button geometry, without playing music or accessing an account.
    await page.addStyleTag({content:bgmCss});
    await page.evaluate(() => {
      const host=[...document.querySelectorAll('.pc-lobby-brand,.mobile-lobby-brand')].find(node=>node.getBoundingClientRect().width>0);
      const button=document.createElement('button');button.className='lobby-bgm-toggle is-muted';button.innerHTML='<i>🔇</i><em>BGM OFF</em>';host.append(button);
      document.documentElement.classList.add('burning-event-active');
      document.querySelector('.top-hud').insertAdjacentHTML('beforeend',window.burningEventHudMarkup());
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.sl36-face-stack img')].filter(img=>img.getBoundingClientRect().width>0).every(img=>img.complete));
    const bounds = await entry.boundingBox();
    const sceneLeft=await entry.evaluate(el=>el.closest('.pc-lobby-scene,.mobile-command-lobby').getBoundingClientRect().left);
    assert.ok(Math.abs(bounds.x-sceneLeft)<1,'lounge is docked flush to the left edge, never a floating badge');
    assert.ok(bounds.x>=-1 && bounds.y>=0 && bounds.x+bounds.width<=width+1 && bounds.y+bounds.height<=height,`entry visible inside screen ${JSON.stringify({bounds,sceneLeft,width,height})}`);
    const collisions = await page.evaluate(() => {
      const entry=[...document.querySelectorAll('[data-streamer-lounge-open]')].find(node=>node.getBoundingClientRect().width>0),a=entry.getBoundingClientRect();
      return [...document.querySelectorAll('.pc-main-navigation,.pc-chief-readout,.pc-utility-rail,.pc-lobby-brand,.mobile-command-nav,.mobile-chief-readout,.mobile-lobby-brand,.lobby-bgm-toggle,.burning-event-hud,.live-operations')].filter(node=>{const b=node.getBoundingClientRect();return b.width>0&&b.height>0&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}).map(node=>node.className);
    });
    assert.deepEqual(collisions,[],`entry must not cover existing lobby functions (${width}x${height})`);
    assert.ok(bounds.height<=111,'compact entry does not grow into a large badge');
    if(touch) assert.equal(Math.round(bounds.height),width<760&&height<=680?86:104,'approved mobile height; short phones reserve chief space');
    await page.screenshot({path:path.join(os.tmpdir(),`streamer-lobby-v2037-${width}-${height}.png`),animations:'disabled'});
    await entry.click(); await page.locator('.sl36-dialog[open]').waitFor();
    assert.equal(await page.locator('.sl36-card').count(),5);
    const links=await page.locator('.sl36-card a').evaluateAll(xs=>xs.map(x=>({url:x.href,target:x.target,rel:x.rel})));
    assert.deepEqual(links.map(x=>x.url),DEFAULT_STREAMER_SETTINGS.profiles.map(row=>row.stationUrl));
    assert.ok(links.every(x=>x.target==='_blank'&&x.rel.includes('noopener')&&x.rel.includes('noreferrer')));
    await page.waitForFunction(()=>[...document.querySelectorAll('.sl36-dialog img')].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.top<innerHeight;}).every(img=>img.complete));
    assert.equal(await page.locator('.sl36-hero-mark').count(),0,'retired monitor badge is gone');
    assert.equal(await page.locator('.sl36-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 17, 18)');
    await page.screenshot({path:path.join(os.tmpdir(),`streamer-lounge-v2037-${width}-${height}.png`),animations:'disabled'});
    assert.equal(await page.locator('.sl36-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'no lounge horizontal overflow');
    for(const name of ['디임','조은','하이희야','강구열','오리꿍']) assert.ok(await page.getByRole('button',{name:`${name} 프로필 보기`,exact:true}).count());
    await page.getByRole('searchbox').fill('조은'); assert.equal(await page.locator('.sl36-card').count(),1);
    await page.getByRole('button',{name:'조은 프로필 보기',exact:true}).click();assert.equal(await page.locator('.sl36-detail h2').textContent(),'조은');
    assert.equal(await page.locator('.sl36-detail a').getAttribute('href'),'https://www.sooplive.com/station/zalalz');
    await page.screenshot({path:path.join(os.tmpdir(),`streamer-detail-v2036-${width}-${height}.png`),animations:'disabled'});
    await page.locator('[data-sl36-list]').click();assert.equal(await page.locator('.sl36-card').count(),1);
    await page.getByRole('searchbox').fill('없음');assert.match(await page.locator('[data-sl36-grid]').textContent(),/검색된 스트리머가 없습니다/);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.sl36-dialog').evaluate(el=>el.open),false);
    assert.equal(await entry.evaluate(el=>el===document.activeElement),true);
    // A CMS hide is reflected next time the lounge is opened; never reseed it.
    settings.profiles[0].visible=false;await entry.click();await page.waitForFunction(()=>document.querySelectorAll('.sl36-card').length===4);
    assert.equal(await page.getByRole('button',{name:'디임 프로필 보기',exact:true}).count(),0);
    await page.locator('[data-sl36-close]').click();
    assert.match(await entry.getAttribute('aria-label'),/4명/);
    assert.equal(await page.locator('.game-frame').getAttribute('data-route'),'home');
    assert.deepEqual(errors,[]);assert.ok(calls.every(url=>url.endsWith('/api/streamer-profiles')));await context.close();
    console.log(`PASS lobby + lounge ${width}x${height}: five links, no overlaps, profile/search, keyboard close and hide refresh`);
  }
  const page=await browser.newPage({viewport:{width:1280,height:960}}), errors=[];let settings=structuredClone(DEFAULT_STREAMER_SETTINGS),revision='initial-v2036',saves=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(`${origin}/admin/qa-streamers`,r=>r.fulfill({contentType:'text/html; charset=utf-8',body:adminHtml}));
  await page.route(`${origin}/api/admin/streamer-profiles`,async route=>{if(route.request().method()==='PATCH'){const body=route.request().postDataJSON();assert.equal(body.expectedRevision,revision);settings=validateStreamerSettings(body.settings);revision=`saved-${++saves}`;}await route.fulfill({json:{settings,revision,ok:true}});});
  page.on('dialog',dialog=>dialog.accept());await page.goto(`${origin}/admin/qa-streamers`);await page.locator('[data-sl36-row]').first().waitFor();
  assert.equal(await page.locator('[data-sl36-row]').count(),5);assert.equal(saves,0);
  await page.locator('[data-sl36-row="0"] [data-field="visible"]').uncheck();
  await page.locator('[data-move="1:up"]').click();
  await page.locator('[data-sl36-row="0"] [data-field="description"]').fill('숲켓몬 방송국에서 만나요.');
  await page.locator('[data-sl36-save]').click();await page.waitForFunction(()=>document.querySelector('.sl36-admin-notice').textContent.includes('저장 완료'));
  assert.equal(saves,1);assert.equal(settings.profiles[0].name,'조은');assert.equal(settings.profiles[1].visible,false);assert.equal(settings.profiles[0].description,'숲켓몬 방송국에서 만나요.');
  await page.reload();await page.locator('[data-sl36-row]').first().waitFor();assert.equal(await page.locator('[data-sl36-row="0"] [data-field="name"]').inputValue(),'조은');
  await page.screenshot({path:path.join(os.tmpdir(),'streamer-cms-v2036.png'),animations:'disabled'});
  await page.locator('[data-sl36-add]').click();assert.equal(await page.locator('[data-sl36-row]').count(),6);assert.equal(saves,1);
  assert.deepEqual(errors,[]);await page.close();console.log('PASS CMS: read-only opening, reorder/hide/introduction save, reload persistence, add without auto-save');
} finally { await browser.close(); }
