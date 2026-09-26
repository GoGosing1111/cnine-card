import {build} from 'esbuild';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ENGINE_BASE} from '../preview/sustained-hunt-v2/hunt-rules.mjs';
const base='preview/sustained-hunt-v2/';
const result=await build({entryPoints:['preview/project-v-v3/source/project-v-pixi-battle.src.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',metafile:true,
 outfile:base+'battle.bundle.js',plugins:[{name:'hunt-v2-extension',setup(b){b.onResolve({filter:/battle\/BattleEngine\.js$/},args=>{
   if(args.importer.replaceAll('\\','/').endsWith('/project-v-pixi-battle.src.js'))return {path:path.resolve(base+'source/HuntBattleEngine.js')};
 });}}]});
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const lock=JSON.parse(await fs.readFile('package-lock.json','utf8'));
await fs.writeFile(base+'engine-build.json',JSON.stringify({date:'2026-09-26',engineBase:ENGINE_BASE,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,
 serverHash:await hash('functions/_battle_v2_preview.js'),engineHash:await hash('preview/project-v-v3/source/battle/BattleEngine.js'),
 playbackHash:await hash('preview/project-v-v3/source/battle/BattleSuitSkillChipPlayback.js'),bundleHash:await hash(base+'battle.bundle.js'),
 commonInputs:Object.keys(result.metafile.inputs).filter(p=>p.includes('project-v-v3/source/')),legacyHuntInputs:Object.keys(result.metafile.inputs).filter(p=>p.includes('sustained-hunt-v1'))},null,2)+'\n');
console.log('Hunt V2 built with current canonical V3 engine, playback, roster and adapters.');
