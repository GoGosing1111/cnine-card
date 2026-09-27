import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const dir=new URL('.',import.meta.url),root=new URL('../../',dir),sourceDir=new URL('../clan-avatar-hanbok-v1/',dir);
const source=JSON.parse(await readFile(new URL('manifest.json',sourceDir))),qa=JSON.parse(await readFile(new URL('asset-qa.json',sourceDir)));
const snapshot=JSON.parse(await readFile(new URL('before-images.json',dir)));
const sha=b=>createHash('sha256').update(b).digest('hex'),entries=[];
for(const entry of source.entries){
 const prior=snapshot.find(a=>a.code===entry.avatarCode);assert.ok(prior);
 const equipmentSource=new URL(entry.image,sourceDir),equipment=await readFile(equipmentSource),lobby=await readFile(new URL('assets/'+entry.id+'-lobby-source-art-v1.png',dir));
 assert.equal(sha(equipment),qa.files.find(f=>f.id===entry.id).sha256,'Preserve the prepared costume master');
 for(const bytes of [equipment,lobby]){const m=await sharp(bytes).metadata();assert.equal(m.width,1024);assert.equal(m.height,1536);}
 const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,border=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const alpha=data[(y*info.width+x)*4+3];if(alpha===0)clear++;if(alpha>=240)solid++;if(alpha>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(alpha>16&&(x===0||y===0||x===info.width-1||y===info.height-1))border++;}
 assert.ok(clear>info.width*info.height*.15&&solid>info.width*info.height*.1);assert.equal(border,0);
 left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
 const crop={left,top,width:right-left+1,height:bottom-top+1},old=await sharp(new URL(prior.equipment_image,root).pathname.replace(/^\/([A-Z]:)/i,'$1')).metadata();
 const canvas={width:old.width,height:old.height},scale=Math.min(1,(canvas.width-32)/crop.width,(canvas.height-70)/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale),padLeft=Math.floor((canvas.width-width)/2);
 const paths={lobbyImage:`preview/clan-avatar-hanbok-live-v1/assets/${entry.id}-lobby-v1-1024.webp`,lobbyMobileImage:`preview/clan-avatar-hanbok-live-v1/assets/${entry.id}-lobby-v1-640.webp`,equipmentImage:`preview/clan-avatar-hanbok-live-v1/assets/${entry.id}-equipment-v1-640.webp`};
 const body=await sharp(equipment).extract(crop).resize({width,height}).png().toBuffer();
 await sharp(body).extend({top:24,bottom:canvas.height-24-height,left:padLeft,right:canvas.width-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(new URL(paths.equipmentImage,root).pathname.replace(/^\/([A-Z]:)/i,'$1'));
 for(const [size,key] of [[1024,'lobbyImage'],[640,'lobbyMobileImage']])await sharp(lobby).resize({width:size}).webp({quality:90,effort:6}).toFile(new URL(paths[key],root).pathname.replace(/^\/([A-Z]:)/i,'$1'));
 const files={};for(const path of Object.values(paths)){const b=await readFile(new URL(path,root)),m=await sharp(b).metadata();files[path]={sha256:sha(b),bytes:b.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha};}
 entries.push({id:entry.id,code:entry.avatarCode,name:prior.name,caption:entry.caption,accent:entry.accent,...paths,equipmentSource:`preview/clan-avatar-hanbok-v1/${entry.image}`,equipmentSha256:sha(equipment),lobbySource:`preview/clan-avatar-hanbok-live-v1/assets/${entry.id}-lobby-source-art-v1.png`,lobbySha256:sha(lobby),runtime:{...canvas,crop,scale,bodyWidth:width,bodyHeight:height,top:24,bottom:canvas.height-24-height},alpha:{clear,solid,border},files});
}
await writeFile(new URL('manifest.json',dir),JSON.stringify({id:'clan-avatar-hanbok-live-v1',date:'2026-09-27',authorization:'현재 클랜 아바타 전체를 준비한 한복으로 교체. 장비창 리소스도 준비.',generator:'built-in image_gen (8 lobby scenes); prepared equipment masters retained',equipmentDerivatives:'Uniform resize and transparent padding using the previous per-character runtime canvas; no redrawing or background removal',entries},null,2)+'\n');
console.log('Built and checked '+entries.length+' matching lobby/equipment sets');
