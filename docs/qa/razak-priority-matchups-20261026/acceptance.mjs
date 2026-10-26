import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RAZAK_COMBAT} from '../../../shared/mercenary-razak-v1.mjs';
const root='docs/qa/razak-priority-matchups-20261026',read=name=>JSON.parse(fs.readFileSync(`${root}/${name}.json`));
const report=read('holdout-priority');
// User acceptance: zero losses AND zero draws to every SS limited and Kangyun.
// Seeds 180001..180016 select the policy; fresh 210001..210128 validate it.
assert.deepEqual(report.policy.combat,RAZAK_COMBAT);assert.equal(report.start,210001);assert.equal(report.count,128);assert.equal(report.total,73216);assert.equal(report.rows.length,22);
assert.equal(report.rows.filter(r=>r.rank==='SS'&&r.edition==='LIMITED').length,21);assert(report.rows.some(r=>r.code==='V-057'));
for(const row of report.rows){assert.equal(row.total,3328);assert.equal(row.wins,row.total,row.code);assert.equal(row.losses,0);assert.equal(row.draws,0);for(const s of row.scenarios)assert.equal(s.wins,s.total,`${row.code}/${s.id}`);for(const s of Object.values(row.sides))assert.equal(s.wins,s.total);}
const baseline=read('sss-baseline-regression'),previous=JSON.parse(fs.readFileSync('docs/qa/razak-tier-correction-20261026/holdout.json'));
assert.equal(baseline.total,9984);assert.deepEqual(baseline.rows,previous.rows.filter(r=>r.rank==='SSS'&&r.edition==='LIMITED'));
const unrelated=read('unrelated');assert.deepEqual(unrelated,JSON.parse(fs.readFileSync('docs/qa/razak-tier-correction-20261026/unrelated.json')));
const summary={result:'PASS',checkedAt:new Date().toISOString(),scope:report.scope,conditions:report.conditions,policy:RAZAK_COMBAT,priority:{opponents:22,total:report.total,wins:report.total,losses:0,draws:0},sssLimited:{opponents:12,total:baseline.total,allRowsIdenticalToV4:true},unrelated:{total:unrelated.total,allResultHashesIdentical:true},rows:report.rows.map(({code,name,wins,total,losses,draws})=>({code,name,wins,total,losses,draws}))};
fs.writeFileSync(`${root}/summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
