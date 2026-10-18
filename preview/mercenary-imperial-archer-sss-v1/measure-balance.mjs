import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPvpBattleV2,createPveBattleV2} from './balance-engine.mjs';
import {IMPERIAL_ARCHER_COMBAT,IMPERIAL_ARCHER_SKILLS,imperialArcherCandidate} from './balance.mjs';
const {MERCENARY_CMS_SEED:seed}=await import('../../functions/_mercenary_cms_seed.js');
const {tierCards,tierDecks,fixture}=await import('../../tests/helpers/mercenary-operating-roster-v2144.mjs');
const {default:equipped}=await import('../../tests/helpers/berkan-pvp-equipped-fixtures-20260930.json',{with:{type:'json'}});
export {tierCards,tierDecks,fixture};
export const baseline=code=>({...seed.catalog.cards.find(c=>c.code===code),...seed.document.mercenaries.find(c=>c.code===code),
 code,level:1,statMode:'RANK_FIXED',basePower:180000,combat:structuredClone(fixture.combat),
 skills:seed.document.assignments.find(a=>a.code===code).skillIds.map(id=>structuredClone(seed.document.skills.find(s=>s.id===id)))});
export const candidate=()=>imperialArcherCandidate(fixture.combat);
export function mercenaryDamage(result,code,side='A'){
 return result.timeline.filter(e=>(e.sourceAttackerId||e.actorId)===`${side}:MERCENARY:${code}`)
  .reduce((sum,e)=>sum+(Array.isArray(e.impacts||e.hits)?(e.impacts||e.hits).reduce((n,h)=>n+(h.damage||0)+(h.absorbed||0),0):(e.damage||0)+(e.absorbed||0)),0);
}
export function measure({count=16,pveCount=8,start=218001}={}){
 const groups=[...Object.entries(tierDecks).flatMap(([name,types])=>[1e6,2e9].map(power=>({id:name+'-'+power,kind:'plain',cards:tierCards(power,types),equipment:0,magic:[]}))),
  ...equipped.formations.filter((_,i)=>[0,7,14,22].includes(i)).map(f=>({id:f.id,kind:'equipped',
   cards:f.cards.map((key,i)=>({id:'qa-'+i,...structuredClone(equipped.cardProfiles[key])})),equipment:equipped.equipmentBonus,magic:equipped.magicProfiles[f.magic]}))];
 const rows=[];
 for(const opponent of ['V-055','V-056'])for(const g of groups){
  const row={opponent,formation:g.id,kind:g.kind,wins:0,draws:0,total:count*2,sides:{A:0,B:0},damage:0,opponentDamage:0};
  for(const side of ['A','B'])for(let n=start;n<start+count;n++){
   const r=createPvpBattleV2({attackerCards:g.cards,defenderCards:g.cards,attackerEquipmentBonus:g.equipment,defenderEquipmentBonus:g.equipment,
    attackerMagicCards:g.magic,defenderMagicCards:g.magic,singleHealerBonus:fixture.singleHealerBonus,seed:n*7919,
    attackerMercenary:side==='A'?candidate():baseline(opponent),defenderMercenary:side==='B'?candidate():baseline(opponent)}).result;
   const win=Number(r.winner===side);row.wins+=win;row.sides[side]+=win;row.draws+=Number(!['A','B'].includes(r.winner));
   row.damage+=mercenaryDamage(r,'V-057',side);row.opponentDamage+=mercenaryDamage(r,opponent,side==='A'?'B':'A');
  }
  row.winRate=row.wins/row.total;rows.push(row);
 }
 const pvp=['V-055','V-056'].map(opponent=>{
  const selected=rows.filter(r=>r.opponent===opponent),total=selected.reduce((n,r)=>n+r.total,0),wins=selected.reduce((n,r)=>n+r.wins,0);
  return {opponent,wins,total,winRate:wins/total,draws:selected.reduce((n,r)=>n+r.draws,0),
   sideWinRates:Object.fromEntries(['A','B'].map(side=>[side,selected.reduce((n,r)=>n+r.sides[side],0)/(total/2)]))};
 });
 const pve=[];
 for(const power of [1e6,2e9])for(const multiplier of [10,30,100])for(const personalGear of [0,1000000]){
  const row={power,multiplier,personalGear,total:pveCount};
  for(const code of ['V-057','V-055','V-056']){
   const stats={clears:0,actions:0,damage:0};
   for(let n=start;n<start+pveCount;n++){
    const mercenary=code==='V-057'?candidate():baseline(code);
    if(personalGear)mercenary.equipment={schemaVersion:1,mode:'PVE',power:personalGear};
    const r=createPveBattleV2({cards:tierCards(power),mercenary,monster:{id:1,name:'궁사 밸런스 검수 보스',battle_power:power*multiplier,is_boss:1},seed:n*7919,singleHealerBonus:fixture.singleHealerBonus}).result;
    stats.clears+=Number(r.final.B[0].hp===0);stats.actions+=r.actions;stats.damage+=mercenaryDamage(r,code);
   }
   row[code]={clears:stats.clears,averageActions:stats.actions/pveCount,averageDamage:stats.damage/pveCount};
  }
  row.damageRatio=row['V-057'].averageDamage/row['V-055'].averageDamage;
  row.actionRatio=row['V-057'].averageActions/row['V-055'].averageActions;pve.push(row);
 }
 const policyFiles=['balance.mjs','balance-engine.mjs','skill.mjs','../../shared/mercenary-kangyun-v1.mjs','../../functions/_mercenary_combat.js','../../shared/mercenary-combat-link-v2103.mjs'];
 return {scope:'RELEASED_CANONICAL_ENGINE_COMPARISON_NOT_LIVE_WIN_RATE',runtimeEnabled:true,code:'V-057',name:'신궁 강윤',
  policy:IMPERIAL_ARCHER_COMBAT,skills:IMPERIAL_ARCHER_SKILLS,seedStart:start,seedMultiplier:7919,count,pveCount,
  fileHashes:Object.fromEntries(policyFiles.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url))).digest('hex')])),
  pvp,rows,pve,battles:rows.reduce((n,r)=>n+r.total,0)+pve.length*pveCount*3};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=measure();fs.writeFileSync(new URL('./qa/kangyun-live/balance-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({battles:report.battles,pvp:report.pvp,pve:report.pve.map(r=>({power:r.power,multiplier:r.multiplier,gear:r.personalGear,damageRatio:r.damageRatio,actionRatio:r.actionRatio,clears:[r['V-057'].clears,r['V-055'].clears,r['V-056'].clears]}))},null,2));
}
