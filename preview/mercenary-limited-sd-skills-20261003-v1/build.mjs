import {build} from 'esbuild';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('./',import.meta.url));
const previewAssetRoots={name:'standalone-preview-asset-roots',setup(builder){builder.onLoad({filter:/[/\\]BattleEngine\.js$/},async args=>({contents:(await fs.readFile(args.path,'utf8')).replace(/(['"])\.\.\/\.\.\/assets\//g,'$1/assets/'),loader:'js'}));}};
const result=await build({entryPoints:[root+'source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',outfile:root+'preview.bundle.js',metafile:true,plugins:[previewAssetRoots]});
await fs.writeFile(root+'preview.bundle.js',(await fs.readFile(root+'preview.bundle.js','utf8')).replace(/[\t ]+$/gm,'').trimEnd()+'\n');
const inputs=Object.keys(result.metafile.inputs).map(s=>s.replaceAll('\\','/')),pixi=inputs.filter(s=>s.endsWith('/pixi.js/lib/index.mjs')).length,gsap=inputs.filter(s=>s.endsWith('/gsap/index.js')).length;
if(pixi!==1||gsap!==1)throw Error('Duplicate renderer or clock');
const lock=JSON.parse(await fs.readFile(new URL('../../package-lock.json',import.meta.url)));
await fs.writeFile(root+'build-report.json',JSON.stringify({previewOnly:true,pixiCopies:pixi,gsapCopies:gsap,pixiVersion:lock.packages['node_modules/pixi.js'].version,gsapVersion:lock.packages['node_modules/gsap'].version,bundleSha256:createHash('sha256').update(await fs.readFile(root+'preview.bundle.js')).digest('hex'),sharedRuntime:inputs.filter(s=>s.includes('/project-v-v3/source/battle/'))},null,2)+'\n');console.log('Limited image review built with one shared Pixi renderer and GSAP clock.');
