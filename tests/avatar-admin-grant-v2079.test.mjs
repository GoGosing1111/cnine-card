import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {avatarGrantInput,handleAvatarAdminGrant} from '../functions/_avatar_admin_grant.js';
import {AvatarGrantSession,grantNicknames} from '../admin/avatar-grant.js';
import {handleAvatar} from '../functions/_avatar.js';
import {readFileSync} from 'node:fs';

const NOW=Date.parse('2026-09-10T01:00:00Z');
async function fixture(){
  const pg=new PGlite();
  await pg.exec(`
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text,status text,role text,coin bigint);
    INSERT INTO users VALUES(1,'OWNER','ACTIVE','OWNER',100),(2,'QA A','ACTIVE','USER',200),(3,'QA♡','ACTIVE','USER',300),(4,'QA old','ACTIVE','USER',400),(5,'OWNER2','ACTIVE','OWNER',500);
    CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);
    INSERT INTO app_meta VALUES('avatar_settings_v1','{"mode":"OFF","shopEnabled":false}',NULL);
    CREATE TABLE admin_logs(admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);
    CREATE TABLE avatar_catalog_v1(code text PRIMARY KEY,name text,serial text,version int,is_active int,is_public int);
    INSERT INTO avatar_catalog_v1 VALUES('HI_HEEYA','하이희야','A-13',2,1,1),('SECRET','미공개','A-X',1,1,0);
    CREATE TABLE avatar_user_ownership_v1(user_id bigint,avatar_code text,source_type text,source_ref text,acquired_at text,expires_at text,PRIMARY KEY(user_id,avatar_code));
    INSERT INTO avatar_user_ownership_v1 VALUES(3,'HI_HEEYA','EVENT','keep','old',NULL),(4,'HI_HEEYA','EVENT','limited','old','2026-09-20T00:00:00Z');
    CREATE TABLE avatar_user_loadout_v1(user_id bigint PRIMARY KEY,avatar_code text,updated_at text);
    INSERT INTO avatar_user_loadout_v1 VALUES(2,'ANOTHER','yesterday');
  `);
  let fail='';
  const client={async query(input){const sql=typeof input==='string'?input:input.text;if(fail&&sql.includes(fail))throw Error('injected failure');
    const result=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const call=(body,options={})=>handleAvatarAdminGrant({env,admin:{id:options.ownerId||1,role:options.role||'OWNER'},now:options.now??NOW,
    request:new Request('https://qa.test/api/admin/avatars/grant',{method:options.method||'POST',...(options.method==='GET'?{}:{body:JSON.stringify(body)})}),
    deps:{readBody:r=>r.json(),json:(body,status=200)=>({body,status})}});
  const preview=(extra={})=>call({action:'preview',avatarCode:'HI_HEEYA',nicknames:['QA A','QA♡','QA old'],reason:'QA grant',...extra});
  const apply=id=>call({action:'apply',previewId:id,confirmation:'GRANT_PERMANENT_AVATAR'});
  return {pg,call,preview,apply,failOn:s=>{fail=s;},rows:async sql=>(await pg.query(sql)).rows,close:()=>pg.close()};
}

test('exact batch grants are atomic, permanent, audited, replayable and leave catalog/loadout/wallet unchanged',async()=>{
  const f=await fixture();try{
    const tables=['users','avatar_catalog_v1','avatar_user_loadout_v1'];
    const before=await Promise.all(tables.map(t=>f.rows('SELECT * FROM '+t)));
    const p=await f.preview();assert.equal(p.status,200,JSON.stringify(p));
    assert.deepEqual(p.body.recipients.map(u=>u.outcome),['NEW','ALREADY_OWNED','PERMANENT_UPGRADE']);
    assert.equal((await f.rows('SELECT * FROM avatar_user_ownership_v1')).length,2);
    const r=await f.apply(p.body.previewId);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.granted,2);assert.equal(r.body.alreadyOwned,1);
    assert.equal(r.body.loadoutChanged,false);
    assert.deepEqual(await Promise.all(tables.map(t=>f.rows('SELECT * FROM '+t))),before);
    const owned=await f.rows('SELECT * FROM avatar_user_ownership_v1 ORDER BY user_id');assert.equal(owned.length,3);assert.ok(owned.every(o=>o.expires_at===null));
    assert.equal(owned[1].source_ref,'keep');assert.equal(owned[1].acquired_at,'old');
    assert.equal((await f.apply(p.body.previewId)).body.replayed,true);
    assert.equal((await f.call({action:'status',previewId:p.body.previewId})).body.status,'COMPLETED');
    assert.equal((await f.rows('SELECT * FROM admin_logs')).length,1);
    assert.equal((await f.rows("SELECT value FROM app_meta WHERE key='avatar_settings_v1'"))[0].value,'{"mode":"OFF","shopEnabled":false}');
    const p2=await f.preview();assert.equal((await f.apply(p2.body.previewId)).body.granted,0);
  }finally{await f.close();}
});

test('OWNER authentication, exact names, duplicates, hidden avatars and input limits fail closed',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call({action:'preview'},{role:'ADMIN'})).status,403);
    assert.equal((await f.call({action:'preview'},{ownerId:2})).status,403);
    assert.equal((await f.call({},{method:'GET'})).status,405);
    for(const nicknames of [[],['QA'],['QA A','QA A'],['QA A','missing'],Array(31).fill('QA A')])assert.equal((await f.preview({nicknames})).status,400);
    assert.equal((await f.preview({avatarCode:'SECRET'})).status,409);
    assert.equal((await f.preview({reason:''})).status,400);
    await f.pg.exec("INSERT INTO users VALUES(6,'QA A','ACTIVE','USER',600)");
    assert.equal((await f.preview({nicknames:['QA A']})).status,400);
    assert.equal((await f.rows('SELECT * FROM admin_logs')).length,0);
  }finally{await f.close();}
});

