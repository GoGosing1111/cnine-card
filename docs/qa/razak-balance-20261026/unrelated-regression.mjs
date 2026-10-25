import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPvpBattleV2,createPveBattleV2} from '../../../functions/_battle_v2_preview.js';
import {roster,snapshot,scenarios} from '../../../scripts/measure-razak-balance-20261026.mjs';
const others=roster.filter(c=>c.code!=='V-058'),rows=[];
for(const [i,a]of others.entries())for(const f of scenarios){
 const b=others[(i+17)%others.length],seed=26026+i*7919+f.level;
 const pvp=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:snapshot(a.code,f.level,'PVP',f.gear),defenderMercenary:snapshot(b.code,f.level,'PVP',f.gear),seed});
 const pve=createPveBattleV2({cards:f.cards,magicCards:f.magic,mercenary:snapshot(a.code,f.level,'PVE',f.gear),monster:{id:1,name:'QA',battle_power:5e10},seed});
 for(const [mode,result]of [['PVP',pvp],['PVE',pve]])rows.push({a:a.code,b:mode==='PVP'?b.code:'BOSS',case:f.id,mode,sha256:createHash('sha256').update(JSON.stringify(result)).digest('hex')});
}
const out=process.argv[2];assert(out);fs.writeFileSync(out,JSON.stringify({source:'All non-Razak fighters, identical captured policy, 13 scenarios; complete deterministic result hashes.',total:rows.length,rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out,total:rows.length}));
