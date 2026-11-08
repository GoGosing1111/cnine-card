import {seasonEnabled,seasonAwardStatements} from './_season_s1.js';
import {readCoopEntry} from './_cooperative_energy.js';
import {readDefenseEntry} from './_monster_defense_entry.js';

// Only a Durable Object's terminal room can supply these receipts. A loss has
// no ordinary loot transaction, so its season-only batch is safe to replay.
export function seasonRoomMembers(env,source,room){
 if(!seasonEnabled(env)||room.rewardPolicy?.mode!=='ON'||!room.creationRequest||room.practice)return [];
 if(source==='COOP'){
  if(!['VICTORY','DEFEAT'].includes(room.status)||!Number.isSafeInteger(room.startsAt)||!(room.durationMs>0)||room.finishedAt!==room.startsAt+room.durationMs)return [];
  const left=new Set((room.withdrawals||[]).map(r=>Number(r.ownerId)));
  return room.members.filter(m=>m.result===room.status&&!m.reason&&!left.has(Number(m.id))).map(m=>Number(m.id));
 }
 if(source!=='DEFENSE'||!['VICTORY','DEFEAT'].includes(room.phase)||room.accountRoster!==true||!room.entryRequired||!Number.isSafeInteger(room.startedAt)||!(room.finishedAt>=room.startedAt)||!(room.wave>=1))return [];
 const entered=new Set((room.rewardParticipants||[]).map(Number));
 return room.players.filter(p=>!p.bot&&entered.has(Number(p.id))&&(room.phase==='VICTORY'||(p.lastSeen>=room.startedAt&&p.lastSeen>=room.finishedAt-60000))).map(p=>Number(p.id));
}
export async function seasonRoomStatements(env,source,room){
 const ids=[...new Set(seasonRoomMembers(env,source,room))].filter(n=>Number.isSafeInteger(n)&&n>0).sort((a,b)=>a-b);if(!ids.length)return [];
 if(source==='DEFENSE'&&!(await readDefenseEntry(env,room))?.charged)throw Error('Missing defense season entry proof');
 if(source==='COOP'&&room.rewardPolicy.entryEnergy&&!(await readCoopEntry(env,room))?.charged)throw Error('Missing cooperative season entry proof');
 const writes=[];for(const userId of ids)writes.push(...await seasonAwardStatements(env,{source,userId,eventId:room.id+':'+room.creationRequest,startedAt:source==='COOP'?room.startsAt:room.startedAt,won:(room.status||room.phase)==='VICTORY'}));
 return writes;
}
