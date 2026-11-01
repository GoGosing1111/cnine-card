import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRankedProductDraft,validateRankedShopPolicy} from '../../shared/ranked-shop-policy-v1.mjs';
import {validatePetCmsDocument} from '../../shared/pet-cms-v1.mjs';
export const OP='ops:pepegu-ranked-rental:20261101:v1',CMS='pet_cms_preparation_v1',SHOP='ranked_shop_policy_v1',REQUEST_ID='pepegu-ranked-rental-20261101-v1';
export const KEYS=[CMS,SHOP,'pet_opening_settings_v1','pet_potential_settings_v1',OP];
export const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export function planPepeguRental(cms,shop){
 const heukgu=cms.document.pets.find(p=>p.code==='PET-HEUKGU'),original=cms.document.pets.find(p=>p.code==='PET-PEPEGU');
 assert(heukgu&&original);assert(!shop.products.some(p=>p.id==='pepegu_30days'||p.type==='PET_RENTAL'&&p.petCode==='PET-PEPEGU'));
 assert(heukgu.buffs.every(b=>Number.isFinite(b.percent)));assert(heukgu.rewardBonuses);
 const pet={...original,modes:[...heukgu.modes],target:heukgu.target,buffs:heukgu.buffs.map(b=>({...b,percent:b.percent+5})),rewardBonuses:Object.fromEntries(Object.entries(heukgu.rewardBonuses).map(([k,v])=>[k,v+5])),liveEnabled:true,notes:'2026-11-01 사용자 승인: 랭크전 코인 1500개 · 구매 즉시 30일 · 흑구보다 각 효과 +5%p. 기간제 이용 종료 후 효과 중단.'};
 const document={...cms.document,pets:cms.document.pets.map(p=>p.code===pet.code?pet:p)};assert.deepEqual(validatePetCmsDocument(document),document);
 const product={...createRankedProductDraft('PET_RENTAL','pepegu_30days'),name:'페페구 (30일)',enabled:true,visible:true,price:1500,accountLimit:null,petCode:pet.code,durationDays:30,image:pet.sourceArt,badge:'30일 기간제',sortOrder:Math.min(10000,Math.max(...shop.products.map(p=>p.sortOrder),0)+1),description:'공격력 +55% · 드랍률 +25% · 계정 경험치 +55% · 코인 +55%. 구매 즉시 30일 이용하며, 재구매하면 남은 기간에 30일씩 추가됩니다. 펫 도감에서 장착할 수 있습니다.'};
 assert.deepEqual(pet.buffs,[{type:'ATTACK_PERCENT',percent:55}]);assert.deepEqual(pet.rewardBonuses,{dropPercent:25,accountXpPercent:55,coinPercent:55});
 const policy=validateRankedShopPolicy({...shop,revision:shop.revision+1,products:[...shop.products,product]});assert.deepEqual(policy.products.slice(0,-1),shop.products);
 return {document,policy,pet,product,heukgu};
}
export async function inspect(db){const rows=(await db.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[KEYS])).rows;return Object.fromEntries(rows.map(r=>[r.key,{raw:r.value,state:JSON.parse(r.value)}]));}
export async function applyPepeguRental(db,reviewed,{commit=false}={}){
 await db.query('BEGIN');try{
  await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='20s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OP]);
  const existing=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
  if(existing){const receipt=JSON.parse(existing.value);assert.equal(receipt.operationKey,OP);await db.query('ROLLBACK');return {replayed:true,committed:true,receipt};}
  await db.query('SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[CMS,SHOP]]);
  const before=await inspect(db);for(const key of KEYS.filter(k=>k!==OP))assert.equal(hash(before[key]?.raw??null),hash(reviewed[key]?.raw??null),'Reviewed state changed: '+key);
  const plan=planPepeguRental(before[CMS].state,before[SHOP].state),owner=(await db.query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(COALESCE(status,'ACTIVE'))='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert(owner);
  const completedAt=new Date().toISOString(),revision=before[CMS].state.revision+1;
  const nextCms={...before[CMS].state,document:plan.document,revision,updatedAt:completedAt,updatedBy:owner.id,audit:[{requestId:REQUEST_ID,payloadHash:hash([String(owner.id),before[CMS].state.revision,plan.document]),actorId:owner.id,revision,createdAt:completedAt},...before[CMS].state.audit].slice(0,50)};
  for(const [key,next]of [[CMS,nextCms],[SHOP,plan.policy]])assert.equal((await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[JSON.stringify(next),key,before[key].raw])).rowCount,1);
  const receipt={operationKey:OP,completedAt,previousCmsRevision:before[CMS].state.revision,cmsRevision:revision,previousShopRevision:before[SHOP].state.revision,shopRevision:plan.policy.revision,pet:plan.pet,product:plan.product,heukguUnchanged:plan.heukgu,preservedPetsHash:hash(before[CMS].state.document.pets.filter(p=>p.code!=='PET-PEPEGU')),preservedProductsHash:hash(before[SHOP].state.products),cmsDocumentHash:hash(plan.document),shopPolicyHash:hash(plan.policy),accountWrites:0,messagesSent:0};
  const audit=(await db.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text',[owner.id,'OPS_PEPEGU_RANKED_RENTAL','PET_SHOP',OP,JSON.stringify({cmsRevision:before[CMS].state.revision,shopRevision:before[SHOP].state.revision}),JSON.stringify(receipt)])).rows[0];receipt.auditId=audit.id;
  await db.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OP,JSON.stringify(receipt)]);
  const after=await inspect(db);assert.equal(hash(after[CMS].state.document),receipt.cmsDocumentHash);assert.equal(hash(after[SHOP].state),receipt.shopPolicyHash);
  for(const key of ['pet_opening_settings_v1','pet_potential_settings_v1'])assert.equal(after[key]?.raw,before[key]?.raw);
  await db.query(commit?'COMMIT':'ROLLBACK');return {replayed:false,committed:commit,receipt};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
