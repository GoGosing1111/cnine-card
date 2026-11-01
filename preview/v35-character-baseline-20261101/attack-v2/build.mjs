import {build} from 'esbuild';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),repo=path.resolve(dir,'../../..');
const candidates=[path.join(repo,'preview/project-v-v3/source/battle/EffectScene.js'),path.join(repo,'output/revan-live-20261027/release-checkout/preview/project-v-v3/source/battle/EffectScene.js')];
let effectScene;for(const candidate of candidates){try{await fs.access(candidate);effectScene=candidate;break;}catch(e){if(e.code!=='ENOENT')throw e;}}
if(!effectScene)throw Error('Existing V3 EffectScene source is required; do not create a second renderer');
const result=await build({entryPoints:[path.join(dir,'review.src.mjs')],alias:{'@v3/effect-scene':effectScene},outfile:path.join(dir,'review.bundle.js'),bundle:true,minify:true,format:'iife',target:'es2022',metafile:true,legalComments:'inline'});
const copies=Object.keys(result.metafile.inputs).filter(x=>x.replaceAll('\\','/').endsWith('pixi.js/lib/index.mjs'));if(copies.length!==1)throw Error('Duplicate Pixi');
const source=path.join(path.dirname(effectScene),'BattleEngine.js');await fs.writeFile(path.join(dir,'qa/build.json'),JSON.stringify({v3EngineSource:source,sha256:createHash('sha256').update(await fs.readFile(source)).digest('hex'),pixiCopies:copies,spineRuntime:'4.3.13',productionModified:false},null,2));console.log('Shared V3 renderer build complete');
