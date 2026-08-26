import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { ensureAvatarFoundation, avatarFeatureAccess } from '../functions/_avatar.js';

test('avatar foundation seeds ten hidden unsold records and upgrades multi effects without overwriting settings', async () => {
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
  assert.equal(seedStatements.length,10);
  assert.equal(schema.length,16);
  assert.match(schema[0],/created_at TEXT NOT NULL DEFAULT to_char\(timezone\('UTC',CURRENT_TIMESTAMP\)/);
  assert.match(schema[1],/user_id BIGINT NOT NULL/);
  assert.ok(seedStatements.every(statement=>statement.sql.includes("'UNSET',NULL,'',''")));
  assert.ok(seedStatements.every(statement=>statement.sql.includes('?,?,0,0,0,?')));
  assert.ok(schema.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS avatar_effect_options_v1')));
  assert.equal(prepared.filter(statement=>statement.sql.includes('UPDATE avatar_catalog_v1 SET equipment_image')).length,10);
  assert.ok(prepared.some(statement=>statement.sql.includes('ON CONFLICT(avatar_code,option_order) DO NOTHING')));
  assert.deepEqual(access,{mode:'OFF',visible:false,ownerTest:false,shopEnabled:false,version:1});
});
test('live avatar route is gated and wired through both V21 routers', async () => {
  const [app,exact,runtime,server,chief,loadout]=await Promise.all([
    readFile(new URL('../js/app.js',import.meta.url),'utf8'),
    readFile(new URL('../js/soopketmon-v21-exact-shell-adapter.js',import.meta.url),'utf8'),
    readFile(new URL('../js/soopketmon-v21-runtime-router.js',import.meta.url),'utf8'),
    readFile(new URL('../functions/_avatar.js',import.meta.url),'utf8'),
    readFile(new URL('../functions/_chief.js',import.meta.url),'utf8'),
    readFile(new URL('../js/character-loadout-v2.js',import.meta.url),'utf8')
  ]);
  assert.match(app,/if\(tab==='avatar'&&!avatarFeatureVisible\(\)\)tab='buy'/);
  assert.match(exact,/avatar:\s*\['아바타'/);
  assert.match(exact,/route==='avatar'&&global\.avatarFeatureVisible/);
  assert.match(runtime,/avatar:\s*\{ shell: 'avatar' \}/);
  assert.match(server,/code:'AVATAR_FEATURE_OFF'/);
  assert.match(server,/AVATAR_EQUIP_COOLDOWN_MS=24\*60\*60\*1000/);
  assert.match(server,/COIN_GAIN_PERCENT'\?50/);
  assert.match(server,/avatar_effect_options_v1/);
  assert.match(server,/effects:effectOptions/);
  assert.match(chief,/viewer_avatar_code/);
  assert.match(chief,/viewerAvatar:a\.viewerAvatar\|\|null/);
  assert.match(exact,/viewerAvatar: chief\.viewerAvatar \|\| null/);
  assert.match(exact,/chiefPictureMarkup\(chief, true, true\)/);
  assert.match(loadout,/avatar\?\.equipmentImage \? '' : '<div class="clv2-armory-backdrop"/);
});
