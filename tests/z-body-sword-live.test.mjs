import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {ZBodySwordAnimation} from '../preview/project-v-v3/source/battle/ZBodySwordAnimation.js';
import {Z_SWORD,takeSwordBatch,swordPose,swordContactStop} from '../preview/project-v-v3/source/battle/ZBodySwordModel.mjs';
import {ensureZBodySwordAppearance,Z_SWORD_IMAGE,Z_SWORD_APPEARANCE_KEY} from '../functions/_battle_suit_z_sword.js';
import {JointSQLiteDB} from './helpers/joint-db.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';

test('approved atlas bytes, alpha, dimensions and tall-foot pivots survive promotion',async()=>{
  for(const asset of Z_SWORD.assets){
    const data=await readFile(new URL('..'+asset.url,import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);
    assert.ok((await sharp(data).metadata()).hasAlpha);
  }
  for(const spec of [Z_SWORD.attack,Z_SWORD.cast]){
    const meta=await sharp(new URL('..'+spec.url,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')).metadata();
    assert.equal(meta.width,spec.columns*spec.frameWidth);assert.equal(meta.height,spec.rows*spec.frameHeight);
    assert.equal(new Set(spec.frames.map(f=>JSON.stringify(f.pivot))).size,1);
  }
  assert.equal(swordPose(Z_SWORD.cast.sequence,740).frame,'M07');
  assert.ok(Math.abs(Z_SWORD.bodyScale*592-278*1.4*(479-40)/512)<.001,'Z helmet-to-sole height equals H/S, excluding sword bounds');
  for(const ms of Z_SWORD.impactsMs)assert.equal(swordPose(Z_SWORD.cast.sequence,ms).frame,'M09');
  const frame=Z_SWORD.attack.frames.find(f=>f.id==='07'),scale=.5,target={x:900,y:300},stop=swordContactStop(target,scale);
  assert.ok(Math.abs(stop.x+(frame.bladeTip.x-frame.pivot.x)*scale-target.x)<.01);
  assert.ok(Math.abs(stop.y+(frame.bladeTip.y-frame.pivot.y)*scale-target.y)<.01);
});

test('queued receipts retain order, identity and damage across mixed-target presentation batches',()=>{
  const targets=[{id:'one'},{id:'two'},{id:'three'}];
  const original=Array.from({length:157},(_,i)=>({target:targets[Math.floor(i/9)%3],options:{damage:i+1,authoritative:true},id:i}));
  const queue=[...original],seen=[];let index=0,area=0;
  while(queue.length){const batch=takeSwordBatch(queue,index++);seen.push(...batch.entries);if(batch.mode==='area'){area++;assert.ok(batch.impacts.every(i=>Z_SWORD.impactsMs.includes(i.atMs)));}else assert.equal(new Set(batch.entries.map(e=>e.target)).size,1);}
  assert.deepEqual(seen,original);assert.ok(area);assert.equal(new Set(seen).size,157);
});

function rig(){
  const engine=Object.create(BattleEngine.prototype),ticks=new Set();
  Object.assign(engine,{backgroundLayer:new Container(),effectLayer:new Container(),simpleTimelines:new Set(),pendingTails:new Map(),visible:true,playbackEpoch:1,paceScale:1,app:{ticker:{add:f=>ticks.add(f),remove:f=>ticks.delete(f)}}});
  const root=new Container();root.position.set(100,600);root.baseX=100;root.baseY=600;root.scale.set(.5);
  const unit={root,bodySprite:new Sprite(),weaponSprite:new Sprite(),nameHud:new Container(),view:new Container(),stopIdle(){}};
  const textures=Object.fromEntries([['attack',16],['cast',12],['blade',8],['ground',9]].map(([key,n])=>[key,Array.from({length:n},()=>new Texture({source:Texture.WHITE.source,frame:new Rectangle(0,0,1,1)}))]));
  const sword=new ZBodySwordAnimation(engine,unit,textures);
  const target={id:'enemy-1',root:new Container()};target.root.position.set(900,500);target.root.baseX=900;target.root.baseY=500;
  return{engine,unit,sword,target,ticks,close(){sword.destroy();gsap.ticker.sleep();}};
}
test('real GSAP/Pixi action keeps contacts, pause/speed, final pose and engine cancellation coherent',async()=>{
  const r=rig(),receipt={target:r.target,options:{authoritative:true,damage:100}},hits=[];
  try{
    const batch=takeSwordBatch([receipt],0),done=r.sword.play(batch,entries=>hits.push(...entries));
    const tl=r.sword.timeline;tl.pause();tl.totalTime(.80);assert.equal(hits.length,0);tl.totalTime(.81);assert.deepEqual(hits,[receipt]);
    assert.notEqual(r.unit.root.x,100);assert.equal(r.unit.bodySprite.scale.x,r.unit.bodySprite.scale.y);
    tl.totalTime(1.695);assert.equal(await done,true);assert.equal(r.unit.root.x,100);assert.equal(r.sword.frame,'01');assert.equal(r.engine.simpleTimelines.size,0);
    const area=r.sword.play(takeSwordBatch([receipt,receipt],1),entries=>hits.push(...entries));
    r.engine.accountBattleUnitIsPaused=()=>true;for(const tick of r.ticks)tick();assert.equal(r.sword.timeline.paused(),true);
    r.engine.paceScale=2;for(const tick of r.ticks)tick();assert.equal(r.sword.timeline.timeScale(),2);
    r.sword.timeline.totalTime(.74);assert.equal(r.sword.frame,'M07');
    r.sword.timeline.totalTime(1.21);assert.equal(r.sword.frame,'M09');assert.equal(r.sword.front.visible,true);
    r.sword.cancel();assert.equal(await area,false);assert.equal(r.sword.front.visible,false);assert.equal(r.unit.root.x,100);assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.ticks.size,0);
  }finally{r.close();}
});
test('retired target identity and a cancelled battle never receive delayed sword damage',async()=>{
  const r=rig(),hits=[];
  try{
    const done=r.sword.play(takeSwordBatch([{target:r.target,options:{damage:55}}],1),e=>hits.push(...e));
    const tl=r.sword.timeline;tl.pause();r.target.id='replacement';tl.totalTime(3);await done;assert.equal(hits.length,0);
    const cancelled=r.sword.play(takeSwordBatch([{target:r.target,options:{damage:55}}],0),e=>hits.push(...e));r.sword.cancel();assert.equal(await cancelled,false);assert.equal(hits.length,0);
  }finally{r.close();}
});

test('appearance migration is atomic, idempotent, and leaves S/H/stats/ownership untouched',async()=>{
  const DB=new JointSQLiteDB(),env={DB};
  try{
    DB.sql.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE character_equipment_items(code TEXT PRIMARY KEY,slot TEXT,image_url TEXT,description TEXT,pve_power INTEGER,is_active INTEGER,updated_at TEXT)');
    assert.equal(await ensureZBodySwordAppearance(env),false);
    for(const code of ['BATTLE_SUIT_Z_BODY','BATTLE_SUIT_S_BODY','BATTLE_SUIT_H_BODY'])DB.sql.prepare('INSERT INTO character_equipment_items VALUES(?,?,?,?,?,?,?)').run(code,'BATTLE_SUIT','original.png','original',777,0,null);
    const untouched=DB.sql.prepare("SELECT * FROM character_equipment_items WHERE code!='BATTLE_SUIT_Z_BODY' ORDER BY code").all();
    DB.failAt='INSERT INTO app_meta';await assert.rejects(ensureZBodySwordAppearance(env));
    assert.equal(DB.sql.prepare("SELECT image_url FROM character_equipment_items WHERE code='BATTLE_SUIT_Z_BODY'").get().image_url,'original.png');
    DB.failAt='';await ensureZBodySwordAppearance(env);await ensureZBodySwordAppearance(env);
    const z=DB.sql.prepare("SELECT * FROM character_equipment_items WHERE code='BATTLE_SUIT_Z_BODY'").get();assert.equal(z.image_url,Z_SWORD_IMAGE);assert.equal(z.pve_power,777);assert.equal(z.is_active,0);
    assert.deepEqual(DB.sql.prepare("SELECT * FROM character_equipment_items WHERE code!='BATTLE_SUIT_Z_BODY' ORDER BY code").all(),untouched);
    assert.equal(DB.sql.prepare('SELECT value FROM app_meta WHERE key=?').get(Z_SWORD_APPEARANCE_KEY).value,'1');
  }finally{DB.sql.close();}
});

test('Z replacement retains existing authoritative weapon damage and skill-chip budgets',()=>{
  const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'test',power:200000,basePower:200000,powerType:'ATTACK'}));
  const run=code=>createPveBattleV2({cards,monster:{id:1,battle_power:3000000},seed:21,battleSuit:{code,pvePower:300000,weaponCode:'EQ_1788486929132',skillChips:['SKILL_CHIP_ROCKET_LAUNCHER']}});
  const digest=b=>b.result.timeline.filter(e=>e.actorKind==='BATTLE_SUIT').map(({type,damage,absorbed,targetId,time,combatAtMs})=>({type,damage,absorbed,targetId,time,combatAtMs}));
  assert.deepEqual(digest(run('BATTLE_SUIT_Z_BODY')),digest(run('BATTLE_SUIT_H_BODY')));
});

test('PostgreSQL appearance migration uses the live adapter and preserves CMS values',async()=>{
  const pg=new PGlite();
  try{
    await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$; CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE character_equipment_items(code TEXT PRIMARY KEY,slot TEXT,image_url TEXT,description TEXT,pve_power BIGINT,updated_at TEXT); INSERT INTO character_equipment_items(code,slot,image_url,pve_power) VALUES('BATTLE_SUIT_Z_BODY','BATTLE_SUIT','prior.png',9999999999)");
    const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return{...r,rowCount:r.affectedRows??r.rows.length};}});
    await ensureZBodySwordAppearance({DB});
    const row=(await pg.query('SELECT image_url,pve_power FROM character_equipment_items')).rows[0];
    assert.equal(row.image_url,Z_SWORD_IMAGE);assert.equal(Number(row.pve_power),9999999999);
  }finally{await pg.close();}
});
