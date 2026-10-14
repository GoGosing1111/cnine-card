import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {tierCards,tierDecks,fixture} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import equipped from '../tests/helpers/berkan-pvp-equipped-fixtures-20260930.json' with {type:'json'};

export function azantBalanceCandidate(code){
 return {...seed.catalog.cards.find(c=>c.code===code),...seed.document.mercenaries.find(c=>c.code===code),code,level:1,statMode:'RANK_FIXED',basePower:180000,combat:fixture.combat,
  skills:seed.document.assignments.find(a=>a.code===code).skillIds.map(id=>seed.document.skills.find(s=>s.id===id))};
}
const candidate=azantBalanceCandidate;

// Equal cards, equipment and magic; both starting sides. Never live accounts,
// rewards, forced winners or an opponent-specific production modifier.
export function measureAzantBerkan({count=128,start=100001,pveCount=24,powers=[1e6,2e7,1e8,2e9]}={}){
 const azant=candidate('V-056'),berkan=candidate('V-055'),rows=[];
 const groups=[...Object.entries(tierDecks).flatMap(([deck,types])=>powers.map(power=>({kind:'plain',id:deck+'-'+power,cards:tierCards(power,types),magic:[],equipment:0,healer:fixture.singleHealerBonus}))),
  ...equipped.formations.map(f=>({kind:'equipped',id:f.id,cards:f.cards.map((key,i)=>({id:'qa-'+i,...structuredClone(equipped.cardProfiles[key])})),magic:equipped.magicProfiles[f.magic],equipment:equipped.equipmentBonus,healer:equipped.singleHealerBonus}))];
 for(const g of groups){
  const row={kind:g.kind,id:g.id,wins:0,draws:0,total:count*2,sides:{A:0,B:0}};
  for(const side of ['A','B'])for(let i=start;i<start+count;i++){
   const r=createPvpBattleV2({attackerCards:g.cards,defenderCards:g.cards,attackerEquipmentBonus:g.equipment,defenderEquipmentBonus:g.equipment,attackerMagicCards:g.magic,defenderMagicCards:g.magic,
    attackerMercenary:side==='A'?azant:berkan,defenderMercenary:side==='B'?azant:berkan,seed:i*7919,singleHealerBonus:g.healer}).result;
   const win=Number(r.winner===side);row.wins+=win;row.sides[side]+=win;row.draws+=Number(!['A','B'].includes(r.winner));
  }
  row.winRate=row.wins/row.total;rows.push(row);
 }
 const pvp=['plain','equipped'].map(kind=>{const selected=rows.filter(r=>r.kind===kind),wins=selected.reduce((s,r)=>s+r.wins,0),total=selected.reduce((s,r)=>s+r.total,0);return {kind,wins,total,winRate:wins/total,draws:selected.reduce((s,r)=>s+r.draws,0),sides:Object.fromEntries(['A','B'].map(side=>[side,selected.reduce((s,r)=>s+r.sides[side],0)/(total/2)]))};});
 const pve=[];
 for(const power of powers)for(const multiplier of [10,30,100]){
  const row={power,multiplier,total:pveCount};
  for(const [name,mercenary]of [['azant',azant],['berkan',berkan]]){
   const stats={clears:0,actions:0,mercenaryActions:0,damage:0};
   for(let i=start;i<start+pveCount;i++){
    const r=createPveBattleV2({cards:tierCards(power),mercenary,monster:{id:1,name:'동일 조건 검수 보스',battle_power:power*multiplier,is_boss:1},seed:i*7919,singleHealerBonus:fixture.singleHealerBonus}).result;
    stats.clears+=Number(r.final.B[0].hp===0);stats.actions+=r.actions;stats.mercenaryActions+=r.mercenaryActions||0;
    // Berkan's authoritative skill receipts use impacts, while Azant uses
    // hits plus an aggregate. Count each receipt once, including shields.
    stats.damage+=r.timeline.filter(e=>(e.sourceAttackerId||e.actorId)===`A:MERCENARY:${mercenary.code}`).reduce((sum,e)=>sum+(Array.isArray(e.impacts||e.hits)?(e.impacts||e.hits).reduce((n,h)=>n+(h.damage||0)+(h.absorbed||0),0):(e.damage||0)+(e.absorbed||0)),0);
   }
   row[name]=Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,k==='clears'?v:v/pveCount]));
  }
  row.actionRatio=row.azant.actions/row.berkan.actions;row.damageRatio=row.azant.damage/row.berkan.damage;pve.push(row);
 }
 // Unchanged-path fingerprints are produced with the same deterministic input
 // before and after, including Berkan and other mercenaries without Azant.
 const controls=[];
 for(const code of ['V-055','V-049','V-046'])for(const mode of ['PVP','PVE'])for(const n of [7,29]){
  const cards=tierCards(2e7),m=candidate(code),args={seed:n*7919,singleHealerBonus:fixture.singleHealerBonus};
  const b=mode==='PVE'?createPveBattleV2({...args,cards,mercenary:m,monster:{id:1,name:'동일 대조 보스',battle_power:6e8}}):createPvpBattleV2({...args,attackerCards:cards,defenderCards:cards,attackerMercenary:m,defenderMercenary:candidate('V-021')});
  controls.push({code,mode,seed:args.seed,sha256:createHash('sha256').update(JSON.stringify(b)).digest('hex')});
 }
 return {scope:'PAIRED_CANONICAL_ENGINE_NOT_LIVE_WIN_RATE',count,start,pveCount,powers,normalFormations:16,equippedFormations:equipped.formations.length,pvp,rows,pve,controls,battles:rows.reduce((s,r)=>s+r.total,0)+pve.length*pveCount*2+controls.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
 const report=measureAzantBerkan({count:Number(value('--count',128)),start:Number(value('--start',100001)),pveCount:Number(value('--pve-count',24))}),output=value('--out',null);
 if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({battles:report.battles,pvp:report.pvp,pve:report.pve.map(r=>({power:r.power,multiplier:r.multiplier,actionRatio:r.actionRatio,damageRatio:r.damageRatio,clears:[r.azant.clears,r.berkan.clears]}))}));
}
