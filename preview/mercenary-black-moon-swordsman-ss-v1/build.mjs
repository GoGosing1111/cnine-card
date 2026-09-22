import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const root=fileURLToPath(new URL('.',import.meta.url));
await build({entryPoints:[root+'source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:root+'preview.bundle.js'});
const output=await fs.readFile(root+'preview.bundle.js','utf8');
await fs.writeFile(root+'preview.bundle.js',output.replace(/[\t ]+$/gm,'').trimEnd()+'\n');
console.log('Black Moon preview uses the shared V3 engine, PixiJS 8.20.0 and GSAP 3.13.0.');
