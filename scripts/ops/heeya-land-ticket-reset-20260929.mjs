import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:heeya-land-ticket-reset:4977:20260929:v1';
export const TARGET=4977,NICKNAME='하이희야♡',ITEM='SOOPKETLAND_TICKET';
const rows=async(client,sql,args=[])=>(await client.query(sql,args)).rows;

// Explicit one-time account maintenance. Never call from deployment or request hooks.
export async function resetHeeyaLandTickets(client,{dryRun=true,now=Date.now()}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='2s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
    const [prior]=await rows(client,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
    if(prior){
      const receipt=JSON.parse(prior.value);
      assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operation,OPERATION_KEY);assert.equal(receipt.userId,TARGET);
      await client.query('ROLLBACK');return{replayed:true,dryRun,receipt};
    }
    // Match grant/spin: user first, issued lots next, inventory last.
    const [user]=await rows(client,'SELECT id,nickname,status FROM users WHERE id=$1 FOR UPDATE',[TARGET]);
    assert.equal(user?.nickname,NICKNAME,'Exact heart-suffix account required');assert.equal(user.status,'ACTIVE');
    const [binding]=await rows(client,'SELECT slot,user_id FROM soopketland_accounts WHERE user_id=$1 FOR UPDATE',[TARGET]);
    assert.equal(binding?.slot,NICKNAME,'Soopketland account binding changed');
    const [owner]=await rows(client,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
    assert.ok(owner,'Missing audit operator');
    const lots=await rows(client,'SELECT * FROM soopketland_ticket_lots WHERE user_id=$1 ORDER BY created_at,id FOR UPDATE',[TARGET]);
    const [inventory]=await rows(client,'SELECT * FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[TARGET,ITEM]);
    const quantity=BigInt(inventory?.quantity??0),unseen=BigInt(inventory?.unseen_quantity??0);
    assert.ok(quantity>=0n&&unseen>=0n);
    const remaining=lots.reduce((sum,lot)=>sum+BigInt(lot.remaining),0n),at=new Date(now).toISOString();
    const before={user,binding,inventory:inventory??null,lots};
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY+':before',JSON.stringify(before),at]);
    const changedLots=await rows(client,'UPDATE soopketland_ticket_lots SET remaining=0 WHERE user_id=$1 AND remaining>0 RETURNING id',[TARGET]);
    assert.equal(changedLots.length,lots.filter(lot=>BigInt(lot.remaining)>0n).length);
    const updatedInventory=await rows(client,'UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0,updated_at=$3 WHERE user_id=$1 AND item_code=$2 RETURNING quantity,unseen_quantity',[TARGET,ITEM,at]);
    assert.equal(updatedInventory.length,inventory?1:0);
    if(inventory){assert.equal(BigInt(updatedInventory[0].quantity),0n);assert.equal(BigInt(updatedInventory[0].unseen_quantity),0n)}
    const afterLots=await rows(client,'SELECT * FROM soopketland_ticket_lots WHERE user_id=$1 ORDER BY created_at,id',[TARGET]);
    assert.deepEqual(afterLots,lots.map(lot=>({...lot,remaining:typeof lot.remaining==='string'?'0':0})));
    const receipt={status:'COMPLETED',operation:OPERATION_KEY,actor:'SYSTEM_OPS',userId:TARGET,nickname:NICKNAME,itemCode:ITEM,
      beforeQuantity:String(quantity),beforeUnseen:String(unseen),beforeLotRemaining:String(remaining),afterQuantity:'0',afterUnseen:'0',afterLotRemaining:'0',
      lotsReset:changedLots.length,archiveKey:OPERATION_KEY+':before',completedAt:at};
    await client.query('INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES($1,$2,$3,0,$4,$5,$6,$7)',
      [TARGET,ITEM,String(-quantity),'사용자 지시: 하이희야♡ 숲켓랜드 이용권 전체 0개 초기화','OPS_SOOPKETLAND_TICKET_RESET',OPERATION_KEY,owner.id]);
    await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_SOOPKETLAND_TICKET_RESET','USER',$2,$3,$4)",
      [owner.id,String(TARGET),JSON.stringify({archiveKey:receipt.archiveKey}),JSON.stringify(receipt)]);
    await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),at]);
    await client.query(dryRun?'ROLLBACK':'COMMIT');return{replayed:false,dryRun,receipt};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
}
