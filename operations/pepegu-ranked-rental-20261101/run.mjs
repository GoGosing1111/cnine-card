import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const root='C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout',mode=process.argv[2];assert(['dry-run','apply','verify'].includes(mode));
const source='scripts/ops/pepegu-ranked-rental-20261101.mjs',{OP,CMS,SHOP,hash,inspect,applyPepeguRental}=await import(pathToFileURL(root+'/'+source)),sourceHash=hash(await fs.readFile(root+'/'+source));
const read=async name=>JSON.parse(await fs.readFile(new URL('./'+name+'.json',import.meta.url))),reviewed=(await read('read')).records,db=connect();
const verify=async receipt=>{
 const records=await inspect(db),cms=records[CMS].state,shop=records[SHOP].state;
 assert.deepEqual(cms.document.pets.find(p=>p.code==='PET-PEPEGU'),receipt.pet);assert.deepEqual(cms.document.pets.find(p=>p.code==='PET-HEUKGU'),receipt.heukguUnchanged);assert.equal(hash(cms.document.pets.filter(p=>p.code!=='PET-PEPEGU')),receipt.preservedPetsHash);assert.equal(hash(shop.products.filter(p=>p.id!=='pepegu_30days')),receipt.preservedProductsHash);assert.deepEqual(shop.products.find(p=>p.id==='pepegu_30days'),receipt.product);assert.equal(cms.revision,receipt.cmsRevision);assert.equal(shop.revision,receipt.shopRevision);
 for(const key of ['pet_opening_settings_v1','pet_potential_settings_v1'])assert.equal(records[key]?.raw,reviewed[key]?.raw);
 assert.deepEqual(records[OP].state,receipt);const audits=(await db.query('SELECT id::text FROM admin_logs WHERE action_type=$1 AND target_id=$2',['OPS_PEPEGU_RANKED_RENTAL',OP])).rows;assert.deepEqual(audits,[{id:receipt.auditId}]);
 return {verified:true,cmsRevision:cms.revision,shopRevision:shop.revision,petCount:cms.document.pets.length,productCount:shop.products.length,pet:receipt.pet,product:receipt.product,preservedPetsHash:receipt.preservedPetsHash,preservedProductsHash:receipt.preservedProductsHash,auditId:receipt.auditId,accountWrites:0,messagesSent:0};
};
try{
 await db.connect();let result;
 if(mode==='verify'){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const receipt=(await inspect(db))[OP]?.state;assert(receipt);result={...await verify(receipt),receipt,readOnly:true};await db.query('ROLLBACK');}
 else{
  const before=await inspect(db);
  if(mode==='dry-run'){
   let updates=0;await assert.rejects(()=>applyPepeguRental({query:(sql,args)=>{if(sql.startsWith('UPDATE app_meta SET')&&++updates===2)throw Error('Injected second setting write failure');return db.query(sql,args);}},reviewed),/Injected second setting/);assert.equal(updates,2);assert.deepEqual(await inspect(db),before);
   result=await applyPepeguRental(db,reviewed);assert.equal(result.committed,false);assert.deepEqual(await inspect(db),before);result.partialFailureRollbackVerified=true;result.rollbackVerified=true;
  }else{
   const dry=await read('dry-run'),live=await read('live-verification');assert.equal(dry.sourceHash,sourceHash);assert(dry.partialFailureRollbackVerified&&dry.rollbackVerified);assert.equal(live.status,'VERIFIED');
   result=await applyPepeguRental(db,reviewed,{commit:true});result.verification=await verify(result.receipt);
   const replay=await applyPepeguRental({query:(sql,args)=>{assert(!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql),'Replay must not write');return db.query(sql,args);}},reviewed,{commit:true});assert(replay.replayed);assert.deepEqual(replay.receipt,result.receipt);result.noWriteReplayVerified=true;
  }
 }
 result.sourceHash=sourceHash;result.checkedAt=new Date().toISOString();await fs.writeFile(new URL('./'+mode+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({mode,committed:result.committed,verified:result.verified??result.verification?.verified,rollbackVerified:result.rollbackVerified,partialFailureRollbackVerified:result.partialFailureRollbackVerified,noWriteReplayVerified:result.noWriteReplayVerified,auditId:result.receipt.auditId,cmsRevision:result.receipt.cmsRevision,shopRevision:result.receipt.shopRevision}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
