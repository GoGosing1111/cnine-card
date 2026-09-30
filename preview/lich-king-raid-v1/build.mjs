import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['preview/lich-king-raid-v1/battle.src.js'],outfile:'preview/lich-king-raid-v1/battle.bundle.js',bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'none',metafile:true});
// Shader template line endings have no semantic whitespace. Keep generated diffs clean.
const out='preview/lich-king-raid-v1/battle.bundle.js';
await writeFile(out,(await readFile(out,'utf8')).replace(/[ \t]+$/gm,''));
const inputs=Object.keys(result.metafile.inputs);
if(inputs.some(x=>x.includes('node_modules/pixi.js')))throw new Error('Lich effects must use the live runtime Pixi objects');
if(inputs.some(x=>x.includes('source/battle/BattleEngine.js')))throw new Error('Lich adapter must reuse the live V3 runtime, not bundle another engine');
await writeFile('preview/lich-king-raid-v1/build-report.json',JSON.stringify({scope:'PREVIEW_AND_LIVE_TEST',entry:'battle.src.js',sharedEngine:'ProjectVBattleV3Live.ensureRuntime',sharedGrid:true,pixiCopies:inputs.filter(x=>x.endsWith('pixi.js/lib/index.mjs')).length,inputs:inputs.filter(x=>!x.includes('node_modules'))},null,2)+'\n');
console.log('Built Lich King preview/live adapter with the unchanged shared V3 renderer.');
