import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {JOINT_ATOMIC_SCHEMA} from '../../functions/_joint_atomic.js';
import {emptyPetDraft} from '../../shared/pet-cms-v1.mjs';
import {PET_ART_CATALOG} from '../../shared/pet-art-catalog-v1.mjs';
import {handlePetEquipment} from '../../functions/_pet_equipment.js';
import {handlePetPotential} from '../../functions/_pet_potential.js';
import {handlePetCompanionCms} from '../../functions/_pet_companion_cms.js';

export async function petLiveFixture(t){
  const pg=new PGlite();t?.after(()=>pg.close());
  await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT);INSERT INTO users VALUES(2,'USER'),(9,'OWNER');
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order BIGINT,is_active BIGINT);
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT,created_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,'PET_POTENTIAL_POTION',5,5);
    CREATE TABLE inventory_logs(user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
    CREATE TABLE admin_logs(admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    ${JOINT_ATOMIC_SCHEMA.join(';')};`);
  let failure='',lost=false,attemptTransaction=false;
  const env={DB:new __postgresCompatTest.PostgresD1Database({async query(input){
    const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
    if(failure&&sql.includes(failure))throw Error('injected pet write failure');
    if(sql==='BEGIN')attemptTransaction=false;if(sql.includes('INSERT INTO inventory_logs'))attemptTransaction=true;
    const r=await pg.query(sql,values);if(lost&&sql==='COMMIT'&&attemptTransaction){lost=false;throw Error('lost commit response');}
    return {...r,rowCount:r.affectedRows??r.rows.length};
  }})};
  const write=async(key,value)=>pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(value)]);
  const art=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON');
  const pet={...emptyPetDraft(art.code),name:art.name,sourceArt:art.sourceArt,buffs:[{type:'ATTACK_PERCENT',percent:10}]};
  // Existing production documents were stored before live support was released.
  await write('pet_cms_preparation_v1',{revision:4,audit:[],document:{version:1,visibility:'CMS_ONLY',battleEnabled:false,acquisitionEnabled:false,pets:[pet]}});
  await write('pet_collection_v1:2',{revision:1,pets:{'PET-BONGSOON':2}});
  const call=async(path,{body,method=body?'POST':'GET',user=2,origin='https://qa.test'}={})=>{
    const actor={id:user,role:user===9?'OWNER':'USER'},deps={authenticate:async()=>actor,requirePermission:async()=>actor.role==='OWNER'?actor:null,json:(data,status=200)=>Response.json(data,{status}),withUserMutationLock:async(_env,_id,_path,work)=>work()};
    const request=new Request('https://qa.test/api/'+path,{method,headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const args={path,request,env,deps},response=await handlePetEquipment(args)||await handlePetPotential(args)||await handlePetCompanionCms(args);
    return {status:response.status,body:await response.json()};
  };
  const record=async key=>JSON.parse((await pg.query('SELECT value FROM app_meta WHERE key=$1',[key])).rows[0]?.value||'null');
  const balance=async()=>Number((await pg.query("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='PET_POTENTIAL_POTION'")).rows[0].quantity);
  const settings=async(successPpm=1000000)=>{const current=await call('admin/pets/potential',{user:9});return call('admin/pets/potential',{user:9,method:'PATCH',body:{settings:{...current.body.settings,enabled:true,successPpm}}});};
  const equip=()=>call('pets/v1/loadout',{body:{petCode:pet.code,expectedRevision:0,petCmsRevision:4,requestId:crypto.randomUUID()}});
  return {pg,env,pet,write,record,balance,call,settings,equip,fail:pattern=>{failure=pattern;},loseCommit:()=>{lost=true;},close:()=>pg.close()};
}
