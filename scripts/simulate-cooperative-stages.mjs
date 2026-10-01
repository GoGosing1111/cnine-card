import fs from 'node:fs/promises';
import {createCoopRoom,coopCommand} from '../functions/_cooperative_room.js';
import {COOP_DIFFICULTIES} from '../shared/cooperative-battleground-v1.mjs';
import {fixture,coopSquads,COOP_MERCENARIES,COOP_COMPOSITIONS} from '../tests/helpers/cooperative-fixture.mjs';
const rows=[];
for(const difficulty of COOP_DIFFICULTIES)for(const [rank,mercenaries]of Object.entries(COOP_MERCENARIES))for(const composition of Object.keys(COOP_COMPOSITIONS))for(const response of ['ALL','NONE']){
 const equipment={NORMAL:2000000,HARD:10000000,EXTREME:20000000}[difficulty.id];
 let wins=0,totalSeconds=0,stageSum=0,successfulMechanics=0;
 for(let n=1;n<=4;n++){
  const squads=coopSquads({mercenaries,composition,equipment}),users=squads.map(s=>({id:s.ownerId,nickname:s.ownerName}));
  const clientId=id=>'stage-balance-client-'+id;
  const room=createCoopRoom({id:'ABC1234567',user:users[0],clientId:clientId(1),difficulty:difficulty.id,seed:n*7919,now:1000});
  for(const user of users.slice(1))coopCommand(room,user,'join',{clientId:clientId(user.id)},1000);
  for(const user of users)coopCommand(room,user,'ready',{clientId:clientId(user.id),loadout:squads[user.id-1]},2000);
  for(const user of users)coopCommand(room,user,'loaded',{clientId:clientId(user.id)},3000);
  for(let now=4000;room.status==='ACTIVE'&&now<=190000;now+=1000){
   for(const user of users)if(!room.members[user.id-1].result)try{coopCommand(room,user,'ping',{clientId:clientId(user.id)},now);}catch(e){if(e.code!=='COOP_FINISHED')throw e;}
   const p=room.pattern;
   if(response==='ALL'&&room.status==='ACTIVE'&&p?.status==='OPEN')for(const user of users){
    const frame=room.states.findLast(s=>s.atMs<=now-room.startsAt);
    if(p.inputs[user.id]||!p.participants.includes(user.id)||!frame.A.some(f=>f.ownerId===user.id&&f.hp>0))continue;
    coopCommand(room,user,'mechanic',{clientId:clientId(user.id),patternId:p.id,action:p.kind==='VENT'?'VENT':p.targetId===user.id?'GUARD':'JAM'},now);
   }
  }
  const won=room.status==='VICTORY';wins+=+won;if(won)totalSeconds+=room.durationMs/1000;
  stageSum+=Math.max(...room.states.at(-1).B.map(f=>f.wave));successfulMechanics+=room.patternHistory.filter(p=>p.status==='SUCCESS').length;
 }
 rows.push({difficulty:difficulty.id,rank,composition,response,equipmentPerPlayer:equipment,level:13,seeds:4,wins,meanClearSeconds:wins?+(totalSeconds/wins).toFixed(1):null,meanLastStage:stageSum/4,successfulMechanics});
}
const report={version:'20261002-arke-v2',fixtureCheckedAt:fixture.checkedAt,cmsRevision:fixture.cmsRevision,scope:'CANONICAL_SERVER_ROOM_SIMULATION_NOT_PLAYER_WIN_RATE',fixtureAssumptions:fixture.assumptions,assumptions:['Perfect response = every living owner answers in the first server second; NONE = no mechanic input.','Fixed opponents; three waves share the same 180-second limit and persistent party resources.'],battles:rows.length*4,rows};
await fs.writeFile(new URL('../docs/cooperative-stages-balance-20261002.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.table(rows.filter(r=>r.composition==='BALANCED').map(({difficulty,rank,response,wins,meanClearSeconds})=>({difficulty,rank,response,wins,meanClearSeconds})));
console.log('Shared-room simulations:',report.battles);
