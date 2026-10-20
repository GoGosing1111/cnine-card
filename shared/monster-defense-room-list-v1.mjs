import {DEFENSE_RULES} from './monster-defense-v1.mjs';

// Separate reserved instance: defense listings never enter the battleground list.
export const DEFENSE_DIRECTORY='defense:public-lobbies-v1';
export const defenseDirectory=mode=>mode==='ON'?DEFENSE_DIRECTORY+':ON':DEFENSE_DIRECTORY;
export const DEFENSE_LIST_LIMIT=50,DEFENSE_LIST_REFRESH_MS=10000,DEFENSE_LIST_LEASE_MS=45000;
export function defenseRoomListing(room,now=Date.now()){
 const humans=room.players.filter(p=>!p.bot),expiresAt=room.createdAt+DEFENSE_RULES.roomMs;
 if(room.practice||room.phase!=='LOBBY'||expiresAt<=now||!humans.some(p=>now-(p.lastSeen??room.createdAt)<DEFENSE_LIST_LEASE_MS))return null;
 const host=humans.find(p=>p.id===room.hostId)||humans[0];
 return {id:room.id,hostName:host.name,difficulty:room.difficulty,difficultyName:room.encounter.name,
  members:room.players.length,maxMembers:room.capacity,ready:humans.filter(p=>p.ready&&p.connected).length,
  totalWaves:room.encounter.waves,createdAt:room.createdAt,expiresAt,joinable:room.players.length<room.capacity};
}
