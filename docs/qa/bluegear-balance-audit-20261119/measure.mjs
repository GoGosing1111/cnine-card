import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createPvpBattleV2,createPveBattleV2,buildFighter,simulateBattleV2Preview} from '../../../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../../../functions/_mercenary_combat.js';
import {battleConfig} from '../../../functions/_mercenary_account.js';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../../../shared/mercenary-combat-link-v2103.mjs';
import {BLUE_GEAR} from '../../../shared/mercenary-blue-gear-v1.mjs';
import {scenarios as oldScenarios} from '../../../scripts/measure-razak-balance-20261026.mjs';
const live=JSON.parse(fs.readFileSync(new URL('./live-input.json',import.meta.url))),pub=JSON.parse(fs.readFileSync(new URL('./published.json',import.meta.url)));
const roster=pub.catalog.cards,byCode=new Map(roster.map(c=>[c.code,c])),blueCodes=Object.keys(BLUE_GEAR),candidates=[...blueCodes,'V-059','V-976','V-967'];
const peers=roster.filter(c=>c.rank==='SS'&&c.edition==='LIMITED'&&!blueCodes.includes(c.code));
const save=(n,r)=>fs.writeFileSync(new URL('./'+n+'.json',import.meta.url),JSON.stringify(r,null,2)+'\n',{flag:'wx'});
const seed=(scenario,index)=>createHash('sha256').update('bluegear-balance-audit:'+scenario+':'+index).digest().readUInt32BE(0);
function snapshot(code,level,mode,gear){
 return {...battleConfig(live.config.document,code,1),combat:live.runtime.combat,equipment:{schemaVersion:1,mode,power:gear},mercenaryLevel:{version:2,level,policyRevision:live.levels.revision,breakthroughMask:[5,10,15,20].reduce((n,x,i)=>n|(x<level?1<<i:0),0),growth:live.levels.growth}};
}
function opening(m){return {code:m.code,rank:m.rank,level:m.mercenaryLevel?.level,basePower:m.basePower,attack:m.attack,effectiveAttack:mercenaryEffectiveAttack(m),hp:m.maxHp,shield:m.shield,defense:m.defense,speed:m.speed,tierGuard:m.mercenaryLink?.tierGuard,levelStats:m.mercenaryLevel};}
const tally=()=>({total:0,wins:0,losses:0,draws:0});
function resultRow(code,opponent,f,count){
 const row={scenario:f.id,level:f.level,gear:f.gear,...tally(),sides:{A:tally(),B:tally()}};
 for(let n=0;n<count;n++)for(const side of ['A','B']){
  const a=snapshot(code,f.level,'PVP',f.gear),b=snapshot(opponent,f.level,'PVP',f.gear);
  const battle=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?a:b,defenderMercenary:side==='A'?b:a,seed:seed(f.id,n)});
  const winner=battle.result.winner,k=winner===side?'wins':['A','B'].includes(winner)?'losses':'draws';row[k]++;row.total++;row.sides[side][k]++;row.sides[side].total++;
  if(n===0&&side==='A')row.opening={candidate:opening(battle.teams.A.mercenaries[0]),opponent:opening(battle.teams.B.mercenaries[0])};
 }row.winRate=row.wins/row.total;return row;
}
function summarize(rows){return rows.reduce((a,r)=>{for(const k of ['total','wins','losses','draws'])a[k]+=r[k];return a;},tally());}
const group=process.argv[2]||'razak',start=performance.now();
if(group==='razak'){
 const rows=[];for(const code of candidates){
  const cases=oldScenarios.map(f=>resultRow(code,'V-058',f,32)),row={code,name:byCode.get(code).name,...summarize(cases),cases};row.winRate=row.wins/row.total;rows.push(row);console.log(JSON.stringify({group,code,name:row.name,wins:row.wins,total:row.total,cases:cases.map(x=>[x.scenario,x.wins,x.total])}));
 }save('razak-matchups',{checkedAt:new Date().toISOString(),elapsedMs:performance.now()-start,conditions:'Current production CMS/runtime/growth; 13 matched five-card deck/magic/growth/equipment scenarios, 32 fixed seeds each with both attacker and defender positions. No pets or class advancement. Equipment uses equal neutral power, no item-specific set effects. Team simulations, not real player win rates.',...summarize(rows),rows});
}else if(group==='ss'){
 const cases=oldScenarios.filter(s=>['basic-10000-balanced','basic-20000000-balanced','growth-11','equipped-21'].includes(s.id)),rows=[];
 assert(peers.length>=21);
 for(const code of blueCodes){
  const opponents=[];for(const p of peers){const runs=cases.map(f=>resultRow(code,p.code,f,8)),row={code:p.code,name:p.name,...summarize(runs),cases:runs};opponents.push(row);}
  const row={code,name:byCode.get(code).name,...summarize(opponents),opponents};rows.push(row);console.log(JSON.stringify({group,code,opponents:opponents.length,wins:row.wins,total:row.total,notAllWins:opponents.filter(x=>x.losses||x.draws).map(x=>({code:x.code,name:x.name,wins:x.wins,total:x.total}))}));
 }save('ss-matchups',{checkedAt:new Date().toISOString(),elapsedMs:performance.now()-start,conditions:'All current non-Blue-Gear SS LIMITED catalog identities; four equal growth/deck/equipment scenarios, eight seeds with both A/B sides per matchup; actual server team battle function.',...summarize(rows),rows});
}else if(group==='pve'){
 const cases=oldScenarios.filter(s=>['basic-20000000-balanced','growth-11','growth-21','equipped-21'].includes(s.id)),rows=[];
 for(const f of cases)for(const code of ['V-058',...candidates]){
  const runs=[];for(let n=0;n<8;n++){
   const battle=createPveBattleV2({cards:f.cards,magicCards:f.magic,mercenary:snapshot(code,f.level,'PVE',f.gear),monster:{id:1,name:'Audit durable boss',battle_power:1e13},seed:seed('pve-'+f.id,n)}),m=battle.result.final.mercenaries.A[0];
   const events=battle.result.timeline.filter(e=>(e.sourceAttackerId||e.actorId)===m.id);
   const eventDamage=e=>Array.isArray(e.hits)?e.hits.reduce((sum,h)=>sum+Number(h.damage||0)+Number(h.absorbed||0),0):Number(e.damage||0)+Number(e.absorbed||0);
   const damage=events.reduce((sum,e)=>sum+eventDamage(e),0);
   assert(Number.isFinite(damage)&&damage>0,`Missing timeline damage for ${code}`);
   runs.push({winner:battle.result.winner,damage,reportedBreakdown:battle.result.damageBreakdown.mercenary,hp:m.hp,actions:battle.result.mercenaryActions,duration:battle.result.duration,skillIds:[...new Set(events.filter(e=>e.skillId).map(e=>e.skillId))],eventTypes:[...new Set(events.map(e=>e.type))]});
  }const row={code,name:byCode.get(code).name,scenario:f.id,level:f.level,gear:f.gear,averageDamage:runs.reduce((n,r)=>n+r.damage,0)/runs.length,runs};rows.push(row);
 }
 for(const row of rows)row.ratioToRazak=row.averageDamage/rows.find(x=>x.scenario===row.scenario&&x.code==='V-058').averageDamage;
 save('pve-matchups-v2',{checkedAt:new Date().toISOString(),elapsedMs:performance.now()-start,conditions:'Current server single durable boss PVE simulation at battle_power 1e13; equal cards, level, magic and neutral equipment power; no pets; 8 matched seeds. Sum per-hit damage plus absorbed damage for hit arrays, otherwise direct event damage plus absorbed damage; each event counted once. Total mercenary damage during the battle, not an isolated fixed-time DPS claim. Previous pve-matchups.json is invalid because publicFighter deliberately excludes damageDealt; use this corrected measurement.',rows});console.log(JSON.stringify({group,rows:rows.map(x=>({code:x.code,scenario:x.scenario,ratio:+x.ratioToRazak.toFixed(3),damage:Math.round(x.averageDamage),reported:Math.round(x.runs[0].reportedBreakdown),events:x.runs[0].eventTypes}))}));
}else if(group==='pve-rotation'){
 const cases=oldScenarios.filter(s=>['basic-20000000-balanced','growth-11','growth-21','equipped-21'].includes(s.id)),rows=[];
 for(const f of cases)for(const code of ['V-058',...blueCodes,'V-059']){
  const runs=[];for(let n=0;n<8;n++){
   const b=createPveBattleV2({cards:f.cards,magicCards:f.magic,mercenary:snapshot(code,f.level,'PVE',f.gear),monster:{id:1,name:'Audit boss',is_boss:1,battle_power:1e13},seed:seed('pve-rotation-'+f.id,n)});
   const actor=b.result.final.mercenaries.A[0],events=b.result.timeline.filter(e=>(e.sourceAttackerId||e.actorId)===actor.id);
   let actions=0,damage=0,skillDamage=0,basicDamage=0,lastTargetHp=null;const skillIds=[];
   for(const e of events){
    const d=Array.isArray(e.hits)?e.hits.reduce((sum,h)=>sum+Number(h.damage||0)+Number(h.absorbed||0),0):Number(e.damage||0)+Number(e.absorbed||0);
    damage+=d;
    if(Array.isArray(e.hits)){skillDamage+=d;skillIds.push(e.skillId);lastTargetHp=e.hits.at(-1)?.targetHpAfter;}
    else if(e.type==='TURN'){basicDamage+=d;lastTargetHp=e.targetHpAfter;}
    if(e.type==='TURN'||e.type==='MERCENARY_END')actions++;
    if(actions===18)break;
   }
   assert.equal(actions,18);assert(lastTargetHp>0,`${code} target was killed before prefix ended`);assert(Number.isFinite(damage)&&damage>0);
   assert.equal(skillIds.length,6,`${code} unexpected cast count`);
   runs.push({damage,skillDamage,basicDamage,actions,lastTargetHp,skillIds});
  }
  rows.push({code,name:byCode.get(code).name,scenario:f.id,level:f.level,gear:f.gear,averageDamage:runs.reduce((s,r)=>s+r.damage,0)/runs.length,averageSkillDamage:runs.reduce((s,r)=>s+r.skillDamage,0)/runs.length,runs});
 }
 for(const r of rows){const base=rows.find(x=>x.scenario===r.scenario&&x.code==='V-058');r.ratioToRazak=r.averageDamage/base.averageDamage;r.skillRatioToRazak=r.averageSkillDamage/base.averageSkillDamage;}
 save('pve-rotation',{checkedAt:new Date().toISOString(),elapsedMs:performance.now()-start,conditions:'Actual createPveBattleV2 server function; single boss is_boss=1, power 1e13; first 18 completed mercenary actions (six skills plus twelve basics), target still alive. Four equal level/deck/magic/equipment scenarios, eight shared seeds. This removes total-HP-at-kill saturation from whole-battle damage. This is a matched action sample, not real-time DPS or an all-monster guarantee.',rows});
 console.log(JSON.stringify({group,rows:rows.map(r=>({code:r.code,scenario:r.scenario,ratio:+r.ratioToRazak.toFixed(6),skillRatio:+r.skillRatioToRazak.toFixed(6)}))}));
}else throw Error('Unknown group');
