import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const OP='ops:gingdeodeum-blackcrown-diim-grant:20261101:v1';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const before=JSON.parse(await fs.readFile(new URL('./preflight.json',import.meta.url),'utf8'));
assert.equal(before.user.id,'5877');assert.equal(before.user.nickname,'깅더듬');assert.equal(before.prior.length,0);assert.equal(before.holding.length,0);
assert.deepEqual(before.stock.map(s=>[s.code,Number(s.stock_limit),Number(s.issued)]),[['V-953',40,40]]);
const plan={operationKey:OP,authorization:'깅더듬 계정에 블랙크라운 ss 리미티드 디임 지급해',stockAuthorization:'기존 한도는 그대로 두고 예외로 1장 지급',stockPolicy:'EXEMPT_NO_COUNTER_CHANGE',cost:0,automaticLoadout:false,sendMessages:false,totalQuantity:1,recipientCount:1,recipients:[before.user],grants:[{userId:'5877',nickname:'깅더듬',code:'V-953',name:'디임',title:'블랙크라운 SS 리미티드',rank:'SS',edition:'LIMITED',season:'BLACKCROWN',quantity:1}]};
await fs.writeFile(new URL('./plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
const transform=s=>s.replaceAll('ops:ohseunghwan-leonel-exempt-grant:20261031:v1',OP)
 .replaceAll('ohseunghwan-leonel-exempt-20261031','gingdeodeum-blackcrown-diim-20261101')
 .replaceAll('오승환이다','깅더듬').replaceAll('레오넬','디임').replaceAll('Leonel','Blackcrown Diim')
 .replaceAll('V-978','V-953').replaceAll("'16'","'5877'")
 .replaceAll(':16',':5877').replaceAll('test-16','test-5877')
 .replaceAll("'ADMIN'","'USER'");
for(const file of ['grant.mjs','grant.test.mjs','lock-worker.mjs','wrangler.jsonc','run.mjs','access.mjs']){
 let content=transform((await fs.readFile(new URL('../ohseunghwan-leonel-exempt-20261031/'+file,import.meta.url),'utf8')).replace(/\r\n/g,'\n'));
 if(file==='grant.mjs'){
  content=content.replace("PLAN.grants.flatMap(g=>[g.code,'SSS_MIRACLE_CUBE:'+g.code])","PLAN.grants.map(g=>g.code)")
   .replace("'mercenary_blackcrown_pack_v1'","'mercenary_blackcrown_ss_pack_v1'");
  content=content.replace("assert.equal(PLAN.stockPolicy,'EXEMPT_NO_COUNTER_CHANGE');","assert.equal(PLAN.stockAuthorization,'기존 한도는 그대로 두고 예외로 1장 지급');assert.equal(PLAN.stockPolicy,'EXEMPT_NO_COUNTER_CHANGE');");
  content=content.replace("assert.equal(g.code,'V-953');","assert.equal(g.code,'V-953');assert.equal(g.rank,'SS');assert.equal(g.season,'BLACKCROWN');");
  content=content.replace("if(old)assert.equal(Number(old.duplicate_count),n-1);","if(old)assert.equal(Number(old.duplicate_count),n-1);assert.equal(n,0,'Blackcrown SS already owned; do not add a duplicate');");
 }
 if(file==='grant.test.mjs'){
  content=content.replaceAll('(16,','(5877,').replaceAll('WHERE id=16','WHERE id=5877')
   .replace("'V-953',3,3,5,'old-stock'","'V-953',40,40,5,'old-stock'")
   .replace(",('SSS_MIRACLE_CUBE:V-953',5,0,1,'cube-stock')",'');
  const start=content.indexOf("test('existing copy is incremented once");
  const end=content.indexOf("test('wrong plan",start);assert(start>0&&end>start);
  content=content.slice(0,start)+`test('an already-owned Blackcrown SS is rejected without adding a duplicate or changing growth',async()=>{
 const {db,client}=await fixture();try{
  await db.exec("INSERT INTO user_mercenary_cards_v1 VALUES(5877,'V-953',1,0,'original','old');INSERT INTO user_mercenary_levels_v1 VALUES(5877,'V-953',16);INSERT INTO user_mercenary_growth_v1 VALUES(5877,'V-953',77)");
  const before=await full(client);await db.exec('BEGIN');await assert.rejects(api.grant(client,api.HASH,options()),/already owned/);await db.exec('ROLLBACK');assert.deepEqual(await full(client),before);
 }finally{await db.close();}
});
`+content.slice(end);
 }
 if(file==='run.mjs')content=content.replace('b6600b7459ccbaa8095edc1f03fd8bbfe4e7312c7c107f320cc3e65dffc509e3',hash(plan));
 if(file==='lock-worker.mjs')content=content.replace('const ids=[16]','const ids=[5877]');
 if(file==='access.mjs')content=content.replace('const ID=16','const ID=5877');
 assert(!content.includes('ohseunghwan'));assert(!content.includes('V-978'));assert(!content.includes('오승환이다'));
 await fs.writeFile(new URL('./'+file,import.meta.url),content,{flag:'wx'});
}
await fs.writeFile(new URL('./.gitignore',import.meta.url),'evidence/\npreflight.json\n.wrangler/\n',{flag:'wx'});
console.log(JSON.stringify({operationKey:OP,planHash:hash(plan),userId:'5877',nickname:'깅더듬',code:'V-953',name:'디임',rank:'SS',season:'BLACKCROWN',quantity:1,stockPolicy:plan.stockPolicy,productionWrites:0}));
