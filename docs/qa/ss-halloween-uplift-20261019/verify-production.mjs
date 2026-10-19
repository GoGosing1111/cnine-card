import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {HALLOWEEN_COMBAT,HALLOWEEN_COMBAT_VERSION} from '../../../shared/mercenary-halloween-combat-v1.mjs';
import {IMPERIAL_ARCHER_COMBAT,IMPERIAL_ARCHER_SKILLS} from '../../../shared/mercenary-kangyun-v1.mjs';

const before=process.argv.includes('--before'),site='https://cnine-card.pages.dev';
const get=async pathname=>{
 const r=await fetch(site+pathname+'?qa=ss-halloween-uplift-20261019-v3-'+Date.now(),{headers:{'cache-control':'no-cache'}});
 assert.equal(r.status,200,pathname);return r;
};
const response=await get('/api/mercenary-codex'),data=await response.json();
const pick=c=>({code:c.code,name:c.name,rank:c.rank,basePower:c.basePower,deploymentEnabled:c.deploymentEnabled,
 skills:c.skills.map(s=>({id:s.id,name:s.name,balance:s.balance})),description:c.combatLinkDescription});
const kangyun=pick(data.cards.find(c=>c.code==='V-057'));
assert.equal(kangyun.basePower,IMPERIAL_ARCHER_COMBAT.basePower);
assert.deepEqual(kangyun.skills.map(s=>s.balance),IMPERIAL_ARCHER_SKILLS.map(s=>s.balance));
const seasonal=Object.keys(HALLOWEEN_COMBAT).map(code=>{
 const rows=data.cards.filter(c=>c.code===code);assert.equal(rows.length,1,code);
 const card=pick(rows[0]),p=HALLOWEEN_COMBAT[code];
 assert.equal(card.basePower,before?216000:p.basePower);assert.equal(card.rank,'SS');assert.equal(card.deploymentEnabled,true);
 assert.deepEqual(card.skills[0].balance,p.skill.balance);
 if(!before){
  assert.ok(card.description.includes('기본 전투력 237,600'));
  for(const [label,key]of [['연계 공격','attackPercent'],['체력','hpPercent'],['전용 방벽','shieldPercent']])assert.ok(card.description.includes(`${label} ${p.link[key]}%`),code+' '+label);
 }
 return card;
});
assert.match(seasonal.find(c=>c.code==='V-984').description,/PVP에서 부여량이 40% 감소/);
const checks=['PUBLIC_CODEX','KANGYUN_UNCHANGED','SEVEN_HALLOWEEN_POLICIES','DIIM_PVP_BARRIER_PRESERVED'];
let policySha256;
if(!before){
 const remote=Buffer.from(await(await get('/shared/mercenary-halloween-combat-v1.mjs')).arrayBuffer());
 const local=fs.readFileSync(new URL('../../../shared/mercenary-halloween-combat-v1.mjs',import.meta.url));
 const hash=b=>createHash('sha256').update(b).digest('hex');
 policySha256=hash(remote);assert.equal(policySha256,hash(local));checks.push('PUBLIC_POLICY_SHA256');
}
const report={verifiedAt:new Date().toISOString(),site,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 phase:before?'BEFORE':'DEPLOYED',checks,apiCacheControl:response.headers.get('cache-control'),
 ...(before?{}:{halloweenPolicyVersion:HALLOWEEN_COMBAT_VERSION,policySha256}),kangyun,seasonal};
fs.writeFileSync(new URL(before?'./production-before.json':'./production.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,phase:report.phase,checks,kangyunPower:kangyun.basePower,seasonal:seasonal.map(({code,basePower})=>({code,basePower}))}));
