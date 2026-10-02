import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {handlePetCompanionCms} from '../../functions/_pet_companion_cms.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {battleConfig,MERCENARY_RUNTIME_DRAFT} from '../../functions/_mercenary_account.js';
import {emptyPetDraft} from '../../shared/pet-cms-v1.mjs';

export function reviewMercenaries(){
  const document=structuredClone(MERCENARY_CMS_SEED.document);
  return [['V-013','SS'],['V-021','SSS'],['V-022','SS']].map(([code,rank])=>{
    document.mercenaries.find(row=>row.code===code).rank=rank;
    return {...battleConfig(document,code,1),combat:MERCENARY_RUNTIME_DRAFT.combat};
  });
}
export function reviewPet(){return {...emptyPetDraft('PET-QA'),name:'검수용 펫',enabled:true,battleSprite:'assets/ui/project-v/characters/mercenary/mercenary-v013-raviena-sd-v1.png',buffs:[{type:'ATTACK_PERCENT',percent:20},{type:'MAX_HP_PERCENT',percent:10}]};}
export async function companionCmsFixture(){
  const pg=new PGlite();let calls=0,fail=false;
  await pg.exec('CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL AS $$ SELECT CURRENT_TIMESTAMP::text $$; CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT sqlite_now());');
  const client={async query(input){calls++;const sql=typeof input==='string'?input:input.text;if(fail&&/^(UPDATE|INSERT) app_meta|^INSERT INTO app_meta/.test(sql))throw Error('injected failure');const result=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const handle=(request,options={})=>handlePetCompanionCms({env,path:options.path||'admin/pets',request,deps:{requirePermission:async()=>options.denied?null:{id:options.owner||1,role:options.role||'OWNER'},readCatalog:async()=>({revision:7,mercenaries:reviewMercenaries()}),json:(data,status=200)=>Response.json(data,{status})}});
  const call=async(body,options={})=>{
    const response=await handle(new Request('https://qa.test/api/'+(options.path||'admin/pets'),{method:options.method||(body?'PATCH':'GET'),...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),options);
    return response?{status:response.status,headers:response.headers,body:await response.json()}:null;
  };
  return {pg,env,handle,call,count:()=>calls,fail:value=>{fail=value;},close:()=>pg.close()};
}
