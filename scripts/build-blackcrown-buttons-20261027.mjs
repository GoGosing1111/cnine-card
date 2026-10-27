import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dir='assets/ui/packs/black-crown-20261027-v1',qa='docs/qa/blackcrown-off-ss10-20261027';
const files=['exec-2e600d02-5c84-4441-b2fb-b7e23ccd5993.png','exec-dd48d51f-4fdb-40d8-b027-c6d0e7184ff4.png'],names=['button-crown-gold-v3','button-crown-obsidian-v3'],report=[];
const exclusions=JSON.parse(fs.readFileSync('scripts/blackcrown-authoring-only-20261027.json','utf8'));
for(let i=0;i<files.length;i++){
 const source='C:/Users/User/.codex/generated_images/01a17ab9-a03a-79f2-bb14-19ce5c1ac967/'+files[i],raw=dir+'/'+names[i]+'-source.png',output=dir+'/'+names[i]+'.webp';
 if(!fs.existsSync(raw))fs.copyFileSync(source,raw);
 const metadata=await sharp(raw).metadata();if(!metadata.hasAlpha)throw Error('Expected transparent generated original');
 await sharp(raw).trim().resize({width:960}).webp({quality:94,alphaQuality:100}).toFile(output);
 report.push({source:raw,output,sourceSha256:createHash('sha256').update(fs.readFileSync(raw)).digest('hex'),outputSha256:createHash('sha256').update(fs.readFileSync(output)).digest('hex'),metadata:await sharp(output).metadata()});
 if(!exclusions.includes(raw))exclusions.push(raw);
}
fs.writeFileSync('scripts/blackcrown-authoring-only-20261027.json',JSON.stringify(exclusions.sort(),null,2)+'\n');
fs.writeFileSync(qa+'/button-assets.json',JSON.stringify({tool:'built-in image_gen',processing:'Preserved source; alpha trim, proportional resize and WebP encoding only',assets:report},null,2)+'\n');
console.log(JSON.stringify(report.map(({output,metadata})=>({output,width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha}))));
