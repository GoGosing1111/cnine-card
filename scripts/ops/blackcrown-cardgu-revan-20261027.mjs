import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {BLACKCROWN_PACK_KEY,readBlackcrownPackSettings,validateBlackcrownPack,blackcrownEffectivePercent} from '../../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLOODMOON_PACK_KEY,readBloodmoonPackSettings} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {limitedRateUnits,LIMITED_RATE_SCALE} from '../../shared/mercenary-limited-rates-v1.mjs';
export const OP='ops:blackcrown-cardgu-revan-prepare:20261027:v1';
export const CODES=['V-970','V-971'];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function prepareSettings(current,reference){
 assert.equal(current.mode,'OFF','Blackcrown must remain OFF');const next=readBlackcrownPackSettings(current),source=readBloodmoonPackSettings(reference);
 assert.equal(next.normalRankRatesPpm.SSS,source.normalRankRatesPpm.SSS,'SSS gate changed; review actual single-draw odds');
 const rate=source.cardRatesPpm['V-974'];assert(Number.isFinite(rate)&&rate>0,'General Jok odds must be configured');
 let normal=limitedRateUnits(next.normalSssRatePpm);assert.notEqual(normal,null);
 for(const code of CODES){assert.equal(next.cardRatesPpm[code],0,'New slot already configured; inspect before changing');next.cardRatesPpm[code]=rate;next.stockLimits[code]=5;normal-=limitedRateUnits(rate);}
 assert(normal>=0);next.normalSssRatePpm=normal/LIMITED_RATE_SCALE;validateBlackcrownPack(next);
 const effective=blackcrownEffectivePercent(source.normalRankRatesPpm.SSS,rate);for(const code of CODES)assert.equal(blackcrownEffectivePercent(next.normalRankRatesPpm.SSS,next.cardRatesPpm[code]),effective);
 return {settings:next,conditionalRatePpm:rate,effectiveSinglePercent:effective};
}
export async function inspect(db){
 const keys=[BLACKCROWN_PACK_KEY,BLOODMOON_PACK_KEY,'mercenary_level_policy_v1','mercenary_blackcrown_stock_schedule_v1','mercenary_stock_schedule_v1'];
 const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).rows;
 const black=rows.find(r=>r.key===BLACKCROWN_PACK_KEY),reference=rows.find(r=>r.key===BLOODMOON_PACK_KEY);assert(black&&reference);
 const stock=(await db.query('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code')).rows;
 const owned=(await db.query('SELECT * FROM user_mercenary_cards_v1 WHERE mercenary_code=ANY($1::text[]) ORDER BY user_id,mercenary_code',[CODES])).rows;
 const issues=(await db.query('SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) ORDER BY code,serial',[CODES])).rows;
 return {pack:JSON.parse(black.value),reference:JSON.parse(reference.value),packHash:hash(black.value),referenceHash:hash(reference.value),preservedSettingsHash:hash(rows.filter(r=>r.key!==BLACKCROWN_PACK_KEY)),otherStockHash:hash(stock.filter(r=>!CODES.includes(r.code))),stock:stock.filter(r=>CODES.includes(r.code)),ownedHash:hash(owned),owned:owned.map(r=>({code:r.mercenary_code,copies:Number(r.total_copies)})),issuesHash:hash(issues),issueCount:issues.length};
}
export async function apply(db,{expectedPackHash,expectedReferenceHash,dryRun=false,failAfterWrite=false}={}){
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(prior)return {status:'ALREADY_APPLIED',replayed:true,receipt:JSON.parse(prior.value)};
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='20s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const raced=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(raced){await db.query('ROLLBACK');return {status:'ALREADY_APPLIED',replayed:true,receipt:JSON.parse(raced.value)};}
  await db.query('SELECT value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[BLACKCROWN_PACK_KEY,BLOODMOON_PACK_KEY]]);
  const before=await inspect(db);assert.equal(before.packHash,expectedPackHash,'Blackcrown settings changed');assert.equal(before.referenceHash,expectedReferenceHash,'General Jok reference changed');
  assert.equal(before.stock.length,0,'Existing stock must not be reset');assert.equal(before.issueCount,0,'Existing issues must be preserved');
  assert.equal((await db.query('SELECT role FROM users WHERE id=1')).rows[0]?.role,'OWNER');
  const prepared=prepareSettings(before.pack.settings,before.reference.settings),now=new Date().toISOString(),pack={...before.pack,revision:before.pack.revision+1,settings:prepared.settings,updatedAt:now,updatedBy:1};
  for(const code of CODES)await db.query('INSERT INTO mercenary_limited_stock_v1(code,stock_limit,issued) VALUES($1,5,0)',[code]);
  await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(pack),BLACKCROWN_PACK_KEY]);if(failAfterWrite)throw Error('BLACKCROWN_SSS_INJECTED_FAILURE');
  const after=await inspect(db);for(const key of ['referenceHash','preservedSettingsHash','otherStockHash','ownedHash','issuesHash'])assert.equal(after[key],before[key],key);
  assert(after.stock.length===2&&after.stock.every(r=>Number(r.stock_limit)===5&&Number(r.issued)===0));
  const receipt={operationKey:OP,status:'COMPLETED',createdAt:now,authorization:'카드구랑 레반 한도 5장씩 블랙크라운 준비 / 둘 다 제너럴 족과 같은 확률',beforeRevision:before.pack.revision,afterRevision:pack.revision,mode:'OFF',codes:CODES,limitEach:5,issuedEach:0,remainingEach:5,conditionalRatePpm:prepared.conditionalRatePpm,effectiveSinglePercent:prepared.effectiveSinglePercent,reference:{key:BLOODMOON_PACK_KEY,code:'V-974',revision:before.reference.revision,sha256:before.referenceHash},directGrantExempt:true,accountWrites:0,grants:0,schedules:0};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_BLACKCROWN_SSS_PREPARE','SETTING',BLACKCROWN_PACK_KEY,JSON.stringify(before),JSON.stringify(receipt)])).rows[0];receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);await db.query(dryRun?'ROLLBACK':'COMMIT');
  return {status:dryRun?'DRY_RUN_PASSED':'APPLIED',replayed:false,receipt,before,after};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
