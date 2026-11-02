import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const plan=JSON.parse(await fs.readFile(new URL('plan.json',import.meta.url),'utf8'));
const planHash=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
assert.deepEqual(plan.targets.map(t=>[t.userId,t.nickname]),[['164','박사'],['4415','Moo날두'],['4705','˚쟁이。']]);
const read=async name=>(await fs.readFile(new URL('../heukgu-draw-winners-20261031/'+name,import.meta.url),'utf8')).replaceAll('\r\n','\n');
const write=(name,text)=>fs.writeFile(new URL(name,import.meta.url),text,{flag:'wx'});
function replace(text,from,to){assert(text.includes(from),'Missing template fragment: '+from);return text.replaceAll(from,to);}
const date=text=>text.replaceAll('20261031','20261102').replaceAll('2026-10-31','2026-11-02');

let grant=date(await read('grant.mjs'));
grant=replace(grant,"[['65','음순이'],['81','비쥬얼깡패'],['4908','굳건창수']]","[['164','박사'],['4415','Moo날두'],['4705','˚쟁이。']]");
grant=replace(grant,"['비쥬얼깡패','굳건창수','음순이']","['˚쟁이。','Moo날두','박사']");
grant=replace(grant,'source.draw.tickets,126','source.draw.tickets,153');
grant=replace(grant,'source.draw.participants,22','source.draw.participants,42');
await write('grant.mjs',grant);
let run=date(await read('run.mjs'));
run=replace(run,'67ac88490339210c87845ac00599f61c2052e85e58dbb3b1664d5d615b214ba2',planHash);
await write('run.mjs',run);
await write('lock-worker.mjs',await read('lock-worker.mjs'));
await write('wrangler.jsonc',date(await read('wrangler.jsonc')));
await write('.gitignore','evidence/\npreflight.json\ntests.log\n.wrangler/\n');
let tests=date(await read('grant.test.mjs'));
tests=replace(tests,'81','4705');
tests=replace(tests,'비쥬얼깡패','˚쟁이。');
await write('grant.test.mjs',tests);
let finalize=date(await read('finalize.mjs'));
finalize=replace(finalize,'비쥬얼깡패·굳건창수·음순이','˚쟁이。·Moo날두·박사');
finalize=replace(finalize,'응모권126장/22명','응모권153장/42명');
await write('finalize.mjs',finalize);
let record=date(await read('record-completion.mjs'));
record=replace(record,'비쥬얼깡패 ID81·굳건창수 ID4908·음순이 ID65','˚쟁이。 ID4705·Moo날두 ID4415·박사 ID164');
record=replace(record,'응모권126장/22명','응모권153장/42명');
record=replace(record,"['.gitignore','source.json','plan.json','grant.mjs','grant.test.mjs','README.md','completion.json']","['.gitignore','source.json','plan.json','preflight.mjs','prepare.mjs','grant.mjs','grant.test.mjs','run.mjs','lock-worker.mjs','wrangler.jsonc','finalize.mjs','record-completion.mjs','README.md','completion.json']");
await write('record-completion.mjs',record);
console.log(JSON.stringify({prepared:true,planHash,targets:plan.targets.map(t=>({userId:t.userId,nickname:t.nickname,amount:t.amount}))}));
