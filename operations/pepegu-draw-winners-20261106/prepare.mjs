import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const plan=JSON.parse(await fs.readFile(new URL('./plan.json',import.meta.url),'utf8'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),planHash=hash(plan);
const expected=[['62','숭구릭'],['76','랄네미탱탱'],['88','0수표'],['289','베베킹'],['1768','핫시'],['2420','블랙캐슬'],['4582','족단'],['4627','학벌'],['4651','세라네꼬라지'],['5362','점빡이']];
assert.deepEqual(plan.targets.map(t=>[t.userId,t.nickname]),expected);
const read=async file=>(await fs.readFile(new URL('../heukgu-draw-winners-20261102/'+file,import.meta.url),'utf8')).replaceAll('\r\n','\n');
const write=(file,text)=>fs.writeFile(new URL(file,import.meta.url),text,{flag:'wx'});
const replace=(s,from,to)=>{assert(s.includes(from),'Missing template fragment: '+from);return s.replaceAll(from,to);};
const base=s=>s.replaceAll('heukgu-draw','pepegu-draw').replaceAll('HEUKGU_DRAW','PEPEGU_DRAW').replaceAll('PET-HEUKGU','PET-PEPEGU').replaceAll('흑구','페페구').replaceAll('20261102','20261106').replaceAll('2026-11-02','2026-11-06');
let grant=base(await read('grant.mjs'));
grant=grant.replace(/([,:])3(?=[,)};])/g,'$110');
const start=grant.indexOf('export function validate(expected){'),end=grant.indexOf('function collection(row){');assert(start>0&&end>start);
grant=grant.slice(0,start)+`export function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');assert.equal(hash(plan),PLAN_HASH);assert.equal(hash(source),plan.sourceHash);assert.equal(plan.operationKey,OPERATION_KEY);assert.equal(source.operationKey,OPERATION_KEY);
 assert.equal(source.authorization,'지급해');assert.equal(plan.authorization,source.authorization);assert.equal(source.quantityPerAccount,1);assert.equal(source.recipientCount,10);assert.equal(source.ownership,'PERMANENT');assert.equal(plan.ownership,'PERMANENT');
 assert.equal(plan.delivery,'DIRECT_PET_COLLECTION');assert.equal(plan.petCode,PET);assert.equal(plan.petName,'페페구');assert.equal(plan.recipientCount,10);assert.equal(plan.totalPets,10);assert.deepEqual(plan.pending,[]);
 assert.deepEqual(TARGETS.map(t=>[t.userId,t.nickname]),${JSON.stringify(expected)});
 assert.deepEqual(source.draw.winners.map(t=>t.nickname),['족단','0수표','세라네꼬라지','베베킹','블랙캐슬','점빡이','학벌','핫시','랄네미탱탱','숭구릭']);assert.equal(source.draw.tickets,113);assert.equal(source.draw.participants,32);
 assert.equal(source.draw.resultSha256,'f94be8c50731146ea6a59f3c367f08033455af63ea6bdc4bb76e3062f80f85de');assert.equal(plan.drawResultSha256,source.draw.resultSha256);assert.equal(new Set(IDS).size,10);assert.equal(new Set(TARGETS.map(t=>t.identityHash)).size,10);
 for(const t of TARGETS){assert.equal(t.amount,1);assert.match(t.identityHash,/^[a-f0-9]{64}$/);const winner=one(source.draw.winners.filter(w=>w.userId===t.userId));assert.equal(winner.nickname,t.nickname);assert.equal(winner.rank,t.order);}
}
`+grant.slice(end);
grant=replace(grant,"'pet_potentials_v1:'+id]","'pet_potentials_v1:'+id,'pet_rental_v1:'+id]");
grant=replace(grant," const inventory=await q(db,"," const historicalReceipt=await q(db,'SELECT key,value FROM app_meta WHERE key=$1',[plan.priorBoxOperationKey]);\n const inventory=await q(db,");
grant=replace(grant,'settings,inventory,petReceipts','settings,historicalReceipt,inventory,petReceipts');
grant=replace(grant,'settings:s.settings,inventory:s.inventory','settings:s.settings,historicalReceipt:s.historicalReceipt,inventory:s.inventory');
grant=replace(grant," assert.equal(hash(s.settings),plan.settingsHash,'Pet settings changed');"," assert.equal(hash(s.settings),plan.settingsHash,'Pet settings changed');assert.equal(hash(s.historicalReceipt),plan.priorBoxReceiptHash,'Previous box receipt changed');");
grant=replace(grant,'const receipt={status:',"const receipt={ownership:'PERMANENT',drawResultSha256:plan.drawResultSha256,status:");
await write('grant.mjs',grant);
let run=base(await read('run.mjs'));
run=replace(run,'64de7fece5aace6a2f7c2f5b15632051e6f2993b8abfa129ceb3e3f54d670827',planHash);
run=replace(run,'totalPets:3','totalPets:10');run=replace(run,'count:3','count:10');
run=replace(run,"'preflight.mjs','lock-worker.mjs'","'preflight.mjs','preflight.json','grant.test.mjs','lock-worker.mjs'");
run=replace(run,"const noWrites={query:(sql,args)=>{assert.match(sql,/^\\s*SELECT\\b/i,'Replay must only SELECT');return db.query(sql,args);}};","const noWrites={query:(sql,args)=>{assert.match(sql,/^\\s*SELECT\\b/i,'Replay must only SELECT');assert(!/FOR UPDATE|FOR SHARE|pg_advisory/i.test(sql));return db.query(sql,args);}};");
run=replace(run," if(['read','verify'].includes(mode)){"," if(!['read','verify'].includes(mode)){const tests=JSON.parse(await fs.readFile(path.join(out,'tests.json'),'utf8'));assert.equal(tests.exitCode,0);assert.equal(tests.passed,4);assert.equal(tests.failed,0);assert.equal(tests.grantSha256,createHash('sha256').update(await fs.readFile(path.join(directory,'grant.mjs'))).digest('hex'));}\n if(['read','verify'].includes(mode)){");
// Drain an already running heartbeat before releasing its account locks.
run=replace(run,' clearInterval(heartbeat);',' clearInterval(heartbeat);\n while(pollPending)await new Promise(resolve=>setTimeout(resolve,25));');
await write('run.mjs',run);await write('lock-worker.mjs',await read('lock-worker.mjs'));await write('wrangler.jsonc',base(await read('wrangler.jsonc')));
const tests=await fs.readFile(new URL('../reversecall-streamer-box-100to5-20261105/test-run.mjs',import.meta.url),'utf8');await write('test-run.mjs',tests);
await write('plan-hash.json',JSON.stringify({sha256:planHash})+'\n');
console.log(JSON.stringify({planHash,recipients:10,totalPets:10,ownership:plan.ownership}));
