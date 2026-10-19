import sharp from 'sharp';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ICON_CHOICE_CARDS} from '../shared/icon-card-choice-v1.mjs';
const dir='assets/items/icon-card-choice-20261020',manifest=JSON.parse(readFileSync(dir+'/manifest.json','utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
manifest.portraits=[];
for(const card of ICON_CHOICE_CARDS){
 const output=dir+'/'+card.code.toLowerCase()+'.webp';
 await sharp(card.sourceArt).resize(480,720,{fit:'inside',withoutEnlargement:true}).webp({quality:90}).toFile(output);
 manifest.portraits.push({code:card.code,source:card.sourceArt,sourceSha256:hash(card.sourceArt),output,sha256:hash(output),bytes:readFileSync(output).length});
}
writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({portraits:manifest.portraits.length,bytes:manifest.portraits.reduce((n,p)=>n+p.bytes,0)}));
