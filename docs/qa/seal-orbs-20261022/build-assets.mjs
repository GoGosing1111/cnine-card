import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const sourceRoot='docs/qa/seal-orbs-20261022/sources';
const outputRoot='assets/ui/seal-battle/orbs-20261022';
await fs.mkdir(outputRoot,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const rows=[];
for(const [role,label] of [['attack','파괴 봉인구'],['guard','수호 봉인구'],['purify','정화 봉인구']]){
  const original=await fs.readFile(`${sourceRoot}/${role}.png`),metadata=await sharp(original).metadata();
  const stats=await sharp(original).stats();
  if(!metadata.hasAlpha||stats.channels[3].min!==0||stats.channels[3].max!==255)throw Error(role+' needs genuine transparent alpha');
  // Preserve every source pixel; only proportional resizing and transparent padding.
  const frame=await sharp(original).resize(704,704,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}})
    .extend({top:32,bottom:32,left:32,right:32,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const outputs=[];
  for(const extension of ['png','webp']){
    const bytes=extension==='png'?frame:await sharp(frame).webp({quality:91,alphaQuality:100}).toBuffer();
    const file=`${outputRoot}/${role}.${extension}`;
    await fs.writeFile(file,bytes);outputs.push({file,sha256:hash(bytes),bytes:bytes.length,width:768,height:768});
  }
  rows.push({role:role.toUpperCase(),name:label,source:{file:`${sourceRoot}/${role}.png`,sha256:hash(original),width:metadata.width,height:metadata.height},outputs});
}
await fs.writeFile('docs/qa/seal-orbs-20261022/manifest.json',JSON.stringify({tool:'built-in image_gen',visualApproval:'USER_REVIEW_PENDING',promptSet:'docs/qa/seal-orbs-20261022/prompts.json',processing:'proportional resize, transparent padding, PNG/WebP encoding only; no repainting or alpha reconstruction',assets:rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({role:r.role,outputs:r.outputs}))));
