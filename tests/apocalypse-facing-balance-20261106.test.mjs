import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {BOSSES,draftBoss,apocalypseTrioLiveProfile} from '../shared/apocalypse-trio-v1.mjs';
import reference from '../docs/qa/apocalypse-trio-live-20261106/reference.json' with {type:'json'};
import saved from '../docs/qa/apocalypse-facing-balance-20261106/saved-parties.json' with {type:'json'};
import {replaySavedBattle,savedFinalSignature} from './helpers/apocalypse-saved-party-20261106.mjs';
import {lowerApocalypseTrio,OPERATION_KEY,PREVIOUS_POWERS} from '../scripts/ops/apocalypse-facing-balance-20261106.mjs';

test('Kargen reused sprite faces allies in world space, including an inherited negative body scale',()=>{
 const source=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/trio/TrioActorMotion.mjs',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('export function configureTrioActors'),source.indexOf('/** Owns')).replace('export function','function');
 const context={draftBoss};vm.runInNewContext(code+';globalThis.configure=configureTrioActors;',context);
 for(const initial of [-.22,.22]){
  const actor={battleCard:{cardId:'MONSTER:81'},art:{},view:{scale:{x:-1}},fullBodySprite:{scale:{x:initial}},animationAdapter:{kill(){}},applyFacing(){this.view.scale.x=this.artFacing===-1?1:-1;},captureNeutralAvatarPose(){this.neutral={view:this.view.scale.x,body:this.fullBodySprite.scale.x};}};
  context.configure({enemies:[actor]});const muzzle=-.43*actor.view.scale.x*actor.fullBodySprite.scale.x,shoulder=.1*actor.view.scale.x*actor.fullBodySprite.scale.x;
  assert(muzzle<shoulder,'muzzle must be to the left of the shoulder, not merely a positive view scale');
  assert.deepEqual(actor.neutral,{view:1,body:.22});
 }
});

test('mercenary crossing behind Kargen during recovery cannot turn his action pose away from the allied formation',()=>{
 const source=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/trio/TrioActorMotion.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ','');
 const point=(x=0,y=x)=>({x,y,set(x,y=x){this.x=x;this.y=y;}});
 class Texture{constructor({source,frame}){this.source=source;this.width=frame.width;this.height=frame.height;}destroy(){}}
 class Rectangle{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}}
 const context={draftBoss,Texture,Rectangle};vm.runInNewContext(source+';globalThis.Motion=TrioActorMotion;',context);
 for(const points of [[{x:1100,y:400}],[{x:1100,y:400},{x:300,y:400}]]){
  const body={texture:{width:1536,height:1024},width:300,height:200,x:0,y:0,rotation:0,alpha:1,visible:true,scale:point(.2),anchor:point(.5,.98),position:point()};
  const actor={team:'ENEMY',state:'IDLE',fullBodySprite:body,view:{scale:point(1)},root:{x:1000,y:400,zIndex:1,scale:point(.5),position:point(1000,400)},animationAdapter:{kill(){}},setState(){},hp:100};
  const motion=new context.Motion({scene:{width:1440}},actor,BOSSES[0].skills[0],{width:1536,height:1024,source:{}},points);
  motion.render(1.2);assert(body.scale.x>0,'left-facing action source must not mirror because a target is briefly behind the boss');assert(motion.target.x<1000);motion.release();assert.equal(body.scale.x,.2);
 }
});

test('saved losses and Sahyeon win replay with matching result/action count; bounded saved-snapshot rounding differences',()=>{
 for(const sample of saved.samples){const r=replaySavedBattle(sample);assert.equal(r.winner,sample.expected.winner);assert.equal(r.actions,sample.expected.actions);assert.equal(r.duration,sample.expected.duration);
  for(const a of savedFinalSignature(r)){const expected=sample.expected.final.find(b=>a.id===b.id);assert(expected);for(const k of ['maxHp','attack','defense'])assert(Math.abs(a[k]-expected[k])<=1,k);
   // Public persisted snapshots omit initial magic/RNG details. Two Kargen
   // escorts differ by <0.7% HP; the winner, actions and boss state agree.
   assert(Math.abs(a.hp-expected.hp)<=Math.max(1,expected.maxHp*.007),'saved HP tolerance');
  }
 }
});

test('lowered trio remains ordered and stronger than Sahyeon for the same saved two-mercenary party',()=>{
 const rows=[];
 for(const boss of [{monsterId:80,name:'사현',battlePower:220e6},...BOSSES]){
  const profile=boss.monsterId===80?reference.profile:apocalypseTrioLiveProfile(boss,reference.profile),results=[];
  for(let seed=1;seed<=32;seed++)results.push(replaySavedBattle(saved.samples[0],{boss,profile,seed}));
  rows.push({wins:results.filter(r=>r.winner==='A').length,actions:results.reduce((n,r)=>n+r.actions,0),hp:results.reduce((n,r)=>n+r.timeline.at(-1).teamAHpPercent,0)});
 }
 assert.deepEqual(BOSSES.map(b=>b.battlePower),[2.2e9,3.3e9,4.4e9]);
 for(let i=1;i<rows.length;i++){assert(rows[i].actions>rows[i-1].actions);assert(rows[i].hp<rows[i-1].hp);assert(rows[i].wins>=28);}
});

test('atomic balance update: dry/failure rollback, stale snapshot rejection, preserved rewards/settings and SELECT-only replay',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text);CREATE TABLE battle_monsters(id bigint PRIMARY KEY,name text,battle_power bigint,reward_coin bigint,pve_tab text,is_active int,pve_enabled int);CREATE TABLE users(id bigint PRIMARY KEY,role text,status text);CREATE TABLE admin_logs(id serial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text);INSERT INTO users VALUES(1,'OWNER','ACTIVE');`);
  const profiles=Object.fromEntries(BOSSES.map((b,i)=>[b.monsterId,{...apocalypseTrioLiveProfile(b,reference.profile),battlePower:PREVIOUS_POWERS[i]}])),settings={enabled:true,unrelated:'KEEP',monsterProfiles:{80:reference.profile,...profiles}};
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['battle_apocalypse_settings_v1',JSON.stringify(settings)]);
  await db.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['ops:apocalypse-trio-live:20261106:v1','ORIGINAL RECEIPT']);
  for(const [i,b]of BOSSES.entries())await db.query('INSERT INTO battle_monsters VALUES($1,$2,$3,$4,$5,1,1)',[b.monsterId,b.name,PREVIOUS_POWERS[i],profiles[b.monsterId].rewardCoin,'APOCALYPSE']);
  const client={query:(sql,args)=>db.query(sql,args)},assets=['/preview/project-v-v3/project-v-pixi-battle.bundle.js','/js/battle-v3-live.js','/shared/apocalypse-trio-v1.mjs'].map(path=>({path,verified:true,sha256:'a'.repeat(64)})),options={expectedProfiles:profiles,assets};
  const original=async()=>{assert.deepEqual((await db.query('SELECT battle_power FROM battle_monsters ORDER BY id')).rows.map(r=>Number(r.battle_power)),PREVIOUS_POWERS);assert.deepEqual(JSON.parse((await db.query("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1'")).rows[0].value),settings);assert.equal((await db.query('SELECT id FROM admin_logs')).rows.length,0);};
  assert.equal((await lowerApocalypseTrio(client,options)).committed,false);await original();
  await assert.rejects(lowerApocalypseTrio(client,{...options,commit:true,assets:[]}),/not verified/);await original();
  await assert.rejects(lowerApocalypseTrio(client,{...options,expectedProfiles:{...profiles,81:{...profiles[81],attackPercent:1}}}),/changed after review/);await original();
  const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('INJECTED_AUDIT_FAILURE')):db.query(sql,args)};
  await assert.rejects(lowerApocalypseTrio(failing,{...options,commit:true}),/INJECTED/);await original();
  const done=await lowerApocalypseTrio(client,{...options,commit:true});assert.equal(done.committed,true);assert.equal(done.changes.length,3);
  const after=JSON.parse((await db.query("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1'")).rows[0].value);for(const [i,b]of BOSSES.entries()){assert.equal(after.monsterProfiles[b.monsterId].battlePower,b.battlePower);after.monsterProfiles[b.monsterId].battlePower=PREVIOUS_POWERS[i];}assert.deepEqual(after,settings);
  const readOnly={query:(sql,args)=>{assert(/^SELECT\b/.test(sql));return db.query(sql,args);}};assert.equal((await lowerApocalypseTrio(readOnly,{commit:true})).replayed,true);
  assert.equal((await db.query('SELECT id FROM admin_logs')).rows.length,1);assert.equal((await db.query('SELECT value FROM app_meta WHERE key=$1',['ops:apocalypse-trio-live:20261106:v1'])).rows[0].value,'ORIGINAL RECEIPT');
 }finally{await db.close();}
});
