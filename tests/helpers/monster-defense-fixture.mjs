import {cooperativeMiniflare} from './cooperative-miniflare.mjs';
import {DEFENSE_KEY,defaultDefenseSettings} from '../../shared/monster-defense-v1.mjs';
export const defenseOwnedLoadout=()=>({mercenaries:['V-004','V-009'],card:'CARD:CN-02D9DC1E8A8A4209'});
export async function monsterDefenseFixture(){
 const f=await cooperativeMiniflare({worker:'tests/helpers/monster-defense-worker.mjs'});
 const settings={...defaultDefenseSettings(),testUserIds:[2,3]};
 await f.db.batch([f.db.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').bind(DEFENSE_KEY,JSON.stringify(settings))]);
 const api=async(id,path,body)=>{const response=await fetch(f.origin+'/api/'+path,{method:body?'POST':'GET',headers:{authorization:id?'Bearer local-qa-'+id:'',origin:f.origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
 const live=async(session,path,body,headers={})=>{const url=new URL(f.origin+'/api/defense/live/'+path);url.searchParams.set('room',session.roomId);const response=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+session.token,origin:f.origin,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
 const room=async(id,value)=>{const response=await fetch(f.origin+'/__qa/defense-room/'+id,value?{method:'POST',body:JSON.stringify(value)}:{});if(!response.ok)throw Error(await response.text());return response.json();};
 const ready=async(session,value=true,requestId=crypto.randomUUID())=>{const snapshot=await live(session,'state'),mine=snapshot.players.find(p=>p.id===session.playerId);return api(Number(session.playerId),'defense/ready',{roomId:session.roomId,loadout:mine.loadout,loadoutRevision:mine.loadoutRevision||0,ready:value,requestId});};
 return {...f,api,live,settings,room,ready};
}
