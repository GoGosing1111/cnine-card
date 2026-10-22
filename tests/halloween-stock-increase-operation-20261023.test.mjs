import test from 'node:test';
import assert from 'node:assert/strict';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {HALLOWEEN_PACK_KEY} from '../shared/mercenary-halloween-pack-v1.mjs';
import {ACTION,AUTHORIZATION,OP,TARGETS,documentHash,prepareStockIncrease,increaseStock,verify} from '../scripts/ops/halloween-stock-increase-20261023.mjs';

const unchangedTables=['user_mercenary_cards_v1','mercenary_limited_issues_v1','mercenary_card_acquisitions_v1','cnine_user_inventory','inventory_logs','coin_logs','users','joint_operations_v1'];
const snapshot=async f=>{
 const result={};
 for(const table of ['app_meta','mercenary_limited_stock_v1','admin_logs',...unchangedTables])result[table]=(await f.pg.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;
 return result;
};
async function beforeIncrease(t){
 const f=await halloweenFixture(t);
 await f.pg.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'; ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'; UPDATE users SET role='OWNER' WHERE id=1; ALTER TABLE app_meta ADD COLUMN updated_at TEXT");
 for(const target of TARGETS){
  f.settings.stockLimits[target.code]=target.before;
  await f.pg.query('UPDATE mercenary_limited_stock_v1 SET stock_limit=$1 WHERE code=$2',[target.before,target.code]);
 }
 // Create genuine receipts, holdings, balances and last_token values before the operation.
 for(const target of TARGETS){
  f.settings.cardRatesPpm=Object.fromEntries(Object.keys(f.settings.cardRatesPpm).map(code=>[code,code===target.code?1000000:0]));
  await f.configure(30);
  const result=await f.service.open(f.env,{id:2},{...f.body(),expectedRevision:30});
  assert.equal(result.draws[0].mercenaryCode,target.code);
  assert.equal(result.draws[0].serial,1);
 }
 await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,'MASTER_STAR',7,3)").run();
 const raw=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).rows[0].value;
 return {...f,raw,document:JSON.parse(raw),options:{expectedDocumentHash:documentHash(raw)}};
}

test('preparation raises only the ten approved limits by 21 without modifying the source settings',async t=>{
 const f=await beforeIncrease(t),source=structuredClone(f.document.settings),next=prepareStockIncrease(source);
 assert.deepEqual(source,f.document.settings);
 assert.equal(TARGETS.reduce((sum,target)=>sum+target.after-target.before,0),21);
 assert.equal(TARGETS.length,10);
 for(const target of TARGETS)assert.equal(next.stockLimits[target.code],target.after);
 const restored={...next,stockLimits:{...next.stockLimits,...Object.fromEntries(TARGETS.map(target=>[target.code,target.before]))}};
 assert.deepEqual(restored,source);
 assert.throws(()=>prepareStockIncrease(next),/Reviewed limit changed/);
});

test('stale settings and dry runs roll back every stock, receipt, holding and balance change',async t=>{
 const f=await beforeIncrease(t),before=await snapshot(f);
 await assert.rejects(increaseStock(f.pg,{...f.options,expectedDocumentHash:'stale',dryRun:false}),/Pack settings changed/);
 assert.deepEqual(await snapshot(f),before);
 const result=await increaseStock(f.pg,f.options);
 assert.equal(result.dryRun,true);assert.equal(result.replayed,false);assert.equal(result.verified,true);
 assert.equal(result.receipt.stockAdded,21);assert.equal(result.receipt.grants,0);assert.equal(result.currentRevision,31);
 assert.deepEqual(await snapshot(f),before);
});

test('failures after partial stock updates, settings, audit or operation receipt leave the operation atomic',async t=>{
 const f=await beforeIncrease(t),before=await snapshot(f);
 for(const failure of [
  {prefix:'UPDATE mercenary_limited_stock_v1',occurrence:6},
  {prefix:'UPDATE app_meta',occurrence:1},
  {prefix:'INSERT INTO admin_logs',occurrence:1},
  {prefix:'INSERT INTO app_meta',occurrence:1}
 ]){
  let matched=0;
  const failing={query:(sql,args)=>sql.startsWith(failure.prefix)&&++matched===failure.occurrence?Promise.reject(Error('INJECTED_FAILURE')):f.pg.query(sql,args)};
  await assert.rejects(increaseStock(failing,{...f.options,dryRun:false}),/INJECTED_FAILURE/);
  assert.equal(matched,failure.occurrence);
  assert.deepEqual(await snapshot(f),before);
 }
});

