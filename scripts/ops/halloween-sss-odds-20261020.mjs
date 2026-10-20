import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HALLOWEEN_PACK_KEY,readHalloweenPackSettings,validateHalloweenPack,halloweenEffectivePercent} from '../../shared/mercenary-halloween-pack-v1.mjs';
import {limitedRateUnits,LIMITED_RATE_SCALE,LIMITED_RATE_TOTAL} from '../../shared/mercenary-limited-rates-v1.mjs';

export const OPERATION_KEY='ops:halloween-sss-odds:20261020:v1';
export const AUTHORIZATION='절반씩 올려라 진무2경 헬리오스 발테르 1경';
export const RATES=Object.freeze({'V-989':{before:50,after:100},'V-999':{before:100,after:200},'V-996':{before:100,after:200}});
const codes=Object.keys(RATES).sort();
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};
export const documentHash=value=>createHash('sha256').update(value).digest('hex');

export function prepareHalloweenSssOdds(raw){
  const next=readHalloweenPackSettings(raw);
  assert.deepEqual(next.prices,{single:1000000000,ten:10000000000},'Reviewed pack prices changed');
  assert.equal(next.normalRankRatesPpm.SSS,500,'Reviewed SSS entry probability changed');
  let delta=0;
  for(const [code,rate] of Object.entries(RATES)){
    assert.equal(next.cardRatesPpm[code],rate.before,'Reviewed probability changed: '+code);
    delta+=limitedRateUnits(rate.after)-limitedRateUnits(rate.before);
    next.cardRatesPpm[code]=rate.after;
  }
  const remainder=limitedRateUnits(next.normalSssRatePpm)-delta;
  assert(Number.isSafeInteger(remainder)&&remainder>=0,'Insufficient ordinary SSS probability');
  next.normalSssRatePpm=remainder/LIMITED_RATE_SCALE;
  validateHalloweenPack(next);
  for(const rates of [[...Object.values(next.normalRankRatesPpm),next.missRatePpm],[...Object.values(next.cardRatesPpm),next.normalSssRatePpm]])
    assert.equal(rates.reduce((sum,rate)=>sum+limitedRateUnits(rate),0),LIMITED_RATE_TOTAL);
  return next;
}

export async function verifyHalloweenSssOdds(db){
  const receipt=JSON.parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
  assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.authorization,AUTHORIZATION);
  assert.deepEqual(receipt.after.settings,prepareHalloweenSssOdds(receipt.before.settings));
  assert.equal(receipt.after.revision,receipt.before.revision+1);assert.equal(receipt.stockChanged,false);assert.equal(receipt.grants,0);
  const audit=one(await q(db,'SELECT admin_id,action_type,target_id,before_data,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]));
  assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,'MERCENARY_HALLOWEEN_SSS_ODDS_DOUBLE');assert.equal(audit.target_id,HALLOWEEN_PACK_KEY);
  const {adminLogId,...logged}=receipt;assert.deepEqual(JSON.parse(audit.before_data),receipt.before);assert.deepEqual(JSON.parse(audit.after_data),logged);
  const current=JSON.parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[HALLOWEEN_PACK_KEY])).value);
  assert(current.revision>=receipt.after.revision);if(current.revision===receipt.after.revision)assert.deepEqual(current,receipt.after);
  return {status:'VERIFIED',receipt,currentRevision:current.revision};
}

export async function applyHalloweenSssOdds(db,{dryRun=true,expectedDocumentHash}={}){
  await db.query('BEGIN');
  try{
    await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='10s'");
    await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
    const stored=one(await q(db,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[HALLOWEEN_PACK_KEY]));
    if((await q(db,'SELECT key FROM app_meta WHERE key=$1',[OPERATION_KEY])).length){
      const verified=await verifyHalloweenSssOdds(db);await db.query('ROLLBACK');return {...verified,dryRun,replayed:true};
    }
    assert.equal(documentHash(stored.value),expectedDocumentHash,'Reviewed settings changed; read again');
    one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
    const stock=await q(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[codes]);
    assert.deepEqual(stock.map(s=>s.code),codes);
    const before=JSON.parse(stored.value),settings=prepareHalloweenSssOdds(before.settings),now=new Date().toISOString();
    const after={...before,revision:before.revision+1,settings,updatedAt:now,updatedBy:1,lastRequestId:OPERATION_KEY};
    const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:AUTHORIZATION,completedAt:now,before,after,stock,stockChanged:false,grants:0,
      effectivePercents:Object.fromEntries(codes.map(code=>[code,halloweenEffectivePercent(settings.normalRankRatesPpm.SSS,settings.cardRatesPpm[code])]))};
    one(await q(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[HALLOWEEN_PACK_KEY,JSON.stringify(after),now,stored.value]));
    assert.deepEqual(await q(db,'SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes]),stock);
    const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'MERCENARY_HALLOWEEN_SSS_ODDS_DOUBLE','SETTING',$1,$2,$3) RETURNING id",[HALLOWEEN_PACK_KEY,JSON.stringify(before),JSON.stringify(receipt)]));
    receipt.adminLogId=String(audit.id);
    one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
    const verified=await verifyHalloweenSssOdds(db);await db.query(dryRun?'ROLLBACK':'COMMIT');return {...verified,dryRun,replayed:false};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
