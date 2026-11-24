import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import manifest from '../../../assets/ui/tower-monsters-20261124/manifest.json' with {type:'json'};

const qa = new URL('./', import.meta.url);
const root = new URL('../../../', qa);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];
for (const {key, name, image} of manifest.sprites) {
  const source = 'source/' + key + '.png';
  const input = await readFile(new URL(source, qa));
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let xMin=info.width, yMin=info.height, xMax=-1, yMax=-1;
  for (let y=0; y<info.height; y++) for (let x=0; x<info.width; x++) {
    if (data[(y*info.width+x)*4+3] < 8) continue;
    xMin=Math.min(x,xMin); yMin=Math.min(y,yMin); xMax=Math.max(x,xMax); yMax=Math.max(y,yMax);
  }
  if (xMax<=xMin || yMax<=yMin) throw Error('Empty sprite ' + key);
  const left=Math.max(0,xMin-2), top=Math.max(0,yMin-2);
  const bounds={left, top, width:Math.min(info.width,xMax+3)-left, height:Math.min(info.height,yMax+3)-top};
  const cutout=await sharp(input).extract(bounds).resize(580,552,{fit:'inside'}).png().toBuffer({resolveWithObject:true});
  const frame=await sharp({create:{width:640,height:640,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:cutout.data,left:Math.floor((640-cutout.info.width)/2),top:576-cutout.info.height}])
    .webp({quality:83,alphaQuality:96,effort:6}).toBuffer();
  await writeFile(new URL(image.slice(1),root),frame);
  rows.push({key,name,source,sourceSha256:sha(input),sourceBounds:bounds,image,sha256:sha(frame),bytes:frame.length});
}
await writeFile(new URL('art-files.json',qa),JSON.stringify({canvas:[640,640],footY:576,sprites:rows},null,2)+'\n');
