import {transferFixture} from './mercenary-experience-transfer-db.mjs';
import {handleMercenaryLevel} from '../../functions/_mercenary_level.js';
export async function primeRequiemLevelFixture(t,postgres=false){
 const f=await transferFixture(t,postgres);
 await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)','V-975','2026-10-26','2026-10-26').run();
 const call=async(action,body,user=7)=>{const path='mercenaries/v3/leveling/'+action,response=await handleMercenaryLevel({path,env:f.env,deps:f.deps,request:new Request('https://qa.test/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-'+user,'content-type':'application/json',origin:'https://qa.test'},...(body?{body:JSON.stringify(body)}:{})})});return {status:response.status,body:await response.json()};};
 return {...f,call};
}
