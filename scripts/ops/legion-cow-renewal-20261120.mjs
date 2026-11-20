import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {COW_TICKETS} from '../../shared/legion-cow-room.mjs';
import {COW_DRAW_KEY} from '../../functions/_legion_cow_tickets.js';

const prefix='ops:legion-cow:20261120:';
export async function cowCutover(client,step,mode){
  assert(['catalog','reset'].includes(step)&&['check','rehearse','apply','verify'].includes(mode));
  const key=prefix+step+':v1',write=['rehearse','apply'].includes(mode);
  const rows=async(text,params=[])=>(await client.query(text,params)).rows;
  const one=async(text,params)=>(await rows(text,params))[0];
  await client.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
    await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");
    assert.equal((await one('SELECT current_database() db')).db,'cnine');
    if(write)await rows('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const prior=await one('SELECT value FROM app_meta WHERE key=$1',[key]);
    if(prior){
      const stored=JSON.parse(prior.value);
      if(mode==='verify'){
        assert(await one('SELECT id FROM admin_logs WHERE id=$1',[stored.auditId]));
        if(step==='reset')assert.equal((await one("SELECT count(*)::int n FROM cow_room_portal_rolls_v1 WHERE state='OPEN'")).n,0);
        else assert.equal((await rows('SELECT code FROM inventory_items WHERE is_active=1 AND code=ANY($1::text[])',[Object.values(COW_TICKETS).map(i=>i.code)])).length,2);
      }
      await client.query('ROLLBACK');return {existing:true,...stored};
    }
    assert.notEqual(mode,'verify');
    const stamp=await one("SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS') kst");
    const record={operation:key,...stamp};
    if(step==='catalog'){
      record.items=Object.values(COW_TICKETS).map(t=>t.code);
      assert.equal((await rows('SELECT code FROM inventory_items WHERE code=ANY($1::text[])',[record.items])).length,0);
      if(write){
        for(const [kind,t] of Object.entries(COW_TICKETS))await rows("INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,'LEGION COW LEVEL',$3,'ENTRY_TICKET','EPIC',$4,$5,1)",[t.code,t.name,kind==='solo'?'개인 군단토벌 카우방 출전 시 1장 사용합니다.':'방장이 1장을 사용해 2명이 카우방에 출전합니다.',t.image,kind==='solo'?166710:166711]);
        await rows('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[COW_DRAW_KEY,randomBytes(32).toString('hex')]);
      }
    }else{
      if(write)await client.query('LOCK TABLE cow_room_portal_rolls_v1 IN SHARE ROW EXCLUSIVE MODE');
      const balance=await one("SELECT count(*)::int n,count(DISTINCT user_id)::int users FROM cow_room_portal_rolls_v1 WHERE state='OPEN'");
      Object.assign(record,{expired:balance.n,accounts:balance.users});
      if(write){
        // Retain original roll, ownership and previous consumption receipts.
        const changed=await rows("UPDATE cow_room_portal_rolls_v1 SET state='MISSED' WHERE state='OPEN' RETURNING id,user_id");
        assert.equal(changed.length,balance.n);
        await client.query("ALTER TABLE cow_room_portal_rolls_v1 ADD CONSTRAINT cow_room_no_legacy_open_20261120 CHECK(state<>'OPEN') NOT VALID");
        assert.equal((await one("SELECT count(*)::int n FROM cow_room_portal_rolls_v1 WHERE state='OPEN'")).n,0);
        const audit=await one("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT id,'LEGION_COW_RESET','CONTENT',$1,$2,$3 FROM users WHERE role='OWNER' ORDER BY id LIMIT 1 RETURNING id::text",[key,JSON.stringify({portals:changed}),JSON.stringify(record)]);record.auditId=audit.id;
      }
    }
    if(write){
      if(!record.auditId){const audit=await one("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT id,'LEGION_COW_CATALOG','CONTENT',$1,'{}',$2 FROM users WHERE role='OWNER' ORDER BY id LIMIT 1 RETURNING id::text",[key,JSON.stringify(record)]);record.auditId=audit.id;}
      await rows('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[key,JSON.stringify(record)]);
    }
    await client.query(mode==='apply'?'COMMIT':'ROLLBACK');return {mode,...record};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
