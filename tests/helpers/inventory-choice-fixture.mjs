import {mercenaryFixture} from './mercenary-db.mjs';
import {ensureMercenaryLevelSchema} from '../../functions/_mercenary_level_policy.js';
import {ensureForgeTransactionSchema} from '../../functions/_equipment_forge_transactions.js';
import {EMPEROR_BOX,LEVEL_TICKET,handleInventoryChoice} from '../../functions/_inventory_choice.js';
import {EQUIPMENT_SET_PARTS} from '../../shared/equipment-set-visual-v1.mjs';

export async function choiceFixture(t,postgres=false){
  const f=await mercenaryFixture(t,{postgres,productionEquipmentRequests:true});
  await ensureMercenaryLevelSchema(f.env);await ensureForgeTransactionSchema(f.env);
  for(const item of [EMPEROR_BOX,LEVEL_TICKET]){
    await f.p('INSERT INTO inventory_items(code,name,category,description,image_url,rarity) VALUES(?,?,?,?,?,?)',item.code,item.name,item.category,item.description,item.image,item.rarity).run();
    await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,4,4)',item.code).run();
  }
  const names=['엠퍼러 슈트','엠퍼러 레깅스','엠퍼러 슈즈','엠퍼러 듀얼디스크'];
  const slots=Object.entries(EQUIPMENT_SET_PARTS.EMPEROR);
  for(const [i,[slot,code]] of slots.entries())await f.p('INSERT INTO character_equipment_items(id,code,name,slot,rarity) VALUES(?,?,?,?,?)',43+i,code,names[i],slot,'EMPEROR').run();
  for(const code of ['V-001','V-049','V-055','V-996','V-999'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,2,1,?,?)',code,'2026-11-11','2026-11-11').run();
  const setLevel=(code,level,mask,xp)=>f.p('INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,breakthrough_mask,experience,revision,updated_at) VALUES(7,?,?,?,?,1,CURRENT_TIMESTAMP)',code,level,mask,xp).run();
  await setLevel('V-049',5,0,120);await setLevel('V-055',15,3,0);await setLevel('V-996',20,7,1000);await setLevel('V-999',20,15,0);
  let queue=Promise.resolve();
  const call=async(item,action,body,{userId=7,receiptId,method=action==='use'?'POST':'GET',origin='https://choice.test'}={})=>{
    const path='item-choice/'+item.code+'/'+action;
    const req=new Request('https://choice.test/api/'+path+(receiptId?'?requestId='+receiptId:''),{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const resp=await handleInventoryChoice({path,request:req,env:f.env,deps:{
      json:(v,status,headers)=>Response.json(v,{status,headers}),authenticate:async()=>userId?{id:userId}:null,
      withUserMutationLock:async(_env,_id,_path,cb)=>{const next=queue.then(cb,cb);queue=next.catch(()=>{});return next;}
    }});
    return {status:resp.status,body:await resp.json(),cache:resp.headers.get('cache-control')};
  };
  const qty=async item=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',item.code).first()).quantity);
  return {...f,call,qty};
}
