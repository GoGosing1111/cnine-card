import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import plan from './plan.json' with {type:'json'};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),base='../cnine-streamer-box-named-20261103/';
const read=file=>fs.readFile(new URL(base+file,import.meta.url),'utf8'),write=(file,text)=>fs.writeFile(new URL(file,import.meta.url),text,{flag:'wx'});
const change=(s,from,to)=>{assert(s.includes(from),from);return s.replaceAll(from,to);};
let grant=await read('grant.mjs');
grant=change(grant,'ops:cnine-streamer-box-named:20261103:v1',plan.operationKey);
grant=change(grant,'OPS_CNINE_STREAMER_BOX_NAMED_20261103','OPS_CNINE_STREAMER_BOX_BINI_ADD2_20261103');
grant=change(grant,'b937a340fde8e72af2314969c56da30d36b9ebe375915cb43dd4ac5c08b3c4db',hash(plan));
grant=change(grant,'씨나인 스트리머 박스 명단 지급 · 309개 7박스 / 209개 5박스 / 109개 2박스 · 쟁이 7개만','비니 씨나인 스트리머 박스 2개 추가지급 · 기존 5개 지급 보존');
const start=grant.indexOf('export function validate(){'),end=grant.indexOf('export async function snapshot',start);assert(start>=0&&end>start);
grant=grant.slice(0,start)+`export function validate(){
 assert.equal(hash(PLAN),HASH,'Reviewed plan changed');assert.equal(hash(source),PLAN.sourceHash);assert.equal(PLAN.operationKey,OP);assert.equal(source.operationKey,OP);assert.equal(PLAN.itemCode,ITEM_CODE);assert.equal(source.itemCode,ITEM_CODE);assert.equal(PLAN.itemName,'씨나인 스트리머 박스');
 assert.equal(PLAN.delivery,'DIRECT_INVENTORY');assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.autoOpen,false);assert.equal(PLAN.recipientCount,1);assert.equal(PLAN.totalBoxes,2);assert.equal(source.authorization,'비니 2개 추가지급');
 assert.equal(PLAN.recipients.length,1);assert.deepEqual(IDS,['4595']);const t=PLAN.recipients[0];assert.equal(t.nickname,'비니');assert.equal(t.inputNickname,'비니');assert.equal(t.amount,2);assert.equal(t.marker,'ADDITIONAL');assert.equal(t.status,'ACTIVE');assert.match(t.identityHash,/^[a-f0-9]{64}$/);
 assert.equal(PLAN.parentOperation,'ops:cnine-streamer-box-named:20261103:v1');assert.equal(PLAN.parentOperation,source.parentOperation);assert.equal(PLAN.priorGranted,5);assert.equal(PLAN.combinedGranted,7);assert.match(PLAN.parentReceiptHash,/^[a-f0-9]{64}$/);
}
`+grant.slice(end);
grant=grant.replace(/\b37\b/g,'1').replace(/\b222\b/g,'2');
grant=change(grant,"item:'SELECT code,name,description,is_active FROM inventory_items WHERE code=$2'","item:'SELECT code,name,description,is_active FROM inventory_items WHERE code=$2',\n  parent:'SELECT key,value FROM app_meta WHERE key=$3'");
grant=change(grant,'[IDS,ITEM_CODE])).data','[IDS,ITEM_CODE,PLAN.parentOperation])).data');
grant=change(grant,"validate();r??=await receipt(c);","validate();assert.equal(hash(parse(one(await q(c,'SELECT value FROM app_meta WHERE key=$1',[PLAN.parentOperation])).value)),PLAN.parentReceiptHash,'Original 37-person receipt changed');r??=await receipt(c);");
grant=change(grant,'const before=await snapshot(c);assert.equal(before.users.length,1);',"const before=await snapshot(c);assert.equal(hash(parse(one(before.parent).value)),PLAN.parentReceiptHash,'Original 37-person receipt changed');assert.equal(before.users.length,1);");
await write('grant.mjs',grant);
for(const file of ['locks.mjs','lock-worker.mjs','wrangler.jsonc','run.mjs','test-run.mjs','.gitignore']){
 let s=await read(file);s=s.replaceAll('cnine-streamer-box-named-20261103','cnine-streamer-box-bini-add2-20261103').replaceAll("'cnine-streamer-box-named-'","'cnine-streamer-box-bini-add2-'").replace('our 37 exact lock rows','our exact account lock row');await write(file,s);
}
let test=await read('grant.test.mjs');
test=change(test,'const originalHash=hash(plan);plan.logFloor=',"const originalHash=hash(plan);const parent={status:'COMPLETED',operationKey:plan.parentOperation,auditId:'54105',totalBoxes:222,grants:[{userId:'4595',nickname:'비니',amount:5}]};plan.parentReceiptHash=hash(parent);plan.logFloor=");
test=change(test,"const ops=await import(pathToFileURL(join(dir,'grant.mjs')).href)","const ops=await import(pathToFileURL(join(dir,'grant.mjs')).href)");
test=change(test,"await db.query('INSERT INTO inventory_items VALUES($1,$2,1,$3)'","await db.query('INSERT INTO app_meta VALUES($1,$2,$3)',[plan.parentOperation,JSON.stringify(parent),'original']);\n await db.query('INSERT INTO inventory_items VALUES($1,$2,1,$3)'");
test=change(test,"37 recipients receive exactly 222 new CNINE boxes; duplicate 쟁이 receives 7 once; balances and other inventories remain intact","Bini receives exactly 2 additional CNINE boxes once; existing receipt, balances and other inventories remain intact");
test=change(test,'dry.verification.totalBoxes,222','dry.verification.totalBoxes,2');test=change(test,'result.verification.recipients,37','result.verification.recipients,1');test=change(test,'after.inventory_logs.length,37','after.inventory_logs.length,1');test=change(test,'after.app_meta.length,1','after.app_meta.length,2');
test=change(test,'reduce((n,g)=>n+g.amount,0),222','reduce((n,g)=>n+g.amount,0),2');test=change(test,"g.userId==='4705'","g.userId==='4595'");test=change(test,".amount,7)",".amount,2)");test=change(test,'[[7,23],[5,11],[2,3]]','[[2,1]]');test=change(test,'verification.totalBoxes,222','verification.totalBoxes,2');
test=test.replaceAll('4598','4595').replaceAll('4705','4595').replaceAll('4562','4595').replaceAll('˚쟁이。','비니');
test=change(test,"test('unsafe balances and orphan ledger records abort without partial credit'","test('unsafe balances, orphan ledgers and changed original receipt abort without partial credit'");
test=change(test,"const before=await snapshot(db);await assert.rejects(transaction(db),/Unsupported inventory/)","const before=await snapshot(db);await assert.rejects(transaction(db),/Unsupported inventory/)");
await write('grant.test.mjs',test);
console.log(JSON.stringify({prepared:true,userId:'4595',amount:2,planHash:hash(plan)}));
