import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {candidate} from './measure-berkan-balance.mjs';
import {BERKAN_PVP_BASIC_DAMAGE_SCALE,BERKAN_PVP_SKILL_CAP_SCALE,BERKAN_TEMPO,BERKAN_BALANCE} from '../shared/mercenary-berkan-v1.mjs';

export const equippedFixture=JSON.parse(fs.readFileSync(new URL('../tests/helpers/berkan-pvp-equipped-fixtures-20260930.json',import.meta.url),'utf8'));
export function equippedDeck(formation){return formation.cards.map((key,i)=>({id:'qa-'+i,...structuredClone(equippedFixture.cardProfiles[key])}));}

// Every observed distinct formation gets equal weight, mirrored cards/equipment/
// advancement/magic, independent seeds and both starting sides. No account rule.
export function measureBerkanPvpReform({count=1024,start=70001,onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<1||(start+count)*7919>0xffffffff)throw Error('Invalid seed range');
 const rows=[],groups=[],berkan=candidate('V-055');
 for(const code of ['V-049','V-046']){
  const opponent=candidate(code);let wins=0,draws=0,total=0;const sides={A:{wins:0,total:0},B:{wins:0,total:0}};
  for(const f of equippedFixture.formations){
   const cards=equippedDeck(f),magic=equippedFixture.magicProfiles[f.magic];let groupWins=0,groupDraws=0;
   for(const side of ['A','B'])for(let i=start;i<start+count;i++){
    const battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerEquipmentBonus:equippedFixture.equipmentBonus,defenderEquipmentBonus:equippedFixture.equipmentBonus,
     attackerMagicCards:magic,defenderMagicCards:magic,attackerMercenary:side==='A'?berkan:opponent,defenderMercenary:side==='B'?berkan:opponent,
     seed:i*7919,singleHealerBonus:equippedFixture.singleHealerBonus});
    const win=Number(battle.result.winner===side),draw=Number(!['A','B'].includes(battle.result.winner));
    wins+=win;draws+=draw;total++;groupWins+=win;groupDraws+=draw;sides[side].wins+=win;sides[side].total++;
   }
   rows.push({opponent:code,formation:f.id,types:cards.map(c=>c.power_type),wins:groupWins,draws:groupDraws,total:count*2,winRate:groupWins/(count*2)});
  }
  const group={opponent:code,name:opponent.name,wins,draws,total,winRate:wins/total,sides};groups.push(group);onProgress(group);
 }
 return {date:'2026-09-30',scope:'EQUIPPED_MIRRORED_FORMATIONS_BOTH_SIDES_NOT_LIVE_WINRATE',count,start,seedMultiplier:7919,fixtureVersion:equippedFixture.version,formationCount:equippedFixture.formations.length,
  policy:{pvpBasicDamageScale:BERKAN_PVP_BASIC_DAMAGE_SCALE,pvpSkillCapScale:BERKAN_PVP_SKILL_CAP_SCALE,skillCapVariance:[.95,1.05],tempo:BERKAN_TEMPO,skill:BERKAN_BALANCE},groups,rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const report=measureBerkanPvpReform({count:Number(value('--count',1024)),start:Number(value('--start',70001)),onProgress:g=>console.log(JSON.stringify(g))});
 const out=value('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({policy:report.policy,total:report.groups.reduce((n,g)=>n+g.total,0)}));
}
