import {fixture as base} from './golden-axe-v1.mjs';
import {CHUSEOK_COIN,cleanChuseokSettings} from '../../js/chuseok-model-v1.js';
import {ensureChuseok,chuseokAdmin,chuseokState,drawChuseok} from '../../functions/_chuseok.js';
export async function fixture(){
 const f=await base();await ensureChuseok(f.env);await f.pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,$1,20,20),(2,$1,20,20)',[CHUSEOK_COIN]);
 const configure=async(rewards=[{id:'coin',kind:'COIN',ref:'',amount:50000000000,rate:100}],event='songpyeon',extra={})=>{
  const c=await chuseokAdmin(f.env,{id:99});return chuseokAdmin(f.env,{id:99},{...c.settings,visible:true,revision:c.revision,events:{...c.settings.events,[event]:{enabled:true,startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),coinCost:2,dailyLimit:0,rewards,...extra}}});
 };
 const body=async(event='songpyeon',choice=0,id=1)=>{const s=await chuseokState(f.env,id);return {requestId:crypto.randomUUID(),event,choice,revision:s.revision,quote:s.events[event].quote};};
 return {...f,configure,body,state:(id=1)=>chuseokState(f.env,id),draw:(body,id=1,n=0)=>drawChuseok(f.env,id,body,{randomInt:max=>n}),draft:cleanChuseokSettings};
}
