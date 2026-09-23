import assert from 'node:assert/strict';
import {cleanMagicSettings} from '../../functions/_magic.js';

export const OPERATION_KEY='ops:kim-ayoon-full-card-grant:20260924:v1';
export const TARGET=Object.freeze({id:5209,nickname:'김아윤'});
const expectedCounts={FUR:14,SUPERSTAR:7,MAGIC:14};
const catalogSql=`SELECT c.id,c.title,UPPER(c.rarity) AS grade FROM cards_effective_v1210 c
 JOIN members m ON m.id=c.member_id WHERE UPPER(c.rarity) IN ('FUR','SUPERSTAR')
 AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND COALESCE(m.is_active,1)=1
 ORDER BY UPPER(c.rarity),c.id`;
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const allCards=c=>c.query('SELECT * FROM user_cards WHERE user_id=$1 ORDER BY card_id',[TARGET.id]);
const allMagic=c=>c.query('SELECT * FROM user_magic_cards WHERE user_id=$1 ORDER BY magic_card_id',[TARGET.id]);
const byId=(rows,key)=>new Map(rows.map(row=>[String(row[key]),row]));

function verifyRows(before,after,ids,key,levelKey,level,timestampKey){
 const old=byId(before,key),next=byId(after,key),allowed=new Set(ids.map(String));
 for(const [id,row] of old)if(!allowed.has(id))assert.deepEqual(next.get(id),row,'Unrelated inventory changed');
 assert.equal(next.size,old.size+ids.filter(id=>!old.has(String(id))).length);
 return ids.map(value=>{
  const id=String(value),previous=old.get(id),row=next.get(id);
  assert.ok(row,'Missing granted card');
  assert.equal(Number(row.quantity),Number(previous?.quantity||0)+1);
  assert.equal(Number(row[levelKey]),Math.max(Number(previous?.[levelKey]||0),level));
  if(previous){
   const expected={...previous,quantity:row.quantity,[levelKey]:row[levelKey],[timestampKey]:row[timestampKey]};
   if(levelKey==='breakthrough_level')expected.breakthrough_fail_count=Number(previous[levelKey])<level?0:Number(previous.breakthrough_fail_count);
   // PostgreSQL drivers may represent bigint as strings or numbers.
   const normalize=entry=>Object.fromEntries(Object.entries(entry).map(([k,v])=>[k,['quantity',levelKey,'breakthrough_fail_count'].includes(k)?Number(v):v]));
   assert.deepEqual(normalize(row),normalize(expected),'Unrequested inventory field changed');
  }
  return {id,quantityBefore:Number(previous?.quantity||0),quantityAfter:Number(row.quantity),levelBefore:Number(previous?.[levelKey]||0),levelAfter:Number(row[levelKey])};
 });
}

