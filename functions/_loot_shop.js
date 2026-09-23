import {LOOT_SHOP_DEFAULTS,validateLootShopPolicy,upgradeLootShopPolicy,PIG_COIN_IMAGE,pigCoinRewardWeek,LOOT_MYSTIC_RARITY,LOOT_MYSTIC_NAME_PREFIX,lootEquipmentMatchesProduct} from '../shared/loot-shop-policy-v1.mjs';
import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {runJointOperation,saveJointPolicyDraft} from './_joint_transactions.js';
import {jointError,readJointBody,jointResponseError} from './_joint_request.js';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {mercenaryRandomInt,mercenaryCardAcquisitionStatements} from './_mercenary_draw_accounting.js';

export const LOOT_SHOP_KEY='loot_shop_policy_v1';
export const LOOT_SHOP_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS pig_coin_wallets_v1(user_id BIGINT PRIMARY KEY,balance BIGINT NOT NULL DEFAULT 0 CHECK(balance>=0 AND balance<=1000000000000))`,
 `CREATE TABLE IF NOT EXISTS pig_coin_ledger_v1(id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,amount BIGINT NOT NULL,balance_after BIGINT NOT NULL,source TEXT NOT NULL,reference_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,source,reference_id))`,
 `CREATE TABLE IF NOT EXISTS loot_shop_purchases_v1(request_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,product_id TEXT NOT NULL,price BIGINT NOT NULL,product_json TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS loot_shop_purchase_user_v1 ON loot_shop_purchases_v1(user_id,product_id)`,
 `CREATE TABLE IF NOT EXISTS loot_shop_packs_v1(id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,product_json TEXT NOT NULL,opened_request_id TEXT UNIQUE,created_at TEXT NOT NULL,opened_at TEXT)`,
 `CREATE INDEX IF NOT EXISTS loot_shop_pack_user_v1 ON loot_shop_packs_v1(user_id,opened_at)`
];
// Explicit CMS configuration prepares storage before publishing any settings.
// Unconfigured HTTP reads never create tables or enable sales/rewards.
export async function ensureLootShopSchema(env){if(env.DB.execSchema)await env.DB.execSchema(LOOT_SHOP_SCHEMA);else for(const sql of LOOT_SHOP_SCHEMA)await env.DB.prepare(sql).run();await ensureJointAtomicSchema(env);}
const fail=(message,status=409)=>jointError('JOINT_LOOT_UNAVAILABLE',message,status);
export async function readLootShopPolicy(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LOOT_SHOP_KEY).first();return {policy:row?validateLootShopPolicy(upgradeLootShopPolicy(JSON.parse(row.value))):structuredClone(LOOT_SHOP_DEFAULTS),raw:row?.value??null};}
export async function pigCoinBalance(env,userId){if((await readLootShopPolicy(env)).raw===null)return 0;return Number((await env.DB.prepare('SELECT balance FROM pig_coin_wallets_v1 WHERE user_id=?').bind(userId).first())?.balance||0);}
const pFor=DB=>(sql,...v)=>DB.prepare(sql).bind(...v);
function guarded(DB,predicate,bindings,body){const token=crypto.randomUUID();return [jointGuard(DB,token,predicate,bindings),...body,jointGuardEnd(DB,token)];}
function policyGuard(DB,raw){return [...(DB.dialect==='postgres'?[DB.prepare('SELECT key FROM app_meta WHERE key=? FOR SHARE').bind(LOOT_SHOP_KEY)]:[]),...guarded(DB,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[LOOT_SHOP_KEY,raw],[])];}
const mysticEquipmentSql=`(rarity='${LOOT_MYSTIC_RARITY}' AND name LIKE '${LOOT_MYSTIC_NAME_PREFIX}%')`;
const choiceGrade=type=>type==='SUPERSTAR_CHOICE'?'SUPERSTAR':'FUR';
async function cardPool(env,product){if(!product.cardIds.length)return [];return (await env.DB.prepare(`SELECT c.id,c.title AS name,c.rarity AS grade,c.image_url AS image,c.limited_total,c.issued_count FROM cards_effective_v1210 c WHERE c.id IN (${product.cardIds.map(()=>'?').join(',')}) AND c.rarity=? AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND (c.limited_total IS NULL OR c.issued_count<c.limited_total)`).bind(...product.cardIds,choiceGrade(product.type)).all()).results;}
async function equipment(env,product){const row=await env.DB.prepare('SELECT id,code,name,rarity,image_url AS image FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1').bind(product.equipmentId).first();if(!row||!lootEquipmentMatchesProduct(row,product.type))throw fail('선택한 장비가 공개 상태 또는 상품 종류와 맞지 않습니다.');return row;}
async function mercenaryPool(env,product){const {document,revision}=await readMercenaryDocument(env);const pool=document.mercenaries.filter(c=>product.mercenaryCodes.includes(c.code)&&['A','S'].includes(c.rank)).map(c=>({code:c.code,name:c.name,rank:c.rank,image:MERCENARY_CMS_SEED.catalog.cards.find(a=>a.code===c.code)?.sourceArt}));for(const rank of ['A','S'])if(product.mercenaryWeights[rank]>0&&!pool.some(c=>c.rank===rank))throw fail(`${rank}등급 용병 후보가 없습니다.`);return {pool,revision};}
async function validateProductCatalog(env,product){if(product.type.endsWith('_CHOICE')){if(!(await cardPool(env,product)).length)throw fail('획득 가능한 선택 카드가 없습니다.');}else if(product.type==='MERCENARY_PACK')await mercenaryPool(env,product);else await equipment(env,product);}
export async function lootShopCatalog(env){
 const [cards,gear]=await Promise.all([env.DB.prepare("SELECT id,title AS name,rarity AS grade,image_url AS image FROM cards_effective_v1210 WHERE rarity IN('SUPERSTAR','FUR') AND is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC' ORDER BY rarity,title").all(),env.DB.prepare(`SELECT id,code,name,rarity,image_url AS image FROM character_equipment_items WHERE is_active=1 AND is_public=1 AND (${mysticEquipmentSql} OR code='BATTLE_SUIT_02') ORDER BY name`).all()]);
 const {document}=await readMercenaryDocument(env);return {cards:cards.results,equipment:gear.results,mercenaries:document.mercenaries.filter(c=>['A','S'].includes(c.rank)).map(c=>({code:c.code,name:c.name,rank:c.rank,image:MERCENARY_CMS_SEED.catalog.cards.find(a=>a.code===c.code)?.sourceArt}))};
}
export async function saveLootShopPolicy(env,user,raw){
 if(user.role!=='OWNER')throw jointError('JOINT_PERMISSION','OWNER만 상점을 설정할 수 있습니다.',403);
 const before=await readLootShopPolicy(env),next=validateLootShopPolicy(raw);if(next.revision!==before.policy.revision)throw jointError('JOINT_POLICY_CONFLICT','설정이 변경됐습니다. 다시 불러오세요.',409);
 for(const product of next.products)if(product.enabled)await validateProductCatalog(env,product);
 // Product identities never change reward kind, and IDs cannot be removed: purchase caps are lifetime.
 for(const prior of before.policy.products){const updated=next.products.find(p=>p.id===prior.id);if(!updated||updated.type!==prior.type)throw fail('기존 상품의 코드·종류는 유지하세요. 판매 중지로 관리할 수 있습니다.');}
 await ensureLootShopSchema(env);next.revision++;return saveJointPolicyDraft(env,user,LOOT_SHOP_KEY,before.raw,next);
}
export async function saveLootSourcePolicy(env,user,body){
 if(user.role!=='OWNER')throw jointError('JOINT_PERMISSION','OWNER만 지급 설정을 변경할 수 있습니다.',403);
 const before=await readLootShopPolicy(env);if(body.revision!==before.policy.revision)throw jointError('JOINT_POLICY_CONFLICT','다른 화면에서 피그 코인 설정이 변경됐습니다. 최신 설정을 다시 불러오세요.',409);
 if(!['TERRITORY','CLAN','CORE_RAID'].includes(body.code))throw jointError('JOINT_LOOT_CONFIG','지급 콘텐츠를 확인하세요.');
 const draft=structuredClone(before.policy);draft.rewardsEnabled=body.rewardsEnabled;draft.sources=draft.sources.map(s=>s.code===body.code?{...body.source,code:s.code}:s);
 const next=validateLootShopPolicy(draft);await ensureLootShopSchema(env);next.revision++;
 await saveJointPolicyDraft(env,user,LOOT_SHOP_KEY,before.raw,next);return {revision:next.revision,rewardsEnabled:next.rewardsEnabled,sources:next.sources};
}
export async function lootShopState(env,user){
 const {policy,raw}=await readLootShopPolicy(env);
 const [balance,purchases,packs]=raw===null?[0,{results:[]},{results:[]}]:await Promise.all([pigCoinBalance(env,user.id),env.DB.prepare('SELECT product_id,COUNT(*) AS count FROM loot_shop_purchases_v1 WHERE user_id=? GROUP BY product_id').bind(user.id).all(),env.DB.prepare('SELECT id,product_json,created_at FROM loot_shop_packs_v1 WHERE user_id=? AND opened_at IS NULL ORDER BY created_at DESC').bind(user.id).all()]);
 const counts=new Map(purchases.results.map(r=>[r.product_id,Number(r.count)]));const products=[];
 for(const product of policy.products){const bought=counts.get(product.id)||0;let image='',available=false,options=[];try{if(product.type.endsWith('_CHOICE')){image=product.type==='SUPERSTAR_CHOICE'?'assets/ui/packs/superstar-card-pack-v1.png':'assets/ui/packs/limited-pack.png';options=await cardPool(env,product);available=options.length>0;}else if(product.type==='MERCENARY_PACK'){image='assets/ui/packs/hyper-pack-v2076.png';if(product.enabled){options=(await mercenaryPool(env,product)).pool;available=options.length>0;}}else if(product.equipmentId){image=(await equipment(env,product)).image;available=true;}}catch{available=false;}
  products.push({...product,image,options,bought,remaining:product.accountLimit===null?null:Math.max(0,product.accountLimit-bought),canBuy:policy.salesEnabled&&product.enabled&&available&&bought<product.accountLimit&&balance>=product.price});
 }
 products.sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
 const territorySetting=await env.DB.prepare("SELECT value FROM app_meta WHERE key='territory_war_settings_v3'").first();let minimum=null;try{const v=JSON.parse(territorySetting?.value||'{}').settlementMinAttacks;if(Number.isSafeInteger(v)&&v>=0)minimum=v;}catch{}
 const sources=policy.sources.map(s=>s.code==='TERRITORY'?{...s,participationMinimumAttacks:minimum}:s);
 return {accountId:Number(user.id),pigCoins:balance,pigCoinImage:PIG_COIN_IMAGE,salesEnabled:policy.salesEnabled,rewardsEnabled:policy.rewardsEnabled,sources,products,ownedPacks:packs.results.map(r=>({id:r.id,product:JSON.parse(r.product_json),createdAt:r.created_at})),revision:policy.revision};
}
function debitPigCoins(DB,userId,price,requestId){const p=pFor(DB);return guarded(DB,'EXISTS(SELECT 1 FROM pig_coin_wallets_v1 WHERE user_id=? AND balance>=?)',[userId,price],[p('UPDATE pig_coin_wallets_v1 SET balance=balance-? WHERE user_id=?',price,userId),p("INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) SELECT ?,user_id,?,balance,'SHOP',?,? FROM pig_coin_wallets_v1 WHERE user_id=?",requestId,-price,requestId,new Date().toISOString(),userId)]);}
function gearGrant(DB,userId,product,requestId){const p=pFor(DB),condition=product.type==='F_BODY'?"code='BATTLE_SUIT_02'":mysticEquipmentSql;return guarded(DB,`EXISTS(SELECT 1 FROM character_equipment_items WHERE id=? AND is_active=1 AND is_public=1 AND ${condition})`,[product.equipmentId],[p("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES(?,?,'LOOT_SHOP',?,?)",userId,product.equipmentId,product.id,requestId)]);}
export async function purchaseLootProduct(env,user,body){
 const {productId,requestId}=body;
 const result=await runJointOperation(env,user,{requestId,kind:'LOOT_PURCHASE',input:{productId},prepare:async()=>{const {policy}=await readLootShopPolicy(env),product=policy.products.find(p=>p.id===productId);if(!policy.salesEnabled||!product?.enabled)throw fail('현재 판매 준비 중인 상품입니다.');await validateProductCatalog(env,product);if(await pigCoinBalance(env,user.id)<product.price)throw fail('피그 코인이 부족합니다.');return {product};},statements:async plan=>{
  const {policy,raw}=await readLootShopPolicy(env),current=policy.products.find(p=>p.id===productId);if(!policy.salesEnabled||!current?.enabled)throw fail('현재 판매가 중지되었습니다.');if(JSON.stringify(current)!==JSON.stringify(plan.product))throw Object.assign(fail('상품 설정이 변경됐습니다. 최신 상품을 다시 선택하세요.'),{terminal:true});
  const DB=env.DB,p=pFor(DB),product=plan.product,now=new Date().toISOString();
  const prior=await p('SELECT COUNT(*) AS count FROM loot_shop_purchases_v1 WHERE user_id=? AND product_id=?',user.id,productId).first();
  if(Number(prior.count)>=product.accountLimit)throw Object.assign(fail('이 상품의 계정 구매 한도를 모두 사용했습니다.'),{terminal:true});
  if(await pigCoinBalance(env,user.id)<product.price)throw Object.assign(fail('피그 코인이 부족합니다.'),{terminal:true});
  return [...policyGuard(DB,raw),...guarded(DB,'(SELECT COUNT(*) FROM loot_shop_purchases_v1 WHERE user_id=? AND product_id=?)<?',[user.id,productId,product.accountLimit],[]),...debitPigCoins(DB,user.id,product.price,requestId),p('INSERT INTO loot_shop_purchases_v1(request_id,user_id,product_id,price,product_json,created_at) VALUES(?,?,?,?,?,?)',requestId,user.id,productId,product.price,JSON.stringify(product),now),...(['F_BODY','MYSTIC_EQUIPMENT'].includes(product.type)?gearGrant(DB,user.id,product,requestId):[p('INSERT INTO loot_shop_packs_v1(id,user_id,product_json,created_at) VALUES(?,?,?,?)',requestId,user.id,JSON.stringify(product),now)])];
 }});return {ok:true,requestId:result.requestId,replayed:result.replayed,product:result.plan.product,state:await lootShopState(env,user)};
}
async function ownedPack(env,user,packId){const pack=await env.DB.prepare('SELECT * FROM loot_shop_packs_v1 WHERE id=? AND user_id=?').bind(packId,user.id).first();if(!pack)throw jointError('JOINT_NOT_FOUND','보유한 팩을 찾을 수 없습니다.',404);return {...pack,product:JSON.parse(pack.product_json)};}
export async function lootPackOptions(env,user,packId){const pack=await ownedPack(env,user,packId);if(pack.opened_at)throw fail('이미 개봉한 팩입니다.');return {packId,product:pack.product,cards:pack.product.type.endsWith('_CHOICE')?await cardPool(env,pack.product):[],mercenaries:pack.product.type==='MERCENARY_PACK'?(await mercenaryPool(env,pack.product)).pool:[]};}
function cardGrant(DB,userId,card,product,requestId){const p=pFor(DB);return guarded(DB,"EXISTS(SELECT 1 FROM cards_effective_v1210 WHERE id=? AND rarity=? AND is_active=1 AND COALESCE(card_status,'PUBLIC')='PUBLIC' AND (limited_total IS NULL OR issued_count<limited_total))",[card.id,choiceGrade(product.type)],[
 p('UPDATE cards SET issued_count=issued_count+1 WHERE id=? AND limited_total IS NOT NULL',card.id),
 p('INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new) SELECT ?,?,?,?,?,0,CASE WHEN EXISTS(SELECT 1 FROM user_cards WHERE user_id=? AND card_id=? AND quantity>0) THEN 0 ELSE 1 END',requestId,userId,product.id,card.id,card.grade,userId,card.id),
 p('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(?,?,1,0) ON CONFLICT(user_id,card_id) DO UPDATE SET breakthrough_level=CASE WHEN user_cards.quantity<=0 THEN 0 ELSE user_cards.breakthrough_level END,quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP',userId,card.id)]);}
export async function openLootPack(env,user,body,{randomInt=mercenaryRandomInt}={}){
 const {packId,requestId}=body,cardId=body.cardId??null;
 const r=await runJointOperation(env,user,{requestId,kind:'LOOT_PACK_OPEN',input:{packId,cardId},prepare:async()=>{
  const pack=await ownedPack(env,user,packId);if(pack.opened_at)throw fail('이미 개봉한 팩입니다.');const product=pack.product;
  if(product.type.endsWith('_CHOICE')){const card=(await cardPool(env,product)).find(c=>String(c.id)===cardId);if(!card)throw fail('획득 가능한 카드를 선택하세요.');return {packId,product,card};}
  if(cardId!==null)throw fail('용병 팩에는 선택 카드 ID를 지정할 수 없습니다.');const {pool,revision}=await mercenaryPool(env,product),weights=product.mercenaryWeights,total=weights.A+weights.S,rank=randomInt(total)<weights.A?'A':'S',rankPool=pool.filter(c=>c.rank===rank),mercenary=rankPool[randomInt(rankPool.length)];return {packId,product,mercenary,cmsRevision:revision};
 },statements:async plan=>{
  const DB=env.DB,p=pFor(DB),writes=[];
  if(plan.mercenary){writes.push(...mercenaryCardAcquisitionStatements(DB,{userId:Number(user.id),mercenaryCode:plan.mercenary.code,acquisitionId:requestId}));}
  else {if(!(await cardPool(env,plan.product)).some(c=>String(c.id)===String(plan.card.id)))throw Object.assign(fail('선택한 카드의 지급이 종료되었습니다. 보관 팩에서 다른 카드를 선택하세요.'),{terminal:true});if(DB.dialect==='postgres')writes.push(p('SELECT id FROM cards WHERE id=? FOR UPDATE',plan.card.id));writes.push(...cardGrant(DB,user.id,plan.card,plan.product,requestId));}
  return guarded(DB,'EXISTS(SELECT 1 FROM loot_shop_packs_v1 WHERE id=? AND user_id=? AND opened_at IS NULL)',[packId,user.id],[...writes,p('UPDATE loot_shop_packs_v1 SET opened_request_id=?,opened_at=? WHERE id=? AND user_id=? AND opened_at IS NULL',requestId,new Date().toISOString(),packId,user.id)]);
 }});return {ok:true,requestId:r.requestId,replayed:r.replayed,reward:r.plan.card||r.plan.mercenary,state:await lootShopState(env,user)};
}

// Compose with the authoritative content's existing settlement transaction.
// Callers supply a fixed internal predicate, never a browser-supplied SQL fragment.
export async function pigCoinRewardStatements(env,{userId,source,referenceId,guardSql,guardBindings=[],rewardSql,at=Date.now()}){
 const {policy,raw}=await readLootShopPolicy(env),rule=policy.sources.find(s=>s.code===source);if(!policy.rewardsEnabled||!rule?.enabled)return [];
 if(!Number.isSafeInteger(Number(userId))||Number(userId)<1||!referenceId||!guardSql)throw fail('피그 코인 보상 근거가 없습니다.');
 if(source!=='CORE_RAID'&&typeof rewardSql!=='function')throw fail('승리·참여 보상 조건이 없습니다.');
 const earned=source==='CORE_RAID'?{sql:'?',bindings:[rule.amount]}:rewardSql(rule);
 const DB=env.DB,p=pFor(DB),ref=String(referenceId),token=crypto.randomUUID(),now=new Date(at).toISOString(),guard=`(${guardSql}) AND NOT EXISTS(SELECT 1 FROM pig_coin_ledger_v1 WHERE user_id=? AND source=? AND reference_id=?)`,bind=[...guardBindings,userId,source,ref];
 const week=pigCoinRewardWeek(at),weeklySql=source==='CORE_RAID'?" AND COALESCE((SELECT SUM(amount) FROM pig_coin_ledger_v1 WHERE user_id=? AND source='CORE_RAID' AND amount>0 AND created_at>=? AND created_at<?),0)+earned<=?":'',weeklyBind=source==='CORE_RAID'?[userId,week.startsAt,week.resetsAt,rule.weeklyLimit]:[];
 // Lock before evaluating both eligibility and the weekly sum. Different room
 // claims cannot exceed the cap, including concurrent requests and next-week replay.
 return [...policyGuard(DB,raw),p(`INSERT INTO pig_coin_wallets_v1(user_id,balance) SELECT ?,0 WHERE ${guard} ON CONFLICT(user_id) DO NOTHING`,userId,...bind),
 ...(DB.dialect==='postgres'?[p('SELECT user_id FROM pig_coin_wallets_v1 WHERE user_id=? FOR UPDATE',userId)]:[]),
 p(`INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) SELECT ?,user_id,earned,balance+earned,?,?,? FROM (SELECT user_id,balance,CAST((${earned.sql}) AS BIGINT) AS earned FROM pig_coin_wallets_v1 WHERE user_id=?) reward WHERE earned>0 AND ${guard}${weeklySql} ON CONFLICT(user_id,source,reference_id) DO NOTHING`,token,source,ref,now,...earned.bindings,userId,...bind,...weeklyBind),
 p('UPDATE pig_coin_wallets_v1 SET balance=balance+(SELECT amount FROM pig_coin_ledger_v1 WHERE id=?) WHERE user_id=? AND EXISTS(SELECT 1 FROM pig_coin_ledger_v1 WHERE id=?)',token,userId,token)];
}
export async function pigCoinRewardAmount(env,userId,source,referenceId){if((await readLootShopPolicy(env)).raw===null)return 0;return Number((await env.DB.prepare('SELECT amount FROM pig_coin_ledger_v1 WHERE user_id=? AND source=? AND reference_id=?').bind(userId,source,String(referenceId)).first())?.amount||0);}
export async function handleLootShop({path,request,env,deps}){
 if(!path.startsWith('loot-shop/')&&!['admin/loot-shop','admin/loot-shop/sources','admin/loot-shop/source'].includes(path))return null;
 try{const user=await deps.authenticate(request,env);if(!user)throw jointError('JOINT_AUTH','로그인이 필요합니다.',401);const admin=path.startsWith('admin/loot-shop');if(admin&&user.role!=='OWNER')throw jointError('JOINT_PERMISSION','OWNER만 상점을 설정할 수 있습니다.',403);
  if(request.method==='GET'){
   if(path==='admin/loot-shop/sources'){const {policy}=await readLootShopPolicy(env);return deps.json({revision:policy.revision,rewardsEnabled:policy.rewardsEnabled,sources:policy.sources});}
   if(path==='admin/loot-shop')return deps.json({policy:(await readLootShopPolicy(env)).policy,catalog:await lootShopCatalog(env)});
   if(path==='loot-shop/balance')return deps.json({accountId:Number(user.id),pigCoins:await pigCoinBalance(env,user.id)});
   if(path==='loot-shop/state')return deps.json(await lootShopState(env,user));
   if(path==='loot-shop/pack')return deps.json(await lootPackOptions(env,user,new URL(request.url).searchParams.get('id')));
  }
  if(request.method!==(admin?'PATCH':'POST'))throw jointError('JOINT_METHOD','지원하지 않는 요청입니다.',405);
  const fields=path==='admin/loot-shop/source'?['code','revision','source','rewardsEnabled']:path==='admin/loot-shop'?['policy']:path==='loot-shop/purchase'?['requestId','productId']:path==='loot-shop/open'?['requestId','packId','cardId']:null;if(!fields)throw jointError('JOINT_NOT_FOUND','상점 경로를 찾을 수 없습니다.',404);
  const body=await readJointBody(request,{fields,maxBytes:131072});return deps.json(await deps.withUserMutationLock(env,user.id,path,()=>path==='admin/loot-shop/source'?saveLootSourcePolicy(env,user,body):admin?saveLootShopPolicy(env,user,body.policy).then(policy=>({policy})):path==='loot-shop/purchase'?purchaseLootProduct(env,user,body):openLootPack(env,user,body)));
 }catch(error){return jointResponseError(error,deps.json);}
}
