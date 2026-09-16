import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {SZ_BODY_ITEMS} from '../functions/_battle_suit_sz_body.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const preview='preview/battle-suit-sz-v1';
const base='assets/ui/project-v/account-battle-suits';
const read=p=>readFile(path.join(root,p.replace(/^\//,'')));
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const writeJson=(p,value)=>writeFile(path.join(root,p),JSON.stringify(value,null,2)+'\n');
const manifest=JSON.parse(await read(preview+'/manifest.json'));
const approval=JSON.parse(await read(preview+'/approval.json'));
if(manifest.status!=='USER_APPROVED_20260916'||!approval.runtime.liveEnabled)throw Error('S_Z_LIVE_APPROVAL_REQUIRED');
if(manifest.suits.length!==2||manifest.suits.some(s=>s.entries.length!==6))throw Error('S_Z_ROSTER_INVALID');

async function fitItem(input,width,height){
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=-1,bottom=-1,clear=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const a=data[(y*info.width+x)*4+3];if(a===0)clear++;
    if(a>=16){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  }
  if(clear<info.width*info.height*.05||right<0)throw Error('REAL_ALPHA_REQUIRED');
  const bw=right-left+1,bh=bottom-top+1,scale=Math.min(width*.90/bw,height*.90/bh);
  const w=Math.round(bw*scale),h=Math.round(bh*scale);
  const cut=await sharp(input).extract({left,top,width:bw,height:bh}).resize(w,h).png().toBuffer();
  return sharp({create:{width,height,channels:4,background:'#00000000'}}).composite([{input:cut,left:Math.floor((width-w)/2),top:Math.floor((height-h)/2)}]).png().toBuffer();
}

await mkdir(path.join(root,base,'animations'),{recursive:true});
await mkdir(path.join(root,base,'sprites'),{recursive:true});
await mkdir(path.join(root,base,'suits'),{recursive:true});
const suits=[],items=[],sources=[];
for(const suit of manifest.suits){
  const item=SZ_BODY_ITEMS.find(i=>i.code===suit.code);
  if(!item||sha(await read(suit.source))!==suit.sha256)throw Error('APPROVED_SUIT_SOURCE_CHANGED');
  const bodySource=`${preview}/assets/prepared/${suit.id}-unarmed-source-alpha.png`;
  await writeFile(path.join(root,item.image.slice(1)),await fitItem(await read(bodySource),768,1024));
  await copyFile(path.join(root,suit.unarmed.slice(1)),path.join(root,item.battleSprite.slice(1)));
  items.push({code:item.code,image:item.image,sha256:sha(await read(item.image))});
  sources.push({path:suit.source,sha256:suit.sha256,processing:'APPROVED_SOURCE_RGB_AND_EXISTING_ALPHA_UNIFORM_FIT'});
  const profiles={},entries=[],sheets=new Map();
  for(const entry of suit.entries){
    const source=entry.profile.sheetUrl;
    if(!sheets.has(source)){
      const dest=`/${base}/animations/${path.basename(source).replace('-v1.png','-atlas-v2124.png')}`;
      if(sha(await read(source))!==entry.atlasSha256)throw Error('APPROVED_ATLAS_CHANGED');
      await copyFile(path.join(root,source.slice(1)),path.join(root,dest.slice(1)));
      sheets.set(source,dest);
    }
    const image=`/${base}/sprites/${suit.id}-${entry.id}-v2124.png`;
    if(sha(await read(entry.image))!==entry.sha256)throw Error('APPROVED_SPRITE_CHANGED');
    await copyFile(path.join(root,entry.image.slice(1)),path.join(root,image.slice(1)));
    const profile={...entry.profile,suitCode:suit.code,sheetUrl:sheets.get(source),scaleMultiplier:1.4,
      pivotContract:{type:'SOLE_CENTER',unit:'NORMALIZED_FRAME',alphaThreshold:16,bottomBandPx:9}};
    profiles[entry.weaponCode]=profile;
    entries.push({...entry,image,profile});
  }
  suits.push({...item,sha256:sha(await read(item.battleSprite)),profiles,entries});
  const coreNumber=suit.id==='s-body'?5:6;
  const coreSource=`${preview}/assets/sources/suit-core-${coreNumber}-source-v2124.png`;
  const coreImage=`/assets/items/suit-core-${coreNumber}-v2124.png`;
  await writeFile(path.join(root,coreImage.slice(1)),await fitItem(await read(coreSource),1254,1254));
  items.push({code:item.coreCode,image:coreImage,sha256:sha(await read(coreImage))});
  sources.push({path:'/'+coreSource,sha256:sha(await read(coreSource)),processing:'PRESERVE_GENERATED_RGBA_UNIFORM_PADDED_FIT'});
}
const output={version:2124,contract:'PROJECT_V_ACCOUNT_BATTLE_SUIT_S_Z_BODY_V1',scope:'PVE_ONLY',liveEnabled:true,
  approval:{date:'2026-09-16',instruction:'라이브 배포해 전체 승인',coreInstruction:'슈터코어 5 6 만들고',order:['H-BODY','S-BODY','Z-BODY']},
  economy:{powerSource:'OWNER_CMS',seedPower:0,automaticGrant:false,automaticDrop:false,automaticRecipe:false},
  animationContract:manifest.animationContract,generationTool:'built-in image_gen',
  prompts:'/'+preview+'/PROMPTS.md',items,sources,suits};
await writeJson(base+'/sz-body-v2124.json',output);
const animationManifest=JSON.parse(await read(base+'/manifest-v2.json'));
animationManifest.extensions=[...new Set([...(animationManifest.extensions||[]),'/'+base+'/sz-body-v2124.json'])];
await writeJson(base+'/manifest-v2.json',animationManifest);
console.log(JSON.stringify({items:items.map(i=>i.code),suits:suits.length,weaponProfiles:suits.reduce((n,s)=>n+s.entries.length,0)}));
