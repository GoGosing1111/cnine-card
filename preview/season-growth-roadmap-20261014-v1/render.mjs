import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const output = path.join(root, 'assets/posters/soopketmon-season-growth-roadmap-20261014-v1.png');
const browserModule = process.env.PLAYWRIGHT_MODULE
  || 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(browserModule).href);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const candidate = path.resolve(root, '.' + pathname);
    if (candidate !== root && !candidate.startsWith(root + path.sep)) throw new Error('Outside root');
    const target = pathname.endsWith('/') ? path.join(candidate, 'index.html') : candidate;
    const data = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = 'http://127.0.0.1:' + server.address().port + '/preview/season-growth-roadmap-20261014-v1/';
await mkdir(path.dirname(output), { recursive: true });
await mkdir(path.join(here, 'qa'), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
const consoleErrors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1080, height: 1620 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('pageerror', error => consoleErrors.push(error.message));
  const failedRequests = [];
  page.on('requestfailed', request => failedRequests.push(request.url()));
  await page.goto(address + '?export=1', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, img => img.decode()));
  });
  const copy = await page.locator('.poster').innerText();
  const fonts = await page.evaluate(() => ({
    noto: document.fonts.check('700 28px "Growth Noto"', '숲켓몬 칭호 트로피 획득 군단토벌 용병 장비'),
    display: document.fonts.check('179px "Growth Display"', '성장'),
    mono: document.fonts.check('500 21px "Growth Mono"', '01 NEXT SEASON')
  }));
  if (Object.values(fonts).some(value => !value)) throw new Error('Poster fonts did not load');
  for (const required of ['숲켓몬', '손실 없는 성장', 'SSS 조각으로 제작', '군단토벌', '칭호 · 트로피 획득', '카드 · 용병의 전술과 조합']) {
    if (!copy.includes(required)) throw new Error('Missing approved copy: ' + required);
  }
  const clipping = await page.locator('.poster').evaluate(element => {
    const outer = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll('p,h1,h2,.brand,.edition,.number')).flatMap(node => {
      const rect = node.getBoundingClientRect();
      return rect.left < outer.left || rect.right > outer.right || rect.top < outer.top || rect.bottom > outer.bottom ? [node.textContent] : [];
    });
  });
  if (clipping.length) throw new Error('Text outside poster: ' + clipping.join(', '));
  await page.locator('.poster').screenshot({ path: output, animations: 'disabled' });
  await page.locator('.masthead').screenshot({ path: path.join(here, 'qa/brand-font-check.png'), animations: 'disabled' });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 585 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(address, { waitUntil: 'networkidle' });
  await mobilePage.evaluate(async () => { await document.fonts.ready; });
  await mobilePage.screenshot({ path: path.join(here, 'qa/mobile-390.png'), animations: 'disabled' });
  const mobileLayout = await mobilePage.evaluate(() => ({
    viewport: innerWidth,
    contentWidth: document.documentElement.scrollWidth,
    posterWidth: document.querySelector('.poster').getBoundingClientRect().width,
    posterHeight: document.querySelector('.poster').getBoundingClientRect().height
  }));
  if (mobileLayout.contentWidth > 390) throw new Error('Mobile horizontal overflow');
  if (consoleErrors.length || failedRequests.length) throw new Error('Page load errors');
  const qa = { checkedAt: new Date().toISOString(), desktop: { width: 1080, height: 1620, deviceScaleFactor: 2 }, export: { width: 2160, height: 3240 }, fonts, clipping, consoleErrors, failedRequests, mobile: mobileLayout, renderedCopy: copy };
  await writeFile(path.join(here, 'qa/render-check.json'), JSON.stringify(qa, null, 2) + '\n');
  const sha256 = async file => createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  const artwork = 'preview/season-growth-roadmap-20261014-v1/art-source-v1.png';
  const final = 'assets/posters/soopketmon-season-growth-roadmap-20261014-v1.png';
  const manifest = {
    title: '숲켓몬 시즌 로드맵 — 성장',
    status: 'DELIVERED_FOR_USER_VISUAL_REVIEW',
    generationMode: 'built-in image_gen',
    artwork: { path: artwork, sha256: await sha256(artwork), originalBytesPreserved: true },
    poster: { path: final, sha256: await sha256(final), width: 2160, height: 3240, mimeType: 'image/png' },
    editableSource: 'preview/season-growth-roadmap-20261014-v1/index.html',
    prompt: 'preview/season-growth-roadmap-20261014-v1/prompt.json',
    fonts: [
      { name: 'Noto Sans KR', file: 'assets/fonts/lich-raid/NotoSansKR-lich-v1.woff2', license: 'assets/fonts/lich-raid/NotoSansKR-OFL.txt' },
      { name: 'Black Han Sans', file: 'assets/fonts/clan-camp/BlackHanSans-Regular.ttf', license: 'assets/fonts/clan-camp/BlackHanSans-OFL.txt' },
      { name: 'IBM Plex Mono Medium', file: 'assets/fonts/clan-camp/IBMPlexMono-Medium.ttf', license: 'assets/fonts/clan-camp/IBMPlexMono-OFL.txt' }
    ],
    scope: '포스터 자산과 편집용 프리뷰만 추가. 게임 동작·경제·확률·기능 활성화·공지 등록 변경 없음.',
    copy: copy.split('\n').filter(Boolean),
    qa: 'preview/season-growth-roadmap-20261014-v1/qa/render-check.json'
  };
  await writeFile(path.join(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ output, fonts, mobile: mobileLayout, sha256: manifest.poster.sha256 }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

