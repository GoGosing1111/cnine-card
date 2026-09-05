import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('SUPERSTAR uses the same championship frame in live cards and CMS previews',()=>{
  const app=read('js/app.js');
  const adminHtml=read('admin/index.html');
  const adminModule=read('admin/superstar-admin-v1.js');
  const adminCss=read('admin/superstar-admin-v1.css');

  assert.match(app,/normalizedGrade==='SUPERSTAR'\?'<img class="superstar-card-frame"/);
  assert.match(adminHtml,/superstar-admin-v1\.css\?v=2-pack-preview/);
  assert.match(adminHtml,/superstar-admin-v1\.js\?v=2034-superstar-power-deck/);
  assert.match(adminModule,/superstarAdminFrame/);
  assert.match(adminModule,/superstarPendingFrame/);
  assert.match(adminModule,/cmsSuperstarFrame/);
  assert.match(adminCss,/\.adminCard\.superstarAdminCard/);
  assert.match(adminCss,/\.pendingCard\.superstarPendingCard/);
  assert.match(adminCss,/\.cmsNewCardGrid article\.cmsSuperstarCard/);
});

test('SUPERSTAR remains event-exclusive and cannot enter normal card packs',()=>{
  const api=read('functions/api/[[path]].js');
  const drawGrades=api.match(/const DRAW_RARITIES=\[([^\]]+)\]/)?.[1]||'';

  assert.doesNotMatch(drawGrades,/SUPERSTAR/);
  assert.equal((api.match(/UPPER\(c\.rarity\)<>'SUPERSTAR'/g)||[]).length,3);
  assert.match(api,/CMS 캡처 미리보기는 실제 카드팩 후보 풀이 아니다/);
  assert.match(api,/if\(\['PRESTIGE','SUPERSTAR'\]\.includes\(grade\)\) drawWeight=0/);
  assert.match(api,/const rarityOverride=\['PRESTIGE','ZENITH','SUPERSTAR'\]/);
});

test('SUPERSTAR frame is a compressed transparent WebP production asset',()=>{
  const framePath=path.join(root,'assets/ui/card-frames/superstar-championship-frame-v1.webp');
  const data=fs.readFileSync(framePath);

  assert.equal(data.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(data.subarray(8,12).toString('ascii'),'WEBP');
  assert.ok(data.byteLength>100_000,'frame should contain production artwork');
  assert.ok(data.byteLength<350_000,'frame should stay compressed for web delivery');
});
