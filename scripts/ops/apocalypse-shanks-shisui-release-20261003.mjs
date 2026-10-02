import assert from 'node:assert/strict';
import {APOCALYPSE_SHANKS_SHISUI_BOSSES as BOSSES} from '../../shared/apocalypse-shanks-shisui-v1.mjs';
export const OPERATION_KEY='ops:apocalypse-shanks-shisui-release:20261003:v1';
export async function registerShanksShisui(client,{commit=false,assets=[]}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');const rows=await q('SELECT id,name FROM battle_monsters WHERE id=ANY($1::bigint[]) ORDER BY id',[BOSSES.map(b=>b.monsterId)]);assert.deepEqual(rows.map(r=>({id:Number(r.id),name:r.name})),BOSSES.map(b=>({id:b.monsterId,name:b.name})));await client.query('ROLLBACK');return {...receipt,replayed:true};}
  const [meta]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1' FOR UPDATE");assert.ok(meta,'Missing apocalypse settings');
  await q('LOCK TABLE battle_monsters IN SHARE ROW EXCLUSIVE MODE');
  const settings=JSON.parse(meta.value),before=structuredClone(settings),reference=settings.monsterProfiles?.['76'];
  assert.equal(settings.enabled,true,'Do not override the CMS OFF switch');assert.ok(reference&&Number(reference.battlePower)>0);
  assert.ok(BOSSES.every(b=>b.battlePower>Number(reference.battlePower)),'Kaneki power changed: review progression');
  const currentUltimate=Number(reference.legionUltimate?.attackPercent??225);
  assert.ok(BOSSES.every(b=>b.skills[2].attackPercent>currentUltimate),'Kaneki ultimate changed: review progression');
  const [anchor]=await q("SELECT id,name,pve_display_order,sort_order FROM battle_monsters WHERE id=76 AND pve_tab='APOCALYPSE' FOR SHARE");assert.equal(anchor?.name,'카네키 켄');
  const existing=await q("SELECT id FROM battle_monsters WHERE id=ANY($1::bigint[]) OR (pve_tab='APOCALYPSE' AND name=ANY($2::text[]))",[BOSSES.map(b=>b.monsterId),BOSSES.map(b=>b.name)]);assert.equal(existing.length,0,'Existing ID or apocalypse boss; no overwrite');
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Audit owner missing');
  if(commit)for(const boss of BOSSES)for(const path of [boss.sourceArt,boss.battleSprite,...boss.skills.flatMap(s=>[s.atlas,s.atlas.replace('-atlas.json','-sheet.png')])])assert.ok(assets.some(a=>a.path===path&&a.verified===true&&/^[a-f0-9]{64}$/.test(a.sha256)),'Published asset not verified: '+path);
  const registered=[];
  for(const [index,boss] of BOSSES.entries()){
   assert.equal(settings.monsterProfiles?.[String(boss.monsterId)],undefined,'Existing CMS profile; no overwrite');
   const description=`보스 + 쫄몹 6마리. 첫 3행동에 봉인·회복 차단·궁극기. 배틀슈트 스킬 피해 ${boss.battleSuitSkillDefensePercent}% 감소.`;
   const row=await q(`INSERT INTO battle_monsters(id,name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,ultimate_enabled,ultimate_name,ultimate_description)
    VALUES($1,$2,$3,$4,$5,1,1,$6,'BOSS','APOCALYPSE',$7,1,0,0,0,$8,$9) RETURNING id,name`,[boss.monsterId,boss.name,boss.sourceArt.slice(1),boss.battlePower,reference.rewardCoin,Number(anchor.sort_order??anchor.pve_display_order)+index+1,Number(anchor.pve_display_order)+index+1,boss.skills[2].name,description]);assert.equal(row.length,1);
   settings.monsterProfiles[String(boss.monsterId)]={...reference,battlePower:boss.battlePower,skillEnabled:true,skillName:boss.skills.map(s=>s.name).join(' · ').slice(0,60),skillDescription:description,legionUltimate:{enabled:true,attackPercent:boss.skills[2].attackPercent,shieldPiercePercent:boss.skills[2].shieldPiercePercent},battleSuitSkillDefensePercent:boss.battleSuitSkillDefensePercent};
   registered.push({id:boss.monsterId,name:boss.name,battlePower:boss.battlePower,ultimate:settings.monsterProfiles[String(boss.monsterId)].legionUltimate,battleSuitSkillDefensePercent:boss.battleSuitSkillDefensePercent,minions:6,rewardCoin:reference.rewardCoin,rewardPercent:reference.rewardPercent});
  }
  for(const [key,value] of Object.entries(before.monsterProfiles))assert.deepEqual(settings.monsterProfiles[key],value);
  const withoutNew=structuredClone(settings);for(const boss of BOSSES)delete withoutNew.monsterProfiles[String(boss.monsterId)];assert.deepEqual(withoutNew,before,'Unrelated CMS settings changed');
  assert.equal((await q("UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key='battle_apocalypse_settings_v1' RETURNING key",[JSON.stringify(settings)])).length,1);
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,registered,reference:{monsterId:76,battlePower:reference.battlePower,ultimateAttackPercent:currentUltimate},assets,authorization:'샹크스·우치하 시스이를 카네키 켄보다 강한 아포칼립스 보스로 추가. 시스이가 더 상급. SD·전용 스킬·기믹·쫄몹 및 별도 배틀슈트 스킬 방어 스탯.',completedAt:new Date().toISOString()};
  if(commit){
   const [sequence]=await q("SELECT pg_get_serial_sequence('battle_monsters','id') name");
   if(sequence?.name){
    const parts=sequence.name.split('.');assert.ok(parts.every(p=>/^[a-z_][a-z0-9_]*$/.test(p)),'Unexpected sequence identifier');
    const [state]=await q('SELECT last_value,is_called FROM '+parts.map(p=>'"'+p+'"').join('.'));
    const [maximum]=await q('SELECT MAX(id) id FROM battle_monsters');
    let current=Number(state.last_value),called=state.is_called;
    const max=Number(maximum.id);assert.ok(Number.isSafeInteger(current)&&Number.isSafeInteger(max));
    // nextval is monotonic, including concurrent allocations. Never rewind via setval.
    // PostgreSQL sequence gaps survive a rollback; no game rows survive a failure.
    while(current<max||(!called&&current<=max)){const [next]=await q('SELECT nextval($1::regclass) id',[sequence.name]);current=Number(next.id);called=true;}
    receipt.monsterIdSequence={name:sequence.name,before:Number(state.last_value),after:current};
   }
  }
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'APOCALYPSE_BOSSES_REGISTER','MONSTER','77,78',JSON.stringify({settings:before}),JSON.stringify(receipt)]);assert.ok(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
  const [saved]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1'");assert.deepEqual(JSON.parse(saved.value),settings);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
