import {build} from 'esbuild';
import path from 'node:path';
await build({entryPoints:['preview/project-v-v3/source/project-v-pixi-battle.src.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',
  outfile:'preview/cow-room-v3-v1/battle.bundle.js',plugins:[{name:'cow-continuous-v3',setup(bundler){
    bundler.onResolve({filter:/battle\/BattleEngine\.js$/},args=>{
      if(args.importer.replaceAll('\\','/').endsWith('/project-v-pixi-battle.src.js'))return{path:path.resolve('preview/cow-room-v3-v1/source/CowBattleEngine.js')};
    });
  }}]});
await build({entryPoints:['preview/cow-room-v3-v1/source/app.mjs'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:'preview/cow-room-v3-v1/app.bundle.js'});
console.log('Cow room built with the shared V3 renderer and authoritative combat function.');
