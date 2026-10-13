import fs from 'node:fs/promises';import sharp from 'sharp';
const home='C:/Users/User/.codex/generated_images/01a135ff-ab89-7c10-94ec-9a68742fa947/';
const entries={ultimate:'9bb6ab79-1c50-4909-b123-b62c611393d7',dash:'1e002d1b-1f53-43b4-8f16-0c74094be1be',defeat:'04e11682-a8cf-4f40-9ba8-6128445b5487',seal:'c72bc419-bd32-41d5-909c-6b1fe529db4b',lance:'3f0aac1f-b1f6-400f-85f8-ecb1c7b38e4d',fall:'075e15bc-3452-4627-a7a8-6549c227c208'};
for(const [k,v] of Object.entries(entries))await fs.copyFile(home+'exec-'+v+'.png',new URL('assets/sources/'+k+'.png',import.meta.url));
for(const k of ['sd-candidate','cast',...Object.keys(entries)]){const f=new URL('assets/sources/'+k+'.png',import.meta.url);const m=await sharp(await fs.readFile(f)).metadata();console.log(k,m.width,m.height,m.channels);}
await sharp(await fs.readFile(new URL('assets/sources/seal.png',import.meta.url))).flatten({background:'#15202c'}).resize({width:1200}).png().toFile(new URL('qa/seal-dark.png',import.meta.url).pathname.replace(/^\/C:/,'C:'));
