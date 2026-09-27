import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Container,Sprite,Texture,Rectangle} from 'pixi.js';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {XBodySwordAnimation} from '../preview/project-v-v3/source/battle/XBodySwordAnimation.js';
import {X_SWORD,takeXBodyBatch} from '../preview/project-v-v3/source/battle/XBodySwordModel.mjs';
import {MODES} from '../preview/battle-suit-x-v1/motion.mjs';
import {ensureXBodyEquipment,X_BODY_UPGRADE_KEY,X_BODY_ITEM} from '../functions/_battle_suit_x_body.js';
import {__equipmentTest,ensureEquipmentFoundation} from '../functions/_equipment.js';
import {JointSQLiteDB} from './helpers/joint-db.mjs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
const read=p=>fs.readFile(new URL('../'+p.replace(/^\//,''),import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('all promoted X/dragon pixels equal both approved sources, and all live paths resolve',async()=>{
 assert.equal(X_SWORD.status,'USER_APPROVED_LIVE');assert.equal(X_SWORD.assets.length,16);
 for(const a of X_SWORD.assets){assert.equal(sha(await read(a.url)),a.sha256);assert.equal(sha(await read(a.approvedSource)),a.sha256);}
 for(const folder of['battle-suit-x-v1','battle-suit-x-dragon-v1']){
  const approval=JSON.parse(await read('preview/'+folder+'/approval-20260927.json'));
  for(const a of approval.artifacts){let b=await read(a.path);if(a.hashMode==='UTF8_LF')b=Buffer.from(b.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));assert.equal(sha(b),a.sha256,a.path);}
 }
 assert.equal(X_SWORD.base.weapon.sha256,X_SWORD.dragon.weapon.sha256);
});
test('mixed-target normal receipts keep their order, identity and exact total through the two approved actions',()=>{
 const targets=[{id:'one'},{id:'two'},{id:'three'}];
 const original=Array.from({length:181},(_,i)=>({target:targets[Math.floor(i/13)%3],options:{damage:i+1},id:i}));
 const queue=[...original],seen=[],modes=new Set();let action=0;
 while(queue.length){const b=takeXBodyBatch(queue,action++);seen.push(...b.entries);modes.add(b.mode);assert.equal(new Set(b.entries.map(e=>e.target)).size,1);for(const hit of b.impacts)assert.ok(MODES[b.mode].contacts.some(t=>Math.abs(t*1000-hit.atMs)<1e-8));}
 assert.deepEqual(seen,original);assert.equal(new Set(seen).size,181);assert.deepEqual([...modes].sort(),['attack','skill']);
});
test('a changing target with fewer than six receipts never reserves a six-contact flurry',()=>{
 const targets=Array.from({length:5},(_,i)=>({id:i}));
 const queue=Array.from({length:30},(_,i)=>({target:targets[i%5],options:{damage:i+1}}));
 let index=0;
 while(queue.length){const batch=takeXBodyBatch(queue,index++);assert.equal(batch.mode,'attack');assert.equal(batch.entries.length,1);}
 assert.equal(takeXBodyBatch(Array.from({length:6},()=>({target:targets[0]})),1).mode,'skill');
});
function rig(){
 const engine=Object.create(BattleEngine.prototype),ticks=new Set(),world=new Container(),stage=new Container(),units=new Container();
 world.addChild(stage);stage.addChild(units);
 Object.assign(engine,{stage,backgroundLayer:new Container(),effectLayer:new Container(),simpleTimelines:new Set(),pendingTails:new Map(),visible:true,playbackEpoch:1,paceScale:1,mobile:false,scene:{width:1600,height:820},parallaxLayers:[],allies:Array(5),sortCombatDepth(){},camera:{base:{x:0,y:0},focusAt(){},reset(){stage.position.set(0,0);stage.pivot.set(0,0);stage.scale.set(1);}},app:{ticker:{add:f=>ticks.add(f),remove:f=>ticks.delete(f)}}});
 stage.addChild(engine.backgroundLayer,engine.effectLayer);
 const root=new Container();root.position.set(100,600);root.baseX=100;root.baseY=600;root.scale.set(.5);units.addChild(root);
 const unit={root,bodySprite:new Sprite(),weaponSprite:new Sprite(),nameHud:new Container(),view:new Container(),stopIdle(){},cancelFire(){this.swordAnimation?.cancel();},fullName:'X'};
 root.addChild(unit.view);unit.view.addChild(unit.bodySprite);
 const texture=()=>new Texture({source:Texture.WHITE.source,frame:new Rectangle(0,0,1,1)});
 const decode=m=>({idle:Texture.WHITE,motion:Object.fromEntries(Object.entries(m.motion).map(([k,v])=>[k,v.frames.map(texture)])),effects:Object.fromEntries(Object.entries(m.effects).map(([k,v])=>[k,v.frames.map(texture)]))});
 const textures={base:decode(X_SWORD.base),dragon:decode(X_SWORD.dragon)};textures.dragon.motion.dash=textures.base.motion.dash;textures.dragon.effects.dash=textures.base.effects.dash;
 const sword=new XBodySwordAnimation(engine,unit,textures);engine.accountBattleUnit=unit;
 const target={id:'enemy-1',root:new Container(),view:new Container(),fullBodyHeight:300};target.root.position.set(900,500);target.root.baseX=900;target.root.baseY=500;units.addChild(target.root);
 return{engine,unit,sword,target,ticks,close(){sword.destroy();world.destroy({children:true});gsap.ticker.sleep();}};
}
test('a stable target keeps the approved flurry when receipts arrive one at a time',async()=>{
 const r=rig(),seen=[],modes=[];
 try{
  for(let i=0;i<3;i++){
   const receipt={target:r.target,options:{damage:100+i,authoritative:true}},batch=r.sword.takeBatch([receipt]);modes.push(batch.mode);
   const done=r.sword.play(batch,entries=>seen.push(...entries)),tl=r.sword.timeline;tl.pause();
   for(const time of MODES[batch.mode].contacts)tl.totalTime(time);
   tl.totalTime(MODES[batch.mode].duration);assert.equal(await done,true);
   assert.equal(seen.length,i+1,'six visual contacts must not create extra server receipts');
  }
  assert.deepEqual(modes,['attack','skill','attack']);
  assert.equal(seen.reduce((sum,row)=>sum+row.options.damage,0),303);
  assert.equal(r.sword.diagnostics().flurries,1);
 }finally{r.close();}
});
test('a replaced monster identity does not inherit the previous target flurry',async()=>{
 const r=rig();
 try{
  const row={target:r.target,options:{damage:100,authoritative:true}},done=r.sword.play(r.sword.takeBatch([row]),()=>{});
  r.sword.timeline.pause().totalTime(MODES.attack.duration);await done;
  r.target.id='replacement';const batch=r.sword.takeBatch([{target:r.target,options:{damage:200,authoritative:true}}]);
  assert.equal(batch.mode,'attack');assert.equal(batch.entries.length,1);
 }finally{r.close();}
});
test('the direct single-shot path uses the X controller rather than the Z selector',async()=>{
 const r=rig();let selected=0,played;
 Object.assign(r.engine,{accountBattleUnitEnabled:true,playAccountBattleUnitSwordBatch:async batch=>{played=batch;return true;}});r.unit.active=true;
 r.sword.takeBatch=queue=>{selected++;return{mode:'skill',entries:queue,impacts:[]};};
 try{assert.equal(await r.engine.playAccountBattleUnitShot(r.target,{damage:123,authoritative:true}),true);assert.equal(selected,1);assert.equal(played.mode,'skill');assert.equal(played.entries[0].options.damage,123);}
 finally{r.close();}
});
for(const mobile of [false,true])test(`X-BODY ${mobile?'mobile':'desktop'} camera stays at normal scale for attacks, flurries and dragon casts`,async()=>{
 const r=rig();r.engine.mobile=mobile;let focusCalls=0;
 r.engine.camera.focusAt=(_point,zoom)=>{focusCalls++;r.engine.stage.scale.set(zoom);};
 const normalView=()=>{assert.equal(focusCalls,0,'X-BODY must never request a cinematic zoom');assert.deepEqual([r.engine.stage.scale.x,r.engine.stage.scale.y,r.engine.stage.pivot.x,r.engine.stage.pivot.y],[1,1,0,0]);};
 const receipt={target:r.target,options:{damage:100,authoritative:true}};
 try{
  for(const [count,action] of [[1,0],[6,1]]){
   const batch=takeXBodyBatch(Array(count).fill(receipt),action),done=r.sword.play(batch,()=>{}),tl=r.sword.timeline;
   tl.pause();normalView();
   for(const time of MODES[batch.mode].contacts){tl.totalTime(time);normalView();}
   tl.totalTime(MODES[batch.mode].duration);assert.equal(await done,true);normalView();
  }
  r.engine.combatantById=id=>id===r.target.id?r.target:null;
  const cast=r.sword.skillFactory.create(r.engine,{targetIds:[r.target.id]},[]);
  try{normalView();for(const time of [0,.4,.8,1.6,2.18,2.42,3.2,4.6]){cast.render(time);normalView();}}
  finally{cast.destroy();}
  normalView();
 }finally{r.close();}
});

