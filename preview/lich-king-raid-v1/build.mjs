import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['preview/lich-king-raid-v1/battle.src.js'],outfile:'preview/lich-king-raid-v1/battle.bundle.js',bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'none',metafile:true});
const inputs=Object.keys(result.metafile.inputs);
if(!inputs.includes('preview/project-v-v3/source/battle/OccupiedGridLayout.js'))throw new Error('Shared V3 grid is missing');
await writeFile('preview/lich-king-raid-v1/build-report.json',JSON.stringify({scope:'LOCAL_REVIEW_ONLY',entry:'battle.src.js',sharedEngine:'preview/project-v-v3/source/battle/BattleEngine.js',sharedGrid:true,pixiCopies:inputs.filter(x=>x.endsWith('pixi.js/lib/index.mjs')).length,inputs:inputs.filter(x=>!x.includes('node_modules'))},null,2)+'\n');
console.log('Built Lich King review with the unchanged shared V3 renderer.');
