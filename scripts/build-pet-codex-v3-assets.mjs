import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
const out='assets/ui/pets/rework-20261114/codex-v3',gen='C:/Users/User/.codex/generated_images/01a1d8d6-19d2-79e3-81ac-3571cea25bed';
await fs.mkdir(out+'/pets',{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),entries=[];
const sourceFiles={stats:'exec-e6fb43ad-fbdb-4f51-aa4b-5c958c49a53e.png',trait:'exec-8ee7a38a-b838-46c1-b649-c588c4a5e8db.png',kit:'exec-c3beef4e-d1d1-43ae-bef5-9e485f87c6d0.png'};
for(const [kind,file]of Object.entries(sourceFiles)){
 const data=await fs.readFile(path.join(gen,file));await fs.writeFile(out+'/'+kind+'-source.png',data);
 const meta=await sharp(data).metadata();entries.push({source:kind+'-source.png',originalSha256:sha(data),width:meta.width,height:meta.height,alpha:meta.hasAlpha});
 if(kind!=='kit'){
  const parts=[];
  for(let i=0;i<12;i++){const x=Math.round(i%4*meta.width/4),y=Math.round(Math.floor(i/4)*meta.height/3),right=Math.round((i%4+1)*meta.width/4),bottom=Math.round((Math.floor(i/4)+1)*meta.height/3);
   parts.push({input:await sharp(data).extract({left:x,top:y,width:right-x,height:bottom-y}).resize(192,192,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer(),left:i%4*192,top:Math.floor(i/4)*192});}
  await sharp({create:{width:768,height:576,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(parts).webp({quality:86,alphaQuality:100}).toFile(out+'/'+kind+'-roll.webp');
 }else{
  for(const [i,name,size]of [[0,'panel',600],[1,'action',600],[2,'codex-icon',160],[3,'sanctuary',640]]){
   const x=Math.round(i%2*meta.width/2),y=Math.round(Math.floor(i/2)*meta.height/2),right=Math.round((i%2+1)*meta.width/2),bottom=Math.round((Math.floor(i/2)+1)*meta.height/2);
   const bounds=i===1?{left:630,top:191,width:620,height:200}:i===3?{left:625,top:587,width:629,height:640}:{left:x,top:y,width:right-x,height:bottom-y};
   const cell=await sharp(data).extract(bounds).png().toBuffer();
   await sharp(cell).trim({threshold:12}).resize(size,size,{fit:'inside'}).webp({quality:88,alphaQuality:100}).toFile(out+'/'+name+'.webp');
  }
 }
}
const heukgu=PET_ART_CATALOG.find(x=>x.code==='PET-HEUKGU'),cards=[heukgu,...PET_ART_CATALOG.filter(x=>x.code!==heukgu.code)],pets={};
for(const pet of cards){
 let data;try{data=await fs.readFile(pet.sourceArt);}catch{data=execFileSync('git',['show','HEAD:'+pet.sourceArt],{maxBuffer:12e6,stdio:['ignore','pipe','ignore']});}
 const stem=pet.code.toLowerCase();
 for(const [suffix,size]of [['thumb',144],['portrait',560]])await sharp(data).resize(size,size,{fit:'inside'}).webp({quality:86,alphaQuality:100}).toFile(out+'/pets/'+stem+'-'+suffix+'.webp');
 pets[pet.code]={thumb:'/'+out+'/pets/'+stem+'-thumb.webp',portrait:'/'+out+'/pets/'+stem+'-portrait.webp',source:pet.sourceArt,sourceSha256:sha(data)};
}
await fs.writeFile(out+'/pets.json',JSON.stringify(pets,null,2));
await fs.writeFile(out+'/manifest.json',JSON.stringify({generator:'Built-in ImageGen',prompts:'preview/pet-rework-20261114/ui-v3-prompts.json',processing:'Mechanical cell extraction, proportional resize and WebP encoding; approved pet portraits reused without retouch.',entries,pets},null,2));
console.log(JSON.stringify({entries,pets:Object.keys(pets).length}));
