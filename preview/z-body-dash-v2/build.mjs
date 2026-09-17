import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {previewExtension} from './preview-extension.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const hash=data=>createHash('sha256').update(data.replace(/\r\n/g,'\n')).digest('hex');
const controller='preview/project-v-v3/source/battle/ZBodySwordAnimation.js';
const result=await build({
  absWorkingDir:root,entryPoints:['preview/project-v-v3/source/project-v-pixi-battle.src.js'],
  outfile:path.join(here,'battle.bundle.js'),bundle:true,minify:true,format:'iife',target:['es2022'],legalComments:'none',metafile:true,
  define:{__CNINE_NATIVE_CONTINUOUS__:'true'},plugins:[previewExtension]
});
const inputs=Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/'));
const bundle=(await readFile(path.join(here,'battle.bundle.js'),'utf8')).replace(/[ \t]+$/gm,'');
await writeFile(path.join(here,'battle.bundle.js'),bundle);
const runtime={pixiCopies:inputs.filter(p=>p.endsWith('/pixi.js/lib/index.mjs')).length,gsapCopies:inputs.filter(p=>p.endsWith('/gsap/index.js')).length};
if(runtime.pixiCopies!==1||runtime.gsapCopies!==1)throw Error('Expected one shared Pixi/GSAP runtime: '+JSON.stringify(runtime));
await writeFile(path.join(here,'build-report.json'),JSON.stringify({status:'PREVIEW_ONLY',runtime,pixiVersion:'8.20.0',gsapVersion:'3.13.0',
  baseController:{file:controller,sha256:hash(await readFile(path.join(root,controller),'utf8'))},
  bundleSha256:hash(bundle),inputs:inputs.filter(p=>!p.includes('node_modules'))},null,2)+'\n');
console.log('Built Z dash preview with the live engine, one PixiJS and one GSAP runtime.');
