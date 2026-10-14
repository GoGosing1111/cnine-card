import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SHIRANUI_ART} from '../shared/mercenary-shiranui-v1.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase(),entries=[];
// Mechanical thumbnails; the approved source and battle atlas remain byte-identical.
for(const [kind,source,expected,widths]of [['art',SHIRANUI_ART.sourceArt,SHIRANUI_ART.sourceArtSha256,[320,640]],['sd',SHIRANUI_ART.battleSprite,SHIRANUI_ART.battleSpriteSha256,[640]]]){
 const input=await fs.readFile(source);if(hash(input)!==expected)throw Error('Approved source hash mismatch');
 for(const width of widths){
  const file=`assets/ui/project-v/mercenaries/codex-v1/v-987-${kind}-${width}.webp`;
  const buffer=await sharp(input).resize({width,withoutEnlargement:true}).webp({quality:kind==='art'?88:90,effort:5}).toBuffer();
  await fs.writeFile(file,buffer);entries.push({file,source,sourceSha256:expected,sha256:hash(buffer),width,bytes:buffer.length});
 }
}
await fs.writeFile('assets/ui/project-v/mercenaries/shiranui-20261015/media.json',JSON.stringify({originalsModified:false,entries},null,2)+'\n');
console.log('Built Shiranui list/art/SD derivatives; approved originals preserved.');
