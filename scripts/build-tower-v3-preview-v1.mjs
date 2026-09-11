import {build} from 'esbuild';
await build({entryPoints:['preview/infinite-tower-v3-v1/source/app.mjs'],outfile:'preview/infinite-tower-v3-v1/app.bundle.js',bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none'});
console.log('Tower entry built. Run build:v3-grid to rebuild every renderer consumer together.');
