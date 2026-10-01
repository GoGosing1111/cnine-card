import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
function dependency(name, fallback) { try { return require(name); } catch { return require(fallback); } }
const { chromium } = dependency('playwright', 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp = dependency('sharp', 'C:/Users/User/.codex/worktrees/node_modules/sharp');
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = fileURLToPath(new URL('./', import.meta.url));
const output = root + 'assets/posters/pingdu-golden-silver-axe-20261002-v1.png';
const jpg = output.replace(/\.png$/, '.jpg');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1536 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(new URL('./index.html', import.meta.url).href, { waitUntil: 'load' });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(img => img.decode()));
});
const qa = await page.evaluate(() => {
  const poster = document.querySelector('.poster').getBoundingClientRect();
  const texts = [...document.querySelectorAll('.brand-name,.kicker,.host,h1 span,.duration,.dates,.year')].map(el => {
    const box = el.getBoundingClientRect();
    return { text: el.textContent.trim(), x: box.x, y: box.y, width: box.width, height: box.height,
      font: getComputedStyle(el).fontFamily, withinPoster: box.left >= poster.left && box.right <= poster.right && box.top >= poster.top && box.bottom <= poster.bottom };
  });
  return { dimensions: [poster.width,poster.height], texts, imageLoaded: [...document.images].every(i => i.naturalWidth > 0),
    titleFontLoaded: document.fonts.check('40px PosterTitle', '숲켓몬핑두의금도끼은도끼'),
    bodyFontLoaded: document.fonts.check('40px PosterBody', '월일단기간한정이벤트'),
    noHorizontalOverflow: document.documentElement.scrollWidth === innerWidth };
});
assert.deepEqual(qa.dimensions, [1024,1536]);
assert.equal(qa.texts.map(t=>t.text).join('|'), '숲켓몬|기간 한정 이벤트|핑두의|금도끼|은도끼|단 7일간|10월 2일 ~ 10월 8일|2026');
assert.ok(qa.texts.every(t=>t.withinPoster));
assert.ok(qa.imageLoaded && qa.titleFontLoaded && qa.bodyFontLoaded && qa.noHorizontalOverflow);
assert.equal((Date.parse('2026-10-08')-Date.parse('2026-10-02'))/86400000+1,7);
await mkdir(root + 'assets/posters', {recursive:true});
await page.locator('.poster').screenshot({path:output});
await sharp(output).jpeg({ quality:95, mozjpeg:true, chromaSubsampling:'4:4:4' }).toFile(jpg);
await page.setViewportSize({width:390,height:844});
await page.locator('.poster').screenshot({path:dir+'qa-mobile-390.png',scale:'css'});
const phone = await page.evaluate(() => ({noHorizontalOverflow:document.documentElement.scrollWidth===innerWidth, width:document.querySelector('.poster').getBoundingClientRect().width}));
assert.equal(phone.width,390);assert.ok(phone.noHorizontalOverflow);
await browser.close();
assert.deepEqual(errors,[]);
const hash = async p => createHash('sha256').update(await readFile(p)).digest('hex');
const resourceNames = ['pink-rider.png','moonlit-pond.png','axes.png'];
const resources = await Promise.all(resourceNames.map(async name => ({path:'assets/ui/events/golden-axe-v1/'+name,sha256:await hash(root+'assets/ui/events/golden-axe-v1/'+name)})));
const meta = await sharp(output).metadata();
const manifest = {
  createdAt:'2026-10-02', title:'핑두의 금도끼 은도끼', brand:'숲켓몬',
  output:'assets/posters/pingdu-golden-silver-axe-20261002-v1.png',
  jpeg:'assets/posters/pingdu-golden-silver-axe-20261002-v1.jpg',
  dimensions:[meta.width,meta.height],
  sourceHtml:'preview/pingdu-golden-silver-axe-poster-20261002/index.html',
  prompt:'preview/pingdu-golden-silver-axe-poster-20261002/prompt.json',
  artwork:'preview/pingdu-golden-silver-axe-poster-20261002/artwork-v1.png',
  generationMode:'Built-in image_gen with three inspected in-game reference images; original game resources unchanged',
  typography:'All Korean lettering rendered separately using packaged Black Han Sans and Noto Sans KR (SIL OFL); generated artwork contains no text.',
  eventDates:{start:'2026-10-02',endInclusive:'2026-10-08',days:7,timezone:'Asia/Seoul',specificHours:null},
  copy:qa.texts.map(t=>t.text),sources:resources,
  sha256:await hash(output),artworkSha256:await hash(dir+'artwork-v1.png'),
  gameRuntimeChanged:false, eventSettingsChanged:false, publishedInGame:false
};
await writeFile(root+'assets/posters/pingdu-golden-silver-axe-20261002-v1.json', JSON.stringify(manifest,null,2)+'\n');
await writeFile(dir+'qa.json',JSON.stringify({desktop:qa,mobile:phone,browserErrors:errors,outputDimensions:manifest.dimensions},null,2)+'\n');
console.log(JSON.stringify({output,jpg,dimensions:manifest.dimensions,checks:'Fonts, exact copy, seven inclusive days, bounds and desktop/mobile render passed'},null,2));
