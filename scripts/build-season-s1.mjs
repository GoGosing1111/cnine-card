import {build} from 'esbuild';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await build({absWorkingDir:root,entryPoints:['js/season-s1.js'],bundle:true,format:'iife',target:['es2020'],outfile:'js/season-s1.bundle.js',minify:true,legalComments:'none'});
console.log('Built season production UI.');
