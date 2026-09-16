import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const outfile='preview/battle-suit-sz-v1/preview.bundle.js';
await build({entryPoints:['preview/battle-suit-sz-v1/source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2020'],legalComments:'none',outfile});
// Pixi's embedded GLSL contains insignificant trailing spaces.
await writeFile(outfile,(await readFile(outfile,'utf8')).replace(/[\t ]+$/gm,''));
console.log('Built S-BODY / Z-BODY preview with the existing V3 AccountBattleUnit and BallisticVFX.');
