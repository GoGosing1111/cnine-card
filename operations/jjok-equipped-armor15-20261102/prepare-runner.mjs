import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PLAN_HASH} from './grant.mjs';
const read=async name=>(await fs.readFile(new URL('../heukgu-draw-winners-20261102/'+name,import.meta.url),'utf8')).replaceAll('\r\n','\n');
const write=(name,text)=>fs.writeFile(new URL(name,import.meta.url),text,{flag:'wx'});
function replace(text,from,to){assert(text.includes(from),'Missing fragment: '+from);return text.replaceAll(from,to);}
let run=await read('run.mjs');
run=replace(run,'64de7fece5aace6a2f7c2f5b15632051e6f2993b8abfa129ceb3e3f54d670827',PLAN_HASH);
run=replace(run,"'source.json','preflight.mjs'","'discover.mjs'");
run=replace(run,'totalPets:3','changedEquipment:4');run=replace(run,'count:3','count:1');
run=replace(run,'domains.collection','domains.inventory');run=replace(run,'Pet collection synchronization must advance','Equipment inventory synchronization must advance');
run=replace(run,"const after=await full();assert.equal(after.sync.length,before.sync.length);","const after=await full();assert.equal(after.sync.length,before.sync.length);if(before.state.ranked.length){assert.equal(after.state.ranked.length,1);assert(BigInt(after.state.ranked[0].source_version)>BigInt(before.state.ranked[0].source_version),'Ranked equipment cache must refresh');}");
await write('run.mjs',run);
let worker=await read('lock-worker.mjs');worker=replace(worker,'plan.targets.map(t=>t.userId)','[plan.recipient.id]');await write('lock-worker.mjs',worker);
await write('wrangler.jsonc',replace(await read('wrangler.jsonc'),'heukgu-draw-winners-20261102','jjok-equipped-armor15-20261102'));
await write('.gitignore','evidence/\npreflight.json\ntests.log\n.wrangler/\n');
console.log(JSON.stringify({prepared:true,planHash:PLAN_HASH}));
