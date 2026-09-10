import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Container, Texture} from 'pixi.js';
import {gsap} from 'gsap';
import {MERCENARY_SKILLS as skills, createSkillDraft, validateSkillDraft, parseSkillDraft} from '../shared/mercenary-skills-v1.mjs';
import {compileRehearsal, rehearsalSnapshot, sampleRehearsal, selectSkillTargets} from '../preview/project-v-mercenary-system-v1/skill-rehearsal.mjs';
import {MercenarySkillFX} from '../preview/project-v-mercenary-system-v1/source/MercenarySkillFX.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
const positions=read('preview/project-v-mercenary-system-v1/position-draft-v1.json');
const finish=(id,scenario='normal',snapshot)=>sampleRehearsal(compileRehearsal(id,scenario,snapshot),10);
const actor=(sample,id)=>sample.actors.find(a=>a.id===id);
const copy=v=>structuredClone(v);

test('16 authored identities cover all seven roles and match the position draft',()=>{
  assert.equal(skills.length,16);assert.equal(new Set(skills.map(s=>s.role)).size,7);
  for(const key of ['id','code','mechanic'])assert.equal(new Set(skills.map(s=>s[key])).size,16);
  assert.equal(new Set(skills.map(s=>s.visual.asset)).size,16);
  assert.equal(new Set(skills.map(s=>s.visual.motion)).size,16);
  for(const s of skills){const p=positions.assignments.find(p=>p.code===s.code);assert.equal(s.role,p.role);assert.equal(s.target,p.skillTarget);
    assert.equal(s.runtimeEnabled,false);assert.equal(s.status,'DRAFT');assert.equal(s.balance.damageRatio,null);assert.equal(s.balance.cooldownTurns,null);assert.equal(s.balance.cost,null);}
});
for(const s of skills)for(const scenario of ['normal','counter','boss'])test(`${s.id} ${scenario}: resolved playback is deterministic, bounded and reversible`,()=>{
  const initial=rehearsalSnapshot(scenario),before=copy(initial),plan=compileRehearsal(s.id,scenario,initial);
  assert.deepEqual(initial,before);assert.deepEqual(plan,compileRehearsal(s.id,scenario,initial));assert.equal(plan.previewOnly,true);
  for(const [i,e] of plan.events.entries()){assert.ok(e.at>=0&&e.at<plan.duration);if(i)assert.ok(e.at>=plan.events[i-1].at);assert.ok(e.targets.every(id=>initial.some(a=>a.id===id)));}
  const end=sampleRehearsal(plan,plan.duration),rewind=sampleRehearsal(plan,0);assert.deepEqual(rewind.actors,initial);
  for(const a of end.actors){assert.ok(a.hp>=0&&a.hp<=a.maxHp);assert.ok(a.shield>=0);}
  assert.deepEqual(sampleRehearsal(plan,plan.duration),end);
});
test('single-hit interception conserves damage and excludes area damage',()=>{
  const end=finish('MS-003');assert.equal(24-actor(end,'A1').hp+92-actor(end,'M').hp,24);
  assert.equal(actor(end,'M').hp,74);assert.equal(actor(finish('MS-003','counter'),'M').hp,92);
  const self=rehearsalSnapshot();self.find(a=>a.id==='M').hp=1;
  assert.equal(actor(finish('MS-003','normal',self),'M').hp,1);
});
test('locked sniper cancels a lost target without retargeting',()=>{
  const plan=compileRehearsal('MS-004','counter');assert.deepEqual(plan.targets,['E4']);
  assert.equal(plan.events.filter(e=>e.kind==='HIT').length,0);assert.ok(plan.events.some(e=>e.kind==='CANCEL'));
});
test('calibration is tied to one target and resets on forced target switching',()=>{
  assert.ok(compileRehearsal('MS-005').events.some(e=>e.kind==='HIT'&&e.amount===16));
  const events=compileRehearsal('MS-005','counter').events;assert.ok(!events.some(e=>e.kind==='HIT'&&e.amount===16));
  assert.equal(new Set(events.filter(e=>e.kind==='HIT').flatMap(e=>e.targets)).size,2);
});
test('command grants six next-basic tokens without inserting mercenary into five-card ids',()=>{
  const plan=compileRehearsal('MS-013');assert.equal(plan.targets.length,6);assert.equal(plan.targets.filter(id=>id.startsWith('A')).length,5);
  assert.ok(plan.events.filter(e=>e.kind==='HIT').every(e=>e.procEligible===false&&e.sourceId));
  assert.equal(actor(finish('MS-013'),'A3').flags['지휘권'],true);
});
test('healing suppression applies after cleanse and cannot resurrect a pre-dead target',()=>{
  const end=finish('MS-018','counter');assert.equal(actor(end,'A1').flags['지속 피해'],false);assert.equal(actor(end,'A1').hp,33);
  const snapshot=rehearsalSnapshot();snapshot[0].hp=0;assert.notEqual(compileRehearsal('MS-018','normal',snapshot).targets[0],'A1');
});
test('boss interrupt immunity preserves the cast and creates no replacement stun',()=>{
  const end=finish('MS-038','boss');assert.equal(actor(end,'E1').flags['기술 준비'],true);
  assert.ok(end.events.some(e=>e.kind==='IMMUNE'));assert.ok(!end.events.some(e=>e.kind==='INTERRUPT'));
});
test('range attacks cannot proc melee riposte; venom cleansing removes delayed damage',()=>{
  assert.ok(!compileRehearsal('MS-023','counter').events.some(e=>e.kind==='HIT'&&e.targets[0]!=='M'));
  assert.equal(compileRehearsal('MS-015','counter').events.filter(e=>e.kind==='HIT').length,1);
});
test('front group budgets do not multiply with targets and fall back to one when front is empty',()=>{
  for(const scenario of ['normal','boss'])assert.equal(compileRehearsal('MS-027',scenario).events.filter(e=>e.kind==='HIT').reduce((n,e)=>n+e.amount,0),18);
  const barrier=compileRehearsal('MS-028');assert.equal(barrier.events.filter(e=>e.kind==='SHIELD').reduce((n,e)=>n+e.amount,0),30);
  const snapshot=rehearsalSnapshot();snapshot.filter(a=>a.team==='ENEMY').forEach(a=>a.row='BACK');assert.equal(selectSkillTargets('FRONT_GROUP',snapshot).length,1);
});
test('finisher evaluates HP at collision and missed first shot cancels encore',()=>{
  assert.equal(actor(finish('MS-032'),'E3').hp,0);assert.ok(actor(finish('MS-032','counter'),'E3').hp>0);
  assert.equal(actor(finish('MS-032','counter'),'M').flags['재장전 부담'],true);
  const encore=compileRehearsal('MS-043','counter');assert.equal(encore.events.filter(e=>e.kind==='HIT').length,0);
});
test('dead caster and missing targets fail closed; invalid snapshots are rejected',()=>{
  const dead=rehearsalSnapshot();dead.find(a=>a.id==='M').hp=0;assert.equal(compileRehearsal('MS-042','normal',dead).events[0].kind,'CANCEL');
  const empty=rehearsalSnapshot().filter(a=>a.team==='ALLY');assert.equal(compileRehearsal('MS-004','normal',empty).events[0].kind,'CANCEL');
  assert.throws(()=>compileRehearsal('MS-004','invalid'));assert.throws(()=>compileRehearsal('MS-004','normal',[...dead,dead[0]]));
});
test('CMS imports reject live activation, unknown fields, wrong assignments, missing rows and stale versions',()=>{
  const good=createSkillDraft(roster.version);assert.deepEqual(parseSkillDraft(JSON.stringify(good),roster.version),good);
  const mutations=[d=>d.runtimeEnabled=true,d=>d.skills[0].damageRatio=99,d=>d.skills[0].code='V-043',d=>d.skills.pop(),d=>d.skills[1]=d.skills[0],d=>d.rosterVersion--,d=>d.skills[0].name='',d=>d.skills[0].review='APPROVED',d=>d.revision=Number.MAX_SAFE_INTEGER];
  for(const mutate of mutations){const bad=copy(good);mutate(bad);assert.throws(()=>validateSkillDraft(bad,roster.version));}
  assert.throws(()=>parseSkillDraft(' '.repeat(49*1024),roster.version));
});
test('Pixi lifecycle uses one cancellable V3 clock, rewinds poses, and preserves shared textures',()=>{
  const layer=new Container(),engine={effectLayer:layer,simpleTimelines:new Set(),mobile:false,reducedMotion:false};
  const actors=new Map(rehearsalSnapshot().map((a,i)=>[a.id,{baseX:i*30,baseY:200,fullBodyHeight:260,root:{x:i*30,y:200,rotation:0,scale:{y:.5},position:{set(x,y){const actor=actors.get(a.id);actor.root.x=x;actor.root.y=y}}},fullBodySprite:{tint:0xffffff},layoutHudBars(){},setShield(){}}]));
  for(const s of skills){
    const fx=new MercenarySkillFX(engine,actors,s,compileRehearsal(s.id),Texture.EMPTY);
    fx.seek(s.visual.impacts[0]+.1);assert.ok(fx.diagnostics().visibleSprites>0,`${s.id} needs an actual visible effect`);
    fx.setSpeed(2);fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);
    fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(actors.get('M').root.x,actors.get('M').baseX);
    fx.seek(s.visual.duration);assert.equal(fx.diagnostics().visibleSprites,0);fx.destroy();fx.destroy();assert.equal(layer.children.length,0);
  }
  gsap.ticker.sleep();layer.destroy();assert.equal(Texture.EMPTY.destroyed,false);
});
test('sixteen independent generated assets are versioned and source bytes remain intact',()=>{
  const manifest=read('preview/project-v-mercenary-system-v1/skill-assets/manifest.json');assert.equal(manifest.images.length,16);
  assert.equal(new Set(manifest.images.map(i=>i.runtimeSha256)).size,16);
  for(const image of manifest.images){
    for(const [key,hash] of [['source','sourceSha256'],['runtime','runtimeSha256']]){
      const file=fs.readFileSync(new URL('../preview/project-v-mercenary-system-v1/'+image[key],import.meta.url));
      assert.equal(crypto.createHash('sha256').update(file).digest('hex').toUpperCase(),image[hash]);
    }
    assert.ok(image.alpha.transparentFraction>.15);assert.ok(image.alpha.edgeMax<=5);assert.deepEqual(image.runtimeSize,[512,512]);
  }
});
test('skill review stays outside production battle routes, source-art roster and five-card contract',()=>{
  for(const path of ['index.html','js/app.js','functions/api/[[path]].js','js/battle-v3-live.js']){
    const content=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.ok(!/mercenary-skills-v1|skills\.bundle\.js|skill-rehearsal\.mjs/.test(content),path);
  }
  assert.ok(roster.cards.every(c=>c.rank===null));assert.equal(roster.formationRule.regularCardSlots,5);
});
