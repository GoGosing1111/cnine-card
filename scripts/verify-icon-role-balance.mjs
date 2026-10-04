import fs from 'node:fs';
import assert from 'node:assert/strict';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
const normal=i=>({id:'QA-BASE-'+i,grade:'ZENITH',power:180000,power_type:'NONE'}),rows=[];
for(const def of ICON_ROLES){
 let wins=0,casts=0,draws=0,maxEvents=0,pveCasts=0;
 for(let seed=1;seed<=80;seed++)for(const reverse of [false,true]){
  const raw={...normal(2),id:def.cardId,grade:'ICON'},role={...raw,iconRole:iconRoleSnapshot(raw,defaultIconRoles(),'PVP')},a=Array.from({length:5},(_,i)=>i===2?role:normal(i)),b=Array.from({length:5},(_,i)=>normal(i+10));
  const battle=createPvpBattleV2({attackerCards:reverse?b:a,defenderCards:reverse?a:b,seed}),result=battle.result,side=reverse?'B':'A';
  wins+=result.winner===side;draws+=!['A','B'].includes(result.winner);casts+=result.iconRoles[0].casts;maxEvents=Math.max(maxEvents,result.timeline.length);
  assert.ok(result.actions<=83);assert.ok(result.iconRoles.every(x=>x.casts<=6&&x.guardRemaining>=0&&x.healRemaining>=0));
  assert.ok([...result.final.A,...result.final.B].every(x=>Number.isFinite(x.hp)&&x.hp>=0&&x.hp<=x.maxHp&&x.shield>=0));
  if(seed<=8){const pve=createPveBattleV2({cards:a.map(c=>({...c,iconRole:iconRoleSnapshot(c,defaultIconRoles(),'PVE')})),monster:{id:1,name:'QA',battle_power:780000},seed});pveCasts+=pve.result.iconRoles[0].casts;}
 }
 rows.push({role:def.role,name:def.name,pvpBattles:160,wins,winPercent:wins/1.6,averageCasts:casts/160,unresolved:draws,maxEvents,pveCasts});
}
const result={version:'20261004-rpg-v1',method:'One ICON in rear slot 3, four neutral allies, equal-power neutral five-card opponent. 80 seeds, both sides. Diagnostic comparison, not a live ladder win-rate forecast.',pvpBattles:1120,rows};
fs.writeFileSync(new URL('../preview/icon-roles-v1/balance-report.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
