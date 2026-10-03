import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {candidate} from './measure-berkan-balance.mjs';
import {equippedFixture,equippedDeck} from './measure-berkan-pvp-reform-20260930.mjs';
import {tierCards,tierDecks,fixture} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {CRYVERN_BALANCE,CRYVERN_CAP_SCALE,CRYVERN_PVP_BASIC_DAMAGE_SCALE,CRYVERN_PVP_SKILL_CAP_SCALE} from '../shared/mercenary-cryvern-v1.mjs';
import {BERKAN_BALANCE,BERKAN_TEMPO,BERKAN_PVP_BASIC_DAMAGE_SCALE,BERKAN_PVP_SKILL_CAP_SCALE} from '../shared/mercenary-berkan-v1.mjs';

export function verifyLiveCodex(live){
 for(const code of ['V-049','V-055','V-046']){
  const local=candidate(code),card=live.cards.find(c=>c.code===code);assert.ok(card);
  for(const field of ['name','rank','position','basePower'])assert.equal(card[field],local[field],code+' '+field);
  assert.deepEqual(card.skills.map(s=>s.id),local.skills.map(s=>s.id),code+' assignments');
  for(const skill of local.skills){const actual=card.skills.find(s=>s.id===skill.id);assert.deepEqual(actual.balance,skill.balance,code+' '+skill.id+' live balance');}
 }
 return {revision:live.revision,combatLinkVersion:live.combatLink.version};
}
const damage=(battle,code)=>battle.result.timeline.filter(e=>e.actorId?.includes(code)).reduce((n,e)=>n+(e.impacts?e.impacts.reduce((sum,i)=>sum+(i.damage||0)+(i.absorbed||0),0):(e.damage||0)+(e.absorbed||0)),0);
export function checkCryvernTarget(report){
 const primary=report.groups.find(g=>g.kind==='EQUIPPED');
 const bounds=report.opponentCode==='V-055'?[.45,.50]:[.645,.655];
 assert.ok(primary&&primary.formations===23,'Use all 23 equally weighted equipped formations');
 assert.ok(primary.winRate>=bounds[0]&&primary.winRate<=bounds[1],JSON.stringify({opponent:report.opponentCode,...primary,bounds}));
 return {opponent:report.opponentCode,bounds,winRate:primary.winRate};
}
export function measureCryvernParity({count=128,start=91001,opponentCode='V-055',includePve=true,onProgress=()=>{}}={}){
 assert.ok(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(start)&&start>0&&(start+count)*7919<0xffffffff);
 assert.ok(['V-055','V-046'].includes(opponentCode));
 const cryvern=candidate('V-049'),berkan=candidate('V-055'),opponent=candidate(opponentCode);
 const configurations=[
  ...equippedFixture.formations.map(f=>({kind:'EQUIPPED',id:f.id,cards:equippedDeck(f),magic:equippedFixture.magicProfiles[f.magic],equipment:equippedFixture.equipmentBonus,healer:equippedFixture.singleHealerBonus})),
  ...[1e6,2e7,1e8,2e9].flatMap(power=>Object.entries(tierDecks).map(([name,types])=>({kind:'NEUTRAL',id:name+'-'+power,cards:tierCards(power,types),magic:[],equipment:0,healer:fixture.singleHealerBonus})))
 ];
 const rows=[];
 for(const c of configurations){
  const row={kind:c.kind,id:c.id,wins:0,losses:0,draws:0,total:count*2,sides:{A:{wins:0,total:count},B:{wins:0,total:count}}};
  for(const side of ['A','B'])for(let i=start;i<start+count;i++){
   const battle=createPvpBattleV2({attackerCards:c.cards,defenderCards:c.cards,attackerEquipmentBonus:c.equipment,defenderEquipmentBonus:c.equipment,
    attackerMagicCards:c.magic,defenderMagicCards:c.magic,attackerMercenary:side==='A'?cryvern:opponent,defenderMercenary:side==='B'?cryvern:opponent,
    seed:i*7919,singleHealerBonus:c.healer});
   if(battle.result.winner===side){row.wins++;row.sides[side].wins++;}else if(['A','B'].includes(battle.result.winner))row.losses++;else row.draws++;
  }
  row.winRate=row.wins/row.total;rows.push(row);
 }
 const groups=['EQUIPPED','NEUTRAL'].map(kind=>{const matched=rows.filter(r=>r.kind===kind),out={kind,formations:matched.length,wins:0,losses:0,draws:0,total:0};for(const row of matched)for(const key of ['wins','losses','draws','total'])out[key]+=row[key];out.winRate=out.wins/out.total;onProgress(out);return out;});
 const pve=[];
 for(const power of includePve?[1e6,2e7,1e8,2e9]:[]){
  const row={power,count:64,cryvernDamage:0,berkanDamage:0,cryvernWins:0,berkanWins:0};
  for(let i=start;i<start+64;i++)for(const [key,mercenary] of [['cryvern',cryvern],['berkan',berkan]]){
   const battle=createPveBattleV2({cards:tierCards(power),mercenary,monster:{id:1,name:'검수 보스',battle_power:power*30},seed:i*7919});
   row[key+'Damage']+=damage(battle,mercenary.code);row[key+'Wins']+=Number(battle.result.winner==='A');
  }
  row.damageRatio=row.cryvernDamage/Math.max(1,row.berkanDamage);pve.push(row);
 }
 return {date:'2026-10-04',scope:'CONTROLLED_MIRRORED_ENGINE_SIMULATION_NOT_LIVE_ACCOUNT_WIN_RATE',count,start,seedMultiplier:7919,fixtureVersion:equippedFixture.version,
  opponentCode,policy:{cryvernSkill:CRYVERN_BALANCE,cryvernPveCap:CRYVERN_CAP_SCALE,cryvernPvpBasic:CRYVERN_PVP_BASIC_DAMAGE_SCALE,cryvernPvpCap:CRYVERN_PVP_SKILL_CAP_SCALE,berkanSkill:BERKAN_BALANCE,berkanTempo:BERKAN_TEMPO,berkanPvpBasic:BERKAN_PVP_BASIC_DAMAGE_SCALE,berkanPvpCap:BERKAN_PVP_SKILL_CAP_SCALE},groups,rows,pve};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const index=args.indexOf(key);return index<0?fallback:args[index+1];};
 const live=value('--live',null),liveVerified=live?verifyLiveCodex(JSON.parse(fs.readFileSync(live,'utf8'))):null;
 const report=measureCryvernParity({count:Number(value('--count',128)),start:Number(value('--start',91001)),opponentCode:value('--opponent','V-055'),includePve:!args.includes('--no-pve'),onProgress:row=>console.log(JSON.stringify(row))});
 if(args.includes('--check-target'))checkCryvernTarget(report);
 const out=value('--out',null);if(out)fs.writeFileSync(out,JSON.stringify({...report,liveVerified},null,2)+'\n');console.log(JSON.stringify({policy:report.policy,pve:report.pve}));
}
