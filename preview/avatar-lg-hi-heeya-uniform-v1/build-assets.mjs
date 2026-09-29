import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const file=name=>new URL('./assets/avatar-lg-hi-heeya-'+name,import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const reference=new URL('../../assets/ui/project-v/mercenaries/approved-20260927/heeya-nurse-source-art-v1.png',import.meta.url);
assert.equal(sha(await readFile(reference)),'67bc6a9961423be7a379ac46bfd4ac004b53503c238a6d345e60ae58d327171b','Original nurse reference changed');
const lobby=await readFile(file('lobby-source-art-v2.png')),equipment=await readFile(file('equipment-source-art-v2.png'));
assert.equal(sha(lobby),'dc4cd9cfa2a482bf9499463ab5cae58bbc403ac503af1cfeccc7eddbb39c7b42','User-approved V2 lobby must remain unchanged');
const lm=await sharp(lobby).metadata(),em=await sharp(equipment).metadata();
assert.equal(lm.width*3,lm.height*2,'Lobby must be 2:3');assert.ok(em.hasAlpha,'Image generation must provide native alpha');
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,borderMax=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
  if(a>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(x===0||y===0||x===info.width-1||y===info.height-1)borderMax=Math.max(borderMax,a);
}
assert.ok(clear/(info.width*info.height)>.4&&solid/(info.width*info.height)>.08&&borderMax<=8,'Transparent silhouette or edge margins invalid');
const bounds={left,top,right,bottom};left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
const crop={left,top,width:right-left+1,height:bottom-top+1},scale=Math.min(1,608/crop.width,1040/crop.height),width=Math.round(crop.width*scale),height=Math.round(crop.height*scale);
// Runtime export only: original native-alpha PNGs and body proportions remain intact.
const body=await sharp(equipment).extract(crop).resize({width,height,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer(),padLeft=Math.floor((640-width)/2);
await sharp(body).extend({top:24,bottom:1088-24-height,left:padLeft,right:640-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(file('equipment-v2-640.webp')));
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(fileURLToPath(file('lobby-v2-'+width+'.webp')));
const files={};for(const name of ['lobby-source-art-v1.png','lobby-source-art-v2.png','equipment-source-art-v2.png','lobby-v2-1024.webp','lobby-v2-640.webp','equipment-v2-640.webp']){
  const b=await readFile(file(name)),m=await sharp(b).metadata();files['avatar-lg-hi-heeya-'+name]={sha256:sha(b),bytes:b.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha};
}
const result={status:'LOBBY_APPROVED_EQUIPMENT_REVIEW',currentVersion:2,name:'LG 하이희야',generator:'built-in image_gen',
  approval:{date:'2026-09-30',quote:'이정도가 적당해',image:'assets/user-approved-lobby-reference.png',sha256:sha(await readFile(new URL('./assets/user-approved-lobby-reference.png',import.meta.url))),note:'User selected V2 including its physique, long hair and crossed-leg pose. No additional pose or body changes.'},
  reference:{path:'assets/ui/project-v/mercenaries/approved-20260927/heeya-nurse-source-art-v1.png',sha256:sha(await readFile(reference)),role:'Face reference; full body preservation superseded by user revision'},
  revision:'V1 rejected. V2 selected by the user after full-body slimming, longer hair and changed arm pose. Equipment cutout preserves the selected V2.',
  processing:'Source PNGs unchanged. Native alpha retained; uniform resizing, transparent padding and WebP export only. No coded background removal or anatomical edits.',
  alpha:{clearPixels:clear,solidPixels:solid,borderMax,bounds,crop},runtime:{width:640,height:1088,uniformScale:scale,bodyWidth:width,bodyHeight:height},files};
await writeFile(new URL('./runtime-manifest.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
