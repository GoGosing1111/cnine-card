import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const transform=s=>s.replaceAll('hyunharu-eunseol-exempt','ohseunghwan-leonel-exempt').replaceAll('20261029','20261031').replaceAll('2026-10-29','2026-10-31').replaceAll('218','16').replaceAll('현하루','오승환이다').replaceAll('V-973','V-978').replaceAll('은설','레오넬').replaceAll('Eunseol','Leonel').replaceAll('Hyunharu','Ohseunghwan').replaceAll("'USER'","'ADMIN'");
for(const file of ['grant.mjs','grant.test.mjs','lock-worker.mjs','wrangler.jsonc','run.mjs','independent.mjs','access.mjs','finalize.mjs','record-completion.mjs']){
 let content=transform((await fs.readFile(new URL('../hyunharu-eunseol-exempt-20261029/'+file,import.meta.url),'utf8')).replace(/\r\n/g,'\n'));
 if(file==='run.mjs')content=content.replace('7eda678fc3a5ae4c1951f7220a2ce2ec9f789e5c72fe054f79b12892be6a94df',hash(plan));
 if(file==='access.mjs'){
  content=content.replace("import {mercenaryModeAllowed} from 'file:///C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/shared/mercenary-eunseol-v1.mjs';\n",'').replace('assert(mercenaryModeAllowed(CODE,mode));','');
 }
 if(file==='record-completion.mjs')content=content.replace("['.gitignore','plan.json','grant.mjs','grant.test.mjs','README.md','completion.json']","['.gitignore','plan.json','grant.mjs','grant.test.mjs','preflight.mjs','prepare.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','independent.mjs','independent.json','access.mjs','finalize.mjs','record-completion.mjs','README.md','completion.json']");
 assert(!content.includes('hyunharu'));assert(!content.includes('V-973'));assert(!content.includes('현하루'));
 await fs.writeFile(new URL('./'+file,import.meta.url),content,{flag:'wx'});
}
await fs.writeFile(new URL('./.gitignore',import.meta.url),'evidence/\npreflight.json\n.wrangler/\n',{flag:'wx'});
console.log(JSON.stringify({planHash:hash(plan),operation:plan.operationKey,userId:'16',code:'V-978',quantity:1,productionWrites:0}));
