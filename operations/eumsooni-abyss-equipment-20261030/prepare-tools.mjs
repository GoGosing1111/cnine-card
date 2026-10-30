import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {HASH} from './grant.mjs';
const transform=s=>s.replaceAll('hyunharu-eunseol-exempt-20261029','eumsooni-abyss-equipment-20261030').replaceAll('ops:hyunharu-eunseol-exempt-grant:20261029:v1','ops:eumsooni-abyss-equipment:20261030:v1');
for(const name of ['run.mjs','lock-worker.mjs','wrangler.jsonc']){
 let s=transform(await fs.readFile(new URL('../hyunharu-eunseol-exempt-20261029/'+name,import.meta.url),'utf8'));
 if(name==='lock-worker.mjs')s=s.replace('ids=[218]','ids=[65]');
 if(name==='run.mjs')s=s.replace('7eda678fc3a5ae4c1951f7220a2ce2ec9f789e5c72fe054f79b12892be6a94df',HASH).replace("'preflight.mjs','lock-worker.mjs'","'discover.mjs','lock-worker.mjs'");
 assert(!s.includes('hyunharu'));await fs.writeFile(new URL('./'+name,import.meta.url),s,{flag:'wx'});
}
console.log(JSON.stringify({planHash:HASH,prepared:true}));
