import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPveBattleV2,simulateBattleV2Preview,buildBattleSuitFighter,buildFighter,buildMonsterFighter} from '../functions/_battle_v2_preview.js';
import {OVERLORD_SUIT_CODE,OVERLORD_INITIAL_POWER,OVERLORD_AREA_SKILL as SKILL} from '../shared/overlord-suit-v1.mjs';
import {X_BODY_AREA_SKILL} from '../shared/x-body-area-skill.mjs';
import {normalizeSkillChipCodes} from '../shared/battle-suit-skill-chips.mjs';
import {OVERLORD_ASSETS as M,takeOverlordBatch} from '../preview/project-v-v3/source/battle/OverlordSuitModel.mjs';
import {MODES} from '../preview/battle-suit-crimson-gold-knight-20261005-v1/motion.mjs';
import {ensureOverlordEquipment,OVERLORD_ITEM,OVERLORD_UPGRADE_KEY} from '../functions/_battle_suit_overlord.js';
import {__equipmentTest} from '../functions/_equipment.js';
import {JointSQLiteDB} from './helpers/joint-db.mjs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
const read=p=>fs.readFile(new URL('../'+p.replace(/^\//,''),import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const cards=['HP','DEFENSE','ATTACK','SPEED','DEFENSE'].map((power_type,i)=>({id:String(i),power_type,title:'Review '+i,power:3000000}));
function simulate({code=OVERLORD_SUIT_CODE,power=OVERLORD_INITIAL_POWER,count=5,pvp=false,dead=false}={}){
 const a=cards.map((c,i)=>({...buildFighter(c,i,'A',null,pvp?'PVP':'PVE'),hp:1e12,maxHp:1e12,attack:1,speed:200}));
 const b=Array.from({length:count},(_,i)=>({...buildMonsterFighter({id:i+1,battle_power:50000000,is_boss:1}),id:'B:'+i+':MONSTER:'+i,isMonster:!pvp,alive:!(dead&&i===count-1),hp:1e12,maxHp:1e12,shield:1e14,maxShield:1e14,attack:1,speed:200}));
 const support=buildBattleSuitFighter({code,pvePower:power});
 return simulateBattleV2Preview({teamA:[...a,...(support?[support]:[])],teamB:b,maxActions:2000,maxCombatDurationMs:65000,seed:2011});
}
const casts=r=>r.timeline.filter(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===SKILL.code);
test('all production images retain approved V6/V5 pixels; rejected fog is excluded',async()=>{
 assert.equal(M.status,'USER_APPROVED_LIVE');assert.equal(M.assets.length,23);
 for(const a of M.assets){assert.equal(sha(await read(a.url)),a.sha256);assert.equal(sha(await read(a.approvedSource)),a.sha256);}
 assert.equal(M.weapon.sha256,'1b8304bf4c5af1b437e38e6b62932d57eb61ef64d9771aafb599711fdd42559e');
 assert.equal(M.effects['aura-wrap'],undefined);assert.equal(M.title.text,'종말 위에 군림하는 자');
});
test('normal, three-cut and execution animations preserve receipt order and exact totals',()=>{
 const targets=[{id:'boss',isBoss:true},{id:'normal'}],rows=Array.from({length:181},(_,i)=>({target:targets[Math.floor(i/12)%2],options:{damage:i+1}}));
 const q=[...rows],seen=[],modes=new Set();let n=0;
 while(q.length){const b=takeOverlordBatch(q,{actionIndex:n,combatAtMs:n++*10000});seen.push(...b.entries);modes.add(b.mode);assert.equal(new Set(b.entries.map(e=>e.target)).size,1);for(const hit of b.impacts)assert.ok(MODES[b.mode].contacts.some(t=>Math.abs(t*1000-hit.atMs)<1e-6));}
 assert.deepEqual(seen,rows);assert.deepEqual([...modes].sort(),['attack','combo','skill']);
 assert.equal(takeOverlordBatch([{target:targets[0]}],{combatAtMs:5000,nextExecutionAtMs:10000}).mode,'attack');
});
test('opening white tiger repeats every 18s; each living target receives exactly five authoritative impacts',()=>{
 const result=simulate(),list=casts(result);
 assert.deepEqual(list.map(e=>e.combatAtMs),[0,18000,36000,54000]);
 for(const cast of list){
  assert.equal(cast.damageMultiplier,6);assert.equal(cast.targetIds.length,5);
  for(const target of cast.targets){
   const hits=result.timeline.filter(e=>e.type==='SKILL_CHIP_HIT'&&e.castId===cast.castId&&e.targetId===target.targetId);
   assert.equal(hits.length,5);assert.equal(hits.reduce((n,e)=>n+e.damage+e.absorbed,0),target.calculatedDamage);
   for(const h of hits)assert.equal(h.combatAtMs,cast.combatAtMs+SKILL.impactOffsetsMs[h.hitIndex]);
  }
 }
 assert.deepEqual(result,simulate());
});
test('12 hunt slots, dead targets, PVP and zero-power exclusions use existing authority gates',()=>{
 assert.equal(casts(simulate({count:12}))[0].targetIds.length,12);
 assert.equal(casts(simulate({dead:true}))[0].targetIds.length,4);
 for(const opts of [{pvp:true},{power:0},{code:'BATTLE_SUIT_X_BODY'},{code:'BATTLE_SUIT_Z_BODY'}])assert.equal(casts(simulate(opts)).length,0);
 assert.deepEqual(normalizeSkillChipCodes([SKILL.code]),[]);
});
test('recommended suit has 25% more power and stronger intrinsic per cast and per minute than current X',()=>{
 const x=simulate({code:'BATTLE_SUIT_X_BODY',power:50000000}),o=simulate();
 const first=(r,code)=>r.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode===code),a=first(x,X_BODY_AREA_SKILL.code),b=first(o,SKILL.code);
 assert.equal(OVERLORD_INITIAL_POWER/50000000,1.25);assert.ok(b.calculatedDamage>a.calculatedDamage);
 assert.ok(b.calculatedDamage/SKILL.intervalMs>a.calculatedDamage/X_BODY_AREA_SKILL.intervalMs);
 const shots=r=>r.timeline.filter(e=>e.type==='TURN'&&e.actorKind==='BATTLE_SUIT').slice(0,10).reduce((n,e)=>n+e.damage+e.absorbed,0);
 assert.ok(shots(o)>shots(x));
});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' atomic catalog registration, retries and CMS preservation',async()=>{
 let DB,close,exec;
 if(postgres){const pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
 DB=new __postgresCompatTest.PostgresD1Database({async query(input){const a=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return{...a,rowCount:a.affectedRows??a.rows.length};}});close=()=>pg.close();exec=s=>pg.exec(s);}
 else{DB=new JointSQLiteDB();close=()=>DB.sql.close();exec=s=>DB.sql.exec(s);}
 const p=(s,...v)=>DB.prepare(s).bind(...v),env={DB};
 try{
  await exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE character_equipment_items(code TEXT PRIMARY KEY,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,image_url TEXT,description TEXT,total_power BIGINT,pve_power BIGINT,pvp_power BIGINT,is_active INTEGER,is_public INTEGER,sort_order INTEGER,supply_enabled INTEGER,supply_weight REAL,updated_at TEXT);');
  const batch=DB.batch.bind(DB);let fail=true;DB.batch=s=>batch(fail?[s[0],DB.prepare('INSERT INTO missing_table VALUES(1)'),...s.slice(1)]:s);
  await assert.rejects(ensureOverlordEquipment(env));assert.equal(Number((await p('SELECT count(*) n FROM character_equipment_items').first()).n),0);
  assert.equal(await p('SELECT value FROM app_meta WHERE key=?',OVERLORD_UPGRADE_KEY).first(),null);
  fail=false;await ensureOverlordEquipment(env);let row=await p('SELECT * FROM character_equipment_items').first();
  assert.equal(Number(row.pve_power),62500000);assert.equal(Number(row.pvp_power),0);assert.equal(Number(row.supply_enabled),0);
  await p("UPDATE character_equipment_items SET pve_power=777,total_power=777,rarity='MYTHIC',is_active=0,is_public=0").run();
  await ensureOverlordEquipment(env);row=await p('SELECT * FROM character_equipment_items').first();
  assert.equal(Number(row.pve_power),777);assert.equal(row.rarity,'MYTHIC');assert.equal(Number(row.is_active),0);
  assert.equal(row.image_url,OVERLORD_ITEM.image);
 }finally{await close();}
});
test('equipped metadata resolves Overlord with no PVP power and actual shipped loaders include the production controller',async()=>{
 const p=__equipmentTest.publicEquippedItem({battle_suit_id:99,battle_suit_code:OVERLORD_SUIT_CODE,battle_suit_pve:62500000,battle_suit_pvp:999},'battle_suit',{pveOnly:true});
 assert.equal(p.battleSprite,OVERLORD_ITEM.battleSprite);assert.equal(p.pvpPower,0);
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','pve-v3/battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js']){
  const src=(await read(file)).toString();for(const token of ['OVERLORD_LIVE_20261005_V6','BATTLE_SUIT_OVERLORD','overlord-v1/effects/tiger-rush.png'])assert.ok(src.includes(token),file+': '+token);
 }
 for(const file of ['index.html','js/app.js'])assert.ok((await read(file)).toString().includes('overlord=20261005-v1'));
});

