import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';

export const evidenceRoot='C:/Users/User/.codex/visualizations/2026/10/25/01a170fb-166f-7250-a2e6-d351c185e8ee/general-jok-grip-fix-20261025';
export const originalRoot='preview/mercenary-general-jok-battle-20261022-v1';
export const inputs={
 ready:{file:`${originalRoot}/assets/frames/ready-v6.png`,crop:{left:520,top:145,width:240,height:155}},
 fire:{file:`${originalRoot}/assets/frames/fire-v7.png`,crop:{left:405,top:315,width:210,height:145}}
};
await fs.mkdir(evidenceRoot,{recursive:true});
const records={};
for(const [name,config] of Object.entries(inputs)){
 const bytes=await fs.readFile(config.file);
 const metadata=await sharp(bytes).metadata();
 records[name]={...config,sha256:createHash('sha256').update(bytes).digest('hex'),width:metadata.width,height:metadata.height};
 await sharp(bytes).extract(config.crop).resize(config.crop.width*4,config.crop.height*4).png().toFile(`${evidenceRoot}/${name}-before-detail.png`);
}
// Selection of original glove pixels only; this does not draw or correct anatomy.
const points='398,278 471,219 499,200 552,194 600,198 673,214 715,246 716,268 698,280 636,250 620,250 653,295 646,327 632,337 620,366 604,371 597,391 580,405 563,394 489,392 452,376 420,347 398,306';
const mask=Buffer.from(`<svg width="960" height="620"><polygon points="${points}" fill="white"/></svg>`);
await sharp(`${evidenceRoot}/ready-before-detail.png`).composite([{input:mask,blend:'dest-in'}]).png().toFile(`${evidenceRoot}/ready-glove-only.png`);
await fs.writeFile(`${evidenceRoot}/inputs.json`,JSON.stringify(records,null,2)+'\n');
console.log(JSON.stringify(records,null,2));
