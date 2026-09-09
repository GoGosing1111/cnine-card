// One-time operator action. Never imported by the game runtime or a migration.
export const OPERATION_KEY = 'ops_emperor_equipment_cms_20260909_v1';
export const EMPEROR_ITEMS = Object.freeze([
  {code:'EMPEROR_TOP',name:'엠퍼러 슈트',slot:'TOP',subtype:'TOP',file:'emperor-suit-v1.png',sha256:'cee964b970e4bda32cf59591351da0d2cf2ef845d3a7c4962a43e6b9bd5c11e0'},
  {code:'EMPEROR_BOTTOM',name:'엠퍼러 레깅스',slot:'BOTTOM',subtype:'BOTTOM',file:'emperor-leggings-v1.png',sha256:'48959ce71807d4ae04f00fad93bed8d05598065ac1711f339dc66ec4c21f045d'},
  {code:'EMPEROR_SHOES',name:'엠퍼러 슈즈',slot:'SHOES',subtype:'SHOES',file:'emperor-shoes-v1.png',sha256:'ccea35b08d073ebdc0b200c86c8e9d4eb14d48cc84ebfa59dcc8f71b0fb681ea'},
  {code:'EMPEROR_DUAL_DISK',name:'엠퍼러 듀얼디스크',slot:'ACCESSORY',subtype:'DUAL_DISK',file:'emperor-dual-disk-v1.png',sha256:'c44659643b1db5ee1bf51750e7dc13ea5f00735a11086ff477bdb987871c2507'}
].map(item=>Object.freeze({...item,image:`/assets/items/${item.file}`})));

export async function readEmperorCatalog(client) {
  const items=(await client.query('SELECT * FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id',[EMPEROR_ITEMS.map(item=>item.code)])).rows;
  const marker=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  return {items,receipt:marker?JSON.parse(marker.value):null};
}

export function assertInitialCatalog(items) {
  if(items.length!==4)throw new Error('Expected exactly four Emperor equipment rows');
  for(const expected of EMPEROR_ITEMS){
    const row=items.find(item=>item.code===expected.code);
    if(!row||row.name!==expected.name||row.slot!==expected.slot||row.subtype!==expected.subtype||row.image_url!==expected.image)throw new Error(`Emperor identity mismatch: ${expected.code}`);
    if(row.rarity!=='NORMAL'||Number(row.total_power)!==0||Number(row.pve_power)!==0||Number(row.pvp_power)!==0)throw new Error(`Unexpected gameplay settings: ${expected.code}`);
    if(Number(row.is_active)!==1||Number(row.is_public)!==1||Number(row.supply_enabled)!==0||Number(row.supply_weight)!==0)throw new Error(`Visibility/supply safety check failed: ${expected.code}`);
  }
}

export async function registerEmperorCatalog(client) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    // The catalog is small. This brief lock serializes CMS inserts, while reads continue.
    await client.query('LOCK TABLE character_equipment_items IN SHARE ROW EXCLUSIVE MODE');
    const existing=await readEmperorCatalog(client);
    if(existing.receipt){
      if(existing.items.length!==4)throw new Error('Recorded operation has missing equipment; manual review required');
      await client.query('COMMIT');
      return {alreadyRegistered:true,...existing};
    }
    const collisions=(await client.query('SELECT id,code,name FROM character_equipment_items WHERE code=ANY($1::text[]) OR name=ANY($2::text[])',[EMPEROR_ITEMS.map(item=>item.code),EMPEROR_ITEMS.map(item=>item.name)])).rows;
    if(collisions.length)throw new Error('Existing Emperor code/name found without this operation receipt; nothing changed');
    const before=(await client.query('SELECT * FROM character_equipment_items ORDER BY id')).rows;
    const items=[];
    for(const item of EMPEROR_ITEMS){
      const result=await client.query(`INSERT INTO character_equipment_items
        (code,name,slot,subtype,image_url,description,total_power,pve_power,pvp_power,is_active,is_public,supply_enabled,supply_weight)
        VALUES($1,$2,$3,$4,$5,$6,0,0,0,1,1,0,0) RETURNING *`,
        [item.code,item.name,item.slot,item.subtype,item.image,'엠퍼러 장비. 능력치와 획득 방식 설정 대기.']);
      if(result.rows.length!==1)throw new Error(`Equipment insert did not produce one row: ${item.code}`);
      items.push(result.rows[0]);
    }
    assertInitialCatalog(items);
    const preserved=(await client.query('SELECT * FROM character_equipment_items WHERE NOT(code=ANY($1::text[])) ORDER BY id',[EMPEROR_ITEMS.map(item=>item.code)])).rows;
    if(JSON.stringify(before)!==JSON.stringify(preserved))throw new Error('Existing equipment changed unexpectedly');
    const receipt={operation:OPERATION_KEY,scope:'CMS_CATALOG_PUBLIC_ONLY',registeredAt:(await client.query('SELECT clock_timestamp() AS now')).rows[0].now,before:[],after:items,preservedEquipmentCount:before.length,settingsPending:true,rarityPlaceholder:'NORMAL',acquisitionEnabled:false};
    const marker=await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt)]);
    if(marker.rows.length!==1)throw new Error('Operation receipt was not recorded');
    await client.query('COMMIT');
    return {alreadyRegistered:false,items,receipt};
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
