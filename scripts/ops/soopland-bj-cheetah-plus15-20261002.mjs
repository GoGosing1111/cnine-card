import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:soopland-bj-cheetah-plus15:20261002:v1';
export const EXCLUDED=Object.freeze({id:1,nickname:'핑크빛유두'});
export const CARD=Object.freeze({id:'CN-5D0E2E4D58C9416F',title:'치타구',grade:'FUR'});
export const TARGETS=Object.freeze([
 {id:4718,nickname:'강구열',slot:'강구열'},{id:4754,nickname:'조은',slot:'조은'},
 {id:4773,nickname:'진짜디임',slot:'진짜디임'},{id:4913,nickname:'오리꿍',slot:'오리꿍'},
 {id:4977,nickname:'하이희야♡',slot:'하이희야♡'},{id:5209,nickname:'김아윤',slot:'김아윤'},
 {id:5393,nickname:'주성',slot:'주성'},{id:5426,nickname:'나무늘봉순',slot:'나무늘봉순'}
].map(Object.freeze));
const ids=TARGETS.map(t=>t.id),allIds=[EXCLUDED.id,...ids];
const holdingSql='SELECT * FROM user_cards WHERE user_id=ANY($1::bigint[]) AND card_id=$2 ORDER BY user_id';
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id';
const starsSql="SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id";
const normalize=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,['quantity','breakthrough_level','breakthrough_fail_count'].includes(k)?Number(v):v]));
const validateRoster=rows=>assert.deepEqual(rows.filter(r=>Number(r.user_id)!==EXCLUDED.id).map(r=>({id:Number(r.user_id),slot:r.slot})),TARGETS.map(t=>({id:t.id,slot:t.slot})),'Registered BJ roster changed');

export async function upgradeSooplandBJCheetah(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='10s'");
  const users=await q('SELECT id,nickname,status,role FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[allIds]);
  assert.equal(users.length,allIds.length,'Missing account');
  for(const t of [EXCLUDED,...TARGETS]){const u=users.find(r=>Number(r.id)===t.id);assert.equal(u?.nickname,t.nickname,'Account identity changed');assert.equal(u.status,'ACTIVE');}
  assert.ok(!ids.includes(EXCLUDED.id)&&TARGETS.every(t=>t.nickname!==EXCLUDED.nickname),'Excluded account in target list');
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const r=JSON.parse(prior.value);assert.equal(r.status,'COMPLETED');assert.deepEqual(r.targets.map(t=>t.userId),ids);assert.equal(r.card.id,CARD.id);await client.query('ROLLBACK');return {...r,replayed:true};}
  const roster=await q('SELECT slot,user_id FROM soopketland_accounts ORDER BY user_id,slot FOR SHARE');validateRoster(roster);
  const [card]=await q('SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,c.card_status,m.name member_name,m.is_active member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=$1',[CARD.id]);
  assert.deepEqual({id:card?.id,title:card?.title,grade:card?.grade},CARD);assert.equal(card.member_name,'이예준');assert.equal(Number(card.is_active),1);assert.equal(card.card_status,'PUBLIC');assert.equal(Number(card.member_active),1);
  const owner=users.find(u=>u.role==='OWNER');assert.ok(owner,'Audit owner missing');
  const walletBefore=await q(walletSql,[allIds]),excludedBefore=await q(holdingSql,[[EXCLUDED.id],CARD.id]);
  const starsBefore=await q(starsSql+' FOR UPDATE',[allIds]);
  const before=await q(holdingSql+' FOR UPDATE',[ids,CARD.id]);assert.equal(before.length,ids.length,'All BJ existing holdings required');
  for(let i=0;i<before.length;i++){
   const r=before[i];assert.equal(Number(r.user_id),ids[i]);assert.ok(Number(r.quantity)>0,'Existing owned card required');
   assert.ok(Number.isInteger(Number(r.breakthrough_level))&&Number(r.breakthrough_level)>=0&&Number(r.breakthrough_level)<=15,'Unexpected level');assert.ok(Number(r.breakthrough_fail_count)>=0,'Enhancement in progress');
  }
  for(const r of before)if(Number(r.breakthrough_level)<15){
   const rows=await q('UPDATE user_cards SET breakthrough_level=15,breakthrough_fail_count=0 WHERE user_id=$1 AND card_id=$2 AND breakthrough_level=$3 AND quantity=$4 AND breakthrough_fail_count=$5 RETURNING user_id',[r.user_id,CARD.id,r.breakthrough_level,r.quantity,r.breakthrough_fail_count]);assert.equal(rows.length,1,'Holding changed during upgrade');
  }
  const after=await q(holdingSql,[ids,CARD.id]);
  assert.deepEqual(after.map(normalize),before.map(r=>normalize({...r,breakthrough_level:15,breakthrough_fail_count:Number(r.breakthrough_level)<15?0:r.breakthrough_fail_count})),'Unrequested holding field changed');
  assert.deepEqual(await q(walletSql,[allIds]),walletBefore,'Account balance changed');assert.deepEqual(await q(starsSql,[allIds]),starsBefore,'Master stars changed');assert.deepEqual(await q(holdingSql,[[EXCLUDED.id],CARD.id]),excludedBefore,'Excluded account changed');
  const targets=[];
  for(let i=0;i<TARGETS.length;i++){
   const t=TARGETS[i],result={userId:t.id,nickname:t.nickname,slot:t.slot,levelBefore:Number(before[i].breakthrough_level),levelAfter:15,quantityBefore:Number(before[i].quantity),quantityAfter:Number(after[i].quantity),changed:Number(before[i].breakthrough_level)<15};
   const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_CARD_UPGRADE_PLUS15','USER',String(t.id),JSON.stringify({operationKey:OPERATION_KEY,card:before[i]}),JSON.stringify({...result,operationKey:OPERATION_KEY,cardState:after[i],reason:'사용자 지시: 숲켓랜드 등록 BJ의 치타구를 +15강으로 업그레이드, 핑크빛유두 제외'})]);assert.ok(audit,'Audit log missing');targets.push({...result,adminLogId:String(audit.id)});
  }
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',card:CARD,excluded:EXCLUDED,targets,accounts:targets.length,changed:targets.filter(t=>t.changed).length,balancesPreserved:true,excludedPreserved:true,completedAt:new Date().toISOString()};
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]);await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}

export async function verifySooplandBJCheetah(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Receipt missing');const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.targets.map(t=>t.userId),ids);
 validateRoster(await q('SELECT slot,user_id FROM soopketland_accounts ORDER BY user_id,slot'));
 const users=await q('SELECT id,nickname FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[allIds]);
 for(const t of [EXCLUDED,...TARGETS])assert.equal(users.find(u=>Number(u.id)===t.id)?.nickname,t.nickname);
 const holdings=await q(holdingSql,[ids,CARD.id]);assert.equal(holdings.length,8);
 for(let i=0;i<8;i++){assert.equal(Number(holdings[i].user_id),ids[i]);assert.equal(Number(holdings[i].breakthrough_level),15);assert.ok(Number(holdings[i].quantity)>0);const [audit]=await q('SELECT action_type,target_id FROM admin_logs WHERE id=$1',[receipt.targets[i].adminLogId]);assert.equal(audit?.action_type,'OPS_CARD_UPGRADE_PLUS15');assert.equal(audit.target_id,String(ids[i]));}
 return {...receipt,status:'VERIFIED',current:holdings.map(r=>({userId:Number(r.user_id),level:Number(r.breakthrough_level),quantity:Number(r.quantity)}))};
}
