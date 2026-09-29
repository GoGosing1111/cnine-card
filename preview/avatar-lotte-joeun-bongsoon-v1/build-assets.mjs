import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const specs=[
 {stem:'avatar-lotte-joeun',lobbyVersion:1,lobbySha:'84f0bda5e9b6343cbb6912794cb957bc32d0dd2e9cccafa5af9c65741e86442f',equipmentSha:'348dc482e7382193da2633433db068169ed215e4e5c0fb11c6353951bb6c1100'},
 {stem:'avatar-lotte-bongsoon',lobbyVersion:2,lobbySha:'5f324918a693368bf05334eddb68a0f31546d03df192cff91860e9dfd800a536',equipmentSha:'a89f270404391116b0a3d39879dbe89012da37b284b2cfd83da469dd69308d42'}
];
const result={date:'2026-09-30',generator:'built-in image_gen',approval:'ㅇㅇ 장비창 ui 만들고 등록해',processing:'Native generated alpha retained; uniform resize, transparent padding and WebP encoding only. All source PNGs unchanged.',avatars:{}};
for(const s of specs){
 const file=name=>new URL('./assets/'+s.stem+'-'+name,import.meta.url);
 const lobbyName=`lobby-source-art-v${s.lobbyVersion}.png`,lobby=await readFile(file(lobbyName)),equipment=await readFile(file('equipment-source-art-v1.png'));
 if(sha(lobby)!==s.lobbySha||sha(equipment)!==s.equipmentSha)throw Error(s.stem+': source hash changed');
 const m=await sharp(equipment).metadata();if(!m.hasAlpha||m.width!==1024||m.height!==1536)throw Error(s.stem+': invalid equipment source');
 const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,borderMax=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
  if(a>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(x===0||y===0||x===info.width-1||y===info.height-1)borderMax=Math.max(borderMax,a);
 }
 if(clear/(info.width*info.height)<.65||solid/(info.width*info.height)<.12||borderMax>0)throw Error(s.stem+': invalid transparency or cropped silhouette');
 left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
 const crop={left,top,width:right-left+1,height:bottom-top+1},scale=Math.min(1,608/crop.width,1512/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
 const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer(),padLeft=Math.floor((640-width)/2);
 await sharp(body).extend({top:24,bottom:1664-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v1-640.webp')));
 for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file('lobby-v1-'+width+'.webp')));
 const files={};for(const name of [lobbyName,'equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp']){
  const bytes=await readFile(file(name)),meta=await sharp(bytes).metadata();files[s.stem+'-'+name]={sha256:sha(bytes),bytes:bytes.length,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha};
 }
 result.avatars[s.stem]={alpha:{clearPixels:clear,solidPixels:solid,borderMax,crop},runtime:{width:640,height:1664,uniformScale:scale,bodyWidth:width,bodyHeight:height},files};
}
await writeFile(new URL('./runtime-manifest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.avatars).map(([key,value])=>[key,{alpha:value.alpha,runtime:value.runtime}]))));
