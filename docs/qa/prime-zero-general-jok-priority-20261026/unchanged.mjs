import fs from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import * as current from '../../../functions/_battle_v2_preview.js';
import {snapshot,roster,scenarios} from '../../../scripts/measure-razak-balance-20261026.mjs';
const old=await import(pathToFileURL(process.env.QA_BASELINE).href),hash=s=>createHash('sha256').update(s).digest('hex'),rows=[];
function check(method,args,info){const before=hash(JSON.stringify(old[method](args))),after=hash(JSON.stringify(current[method](args)));assert.equal(after,before,JSON.stringify(info));rows.push({...info,sha256:after});}
const cards=scenarios[1].cards;
for(const m of roster)for(const level of [1,21])for(const seed of [621001,621003]){
 const mercenary=snapshot(m.code,level,'PVE',level===21?1e6:0);
 check('createPveBattleV2',{cards,mercenary,monster:{id:1,battle_power:1.6e10},seed},{mode:'PVE',code:m.code,level,seed});
 check('createPvpBattleV2',{attackerCards:cards,defenderCards:cards,attackerMercenary:snapshot(m.code,level,'PVP'),defenderMercenary:snapshot('V-978',level,'PVP'),seed},{mode:'PVP',code:m.code,opponent:'V-978',level,seed});
}
for(const code of ['V-975','V-976'])for(const other of roster.filter(m=>m.code!=='V-974'))for(const level of [1,21])for(const side of ['A','B'])for(const seed of [622001,622003]){
 const a=snapshot(code,level,'PVP',level===21?1e6:0),b=snapshot(other.code,level,'PVP',level===21?1e6:0);
 check('createPvpBattleV2',{attackerCards:cards,defenderCards:cards,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='B'?a:b,seed},{mode:'PVP',code,opponent:other.code,side,level,seed});
}
fs.writeFileSync(process.argv[2],JSON.stringify({status:'PASS',total:rows.length,baselineCommit:'4e52cc3bc',baselineSha256:hash(fs.readFileSync(process.env.QA_BASELINE)),rows},null,2)+'\n');console.log(JSON.stringify({status:'PASS',unchangedBattles:rows.length}));