test('real Pixi/GSAP contacts, pause, speed, return, cancellation and target replacement remain coherent',async()=>{
 const r=rig(),hits=[],receipt={target:r.target,options:{damage:100,authoritative:true}};
 try{
  let done=r.sword.play(takeXBodyBatch([receipt],0),e=>hits.push(...e)),tl=r.sword.timeline;
  tl.pause();tl.totalTime(.369);assert.equal(hits.length,0);tl.totalTime(.37);assert.deepEqual(hits,[receipt]);tl.totalTime(1.1);assert.equal(await done,true);
  assert.equal(r.unit.root.x,100);assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.sword.diagnostics().effectsVisible,false);
  done=r.sword.play(takeXBodyBatch([receipt],1),e=>hits.push(...e));tl=r.sword.timeline;
  r.engine.accountBattleUnitIsPaused=()=>true;r.engine.paceScale=2;for(const tick of r.ticks)tick();
  assert.equal(tl.paused(),true);assert.equal(tl.timeScale(),2);
  r.target.id='replacement';tl.totalTime(3.4);assert.equal(await done,true);assert.equal(hits.length,1);
  done=r.sword.play(takeXBodyBatch([receipt],0),e=>hits.push(...e));r.sword.cancel();assert.equal(await done,false);
  assert.equal(r.engine.simpleTimelines.size,0);assert.equal(r.ticks.size,0);assert.equal(r.sword.diagnostics().effectsVisible,false);
 }finally{r.close();}
});
test('burst catch-up stays constant until the last recovery, then resets for the next normal attack',async()=>{
 const r=rig(),receipt={target:r.target,options:{damage:100,authoritative:true}};
 try{
  r.engine.accountBattleUnitDamageQueue=Array(16).fill(receipt);
  const done=r.sword.play(takeXBodyBatch([receipt]),()=>{}),tl=r.sword.timeline;
  for(const tick of r.ticks)tick();const burstRate=tl.timeScale();assert.ok(burstRate>3&&burstRate<=4);
  r.engine.accountBattleUnitDamageQueue.length=0;for(const tick of r.ticks)tick();assert.equal(tl.timeScale(),burstRate);
  tl.totalTime(1.1);await done;assert.equal(r.sword.catchupRate,1);
  const next=r.sword.play(takeXBodyBatch([receipt]),()=>{});for(const tick of r.ticks)tick();assert.equal(r.sword.timeline.timeScale(),1);
  r.sword.cancel();await next;
 }finally{r.close();}
});
for(const postgres of[false,true])test((postgres?'PostgreSQL':'SQLite')+' catalog registration is atomic, retries once and preserves CMS choices',async()=>{
 let DB,close,exec;
 if(postgres){const pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
  DB=new __postgresCompatTest.PostgresD1Database({async query(input){const a=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return{...a,rowCount:a.affectedRows??a.rows.length};}});close=()=>pg.close();exec=s=>pg.exec(s);
 }else{DB=new JointSQLiteDB();close=()=>DB.sql.close();exec=s=>DB.sql.exec(s);}
 const p=(s,...v)=>DB.prepare(s).bind(...v),env={DB};
 try{
  await exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE character_equipment_items(code TEXT PRIMARY KEY,name TEXT,slot TEXT,subtype TEXT,rarity TEXT,image_url TEXT,description TEXT,total_power BIGINT,pve_power BIGINT,pvp_power BIGINT,is_active INTEGER,is_public INTEGER,sort_order INTEGER,supply_enabled INTEGER,supply_weight REAL,updated_at TEXT);');
  const batch=DB.batch.bind(DB);let fail=true;DB.batch=s=>batch(fail?[s[0],DB.prepare('INSERT INTO missing_table VALUES(1)'),...s.slice(1)]:s);
  await assert.rejects(ensureXBodyEquipment(env));assert.equal(Number((await p('SELECT count(*) n FROM character_equipment_items').first()).n),0);
  assert.equal(await p('SELECT value FROM app_meta WHERE key=?',X_BODY_UPGRADE_KEY).first(),null);
  fail=false;await p("INSERT INTO character_equipment_items(code,pve_power,total_power,pvp_power,rarity,is_active,is_public,supply_enabled,supply_weight) VALUES(?,987654,987654,88,'MYTHIC',0,0,0,0)",X_BODY_ITEM.code).run();
  await ensureXBodyEquipment(env);await ensureXBodyEquipment(env);
  const row=await p('SELECT * FROM character_equipment_items').first();assert.deepEqual([Number(row.pve_power),Number(row.pvp_power),row.rarity,row.is_active,row.is_public],[987654,0,'MYTHIC',0,0]);
  assert.equal(row.image_url,X_BODY_ITEM.image);assert.equal((await p('SELECT value FROM app_meta WHERE key=?',X_BODY_UPGRADE_KEY).first()).value,'1');
 }finally{await close();}
});
test('equipped payload uses X art, the foundation fast gate includes X, and PVP power stays zero',async()=>{
 const p=__equipmentTest.publicEquippedItem({battle_suit_id:7,battle_suit_code:X_BODY_ITEM.code,battle_suit_pve:777,battle_suit_pvp:999},'battle_suit',{pveOnly:true});
 assert.equal(p.battleSprite,X_BODY_ITEM.battleSprite);assert.equal(p.pvpPower,0);assert.equal(p.pvePower,777);
 const src=(await read('functions/_equipment.js')).toString();assert.match(src,/Z_SWORD_APPEARANCE_KEY,X_BODY_UPGRADE_KEY/);
 const fake=Object.create(BattleEngine.prototype);Object.assign(fake,{accountBattleUnitEquipment:null,accountBattleUnitEnabled:false,syncAccountBattleUnitTile(){},accountBattleUnit:{clearAppearance(){},setName(){}}});
 assert.equal(await fake.configureAccountBattleUnit({mode:'PVP',equippedBattleSuit:{code:X_BODY_ITEM.code,image:X_BODY_ITEM.image}}),false);
});
test('actual shipped bundle and main loader resolve the approved X production assets',async()=>{
 for(const file of['preview/project-v-v3/project-v-pixi-battle.bundle.js','pve-v3/battle.bundle.js']){
  const src=(await read(file)).toString();for(const token of['X_BODY_LIVE_20260927','BATTLE_SUIT_X_BODY','x-sword-v1/dragon/dragon-atlas.png','x-sword-v1/base/combo-atlas.png'])assert.ok(src.includes(token),file+': '+token);
 }
 for(const file of['index.html','js/app.js'])assert.ok((await read(file)).toString().includes('xBody=20260928-flurry'));
 for(const file of['js/battle-v3-live.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert.ok((await read(file)).toString().includes('20260928-x-body-flurry'));
});
