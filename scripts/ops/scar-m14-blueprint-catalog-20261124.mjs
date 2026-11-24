import assert from 'node:assert/strict';

export const OPERATION='ops:scar-m14-blueprint-catalog:20261124:v1';
const appearance={
 SCAR:'금속 양각으로 SCAR의 외형을 새긴',
 M14:'은빛 리본과 나비 장식의 M14-EBR 원화를 새긴'
};
export const ITEMS=Object.keys(appearance).flatMap((weapon,index)=>[1,2,3].map(chapter=>({
 code:weapon+'_BLUEPRINT_CHAPTER_'+chapter,
 name:weapon+' 설계도 '+chapter+'장',
 subtitle:weapon+' BLUEPRINT '+['I','II','III'][chapter-1],
 description:appearance[weapon]+' 동방무기상 설계도 '+chapter+'장. 인벤토리에서 직접 사용할 수 없는 재료입니다.',
 category:'MATERIAL',rarity:'SPECIAL',
 image_url:'assets/items/'+weapon.toLowerCase()+'-blueprint-chapter-'+chapter+'-v1.webp',
 sort_order:215008+index*3+chapter,is_active:1
})));

export async function registerBlueprints(db,mode){
 assert.ok(['rehearse','apply','verify'].includes(mode));
 const write=mode!=='verify';
 const q=async(sql,values)=>(await db.query(sql,values)).rows;
 await db.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await q("SET LOCAL statement_timeout='10s'");
  await q("SET LOCAL lock_timeout='3s'");
  assert.equal((await q('SELECT current_database() AS name'))[0].name,'cnine');
  if(write)await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION]);
  const [previous]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION]);
  const columns=Object.keys(ITEMS[0]).join(',');
  const read=async()=>(await q('SELECT '+columns+' FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY sort_order',[ITEMS.map(item=>item.code)])).map(row=>({...row,sort_order:Number(row.sort_order),is_active:Number(row.is_active)}));
  if(previous){
   const receipt=JSON.parse(previous.value);
   assert.deepEqual(await read(),ITEMS);
   assert.equal((await q("SELECT id FROM admin_logs WHERE id=$1 AND target_id=$2 AND action_type='OPS_INVENTORY_BLUEPRINT_CATALOG'",[receipt.auditId,OPERATION])).length,1);
   await q('ROLLBACK');
   return {...receipt,replayed:true};
  }
  assert.ok(write,'Catalog receipt missing');
  const conflicts=await q(`SELECT code FROM inventory_items
    WHERE code=ANY($1::text[]) OR name=ANY($2::text[]) OR image_url=ANY($3::text[])`,
  [ITEMS.map(item=>item.code),ITEMS.map(item=>item.name),ITEMS.map(item=>item.image_url)]);
  assert.equal(conflicts.length,0);
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
  assert.ok(owner);
  for(const item of ITEMS)await q('INSERT INTO inventory_items('+columns+') VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',Object.values(item));
  assert.deepEqual(await read(),ITEMS);
  const receipt={operation:OPERATION,items:ITEMS.map(item=>item.code),completedAt:new Date().toISOString()};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_INVENTORY_BLUEPRINT_CATALOG','CATALOG',$2,$3,$4) RETURNING id",[owner.id,OPERATION,'[]',JSON.stringify(ITEMS)]);
  receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION,JSON.stringify(receipt)]);
  await q(mode==='apply'?'COMMIT':'ROLLBACK');
  return {...receipt,committed:mode==='apply'};
 }catch(error){await q('ROLLBACK').catch(()=>{});throw error;}
}
