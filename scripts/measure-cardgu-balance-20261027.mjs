import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {scenarios} from './measure-razak-balance-20261026.mjs';
import live from '../docs/qa/razak-balance-20261026/live-input.json' with {type:'json'};
const snapshot=(code,f,mode)=>({...limitedDeploymentSnapshot(code),combat:live.combat,equipment:{schemaVersion:1,mode,power:f.gear},mercenaryLevel:{version:2,level:f.level,policyRevision:live.policyRevision,breakthroughMask:[5,10,15,20].reduce((m,t,i)=>m|(t<f.level?1<<i:0),0),growth:live.growth}});
const rows=[];let total=0,wins=0,losses=0,draws=0;
for(const f of scenarios){const row={scenario:f.id,level:f.level,gear:f.gear,total:0,wins:0,losses:0,draws:0};
 for(let i=0;i<64;i++)for(const side of ['A','B']){
  const seed=createHash('sha256').update('cardgu-parity:'+f.id+':'+i).digest().readUInt32BE(0),c=snapshot('V-970',f,'PVP'),g=snapshot('V-974',f,'PVP');
  const r=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?c:g,defenderMercenary:side==='A'?g:c,seed}).result;
  row.total++;row.wins+=+(r.winner===side);row.losses+=+(['A','B'].includes(r.winner)&&r.winner!==side);row.draws+=+(!['A','B'].includes(r.winner));
 }rows.push(row);total+=row.total;wins+=row.wins;losses+=row.losses;draws+=row.draws;
}
const pve=[];
for(const level of [1,11,21])for(const gear of [0,1e6])for(const power of [2e6,5e9,5e10])for(let i=0;i<8;i++){
 const f={...scenarios[1],level,gear},runs=['V-970','V-974'].map(code=>createPveBattleV2({cards:f.cards,mercenary:snapshot(code,f,'PVE'),monster:{id:1,battle_power:power},seed:271000+i*7919}).result);
 const view=r=>({winner:r.winner,casts:r.timeline.filter(e=>['MERCENARY_CARDGU_AREA','MERCENARY_GENERAL_JOK_AREA'].includes(e.type)).map(e=>[e.damage,e.absorbed]),mercenary:r.final.mercenaries?.A?.map(m=>({hp:m.hp,shield:m.shield,attack:m.attack,damageDealt:m.damageDealt,actions:m.actions}))});
 assert.deepEqual(view(runs[0]),view(runs[1]),JSON.stringify({level,gear,power,i}));pve.push({level,gear,power,seed:i,identical:true});
}
const report={scope:'SERVER_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',checkedAt:new Date().toISOString(),conditions:'Identical five-card decks, magic, level and equipment; 64 fresh seeds per scenario and mirrored sides. Existing growth policy fixture dated 2026-10-26.',pvp:{total,wins,losses,draws,winRate:wins/total,rows},pve:{pairedCases:pve.length,battles:pve.length*2,identical:true,rows:pve}};
const out=process.argv[2]||'docs/qa/cardgu-live-20261027/balance.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pvp:report.pvp.total,winRate:report.pvp.winRate,pvePairs:pve.length,pveIdentical:true}));
