import {petCodexFixture} from './pet-codex-grants-fixture.mjs';
import {ensureJointTransactionSchema} from '../../functions/_joint_transactions.js';
import {handlePetPumpkinChoice} from '../../functions/_pet_pumpkin_choice.js';
import {PET_PUMPKIN_CHOICE_ITEM as ITEM,PET_PUMPKIN_CHOICES as PETS} from '../../shared/pet-pumpkin-choice-v1.mjs';
import {emptyPetDraft} from '../../shared/pet-cms-v1.mjs';

export async function pumpkinChoiceFixture(t,{postgres=false,tickets=3}={}){
  const f=await petCodexFixture(t,{postgres}),p=f.p;
  const schema=['ALTER TABLE cnine_user_inventory ADD COLUMN updated_at TEXT','CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)'];
  if(postgres)await f.DB.execSchema(schema);else for(const sql of schema)await p(sql).run();
  await ensureJointTransactionSchema(f.env);
  const cms=await f.record('pet_cms_preparation_v1');
  cms.document.pets=cms.document.pets.filter(pet=>!PETS.some(choice=>choice.code===pet.code));
  cms.document.pets.push(...PETS.map(pet=>({...emptyPetDraft(pet.code),name:pet.name,sourceArt:pet.sourceArt,liveEnabled:false})));
  await f.write('pet_cms_preparation_v1',cms);
  await f.write('pet_loadout_v1:2',{revision:2,petCode:'PET-BONGSOON',audit:[]});
  await f.write('pet_potentials_v1:2',{revision:1,pets:{'PET-BONGSOON':{potential:null,attempts:2}}});
  await f.write('pet_opening_settings_v1',{revision:8,enabled:true,essencePerOpen:10,maxBatch:10,blankWeight:0,pool:[{code:'PET-BONGSOON',weight:1}]});
  await f.write('pet_potential_settings_v1',{version:1,revision:5,enabled:false,successPpm:null});
  await f.write('supporter_season_pass_v1',{revision:3,enabled:false});
  await p('INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES(?,?,?,?,1)',ITEM.code,ITEM.name,ITEM.rarity,ITEM.image).run();
  await p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,?,?,?)',ITEM.code,tickets,tickets).run();
  await p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,'PET_ESSENCE',77,5)").run();
  const locks=new Map(),withUserMutationLock=async(_env,id,_path,work)=>{const next=(locks.get(id)||Promise.resolve()).then(work,work);locks.set(id,next.catch(()=>{}));return next;};
  const user={id:2,role:'USER'};
  const requestBody=(index=0)=>({requestId:crypto.randomUUID(),targetCode:PETS[index].code,version:1});
  const call=async(path='use',{body=path==='use'?requestBody():undefined,userId=2,method=path==='use'?'POST':'GET',origin='https://choice.test',requestId}={})=>{
    const actor=userId?{id:userId,role:userId===9?'OWNER':'USER'}:null;
    const request=new Request('https://choice.test/api/pets/choice/'+path+(requestId?'?requestId='+encodeURIComponent(requestId):''),{method,headers:{origin,'content-type':'application/json'},...(body!==undefined&&method!=='GET'?{body:JSON.stringify(body)}:{})});
    const response=await handlePetPumpkinChoice({path:'pets/choice/'+path,request,env:f.env,deps:{authenticate:async()=>actor,json:(value,status=200)=>Response.json(value,{status}),withUserMutationLock}});
    return {status:response.status,headers:Object.fromEntries(response.headers),body:await response.json()};
  };
  const snapshot=async()=>({
    pets:await f.record('pet_collection_v1:2'),
    inventory:(await p('SELECT item_code,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=2 ORDER BY item_code').all()).results.map(row=>({...row,quantity:Number(row.quantity),unseen_quantity:Number(row.unseen_quantity)})),
    preserved:(await p("SELECT key,value FROM app_meta WHERE key IN ('pet_cms_preparation_v1','pet_opening_settings_v1','pet_potential_settings_v1','supporter_season_pass_v1','pet_loadout_v1:2','pet_potentials_v1:2') ORDER BY key").all()).results,
    coin:Number((await p('SELECT coin FROM users WHERE id=2').first()).coin)
  });
  return {...f,user,body:requestBody,call,snapshot,tickets:async()=>Number((await p('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',ITEM.code).first()).quantity)};
}
