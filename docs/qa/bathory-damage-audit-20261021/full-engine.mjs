import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../../../',import.meta.url);
const live=JSON.parse(fs.readFileSync(new URL('live.json',import.meta.url)));
const load=p=>import(new URL(p,root));
const {createCooperativeBattle}=await load('functions/_cooperative_battle.js');
const {createPveBattleV2,createPvpBattleV2}=await load('functions/_battle_v2_preview.js');
const {currentSquads}=await load('tests/helpers/cooperative-current.mjs');
const {balanceSnapshot}=await load('scripts/measure-ss-mercenary-balance-20261019.mjs');
const {tierCards}=await load('tests/helpers/mercenary-operating-roster-v2144.mjs');
const {cooperativeEnemies}=await load('functions/_cooperative_enemies.js');
const {coopDifficulty}=await load('shared/cooperative-battleground-v1.mjs');
function moduleUrl(file,replacements=[],imports=new Map()){
 const url=new URL(file,root);let s=fs.readFileSync(url,'utf8');
 for(const [from,to] of replacements){assert.equal(s.split(from).length,2,'unique patch '+from);s=s.replace(from,to);}
 s=s.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g,(_,q,p)=>'from '+q+(imports.get(new URL(p,url).href)||new URL(p,url).href)+q);
 return 'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
}
// Counterfactual only in memory. Production and repository source are not edited.
const combatUrl=moduleUrl('functions/_mercenary_combat.js',[["a.battleMode==='PVE'&&ssLimitedProfile(a)?.pveSkillMinimumDamage===true",'false']]);
const engineUrl=moduleUrl('functions/_battle_v2_preview.js',[],new Map([[new URL('functions/_mercenary_combat.js',root).href,combatUrl]]));
const changedEngine=await import(engineUrl);
const coopUrl=moduleUrl('functions/_cooperative_battle.js',[],new Map([[new URL('functions/_battle_v2_preview.js',root).href,engineUrl]]));
const changedCoop=await import(coopUrl);
const snapshot=(code,level)=>{const s=balanceSnapshot(code,level);return {...s,combat:live.runtime.combat,mercenaryLevel:{...s.mercenaryLevel,policyRevision:live.growth.revision,growth:live.growth.growth}};};
function summarize(result,actorId){
 const all=result.timeline.filter(e=>e.actorId===actorId);
 const hits=all.flatMap(e=>e.type==='MERCENARY_HIT'?[e]:Array.isArray(e.hits)?e.hits:[]);
 return {casts:all.filter(e=>e.type==='MERCENARY_WINDUP'&&!e.continuation).length,hits:hits.length,maxHit:Math.max(0,...hits.map(e=>(e.damage||0)+(e.absorbed||0))),firstHits:hits.slice(0,3).map(e=>({damage:e.damage,absorbed:e.absorbed,critical:e.critical,targetId:e.targetId,targetMaxHp:e.targetMaxHp,targetHpBefore:e.targetHpBefore,targetHpAfter:e.targetHpAfter})),totalDamage:hits.reduce((n,h)=>n+(h.damage||0)+(h.absorbed||0),0)};
}
const cases=[];let coopParity=0,pvpParity=0;
const config=coopDifficulty('EXTREME'),saved=live.cooperative.combat.difficulties.find(d=>d.id==='EXTREME');
const boss=cooperativeEnemies(config,saved.monsters,live.cooperative.combat.stages).monster;
for(const code of ['V-977','V-989'])for(const level of [1,10])for(const single of [false,true]){
 const squads=currentSquads();squads[0].mercenary=snapshot(code,level);
 squads.slice(1).forEach(s=>{s.mercenary=snapshot(s.mercenary.code,level);});
 const input={squads,difficulty:'EXTREME',combat:live.cooperative.combat,seed:9772110,...(single?{monsterSnapshot:boss}:{encounter:{version:3,policyVersion:1,mobs:['STALKER','WATCHER','IRONHOUND'],elite:'BASTION',boss:'ARKE'}})};
 const original=createCooperativeBattle(input),counterfactual=changedCoop.createCooperativeBattle(input);
 assert.deepEqual(original,counterfactual);coopParity++;
 cases.push({mode:'COOPERATIVE_EXTREME',stage:single?'ISOLATED_FINAL_BOSS':'V3_ALL_WAVES',code,level,floorRemovalIdentical:true,...summarize(original.payload.battleV2.result,'A:OWNER:1:MERCENARY:'+code)});
}
for(const level of [1,10]){
 const m={...live.monsters[0],id:75,battle_power:120e6,pve_difficulty:'APOCALYPSE',pve_hp_percent:1200};
 const input={cards:tierCards(2e6),mercenary:snapshot('V-977',level),monster:m,seed:9772110};
 const original=createPveBattleV2(input),changed=changedEngine.createPveBattleV2(input);
 cases.push({mode:'APOCALYPSE_CONTROLLED_HP',code:'V-977',level,monsterHp:original.teams.B.cards[0].maxHp,original:summarize(original.result,'A:MERCENARY:V-977'),floorDisabled:summarize(changed.result,'A:MERCENARY:V-977')});
 const pvp={attackerCards:tierCards(2e6),defenderCards:tierCards(2e6),attackerMercenary:snapshot('V-977',level),defenderMercenary:snapshot('V-989',level),seed:9772110};
 assert.deepEqual(createPvpBattleV2(pvp),changedEngine.createPvpBattleV2(pvp));pvpParity++;
}
const out={scope:'CONTROLLED_SIMULATIONS_NOT_REPORTED_PLAYER_BATTLE',checkedAt:new Date().toISOString(),liveConfigurationAt:live.checkedAt,counterfactual:'disable Bathory-only pveSkillMinimumDamage in an in-memory module; no source or operational changes',conditions:{cooperative:'fixture ICON +13 balanced cards, card gear 2300000, identical first squad, live combat/growth policies, no personal mercenary equipment',apocalypse:'ordinary cards each 2000000, boss id75 with synthetic 120000000 power / 1200% HP; not live encounter reproduction'},coopParity,pvpParity,cases};
fs.writeFileSync(new URL('full-engine.json',import.meta.url),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
