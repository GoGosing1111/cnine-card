import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const OP='ops:pet-heukgu-registration:20261025:v1';
export const CMS_KEY='pet_cms_preparation_v1';
export const ACTION='OPS_PET_HEUKGU_REGISTRATION';
export const SETTINGS=['pet_opening_settings_v1','pet_potential_settings_v1'];
export const REQUEST_ID='pet-heukgu-registration-20261025-v1';
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const approval=JSON.parse(readFileSync(new URL('../../docs/qa/pet-heukgu-live-20261025/approval-20261025.json',import.meta.url),'utf8'));
const codes=['PET-HEUKGU'];
export const additions=approval.assets.map(art=>({
  code:art.code,name:art.name,sourceArt:art.approvedAsset,battleSprite:'',
  enabled:false,liveEnabled:false,modes:['PVE','PVP'],target:'ALL_ALLIES',
  buffs:[{type:'ATTACK_PERCENT',percent:null}],
  notes:'2026-10-25 사용자 승인 및 라이브 반영 요청. 흑구 이름·정지 전신 원화 등록. 버프 수치·획득 경로·실전 효과 미설정.'
}));
assert.deepEqual(additions.map(p=>p.code),codes);
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const query=async(db,sql,args=[])=>(await db.query(sql,args)).rows;

export function planRegistration(state,validateDocument){
  assert.equal(typeof validateDocument,'function','Current CMS validator required');
  assert(Number.isSafeInteger(state.revision)&&state.revision>=1&&state.revision<2147483646);
  assert(!state.document.pets.some(p=>codes.includes(p.code)),'Heukgu entry already exists; inspect rather than overwrite');
  const document={...state.document,pets:[...state.document.pets,...structuredClone(additions)]};
  assert.deepEqual(validateDocument(document),document,'CMS schema validation must preserve exact document');
  assert.deepEqual(document.pets.slice(0,-additions.length),state.document.pets);
  return {document,expectedRevision:state.revision,requestId:REQUEST_ID};
}

export async function inspect(db){
  const rows=await query(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[CMS_KEY,OP,...SETTINGS]]);
  const raw=one(rows.filter(row=>row.key===CMS_KEY)).value;
  return {raw,state:JSON.parse(raw),settings:rows.filter(row=>SETTINGS.includes(row.key)),receipt:rows.find(row=>row.key===OP)?JSON.parse(rows.find(row=>row.key===OP).value):null};
}

export async function verifyRegistration(db,receipt,{exact=false}={}){
  assert.equal(receipt.operationKey,OP);
  assert.deepEqual(receipt.addedPets,additions);
  const current=await inspect(db);
  assert.deepEqual(current.receipt,receipt);
  assert.equal(current.state.document.pets.filter(p=>codes.includes(p.code)).length,additions.length);
  for(const added of additions){
    const stored=one(current.state.document.pets.filter(p=>p.code===added.code));
    if(exact)assert.deepEqual(stored,added);
  }
  if(exact){
    assert.equal(current.state.revision,receipt.revision);
    assert.equal(hash(current.state.document),receipt.afterDocumentHash);
    assert.equal(hash(current.state.document.pets.filter(p=>!codes.includes(p.code))),receipt.preservedPetsHash);
    assert.equal(hash(current.settings),receipt.settingsHash);
    assert.equal(current.state.audit.filter(a=>a.requestId===REQUEST_ID).length,1);
  }
  const audits=await query(db,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]);
  const audit=one(audits);assert.equal(String(audit.id),String(receipt.auditId));
  const recorded=typeof audit.after_data==='string'?JSON.parse(audit.after_data):audit.after_data;
  const {auditId,...withoutId}=receipt;assert.deepEqual(recorded,withoutId);
  return {verified:true,revision:current.state.revision,petCount:current.state.document.pets.length,registeredCodes:codes,auditId:String(audit.id)};
}

// The only writes are the CMS row, its audit log, and a one-time receipt.
// Defaults to rollback. Existing definitions, account state and opening pools are preserved.
export async function registerHeukgu(db,{expectedRevision,expectedRawHash,commit=false,validateDocument}={}){
  assert(Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'Reviewed revision required');
  assert(/^[a-f0-9]{64}$/.test(expectedRawHash||''),'Reviewed CMS hash required');
  validateDocument??=(await import('../../shared/pet-cms-v1.mjs')).validatePetCmsDocument;
  await db.query('BEGIN');
  try{
    await db.query("SET LOCAL statement_timeout='15s'");
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
    const prior=await query(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
    if(prior.length){
      const receipt=JSON.parse(one(prior).value),verification=await verifyRegistration(db,receipt);
      await db.query('ROLLBACK');return {replayed:true,committed:true,receipt,verification};
    }
    await query(db,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[CMS_KEY]);
    const before=await inspect(db);
    assert.equal(before.state.revision,expectedRevision,'CMS revision changed; review again');
    assert.equal(hash(before.raw),expectedRawHash,'CMS content changed; review again');
    const plan=planRegistration(before.state,validateDocument);
    const owner=one(await query(db,"SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' ORDER BY id LIMIT 1"));
    const now=new Date().toISOString(),revision=before.state.revision+1;
    const payloadHash=hash(JSON.stringify([String(owner.id),before.state.revision,plan.document]));
    const next={...before.state,document:plan.document,revision,updatedAt:now,updatedBy:owner.id,
      audit:[{requestId:REQUEST_ID,payloadHash,actorId:owner.id,revision,createdAt:now},...(before.state.audit||[])].slice(0,50)};
    const changed=await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(next),CMS_KEY,before.raw]);
    assert.equal(changed.rowCount??changed.affectedRows,1,'CMS compare-and-swap failed');
    const receipt={operationKey:OP,previousRevision:before.state.revision,revision,addedPets:structuredClone(additions),
      preservedRows:before.state.document.pets.length,preservedPetsHash:hash(before.state.document.pets),
      beforeRawHash:hash(before.raw),afterDocumentHash:hash(plan.document),settingsHash:hash(before.settings),
      completedAt:now,accountGrants:0,openingPoolChanged:false,potentialSettingsChanged:false,liveEffectsEnabled:false};
    const audit=one(await query(db,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text',
      [owner.id,ACTION,'PET_CMS',OP,JSON.stringify(before.state),JSON.stringify(receipt)]));
    receipt.auditId=String(audit.id);
    await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OP,JSON.stringify(receipt)]);
    const verification=await verifyRegistration(db,receipt,{exact:true});
    await db.query(commit?'COMMIT':'ROLLBACK');
    return {replayed:false,committed:commit,receipt,verification};
  }catch(error){await db.query('ROLLBACK');throw error;}
}
