import fs from 'node:fs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
const directory=new URL('../preview/icon-roles-v1/',import.meta.url);
fs.mkdirSync(directory,{recursive:true});
const cards=ICON_LIVE_CARDS.map(c=>({...c,id:c.cardId,rarity:'ICON',image:c.sourceArt,power:180000,iconRole:iconRoleSnapshot({...c,id:c.cardId},defaultIconRoles(),'PVP')}));
const only=process.argv.find(x=>x.startsWith('--only='))?.slice(7);
const results=[];
for(const [index,def] of ICON_ROLES.entries())for(const mode of ['PVE','PVP']){
 if(only&&def.code!==only)continue;
 const team=Array.from({length:5},(_,i)=>({...cards[(index+[1,2,0,3,4][i])%cards.length]})).map(c=>({...c,iconRole:iconRoleSnapshot(c,defaultIconRoles(),mode)}));
 const opponents=Array.from({length:5},(_,i)=>({...cards[(index+i+2)%cards.length],power:180000,iconRole:iconRoleSnapshot(cards[(index+i+2)%cards.length],defaultIconRoles(),mode)}));
 const monster={id:1,name:'전투 검수 수호자',image:'assets/cards/monster/sla2.jfif',battle_power:780000};
 let battleV2;
 for(let seed=991+index;seed<1100;seed++){
  battleV2=mode==='PVE'?createPveBattleV2({cards:team,monster,seed}):createPvpBattleV2({attackerCards:team,defenderCards:opponents,seed});
  if(battleV2.result.timeline.some(e=>e.type==='ICON_SKILL'&&e.iconCode===def.code&&e.actorId.startsWith('A:')))break;
 }
 if(!battleV2.result.timeline.some(e=>e.type==='ICON_SKILL'&&e.iconCode===def.code&&e.actorId.startsWith('A:')))throw Error('Missing selected role in fixture '+def.code+' '+mode);
 const payload={battleV2,cards:team,monster:mode==='PVE'?monster:undefined,mode,battlefieldMode:mode,playerName:'ICON 역할 검수',opponentName:mode==='PVE'?monster.name:'ICON 상대 편성'};
 const file=def.code.toLowerCase()+'-'+mode.toLowerCase()+'.json';
 fs.writeFileSync(new URL(file,directory),JSON.stringify(payload));
 results.push({code:def.code,mode,file,actions:battleV2.result.actions,casts:battleV2.result.timeline.filter(e=>e.type==='ICON_SKILL'&&e.iconCode===def.code).length});
}
fs.writeFileSync(new URL('fixtures.json',directory),JSON.stringify({version:'20261004-rpg-v1',authority:'SERVER_SIMULATION_OFFLINE_NO_REWARDS',results:only?[...JSON.parse(fs.readFileSync(new URL('fixtures.json',directory),'utf8')).results.filter(r=>r.code!==only),...results]:results},null,2)+'\n');
console.log(JSON.stringify(results));
