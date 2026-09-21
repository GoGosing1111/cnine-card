import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('.',import.meta.url));
const result=await build({entryPoints:[root+'source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:root+'preview.bundle.js',write:false});
await writeFile(root+'preview.bundle.js',result.outputFiles[0].text.replace(/[ \t]+$/gm,''));
console.log('BikiniJoeun preview built using the shared V3 engine, PixiJS and GSAP.');
