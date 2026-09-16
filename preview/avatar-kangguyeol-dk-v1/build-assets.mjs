import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),base=new URL('./assets/',root),prefix='avatar-kangguyeol-dk';
const source=name=>new URL(prefix+'-'+name,base);
const lobby=await readFile(source('lobby-source-art-v1.png')),equipment=await readFile(source('equipment-source-art-v1.png'));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(lobby)!=='84527df89e6fe8803ac03de5ba59a81fe72641b145d9c14aca4ff73ba770653b'||hash(equipment)!=='24ad2631fbb1f235be420b0c212c534f3fa15e5e553357e5751461eb4b3f7aa9')throw Error('Approved avatar master changed');
for(const width of [1024,640])await sharp(lobby).resize({width}).webp({quality:90,effort:6}).toFile(source('lobby-v1-'+width+'.webp').pathname.replace(/^\/(\w:)/,'$1'));
// Fit the established equipment canvas using transparent side margins and foot clearance.
// Preserve every visible body pixel and its proportions; never resize the person unevenly.
const {data,info}=await sharp(equipment).ensureAlpha().raw().toBuffer({resolveWithObject:true});
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if((x<192||x>=832)&&data[(y*info.width+x)*4+3]>8)throw Error('Equipment crop would cut a visible edge');
await sharp(equipment).extract({left:192,top:0,width:640,height:1536}).extend({top:0,bottom:128,left:0,right:0,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:93,alphaQuality:100,effort:6}).toFile(source('equipment-v1-640.webp').pathname.replace(/^\/(\w:)/,'$1'));
const names=['lobby-source-art-v1.png','equipment-source-art-v1.png','lobby-v1-1024.webp','lobby-v1-640.webp','equipment-v1-640.webp'];
const files={};for(const n of names){const b=await readFile(source(n)),m=await sharp(b).metadata();files[prefix+'-'+n]={sha256:hash(b),bytes:b.length,width:m.width,height:m.height,hasAlpha:m.hasAlpha}}
const manifest={name:'DK 강구열',code:'KANGGUYEOL_DK',serial:'A-19',status:'USER_APPROVED_FOR_LIVE',generator:'built-in image_gen',identityReference:'assets/cards/강구열/01.webp',crestReference:'assets/ui/clan/marks/dk-clan-mark-v1.webp',releaseAuthorization:'그래 아바타 라이브에 배포하고 DK클랜에 11일 기간제로 지급해',durationDays:11,effectPolicy:'APPEARANCE_ONLY',files};
await writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest));
