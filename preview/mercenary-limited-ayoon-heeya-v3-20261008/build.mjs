import {build} from 'esbuild';
import fs from 'node:fs/promises';
import {file} from './inspect-assets.mjs';
await build({entryPoints:[file('preview.js')],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:file('preview.bundle.js')});
// Normalize insignificant line endings inside bundled shader source strings.
await fs.writeFile(file('preview.bundle.js'),(await fs.readFile(file('preview.bundle.js'),'utf8')).replace(/[\t ]+$/gm,''));
console.log('Limited duo replay uses the actual shared V3/Pixi/GSAP runtime.');
