import assert from 'node:assert/strict';import {read,save,hash} from './common.mjs';
import {SUPPORT_PACKAGE,supportPackageBonusState,supportPackageWithBonus,supportPackageCycleProgress,supportPackageAdvanceBonus} from '../coop-pc-performance-20261108/source/shared/support-package-v1.mjs';
const input=read('preflight'),rows=input.progress.map(p=>{const before=JSON.parse(p.raw),digest=hash(before),state=supportPackageBonusState(before),quote=supportPackageWithBonus(SUPPORT_PACKAGE,state).purchaseBonus,cycle=supportPackageCycleProgress(state);
 assert.equal(hash(before),digest);assert.equal(cycle.paidPurchases,p.paidPurchases>=10?0:p.paidPurchases);
 if(p.paidPurchases>=10){assert.equal(quote.coins,'1000000000000000');assert.equal(quote.cubes,5);}
 const after=supportPackageAdvanceBonus(state,quote,{orderId:'ISOLATED_PREVIEW_ONLY',now:0});assert.equal(after.paidPurchases,p.paidPurchases+1);assert.equal(after.totalBonusCoins,(BigInt(p.totalBonusCoins)+BigInt(quote.coins)).toString());
 return {userId:p.userId,nickname:p.nickname,originalPaidPurchases:p.paidPurchases,cycle,originalStateHash:digest,nextBonusCoins:quote.coins,nextBonusCubes:quote.cubes};
});save('progress-preview',{at:new Date().toISOString(),sourceSnapshotAt:input.at,rows,restartAtOne:rows.filter(r=>r.originalPaidPurchases>=10).length,preservePartial:rows.filter(r=>r.originalPaidPurchases<10).length,productionWrites:0});console.log(JSON.stringify({accounts:rows.length,restartAtOne:rows.filter(r=>r.originalPaidPurchases>=10).length,preservePartial:rows.filter(r=>r.originalPaidPurchases<10).length}));
