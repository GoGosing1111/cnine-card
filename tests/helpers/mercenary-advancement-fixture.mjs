import {mercenaryPityFixture} from './mercenary-pity-fixture.mjs';
import {handleMercenaryAccount} from '../../functions/_mercenary_account_routes.js';

export async function advancementFixture(t,postgres=false) {
  const f=await mercenaryPityFixture(t,postgres);
  const schema='CREATE TABLE IF NOT EXISTS ranked_duo_accounts_v1(user_id BIGINT PRIMARY KEY,source_version BIGINT NOT NULL DEFAULT 0)';
  if(postgres)await f.pg.exec(schema);else await f.p(schema).run();
  await f.p('INSERT INTO ranked_duo_accounts_v1(user_id,source_version) VALUES(7,2)').run();
  await f.p("UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=7",'90071992547409937').run();
  await f.p("UPDATE cnine_user_inventory SET quantity=160000000,unseen_quantity=10 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  await f.setState('V-996',{level:11,experience:37,breakthroughMask:3,revision:3});
  await f.setState('V-049',{level:20,experience:0,breakthroughMask:15,revision:4});
  const call=async(action,body,account=7)=>{
    const path='mercenaries/v3/advancement/'+action;
    const request=new Request('https://qa.invalid/api/'+path,{method:body?'POST':'GET',headers:{
      authorization:'Bearer local-account-'+account,'content-type':'application/json',origin:'https://qa.invalid'
    },...(body?{body:JSON.stringify(body)}:{})});
    const res=await handleMercenaryAccount({path,request,env:f.env,deps:f.deps});
    return {status:res.status,data:await res.json()};
  };
  return {...f,call};
}
