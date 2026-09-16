import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {approvedSuits,sourceCanvas,weaponFits,transformExactWeapon} from './resource-config.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const asset=path.join(here,'assets');
const sha=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
const filter=process.argv[2];
const live=JSON.parse(await readFile(path.join(root,'assets/ui/project-v/account-battle-suits/manifest-v2.json'),'utf8'));
await mkdir(path.join(asset,'prepared'),{recursive:true});
const report={sourceCanvas,sourcePolicy:'APPROVED_RGB_PRESERVED_WITH_GENERATED_MATTE_ALPHA',suits:[]};
for(const suit of approvedSuits.filter(s=>!filter||s.id===filter)){
  const approved=await readFile(path.join(asset,'sources',suit.source));
  if(sha(approved)!==suit.sha256)throw Error(`APPROVED_SOURCE_CHANGED:${suit.id}`);
  const source=await sharp(approved).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const matte=await sharp(path.join(asset,'sources',suit.matte)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(source.info.width!==1024||source.info.height!==1536||matte.info.width!==1024||matte.info.height!==1536)throw Error('MATTE_CANVAS_DRIFT');
  const cutout=Buffer.from(source.data);
  let removed=0,opaque=0,preservedRgb=0;
  // Same magenta separation as the H-BODY builder; only its alpha is used.
  for(let o=0;o<cutout.length;o+=4){
    const [r,g,b]=matte.data.subarray(o,o+3);
    const key=Math.min(r,b)-g;
    const alpha=key>35&&Math.max(r,b)>100?0:255;
    cutout[o+3]=alpha;
    if(!alpha){cutout.fill(0,o,o+4);removed++;}else{opaque++;if(cutout[o]===source.data[o]&&cutout[o+1]===source.data[o+1]&&cutout[o+2]===source.data[o+2])preservedRgb++;}
  }
  if(removed<1024*1536*.35||opaque<1024*1536*.2)throw Error(`MATTE_KEY_FAILED:${suit.id}`);
  if(preservedRgb!==opaque)throw Error('APPROVED_COLOR_DRIFT');
  const originalAlpha=await sharp(cutout,{raw:source.info}).png().toBuffer();
  await writeFile(path.join(asset,'prepared',`${suit.id}-unarmed-source-alpha.png`),originalAlpha);
  const scaled=await sharp(originalAlpha).resize({width:956,kernel:'lanczos3'}).extract({left:60,top:0,width:896,height:1434}).png().toBuffer();
  const canonical=await sharp({create:{width:1280,height:1536,channels:4,background:'#00000000'}}).composite([{input:scaled,left:0,top:36}]).png().toBuffer();
  await writeFile(path.join(asset,'prepared',`${suit.id}-canonical-alpha.png`),canonical);
  const entries=[];
  for(let index=0;index<6;index++){
    const spec=weaponFits[index],weapon=live.weapons[index];
    if(sha(await readFile(path.join(root,weapon.battleSprite.slice(1))))!==weapon.sha256)throw Error('WEAPON_HASH_CHANGED');
    const exact=await transformExactWeapon(spec);
    const green=await sharp(exact.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let o=0;o<green.data.length;o+=4){const a=green.data[o+3]>32?255:0;green.data[o]=0;green.data[o+1]=a;green.data[o+2]=0;green.data[o+3]=a;}
    const proxy=await sharp(green.data,{raw:green.info}).png().toBuffer();
    const file=`${suit.id}-${spec.id}-fixed-proxy-v1.png`;
    const composite=await sharp({create:{width:1280,height:1536,channels:4,background:'#ff00ff'}}).composite([{input:canonical,left:0,top:0},{input:proxy,left:exact.placement.left,top:exact.placement.top}]).png().toBuffer();
    await writeFile(path.join(asset,'prepared',file),composite);
    const grip=exact.point(spec.grip),support=exact.point(spec.support),muzzle=exact.point(spec.muzzle),bore=exact.point(spec.bore);
    entries.push({index,id:spec.id,input:file,placement:exact.placement,grip,support,muzzle,bore,weaponSource:weapon.battleSprite,weaponSha256:weapon.sha256});
  }
  const row={id:suit.id,sourceSha256:suit.sha256,sourceRgbPreserved:true,removedPixels:removed,opaquePixels:opaque,entries};
  report.suits.push(row);
  await writeFile(path.join(asset,'prepared',`${suit.id}-input-manifest.json`),JSON.stringify(row,null,2)+'\n');
}
await writeFile(path.join(asset,'prepared',`input-report${filter?'-'+filter:''}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.suits.map(s=>({id:s.id,removedPixels:s.removedPixels,sourceRgbPreserved:s.sourceRgbPreserved,inputs:s.entries.length}))));
