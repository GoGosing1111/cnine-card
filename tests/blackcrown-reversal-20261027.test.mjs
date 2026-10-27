import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregate,audit,TARGETS,PLAN} from '../scripts/ops/blackcrown-reversal-20261027.mjs';
test('exact 15 payment receipts aggregate to 7366 draws and 1489 acquired cards',()=>{
 assert.equal(audit.records.reduce((n,r)=>n+r.count,0),7366);
 assert.deepEqual(TARGETS.map(t=>[t.userId,t.refund,Object.values(t.cards).reduce((n,v)=>n+v,0)]),[['1','15000000000',3],['91','10989000000000',1478],['4199','45000000000',8]]);
 assert.equal(TARGETS.reduce((n,t)=>n+BigInt(t.refund),0n).toString(),PLAN.totalRefund);
 assert.equal(TARGETS[1].cards['V-021'],2);assert.equal(TARGETS[1].cards['V-046'],2);
});
test('misses do not become acquisitions, and bulk counts are not mistaken for one card',()=>{const t=TARGETS[0];assert.equal(t.acquisitionIds.length,3);assert.deepEqual(t.acquisitionIds.map(a=>a.id.split(':').at(-1)),['1','6','9']);assert(TARGETS[1].acquisitionIds.some(a=>a.quantity>1&&a.id.includes(':bulk:')));});
test('duplicate request IDs cannot be refunded twice',()=>{const rows=structuredClone(audit.records);rows[1].requestId=rows[0].requestId;assert.throws(()=>aggregate(rows));});
test('unproven amounts and corrupted reward counts fail closed',()=>{const rows=structuredClone(audit.records);rows[0].coinCost='1';assert.throws(()=>aggregate(rows));rows[0]=structuredClone(audit.records[0]);rows[0].normalDraws[0].quantity++;assert.throws(()=>aggregate(rows));});
test('a limited issuance is never silently treated as an ordinary reclaim',()=>{const rows=structuredClone(audit.records);rows[0].normalDraws[0].edition='LIMITED';assert.throws(()=>aggregate(rows));});
