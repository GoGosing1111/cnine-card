import {cooperativeMiniflare} from './cooperative-miniflare.mjs';
import {DEFENSE_KEY,defaultDefenseSettings} from '../../shared/monster-defense-v1.mjs';
export async function monsterDefenseFixture(){
 const f=await cooperativeMiniflare({worker:'tests/helpers/monster-defense-worker.mjs'});
 const settings={...defaultDefenseSettings(),testUserIds:[2,3]};
 await f.db.batch([f.db.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').bind(DEFENSE_KEY,JSON.stringify(settings))]);
 const api=async(id,path,body)=>{const response=await fetch(f.origin+'/api/'+path,{method:body?'POST':'GET',headers:{authorization:id?'Bearer local-qa-'+id:'',origin:f.origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
 const live=async(session,path,body,headers={})=>{const url=new URL(f.origin+'/api/defense/live/'+path);url.searchParams.set('room',session.roomId);const response=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+session.token,origin:f.origin,'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
 const room=async(id,value)=>{const response=await fetch(f.origin+'/__qa/defense-room/'+id,value?{method:'POST',body:JSON.stringify(value)}:{});if(!response.ok)throw Error(await response.text());return response.json();};
 return {...f,api,live,settings,room};
}
