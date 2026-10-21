import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root=process.cwd(),qa=path.join(root,'docs/qa/tower-abyss-ui-20261021'),dest=path.join(root,'assets/ui/tower-abyss-20261021');
await fs.mkdir(dest,{recursive:true});await fs.mkdir(path.join(qa,'sources'),{recursive:true});
const inputs={sanctum:'6cd73bc2-5647-4d96-91b8-776eefbca36e',frame:'20d10f37-a18a-437e-a2e7-a50949df5a2a',button:'d1ac954a-52ba-4acd-b3d1-ef5635966653',seal:'99117306-2b71-4052-903d-b017d3462680'};
const files=[];
for(const [key,id] of Object.entries(inputs)){
 const original=path.join('C:/Users/User/.codex/generated_images/01a15d0a-c24a-7b03-82c3-787abb8bb4bc',`exec-${id}.png`);
 const raw=await fs.readFile(original),source=path.join(qa,'sources',key+'.png'),out=path.join(dest,key+'.webp');
 await fs.writeFile(source,raw);
 let pipeline=sharp(raw);if(key!=='sanctum')pipeline=pipeline.trim({threshold:8});
 if(key==='sanctum')pipeline=pipeline.resize({width:1920,withoutEnlargement:true});
 await pipeline.webp({quality:90,alphaQuality:100,effort:6}).toFile(out);
 const output=await fs.readFile(out),meta=await sharp(output).metadata();
 files.push({key,source:path.relative(root,source).replaceAll('\\','/'),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),runtime:path.relative(root,out).replaceAll('\\','/'),runtimeSha256:crypto.createHash('sha256').update(output).digest('hex'),width:meta.width,height:meta.height,alpha:meta.hasAlpha,bytes:output.length});
}
await fs.writeFile(path.join(qa,'art-manifest.json'),JSON.stringify({generator:'built-in image_gen.imagegen',created:'2026-10-21',visualApproval:'PENDING_USER_REVIEW',mechanicalDerivatives:'Transparent margin trim and WebP encoding; source bytes preserved.',files},null,2)+'\n');
console.log(JSON.stringify(files,null,2));
