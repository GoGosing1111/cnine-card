import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { ensureAvatarFoundation, avatarFeatureAccess, applyAvatarCoinGain, applyAvatarRaidEntryBonus } from '../functions/_avatar.js';

test('avatar foundation seeds eleven hidden unsold records including Dimwoos without overwriting settings', async () => {
  const prepared=[],schema=[];
  const db={
    dialect:'postgres',
    async execSchema(statements){schema.push(...statements)},
    prepare(sql){
      const statement={sql:String(sql),values:[],bind(...values){this.values=values;return this},async first(){
        if(this.sql.includes('SELECT value FROM app_meta')&&this.values[0]==='safe_runtime_upgrade_v1863_avatar_catalog_v1')return null;
        if(this.sql.includes('SELECT value FROM app_meta')&&this.values[0]==='avatar_settings_v1')return{value:'{"mode":"OFF","shopEnabled":false,"version":1}'};
        return null;
      },async run(){return{meta:{changes:1}}},async all(){return{results:[]}}};
      prepared.push(statement);return statement;
    },
    async batch(statements){return statements.map(()=>({meta:{changes:1},results:[]}))}
  };
  const env={DB:db};
  await ensureAvatarFoundation(env);
  const access=await avatarFeatureAccess(env,{id:1,role:'OWNER'},{fresh:true});
  const seedStatements=prepared.filter(statement=>statement.sql.includes('INSERT INTO avatar_catalog_v1'));
  const legacySeedStatements=seedStatements.filter(statement=>!statement.values.includes('DIMWOOS_ESPORTS_ACE'));
  assert.equal(seedStatements.length,11);
  assert.equal(legacySeedStatements.length,10);
  assert.equal(schema.length,17);
  assert.match(schema[0],/created_at TEXT NOT NULL DEFAULT to_char\(timezone\('UTC',CURRENT_TIMESTAMP\)/);
  assert.match(schema[1],/user_id BIGINT NOT NULL/);
  assert.ok(legacySeedStatements.every(statement=>statement.sql.includes("'UNSET',NULL,'',''")));
  assert.ok(legacySeedStatements.every(statement=>statement.sql.includes('?,?,0,0,0,?')));
  assert.ok(schema.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS avatar_effect_options_v1')));
  assert.ok(schema.some(sql=>sql.includes('ALTER TABLE avatar_user_ownership_v1 ADD COLUMN IF NOT EXISTS expires_at TEXT')));
  const equipmentUpdates=prepared.filter(statement=>statement.sql.includes('UPDATE avatar_catalog_v1 SET equipment_image'));
  assert.equal(equipmentUpdates.length,30);
  assert.equal(equipmentUpdates.filter(statement=>String(statement.values[0]||'').includes('/equipment-v2/')).length,10);
  assert.equal(equipmentUpdates.filter(statement=>String(statement.values[0]||'').includes('/equipment-v3/')).length,10);
  const dimwoosSeed=seedStatements.find(statement=>statement.values.includes('DIMWOOS_ESPORTS_ACE'));
  assert.ok(dimwoosSeed);
  assert.ok(dimwoosSeed.values.includes('딤우스'));
  assert.ok(dimwoosSeed.values.includes('assets/ui/avatars-v1/equipment-v3/avatar-f08-ember-esports-ace-equipment-v1-640.webp'));
  assert.ok(prepared.some(statement=>statement.values.includes('safe_runtime_upgrade_v1985_dimwoos_avatar_v1')));
  assert.ok(prepared.some(statement=>statement.values.includes('safe_runtime_upgrade_v1867_avatar_equipment_alpha_v2')));
  assert.ok(prepared.some(statement=>statement.values.includes('safe_runtime_upgrade_v1870_avatar_equipment_alpha_v3')));
  assert.ok(prepared.some(statement=>statement.sql.includes('ON CONFLICT(avatar_code,option_order) DO NOTHING')));
  assert.deepEqual(access,{mode:'OFF',visible:false,ownerTest:false,shopEnabled:false,version:1});
});
test('avatar coin gain stacks after burning and hyper burning reward multiplication', () => {
  const avatar={effects:[{type:'RAID_EXTRA_ENTRY',value:7},{type:'COIN_GAIN_PERCENT',value:50}]};
  assert.deepEqual(applyAvatarCoinGain(5000,avatar),{base:5000,percent:50,bonus:2500,total:7500});
  assert.deepEqual(applyAvatarCoinGain(2500,{type:'COIN_GAIN_PERCENT',value:20}),{base:2500,percent:20,bonus:500,total:3000});
  assert.deepEqual(applyAvatarCoinGain(5000,{effects:[{type:'BATTLE_POWER_PERCENT',value:10}]}),{base:5000,percent:0,bonus:0,total:5000});
  assert.deepEqual(applyAvatarCoinGain(1000,{type:'COIN_GAIN_PERCENT',value:999}),{base:1000,percent:50,bonus:500,total:1500});
});
test('equipped avatar raid effect increases the usable daily and slot entry limits', () => {
  const avatar={effects:[{type:'COIN_GAIN_PERCENT',value:20},{type:'RAID_EXTRA_ENTRY',value:7}]};
  assert.deepEqual(applyAvatarRaidEntryBonus(6,avatar),{base:6,bonus:7,limit:13});
  assert.deepEqual(applyAvatarRaidEntryBonus(3,avatar),{base:3,bonus:7,limit:10});
  assert.deepEqual(applyAvatarRaidEntryBonus(6,{effects:[{type:'BATTLE_POWER_PERCENT',value:10}]}),{base:6,bonus:0,limit:6});
  assert.deepEqual(applyAvatarRaidEntryBonus(99,{type:'RAID_EXTRA_ENTRY',value:999}),{base:99,bonus:20,limit:119});
});
test('all eleven final equipment avatars ship as defringed versioned WebP files with real alpha', async () => {
  const directory=new URL('../assets/ui/avatars-v1/equipment-v3/',import.meta.url);
  const files=(await readdir(directory)).filter(name=>name.endsWith('.webp')).sort();
  assert.equal(files.length,11);
  for(const filename of files){
    const url=new URL(filename,directory),header=await readFile(url),metadata=await stat(url);
    assert.equal(header.subarray(0,4).toString('ascii'),'RIFF',`${filename} is not RIFF`);
    assert.equal(header.subarray(8,16).toString('ascii'),'WEBPVP8X',`${filename} is not extended WebP`);
    assert.equal(header[20]&0x10,0x10,`${filename} has no alpha flag`);
    assert.ok(metadata.size>50000,`${filename} looks truncated`);
    const {data,info}=await sharp(fileURLToPath(url)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,640,`${filename} width changed`);
    assert.equal(info.height,960,`${filename} height changed`);
    let visible=0,whiteFringe=0;
    for(let offset=0;offset<data.length;offset+=4){
      const alpha=data[offset+3];
      if(alpha<=8)continue;
      visible++;
      const red=data[offset],green=data[offset+1],blue=data[offset+2];
      if(alpha<245&&Math.min(red,green,blue)>190&&Math.max(red,green,blue)-Math.min(red,green,blue)<28)whiteFringe++;
    }
    assert.ok(visible>100000,`${filename} lost its character silhouette`);
    assert.ok(whiteFringe<=10,`${filename} retains ${whiteFringe} bright matte pixels`);
  }
});
test('live avatar route is gated and wired through both V21 routers', async () => {
  const [app,exact,runtime,server,battleApi,chief,loadout,avatarCss,lobbyCss,index,serviceWorker]=await Promise.all([
    readFile(new URL('../js/app.js',import.meta.url),'utf8'),
    readFile(new URL('../js/soopketmon-v21-exact-shell-adapter.js',import.meta.url),'utf8'),
    readFile(new URL('../js/soopketmon-v21-runtime-router.js',import.meta.url),'utf8'),
    readFile(new URL('../functions/_avatar.js',import.meta.url),'utf8'),
    readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),
    readFile(new URL('../functions/_chief.js',import.meta.url),'utf8'),
    readFile(new URL('../js/character-loadout-v2.js',import.meta.url),'utf8'),
    readFile(new URL('../css/avatar-shop-v1.css',import.meta.url),'utf8'),
    readFile(new URL('../css/soopketmon-v21-exact-luxury.css',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../service-worker.js',import.meta.url),'utf8')
  ]);
  assert.match(app,/if\(tab==='avatar'&&!avatarFeatureVisible\(\)\)tab='buy'/);
  assert.match(exact,/avatar:\s*Object\.freeze\(\{ title: '아바타'/);
  assert.match(exact,/route==='avatar'&&global\.avatarFeatureVisible/);
  assert.match(runtime,/avatar:\s*\{ shell: 'avatar' \}/);
  assert.match(server,/code:'AVATAR_FEATURE_OFF'/);
  assert.match(server,/AVATAR_EQUIP_COOLDOWN_MS=24\*60\*60\*1000/);
  assert.match(server,/COIN_GAIN_PERCENT'\?50/);
  assert.match(server,/avatar_effect_options_v1/);
  assert.match(server,/effects:effectOptions/);
  assert.match(server,/safe_runtime_upgrade_v1867_avatar_equipment_alpha_v2/);
  assert.match(server,/safe_runtime_upgrade_v1870_avatar_equipment_alpha_v3/);
  assert.match(server,/safe_runtime_upgrade_v1917_avatar_ownership_expiry_v1/);
  assert.match(server,/safe_runtime_upgrade_v1985_dimwoos_avatar_v1/);
  assert.match(server,/o\.expires_at IS NULL OR o\.expires_at>CURRENT_TIMESTAMP/);
  assert.match(server,/expiresAt:row\.expires_at\|\|null/);
  assert.match(server,/expires_at=CASE WHEN avatar_user_ownership_v1\.expires_at IS NULL OR excluded\.expires_at IS NULL THEN NULL/);
  assert.match(server,/assets\/ui\/avatars-v1\/equipment-v3\//);
  assert.match(battleApi,/applyAvatarCoinGain\(eventReward,avatarEffect\)/);
  assert.match(battleApi,/applyAvatarCoinGain\(attackerEventCoinReward,aAvatarEffect\)/);
  assert.match(battleApi,/applyAvatarRaidEntryBonus\(cfg\.dailyEntries,avatarEffect\)/);
  assert.match(battleApi,/applyAvatarRaidEntryBonus\(instanceCfg\.dailyEntries,avatarEffect\)/);
  assert.match(battleApi,/avatarEffect,[^}]*collectBattleLog/);
  assert.match(chief,/viewer_avatar_code/);
  assert.match(chief,/vo\.expires_at IS NULL OR vo\.expires_at>CURRENT_TIMESTAMP/);
  assert.match(chief,/viewerAvatar:a\.viewerAvatar\|\|null/);
  assert.match(exact,/viewerAvatar: chief\.viewerAvatar \|\| null/);
  assert.match(exact,/chiefPictureMarkup\(chief, true, true\)/);
  assert.match(loadout,/<div class="clv2-armory-backdrop" aria-hidden="true"><\/div>/);
  assert.match(loadout,/<div class="clv2-reactor" aria-hidden="true">/);
  assert.doesNotMatch(loadout,/avatar\?\.equipmentImage \? '' : '<div class="clv2-armory-backdrop"/);
  assert.match(avatarCss,/\.avs1-effect-module strong \{[^}]*font-size: 15px;[^}]*white-space: nowrap;/);
  assert.match(avatarCss,/grid-template-columns: 23px 94px minmax\(0, 1fr\)/);
  assert.match(lobbyCss,/@media \(min-width:1600px\)[\s\S]*?\.game-frame\[data-route="home"\] \.pc-main-navigation/);
  assert.match(index,/app\.js\?v=2000-prediction-cap-500m/);
  assert.match(index,/soopketmon-v21-exact-shell-adapter\.js\?v=21\.19\.0-refresh-home-sticky/);
  assert.match(serviceWorker,/soop-card-shell-v2000-prediction-cap-500m/);
});
