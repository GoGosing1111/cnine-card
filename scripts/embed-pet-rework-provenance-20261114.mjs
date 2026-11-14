import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=process.cwd(),dir=path.join(root,'assets/ui/pets/rework-20261114'),wrapper='C:/Users/User/Downloads/upload/cnine-card/tools/content-production/impeccable.mjs';
const prompts=JSON.parse(await fs.readFile('preview/pet-rework-20261114/prompts.json','utf8'));
for(const [key,names]of [['statDice',['stat-dice-source.png','stat-dice.webp']],['traitDice',['trait-dice-source.png','trait-dice.webp']],['hunter',['hunter-atlas-source.png','hunter-atlas.webp','hunter-icon.webp']],['luck',['luck-atlas-source.png','luck-atlas.webp','luck-icon.webp']]]){
 for(const name of names)execFileSync(process.execPath,[wrapper,'embed-prompt',path.join(dir,name),'--prompt',prompts[key]],{cwd:root,stdio:'pipe'});
}
const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8')),hash=async name=>createHash('sha256').update(await fs.readFile(path.join(dir,name))).digest('hex');
for(const row of manifest.entries){row.sourceImageGenHash??=row.sourceHash;row.sourceImageGenBytes??=row.sourceBytes;row.sourceHash=await hash(row.source);row.sourceBytes=(await fs.stat(path.join(dir,row.source))).size;row.runtimeHash=await hash(row.runtime);row.runtimeBytes=(await fs.stat(path.join(dir,row.runtime))).size;}
manifest.provenance='Exact ImageGen prompts embedded via Impeccable; sourceImageGenHash records original before metadata embedding.';
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(execFileSync(process.execPath,[wrapper,'embed-prompt','--scan',dir],{cwd:root,encoding:'utf8'}));
