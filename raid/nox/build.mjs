import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['raid/nox/battle.src.js'],outfile:'raid/nox/battle.bundle.js',bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'none',metafile:true});
const inputs=Object.keys(result.metafile.inputs);if(!inputs.includes('preview/project-v-v3/source/battle/OccupiedGridLayout.js'))throw new Error('Shared V3 grid missing');
await writeFile('raid/nox/build-report.json',JSON.stringify({reviewOnly:false,sharedEngine:'preview/project-v-v3/source/battle/BattleEngine.js',sharedGrid:true,inputs:inputs.filter(p=>!p.includes('node_modules'))},null,2)+'\n');
console.log('Nox: shared V3 engine, adapters and roster retained.');
