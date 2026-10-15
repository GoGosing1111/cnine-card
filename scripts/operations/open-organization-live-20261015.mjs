// Explicit one-time operation approved by the user on 2026-10-15.
// This module never opens a database connection, reads credentials or runs on import.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installOrganizationSchema} from '../../functions/_organization_schema.js';
import {installOrganizationFactionSchema} from '../../functions/_organization_faction.js';
import {ORGANIZATION_RECRUITMENT_MS,ORGANIZATION_RELEASE_ENABLED} from '../../shared/organization-system-v1.mjs';
import {validateOrganizationFactionPolicy} from '../../shared/organization-faction-v1.mjs';

export const ORGANIZATION_OPENING_RECEIPT_KEY='organization_live_opening_20261015';
export const RECEIPT_KEY=ORGANIZATION_OPENING_RECEIPT_KEY;
const fail=(condition,code,message)=>{
 if(!condition)throw Object.assign(Error(message),{code:'ORG_OPENING_'+code});
};
const decode=value=>typeof value==='string'?JSON.parse(value):value;
const checkDB=DB=>fail(DB?.dialect==='postgres'&&DB.client?.query&&DB.enqueue&&DB.execSchema,'DATABASE','Pass an existing PostgreSQL D1-compatible DB; this operation does not create connections.');

// Explicit additive preparation only. Existing installers use CREATE IF NOT
// EXISTS / ADD COLUMN IF NOT EXISTS and preserve existing policy rows.
// Installation is separate from opening: calling this never starts a deadline.
export async function installOrganizationOpeningSchema(DB){
 checkDB(DB);
 await installOrganizationSchema(DB);
 await installOrganizationFactionSchema(DB);
 return {installed:true,opened:false};
}

function verifyReceipt(receipt,round){
 fail(receipt?.operation===RECEIPT_KEY&&receipt.version===1,'RECEIPT','The existing opening receipt is not recognized; do not recreate a round.');
 fail(round&&round.id===receipt.roundId&&round.scope==='LIVE','RECEIPT','The receipted LIVE round is missing or different; do not recreate it.');
 fail(Number.isSafeInteger(receipt.openedAt)&&Number.isSafeInteger(receipt.closesAt)&&receipt.closesAt-receipt.openedAt===ORGANIZATION_RECRUITMENT_MS,'RECEIPT','The receipted opening deadline is invalid.');
 fail(Number(round.opened_at)===receipt.openedAt&&Number(round.closes_at)===receipt.closesAt,'RECEIPT','The LIVE deadline has changed since opening; do not extend or overwrite it.');
}

