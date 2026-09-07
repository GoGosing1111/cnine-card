import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const base = new URL('preview/mercenary-four-looks-v1/', root);
const read = path => readFileSync(new URL(path, base));
const prompts = JSON.parse(read('prompts.json'));
const sha = buffer => createHash('sha256').update(buffer).digest('hex').toUpperCase();

test('네 의상·무기 조합은 독립된 성인 원화 시안이며 운영 편성과 구분한다', () => {
  assert.equal(prompts.status, 'APPROVED_SOURCE_ART');
  assert.equal(prompts.generationMode, 'BUILT_IN_IMAGE_GEN');
  assert.equal(prompts.liveRosterConnected, true);
  assert.equal(prompts.catalogConnected, true);
  assert.equal(prompts.runtimeConnected, false);
  assert.equal(prompts.sourceArtOnly, true);
  assert.deepEqual(prompts.jobs.map(job => job.id), ['office-gauntlet', 'garter-chainsword', 'bikini-bow', 'hotpants-greatsword']);
  for (const job of prompts.jobs) {
    assert.match(job.prompt, /ADULT/);
    assert.match(job.prompt, /not the same person/);
    assert.match(job.prompt, /No text, name, rank, logo, watermark, UI, or baked-in card frame/);
  }
});

test('4종 원본은 개별 1024×1536 sRGB PNG이며 네이티브 생성 파일을 보존한다', async () => {
  const manifest = JSON.parse(read('generation.json'));
  assert.equal(manifest.outputs.length, 4);
  const hashes = new Set();
  for (const job of prompts.jobs) {
    const file = read(`assets/${job.file}`);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 1536);
    assert.equal(metadata.space, 'srgb');
    assert.equal(metadata.channels, 3);
    const record = manifest.outputs.find(item => item.id === job.id);
    assert.ok(record);
    assert.equal(record.sha256, sha(file));
    assert.equal(record.processing, 'NONE_BYTE_FOR_BYTE_COPY');
    hashes.add(record.sha256);
  }
  assert.equal(hashes.size, 4);
});

test('베스페라 앵커를 보존하고 원화·프레임은 검수 페이지에서 별도 계층으로 표시한다', () => {
  const anchor = readFileSync(new URL('assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png', root));
  assert.equal(sha(anchor), '629564D768A4BCEFCD0BE746E744DA49A64F1CF2BE7D048E7485FC6CB14FF874');
  const html = read('index.html').toString();
  assert.equal((html.match(/class="art"/g) || []).length, 4);
  assert.equal((html.match(/class="frame"/g) || []).length, 4);
  assert.match(html, /160px 카드 크기/);
  assert.match(html, /사용자 시각 승인 완료 원화/);
  assert.doesNotMatch(html, /apiRequest|fetch\(|localStorage|AudioContext|<audio/);
  for (const job of prompts.jobs) assert.ok(html.includes(`./assets/${job.file}`));
});
