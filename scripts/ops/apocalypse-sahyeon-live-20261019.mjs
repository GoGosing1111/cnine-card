import assert from 'node:assert/strict';
import {SAHYEON,sahyeonLiveProfile,ROOT} from '../../shared/apocalypse-sahyeon-v1.mjs';
import {normalizeApocalypseSettings,pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';
import approval from '../../preview/apocalypse-sahyeon-20261019-v1/live-approval-20261019.json' with {type:'json'};
export const OPERATION_KEY='ops:apocalypse-sahyeon-live:20261019:v1';
export async function registerSahyeon(client,{commit=false,assets=[],expectedReference}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');const [row]=await q('SELECT id,name FROM battle_monsters WHERE id=$1',[SAHYEON.monsterId]);assert.equal(row?.name,SAHYEON.name);await client.query('ROLLBACK');return {...receipt,replayed:true};}
  const [meta]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1' FOR UPDATE");assert(meta,'Missing apocalypse settings');
  const settings=JSON.parse(meta.value),before=structuredClone(settings),reference=settings.monsterProfiles?.['78'];
  assert.equal(settings.enabled,true,'Do not override the CMS OFF switch');assert(reference,'Azuma profile missing');
  assert(expectedReference,'Read-only reference snapshot required');assert.deepEqual(reference,expectedReference,'Azuma CMS changed after review');
  assert.equal(reference.battlePower*2,SAHYEON.battlePower,'Approved difficulty changed');
  assert.equal(approval.visualApproval,true);assert.equal(approval.authorization,'라이브 반영해');assert.equal(approval.rewardAuthorization,'아즈마 보상의 2배로 적용');
  if(commit){
   for(const file of approval.assets)assert(assets.some(a=>a.path===ROOT+'/'+file.file&&a.sha256===file.sha256&&a.verified),'Published approved asset not verified: '+file.file);
   for(const file of ['/preview/project-v-v3/project-v-pixi-battle.bundle.js','/js/battle-v3-live.js'])assert(assets.some(a=>a.path===file&&a.verified&&/^[a-f0-9]{64}$/.test(a.sha256)),'Published live runtime not verified: '+file);
  }
  await q('LOCK TABLE battle_monsters IN SHARE ROW EXCLUSIVE MODE');
  const [anchor]=await q("SELECT id,pve_display_order FROM battle_monsters WHERE id=78 AND pve_tab='APOCALYPSE' FOR SHARE");assert(anchor);
  const existing=await q("SELECT id FROM battle_monsters WHERE id=$1 OR name=$2",[SAHYEON.monsterId,SAHYEON.name]);assert.equal(existing.length,0,'Existing monster ID or name; no overwrite');
  assert.equal(settings.monsterProfiles[String(SAHYEON.monsterId)],undefined,'Existing CMS profile; no overwrite');
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner,'Audit owner missing');
  const profile=sahyeonLiveProfile(reference);
  const normalized=normalizeApocalypseSettings({enabled:true,monsterProfiles:{80:profile}}).monsterProfiles['80'];
  for(const key of ['battlePower','rewardCoin','rewardPercent','clearBonus','legionUltimate','battleSuitSkillDefensePercent'])assert.deepEqual(normalized[key],profile[key],'CMS would clamp '+key);
  const [order]=await q("SELECT MAX(pve_display_order) AS n FROM battle_monsters WHERE pve_tab='APOCALYPSE'");
  const displayOrder=Number(order.n||anchor.pve_display_order)+1;
  const rows=await q(`INSERT INTO battle_monsters(id,name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,ultimate_enabled,ultimate_name,ultimate_description)
   VALUES($1,$2,$3,$4,$5,1,1,$6,'BOSS','APOCALYPSE',$6,1,0,0,0,$7,$8) RETURNING id,name`,[SAHYEON.monsterId,SAHYEON.name,SAHYEON.sourceArt.slice(1),profile.battlePower,profile.rewardCoin,displayOrder,SAHYEON.skills[2].name,profile.skillDescription]);assert.equal(rows.length,1);
  settings.monsterProfiles[String(SAHYEON.monsterId)]=profile;
  const preserved=structuredClone(settings);delete preserved.monsterProfiles[String(SAHYEON.monsterId)];assert.deepEqual(preserved,before);
  assert.equal((await q("UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key='battle_apocalypse_settings_v1' RETURNING key",[JSON.stringify(settings)])).length,1);
  const runtime=pveDifficultyRuntime({apocalypse:settings},{id:80,pve_tab:'APOCALYPSE',is_boss:1});
  const old=pveDifficultyRuntime({apocalypse:settings},{id:78,pve_tab:'APOCALYPSE',is_boss:1});
  assert.equal(runtime.effectiveRewardCoin,old.effectiveRewardCoin*2);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:approval.authorization,rewardAuthorization:approval.rewardAuthorization,
   registered:{id:80,name:SAHYEON.name,battlePower:profile.battlePower,displayOrder,profile,effectiveRewardCoin:runtime.effectiveRewardCoin,minions:6},reference:{monsterId:78,profile:reference,effectiveRewardCoin:old.effectiveRewardCoin},assets,completedAt:new Date().toISOString()};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'APOCALYPSE_BOSSES_REGISTER','MONSTER','80',JSON.stringify({settings:before}),JSON.stringify(receipt)]);assert(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
  const [saved]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1'");assert.deepEqual(JSON.parse(saved.value),settings);
  if(commit){
   const [sequence]=await q("SELECT pg_get_serial_sequence('battle_monsters','id') name");
   if(sequence?.name){const parts=sequence.name.split('.');assert(parts.every(p=>/^[a-z_][a-z0-9_]*$/.test(p)));const [state]=await q('SELECT last_value,is_called FROM '+parts.map(p=>'"'+p+'"').join('.'));const [maximum]=await q('SELECT MAX(id) id FROM battle_monsters');let current=Number(state.last_value),called=state.is_called;assert(Number.isSafeInteger(current));while(current<Number(maximum.id)||(!called&&current<=Number(maximum.id))){const [next]=await q('SELECT nextval($1::regclass) id',[sequence.name]);current=Number(next.id);called=true;}}
  }
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