// Default is a full transaction rehearsal followed by ROLLBACK. The caller must
// explicitly pass dryRun:false to persist. No player, clan or membership writes.
export async function openOrganizationLive(DB,{ownerId,now=Date.now(),dryRun=true,name='조직 입단 1차 모집'}={}){
 checkDB(DB);
 fail(ORGANIZATION_RELEASE_ENABLED,'RELEASE','Organization release must already be approved in runtime code.');
 fail(Number.isSafeInteger(ownerId)&&ownerId>0,'OWNER','Specify the active OWNER account id.');
 fail(Number.isSafeInteger(now)&&now>0&&Number.isSafeInteger(now+ORGANIZATION_RECRUITMENT_MS),'TIME','Specify a valid opening timestamp in milliseconds.');
 fail(typeof dryRun==='boolean','INPUT','dryRun must be a boolean.');
 fail(typeof name==='string'&&name.trim().length>0&&name.length<=60,'INPUT','Specify a round name of 1–60 characters.');
 return DB.enqueue(async()=>{
  const q=async(text,values=[]) => (await DB.client.query({text,values})).rows;
  await q('BEGIN');
  try{
   await q("SET LOCAL lock_timeout='3s'");
   await q("SET LOCAL statement_timeout='10s'");
   const [owner]=await q('SELECT id,role,status,banned_until FROM users WHERE id=$1 FOR SHARE',[ownerId]);
   fail(owner?.role==='OWNER'&&owner.status==='ACTIVE'&&(!owner.banned_until||Date.parse(owner.banned_until)<=now),'OWNER','The selected account must be an active, unbanned OWNER.');
   // Every ordinary create command locks this singleton too, so this also
   // serializes an absent LIVE row and a not-yet-created operations receipt.
   const [organizationPolicy]=await q('SELECT id FROM organization_policy_v1 WHERE id=1 FOR UPDATE');
   fail(organizationPolicy,'SCHEMA','Install the organization schema explicitly before opening.');
   const [factionRow]=await q('SELECT * FROM organization_faction_policy_v1 WHERE id=1 FOR UPDATE');
   fail(factionRow,'SCHEMA','Install the organization faction schema explicitly before opening.');
   const [round]=await q("SELECT * FROM organization_rounds_v1 WHERE scope='LIVE' FOR UPDATE");
   const [stored]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[RECEIPT_KEY]);
   if(stored){
    const receipt=decode(stored.value);verifyReceipt(receipt,round);
    // Legitimate CMS edits after opening are never reverted during a retry.
    const factionPolicy=validateOrganizationFactionPolicy({...decode(factionRow.policy_json),revision:Number(factionRow.revision)});
    await q('ROLLBACK');
    return {dryRun,replayed:true,receipt,round,factionPolicy};
   }
   fail(!round,'EXISTING_ROUND','A LIVE round exists without this opening receipt; refuse to modify or restart it.');
   const before=validateOrganizationFactionPolicy({...decode(factionRow.policy_json),revision:Number(factionRow.revision)});
   fail(before.fundsPerRegion===null&&before.upgradeCosts.every((cost,index)=>cost===(index===0?0:null)),'ECONOMY_CONFIGURED','Organization income or upgrade costs are already configured; refuse to overwrite them.');
   const after={...before,mode:'ON',revision:before.revision+(before.mode==='ON'?0:1)};
   fail(after.revision<=2147483647,'REVISION','The faction policy revision cannot be incremented.');
   const id=randomUUID(),closesAt=now+ORGANIZATION_RECRUITMENT_MS;
   const [opened]=await q("INSERT INTO organization_rounds_v1(id,scope,name,phase,revision,created_at,opened_at,closes_at,auto_assign,assignment_status) VALUES($1,'LIVE',$2,'SURVEY',1,$3,$3,$4,1,'WAITING') RETURNING *",[id,name.trim(),now,closesAt]);
   if(before.mode!=='ON')await q('UPDATE organization_faction_policy_v1 SET revision=$1,policy_json=$2 WHERE id=1',[after.revision,JSON.stringify(after)]);
   const receipt={version:1,operation:RECEIPT_KEY,authorization:'USER_EXPLICIT_ORGANIZATION_ADMISSION_24H_20261015',ownerId,roundId:id,roundName:name.trim(),openedAt:now,closesAt,openedAtISO:new Date(now).toISOString(),closesAtISO:new Date(closesAt).toISOString(),durationMs:ORGANIZATION_RECRUITMENT_MS,autoAssign:true,phaseAtOpening:'SURVEY',factionPolicy:{before,after},applicantWrites:0,membershipWrites:0,clanWrites:0,playerCurrencyWrites:0};
   const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ORGANIZATION_LIVE_OPEN','ORGANIZATION_ROUND',$2,$3,$4) RETURNING id",[ownerId,id,JSON.stringify({liveRound:null,factionPolicy:before}),JSON.stringify(receipt)]);
   assert.ok(audit?.id,'Opening audit record was not created');receipt.auditId=String(audit.id);
   await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[RECEIPT_KEY,JSON.stringify(receipt)]);
   await q(dryRun?'ROLLBACK':'COMMIT');
   return {dryRun,replayed:false,receipt,round:opened,factionPolicy:after};
  }catch(error){
   try{await q('ROLLBACK');}catch{}
   throw error;
  }
 });
}
