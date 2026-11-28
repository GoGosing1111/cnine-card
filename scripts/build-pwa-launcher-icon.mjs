import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const mark = fileURLToPath(new URL('../assets/ui/brand/reverse-call-20261016/icon-512.png', import.meta.url));
const output = fileURLToPath(new URL('../assets/ui/brand/reverse-call-20261016/pwa-20261128/maskable-512.png', import.meta.url));
const background = '#0b071b';

// Fit the R and its diagonal tip inside the PWA's 80%-diameter safe circle.
// Always start from the unpadded brand mark, including when rebuilding.
await mkdir(dirname(output), {recursive: true});
await sharp(mark).resize(376, 376).flatten({background})
  .extend({left: 42, right: 94, top: 57, bottom: 79, background})
  .png().toFile(output);
