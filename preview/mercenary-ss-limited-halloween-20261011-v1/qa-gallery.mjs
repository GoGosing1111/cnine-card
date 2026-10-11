import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const preview = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(preview, '../..');
const output = path.join(preview, 'qa');
await fs.mkdir(output, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
async function serveOffline(route) {
  try {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep)) throw new Error('Outside preview root');
    const content = await fs.readFile(file);
    const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
    await route.fulfill({status:200,contentType:types[path.extname(file)] || 'application/octet-stream',body:content});
  } catch {await route.fulfill({status:404,body:'Not found'});}
}
// A synthetic browser origin is fulfilled directly from local files; no network server or remote request is used.
const url = 'http://halloween-preview.test/preview/mercenary-ss-limited-halloween-20261011-v1/';
const browser = await chromium.launch({ headless: true, ...(process.env.QA_CHROMIUM ? { executablePath: process.env.QA_CHROMIUM } : {}) });
const results = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    await page.route('http://halloween-preview.test/**',serveOffline);
    const errors = [];page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);await page.waitForSelector('.entry');
    assert.equal(await page.locator('.entry').count(), 6);
    for (const mode of ['art', 'frame', 'small', 'reference']) {
      await page.locator(`.view-modes button[data-mode="${mode}"]`).click();
      await page.evaluate(async () => { for (const image of document.images) image.loading = 'eager';await Promise.all([...document.images].map(image => image.decode())); });
      const measure = await page.evaluate(() => ({
        width: innerWidth, contentWidth: document.documentElement.scrollWidth,
        pictures: [...document.querySelectorAll('.painting')].map(node => {const r = node.getBoundingClientRect();return { width: r.width, height: r.height };}),
        broken: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
      }));
      assert.ok(measure.contentWidth <= measure.width, `${mode} horizontal overflow`);
      assert.equal(measure.broken.length, 0);
      if (mode === 'small') for (const picture of measure.pictures) assert.equal(picture.width, 160);
      if (mode === 'art' || mode === 'frame') await page.screenshot({ path: path.join(output, `${viewport.width}-${mode}.png`), fullPage: viewport.width > 600 });
      results.push({ viewport, mode, entries: 6, ...measure });
    }
    await page.locator('.view-modes button[data-mode="art"]').click();
    await page.locator('button.painting').first().click();
    assert.equal(await page.locator('dialog').evaluate(node => node.open), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').evaluate(node => node.open), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const weaponPage=await browser.newPage({viewport:{width:1100,height:1600}});
  await weaponPage.route('http://halloween-preview.test/**',serveOffline);
  for(const [slug,clip] of [['joeun',{x:175,y:170,width:849,height:245}],['diim',{x:130,y:20,width:250,height:760}]]){
    await weaponPage.setContent(`<style>body{margin:0}img{display:block;width:1024px;height:1536px}</style><img src="${url}assets/${slug}-halloween-new-pose-v3.png">`);
    await weaponPage.locator('img').evaluate(img=>img.decode());
    await weaponPage.screenshot({path:path.join(output,`${slug}-v3-weapon-css-inspection.png`),clip});
  }
  await weaponPage.close();
  await fs.writeFile(path.join(output, 'gallery-verification.json'), JSON.stringify({ date: '2026-10-11', results, imageProcessing: false, checks: ['six cards', 'desktop and mobile', 'four viewing modes', 'all image paths', 'no horizontal overflow', '160px exact', 'zoom and Escape close', 'no JavaScript errors'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, scenarios: results.length, output }, null, 2));
} finally {await browser.close();}
