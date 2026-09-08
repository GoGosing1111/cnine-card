import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const shared={name:'existing-shared-ui-runtime',setup(builder){
  builder.onResolve({filter:/^(pixi\.js|gsap)$/},args=>({path:args.path,namespace:'shared-ui'}));
  builder.onLoad({filter:/.*/,namespace:'shared-ui'},args=>({contents:args.path==='pixi.js'
    ?'export const {Application,Assets,BlurFilter,Container,Graphics,Rectangle,Sprite,Text}=globalThis.CNineUiFxVendor.pixi;'
    :'export const gsap=globalThis.CNineUiFxVendor.gsap;',loader:'js'}));
}};
const targets=[
  ['js/workshop-assembly-live-v2073.src.js','js/workshop-assembly-live-v2073.bundle.js'],
  ['js/workshop-assembly-fx-v2073.src.js','js/workshop-assembly-fx-v2073.bundle.js'],
  ['preview/workshop-assembly-v1/source/preview.js','preview/workshop-assembly-v1/assembly.bundle.js']
];
for(const [input,output]of targets)await build({entryPoints:[input],outfile:output,bundle:true,minify:true,format:'iife',target:['es2020'],plugins:[shared],legalComments:'none'});
const hash=async file=>createHash('sha256').update((await readFile(file,'utf8')).replace(/\r\n/g,'\n')).digest('hex');
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const report={version:'2073-assembly-live',runtimeConnected:true,artRegenerated:false,codeHashNormalization:'UTF-8 / LF',
  versions:{pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version},
  sharedVendor:'/js/ui-fx-vendor-v2045.bundle.js',outputs:await Promise.all(targets.map(async([source,path])=>({source,path,sha256:await hash(path)})))};
await writeFile('preview/workshop-assembly-v1/live-build-report.json',JSON.stringify(report,null,2)+'\n');
for(const file of ['asset-manifest.json','build-report.json']){
  const path='preview/workshop-assembly-v1/'+file,meta=JSON.parse(await readFile(path,'utf8'));
  meta.previewOnly=false;meta.runtimeConnected=true;
  if(file==='build-report.json')meta.bundleSha256=await hash('preview/workshop-assembly-v1/assembly.bundle.js');
  await writeFile(path,JSON.stringify(meta,null,2)+'\n');
}
console.log('Workshop live/FX/preview bundles rebuilt from source; approved artwork unchanged.');
