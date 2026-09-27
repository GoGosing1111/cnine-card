// User-requested local artwork correction; run alone to rebuild only Joeun.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const dir=new URL('.',import.meta.url),root=new URL('../../',dir);
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(new URL('manifest.json',dir)));
const entry=manifest.entries.find(e=>e.code==='T1_JOEUN');assert.ok(entry);
const untouched=JSON.stringify(manifest.entries.filter(e=>e!==entry));
for(const [path,hash] of [
 ['preview/clan-avatar-hanbok-v1/assets/joeun-hanbok-v1.png','41ad9b80ab58a9d1af1131cf9076bf23458cc8b13d5ade2242a7878caf1f7d99'],
 ['preview/avatar-clan-hanbok-v1/assets/joeun-lobby-source-art-v1.png','fbc44d21f41466935726a73e94dcc8af59150cac15f7e0df3c080027b49b331d']
])assert.equal(sha(await readFile(new URL(path,root))),hash,'Original V1 artwork stays preserved');
const equipmentSource='preview/avatar-clan-hanbok-v1/assets/joeun-equipment-source-art-v3.png';
const lobbySource='preview/avatar-clan-hanbok-v1/assets/joeun-lobby-source-art-v3.png';
const equipment=await readFile(new URL(equipmentSource,root)),lobby=await readFile(new URL(lobbySource,root));
for(const bytes of [equipment,lobby]){const m=await sharp(bytes).metadata();assert.equal(m.width,1024);assert.equal(m.height,1536);}
assert.equal((await sharp(equipment).metadata()).hasAlpha,true);
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=-1,bottom=-1,clear=0,solid=0,border=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
 const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a>=240)solid++;
 if(a>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(a>16&&(x===0||y===0||x===info.width-1||y===info.height-1))border++;
}
assert.ok(clear>info.width*info.height*.15&&solid>info.width*info.height*.1);assert.equal(border,0);
left=Math.max(0,left-8);top=Math.max(0,top-8);right=Math.min(info.width-1,right+8);bottom=Math.min(info.height-1,bottom+8);
const crop={left,top,width:right-left+1,height:bottom-top+1};
const canvas={width:entry.runtime.width,height:entry.runtime.height};
const scale=Math.min(1,(canvas.width-32)/crop.width,(canvas.height-70)/crop.height);
const width=Math.round(crop.width*scale),height=Math.round(crop.height*scale),padLeft=Math.floor((canvas.width-width)/2);
const body=await sharp(equipment).extract(crop).resize({width,height}).png().toBuffer();
await sharp(body).extend({top:24,bottom:canvas.height-24-height,left:padLeft,right:canvas.width-width-padLeft,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(fileURLToPath(new URL(entry.equipmentImage,root)));
for(const [size,key] of [[1024,'lobbyImage'],[640,'lobbyMobileImage']])await sharp(lobby).removeAlpha().resize({width:size}).webp({quality:90,effort:6}).toFile(fileURLToPath(new URL(entry[key],root)));
const files={};for(const path of [entry.lobbyImage,entry.lobbyMobileImage,entry.equipmentImage]){const b=await readFile(new URL(path,root)),m=await sharp(b).metadata();files[path]={sha256:sha(b),bytes:b.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha};}
Object.assign(entry,{equipmentSource,equipmentSha256:sha(equipment),lobbySource,lobbySha256:sha(lobby),runtime:{...canvas,crop,scale,bodyWidth:width,bodyHeight:height,top:24,bottom:canvas.height-24-height},alpha:{clear,solid,border},files,artRevision:{id:'joeun-balance-v3',date:'2026-09-28',authorization:'한복 조은 좌우 균형을 위해 상체 정면 재작화',generator:'built-in image_gen',prompts:'joeun-balance-v3.prompts.json'}});
assert.equal(JSON.stringify(manifest.entries.filter(e=>e!==entry)),untouched,'Other avatars must remain untouched');
await writeFile(new URL('manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({code:entry.code,sourceHashes:[entry.equipmentSha256,entry.lobbySha256],files,runtime:entry.runtime,alpha:entry.alpha,otherEntriesUnchanged:true},null,2));