test('changed identity/catalog, expired confirmations and foreign-owner requests cannot grant',async()=>{
  const f=await fixture();try{
    const p=(await f.preview()).body,id=p.previewId;
    assert.equal((await f.call({action:'apply',previewId:id,confirmation:'WRONG'})).status,400);
    assert.equal((await f.call({action:'apply',previewId:id,confirmation:'GRANT_PERMANENT_AVATAR'},{ownerId:5})).status,403);
    assert.equal((await f.call({action:'status',previewId:id},{ownerId:5})).status,403);
    assert.equal((await f.call({action:'status',previewId:id},{now:NOW+16*60000})).body.status,'EXPIRED');
    assert.equal((await f.call({action:'apply',previewId:id,confirmation:'GRANT_PERMANENT_AVATAR'},{now:NOW+16*60000})).status,409);
    await f.pg.exec("UPDATE users SET nickname='renamed' WHERE id=2");assert.equal((await f.apply(id)).status,409);
    await f.pg.exec("UPDATE users SET nickname='QA A',status='BLOCKED' WHERE id=2");assert.equal((await f.apply(id)).status,409);
    await f.pg.exec("UPDATE users SET status='ACTIVE' WHERE id=2; UPDATE avatar_catalog_v1 SET version=3 WHERE code='HI_HEEYA'");assert.equal((await f.apply(id)).status,409);
    assert.equal((await f.rows('SELECT * FROM avatar_user_ownership_v1')).length,2);
  }finally{await f.close();}
});

test('audit and receipt failures roll back every ownership change, then permit the same request retry',async()=>{
  for(const sql of ['INSERT INTO admin_logs','UPDATE app_meta']){
    const f=await fixture();try{
      const id=(await f.preview()).body.previewId;f.failOn(sql);
      assert.equal((await f.apply(id)).body.code,'AVATAR_GRANT_RETRY');
      const owned=await f.rows('SELECT * FROM avatar_user_ownership_v1 ORDER BY user_id');assert.equal(owned.length,2);assert.notEqual(owned[1].expires_at,null);
      assert.equal((await f.rows('SELECT * FROM admin_logs')).length,0);
      f.failOn('');assert.equal((await f.apply(id)).body.status,'COMPLETED');
    }finally{await f.close();}
  }
});

