import fs from 'node:fs/promises';import sharp from 'sharp';
const dir='preview/v35-character-baseline-20261101/attack-v1';const old=await sharp(dir+'/images/upper_arm_near.png').ensureAlpha().raw().toBuffer(),paint=await sharp(dir+'/sources/sleeve-underpaint-v1.png').ensureAlpha().raw().toBuffer();const sleeve=Buffer.from(paint),plate=Buffer.alloc(old.length);
for(let y=0;y<1536;y++)for(let x=0;x<1024;x++){const i=(y*1024+x)*4;if(y>=395)old.copy(sleeve,i,i,i+4);if(y<397)old.copy(plate,i,i,i+4);if(!sleeve[i+3])sleeve.fill(0,i,i+4);}
for(const [name,data]of [['sleeve_near',sleeve],['pauldron_near',plate]])await sharp(data,{raw:{width:1024,height:1536,channels:4}}).png().toFile(dir+'/images/'+name+'.png');
