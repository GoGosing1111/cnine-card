import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Mechanical derivatives only. Never write to the original art, SD or anchors.
const root = fileURLToPath(new URL('../', import.meta.url));
const roster = JSON.parse(await fs.readFile(path.join(root, 'assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'), 'utf8'));
const output = path.join(root, 'assets/ui/project-v/mercenaries/codex-v1');
await fs.mkdir(output, { recursive: true });
const entries = [];
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
for (const card of roster.cards) {
  for (const kind of ['art', 'sd']) {
    const inputPath = kind === 'art' ? card.sourceArt : card.battleSprite;
    if (!inputPath) continue;
    const input = await fs.readFile(path.join(root, inputPath));
    const expectedHash = kind === 'art' ? card.sourceArtSha256 : card.battleSpriteSha256;
    if (hash(input) !== expectedHash) throw new Error(`${card.code}: source hash mismatch; stop without changing source`);
    for (const width of kind === 'art' ? [320, 640] : [640]) {
      const file = `${card.code.toLowerCase()}-${kind}-${width}.webp`;
      const buffer = await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality: kind === 'art' ? 88 : 90, effort: 5 }).toBuffer();
      await fs.writeFile(path.join(output, file), buffer);
      const meta = await sharp(buffer).metadata();
      entries.push({ code: card.code, kind, file, width: meta.width, height: meta.height, bytes: buffer.length, source: inputPath, sourceSha256: hash(input), sha256: hash(buffer) });
    }
  }
}
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ format: 'MERCENARY_CODEX_MEDIA_V1', generator: 'scripts/build-mercenary-codex-media-v1.mjs', originalsModified: false, entries }, null, 2)}\n`);
console.log(JSON.stringify({ files: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), list320Bytes: entries.filter(entry => entry.kind === 'art' && entry.width === 320).reduce((sum, entry) => sum + entry.bytes, 0) }));
