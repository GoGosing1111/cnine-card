import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {HALLOWEEN_COMBAT} from '../../../shared/mercenary-halloween-combat-v1.mjs';
import {IMPERIAL_ARCHER_COMBAT,IMPERIAL_ARCHER_SKILLS} from '../../../shared/mercenary-kangyun-v1.mjs';
const root='https://cnine-card.pages.dev',stamp='ss-balance-20261019-v2';
const get=async path=>{const r=await fetch(root+path+(path.includes('?')?'&':'?')+'qa='+stamp,{headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200,path);return r;};
const api=await get('/api/mercenary-codex'),data=await api.json();
const kangyun=data.cards.find(c=>c.code==='V-057');
assert.equal(kangyun.basePower,IMPERIAL_ARCHER_COMBAT.basePower);
assert.deepEqual(kangyun.skills.map(s=>s.balance),IMPERIAL_ARCHER_SKILLS.map(s=>s.balance));
assert.match(kangyun.combatLinkDescription,/속도 3배/);assert.match(kangyun.skills[0].effect,/840%/);assert.match(kangyun.skills[1].effect,/1,200%/);
const seasonal=Object.keys(HALLOWEEN_COMBAT).map(code=>{
 const card=data.cards.find(c=>c.code===code),p=HALLOWEEN_COMBAT[code];assert.equal(card.basePower,p.basePower);assert.deepEqual(card.skills[0].balance,p.skill.balance);
 assert.ok(card.combatLinkDescription.includes(`연계 공격 ${p.link.attackPercent}%`));
 return {code,name:card.name,balance:card.skills[0].balance,description:card.combatLinkDescription};
});
const wrapper=await (await get('/js/battle-v3-live.js')).text();assert.ok(wrapper.includes(stamp));
const runtimeVersion=wrapper.match(/BATTLE_RUNTIME = '([^']+)'/)[1];
const app=await (await get('/js/app.js')).text();assert.ok(app.includes(runtimeVersion));
const sw=await (await get('/service-worker.js')).text();assert.ok(sw.includes(stamp));
const manifest=await (await get('/preview/mercenary-imperial-archer-sss-v1/manifest.json')).json();assert.equal(manifest.balance.version,IMPERIAL_ARCHER_COMBAT.version);
const report={verifiedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),site:root,
 checks:['PUBLIC_CODEX','KANGYUN_POWER_AND_SKILLS','SEVEN_HALLOWEEN_POLICIES','MATCHING_APP_RUNTIME','SERVICE_WORKER_CACHE','ARCHER_MANIFEST'],
 apiCacheControl:api.headers.get('cache-control'),runtimeVersion,kangyun:{code:kangyun.code,basePower:kangyun.basePower,skills:kangyun.skills,description:kangyun.combatLinkDescription},seasonal};
fs.writeFileSync(new URL('./production.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:report.checks,kangyunPower:kangyun.basePower,seasonal:seasonal.map(c=>({code:c.code,balance:c.balance}))}));
