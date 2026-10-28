import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {PLAN,OP,PLAN_HASH,applyFivefold,readTitles,readReceipt} from '../scripts/ops/title-power-fivefold-20261028.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 const columns=Object.keys(PLAN.titlesBefore[0]),numeric=new Set(['id','pve_power','is_active','is_public','sort_order']);
 await db.exec(`CREATE TABLE character_titles(${columns.map(k=>k+' '+(numeric.has(k)?'BIGINT':'TEXT')+(k==='id'?' PRIMARY KEY':'')).join(',')});
 CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);
 CREATE TABLE user_character_titles(user_id BIGINT,title_id BIGINT,expires_at TEXT);
 CREATE TABLE user_title_loadout(user_id BIGINT PRIMARY KEY,title_id BIGINT);
 CREATE TABLE ranked_duo_policy_version_v1(id BIGINT PRIMARY KEY,revision BIGINT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
 INSERT INTO users VALUES(1,'OWNER','ACTIVE');
 INSERT INTO user_character_titles VALUES(7,1,NULL),(8,550996,NULL);
 INSERT INTO user_title_loadout VALUES(7,1),(8,550996);
 INSERT INTO ranked_duo_policy_version_v1 VALUES(1,400);
 CREATE FUNCTION touch_titles() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM changed_titles) THEN UPDATE ranked_duo_policy_version_v1 SET revision=revision+1 WHERE id=1; END IF; RETURN NULL; END $$;
 CREATE TRIGGER title_policy AFTER UPDATE ON character_titles REFERENCING NEW TABLE AS changed_titles FOR EACH STATEMENT EXECUTE FUNCTION touch_titles();`);
 for(const row of PLAN.titlesBefore)await db.query(`INSERT INTO character_titles(${columns.join(',')}) VALUES(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(k=>row[k]));
 const snapshot=async()=>({titles:await readTitles(db),ownership:(await db.query('SELECT * FROM user_character_titles ORDER BY user_id')).rows,loadout:(await db.query('SELECT * FROM user_title_loadout ORDER BY user_id')).rows,policy:(await db.query('SELECT * FROM ranked_duo_policy_version_v1')).rows,audits:(await db.query('SELECT * FROM admin_logs ORDER BY id')).rows,receipt:await readReceipt(db)});
 return {db,snapshot};
}

test('all 22 live title values multiply once, preserve ownership/metadata, and invalidate duo policy once',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const r=await applyFivefold(f.db,{expectedPlanHash:PLAN_HASH,dryRun:false}),after=await f.snapshot();
 assert.equal(r.committed,true);assert.equal(r.receipt.titleCount,22);
 assert.deepEqual(after.ownership,before.ownership);assert.deepEqual(after.loadout,before.loadout);
 assert.equal(Number(after.policy[0].revision),401);assert.equal(after.audits.length,1);
 for(const row of after.titles){const change=PLAN.changes.find(c=>c.id===row.id);assert.equal(Number(row.pve_power),change.before*5);}
 await f.db.query("UPDATE character_titles SET pve_power=123456 WHERE code='SUPPORTER'");
 const later=await f.snapshot();
 const replay=await applyFivefold({query(sql,args){assert.match(sql,/^SELECT\b/);return f.db.query(sql,args);}});
 assert.equal(replay.replayed,true);assert.deepEqual(await f.snapshot(),later,'Replay must preserve subsequent CMS edits');
});

test('receipt SQL failure rolls back every title, audit and duo revision',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const failing={query(sql,args){return f.db.query(sql.startsWith('INSERT INTO app_meta')?'SELECT 1/0':sql,sql.startsWith('INSERT INTO app_meta')?[]:args);}};
 await assert.rejects(()=>applyFivefold(failing,{expectedPlanHash:PLAN_HASH,dryRun:false}),/division by zero/);
 assert.deepEqual(await f.snapshot(),before);
 const retried=await applyFivefold(f.db,{expectedPlanHash:PLAN_HASH,dryRun:false});assert.equal(retried.receipt.titleCount,22);
});

test('successful dry run leaves catalog, ownership, audit and receipt unchanged',async t=>{
 const f=await fixture(t),before=await f.snapshot();
 const r=await applyFivefold(f.db,{expectedPlanHash:PLAN_HASH});assert.equal(r.committed,false);
 assert.deepEqual(await f.snapshot(),before);
});

test('catalog drift or unreviewed plan cannot overwrite a new operator setting',async t=>{
 const f=await fixture(t);await f.db.query("UPDATE character_titles SET pve_power=140000 WHERE code='SUPPORTER'");
 const before=await f.snapshot();
 await assert.rejects(()=>applyFivefold(f.db,{expectedPlanHash:'unreviewed',dryRun:false}),/Reviewed plan hash/);
 await assert.rejects(()=>applyFivefold(f.db,{expectedPlanHash:PLAN_HASH,dryRun:false}),/Title catalog changed/);
 assert.deepEqual(await f.snapshot(),before);
});

test('actual loadout client displays all new values and equips each as equal PVE/PVP power',async()=>{
 const source=await fs.readFile(new URL('../js/character-loadout-v2.js',import.meta.url),'utf8');
 const listeners=new Map(),root={innerHTML:'',classList:{add(){},remove(){}},contains(){return true;},addEventListener(n,fn){listeners.set(n,fn);},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
 const window={location:{href:'https://game.test/?tab=equipment'},setTimeout(){return 1;},clearTimeout(){}};
 vm.runInNewContext(source,{window,URL,structuredClone,console,history:{replaceState(){}}});
 const titles=PLAN.changes.map(t=>({id:Number(t.id),code:t.code,name:t.name,pvePower:t.after,owned:true,unlockType:'MANUAL'}));
 const controller=window.SoopketmonCharacterLoadoutV2.create(root,{request:async path=>path==='character/loadout'?{instances:[],loadout:{},titles,vehicles:[],equipmentTotalQuantity:0}:{ok:true},profile:{nickname:'칭호 검수'}});
 const tick=()=>new Promise(r=>setImmediate(r));
 const click=(dataset={},attributes=[])=>listeners.get('click')({target:{dataset,closest(){return this;},hasAttribute(a){return attributes.includes(a);}}});
 await tick();click({tab:'title'});
 for(const title of titles){assert(root.innerHTML.includes(title.name));assert(root.innerHTML.includes(title.pvePower.toLocaleString('en-US')));click({titleEquip:String(title.id)});await tick();const b=controller.getState().bonuses;assert.equal(b.titlePve,title.pvePower);assert.equal(b.titlePvp,title.pvePower);assert.equal(b.pve,title.pvePower);assert.equal(b.pvp,title.pvePower);}
 click({},['data-title-unequip']);await tick();assert.equal(controller.getState().bonuses.titlePve,0);assert.equal(controller.getState().bonuses.titlePvp,0);controller.destroy();
});
