import {build} from 'esbuild';
import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url));
const names=['helicopter','rotor','rocket','exhaust','smoke','dust','cinder','flash'];
// Mechanical atlas slicing only. Creative source pixels are never repainted or keyed.
await mkdir(path.join(dir,'assets/textures'),{recursive:true});
const atlas=path.join(dir,'assets/generated/ordnance-atlas.png');
const meta=await sharp(atlas).metadata();
for(const [i,name] of names.entries()){
  const left=Math.round(i%4*meta.width/4),top=Math.round(Math.floor(i/4)*meta.height/2);
  const right=Math.round((i%4+1)*meta.width/4),bottom=Math.round((Math.floor(i/4)+1)*meta.height/2);
  const cell=await sharp(atlas).extract({left,top,width:right-left,height:bottom-top}).png().toBuffer();
  await sharp(cell).trim({threshold:8}).webp({lossless:true,effort:6}).toFile(path.join(dir,`assets/textures/${name}.webp`));
}
// Align every frame to its own measured ground-contact row. This is atlas
// metadata, not repainted source pixels. Empty alpha gutters must stay empty.
const explosion=await sharp(path.join(dir,'assets/generated/explosion-atlas.png')).raw().toBuffer({resolveWithObject:true});
if(explosion.info.channels!==4||explosion.info.width/6!==explosion.info.height/4)throw new Error('Expected 6×4 square RGBA explosion atlas');
const size=explosion.info.width/6,origins=[];
for(let i=0;i<24;i++){
  let bottom=0,edgeMax=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const alpha=explosion.data[((Math.floor(i/6)*size+y)*explosion.info.width+i%6*size+x)*4+3];
    if(alpha>16)bottom=Math.max(bottom,y);
    if(x<2||y<2||x>=size-2||y>=size-2)edgeMax=Math.max(edgeMax,alpha);
  }
  if(edgeMax>4)throw new Error(`Explosion frame ${i} has visible pixels at atlas cell boundary`);
  origins.push({x:.5,y:Math.max(.5,(bottom+1)/size),edgeAlphaMax:edgeMax});
}
await writeFile(path.join(dir,'assets/textures/explosion-origins.json'),JSON.stringify(origins,null,2)+'\n');
await sharp(path.join(dir,'assets/generated/explosion-atlas.png')).webp({lossless:true,effort:6}).toFile(path.join(dir,'assets/textures/explosion-atlas.webp'));
await build({entryPoints:[path.join(dir,'source/skill-chip-lab.src.js')],bundle:true,minify:true,format:'iife',outfile:path.join(dir,'skill-chip-lab.bundle.js'),legalComments:'eof',metafile:true}).then(async result=>{
  const bundlePath=path.join(dir,'skill-chip-lab.bundle.js');
  // Pixi embeds multiline GLSL/WGSL source; normalize insignificant EOL spaces.
  const bundle=(await readFile(bundlePath,'utf8')).replace(/[ \t]+$/gm,'');
  await writeFile(bundlePath,bundle);
  const inputs=Object.keys(result.metafile.inputs).map(p=>p.replaceAll('\\','/'));
  const report={engineSource:'preview/project-v-v3/source/project-v-pixi-battle.src.js',pixiCopies:inputs.filter(p=>p.endsWith('/pixi.js/lib/index.mjs')).length,inputs:inputs.filter(p=>!p.includes('node_modules')),outputBytes:Buffer.byteLength(bundle)};
  await writeFile(path.join(dir,'build-report.json'),JSON.stringify(report,null,2)+'\n');
});
console.log('Isolated V3 skill-chip preview built. Live bundle and routes unchanged.');
