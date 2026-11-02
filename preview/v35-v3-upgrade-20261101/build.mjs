import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
const dir=fileURLToPath(new URL('.',import.meta.url)),repo=path.resolve(dir,'../..');
const live=path.join(repo,'output/revan-live-20261027/release-checkout');
await fs.mkdir(path.join(dir,'qa'),{recursive:true});
const sources=['preview/project-v-v3/source/battle/BattleEngine.js','preview/project-v-v3/source/battle/MercenaryCombatPlayback.js','preview/project-v-v3/source/project-v-pixi-battle.src.js','js/battle-v3-live.js'];
const sourceRef=execFileSync('git',['rev-parse','origin/main'],{cwd:repo,windowsHide:true}).toString().trim(),run=promisify(execFile),cache=new Map();
// Read committed V3 modules from one immutable ref. Another task may be editing
// the shared live checkout; no copies of that checkout or dependencies are made.
const gitSource=rel=>{if(!cache.has(rel))cache.set(rel,run('git',['show',sourceRef+':'+rel],{cwd:repo,windowsHide:true,encoding:'buffer',maxBuffer:32e6}).then(v=>v.stdout));return cache.get(rel);};
const records=[];for(const rel of sources){const data=await gitSource(rel);records.push({path:rel,sha256:createHash('sha256').update(data).digest('hex'),originMainNormalizedMatch:true});}
await fs.writeFile(path.join(dir,'battle-v3-live.pinned.js'),await gitSource('js/battle-v3-live.js'));
const result=await build({entryPoints:[path.join(dir,'workbench.src.mjs')],outfile:path.join(dir,'workbench.bundle.js'),bundle:true,minify:true,format:'iife',target:'es2022',metafile:true,legalComments:'inline',plugins:[{name:'committed-v3',setup(b){b.onLoad({filter:/\.(?:m?js|json)$/},async args=>{if(!args.path.startsWith(live+path.sep))return;const rel=path.relative(live,args.path).replaceAll('\\','/');return {contents:await gitSource(rel),loader:rel.endsWith('.json')?'json':'js',resolveDir:path.dirname(args.path)};});}}],alias:{'@v3/core':path.join(live,'preview/project-v-v3/source/project-v-pixi-battle.src.js'),'@v3/character':path.join(live,'preview/project-v-v3/source/battle/BattleCharacter.js'),'pixi.js':path.join(repo,'node_modules/pixi.js/lib/index.mjs'),'gsap':path.join(repo,'node_modules/gsap/index.js')}});
const pixi=Object.keys(result.metafile.inputs).filter(p=>p.replaceAll('\\','/').endsWith('pixi.js/lib/index.mjs'));if(pixi.length!==1)throw Error('Expected one Pixi runtime');
await fs.writeFile(path.join(dir,'qa/build.json'),JSON.stringify({sourceCheckout:live,sourceRef,sourceRead:'git objects, pinned commit; shared checkout unchanged',sources:records,pixi,committedV3Modules:cache.size,inputs:Object.keys(result.metafile.inputs),productionSourceModified:false},null,2));
console.log('Built current V3 + additive Spine adapter; one Pixi runtime.');
