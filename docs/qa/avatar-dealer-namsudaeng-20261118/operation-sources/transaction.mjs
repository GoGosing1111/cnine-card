import assert from 'node:assert/strict';
import {OP,code,serial,name,role,description,approvedSHA256,snapshot} from './state.mjs';
export function preserved(actual,expected){
 const strip=row=>{const x={...row};if(x.code===code)for(const k of ['name','role_label','description','lobby_image','lobby_mobile_image','equipment_image','version','updated_at'])delete x[k];return JSON.parse(JSON.stringify(x));};
 assert.deepEqual(actual.catalog.map(strip),expected.catalog.map(strip));
 for(const key of ['effects','ownership','loadouts'])assert.deepEqual(JSON.parse(JSON.stringify(actual[key])),expected[key]);
 assert.deepEqual(actual.settings.filter(x=>x.key!==OP),expected.settings.filter(x=>x.key!==OP));
}
export async function replace(c,{before,urls,served,release,production,failAt=null}){
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['avatar_catalog:'+code]);
 const old=(await c.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows;
 if(old.length){const receipt=JSON.parse(old[0].value);assert.equal(receipt.approvedMasterSHA256,approvedSHA256);assert.equal(receipt.name,name);assert.deepEqual(receipt.images.map(x=>x.url),urls);return {receipt,replayed:true,writes:0};}
 const row=(await c.query('SELECT * FROM avatar_catalog_v1 WHERE code=$1 FOR UPDATE',[code])).rows[0];assert.equal(row.serial,serial);assert.deepEqual(JSON.parse(JSON.stringify(row)),before.catalog.find(x=>x.code===code));
 preserved(await snapshot(c),before);
 const operator=(await c.query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'")).rows[0];assert(operator);
 const at=(await c.query('SELECT clock_timestamp() t')).rows[0].t.toISOString();
 const updated=(await c.query('UPDATE avatar_catalog_v1 SET name=$1,role_label=$2,description=$3,lobby_image=$4,lobby_mobile_image=$5,equipment_image=$6,version=version+1,updated_at=$7 WHERE code=$8 AND version=$9 RETURNING *',[name,role,description,...urls,at,code,row.version])).rows;assert.equal(updated.length,1);
 if(failAt==='catalog')throw Error('EXPECTED_FAILURE_catalog');
 const receipt={key:OP,authorization:['해당 이미지로 사용, 장비창에 사용할 정자세 포즈도 만들것','산타걸 남수댕 아바타 딜러 남수댕으로 변경'],at,code,serial,name,role,description,approvedVersion:'v4-balanced-head',approvedMasterSHA256:approvedSHA256,source:release.head,pages:production.pages.id,beforeVersion:row.version,version:updated[0].version,images:served,public:!!row.is_public,sale:!!row.sale_enabled,active:!!row.is_active,effectsUnchanged:true,ownershipUnchanged:true,loadoutsUnchanged:true,approvedLobbyRGBUnchanged:true};
 const audit=(await c.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[operator.id,'AVATAR_RENAME_ART_REPLACE','AVATAR_CATALOG',code,JSON.stringify(row),JSON.stringify(receipt),at])).rows[0];receipt.audit=Number(audit.id);
 if(failAt==='audit')throw Error('EXPECTED_FAILURE_audit');
 await c.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);preserved(await snapshot(c),before);
 return {receipt,replayed:false,writes:3};
}
