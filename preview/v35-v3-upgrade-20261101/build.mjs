import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir=fileURLToPath(new URL('.',import.meta.url)),repo=path.resolve(dir,'../..');
const live=path.join(repo,'output/revan-live-20261027/release-checkout');
await fs.mkdir(path.join(dir,'qa'),{recursive:true});
const sources=['preview/project-v-v3/source/battle/BattleEngine.js','preview/project-v-v3/source/battle/MercenaryCombatPlayback.js','preview/project-v-v3/source/project-v-pixi-battle.src.js','js/battle-v3-live.js'];
const records=[];
for(const rel of sources){const data=await fs.readFile(path.join(live,rel));const remote=execFileSync('git',['show','origin/main:'+rel],{cwd:repo,windowsHide:true,maxBuffer:10e6});if(data.toString().replaceAll('\r\n','\n')!==remote.toString().replaceAll('\r\n','\n'))throw Error('Current source differs: '+rel);records.push({path:rel,sha256:createHash('sha256').update(data).digest('hex'),originMainNormalizedMatch:true});}
const result=await build({entryPoints:[path.join(dir,'workbench.src.mjs')],outfile:path.join(dir,'workbench.bundle.js'),bundle:true,minify:true,format:'iife',target:'es2022',metafile:true,legalComments:'inline',alias:{'@v3/core':path.join(live,'preview/project-v-v3/source/project-v-pixi-battle.src.js'),'@v3/character':path.join(live,'preview/project-v-v3/source/battle/BattleCharacter.js'),'pixi.js':path.join(repo,'node_modules/pixi.js/lib/index.mjs'),'gsap':path.join(repo,'node_modules/gsap/index.js')}});
const pixi=Object.keys(result.metafile.inputs).filter(p=>p.replaceAll('\\','/').endsWith('pixi.js/lib/index.mjs'));if(pixi.length!==1)throw Error('Expected one Pixi runtime');
await fs.writeFile(path.join(dir,'qa/build.json'),JSON.stringify({sourceCheckout:live,sourceRef:execFileSync('git',['rev-parse','origin/main'],{cwd:repo,windowsHide:true}).toString().trim(),sources:records,pixi,inputs:Object.keys(result.metafile.inputs),productionSourceModified:false},null,2));
console.log('Built current V3 + additive Spine adapter; one Pixi runtime.');
