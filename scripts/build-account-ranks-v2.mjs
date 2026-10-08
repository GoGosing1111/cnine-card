import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {RANKS} from '../shared/account-ranks-v1.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'preview/fps-rank-square-fx-v1/assets/rank-chart-square-source-v3.png');
const original=await fs.readFile(source),sha256=createHash('sha256').update(original).digest('hex');
if(sha256!=='0a8acfb26f3ea2c9865133952ff73d451087185c73a88670fa78fa87eafe7b15')throw Error('Rank source changed');
const output=path.join(root,'assets/ui/account-ranks-v2');await fs.mkdir(output,{recursive:true});
const xs=[22,238,455,671,887,1104,1320],ys=[111,382,655];
const animation=['colonel','brigadier','major-general','lieutenant-general','general','marshal'];
const files=[];
for(const rank of RANKS){
  const rect={left:xs[rank.index%7],top:ys[Math.floor(rank.index/7)],width:196,height:196};
  for(const size of [96,384]){
    const name=`${rank.code.toLowerCase()}-${size}`,animated=rank.index>=15;
    await sharp(original).extract(rect).resize(size,size).webp({lossless:true}).toFile(path.join(output,name+(animated?'-still':'')+'.webp'));
    if(animated)await sharp(path.join(root,`preview/fps-rank-square-fx-v1/exports/${animation[rank.index-15]}-loop.webp`),{animated:true}).resize(size,size).webp({quality:90,effort:3}).toFile(path.join(output,name+'.webp'));
    const meta=await sharp(path.join(output,name+'.webp'),{animated:true}).metadata();
    if(meta.width!==size||(meta.pageHeight||meta.height)!==size||(animated&&meta.pages!==100))throw Error('Rank asset dimensions or animation failed: '+name);
    files.push({code:rank.code,file:name+'.webp',size,animated,frames:meta.pages||1,bytes:(await fs.stat(path.join(output,name+'.webp'))).size});
  }
}
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({version:'20261008',sourceSha256:sha256,ranks:21,animatedFrom:'COLONEL',loopSeconds:6,files},null,2)+'\n');
console.log('Created '+files.length+' rank assets and 12 still alternatives');
