import sharp from 'sharp';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url),root=new URL('../../',dir);
const jobs=JSON.parse(await readFile(new URL('vehicle-expansion-20261018-prompts.json',dir),'utf8')).jobs;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assets=[];
await mkdir(new URL('assets/vehicles-20261018/',dir),{recursive:true});
for(const job of jobs){
  const source=`assets/vehicles-20261018/${job.key}-source.png`;
  // Preserve ImageGen output byte-for-byte; only encode/slice deployment textures.
  try{await readFile(new URL(source,dir));}catch{await copyFile(job.generatedFile,new URL(source,dir));}
  const bytes=await readFile(new URL(source,dir)),meta=await sharp(bytes).metadata();
  if(!meta.hasAlpha)throw Error(`${job.key} requires actual transparency`);
  const outputs=job.key==='ui'?[
    {path:'assets/vehicles-20261018/frame.webp',rect:{left:38,top:50,width:1180,height:824}},
    {path:'assets/vehicles-20261018/button.webp',rect:{left:124,top:962,width:1005,height:180}}
  ]:[{path:`assets/vehicles-20261018/${job.key}-cutout.webp`}];
  for(const output of outputs){
    let pipeline=sharp(bytes);if(output.rect)pipeline=pipeline.extract(output.rect);
    const encoded=await pipeline.webp({lossless:true,effort:6}).toBuffer();
    await writeFile(new URL(output.path,dir),encoded);
    const {width,height}=await sharp(encoded).metadata();
    assets.push({...output,width,height,sha256:hash(encoded),source,sourceSha256:hash(bytes),method:'ImageGen alpha preserved; lossless WebP encoding and atlas slicing only'});
  }
}
const catalogue=[];
for(const path of ['assets/tire/crimson-aura-gullwing-v4.webp','assets/tire/silver-cyan-hypercar-aura-v2.png'])catalogue.push({path,sha256:hash(await readFile(new URL(path,root)))});
await writeFile(new URL('vehicle-expansion-20261018-assets.json',dir),JSON.stringify({date:'2026-10-18',tool:'built-in image_gen',prompts:'vehicle-expansion-20261018-prompts.json',catalogue,assets},null,2)+'\n');
console.log(JSON.stringify(assets.map(({path,width,height})=>({path,width,height}))));
