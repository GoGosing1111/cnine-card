import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {weaponAt,foreground,cleanAlpha,sha} from './compose-weapon.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const bodyLayer='assets/source/approved-grip-body-layer-v14.png';
// ImageGen's unmodified intermediate is stored in the repository already.
await fs.access(path.join(root,bodyLayer));
const approvedFile='assets/user-approved/forward-grip-approved-v12.png',approvedBytes=await fs.readFile(path.join(root,approvedFile));
const approved=await sharp(approvedBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const clean=await sharp(path.join(root,bodyLayer)).resize(approved.info.width,approved.info.height).ensureAlpha().raw().toBuffer();
const oldSwordRegions=[[[175,475],[217,481],[245,524],[276,585],[302,617],[292,642],[258,609],[214,548],[183,529]],[[319,646],[345,659],[396,647],[424,602],[450,652],[459,718],[499,792],[557,880],[631,977],[708,1080],[795,1197],[861,1284],[891,1260],[916,1312],[939,1402],[932,1496],[891,1480],[840,1442],[749,1438],[693,1405],[689,1352],[655,1294],[589,1210],[521,1120],[451,1033],[378,934],[311,858],[293,823],[253,794],[210,747],[197,707],[237,705],[283,720],[269,704],[278,681],[310,648]]];
const glovePolygon=[[239,614],[251,592],[268,581],[292,575],[312,579],[322,603],[328,620],[335,639],[327,653],[318,658],[310,676],[299,686],[283,679],[272,676],[257,664],[245,652],[235,632]];
const mask=await sharp(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg">${oldSwordRegions.map(p=>`<polygon points="${p.map(v=>v.join(',')).join(' ')}" fill="white"/>`).join('')}</svg>`)).ensureAlpha().raw().toBuffer();
const gloveMask=await sharp(Buffer.from(`<svg width="1024" height="1536" xmlns="http://www.w3.org/2000/svg"><polygon points="${glovePolygon.map(v=>v.join(',')).join(' ')}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer();
const out=Buffer.from(approved.data);let patched=0,protectedPixels=0;
for(let p=0;p<1024*1536;p++){
 if(gloveMask[p*4+3]){protectedPixels++;continue;}
 if(mask[p*4+3]>0){clean.copy(out,p*4,p*4,p*4+4);patched++;}
}
const body=await cleanAlpha(await sharp(out,{raw:approved.info}).png().toBuffer());
const glove=await foreground(approvedBytes,glovePolygon);
const origin=[144,48],grip=[288+origin[0],638+origin[1]],weapon=await weaponAt({scale:1,angle:-38,grip});
let result=await cleanAlpha(await sharp({create:{width:1408,height:1664,channels:4,background:'#00000000'}}).composite([{input:body,left:origin[0],top:origin[1]},{input:weapon.input,left:weapon.left,top:weapon.top},{input:glove,left:origin[0],top:origin[1]}]).png().toBuffer());
// Native ImageGen alpha is 254 even in solid parts. Copy RGBA directly to avoid
// alpha-over compositing changing approved hand pixels from 254 to 255.
const finalRaw=await sharp(result).ensureAlpha().raw().toBuffer();
for(let y=0;y<1536;y++)for(let x=0;x<1024;x++){
 const a=(y*1024+x)*4,b=((y+origin[1])*1408+x+origin[0])*4;
 if(gloveMask[a+3]===255&&approved.data[a+3]>0)approved.data.copy(finalRaw,b,a,a+4);
}
result=await cleanAlpha(await sharp(finalRaw,{raw:{width:1408,height:1664,channels:4}}).png().toBuffer());
const output='assets/knight-sd-v14-original-blade-approved-grip.png';
await fs.writeFile(path.join(root,output),result);
const record={version:14,status:'GRIP_APPROVED_BLADE_CORRECTION_USER_REVIEW_PENDING',approvedGrip:{file:approvedFile,sha256:sha(approvedBytes),quote:'좋아 칼 파지 아주 마음에 들어',date:'2026-10-01',foreground:glovePolygon,protectedPixels,pixelPolicy:'EXACT_APPROVED_RGBA_FOREGROUND'},output,sha256:sha(result),bodyLayer,bodyLayerSha256:sha(await fs.readFile(path.join(root,bodyLayer))),bodyRepair:'GENERATED_ONLY_WHERE_PREVIOUS_SWORD_OCCLUDED_THE_BODY',bodyOrigin:origin,bodyPixels:1452,feet:[144+585,48+1459],weapon:weapon.record,weaponLengthScale:1,weaponWidthScale:1,weaponShape:'ORIGINAL_SELECTED_PIXELS_INCLUDING_COMPACT_RUBY_TERMINAL_NO_NEW_SPIKE',oldSwordRemovalRegions:oldSwordRegions,patchedPixels:patched,generationMode:'BUILT_IN_IMAGEGEN_PLUS_ORIGINAL_ASSET_COMPOSITING',prompts:['prompts/user-reference-forward-grip-v12.txt','prompts/approved-grip-body-layer-v14.txt'],runtimeEnabled:false};
await fs.writeFile(path.join(root,'assets/knight-sd-v14-original-blade-approved-grip.json'),JSON.stringify(record,null,2)+'\n');
await sharp(result).resize({height:1248}).flatten({background:'#152031'}).png().toFile(path.join(root,'qa/blade-v14-full.png'));
await sharp(result).extract({left:294,top:498,width:290,height:380}).resize({width:580}).flatten({background:'#152031'}).png().toFile(path.join(root,'qa/blade-v14-grip.png'));
console.log(JSON.stringify({output,weapon:weapon.record,protectedPixels,patched}));
