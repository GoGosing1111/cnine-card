import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=new URL('./',import.meta.url);
const source='assets/sources/solaris-omega-extracted-source-v1.png',output='assets/solaris-omega-cutout-v1.png';
// ImageGen supplies the authored cutout on chroma green. Technical alpha
// extraction only; no geometry, repainting or source catalogue replacement.
const {data,info}=await sharp(await readFile(new URL(source,dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let removed=0;
for(let i=0;i<data.length;i+=4){
  const dominance=data[i+1]-Math.max(data[i],data[i+2]);
  if(dominance>30){data[i+3]=0;removed++;}
}
if(removed<info.width*info.height*.4||removed>info.width*info.height*.75)throw Error('Solaris alpha outside reviewed bounds');
await writeFile(new URL(output,dir),await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer());
const hash=async p=>createHash('sha256').update(await readFile(new URL(p,dir))).digest('hex');
const manifest=JSON.parse(await readFile(new URL('asset-manifest.json',dir),'utf8'));
manifest.visualAssets=manifest.visualAssets.filter(p=>p.path!==output);
manifest.visualAssets.push({path:output,sha256:await hash(output),width:info.width,height:info.height,channels:4,source,sourceSha256:await hash(source),alphaRemovedPixels:removed,method:'ImageGen cutout, chroma green alpha only'});
await writeFile(new URL('asset-manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log('Solaris alpha prepared:',removed,'transparent pixels');
