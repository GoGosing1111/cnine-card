import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const sharp=require('sharp');
const spec=JSON.parse(fs.readFileSync(new URL('./prompts.json',import.meta.url),'utf8'));
const root=process.cwd(),out=path.join(root,'assets/ui/seal-battle/ritual-20261021');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(new URL('./sources/',import.meta.url),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),assets=[];
for(const row of spec.assets){
 const source=new URL('./sources/'+row.id+'.png',import.meta.url);
 const bytes=fs.readFileSync(fs.existsSync(source)?source:row.sourcePath);fs.writeFileSync(source,bytes);
 const meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
 console.log(JSON.stringify({id:row.id,width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,opaque:stats.isOpaque}));
 const file=path.join(out,row.id+'.webp');
 await sharp(bytes).resize({width:row.id==='sanctum'?1536:row.id==='panel'?960:row.id==='button'?1000:320,withoutEnlargement:true}).webp({quality:88,alphaQuality:100}).toFile(file);
 const targetMeta=await sharp(file).metadata();
 assets.push({id:row.id,source:'preview/seal-battle-rework-20261021/sources/'+row.id+'.png',sourceSha256:sha(bytes),runtime:path.relative(root,file).replaceAll('\\','/'),sha256:sha(fs.readFileSync(file)),width:targetMeta.width,height:targetMeta.height,hasAlpha:meta.hasAlpha,opaque:stats.isOpaque});
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:'20261021-v1',generator:'built-in image_gen',visualApproval:'USER_REVIEW_PENDING',promptSet:'preview/seal-battle-rework-20261021/prompts.json',assets},null,2)+'\n');
