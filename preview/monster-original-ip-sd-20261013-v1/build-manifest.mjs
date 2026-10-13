import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const root=process.cwd(),require=createRequire(path.join(root,'package.json')),sharp=require('sharp');
const src='preview/monster-original-ip-20261013-v1',dest='preview/monster-original-ip-sd-20261013-v1';
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),write=(p,v)=>fs.writeFileSync(path.join(root,p),JSON.stringify(v,null,2)+'\n');
const source=read(src+'/manifest.json'),approval=read(src+'/approval-20261013.json'),sha=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const partial=process.argv.includes('--partial'),entries=[],missing=[],qa=[];
for(const e of source.entries){
 const original=fs.readFileSync(path.join(root,e.sourceArt.path));
 if(sha(original)!==approval.entries.find(a=>a.key===e.key)?.sha256)throw Error('Approved art changed: '+e.key);
 const versions=fs.readdirSync(path.join(root,dest,'assets')).filter(f=>f.startsWith(e.key+'-sd-v')&&f.endsWith('.png')).sort((a,b)=>Number(a.match(/-v(\d+)/)[1])-Number(b.match(/-v(\d+)/)[1]));
 if(!versions.length){missing.push(e.key);continue}
 const file=versions.at(-1),p=dest+'/assets/'+file,b=fs.readFileSync(path.join(root,p)),m=await sharp(b).metadata();
 const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});let minX=info.width,minY=info.height,maxX=-1,maxY=-1,zeros=0,opaque=0,edge=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)zeros++;if(a>=240)opaque++;if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(x===0||x===info.width-1||y===0||y===info.height-1)edge++}}
 const quality={hasTrueAlpha:m.hasAlpha&&zeros>info.width*info.height*.2,nonEmpty:opaque>info.width*info.height*.1,notTouchingCanvas:edge===0,square:m.width===m.height,transparentPixelFraction:+(zeros/(info.width*info.height)).toFixed(6),alphaThreshold:16,alphaBounds:{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1},margins:{left:minX,top:minY,right:info.width-maxX-1,bottom:info.height-maxY-1},edgePixels:edge,technicalPass:false};
 quality.technicalPass=quality.hasTrueAlpha&&quality.nonEmpty&&quality.notTouchingCanvas&&quality.square;
 if(!quality.technicalPass)throw Error('Technical QA failed '+e.key);
 const prompt='prompts/'+file.replace('.png','.json');if(!fs.existsSync(path.join(root,dest,prompt)))throw Error('Missing prompt '+e.key);
 const pmeta=read(dest+'/'+prompt);if(pmeta.approvedSource.sha256!==e.sourceArt.sha256)throw Error('Prompt source mismatch '+e.key);
 const sprite={path:p,sha256:sha(b),bytes:b.length,width:m.width,height:m.height,format:m.format,hasAlpha:m.hasAlpha,version:Number(file.match(/-v(\d+)/)[1])};
 entries.push({key:e.key,scope:e.scope,monsterIds:e.monsterIds,raidId:e.raidId,raidCode:e.raidCode,previousNames:e.previousNames,workingName:e.workingName,nameApproval:false,tabs:e.tabs,sourceArt:e.sourceArt,sourceApproval:src+'/approval-20261013.json',sourceArtApproved:true,battleSprite:sprite,prompt,staticBaseOnly:true,motionSheet:null,skillFx:null,visualApproval:false,visualReview:'AUTHOR_CHECKED_USER_REVIEW_PENDING',runtimeConnected:false,render:{fit:'contain',objectPosition:'center bottom',spriteOrientation:'PRESERVE_GENERATED_ORIENTATION',targetFootAnchor:{x:.5,y:.94},sourceAlphaBottom:+((maxY+1)/info.height).toFixed(4),note:'Base art only; establish final per-frame pivot with motion atlas before runtime binding.'},qa:quality});
 qa.push({key:e.key,sha256:sprite.sha256,...quality});
}
if(missing.length&&!partial)throw Error('Missing SDs: '+missing.join(','));
const manifest={format:'MONSTER_ORIGINAL_IP_SD_REVIEW_V1',version:1,updatedAt:new Date().toISOString(),status:missing.length?'IN_PRODUCTION':'BASE_SD_REVIEW_READY',generator:'BUILT_IN_IMAGE_GEN',sourceApproval:src+'/approval-20261013.json',counts:{total:source.entries.length,ready:entries.length,hunt:entries.filter(e=>e.scope==='HUNT').length,raid:entries.filter(e=>e.scope==='RAID').length},rules:{singleFullBodySprite:true,transparentRgba:true,noBakedShadow:true,preserveApprovedSourceIdentity:true,sourceIllustrationsApproved:true,sdUserApproval:false,namesApproved:false,normalAndBigSealExcluded:true,stableIdsPreserved:true,mechanicsChanged:false,runtimeBinding:false,motionSheetsComplete:false},excluded:source.excluded,missing,entries};
write(dest+'/manifest.json',manifest);write(dest+'/qa/assets.json',{checkedAt:new Date().toISOString(),scope:'Generated SD assets only; source approval hashes checked',checked:qa.length,passed:qa.every(x=>x.technicalPass),entries:qa});
if(!partial){for(const e of source.entries){const s=entries.find(x=>x.key===e.key);e.battleSprite=s.battleSprite;e.battleSpriteStatus='REVIEW_READY';e.battleSpriteVisualApproval=false;}source.status='SOURCE_ART_APPROVED_BASE_SD_REVIEW_READY';source.sdReview='../monster-original-ip-sd-20261013-v1/';source.updatedAt=new Date().toISOString();write(src+'/manifest.json',source);
 const jobs=entries.map(e=>read(dest+'/'+e.prompt));write(dest+'/generation-plan.json',{status:'BASE_SD_REVIEW_READY',generator:'BUILT_IN_IMAGE_GEN',sourceApproval:src+'/approval-20261013.json',count:jobs.length,jobs});}
console.log(JSON.stringify({ready:entries.length,missing:missing.length,technicalPass:qa.every(x=>x.technicalPass)}));
