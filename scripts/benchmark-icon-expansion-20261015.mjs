import fs from 'node:fs';
import {buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {ICON_EXPANSION_CARDS,prepareStrongerIconFighter} from '../shared/icon-expansion-v1.mjs';
import {ICON_TECHNIQUE_PREPARATION} from '../shared/icon-techniques-v1.mjs';
const doc=defaultIconRoles(),results=[];
function old(def,side,mode){const c={id:def.cardId,power:180000,grade:'ICON',name:def.name};c.iconRole=iconRoleSnapshot(c,doc,mode);return buildFighter(c,0,side,null,mode);}
for(const mode of ['PVE','PVP'])for(const spec of ICON_EXPANSION_CARDS){
 const templates=ICON_ROLES.map(d=>old(d,'A',mode));
 const benchmark=Object.fromEntries(['maxHp','attack','defense','speed'].map(k=>[k,Math.max(...templates.map(t=>t[k]))]));
 const stats=prepareStrongerIconFighter({...templates[0],...benchmark,hp:benchmark.maxHp},spec.code);
 let wins=0,losses=0,draws=0,casts=0;const opponents=[];
 for(const def of ICON_ROLES){let win=0,loss=0,draw=0;
  for(const side of ['A','B'])for(let seed=1;seed<=16;seed++){
   const base=old(ICON_ROLES[0],side,mode),fresh={...base,...stats,id:side+':0:PREPARED-'+spec.code,cardId:'PREVIEW:'+spec.code,name:spec.name,title:spec.name,side,hp:stats.maxHp,alive:true,gauge:0},enemy=old(def,side==='A'?'B':'A',mode);
   const battle=simulateBattleV2Preview({teamA:side==='A'?[fresh]:[enemy],teamB:side==='B'?[fresh]:[enemy],seed,maxActions:120,[ICON_TECHNIQUE_PREPARATION]:{assignments:[{actorId:fresh.id,code:spec.techniqueCode,tuning:spec.tuning}]}});
   if(battle.winner===side){win++;wins++;}else if(battle.winner==='DRAW'){draw++;draws++;}else{loss++;losses++;}
   casts+=battle.timeline.filter(e=>e.type==='ICON_TECHNIQUE'&&e.phase==='CAST').length;
  }
  opponents.push({name:def.name,wins:win,losses:loss,draws:draw});
 }
 results.push({code:spec.code,mode,benchmark,preparedStats:Object.fromEntries(['maxHp','attack','defense','speed'].map(k=>[k,stats[k]])),tuning:spec.tuning,wins,losses,draws,casts,opponents});
}
const out='docs/qa/icon-expansion-public-off-20261015/balance.json';fs.mkdirSync('docs/qa/icon-expansion-public-off-20261015',{recursive:true});
fs.writeFileSync(out,JSON.stringify({status:'OFF_PREPARATION_ONLY',basis:'180000 power, maximum existing ICON stat per field, 1.25 multiplier, defaults, no equipment or mercenaries',limitation:'Isolated 1v1 balance evidence, not live win rates or every team matchup',results},null,2)+'\n');
console.log(JSON.stringify(results.map(({code,mode,wins,losses,draws,casts})=>({code,mode,wins,losses,draws,casts}))));
