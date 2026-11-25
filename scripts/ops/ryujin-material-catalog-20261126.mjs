import assert from 'node:assert/strict';
import {NOX_RYUJIN_MATERIALS} from '../../functions/_nox_ryujin_materials.js';

const operation='ops:nox-ryujin-material-catalog:20261126:v1';
const items=NOX_RYUJIN_MATERIALS.map(({code,name,image},index)=>({
  code,name,image_url:image.slice(1),category:'MATERIAL',rarity:'SPECIAL',is_active:1,sort_order:215020+index
}));

export async function registerRyujinMaterials(db,mode){
  assert.ok(['rehearse','apply','verify'].includes(mode));
  const q=async(sql,args)=>(await db.query(sql,args)).rows;
  await q(mode==='verify'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
  try{
    await q("SET LOCAL lock_timeout='3s'");
    assert.equal((await q('SELECT current_database() AS name'))[0].name,'cnine');
    if(mode!=='verify')await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[operation]);
    const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[operation]);
    const codes=items.map(item=>item.code);
    if(!prior){
      assert.notEqual(mode,'verify','Missing Ryujin catalog receipt');
      const conflicts=await q('SELECT code FROM inventory_items WHERE code=ANY($1::text[]) OR name=ANY($2::text[])',
        [codes,items.map(item=>item.name)]);
      assert.equal(conflicts.length,0,'A Ryujin catalog entry already exists');
      for(const item of items){
        await q(`INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
          VALUES($1,$2,'RYUJIN','종언의 주파수 레이드에서 획득하는 류진 용병 제작 재료입니다.','MATERIAL','SPECIAL',$3,$4,1)`,
          [item.code,item.name,item.image_url,item.sort_order]);
      }
      const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");
      const [audit]=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
        VALUES($1,'OPS_INVENTORY_MATERIAL_CATALOG','CATALOG',$2,'[]',$3) RETURNING id`,[owner.id,operation,JSON.stringify(items)]);
      await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[operation,JSON.stringify({codes,auditId:String(audit.id)})]);
    }
    const rows=await q('SELECT code,name,image_url,category,rarity,is_active,sort_order FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY sort_order',[codes]);
    assert.deepEqual(rows.map(row=>({...row,is_active:Number(row.is_active),sort_order:Number(row.sort_order)})),items);
    const [audit]=await q("SELECT id FROM admin_logs WHERE target_id=$1 AND action_type='OPS_INVENTORY_MATERIAL_CATALOG'",[operation]);
    assert.ok(audit);
    await q(mode==='apply'&&!prior?'COMMIT':'ROLLBACK');
    return {codes,auditId:String(audit.id),mode};
  }catch(error){await db.query('ROLLBACK');throw error;}
}
