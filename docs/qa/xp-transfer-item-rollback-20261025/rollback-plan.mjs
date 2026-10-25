import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:mercenary-xp-transfer-rollback:20261025:v1';
export const IDS=['115','303','1195','4391','4627','4668','4866','4917'];
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const parse=value=>typeof value==='string'?JSON.parse(value):value;
export const stateOf=row=>({level:Number(row.level)===20&&Number(row.breakthrough_mask)===15?21:Number(row.level),experience:Number(row.experience),breakthroughMask:Number(row.breakthrough_mask),revision:Number(row.revision)});
export function planRollback(snapshot){
 const operations=snapshot.operations.map(row=>({...row,plan:parse(row.plan_json)}));
 const transfers=operations.filter(r=>r.status==='COMPLETED'&&['EXTRACT','INFUSE'].includes(r.plan.action));
 assert.equal(snapshot.itemLogs.length,0,'An acquired potion needs individual reconciliation');
 assert.equal(snapshot.inventory.length,0,'A real item holder needs individual reconciliation');
 assert.deepEqual([...new Set(transfers.map(r=>String(r.user_id)))].sort((a,b)=>Number(a)-Number(b)),IDS);
 const pairs=new Map(),refundMap=new Map();
 for(const r of transfers){const p=r.plan,key=r.user_id+':'+p.mercenaryCode,prior=pairs.get(key);if(!prior||prior.before.revision>p.result.before.revision)pairs.set(key,{userId:String(r.user_id),code:p.mercenaryCode,before:p.result.before});}
 const restores=[];
 for(const pair of pairs.values()){
  const rows=operations.filter(r=>String(r.user_id)===pair.userId&&r.plan.mercenaryCode===pair.code&&r.status==='COMPLETED'&&r.plan.result.before.revision>=pair.before.revision).sort((a,b)=>a.plan.result.before.revision-b.plan.result.before.revision);
  let current=pair.before;
  for(const r of rows){
   const {result,action}=r.plan;assert(['TRAIN','BREAKTHROUGH','EXTRACT','INFUSE'].includes(action));assert.deepEqual(result.before,current,'Receipt chain mismatch: '+pair.userId+':'+pair.code);assert.equal(result.after.revision,current.revision+1);
   assert(!result.cost&&!result.coinCost&&!result.consumedCoin,'Unexpected economic effect');current=result.after;
   for(const m of result.consumed||[]){assert.equal(action,'TRAIN');assert(Number.isSafeInteger(m.quantity)&&m.quantity>0);assert.equal(m.totalBefore-m.duplicatesBefore,1);const key=pair.userId+':'+m.code,refund=refundMap.get(key)||{userId:pair.userId,code:m.code,quantity:0};refund.quantity+=m.quantity;refundMap.set(key,refund);}
  }
  const stored=snapshot.levels.filter(r=>String(r.user_id)===pair.userId&&r.mercenary_code===pair.code);assert.equal(stored.length,1);assert.deepEqual(stateOf(stored[0]),current,'Live level diverged: '+pair.userId+':'+pair.code);
  const pending=operations.filter(r=>String(r.user_id)===pair.userId&&r.plan.mercenaryCode===pair.code&&r.status==='PENDING');
  restores.push({...pair,current,restored:{...pair.before,revision:current.revision+1},operations:[...rows,...pending].map(({plan,...r})=>r)});
 }
 const memories=snapshot.memory.filter(r=>IDS.includes(r.key.split(':').at(-1))).map(r=>{
  const original=parse(r.value),uid=r.key.split(':').at(-1),allowed=restores.filter(p=>p.userId===uid).map(p=>p.code);
  assert(Object.keys(original.mercenaries).every(c=>allowed.includes(c)),'Unknown transfer history');
  return {key:r.key,before:r.value,after:{version:original.version,revision:original.revision+1,potions:[],mercenaries:{}}};
 });
 assert.equal(memories.length,IDS.length);assert.equal(restores.length,13);
 const refunds=[...refundMap.values()].sort((a,b)=>Number(a.userId)-Number(b.userId)||a.code.localeCompare(b.code));
 return {operationKey:OP,ids:IDS,transfers:transfers.length,restores:restores.sort((a,b)=>Number(a.userId)-Number(b.userId)||a.code.localeCompare(b.code)),refunds,memories};
}
