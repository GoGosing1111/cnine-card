import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:nightmare-akaza-release:20261007:v1';
export const AKAZA=Object.freeze({
  monsterId:79,name:'아카자',predecessorId:70,battlePower:1800000,
  sourceArt:'assets/ui/project-v/monsters/nightmare-akaza-v1/akaza-source-v1.png',
  battleSprite:'assets/ui/project-v/monsters/nightmare-akaza-v1/akaza-sd-v1.png'
});
const SETTINGS_KEY='battle_nightmare_settings_v1';
const query=async(client,sql,values=[])=>(await client.query(sql,values)).rows;

export async function registerNightmareAkaza(client,{commit=false,assets=[]}={}){
  await client.query('BEGIN');
  try{
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='20s'");
    await query(client,'SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
    const [prior]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
    if(prior){
      const receipt=JSON.parse(prior.value);
      assert.equal(receipt.status,'COMPLETED');
      const [saved]=await query(client,'SELECT name,pve_tab,image_url FROM battle_monsters WHERE id=$1',[AKAZA.monsterId]);
      assert.equal(saved?.name,AKAZA.name);assert.equal(saved.pve_tab,'NIGHTMARE');assert.equal(saved.image_url,AKAZA.sourceArt);
      await client.query('ROLLBACK');return {...receipt,replayed:true};
    }
    const [meta]=await query(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[SETTINGS_KEY]);
    assert.ok(meta,'Nightmare CMS settings missing');
    const settings=JSON.parse(meta.value),before=structuredClone(settings),reference=settings.bossProfiles?.[String(AKAZA.predecessorId)];
    assert.equal(settings.enabled,true,'Preserve the CMS OFF switch');
    assert.equal(reference?.battlePower,1450000,'Gold Roger changed; review progression');
    assert.ok(AKAZA.battlePower>reference.battlePower);
    await client.query('LOCK TABLE battle_monsters IN SHARE ROW EXCLUSIVE MODE');
    const [anchor]=await query(client,'SELECT * FROM battle_monsters WHERE id=$1 FOR SHARE',[AKAZA.predecessorId]);
    assert.equal(anchor?.name,'골 D. 로저');assert.equal(anchor.pve_tab,'NIGHTMARE');
    assert.equal(Number(anchor.is_active),1);assert.equal(Number(anchor.pve_enabled),1);
    const duplicate=await query(client,"SELECT id FROM battle_monsters WHERE id=$1 OR (name=$2 AND pve_tab='NIGHTMARE')",[AKAZA.monsterId,AKAZA.name]);
    assert.equal(duplicate.length,0,'Existing Akaza or occupied ID; do not overwrite');
    assert.equal(settings.bossProfiles?.[String(AKAZA.monsterId)],undefined,'Existing profile; do not overwrite');
    const [later]=await query(client,"SELECT COUNT(*) n FROM battle_monsters WHERE pve_tab='NIGHTMARE' AND is_active=1 AND pve_display_order>$1",[anchor.pve_display_order]);
    assert.equal(Number(later.n),0,'Gold Roger must still be the last Nightmare boss');
    const [owner]=await query(client,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");
    assert.ok(owner,'Audit owner missing');
    if(commit)for(const path of [AKAZA.sourceArt,AKAZA.battleSprite]){
      assert.ok(assets.some(a=>a.path===path&&a.verified===true&&/^[a-f0-9]{64}$/i.test(a.sha256)),'Published asset not verified: '+path);
    }
    const ultimate=Object.fromEntries(Object.entries(anchor).filter(([key])=>key.startsWith('ultimate_')));
    Object.assign(ultimate,{ultimate_name:'나이트메어 궁극기',ultimate_description:'나이트메어 공통 궁극기',ultimate_media_url:'',ultimate_sound_url:'',ultimate_duration_ms:2400});
    const row={
      id:AKAZA.monsterId,name:AKAZA.name,image_url:AKAZA.sourceArt,battle_power:AKAZA.battlePower,reward_coin:reference.rewardCoin,
      is_boss:1,is_active:1,sort_order:Number(anchor.sort_order)+1,monster_category:'BOSS',pve_tab:'NIGHTMARE',
      pve_display_order:Number(anchor.pve_display_order)+1,pve_enabled:1,tower_enabled:0,tower_only:0,...ultimate
    };
    const columns=Object.keys(row);assert.ok(columns.every(c=>/^[a-z_]+$/.test(c)));
    const inserted=await query(client,'INSERT INTO battle_monsters('+columns.join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING id,name',Object.values(row));
    assert.equal(inserted.length,1);
    settings.bossProfiles[String(AKAZA.monsterId)]={...reference,battlePower:AKAZA.battlePower};
    const preserved=structuredClone(settings);delete preserved.bossProfiles[String(AKAZA.monsterId)];assert.deepEqual(preserved,before);
    assert.equal((await query(client,'UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 RETURNING key',[JSON.stringify(settings),SETTINGS_KEY])).length,1);
    const receipt={
      status:'COMPLETED',operationKey:OPERATION_KEY,authorization:'나이트메어 골드로저 다음 보스. 공통 궁극기 사용, SD리소스만 만들어서 올리면돼.',
      registered:{id:AKAZA.monsterId,name:AKAZA.name,predecessorId:AKAZA.predecessorId,displayOrder:row.pve_display_order,profile:settings.bossProfiles[String(AKAZA.monsterId)],ultimate},
      assets,completedAt:new Date().toISOString()
    };
    const [audit]=await query(client,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [owner.id,'NIGHTMARE_BOSS_REGISTER','MONSTER',String(AKAZA.monsterId),JSON.stringify({settings:before,anchorId:anchor.id}),JSON.stringify(receipt)]);
    assert.ok(audit);receipt.adminLogId=String(audit.id);
    assert.equal((await query(client,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
    assert.deepEqual(JSON.parse((await query(client,'SELECT value FROM app_meta WHERE key=$1',[SETTINGS_KEY]))[0].value),settings);
    if(commit){
      const [seq]=await query(client,"SELECT pg_get_serial_sequence('battle_monsters','id') name");
      if(seq?.name){
        const parts=seq.name.split('.');assert.ok(parts.every(p=>/^[a-z_][a-z0-9_]*$/.test(p)));
        const [state]=await query(client,'SELECT last_value,is_called FROM '+parts.map(p=>'"'+p+'"').join('.'));
        const max=Number((await query(client,'SELECT MAX(id) id FROM battle_monsters'))[0].id);
        let current=Number(state.last_value),called=state.is_called;
        while(current<max||(!called&&current<=max)){current=Number((await query(client,'SELECT nextval($1::regclass) id',[seq.name]))[0].id);called=true;}
      }
    }
    await client.query(commit?'COMMIT':'ROLLBACK');
    return {...receipt,committed:commit,replayed:false};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