// Explicit one-time operator grant. This is never loaded by the game runtime.
// Caller supplies an authenticated production/test PostgreSQL client.
export async function grantKimAyoonCards(client){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  const users=(await client.query('SELECT id,nickname,status FROM users WHERE nickname=$1 ORDER BY id FOR UPDATE',[TARGET.nickname])).rows;
  assert.equal(users.length,1,'Exactly one named account is required');
  assert.equal(Number(users[0].id),TARGET.id,'Target account changed');
  assert.equal(users[0].status,'ACTIVE','Target must be active');
  // The target row lock serializes concurrent calls before checking the receipt.
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(saved){
   const receipt=JSON.parse(saved.value);
   assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.user.id,TARGET.id);
   await client.query('COMMIT');return {...receipt,replayed:true};
  }
  const cards=(await client.query(catalogSql)).rows;
  const magic=(await client.query('SELECT id,code,name FROM magic_cards WHERE is_active=1 ORDER BY id')).rows;
  const counts={FUR:cards.filter(row=>row.grade==='FUR').length,SUPERSTAR:cards.filter(row=>row.grade==='SUPERSTAR').length,MAGIC:magic.length};
  assert.deepEqual(counts,expectedCounts,'Reviewed live catalog changed; inspect before granting');
  const rawMagic=(await client.query("SELECT value FROM app_meta WHERE key='magic_card_settings_v1'")).rows[0];
  const magicLevel=cleanMagicSettings(rawMagic?JSON.parse(rawMagic.value):{}).enhancement.maxLevel;
  assert.equal(magicLevel,9,'Reviewed maximum magic enhancement changed');
  const owner=(await client.query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'An active owner is required for operator audit attribution');
  const walletBefore=(await client.query(walletSql,[TARGET.id])).rows[0];
  const cardBefore=(await client.query('SELECT * FROM user_cards WHERE user_id=$1 ORDER BY card_id FOR UPDATE',[TARGET.id])).rows;
  const magicBefore=(await client.query('SELECT * FROM user_magic_cards WHERE user_id=$1 ORDER BY magic_card_id FOR UPDATE',[TARGET.id])).rows;
  const ids=cards.map(row=>row.id),magicIds=magic.map(row=>row.id),now=new Date().toISOString();
  for(const row of [...cardBefore.filter(row=>ids.includes(row.card_id)),...magicBefore.filter(row=>magicIds.map(String).includes(String(row.magic_card_id)))])assert.ok(Number(row.quantity)>=0,'Invalid existing inventory quantity');
  const grantedCards=await client.query(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,first_obtained_at,last_obtained_at)
   SELECT $1,id,1,13,$3,$3 FROM unnest($2::text[]) AS id
   ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,
   breakthrough_level=GREATEST(user_cards.breakthrough_level,excluded.breakthrough_level),
   breakthrough_fail_count=CASE WHEN user_cards.breakthrough_level<excluded.breakthrough_level THEN 0 ELSE user_cards.breakthrough_fail_count END,
   last_obtained_at=excluded.last_obtained_at RETURNING card_id`,[TARGET.id,ids,now]);
  assert.equal(grantedCards.rowCount,ids.length);
  const grantedMagic=await client.query(`INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,enhancement_level,first_obtained_at,updated_at)
   SELECT $1,id,1,$3,$4,$4 FROM unnest($2::bigint[]) AS id
   ON CONFLICT(user_id,magic_card_id) DO UPDATE SET quantity=user_magic_cards.quantity+1,
   enhancement_level=GREATEST(user_magic_cards.enhancement_level,excluded.enhancement_level),updated_at=excluded.updated_at
   RETURNING magic_card_id`,[TARGET.id,magicIds,magicLevel,now]);
  assert.equal(grantedMagic.rowCount,magicIds.length);
  const cardAfter=(await allCards(client)).rows,magicAfter=(await allMagic(client)).rows;
  const cardChanges=verifyRows(cardBefore,cardAfter,ids,'card_id','breakthrough_level',13,'last_obtained_at').map(row=>({...row,...cards.find(card=>card.id===row.id)}));
  const magicChanges=verifyRows(magicBefore,magicAfter,magicIds,'magic_card_id','enhancement_level',magicLevel,'updated_at').map(row=>({...row,name:magic.find(card=>String(card.id)===row.id).name}));
  assert.deepEqual((await client.query(walletSql,[TARGET.id])).rows[0],walletBefore,'Account balances changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',user:TARGET,counts,quantityPerType:1,cardLevel:13,magicLevel,cardChanges,magicChanges,balancesPreserved:true,completedAt:now};
  const log=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[
   owner.id,'OPS_CARD_MAGIC_FULL_GRANT','USER',String(TARGET.id),
   JSON.stringify({operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',user:TARGET,cardChanges:cardChanges.map(({id,quantityBefore,levelBefore})=>({id,quantityBefore,levelBefore})),magicChanges:magicChanges.map(({id,quantityBefore,levelBefore})=>({id,quantityBefore,levelBefore}))}),
   JSON.stringify({...receipt,reason:'사용자 지시: 김아윤에게 공개·활성 FUR·SUPERSTAR 전체 +13, 마법카드 전체 최고 강화로 각 1장 지급'})
  ])).rows[0];
  receipt.adminLogId=String(log.id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  await client.query('COMMIT');return {...receipt,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
