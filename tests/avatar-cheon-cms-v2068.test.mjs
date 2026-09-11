import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

const marker='safe_runtime_upgrade_v2068_cheon_avatar_v1';
const coldModule=()=>import(`../functions/_avatar.js?cheon-qa=${crypto.randomUUID()}`);

test('Cheon CMS registration executes atomically against PostgreSQL without releasing or granting it',async t=>{
  const pg=new PGlite();
  let failMarker=false;
  try{
    await pg.exec(`
      CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
      CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
      CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,coin BIGINT);
      INSERT INTO users VALUES(1,'QA','USER',5000000000);
      INSERT INTO app_meta VALUES('avatar_settings_v1','{"mode":"ON","shopEnabled":true,"version":17}',NULL);
    `);
    const client={async query(input){
      const sql=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];
      if(failMarker&&sql.includes('INSERT INTO app_meta')&&values.includes(marker))throw new Error('QA marker write failed');
      const result=await pg.query(sql,values);
      return {...result,rowCount:result.affectedRows??result.rows.length};
    }};
    const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
    const logs=[];
    const deps={authenticate:async()=>({id:1,role:'USER',nickname:'QA'}),requirePermission:async()=>({id:2,role:'OWNER'}),
      readBody:request=>request.json(),json:(body,status=200)=>({body,status}),writeAdminLog:async(...args)=>logs.push(args)};
    let api=await coldModule();
    const call=(path,body)=>api.handleAvatar({env,deps,path,request:new Request(`https://qa.test/api/${path}`,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
    const all=async sql=>(await pg.query(sql)).rows;
    const one=async sql=>(await all(sql))[0];
    let legacy;

    await t.test('admin list includes all three real art paths, but user catalog and purchases remain gated',async()=>{
      const response=await call('admin/avatars');
      assert.equal(response.status,200);
      assert.equal(response.body.avatars.length,15);
      assert.deepEqual(response.body.settings,{mode:'ON',shopEnabled:true,version:17});
      const item=response.body.avatars.find(a=>a.code==='CHEON');
      assert.equal(item.serial,'A-14');assert.equal(item.name,'체온');
      for(const flag of ['active','public','saleEnabled','owned','equipped'])assert.equal(item[flag],false,flag);
      assert.equal(item.acquisitionType,'UNSET');assert.equal(item.coinPrice,null);
      assert.deepEqual(item.effects,[]);assert.deepEqual(item.effect,{type:'',value:0});
      assert.equal(item.lobbyImage,'preview/avatar-cheon-v1/assets/avatar-cheon-lobby-v1-1024.webp');
      assert.equal(item.lobbyMobileImage,'preview/avatar-cheon-v1/assets/avatar-cheon-lobby-v1-640.webp');
      assert.equal(item.equipmentImage,'preview/avatar-cheon-v1/assets/avatar-cheon-equipment-v1-640.webp');
      for(const field of ['lobbyImage','lobbyMobileImage','equipmentImage'])assert.ok(existsSync(new URL(`../${item[field]}`,import.meta.url)));
      const catalog=await call('avatar/catalog');assert.equal(catalog.status,200);
      assert.ok(!catalog.body.avatars.some(a=>a.code==='CHEON'));
      assert.equal((await call('avatar/equip',{avatarCode:'CHEON'})).status,404);
      assert.equal((await call('avatar/purchase',{avatarCode:'CHEON',requestId:'cheon-qa-purchase'})).status,404);
      for(const table of ['avatar_user_ownership_v1','avatar_user_loadout_v1','avatar_purchase_receipts_v1'])assert.equal(Number((await one(`SELECT COUNT(*) n FROM ${table}`)).n),0);
      assert.equal(Number((await one('SELECT coin FROM users WHERE id=1')).coin),5000000000);
      assert.equal(logs.length,0);
      legacy=await all("SELECT * FROM avatar_catalog_v1 WHERE code<>'CHEON' ORDER BY code");
    });

    await t.test('CMS edits are saved normally and survive a cold-start seed replay',async()=>{
      const saved=await call('admin/avatars',{action:'SAVE_AVATAR',code:'CHEON',version:1,
        acquisitionType:'EVENT',coinPrice:null,sourceLabel:'QA event',sourceDetail:'QA configured later',
        effects:[{type:'COIN_GAIN_PERCENT',value:9}],sortOrder:131,active:true,public:false,saleEnabled:false});
      assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.avatar.version,2);
      const before=await one("SELECT * FROM avatar_catalog_v1 WHERE code='CHEON'");
      const effects=await all("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code='CHEON'");
      await pg.query('DELETE FROM app_meta WHERE key=$1',[marker]);
      api=await coldModule();await api.ensureAvatarFoundation(env);
      assert.deepEqual(await one("SELECT * FROM avatar_catalog_v1 WHERE code='CHEON'"),before);
      assert.deepEqual(await all("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code='CHEON'"),effects);
      assert.deepEqual(await all("SELECT * FROM avatar_catalog_v1 WHERE code<>'CHEON' ORDER BY code"),legacy);
      assert.equal(Number((await one("SELECT COUNT(*) n FROM avatar_catalog_v1 WHERE code='CHEON'")).n),1);
      assert.equal(logs.length,1);
    });

    await t.test('marker failure rolls back insertion and permits a clean retry',async()=>{
      await pg.exec("DELETE FROM avatar_effect_options_v1 WHERE avatar_code='CHEON'; DELETE FROM avatar_catalog_v1 WHERE code='CHEON';");
      await pg.query('DELETE FROM app_meta WHERE key=$1',[marker]);
      api=await coldModule();failMarker=true;
      await assert.rejects(api.ensureAvatarFoundation(env),/QA marker write failed/);
      assert.equal(Number((await one("SELECT COUNT(*) n FROM avatar_catalog_v1 WHERE code='CHEON'")).n),0);
      assert.equal((await pg.query('SELECT value FROM app_meta WHERE key=$1',[marker])).rows.length,0);
      failMarker=false;await api.ensureAvatarFoundation(env);
      assert.equal(Number((await one("SELECT COUNT(*) n FROM avatar_catalog_v1 WHERE code='CHEON'")).n),1);
      assert.equal((await pg.query('SELECT value FROM app_meta WHERE key=$1',[marker])).rows[0].value,'1');
      assert.deepEqual(await all("SELECT * FROM avatar_catalog_v1 WHERE code<>'CHEON' ORDER BY code"),legacy);
      assert.equal((await one("SELECT value FROM app_meta WHERE key='avatar_settings_v1'")).value,'{"mode":"ON","shopEnabled":true,"version":17}');
    });
  }finally{await pg.close();}
});
