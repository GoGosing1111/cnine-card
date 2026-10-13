import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const file=name=>new URL('./assets/'+name,import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const lobbyName='avatar-peach-kimono-source-art-v1.png',equipmentName='avatar-daeng-murasaki-equipment-source-art-v1.png';
const lobby=await readFile(file(lobbyName)),equipment=await readFile(file(equipmentName));
assert.equal(sha(lobby),'6cd628c2060fa2cf21fb298d653cfa4e1228c9598d3bc03d76f0d20edafe321b','Approved original changed');
assert.equal((await sharp(equipment).metadata()).hasAlpha,true,'Native image generation alpha required');
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,borderMax=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
 if(a>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
 if(!x||!y||x===info.width-1||y===info.height-1)borderMax=Math.max(borderMax,a);
}
assert.ok(clear/(info.width*info.height)>.4&&solid/(info.width*info.height)>.1&&borderMax<=8,'Native transparency or margins invalid');
const bounds={left,top,right,bottom};left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
const crop={left,top,width:right-left+1,height:bottom-top+1};
const scale=Math.min(1,608/crop.width,1040/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale),padLeft=Math.floor((640-width)/2);
// Runtime export only: preserve source PNGs and native alpha; uniform resizing and padding.
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
await sharp(body).extend({top:24,bottom:1088-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('avatar-daeng-murasaki-equipment-v1-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file('avatar-daeng-murasaki-lobby-v1-'+width+'.webp')));
const files={};for(const name of [lobbyName,equipmentName,'avatar-daeng-murasaki-equipment-v1-640.webp','avatar-daeng-murasaki-lobby-v1-1024.webp','avatar-daeng-murasaki-lobby-v1-640.webp']){
 const b=await readFile(file(name)),m=await sharp(b).metadata();files[name]={sha256:sha(b),bytes:b.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha};
}
const manifest={name:'댕무라사키',code:'DAENG_MURASAKI',serial:'A-35',status:'USER_RELEASE_AUTHORIZED',generator:'built-in image_gen',approval:{date:'2026-10-13',quote:'댕무라사키 아바타로 추가하고 한복디임2하고 동급 옵션으로 만들어',lobbySha256:sha(lobby)},equipmentPrompt:'equipment-prompt-v1.txt',processing:'Generated native-alpha cutout. Source PNGs preserved. Uniform resize, transparent padding and WebP export only.',alpha:{clearRatio:clear/(info.width*info.height),solidRatio:solid/(info.width*info.height),borderMax,bounds,crop},runtime:{width:640,height:1088,uniformScale:scale,bodyWidth:width,bodyHeight:height},files};
await writeFile(new URL('./runtime-manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
