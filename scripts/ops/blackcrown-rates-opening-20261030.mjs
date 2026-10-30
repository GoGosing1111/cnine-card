import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BLACKCROWN_PACK_KEY,readBlackcrownPackSettings,validateBlackcrownPack,blackcrownEffectivePercent} from '../../shared/mercenary-blackcrown-pack-v1.mjs';
import {BLACKCROWN_CODES} from '../../shared/mercenary-blackcrown-catalog-v1.mjs';
import {BLACKCROWN_SSS_CARDS} from '../../shared/mercenary-blackcrown-pool-v3.mjs';
import {BLOODMOON_PACK_KEY,readBloodmoonPackSettings} from '../../shared/mercenary-bloodmoon-pack-v1.mjs';
import {BLOODMOON_CODES} from '../../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {limitedRateUnits,LIMITED_RATE_TOTAL,LIMITED_RATE_SCALE} from '../../shared/mercenary-limited-rates-v1.mjs';
export const OP='ops:blackcrown-rates-opening:20261030:v1';
export const OPENS_AT='2026-10-30T15:00:00.000Z';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function prepareSettings(current,reference){
 const next=readBlackcrownPackSettings(current),source=readBloodmoonPackSettings(reference);
 assert.equal(next.mode,'OFF','Opening must remain closed until the scheduled time');
 const rates=BLOODMOON_CODES.map(code=>source.cardRatesPpm[code]);
 assert.equal(new Set(rates).size,1,'Bloodmoon SS rates differ; map each card explicitly');assert(rates[0]>0);
 next.normalRankRatesPpm=structuredClone(source.normalRankRatesPpm);next.missRatePpm=source.missRatePpm;
 for(const code of BLACKCROWN_CODES)next.cardRatesPpm[code]=rates[0];
 assert(source.cardRatesPpm['V-974']>0);for(const card of BLACKCROWN_SSS_CARDS)next.cardRatesPpm[card.code]=source.cardRatesPpm['V-974'];
 next.cardRatesPpm['V-058']=source.cardRatesPpm['V-058'];
 // Different exclusive rosters: all unused probability goes to ordinary SSS.
 next.normalSssRatePpm=(LIMITED_RATE_TOTAL-Object.values(next.cardRatesPpm).reduce((s,r)=>s+limitedRateUnits(r),0))/LIMITED_RATE_SCALE;
 validateBlackcrownPack(next);assert.equal(Object.values(next.normalRankRatesPpm).reduce((s,r)=>s+limitedRateUnits(r),limitedRateUnits(next.missRatePpm)),LIMITED_RATE_TOTAL);
 return {settings:next,ssPercent:blackcrownEffectivePercent(next.normalRankRatesPpm.SSS,rates[0]),sssPercent:blackcrownEffectivePercent(next.normalRankRatesPpm.SSS,source.cardRatesPpm['V-974']),razakPercent:blackcrownEffectivePercent(next.normalRankRatesPpm.SSS,source.cardRatesPpm['V-058'])};
}
export async function inspect(db){
 const keys=[BLACKCROWN_PACK_KEY,BLOODMOON_PACK_KEY,'mercenary_blackcrown_stock_schedule_v1'];
 const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys])).rows;
 const pack=rows.find(r=>r.key===BLACKCROWN_PACK_KEY),reference=rows.find(r=>r.key===BLOODMOON_PACK_KEY);assert(pack&&reference);
 const codes=[...BLACKCROWN_CODES,...BLACKCROWN_SSS_CARDS.map(c=>c.code)];
 const stock=(await db.query('SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[codes])).rows;
 return {pack:JSON.parse(pack.value),reference:JSON.parse(reference.value),packHash:hash(pack.value),referenceHash:hash(reference.value),preservedSettingsHash:hash(rows.filter(r=>r.key!==BLACKCROWN_PACK_KEY)),stock,stockHash:hash(stock)};
}
export async function apply(db,{expectedPackHash,expectedReferenceHash,dryRun=false,failAfterWrite=false}={}){
 const prior=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(prior)return {status:'ALREADY_APPLIED',replayed:true,receipt:JSON.parse(prior.value)};
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='20s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const raced=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];if(raced){await db.query('ROLLBACK');return {status:'ALREADY_APPLIED',replayed:true,receipt:JSON.parse(raced.value)};}
  await db.query('SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[BLACKCROWN_PACK_KEY,BLOODMOON_PACK_KEY]]);
  const before=await inspect(db);assert.equal(before.packHash,expectedPackHash);assert.equal(before.referenceHash,expectedReferenceHash);assert(!before.pack.openingSchedule,'Existing opening schedule must be reviewed');
  const now=new Date((await db.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now).toISOString();assert(now<OPENS_AT,'Scheduled opening time has passed');
  assert.equal((await db.query('SELECT role FROM users WHERE id=1')).rows[0]?.role,'OWNER');
  const prepared=prepareSettings(before.pack.settings,before.reference.settings),next={...before.pack,revision:before.pack.revision+1,settings:prepared.settings,updatedAt:now,updatedBy:1,openingSchedule:{status:'SCHEDULED',opensAt:OPENS_AT,createdAt:now,operationKey:OP}};
  const updated=await db.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(next),BLACKCROWN_PACK_KEY]);assert.equal(updated.rowCount??updated.affectedRows,1);
  if(failAfterWrite)throw Error('BLACKCROWN_OPENING_INJECTED_FAILURE');
  const after=await inspect(db);for(const k of ['referenceHash','preservedSettingsHash','stockHash'])assert.equal(after[k],before[k],k);
  const receipt={operationKey:OP,status:'COMPLETED',createdAt:now,opensAt:OPENS_AT,opensAtKst:'2026-10-31 00:00:00 KST',beforeRevision:before.pack.revision,afterRevision:next.revision,ssPercent:prepared.ssPercent,sssPercent:prepared.sssPercent,razakPercent:prepared.razakPercent,ownershipReduction:'PRESERVED',referenceRevision:before.reference.revision,referenceHash:before.referenceHash,accountWrites:0,stockWrites:0,messages:0,authorization:'블랙크라운 기본 확률은 블러드문·SSS 리미티드는 제너럴 족 기준. 보유 종류별 보정 유지. 31일 0시 0분 개방. 블랙크라운만 100조 10초 연출.'};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',['MERCENARY_BLACKCROWN_OPENING_SCHEDULE','SETTING',BLACKCROWN_PACK_KEY,JSON.stringify(before.pack),JSON.stringify({...receipt,pack:next})])).rows[0];receipt.adminLogId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);await db.query(dryRun?'ROLLBACK':'COMMIT');return {status:dryRun?'DRY_RUN_PASSED':'APPLIED',receipt,before,after};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
