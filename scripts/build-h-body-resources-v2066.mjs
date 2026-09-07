import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const preview=path.join(root,'preview/battle-suit-prestige-v1');
const base=path.join(root,'assets/ui/project-v/account-battle-suits');
const hash=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const url=p=>'/'+path.relative(root,p).split(path.sep).join('/');
const readUrl=p=>readFile(path.join(root,p.replace(/^\//,'')));
const manifest=JSON.parse(await readFile(path.join(preview,'manifest.json'),'utf8'));
if(manifest.status!=='USER_APPROVED_20260908'||manifest.approvedLiveEquipmentCode!=='BATTLE_SUIT_H_BODY')throw Error('H_BODY_APPROVAL_MISSING');
if(manifest.suits.length!==1||manifest.suits[0].entries.length!==6)throw Error('H_BODY_ROSTER_INVALID');

function bounds(data,width,height){
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=16){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  if(x1<0)throw Error('EMPTY_H_BODY_ASSET');
  return {left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};
}
async function clearInvisible(input){
  const raw=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let o=0;o<raw.data.length;o+=4)if(raw.data[o+3]===0)raw.data.fill(0,o,o+4);
  return raw;
}
async function fitCutout(input,width,height,maxHeight,bottom){
  const {data,info}=await clearInvisible(input),b=bounds(data,info.width,info.height);
  const scale=Math.min((width-32)/b.width,maxHeight/b.height),w=Math.round(b.width*scale),h=Math.round(b.height*scale);
  const cutout=await sharp(data,{raw:info}).extract(b).resize(w,h).png().toBuffer();
  return sharp({create:{width,height,channels:4,background:'#00000000'}})
    .composite([{input:cutout,left:Math.floor((width-w)/2),top:bottom-h+1}]).png().toBuffer();
}
await mkdir(path.join(base,'suits'),{recursive:true});
await mkdir(path.join(base,'animations'),{recursive:true});
const bodySource=path.join(preview,'assets/sources/h-body-item-source-v2066.png');
const bodyAlpha=path.join(preview,'assets/prepared/h-body-item-alpha-v2066.png');
await mkdir(path.dirname(bodyAlpha),{recursive:true});
execFileSync(process.execPath,[path.join(root,'scripts/remove-connected-light-background.cjs'),bodySource,bodyAlpha]);
const body=await clearInvisible(bodyAlpha);
const bodyPng=await sharp(body.data,{raw:body.info}).png().toBuffer();
const itemPath=path.join(root,'assets/items/h-body-v2066.png');
const spritePath=path.join(base,'suits/h-body-v2066.png');
await writeFile(itemPath,await fitCutout(bodyPng,768,1024,950,985));
await writeFile(spritePath,await fitCutout(bodyPng,384,512,440,479));

const coreSource=path.join(preview,'assets/sources/suit-core-4-item-source-v2066.png');
const core=await clearInvisible(coreSource);
if(core.info.channels!==4||!core.data.some((value,index)=>index%4===3&&value===0))throw Error('CORE_4_ALPHA_MISSING');
const corePath=path.join(root,'assets/items/suit-core-4-v2066.png');
const corePng=await sharp(core.data,{raw:core.info}).png().toBuffer();
await writeFile(corePath,await fitCutout(corePng,1254,1254,1128,1190));

const sheetMap=new Map(),profiles={},entries=[];
for(const entry of manifest.suits[0].entries){
  const source=entry.profile.sheetUrl;
  if(!sheetMap.has(source)){
    const suffix=path.basename(source).replace('helios-','h-body-');
    const destination=path.join(base,'animations',suffix.replace('-v1.png','-atlas-v2066.png'));
    const bytes=await readUrl(source);
    if(hash(bytes)!==entry.atlasSha256)throw Error('H_BODY_ATLAS_HASH_MISMATCH');
    await copyFile(path.join(root,source.slice(1)),destination);
    sheetMap.set(source,url(destination));
  }
  const profile={...entry.profile,suitCode:'BATTLE_SUIT_H_BODY',sheetUrl:sheetMap.get(source),scaleMultiplier:1.4,
    pivotContract:{type:'SOLE_CENTER',unit:'NORMALIZED_FRAME',alphaThreshold:16,bottomBandPx:9}};
  profiles[entry.weaponCode]=profile;
  entries.push({...entry,profile});
}
const output={version:2066,contract:'PROJECT_V_ACCOUNT_BATTLE_SUIT_H_BODY_V1',scope:'PVE_ONLY',liveEnabled:true,
  approval:{date:'2026-09-08',equipmentCode:'BATTLE_SUIT_H_BODY',itemName:'H-BODY',coreCode:'SUIT_CORE_4',
    instruction:'H-BODY,슈트코어4 아이템 리소스 추가하고 해당 V3이미지 연결해 / 라이브까지 승인 / 금룡 돌격소총 재작업 후 전체 승인'},
  economy:{powerSource:'OWNER_CMS',seedPower:0,automaticGrant:false,automaticDrop:false,automaticRecipe:false},
  suit:{code:'BATTLE_SUIT_H_BODY',name:'H-BODY',image:url(itemPath),battleSprite:url(spritePath),sha256:hash(await readFile(spritePath))},
  items:[{code:'BATTLE_SUIT_H_BODY',image:url(itemPath),sha256:hash(await readFile(itemPath))},{code:'SUIT_CORE_4',image:url(corePath),sha256:hash(await readFile(corePath))}],
  sources:[{path:url(bodySource),sha256:hash(await readFile(bodySource)),processing:'CONNECTED_LIGHT_MATTE_UNIFORM_FULL_BODY_FIT'},
    {path:url(coreSource),sha256:hash(await readFile(coreSource)),processing:'PRESERVE_GENERATED_RGBA_UNIFORM_PADDED_FIT'}],
  generationTool:'built-in image_gen',prompts:'/preview/battle-suit-prestige-v1/PROMPTS.md',
  animationContract:manifest.animationContract,profiles,entries};
await writeFile(path.join(base,'h-body-v2066.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({items:output.items,profiles:Object.keys(profiles).length,sheets:sheetMap.size}));
