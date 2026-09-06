import {build} from 'esbuild';
await build({entryPoints: ['preview/idle-v3-v1/source/idle-app.mjs'], bundle: true, minify: true, format: 'iife',
  target: ['es2022'], outfile: 'preview/idle-v3-v1/app.bundle.js', legalComments: 'none'});
console.log('Built independent idle preview. Production V3 bundle and live routes unchanged.');
