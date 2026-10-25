import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hash,CMS_KEY,SETTINGS} from './pet-heukgu-registration-20261025.mjs';
export {hash,CMS_KEY,SETTINGS};
export const OP='ops:pet-heukgu-large-head:20261025:v1';
export const ACTION='OPS_PET_HEUKGU_LARGE_HEAD';
export const REQUEST_ID='pet-heukgu-large-head-20261025-v1';
export const approval=JSON.parse(readFileSync(new URL('../../docs/qa/pet-heukgu-large-head-20261025/approval-20261025.json',import.meta.url)));
export const ASSET=approval.assets[0].approvedAsset;
const OLD=approval.previousApprovedAsset,CODE='PET-HEUKGU';
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const query=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const retainedDocument=document=>({...document,pets:document.pets.map(p=>{if(p.code!==CODE)return p;const {sourceArt,battleSprite,...retained}=p;return retained;})});
export async function inspect(db){
 const rows=await query(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[CMS_KEY,OP,...SETTINGS]]);
 const raw=one(rows.filter(r=>r.key===CMS_KEY)).value;
 return {raw,state:JSON.parse(raw),settings:rows.filter(r=>SETTINGS.includes(r.key)),receipt:rows.find(r=>r.key===OP)?JSON.parse(rows.find(r=>r.key===OP).value):null};
}
export function planUpdate(state,validateDocument){
 assert(Number.isSafeInteger(state.revision)&&state.revision>=1&&state.revision<2147483646);
 const beforePet=one(state.document.pets.filter(p=>p.code===CODE));
 assert.equal(beforePet.sourceArt,OLD,'Heukgu source changed; review again');
 assert(['',OLD].includes(beforePet.battleSprite),'Custom battle sprite changed; review again');
 const afterPet={...beforePet,sourceArt:ASSET,battleSprite:beforePet.battleSprite?ASSET:''};
 const document={...state.document,pets:state.document.pets.map(p=>p.code===CODE?afterPet:p)};
 assert.deepEqual(validateDocument(document),document);
 assert.deepEqual(retainedDocument(document),retainedDocument(state.document));
 return {document,beforePet,afterPet};
}
export async function verifyUpdate(db,receipt,{exact=false}={}){
 assert.equal(receipt.operationKey,OP);assert.equal(receipt.afterPet.sourceArt,ASSET);
 const current=await inspect(db);assert.deepEqual(current.receipt,receipt);
 const pet=one(current.state.document.pets.filter(p=>p.code===CODE));
 assert.equal(pet.sourceArt,ASSET);
 if(exact){
  assert.equal(current.state.revision,receipt.revision);assert.deepEqual(pet,receipt.afterPet);
  assert.equal(hash(current.state.document),receipt.afterDocumentHash);
  assert.equal(hash(retainedDocument(current.state.document)),receipt.preservedDocumentHash);
  assert.equal(hash(current.settings),receipt.settingsHash);
  assert.equal(current.state.audit.filter(a=>a.requestId===REQUEST_ID).length,1);
 }
 const audit=one(await query(db,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));
 assert.equal(String(audit.id),receipt.auditId);
 const recorded=typeof audit.after_data==='string'?JSON.parse(audit.after_data):audit.after_data;
 const {auditId,...withoutId}=receipt;assert.deepEqual(recorded,withoutId);
 return {verified:true,revision:current.state.revision,petCount:current.state.document.pets.length,pet,auditId:String(audit.id)};
}
// Only the reviewed art paths change. All live effects, reward bonuses, ownership,
// loadouts, magnet potentials, opening pools and other pet rows remain untouched.
export async function updateHeukgu(db,{expectedRevision,expectedRawHash,commit=false,validateDocument}={}){
 assert(Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'Reviewed revision required');
 assert(/^[a-f0-9]{64}$/.test(expectedRawHash||''),'Reviewed CMS hash required');
 validateDocument??=(await import('../../shared/pet-cms-v1.mjs')).validatePetCmsDocument;
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL statement_timeout='15s'");await db.query("SET LOCAL lock_timeout='5s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const prior=await query(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
  if(prior.length){const receipt=JSON.parse(one(prior).value),verification=await verifyUpdate(db,receipt);await db.query('ROLLBACK');return {replayed:true,committed:true,receipt,verification};}
  await query(db,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[CMS_KEY]);
  const before=await inspect(db);
  assert.equal(before.state.revision,expectedRevision,'CMS revision changed; review again');
  assert.equal(hash(before.raw),expectedRawHash,'CMS content changed; review again');
  const plan=planUpdate(before.state,validateDocument);
  const owner=one(await query(db,"SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' ORDER BY id LIMIT 1"));
  const now=new Date().toISOString(),revision=before.state.revision+1,payloadHash=hash(JSON.stringify([String(owner.id),before.state.revision,plan.document]));
  const next={...before.state,document:plan.document,revision,updatedAt:now,updatedBy:owner.id,audit:[{requestId:REQUEST_ID,payloadHash,actorId:owner.id,revision,createdAt:now},...(before.state.audit||[])].slice(0,50)};
  const changed=await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(next),CMS_KEY,before.raw]);
  assert.equal(changed.rowCount??changed.affectedRows,1,'CMS compare-and-swap failed');
  const receipt={operationKey:OP,previousRevision:before.state.revision,revision,beforePet:plan.beforePet,afterPet:plan.afterPet,assetSha256:approval.assets[0].sha256,
   beforeRawHash:hash(before.raw),afterDocumentHash:hash(plan.document),preservedDocumentHash:hash(retainedDocument(before.state.document)),settingsHash:hash(before.settings),
   completedAt:now,petCount:plan.document.pets.length,accountGrants:0,effectSettingsChanged:false,openingPoolChanged:false,potentialSettingsChanged:false};
  const audit=one(await query(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text',[owner.id,ACTION,'PET_CMS',OP,JSON.stringify(before.state),JSON.stringify(receipt)]));
  receipt.auditId=String(audit.id);
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OP,JSON.stringify(receipt)]);
  const verification=await verifyUpdate(db,receipt,{exact:true});
  await db.query(commit?'COMMIT':'ROLLBACK');return {replayed:false,committed:commit,receipt,verification};
 }catch(error){await db.query('ROLLBACK');throw error;}
}
