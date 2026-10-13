import fs from 'node:fs/promises';
for(const path of ['source/preview.js','index.html','battle.html']){
 let text=await fs.readFile(new URL(path,import.meta.url),'utf8');
 text=text.replaceAll('idle-aura-v2','staff-v3').replace('SAPPHIRE / 02','SAPPHIRE / 03');
 await fs.writeFile(new URL(path,import.meta.url),text);
}
