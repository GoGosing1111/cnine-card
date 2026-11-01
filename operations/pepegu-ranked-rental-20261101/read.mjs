import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const db=connect(),keys=['pet_cms_preparation_v1','ranked_shop_policy_v1','pet_opening_settings_v1','pet_potential_settings_v1','ops:pepegu-ranked-rental:20261101:v1'];
try{await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).rows;
 const records=Object.fromEntries(rows.map(r=>[r.key,{raw:r.value,sha256:createHash('sha256').update(r.value).digest('hex'),state:JSON.parse(r.value)}]));
 const cms=records.pet_cms_preparation_v1.state,shop=records.ranked_shop_policy_v1.state;
 const result={records,heukgu:cms.document.pets.find(p=>p.code==='PET-HEUKGU'),pepegu:cms.document.pets.find(p=>p.code==='PET-PEPEGU'),readOnly:true,checkedAt:new Date().toISOString()};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./read.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({cmsRevision:cms.revision,shopRevision:shop.revision,salesEnabled:shop.salesEnabled,productCount:shop.products.length,heukgu:result.heukgu,pepegu:result.pepegu,completed:!!records[keys[4]]}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
