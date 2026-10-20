import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const load=name=>import(new URL(name,root));
const live=JSON.parse(fs.readFileSync(new URL('live.json',import.meta.url)));
const originalSnapshot=(await load('scripts/measure-ss-mercenary-balance-20261019.mjs')).balanceSnapshot;
const balanceSnapshot=(code,level)=>{const s=originalSnapshot(code,level);return {...s,combat:live.runtime.combat,mercenaryLevel:{...s.mercenaryLevel,policyRevision:live.growth.revision,growth:live.growth.growth}};};
const {buildFighter,buildMonsterFighter,createPveBattleV2}=await load('functions/_battle_v2_preview.js');
const {buildMercenaryFighter,mercenaryCombat}=await load('functions/_mercenary_combat.js');
const {applyMercenaryCombatLink,mercenaryEffectiveAttack}=await load('shared/mercenary-combat-link-v2103.mjs');

const {tierCards}=await load('tests/helpers/mercenary-operating-roster-v2144.mjs');
const engineUrl=new URL('functions/_battle_v2_preview.js',root);
let source=fs.readFileSync(engineUrl,'utf8').replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(_,q,p)=>'from '+q+new URL(p,engineUrl).href+q);
assert.equal(source.split('function hitResult(').length,2);
source=source.replace('function hitResult(','export function hitResult(');
const engine=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const parity={cards:tierCards(2e7),mercenary:balanceSnapshot('V-977',10),monster:{id:1,name:'QA',battle_power:5e9},seed:9772110};
assert.deepEqual(engine.createPveBattleV2(parity),createPveBattleV2(parity));
function actor(code,level,power=2e6){
 const cards=tierCards(power).map((c,i)=>buildFighter(c,i,'A',null,'PVE'));
 const merc=buildMercenaryFighter(balanceSnapshot(code,level),'A','PVE',buildFighter);
 applyMercenaryCombatLink([[...cards,merc]]);
 return merc;
}
const rows=[];
for(const code of ['V-977','V-989'])for(const level of [1,10])for(const enemies of [1,3])for(const hpRatio of [1,.5,.1]){
 const a=actor(code,level),skill=a.skills[0];
 const target={id:'B:QA',side:'B',slot:0,row:'FRONT',isBoss:true,isMonster:true,battleMode:'PVE',alive:true,maxHp:2e9,hp:2e9*hpRatio,defense:1e7,shield:0,maxShield:0,attack:1000};
 const multiplier=skill.balance.damageRatio*(code==='V-977'?1+(1-hpRatio)*a.combat.finisherBonusPercent/100:1/enemies);
 const get=(floor,critical=false)=>{
  const samples=critical?[.5,.01,.5]:[.5,.5,.5];
  return engine.hitResult(a,target,()=>samples.shift()??.5,multiplier,false,{minDamagePercent:floor,capMinimumDamage:code==='V-977'});
 };
 rows.push({code,level,enemies,hpRatio,effectiveAttack:mercenaryEffectiveAttack(a),skillRatio:skill.balance.damageRatio,damageMultiplier:multiplier,
  cooperative:get(0).damage,cooperativeCritical:get(0,true).damage,
  standardPve:get(code==='V-977'?.016*multiplier:0).damage,
  bossHpFloor:code==='V-977'?Math.round(target.maxHp*.016*multiplier):0});
}
const scaling=[];
for(const hp of [2e8,2e9,2e10])for(const code of ['V-977','V-989']){
 const a=actor(code,10),ratio=a.skills[0].balance.damageRatio;
 const t={id:'B:QA',isBoss:true,isMonster:true,maxHp:hp,hp,defense:1e7};
 scaling.push({code,maxHp:hp,cooperative:engine.hitResult(a,t,()=>.5,ratio,false,{minDamagePercent:0}).damage,
  standardPve:engine.hitResult(a,t,()=>.5,ratio,false,{minDamagePercent:code==='V-977'?.016*ratio:0,capMinimumDamage:code==='V-977'}).damage});
}
const output={checkedAt:new Date().toISOString(),scope:'ISOLATED_CANONICAL_DAMAGE_PROBE_NOT_REPORTED_PLAYER_BATTLE',parity:true,assumptions:{cardPowerEach:2e6,bossHp:2e9,bossDefense:1e7,gear:false,growth:'read-only live revision '+live.growth.revision,rng:'noncritical and critical at variance 1'},rows,scaling};
fs.writeFileSync(new URL('probe.json',import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify(output));
