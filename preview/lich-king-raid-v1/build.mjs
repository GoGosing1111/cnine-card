import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['preview/lich-king-raid-v1/battle.src.js'],outfile:'preview/lich-king-raid-v1/battle.bundle.js',bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'none',metafile:true});
// Shader template line endings have no semantic whitespace. Keep generated diffs clean.
const out='preview/lich-king-raid-v1/battle.bundle.js';
await writeFile(out,(await readFile(out,'utf8')).replace(/[ \t]+$/gm,''));
const inputs=Object.keys(result.metafile.inputs);
if(!inputs.includes('preview/project-v-v3/source/battle/OccupiedGridLayout.js'))throw new Error('Shared V3 grid is missing');
await writeFile('preview/lich-king-raid-v1/build-report.json',JSON.stringify({scope:'PREVIEW_AND_LIVE_TEST',entry:'battle.src.js',sharedEngine:'preview/project-v-v3/source/battle/BattleEngine.js',sharedGrid:true,pixiCopies:inputs.filter(x=>x.endsWith('pixi.js/lib/index.mjs')).length,inputs:inputs.filter(x=>!x.includes('node_modules'))},null,2)+'\n');
console.log('Built Lich King preview/live adapter with the unchanged shared V3 renderer.');