test('commit adds the reviewed capacity, preserves issues and account state, and replay performs only reads',async t=>{
 const f=await beforeIncrease(t),before=await snapshot(f),result=await increaseStock(f.pg,{...f.options,dryRun:false}),after=await snapshot(f);
 assert.equal(result.verified,true);assert.equal(result.replayed,false);assert.equal(result.dryRun,false);
 assert.equal(result.currentRevision,31);assert.equal(result.receipt.operationKey,OP);assert.equal(result.receipt.authorization,AUTHORIZATION);
 assert.equal(result.receipt.stockAdded,21);assert.equal(result.receipt.grants,0);
 assert.equal(result.receipt.issuesBeforeHash,result.receipt.issuesAfterHash);
 for(const table of unchangedTables)assert.deepEqual(after[table],before[table],table);
 const normalized=rows=>rows.map(row=>({...row,stock_limit:row.stock_limit===null?null:Number(row.stock_limit),issued:Number(row.issued),revision:Number(row.revision)}));
 assert.deepEqual(normalized(after.mercenary_limited_stock_v1),normalized(before.mercenary_limited_stock_v1).map(row=>{
  const target=TARGETS.find(target=>target.code===row.code);
  return target?{...row,stock_limit:target.after,revision:row.revision+1}:row;
 }));
 for(const target of TARGETS){
  const old=before.mercenary_limited_stock_v1.find(row=>row.code===target.code),current=after.mercenary_limited_stock_v1.find(row=>row.code===target.code);
  assert(old.last_token);assert.equal(current.last_token,old.last_token);assert.equal(current.issued,old.issued);
  assert.equal(result.stock.find(row=>row.code===target.code).remaining,target.after-1);
 }
 const oldMeta=before.app_meta.filter(row=>row.key!==HALLOWEEN_PACK_KEY),newMeta=after.app_meta.filter(row=>![HALLOWEEN_PACK_KEY,OP].includes(row.key));
 assert.deepEqual(newMeta,oldMeta);
 const document=JSON.parse(after.app_meta.find(row=>row.key===HALLOWEEN_PACK_KEY).value);
 assert.deepEqual(document,{...f.document,settings:prepareStockIncrease(f.document.settings),revision:31,updatedAt:document.updatedAt,updatedBy:1,lastRequestId:OP});
 assert(Number.isFinite(Date.parse(document.updatedAt)));
 assert.equal(after.admin_logs.length,before.admin_logs.length+1);
 assert.equal(after.admin_logs.at(-1).action_type,ACTION);assert.equal(after.admin_logs.at(-1).target_id,OP);
 assert.equal((await verify(f.pg)).verified,true);
 const readOnly={query:(sql,args)=>{assert.match(sql,/^SELECT\b/);return f.pg.query(sql,args);}};
 for(const dryRun of [false,true]){
  const replay=await increaseStock(readOnly,{expectedDocumentHash:'already-applied',dryRun});
  assert.equal(replay.replayed,true);assert.equal(replay.dryRun,dryRun);assert.equal(replay.currentRevision,31);
  assert.deepEqual(await snapshot(f),after);
 }
});

test('a stock counter mismatch and noncontinuous issue serials are rejected without writes',async t=>{
 const f=await beforeIncrease(t);
 await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=2 WHERE code='V-980'");
 const mismatch=await snapshot(f);
 await assert.rejects(increaseStock(f.pg,{...f.options,dryRun:false}),/Counter must match genuine issues/);
 assert.deepEqual(await snapshot(f),mismatch);
 await f.pg.query("UPDATE mercenary_limited_stock_v1 SET issued=1 WHERE code='V-980'");
 await f.pg.query("UPDATE mercenary_limited_issues_v1 SET serial=2 WHERE code='V-980'");
 const serialGap=await snapshot(f);
 await assert.rejects(increaseStock(f.pg,{...f.options,dryRun:false}),/Issuance serials must be continuous/);
 assert.deepEqual(await snapshot(f),serialGap);
});
