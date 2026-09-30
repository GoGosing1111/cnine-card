import fs from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const root=path.dirname(fileURLToPath(import.meta.url));
export const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
export async function weaponAt({scale,angle,grip,fillGripOcclusion=false}){
 const record=JSON.parse(await fs.readFile(path.join(root,'assets/weapon/sword-original.json'),'utf8'));
 const bytes=await fs.readFile(path.join(root,record.file));
 if(sha(bytes)!==record.sha256)throw Error('Locked sword changed');
 const w=Math.round(record.crop.width*scale),h=Math.round(record.crop.height*scale);
 // The extracted original has a transparent hole where its old hand stood.
 // Two smaller adjacent gloves can expose that hole. Place a copy of the
 // original straight wrapped-hilt material BEHIND the unchanged sword pixels.
 // This changes neither the master file nor blade/guard/pommel geometry.
 let composite=bytes,hiltUnderlay=null;
 if(fillGripOcclusion){
  const donor={left:142,top:80,width:23,height:30},strip=await sharp(bytes).extract(donor).png().toBuffer();
  const patch=await sharp({create:{width:23,height:90,channels:4,background:'#00000000'}}).composite([0,30,60].map(top=>({input:strip,left:0,top}))).png().toBuffer();
  composite=await sharp(bytes).composite([{input:patch,left:142,top:114,blend:'dest-over'}]).png().toBuffer();
  hiltUnderlay={source:record.file,sourceSha256:record.sha256,donor,placement:{left:142,top:114,width:23,height:90},method:'ORIGINAL_STRAIGHT_HILT_PIXELS_COPIED_BEHIND_EXISTING_HAND_HOLE'};
 }
 const input=await sharp(composite).resize(w,h).png().toBuffer();
 const rotated=await sharp(input).rotate(angle,{background:'#00000000'}).png().toBuffer();
 const meta=await sharp(rotated).metadata(),r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 const gx=(record.grip[0]*w/record.crop.width-w/2),gy=(record.grip[1]*h/record.crop.height-h/2);
 const pivot=[meta.width/2+c*gx-s*gy,meta.height/2+s*gx+c*gy];
 return {input:rotated,left:Math.round(grip[0]-pivot[0]),top:Math.round(grip[1]-pivot[1]),width:meta.width,height:meta.height,record:{original:record.file,sha256:record.sha256,scale,angle,grip,pivot,rigid:true,...(hiltUnderlay?{hiltUnderlay}:{})}};
}
export async function foreground(image,polygon){
 const {data,info}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const mask=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}"><polygon points="${polygon.map(p=>p.join(',')).join(' ')}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer();
 for(let p=0;p<info.width*info.height;p++){data[p*4+3]=Math.round(data[p*4+3]*mask[p*4+3]/255);if(!data[p*4+3])data.fill(0,p*4,p*4+4);}
 return sharp(data,{raw:info}).png().toBuffer();
}
export async function cleanAlpha(bytes){
 const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let p=0;p<info.width*info.height;p++)if(!data[p*4+3])data.fill(0,p*4,p*4+4);
 return sharp(data,{raw:info}).png().toBuffer();
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file='assets/source/body-low-guard-clean-v1.png',body=await cleanAlpha(await fs.readFile(path.join(root,file)));
 const hand=await foreground(body,[[445,465],[485,463],[511,473],[521,489],[521,535],[496,552],[468,546],[448,533],[439,504],[441,485]]);
 const origin=[32,48],grip=[489+origin[0],509+origin[1]],weapon=await weaponAt({scale:1,angle:-32,grip});
 const final=await sharp({create:{width:1408,height:1664,channels:4,background:'#00000000'}}).composite([{input:body,left:origin[0],top:origin[1]},{input:weapon.input,left:weapon.left,top:weapon.top},{input:hand,left:origin[0],top:origin[1]}]).png().toBuffer();
 await fs.writeFile(path.join(root,'assets/knight-sd-v6-original-sword.png'),final);
 await fs.writeFile(path.join(root,'assets/knight-sd-v6-original-sword.json'),JSON.stringify({body:file,bodySha256:sha(await fs.readFile(path.join(root,file))),weapon:weapon.record,handForeground:'EXACT_BODY_GLOVE_PIXELS',feet:[origin[0]+612,origin[1]+1462],status:'USER_REVIEW_PENDING'},null,2)+'\n');
 console.log(JSON.stringify({output:'assets/knight-sd-v6-original-sword.png',...weapon.record}));
}
