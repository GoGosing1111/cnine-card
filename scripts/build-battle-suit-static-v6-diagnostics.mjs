import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=value=>path.join(root,String(value).replace(/^\//,''));
const manifest=JSON.parse(await readFile(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json'),'utf8'));
const outputPath=path.join(root,'assets/ui/project-v/account-battle-suits/animation-build-diagnostics-v4.json');
const frameWidth=384;
const frameHeight=512;
const atlasWidth=frameWidth*4;
const frameNames=['ready','fire','recoil','recover'];
const weaponSlugs=new Map([
  ['EQ_1785427638137','m4a1'],
  ['EQ_1785961300455','m200'],
  ['EQ_1785961232958','ak'],
  ['EQ_1786966923833','sks']
]);
const staticPairs=new Set([
  'BATTLE_SUIT_01:EQ_1785427638137',
  'BATTLE_SUIT_01:EQ_1785961300455',
  'BATTLE_SUIT_01:EQ_1785961232958',
  'BATTLE_SUIT_02:EQ_1785961300455',
  'BATTLE_SUIT_03:EQ_1785961300455'
]);
const generatedSources=new Map([
  ['BATTLE_SUIT_01:EQ_1785427638137','/assets/ui/project-v/account-battle-suits/sources/battle-suit-01-m4a1-imagegen-authored-v6.png'],
  ['BATTLE_SUIT_01:EQ_1785961300455','/assets/ui/project-v/account-battle-suits/sources/battle-suit-01-m200-imagegen-authored-v6.png'],
  ['BATTLE_SUIT_01:EQ_1785961232958','/assets/ui/project-v/account-battle-suits/sources/battle-suit-01-ak-imagegen-authored-v6.png'],
  ['BATTLE_SUIT_02:EQ_1785961300455','/assets/ui/project-v/account-battle-suits/sources/battle-suit-02-m200-imagegen-authored-v6.png'],
  ['BATTLE_SUIT_03:EQ_1785961300455','/assets/ui/project-v/account-battle-suits/sources/battle-suit-03-m200-imagegen-authored-v6.png']
]);

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();

function readFrame(atlas,row,column){
  const frame=Buffer.alloc(frameWidth*frameHeight*4);
  for(let y=0;y<frameHeight;y+=1){
    const sourceStart=((row*frameHeight+y)*atlasWidth+column*frameWidth)*4;
    atlas.copy(frame,y*frameWidth*4,sourceStart,sourceStart+frameWidth*4);
  }
  return frame;
}

function inspectFrame(frame){
  let top=frameHeight;
  let bottom=-1;
  let right=-1;
  let edgeAlphaPixels=0;
  for(let y=0;y<frameHeight;y+=1){
    for(let x=0;x<frameWidth;x+=1){
      const alpha=frame[(y*frameWidth+x)*4+3];
      if(alpha>=16){
        top=Math.min(top,y);
        bottom=Math.max(bottom,y);
        right=Math.max(right,x);
      }
      if(alpha>0&&(x<=1||x>=frameWidth-2||y<=1||y>=frameHeight-2))edgeAlphaPixels+=1;
    }
  }
  if(bottom<0)throw new Error('Empty Battle Suit frame');
  const bottomBandTop=Math.max(0,bottom-8);
  let soleXTotal=0;
  let solePixels=0;
  for(let y=bottomBandTop;y<=bottom;y+=1){
    for(let x=0;x<frameWidth;x+=1){
      if(frame[(y*frameWidth+x)*4+3]<16)continue;
      soleXTotal+=x;
      solePixels+=1;
    }
  }
  const muzzleCandidates=[];
  for(let y=0;y<300;y+=1){
    for(let x=Math.max(0,right-3);x<=right;x+=1){
      if(frame[(y*frameWidth+x)*4+3]>=16)muzzleCandidates.push(y);
    }
  }
  muzzleCandidates.sort((left,rightValue)=>left-rightValue);
  return {
    contentTop:top,
    contentBottom:bottom,
    visibleHeight:bottom-top+1,
    solePivot:{x:Number((soleXTotal/solePixels).toFixed(3)),y:bottom},
    muzzle:{x:right,y:muzzleCandidates[Math.floor(muzzleCandidates.length/2)]},
    edgeAlphaPixels,
    rgbaSha256:sha256(frame)
  };
}

const sheets=[];
const entries=[];
for(const suit of manifest.suits){
  for(const [group,sheet] of Object.entries(suit.animationSheets)){
    const bytes=await readFile(publicRoot(sheet.image));
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    if(info.width!==1536||info.height!==1024||info.channels!==4)throw new Error(`Invalid atlas ${sheet.image}`);
    sheets.push({
      suitCode:suit.code,
      group,
      image:sheet.image,
      sha256:sha256(bytes),
      dimensions:{width:info.width,height:info.height},
      composition:sheet.composition
    });
    for(const rowSpec of sheet.weaponRows){
      const key=`${suit.code}:${rowSpec.weaponCode}`;
      const frames=frameNames.map((name,column)=>({name,column,...inspectFrame(readFrame(data,rowSpec.row,column))}));
      const uniqueFrameHashes=new Set(frames.map(frame=>frame.rgbaSha256)).size;
      const source=generatedSources.get(key)||null;
      entries.push({
        suitCode:suit.code,
        weaponCode:rowSpec.weaponCode,
        weaponSlug:weaponSlugs.get(rowSpec.weaponCode),
        group,
        row:rowSpec.row,
        sheet:sheet.image,
        frameMode:staticPairs.has(key)?'STATIC_STANDING_AIM':'PRESERVED_APPROVED_ANIMATION',
        exactPixelRepeat:uniqueFrameHashes===1,
        uniqueFrameHashes,
        generatedSource:source,
        generatedSourceSha256:source?sha256(await readFile(publicRoot(source))):null,
        frames
      });
    }
  }
}

const diagnostics={
  version:'v4',
  contract:'PROJECT_V_ACCOUNT_BATTLE_SUIT_STATIC_STANCE_ATLAS_DIAGNOSTICS_V4',
  sha256Algorithm:'SHA-256',
  generatedBy:'/scripts/build-battle-suit-static-v6-diagnostics.mjs',
  frameSize:{width:frameWidth,height:frameHeight},
  alphaThreshold:16,
  bottomBandPx:9,
  staticFramePolicy:'IDENTICAL_RGBA_READY_FRAME_COPIED_TO_ALL_FOUR_RUNTIME_PHASES',
  sheets,
  entries
};

await writeFile(outputPath,`${JSON.stringify(diagnostics,null,2)}\n`,'utf8');
console.log(`Wrote ${path.relative(root,outputPath)} (${entries.length} suit/weapon entries)`);
