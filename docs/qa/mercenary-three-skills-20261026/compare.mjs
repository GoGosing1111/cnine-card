import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as current from '../../../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../../../functions/_mercenary_combat.js';
import {limitedDeploymentSnapshot} from '../../../shared/mercenary-limited-deployment-v1.mjs';
import {tierCards} from '../../../tests/helpers/mercenary-operating-roster-v2144.mjs';
import fixture from '../../../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {snapshot,roster} from '../../../scripts/measure-razak-balance-20261026.mjs';

const baseline=process.env.QA_BASELINE;assert(baseline,'QA_BASELINE must point to the saved pre-edit bundle');
const old=await import(pathToFileURL(baseline).href),hash=s=>createHash('sha256').update(s).digest('hex'),targets=['V-976','V-975','V-974'];
const checks=[];
for(const code of targets)for(const mode of ['PVE','PVP'])for(const capped of [false,true]){
 const make=(api,build,snap)=>({...build({...snap(code),combat:fixture.combat},'A',mode,api.buildFighter),speed:1e8,attack:capped?1e15:1e5});
 const previous=make(old,old.buildMercenaryFighter,old.limitedDeploymentSnapshot),next=make(current,buildMercenaryFighter,limitedDeploymentSnapshot);
 for(const key of ['basePower','maxHp','defense','speed','shield','counterImmune','controlImmune','poisonImmune'])assert.deepEqual(next[key],previous[key],key);
 const enemy={...current.buildFighter({id:'target',power:1e7},0,'B',null,mode),speed:1,attack:1,hp:1e8,maxHp:1e8,shield:1e10,maxShield:1e10};
 const packet=(api,a,skill)=>api.simulateBattleV2Preview({teamA:[{...a,skills:skill?[skill]:[]}],teamB:[enemy],seed:7919,maxActions:1}).timeline.find(e=>e.actorId===a.id&&(skill?e.type.endsWith('_AREA'):e.type==='TURN'));
 const damage=e=>{assert(e&&!e.dodge);return e.damage+e.absorbed;};
 const basicBefore=damage(packet(old,previous)),basicAfter=damage(packet(current,next));assert.equal(basicAfter,Math.floor(basicBefore*1.5));
 checks.push({code,mode,capped,type:'BASIC',before:basicBefore,after:basicAfter});
 if(mode==='PVE')for(let i=0;i<next.skills.length;i++){
  const before=damage(packet(old,previous,previous.skills[i])),after=damage(packet(current,next,next.skills[i]));assert(Math.abs(after-2*before)<=1,'double actual area packet');
  checks.push({code,mode,capped,type:'AREA',skill:next.skills[i].id,before,after});
 }
}
const unchanged=[];
for(const m of roster.filter(m=>!targets.includes(m.code)))for(const mode of ['PVE','PVP'])for(const level of [1,21])for(const seed of [26027,26028]){
 const cards=tierCards(2e7),mercenary=snapshot(m.code,level,mode,level===21?1e6:0);
 const args=mode==='PVE'?{cards,mercenary,monster:{id:1,battle_power:1.6e10},seed}:{attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:snapshot('V-978',level,mode),seed};
 const method=mode==='PVE'?'createPveBattleV2':'createPvpBattleV2',before=hash(JSON.stringify(old[method](args))),after=hash(JSON.stringify(current[method](args)));assert.equal(after,before,m.code+' '+mode);
 unchanged.push({code:m.code,mode,level,seed,sha256:after});
}
const report={status:'PASS',baselineCommit:'29f2d5e76e97ea9e725b698357bc213240e77d1b',baselineSha256:hash(fs.readFileSync(baseline)),checks,unchanged,unchangedBattles:unchanged.length,productionWrites:0};
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,damageComparisons:checks.length,unchangedBattles:unchanged.length}));
