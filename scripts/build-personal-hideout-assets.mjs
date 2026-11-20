import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const root=new URL('../assets/ui/personal-hideout-20261116/',import.meta.url),manifest=JSON.parse(await fs.readFile(new URL('manifest.json',root),'utf8'));
await fs.mkdir(new URL('source/',root),{recursive:true});
const design=JSON.parse(await fs.readFile(new URL('front-design.json',root),'utf8'));
try{await fs.access(new URL('source/manifest-v1.json',root));}catch{await fs.copyFile(new URL('manifest.json',root),new URL('source/manifest-v1.json',root));}
manifest.designRevision=3;manifest.camera=design.camera;manifest.status=design.status;
for(const source of design.sources)if(!manifest.sources.some(s=>s.key===source.key))manifest.sources.push(source);
for(const entry of manifest.sources){
 const target=new URL('source/'+entry.key+'.png',root);
 try{await fs.access(target);}catch{await fs.copyFile(path.join(manifest.sourceRoot,entry.file),target);}
 entry.sha256=crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');entry.saved='source/'+entry.key+'.png';
}
const source=key=>new URL('source/'+key+'.png',root);
for(const width of [1440,960])await sharp(await fs.readFile(source(design.active.background))).resize({width}).webp({quality:80}).toFile(new URL('room-'+width+'.webp',root).pathname.replace(/^\/(?=[A-Za-z]:)/,''));
const outputs=[];
const residences=JSON.parse(await fs.readFile(new URL('residence-design.json',root),'utf8'));
for(const stage of residences.stages){
 const target=new URL(stage.saved,root);try{await fs.access(target);}catch{await fs.copyFile(path.join(residences.sourceRoot,stage.file),target);}
 stage.sha256=crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');
 const file='residence-'+stage.code+'.webp',data=await sharp(await fs.readFile(target)).resize({width:1440}).webp({quality:82}).toBuffer();
 await fs.writeFile(new URL(file,root),data);outputs.push({file,bytes:data.length});
}
await fs.writeFile(new URL('residence-design.json',root),JSON.stringify(residences,null,2)+'\n');
manifest.residences=residences.stages.map(({code,name,saved,sha256})=>({code,name,saved,sha256}));
for(const [key,names,size] of [[design.active.furniture,['workbench','fridge','garage','armory','sofa','lamp'],384],['parts-clean',['steel','wire','circuit','coolant','drive','core'],192]]){
 const input=await fs.readFile(source(key)),{width,height}=await sharp(input).metadata();
 for(let i=0;i<6;i++){
  const furniture=key===design.active.furniture;
  const name=(furniture?'furniture-':'part-')+names[i]+'.webp';
  const frame=furniture?design.furnitureFrames[i]:{left:i%3*(width/3),top:Math.floor(i/3)*(height/2),width:width/3,height:height/2};
  const cropped=await sharp(input).extract({left:frame.left,top:frame.top,width:frame.width,height:frame.height}).toBuffer();
  const targetSize=furniture&&names[i]==='workbench'?640:size;
  const data=await sharp(cropped).trim({threshold:10}).resize(targetSize,targetSize,{fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();
  await fs.writeFile(new URL(name,root),data);outputs.push({file:name,bytes:data.length});
 }
}
for(const [key,name,size] of [['panel','panel.webp',512],[design.active.cabinet,'trophy-stand.webp',640]]){
 const data=await sharp(await fs.readFile(source(key))).trim({threshold:10}).resize(size,size,{fit:'inside'}).webp({quality:90}).toBuffer();await fs.writeFile(new URL(name,root),data);outputs.push({file:name,bytes:data.length});
}
manifest.outputs=outputs;await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({outputs:outputs.length,bytes:outputs.reduce((s,o)=>s+o.bytes,0)}));
