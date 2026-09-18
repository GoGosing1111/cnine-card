import assert from 'node:assert/strict';
import {APOCALYPSE_LEGION_BOSSES} from '../../shared/apocalypse-legion-v1.mjs';
export const OPERATION_KEY='ops:apocalypse-legion:20260918:v1';
export async function registerApocalypseLegion(client,{commit=false,assets=[]}={}){
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=(await client.query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY])).rows[0];
  if(prior){const saved=JSON.parse(prior.value);const rows=(await client.query('SELECT id,name,is_active,pve_enabled FROM battle_monsters WHERE id IN(75,76) ORDER BY id')).rows;assert.equal(rows.length,2);assert.equal(rows[0].name,'아카드');assert.equal(rows[1].name,'카네키 켄');await client.query('ROLLBACK');return {...saved,replayed:true};}
  const [meta]=(await client.query("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1' FOR UPDATE")).rows;assert(meta,'Apocalypse settings missing');
  const settings=JSON.parse(meta.value),reference=settings.monsterProfiles?.['74'];assert.equal(reference?.battlePower,5500000,'Hashirama changed; refresh reviewed powers before registration');
  assert.equal(settings.enabled,true,'Apocalypse is OFF; do not override CMS');
  const [anchor]=(await client.query('SELECT * FROM battle_monsters WHERE id=74 FOR SHARE')).rows;assert.equal(anchor?.name,'센쥬 하시라마');
  const duplicate=(await client.query("SELECT id FROM battle_monsters WHERE id IN(75,76) OR name IN ('아카드','카네키 켄')")).rows;assert.equal(duplicate.length,0,'Unexpected existing registration; no overwrite');
  const [owner]=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows;assert(owner,'Audit owner missing');
  if(commit)for(const boss of APOCALYPSE_LEGION_BOSSES)for(const suffix of ['-source.jpg','-sd-v1.png','-seal-sheet.png','-curse-sheet.png','-ultimate-sheet.png'])assert(assets.some(a=>a.path.endsWith('/'+boss.key+suffix)&&a.verified===true),'Published asset not verified: '+boss.key+suffix);
  const before=structuredClone(settings),registered=[];
  for(const [i,boss] of APOCALYPSE_LEGION_BOSSES.entries()){
   const power=i?10000000:7500000,description='보스 + 쫄몹 6마리. 보스 1·2·3행동에 봉인·힐불가 저주·궁극기를 사용합니다.';
   const row=(await client.query(`INSERT INTO battle_monsters(id,name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,ultimate_enabled,ultimate_name,ultimate_description)
    VALUES($1,$2,$3,$4,$5,1,1,$6,'APOCALYPSE',$6,1,0,0,0,$7,$8) RETURNING id,name,pve_tab,is_active,pve_enabled`,[boss.monsterId,boss.name,boss.sourceArt.slice(1),power,reference.rewardCoin,Number(anchor.pve_display_order)+i+1,boss.skills[2].name,description])).rows[0];
   settings.monsterProfiles[String(boss.monsterId)]={...reference,battlePower:power,skillEnabled:true,skillName:'봉인 · 힐불가 저주 · 궁극기',skillDescription:description};
   registered.push({...row,battlePower:power,minions:6,rewardCoin:reference.rewardCoin,rewardPercent:reference.rewardPercent,effectiveRewardCoin:Math.floor(reference.rewardCoin*reference.rewardPercent/100)});
  }
  const update=await client.query("UPDATE app_meta SET value=$1,updated_at=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS') WHERE key='battle_apocalypse_settings_v1'",[JSON.stringify(settings)]);assert.equal(update.rowCount,1);
  for(const key of Object.keys(before.monsterProfiles))assert.deepEqual(settings.monsterProfiles[key],before.monsterProfiles[key]);
  const record={status:'COMPLETED',authorization:'전부 승인하고 아카드부터는 쫄몹 나오게 설정해 6마리 정도',registered,assets,completedAt:new Date().toISOString()};
  const [audit]=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'APOCALYPSE_LEGION_REGISTER','MONSTER','75,76',JSON.stringify({settings:before}),JSON.stringify(record)])).rows;assert(audit,'Audit missing');record.adminLogId=audit.id;
  await client.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[OPERATION_KEY,JSON.stringify(record)]);
  const saved=(await client.query("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1'")).rows[0];assert.deepEqual(JSON.parse(saved.value),settings);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...record,committed:commit,replayed:false};
 }catch(e){await client.query('ROLLBACK');throw e;}
}
