import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const root=fileURLToPath(new URL('.',import.meta.url));
const result=await build({entryPoints:[root+'source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',write:false,outfile:root+'preview.bundle.js'});
// Pixi's embedded shader templates retain trailing spaces after minification.
// Normalize only end-of-line whitespace as part of reproducible generation.
await fs.writeFile(root+'preview.bundle.js',result.outputFiles[0].text.replace(/[\t ]+$/gm,''));
console.log('Built ICON preview only: shared V3 engine, one PixiJS + GSAP copy. Live bundles unchanged.');
