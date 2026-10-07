import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {enableEquipmentRepairFixture} from './helpers/workshop-equipment-repair-fixture.mjs';
import {forgeQuote,executeForge,forgeAccountState} from '../functions/_equipment_forge_transactions.js';
import {handleEquipment} from '../functions/_equipment.js';
import {forgePower} from '../shared/equipment-forge-policy-v1.mjs';

const HIGH_ID=2150000000;
async function fixture(t,postgres){
  const f=await forgeFixture(t,{postgres,productionEquipmentRequests:true});
  await enableEquipmentRepairFixture(f);
  for(const sql of [
    'ALTER TABLE user_equipment_loadout ADD COLUMN updated_at TEXT',
    'CREATE TABLE user_character_titles(user_id INTEGER,title_id INTEGER,expires_at TEXT)',
    'CREATE TABLE user_title_loadout(user_id INTEGER,title_id INTEGER)',
    'CREATE TABLE character_titles(id INTEGER,name TEXT,pve_power INTEGER,style_preset TEXT,unlock_config_json TEXT,is_active INTEGER)',
    'CREATE TABLE user_garage_loadout(user_id INTEGER,garage_id INTEGER)',
    'CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER)',
    'CREATE TABLE character_garage_items(id INTEGER,name TEXT,rarity TEXT,image_url TEXT,pve_power INTEGER,pvp_power INTEGER,is_active INTEGER)',
  ]){if(postgres)await f.pg.exec(sql.replaceAll('INTEGER','BIGINT'));else await f.p(sql).run();}
  // The route uses the current equipment schema; unrelated catalogue
  // migrations are outside this instance-ID regression.
  const prepare=f.DB.prepare.bind(f.DB);
  f.DB.prepare=sql=>sql.startsWith('SELECT key,value FROM app_meta WHERE key IN')?{
    bind(...keys){return {async all(){return {results:keys.map(key=>({key,value:'1'}))};}};},
  }:prepare(sql);
  const call=async(instanceId,userId=7)=>{
    const response=await handleEquipment({
      path:'character/equipment/equip',env:f.env,
      request:new Request('https://game.test/api/character/equipment/equip',{
        method:'POST',headers:userId?{authorization:`Bearer local-account-${userId}`}:{},body:JSON.stringify({instanceId}),
      }),deps:{...f.deps,readBody:r=>r.json()},
    });
    return {status:response.status,body:await response.json()};
  };
  const equipped=async(slot='WEAPON')=>Number((await f.p('SELECT instance_id FROM user_equipment_loadout WHERE user_id=7 AND slot=?',slot).first())?.instance_id||0);
  return {...f,call,equipped};
}

for(const postgres of [false,true]){
  const label=postgres?'PostgreSQL':'SQLite';
  test(`${label}: +8 armor repair above the 32-bit boundary equips the restored instance and charges once`,async t=>{
    const f=await fixture(t,postgres);
    await f.p("UPDATE character_equipment_items SET slot='TOP',subtype='TOP' WHERE id=1").run();
    await f.p("UPDATE user_equipment_loadout SET slot='TOP' WHERE user_id=7").run();
    await f.p('UPDATE users SET coin=1000000000000 WHERE id=7').run();
    await f.p("UPDATE cnine_user_inventory SET quantity=1000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
    await f.p('INSERT INTO equipment_forge_states_v1 VALUES(?,7,8,1)',f.instanceId).run();
    const enhance=await forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId});
    const destroyed=await executeForge(f.env,f.user,{requestId:crypto.randomUUID(),quoteId:enhance.quoteId},'ENHANCE',{randomInt:()=>999999});
    assert.equal(destroyed.outcome,'DESTROY');assert.equal(await f.equipped('TOP'),0);
    await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type) VALUES(?,8,1,'TEST')",HIGH_ID).run();
    if(postgres)await f.pg.query("SELECT setval(pg_get_serial_sequence('user_equipment_instances','id'),$1)",[HIGH_ID]);
    const quote=await forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'RESTORE',recordId:destroyed.recordId});
    const body={requestId:crypto.randomUUID(),quoteId:quote.quoteId},coins=await f.coin();
    const restored=await executeForge(f.env,f.user,body,'RESTORE');
    assert.equal(restored.instanceId,String(HIGH_ID+1));assert.equal(restored.level,8);
    const inventory=await forgeAccountState(f.env,f.user);
    assert.equal(inventory.items.find(row=>String(row.instanceId)===restored.instanceId).enhancement.level,8);
    const equip=await f.call(Number(restored.instanceId));
    assert.equal(equip.status,200);assert.equal(equip.body.instanceId,HIGH_ID+1);assert.equal(equip.body.slot,'TOP');
    assert.equal(await f.equipped('TOP'),HIGH_ID+1);
    const power=forgePower(10000,8);
    assert.equal(equip.body.bonuses.equipmentPve,power.pve);assert.equal(equip.body.bonuses.equipmentPvp,power.pvp);
    assert.equal((await f.call(restored.instanceId)).status,200,'decimal-string IDs from DOM remain supported');
    assert.equal((await executeForge(f.env,f.user,body,'RESTORE')).replayed,true);
    assert.equal(await f.coin(),coins-quote.cost.coinCost);assert.equal(await f.qty('PINGDU_REPAIR_COUPON'),1);
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM user_equipment_instances WHERE source_type='FORGE_RESTORE'").first()).n),1);
    assert.equal((await forgeAccountState(f.env,f.user)).items.find(row=>String(row.instanceId)===restored.instanceId).equipped,true);
  });

  test(`${label}: normal and large IDs select exactly that owned active item, with no clamp fallback`,async t=>{
    const f=await fixture(t,postgres);
    for(const id of [2147483647,2147483648,Number.MAX_SAFE_INTEGER]){
      await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type) VALUES(?,7,1,'TEST')",id).run();
      assert.equal((await f.call(id)).status,200);assert.equal(await f.equipped(),id);
      assert.equal((await f.call(String(id))).body.instanceId,id);
    }
    assert.equal((await f.call(f.instanceId)).status,200);assert.equal(await f.equipped(),Number(f.instanceId));
    await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type) VALUES(?,8,1,'TEST')",HIGH_ID).run();
    assert.equal((await f.call(HIGH_ID)).status,404);
    assert.equal((await f.call(HIGH_ID+1)).status,404);
    assert.equal((await f.call(2147483648,null)).status,401);
    await f.p('UPDATE character_equipment_items SET is_active=0 WHERE id=1').run();
    assert.equal((await f.call(2147483648)).status,404);
    assert.equal(await f.equipped(),Number(f.instanceId));
  });

  test(`${label}: invalid IDs cannot equip a different item through rounding or coercion`,async t=>{
    const f=await fixture(t,postgres);
    for(const value of [undefined,null,true,false,[],[1],{},0,-1,1.9,Infinity,Number.MAX_SAFE_INTEGER+1,'',' ',' 1 ','1.0','1e0','0x1','1x','-1','0','9007199254740992','9223372036854775807']){
      const response=await f.call(value);
      assert.equal(response.status,400,JSON.stringify(value));
      assert.equal(await f.equipped(),Number(f.instanceId));
    }
  });
}
