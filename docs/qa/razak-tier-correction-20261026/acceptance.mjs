import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RAZAK_COMBAT} from '../../../shared/mercenary-razak-v1.mjs';
const root='docs/qa/razak-tier-correction-20261026';
// Fixed after validation-l and before the independent 150001..150032 holdout.
// Equal scenario weights are a QA convention, not the live population distribution.
const targets={lower:['V-996','V-999'],middle:['V-989','V-988','V-987'],upper:['V-979','V-978','V-976','V-975','V-974','V-973','V-972']};
const report=JSON.parse(fs.readFileSync(root+'/holdout.json'));
assert.equal(report.start,150001);assert.equal(report.count,32);assert.equal(report.total,46592);
assert.deepEqual(report.policy.combat,RAZAK_COMBAT);
const row=code=>{const r=report.rows.find(r=>r.code===code);assert(r,code);assert.equal(r.total,832);return r;};
for(const code of targets.lower){const r=row(code);assert(r.winRate>=.4&&r.winRate<=.65,code+' lower parity');}
for(const code of targets.middle)assert(row(code).winRate<.6,code+' no middle-tier dominance');
for(const code of targets.upper)assert(row(code).winRate<.4,code+' upper-tier disadvantage');
const grouped=filter=>{const rows=report.rows.filter(filter),wins=rows.reduce((n,r)=>n+r.wins,0),total=rows.reduce((n,r)=>n+r.total,0);return {opponents:rows.length,wins,total,winRate:wins/total,minWinRate:Math.min(...rows.map(r=>r.winRate))};};
const groups={ordinarySS:grouped(r=>r.rank==='SS'&&r.edition!=='LIMITED'),limitedSS:grouped(r=>r.rank==='SS'&&r.edition==='LIMITED'),limitedSSS:grouped(r=>r.rank==='SSS'&&r.edition==='LIMITED')};
assert.equal(groups.ordinarySS.opponents,17);assert(groups.ordinarySS.minWinRate>=.98);
assert.equal(groups.limitedSS.opponents,21);assert(groups.limitedSS.winRate>=.8);assert(groups.limitedSS.minWinRate>=.5);
const previous=JSON.parse(fs.readFileSync('docs/qa/razak-balance-20261026/holdout.json'));
for(const r of report.rows)for(const s of r.scenarios)assert.deepEqual(s.opening.opponent,previous.rows.find(p=>p.code===r.code).scenarios.find(p=>p.id===s.id).opening.opponent,r.code+' unchanged opponent '+s.id);
const unrelated=JSON.parse(fs.readFileSync(root+'/unrelated.json')),prior=JSON.parse(fs.readFileSync('docs/qa/razak-balance-20261026/unrelated-after.json'));assert.deepEqual(unrelated,prior);
const summary={checkedAt:new Date().toISOString(),result:'PASS',conditions:report.conditions,scope:report.scope,targets,groups,total:report.total,unrelatedBattles:unrelated.total,rows:report.rows.map(({code,name,rank,edition,wins,total,winRate,sides})=>({code,name,rank,edition,wins,total,winRate,sides})),policy:RAZAK_COMBAT};
fs.writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({result:summary.result,total:summary.total,groups,limitedSSS:summary.rows.filter(r=>r.rank==='SSS'&&r.edition==='LIMITED'),unrelatedBattles:summary.unrelatedBattles}));
