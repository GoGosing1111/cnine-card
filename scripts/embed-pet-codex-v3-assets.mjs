import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const out='assets/ui/pets/rework-20261114/codex-v3',wrapper='C:/Users/User/Downloads/upload/cnine-card/tools/content-production/impeccable.mjs';
const prompts=JSON.parse(await fs.readFile('preview/pet-rework-20261114/ui-v3-prompts.json','utf8')),manifest=JSON.parse(await fs.readFile(out+'/manifest.json','utf8'));
for(const [kind,names]of [['stats',['stats-source.png','stats-roll.webp']],['trait',['trait-source.png','trait-roll.webp']],['kit',['kit-source.png','panel.webp','action.webp','codex-icon.webp','sanctuary.webp']]]){
 for(const name of names)execFileSync(process.execPath,[wrapper,'embed-prompt',path.resolve(out,name),'--prompt',prompts[kind]],{stdio:'pipe'});
}
for(const pet of Object.values(manifest.pets)){
 for(const url of [pet.thumb,pet.portrait])execFileSync(process.execPath,[wrapper,'embed-prompt',path.resolve(url.slice(1)),'--prompt','Origin: existing approved game pet artwork '+pet.source+' SHA-256 '+pet.sourceSha256+'. Proportional downscale and WebP encoding only; no repaint.'],{stdio:'pipe'});
}
const files=(await fs.readdir(out,{recursive:true})).filter(x=>/\.(png|webp)$/.test(x));
manifest.files=await Promise.all(files.map(async file=>{const data=await fs.readFile(path.join(out,file));return {file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};}));
await fs.writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2));
const scan=execFileSync(process.execPath,[wrapper,'embed-prompt','--scan',path.resolve(out)],{encoding:'utf8'});
await fs.writeFile('docs/qa/pet-rework-20261114/unified/provenance-scan.txt',scan);console.log(scan);

