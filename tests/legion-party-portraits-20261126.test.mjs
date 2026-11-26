import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { MERCENARY_CMS_SEED } from '../functions/_mercenary_cms_seed.js';
import { mercenaryCodexDocument } from '../functions/_mercenary_codex.js';
import { portraitSheets } from '../js/legion-party-portrait-sheets-v1.mjs';

const root = new URL('../', import.meta.url);
const local = url => new URL(url.replace(/^\//, ''), root);
test('every mercenary picker portrait has one matching tile, with bounded downloads', async () => {
  const catalog = mercenaryCodexDocument({ payload_json: JSON.stringify(MERCENARY_CMS_SEED.document), revision: 1 });
  const originals = new Set(catalog.cards.map(card => '/' + card.sourceArt));
  const sources = portraitSheets.flatMap(sheet => sheet.sources);
  assert.deepEqual(new Set(sources), originals);
  assert.equal(sources.length, originals.size);
  let packedBytes = 0;
  for (const sheet of portraitSheets) {
    assert(sheet.sources.length > 0 && sheet.sources.length <= 16);
    const bytes = await readFile(local(sheet.image));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    assert(sheet.image.endsWith('/' + hash + '.webp'));
    const { width, height, format } = await sharp(bytes).metadata();
    assert.deepEqual([width, height, format], [420, 528, 'webp']);
    packedBytes += bytes.length;
  }
  const sizes = await Promise.all(sources.map(source => stat(local(source))));
  assert(packedBytes < sizes.reduce((sum, file) => sum + file.size, 0) / 100);
});
