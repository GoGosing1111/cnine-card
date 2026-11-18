import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {build} from 'esbuild';
import {connect,safe,out,source,save,git,hash,cloud} from './common.mjs';
assert(!fs.existsSync(path.join(out,'baseline.json')));assert.equal(git('status','--porcelain'),'');
const head=git('rev-parse','HEAD');git('fetch','origin','main');assert.equal(git('rev-parse','origin/main'),head);
await build({stdin:{contents:"export * from './shared/support-package-v1.mjs';export {handleSupportPackage} from './functions/_support_package.js';",resolveDir:source},bundle:true,platform:'node',format:'esm',packages:'external',outfile:path.join(out,'runtime-before.mjs'),logLevel:'silent'});
const {supportPackageBonusState}=await import('./runtime-before.mjs'),db=connect();
try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const prefix='support_package_bonus_20261115_v1:',counters=(await db.query("SELECT m.key,m.value,u.id::text,u.nickname,u.status FROM app_meta m JOIN users u ON m.key=$1||u.id WHERE m.key >= $1 AND m.key < $2 ORDER BY u.id",[prefix,prefix+'~'])).rows;
 const progress=counters.map(r=>{const state=supportPackageBonusState(JSON.parse(r.value));return {userId:r.id,nickname:r.nickname,status:r.status,raw:r.value,paidPurchases:state.paidPurchases,totalBonusCoins:state.totalBonusCoins,totalBonusCubes:state.totalBonusCubes??0};});
 const pending=(await db.query("SELECT p.key,o.value FROM app_meta p JOIN app_meta o ON o.key='support_package_order_v1:'||p.value WHERE p.key >= 'support_package_pending_v1:' AND p.key < 'support_package_pending_v1:~' ORDER BY p.key")).rows;
 assert.deepEqual((await db.query('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0')).rows,[]);await db.query('ROLLBACK');
 save('preflight',{at:new Date().toISOString(),head,progress,pending,preservedSnapshotHash:hash({counters,pending}),productionWrites:0});
 const production=await cloud();save('baseline',{head,production,at:new Date().toISOString()});
 console.log(JSON.stringify({head,accounts:progress.length,completedTen:progress.filter(p=>p.paidPurchases>=10).map(p=>({id:p.userId,count:p.paidPurchases})),inProgress:progress.filter(p=>p.paidPurchases<10).length,pending:pending.length,writes:0}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end();}
