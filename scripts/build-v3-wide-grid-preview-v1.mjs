import {build} from 'esbuild';
import path from 'node:path';

await build({entryPoints: ['preview/project-v-v3/source/project-v-pixi-battle.src.js'],
  bundle: true, minify: true, format: 'iife', target: ['es2022'], legalComments: 'none',
  outfile: 'preview/v3-wide-grid-v1/battle.bundle.js', plugins: [{name: 'preview-only-wide-grid', setup(bundler) {
    bundler.onResolve({filter: /battle\/BattleEngine\.js$/}, args => {
      if (args.importer.replaceAll('\\', '/').endsWith('/project-v-pixi-battle.src.js'))
        return {path: path.resolve('preview/v3-wide-grid-v1/source/WideGridBattleEngine.js')};
    });
  }}]});
await build({entryPoints: ['preview/v3-wide-grid-v1/source/app.mjs'], bundle: true, minify: true,
  format: 'iife', target: ['es2022'], legalComments: 'none', outfile: 'preview/v3-wide-grid-v1/app.bundle.js'});
console.log('Wide-grid comparison built. Live V3, account data and CMS unchanged.');
