import {build} from 'esbuild';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {MAGIC_S2_RULES} from '../../shared/magic-season2-v1.mjs';
import {makeReviewBattle} from './review-battles.mjs';
import {magicSeason2RegistrationDraft} from '../../functions/_magic_season2_catalog.js';
const root=path.resolve(import.meta.dirname,'../..'),base=import.meta.dirname;
const json=(file,value)=>fs.writeFileSync(path.join(base,file),JSON.stringify(value,null,2)+'\n');
json('registration-draft.json',magicSeason2RegistrationDraft());
const payloads=Object.keys(MAGIC_S2_RULES).flatMap(code=>[0,9].map(level=>makeReviewBattle(code,level)));
for(const p of payloads)if(!p.battleV2.result.timeline.some(e=>e.type==='MAGIC_SEASON2'&&e.magicCode===p.review.code))throw Error('MISSING_ACTUAL_TRIGGER:'+p.review.code);
json('battle-fixtures.json',{version:'20260930-v2',generatedBy:'Canonical V2 server engine',live:false,payloads});
const result=await build({absWorkingDir:root,entryPoints:['preview/magic-card-season2-v1/source/battle.mjs'],outfile:'preview/magic-card-season2-v1/battle.bundle.js',bundle:true,write:false,minify:true,format:'iife',target:['es2022'],legalComments:'none',metafile:true,define:{__CNINE_NATIVE_CONTINUOUS__:'false'},plugins:[{name:'s2-review-extension',setup(b){b.onResolve({filter:/battle\/BattleEngine\.js$/},args=>{
 if(args.importer.replaceAll('\\','/').endsWith('/project-v-pixi-battle.src.js'))return {path:path.join(base,'source/MagicSeason2Playback.js')};
});}}]});
const bundle=result.outputFiles[0].text.replace(/[\t ]+$/gm,'');
fs.writeFileSync(path.join(base,'battle.bundle.js'),bundle);
const inputs=Object.keys(result.metafile.inputs).map(s=>s.replaceAll('\\','/'));
if(!inputs.includes('preview/project-v-v3/source/battle/OccupiedGridLayout.js'))throw Error('LIVE_GRID_MISSING');
json('build-report.json',{version:'20260930-v2',runtimeEnabled:false,drawEnabled:false,engine:'preview/project-v-v3/source/battle/BattleEngine.js',pixiCopies:inputs.filter(p=>p.endsWith('/pixi.js/lib/index.mjs')).length,gsapCopies:inputs.filter(p=>p.endsWith('/gsap/index.js')).length,fixtureCases:payloads.length,
 bundleSha256:crypto.createHash('sha256').update(bundle).digest('hex'),inputs:inputs.filter(p=>!p.includes('node_modules'))});
console.log('Built 20 actual server fixtures and one S2-only preview bundle; live bundles unchanged.');
