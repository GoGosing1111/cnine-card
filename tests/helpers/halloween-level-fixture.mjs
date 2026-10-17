import {mercenaryFixture} from './mercenary-db.mjs';
import {HALLOWEEN_MERCENARIES} from '../../shared/mercenary-halloween-catalog-v1.mjs';
import {mercenaryGrowthLaunchPolicy} from '../../shared/mercenary-growth-launch-20261016.mjs';
import {MERCENARY_LEVEL_KEY} from '../../shared/mercenary-level-v1.mjs';
import {ensureMercenaryLevelSchema} from '../../functions/_mercenary_level_policy.js';
import {handleMercenaryLevel} from '../../functions/_mercenary_level.js';
const regular='V-001';
export async function halloweenLevelFixture(t,postgres=true){
  const f=await mercenaryFixture(t,{postgres});await ensureMercenaryLevelSchema(f.env);
  f.document.mercenaries.find(c=>c.code===regular).rank='SS';
  await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(f.document)).run();
  const policy=mercenaryGrowthLaunchPolicy({revision:1});await f.setting(MERCENARY_LEVEL_KEY,policy);
  for(const card of [...HALLOWEEN_MERCENARIES,{code:regular}]){
    const total=card.code===regular?1000:card.code==='V-980'?2:1;
    await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,?,?,?,?)',card.code,total,total-1,'2026-10-17','2026-10-17').run();
  }
  const call=async(action,body,user=7)=>{
    const path='mercenaries/v3/leveling/'+action;
    const response=await handleMercenaryLevel({path,env:f.env,deps:f.deps,request:new Request('https://qa.test/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-'+user,'content-type':'application/json',origin:'https://qa.test'},...(body?{body:JSON.stringify(body)}:{})})});
    return {status:response.status,body:await response.json()};
  };
  return {...f,call,growthPolicy:policy};
}
