import {build} from 'esbuild';
await build({entryPoints:['preview/battle-suit-prestige-v1/source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2020'],legalComments:'none',outfile:'preview/battle-suit-prestige-v1/preview.bundle.js'});
console.log('Built prestige preview using the actual V3 AccountBattleUnit / BallisticVFX.');
