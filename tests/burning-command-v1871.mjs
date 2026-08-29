import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..');
const text=file=>readFile(path.join(root,file),'utf8');

test('burning UI has one app-owned HUD and no legacy strip mover',async()=>{
  const [app,chief,shell]=await Promise.all([text('js/app.js'),text('js/chief-system-v1.js'),text('js/soopketmon-v21-exact-shell-adapter.js')]);
  assert.match(app,/function burningEventHudMarkup\(\)/);
  assert.match(app,/data-burning-event-details/);
  assert.match(app,/showBurningActivationNotice\(\{manual=false\}=\{\}\)/);
  assert.match(app,/전장 가속 프로토콜 발동/);
  assert.match(app,/하이퍼 드라이브 전면 개방/);
  assert.doesNotMatch(app,/function burningEventStripMarkup/);
  assert.doesNotMatch(app,/ensureBurningEventStripVisible/);
  const buyView=app.match(/function buyView\(user\) \{[\s\S]*?\n\}/u)?.[0]||'';
  assert.doesNotMatch(buyView,/burningEventHudMarkup\(\)/);
  assert.match(app,/querySelectorAll\('\.burning-event-hud'\)/);
  assert.match(app,/header\.insertBefore\(next,header\.querySelector\(':scope > \.resource-rail'\)/);
  assert.match(app,/window\.ensureBurningEventHudVisible=ensureBurningEventHudVisible/);
  assert.match(shell,/global\.ensureBurningEventHudVisible\?\.\(\)/);
  assert.doesNotMatch(chief,/burning-event-strip/);
  assert.doesNotMatch(shell,/normalizeBurningStrip|bindBurningStripNormalizer/);
});

test('public burning state exposes an end time for the live countdown',async()=>{
  const api=await text('functions/api/[[path]].js');
  const publicState=api.match(/function burningPublicState\(settings\)\{[^\n]+/u)?.[0]||'';
  assert.match(publicState,/endsAt:settings\.endsAt\|\|null/);
  assert.match(publicState,/durationMinutes:normalizeBurningEventDurationMinutes/);
});

test('red and purple command themes use production image assets and responsive stat grids',async()=>{
  const css=await text('css/burning-event-v1871.css');
  assert.match(css,/\.burning-event-hud\.is-hyper/);
  assert.match(css,/\.burning-command-notice\.is-burning/);
  assert.match(css,/burning-command-backdrop-v1\.avif/);
  assert.match(css,/hyper-burning-command-backdrop-v1\.avif/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css,/border-radius\s*:\s*50%/i);
  assert.doesNotMatch(css,/radial-gradient/i);
});

test('generated command backgrounds are optimized 1600x900 AVIF and WebP files',async()=>{
  const names=['burning-command-backdrop-v1.avif','burning-command-backdrop-v1.webp','hyper-burning-command-backdrop-v1.avif','hyper-burning-command-backdrop-v1.webp'];
  for(const name of names){
    const file=path.join(root,'assets/ui/burning-v1871',name),info=await stat(file),meta=await sharp(file).metadata();
    assert.ok(info.size>40000,`${name} is unexpectedly small`);
    assert.equal(meta.width,1600);
    assert.equal(meta.height,900);
    assert.equal(meta.format,name.endsWith('.avif')?'heif':'webp');
  }
});

test('entry document and service worker use the burning command cache contract',async()=>{
  const [index,worker,preview]=await Promise.all([text('index.html'),text('service-worker.js'),text('preview/live-burning-command-v1/index.html')]);
  assert.match(index,/burning-event-v1871\.css\?v=1902-burning-owner-timer/);
  assert.match(index,/js\/app\.js\?v=1921-inventory-reroll-route/);
  assert.match(index,/chief-system-v1\.js\?v=1902-burning-owner-timer/);
  assert.match(index,/soopketmon-v21-exact-shell-adapter\.js\?v=21\.14\.0-bulk-enhancement/);
  assert.match(worker,/soop-card-shell-v1916-territory-100-attack-reward/);
  assert.match(preview,/burning-event-v1871\.css\?v=1902-burning-owner-timer/);
});
