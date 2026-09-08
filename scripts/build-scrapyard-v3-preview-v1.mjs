import {build} from 'esbuild';
import path from 'node:path';

// Bundle the canonical V3 entry once, substituting only its engine constructor
// with a preview-only subclass. The operating V3 bundle remains byte-identical.
await build({entryPoints: ['preview/project-v-v3/source/project-v-pixi-battle.src.js'],
  bundle: true, minify: true, format: 'iife', target: ['es2022'], legalComments: 'none',
  outfile: 'preview/scrapyard-v3-v1/battle.bundle.js', plugins: [{name: 'isolated-scrapyard-extension', setup(bundler) {
    bundler.onResolve({filter: /battle\/BattleEngine\.js$/}, args => {
      if (args.importer.replaceAll('\\', '/').endsWith('/project-v-pixi-battle.src.js')) {
        return {path: path.resolve('preview/scrapyard-v3-v1/source/ScrapyardBattleEngine.js')};
      }
    });
  }}]});
await build({entryPoints: ['preview/scrapyard-v3-v1/source/app.mjs'], bundle: true, minify: true,
  format: 'iife', target: ['es2022'], legalComments: 'none', outfile: 'preview/scrapyard-v3-v1/app.bundle.js'});
console.log('Scrapyard preview built. Live V3 bundle, routes, CMS and economy unchanged.');
