import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const root=fileURLToPath(new URL('.',import.meta.url));
await build({entryPoints:[root+'source/battle-preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:root+'battle-preview.bundle.js'});
const output=await fs.readFile(root+'battle-preview.bundle.js','utf8');
await fs.writeFile(root+'battle-preview.bundle.js',output.replace(/[\t ]+$/gm,'').trimEnd()+'\n');
console.log('Uzi preview built with the existing V3 engine and locked PixiJS / GSAP.');
