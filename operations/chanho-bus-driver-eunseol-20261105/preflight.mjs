import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe,hash} from '../rap-contest-rewards-20261027/preflight.mjs';
const OP='ops:chanho-bus-driver-eunseol:20261105:v1',ID='4597',NAME='찬호',CODE='V-973',TITLE='655095';
const db=connect();
try{
 db.connectionParameters.application_name='chanho-bus-driver-eunseol-preflight';
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(s,a=[])=>(await db.query(s,a)).rows,one=r=>(assert.equal(r.length,1),r[0]);
 const identity=one(await q('SELECT u.id::text,u.nickname,u.role,u.status,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2 ORDER BY u.id',[ID,NAME]));
 const {provider,provider_user_id,...target}=identity;assert.deepEqual(target,{id:ID,nickname:NAME,role:'USER',status:'ACTIVE'});assert(provider&&provider_user_id);target.identityHash=hash({provider,providerUserId:provider_user_id});
 const title=one(await q('SELECT * FROM character_titles WHERE id=$1 OR code=$2 OR name=$3',[TITLE,'RAID_BUS_DRIVER','버스기사']));assert.equal(String(title.id),TITLE);assert.equal(title.code,'RAID_BUS_DRIVER');assert.equal(title.name,'버스기사');assert.equal(title.unlock_type,'MANUAL');
 const titleHolding=await q('SELECT * FROM user_character_titles WHERE user_id=$1 AND title_id=$2',[ID,TITLE]);
 const holding=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[ID,CODE]);
 const acquisitions=await q('SELECT acquisition_id,user_id::text,mercenary_code,total_copies_after,created_at FROM mercenary_card_acquisitions_v1 WHERE user_id=$1 AND mercenary_code=$2 ORDER BY created_at DESC LIMIT 20',[ID,CODE]);
 const related=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:%chanho%' ORDER BY key",[OP]);assert(!related.some(r=>r.key===OP),'Completed operation exists; verify only');
 const codes=[CODE,'SSS_MIRACLE_CUBE:'+CODE];
 const stock=await q('SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes]);
 const issues=await q('SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) ORDER BY code,serial',[codes]);
 const craft=await q("SELECT output_ref,COUNT(*)::text rows,COALESCE(SUM(output_quantity) FILTER(WHERE success=1),0)::text crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=$1 GROUP BY output_ref",[CODE]);
 const triggers=await q('SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,pg_get_functiondef(t.tgfoid) function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relname=ANY($1::text[]) ORDER BY c.relname,t.tgname',[['user_character_titles','user_title_loadout','user_mercenary_cards_v1','mercenary_card_acquisitions_v1']]);
 const plan={operationKey:OP,authorization:'찬호 계정에 버스기사 칭호 지급하고 은설 용병까지 지급해',target,titleId:TITLE,titleCode:title.code,titleName:title.name,titlePolicy:'ENSURE_PERMANENT_PRESERVE_EXISTING',expectedTitle:titleHolding[0]??null,code:CODE,name:'은설',rank:'SSS',edition:'LIMITED',quantity:1,expectedHolding:holding[0]??null,stockPolicy:'ADMIN_DIRECT_NO_COUNTER_CHANGE',levelPolicy:'PRESERVE_EXISTING_DEFAULT_ONE',cost:0,sendMessages:false,automaticLoadout:false};
 const report={checkedAt:new Date().toISOString(),readOnly:true,target,title,titleHolding,holding,acquisitions,related,stock,issues,craft,triggers,planHash:hash(plan)};
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);await db.query('ROLLBACK');
 await fs.mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
 for(const [name,value] of [['plan.json',plan],['evidence/preflight.json',report]])await fs.writeFile(new URL('./'+name,import.meta.url),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({target,title:{id:TITLE,code:title.code,name:title.name,is_active:title.is_active,is_public:title.is_public},titleHolding,holding,priorAcquisitions:acquisitions.length,relatedOperations:related.map(r=>r.key),stock:stock.map(s=>({code:s.code,limit:s.stock_limit,issued:s.issued})),planHash:hash(plan),triggers:triggers.map(t=>({table:t.relname,name:t.tgname}))}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
