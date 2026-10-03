import {COOP_RULES} from './cooperative-battleground-v1.mjs';

// A reserved instance in the existing cooperative-player namespace.
export const COOP_DIRECTORY='public-lobbies-v1';
export const COOP_LIST_LIMIT=50,COOP_LIST_REFRESH_MS=10000,COOP_LIST_LEASE_MS=45000;
export function coopRoomListing(room,now=Date.now()){
 if(room.status!=='LOBBY'||room.expiresAt<=now||!room.members.length)return null;
 const host=room.members.find(m=>m.id===room.hostId)||room.members[0];
 return {id:room.id,hostName:host.name,difficulty:room.difficulty,members:room.members.length,maxMembers:COOP_RULES.players,
  ready:room.members.filter(m=>m.ready).length,power:room.members.reduce((sum,m)=>sum+Math.max(0,Number(m.loadout?.power)||0),0),
  createdAt:room.createdAt,expiresAt:room.expiresAt,joinable:room.members.length<COOP_RULES.players};
}
