import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('./',import.meta.url)),root=path.resolve(dir,'../..');
const require=createRequire(import.meta.url);
let build,moduleRoot;
try{({build}=require('esbuild'));moduleRoot=path.join(root,'node_modules');}catch{moduleRoot='C:/Users/User/Downloads/upload/cnine-card/node_modules';({build}=createRequire(moduleRoot+'/../package.json')('esbuild'));}
const result=await build({entryPoints:[dir+'source/preview.js'],bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',nodePaths:[moduleRoot],outfile:dir+'preview.bundle.js',metafile:true});
// Pixi shader template literals contain harmless trailing spaces; normalize the
// generated text so the new bundle passes the repository whitespace check.
await fs.writeFile(dir+'preview.bundle.js',(await fs.readFile(dir+'preview.bundle.js','utf8')).replace(/[\t ]+$/gm,''));
const inputs=Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/')),pixi=inputs.filter(p=>p.endsWith('/pixi.js/lib/index.mjs')).length,gsap=inputs.filter(p=>p.endsWith('/gsap/index.js')).length;
if(pixi!==1||gsap!==1)throw Error('Duplicate renderer or clock');
const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json')));
await fs.writeFile(dir+'build-report.json',JSON.stringify({previewOnly:true,pixiCopies:pixi,gsapCopies:gsap,pixiVersion:lock.packages['node_modules/pixi.js'].version,gsapVersion:lock.packages['node_modules/gsap'].version,bundleSha256:createHash('sha256').update(await fs.readFile(dir+'preview.bundle.js')).digest('hex'),sharedRuntime:inputs.filter(s=>s.includes('/project-v-v3/source/battle/')),liveEnabled:false},null,2)+'\n');
console.log('Bloodmoon preview built: existing V3 mercenary actor/card dock, one Pixi renderer and GSAP clock.');
