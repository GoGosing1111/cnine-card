import assert from 'node:assert/strict';
import {BOSSES,apocalypseTrioLiveProfile} from '../../shared/apocalypse-trio-v1.mjs';
import {normalizeApocalypseSettings,pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';
import approval from '../../docs/qa/apocalypse-trio-live-20261106/approval.json' with {type:'json'};
export const OPERATION_KEY='ops:apocalypse-trio-live:20261106:v1';
export async function registerApocalypseTrio(client,{commit=false,assets=[],expectedReference}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 // A completed request is SELECT-only. Normal later CMS edits are never reset.
 const replay=async()=>{
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(!prior)return null;
  const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
  const rows=await q('SELECT id,name FROM battle_monsters WHERE id=ANY($1::bigint[]) ORDER BY id',[BOSSES.map(b=>b.monsterId)]);
  assert.deepEqual(rows.map(r=>[Number(r.id),r.name]),BOSSES.map(b=>[b.monsterId,b.name]));return {...receipt,replayed:true};
 };
 const completed=await replay();if(completed)return completed;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const prior=await replay();if(prior){await client.query('ROLLBACK');return prior;}
  const [meta]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1' FOR UPDATE");assert(meta,'Missing apocalypse settings');
  const settings=JSON.parse(meta.value),before=structuredClone(settings),reference=settings.monsterProfiles?.['80'];
  assert.equal(settings.enabled,true,'Do not override the CMS OFF switch');assert(reference,'Sahyeon profile missing');
  assert(expectedReference,'Read-only reference snapshot required');assert.deepEqual(reference,expectedReference,'Sahyeon CMS changed after review');
  assert.equal(approval.visualApproval,true);assert.equal(approval.authorization,'3개 이름짓고 라이브반영하자');
  assert.deepEqual(approval.ids,BOSSES.map(b=>b.monsterId));assert.deepEqual(approval.names,BOSSES.map(b=>b.name));
  if(commit){
   for(const file of approval.assets)assert(assets.some(a=>a.path===file.path&&a.sha256===file.sha256&&a.verified),'Published approved asset not verified: '+file.path);
   for(const file of ['/preview/project-v-v3/project-v-pixi-battle.bundle.js','/js/battle-v3-live.js','/shared/apocalypse-trio-v1.mjs'])assert(assets.some(a=>a.path===file&&a.verified&&/^[a-f0-9]{64}$/.test(a.sha256)),'Published live runtime not verified: '+file);
  }
  await q('LOCK TABLE battle_monsters IN SHARE ROW EXCLUSIVE MODE');
  const [anchor]=await q("SELECT id,pve_display_order FROM battle_monsters WHERE id=80 AND pve_tab='APOCALYPSE' FOR SHARE");assert(anchor);
  const existing=await q('SELECT id FROM battle_monsters WHERE id=ANY($1::bigint[]) OR name=ANY($2::text[])',[BOSSES.map(b=>b.monsterId),BOSSES.map(b=>b.name)]);assert.equal(existing.length,0,'Existing monster ID or name; no overwrite');
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner,'Audit owner missing');
  const [order]=await q("SELECT MAX(pve_display_order) AS n FROM battle_monsters WHERE pve_tab='APOCALYPSE'");
  const registered=[];
  for(const [index,boss] of BOSSES.entries()){
   assert.equal(settings.monsterProfiles[String(boss.monsterId)],undefined,'Existing CMS profile; no overwrite');
   const profile=apocalypseTrioLiveProfile(boss,reference),displayOrder=Number(order.n||anchor.pve_display_order)+index+1;
   const normalized=normalizeApocalypseSettings({enabled:true,monsterProfiles:{[boss.monsterId]:profile}}).monsterProfiles[boss.monsterId];
   for(const key of ['battlePower','rewardCoin','rewardPercent','clearBonus','legionUltimate','battleSuitSkillDefensePercent'])assert.deepEqual(normalized[key],profile[key],'CMS would clamp '+key);
   const rows=await q(`INSERT INTO battle_monsters(id,name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,ultimate_enabled,ultimate_name,ultimate_description)
    VALUES($1,$2,$3,$4,$5,1,1,$6,'BOSS','APOCALYPSE',$6,1,0,0,0,$7,$8) RETURNING id,name`,[boss.monsterId,boss.name,boss.sourceArt.slice(1),profile.battlePower,profile.rewardCoin,displayOrder,boss.skills[2].name,profile.skillDescription]);assert.equal(rows.length,1);
   settings.monsterProfiles[String(boss.monsterId)]=profile;
   const runtime=pveDifficultyRuntime({apocalypse:settings},{id:boss.monsterId,pve_tab:'APOCALYPSE',is_boss:1});assert.equal(runtime.effectiveRewardCoin,boss.clearRewards.coin);
   registered.push({id:boss.monsterId,name:boss.name,subtitle:boss.subtitle,battlePower:profile.battlePower,displayOrder,profile,effectiveRewardCoin:runtime.effectiveRewardCoin,minions:6});
  }
  const preserved=structuredClone(settings);for(const b of BOSSES)delete preserved.monsterProfiles[String(b.monsterId)];assert.deepEqual(preserved,before);
  assert.equal((await q("UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key='battle_apocalypse_settings_v1' RETURNING key",[JSON.stringify(settings)])).length,1);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,authorization:approval.authorization,rewardAuthorization:approval.rewardAuthorization,registered,reference:{monsterId:80,profile:reference},assets,completedAt:new Date().toISOString()};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'APOCALYPSE_BOSSES_REGISTER','MONSTER','81,82,83',JSON.stringify({settings:before}),JSON.stringify(receipt)]);assert(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
  const [saved]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1'");assert.deepEqual(JSON.parse(saved.value),settings);
  if(commit){
   const [sequence]=await q("SELECT pg_get_serial_sequence('battle_monsters','id') name");
   if(sequence?.name){const parts=sequence.name.split('.');assert(parts.every(p=>/^[a-z_][a-z0-9_]*$/.test(p)));const [state]=await q('SELECT last_value,is_called FROM '+parts.map(p=>'"'+p+'"').join('.'));const [maximum]=await q('SELECT MAX(id) id FROM battle_monsters');let current=Number(state.last_value),called=state.is_called;assert(Number.isSafeInteger(current));assert(Number(maximum.id)-current<10000,'Unexpected sequence gap');while(current<Number(maximum.id)||(!called&&current<=Number(maximum.id))){const [next]=await q('SELECT nextval($1::regclass) id',[sequence.name]);current=Number(next.id);called=true;}}
  }
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