test('double submit grants once; cancelling an unresolved request serializes with late apply',async()=>{
  const f=await fixture();try{
    const id=(await f.preview()).body.previewId;
    const responses=await Promise.all([f.apply(id),f.apply(id)]);assert.ok(responses.every(r=>r.status===200));
    assert.equal((await f.rows('SELECT * FROM admin_logs')).length,1);
    assert.equal((await f.call({action:'cancel',previewId:id})).body.status,'COMPLETED');
    const next=(await f.preview()).body.previewId;
    assert.equal((await f.call({action:'cancel',previewId:next})).body.status,'CANCELLED');
    assert.equal((await f.apply(next)).body.status,'CANCELLED');
    assert.equal((await f.rows('SELECT * FROM admin_logs')).length,1);
  }finally{await f.close();}
});

test('frontend persists request before apply; network interruption cannot create a new grant or alter recipients',async()=>{
  const id='12345678-1234-1234-1234-123456789abc';
  const preview={ok:true,status:'PREVIEW',previewId:id,avatar:{code:'HI_HEEYA'},recipients:[{userId:2,nickname:'QA A',outcome:'NEW'}],permanent:true};
  const input={avatarCode:'HI_HEEYA',nicknames:['QA A'],reason:'QA'};
  let saved,fail=true,seen=[];
  const request=async(path,body)=>{seen.push(body);if(body.action==='preview')return preview;
    assert.equal(saved.started,true);if(fail)throw Error('timeout');return {...preview,status:'COMPLETED',granted:1,alreadyOwned:0};};
  const s=new AvatarGrantSession(request,r=>{saved=r;});await s.preview(input);
  await assert.rejects(s.send('apply'),/timeout/);assert.equal(saved.started,true);assert.throws(()=>s.reset());await assert.rejects(s.preview(input));
  fail=false;const restored=new AvatarGrantSession(request,r=>{saved=r;},saved);assert.equal((await restored.send('status')).status,'COMPLETED');
  assert.ok(seen.filter(b=>b.action!=='preview').every(b=>b.previewId===id));restored.reset();assert.equal(saved,null);
  const bad=new AvatarGrantSession(async()=>({...preview,recipients:[{userId:4,nickname:'wrong',outcome:'NEW'}]}),()=>{});
  await assert.rejects(bad.preview(input),/다릅니다/);
});

test('CMS entry is accessible and cache-busted; nickname whitespace does not split multiword names',()=>{
  assert.deepEqual(grantNicknames('QA A\r\nQA♡\n'),['QA A','QA♡']);assert.throws(()=>grantNicknames('QA\nQA'));
  assert.throws(()=>avatarGrantInput({avatarCode:'HI_HEEYA',nicknames:['QA\nA'],reason:'QA'}));
  const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(read('admin/avatar-admin-v1.js'),/href="\.\/avatar-grant"/);
  assert.match(read('admin/index.html'),/avatar-admin-v1\.js\?v=2079-direct-grant/);
  assert.match(read('admin/avatar-grant.html'),/aria-live="polite"/);
  assert.doesNotMatch(read('admin/avatar-grant.js'),/innerHTML/);
  assert.match(read('package.json'),/tests\/avatar-admin-grant-v2079\.test\.mjs/);
});

test('live route rejects unauthorized roles before foundation/schema access',async()=>{
  for(const admin of [null,{id:2,role:'USER'},{id:3,role:'ADMIN'}]){
    const result=await handleAvatar({path:'admin/avatars/grant',request:new Request('https://qa.test/api/admin/avatars/grant',{method:'POST'}),env:{},
      deps:{requirePermission:async()=>admin,json:(body,status)=>({body,status})}});
    assert.equal(result.status,403);
  }
});
