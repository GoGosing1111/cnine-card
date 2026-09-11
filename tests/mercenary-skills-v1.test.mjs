import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Container, Texture, path as pixiPath} from 'pixi.js';
import {gsap} from 'gsap';
import {MERCENARY_SKILLS as skills, createSkillDraft, validateSkillDraft, parseSkillDraft} from '../shared/mercenary-skills-v1.mjs';
import {createSkillAssignments, validateSkillAssignments, parseSkillAssignments, reviseSkillAssignments, ASSIGNMENT_STORAGE_KEY} from '../shared/mercenary-skill-assignments-v1.mjs';
import {compileRehearsal, rehearsalSnapshot, sampleRehearsal, selectSkillTargets} from '../preview/project-v-mercenary-system-v1/skill-rehearsal.mjs';
import {MercenarySkillFX} from '../preview/project-v-mercenary-system-v1/source/MercenarySkillFX.js';
import {skillAssetBaseUrl} from '../preview/project-v-mercenary-system-v1/skill-asset-base.mjs';
import {sampleSequence,releaseFrameViews} from '../preview/project-v-mercenary-system-v1/source/MercenarySpriteSequence.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json');
const positions=read('preview/project-v-mercenary-system-v1/position-draft-v1.json');
const finish=(id,scenario='normal',snapshot)=>sampleRehearsal(compileRehearsal(id,scenario,snapshot),10);
const actor=(sample,id)=>sample.actors.find(a=>a.id===id);
const copy=v=>structuredClone(v);

test('event horizon is independently assignable and preserves bounded shares and its cleanse window',()=>{
  const omega=skills.find(s=>s.id==='MS-021');
  assert.equal(omega.exclusivity,undefined);assert.equal(omega.code,undefined);
  for(const scenario of ['normal','boss']){
    const plan=compileRehearsal('MS-021',scenario),hits=plan.events.filter(e=>e.kind==='HIT');
    assert.equal(hits.reduce((total,e)=>total+e.amount,0),66);
    assert.ok(hits.filter(e=>e.stage==='DETONATE').every(e=>e.at===2.25&&e.procEligible===false));
    assert.ok(!plan.events.some(e=>['INTERRUPT','STUN','EXECUTE','MOVE'].includes(e.kind)));
    assert.equal(actor(sampleRehearsal(plan,4.2),'M').flags['과부하'],true);
  }
  const counter=compileRehearsal('MS-021','counter');
  assert.deepEqual(counter.events.filter(e=>e.stage==='DETONATE').map(e=>[e.targets[0],e.amount]),[['E2',24]]);
  assert.ok(!actor(sampleRehearsal(counter,4.2),'E1').flags['성좌 균열']);
  const initial=rehearsalSnapshot();Object.assign(initial.find(a=>a.id==='E1'),{hp:5,shield:0});
  const lost=compileRehearsal('MS-021','normal',initial);
  assert.deepEqual(lost.events.filter(e=>e.stage==='DETONATE').map(e=>[e.targets[0],e.amount]),[['E2',24]]);
});

test('both legacy reviews preserve names, notes and revisions while removing proposed ownership',()=>{
  for(const version of [1,2]){
    const old={format:'PROJECT_V_MERCENARY_SKILL_DRAFT_V1',version,rosterVersion:version===1?10:11,revision:7,status:'DRAFT',runtimeEnabled:false,
      skills:createSkillDraft().skills.filter(s=>version===2||s.id!=='MS-021').map(s=>({...s,code:`V-${s.id.slice(3)}`}))};
    old.skills[0].name='내가 검토한 이름';old.skills[0].note='보존할 의견';old.skills[0].review='REVISE';
    const before=copy(old),migrated=parseSkillDraft(JSON.stringify(old));
    assert.equal(migrated.revision,7);assert.equal(migrated.skills.length,17);assert.equal(migrated.version,3);
    assert.equal(migrated.rosterVersion,undefined);assert.equal(migrated.catalogVersion,1);assert.deepEqual(old,before);
    assert.deepEqual(migrated.skills.filter(s=>version===2||s.id!=='MS-021'),old.skills.map(({code,...review})=>review));
    if(version===1)assert.equal(migrated.skills.find(s=>s.id==='MS-021').review,'PENDING');
    assert.ok(createSkillAssignments(roster).assignments.every(row=>row.skillIds.length===0));
    for(const mutate of [d=>d.runtimeEnabled=true,d=>d.skills[0].code='V-099',d=>d.skills[0].damage=99,d=>d.skills[1]=d.skills[0],d=>d.skills[0].note=99,d=>d.extra=true]){
      const bad=copy(old);mutate(bad);assert.throws(()=>parseSkillDraft(JSON.stringify(bad)));
    }
  }
});

test('Pages extensionless documents and local .html resolve shared V3 assets identically',()=>{
  for(const url of ['https://cnine-card.pages.dev/preview/project-v-mercenary-system-v1/skills-battle','http://127.0.0.1:8793/preview/project-v-mercenary-system-v1/skills-battle.html']){
    const base=skillAssetBaseUrl(url),origin=new URL(url).origin;
    for(const resource of ['../../assets/ui/coin-prediction/arena-v1.png','../../assets/ui/idle-dungeon/enchanted-card-battlefield-v4.webp','/assets/ui/project-v/fx/role-impact-v2/attack-impact-atlas-v2.json'])
      assert.equal(pixiPath.toAbsolute(resource,base),origin+'/'+resource.replace(/^(?:\.\.\/)+|^\//g,''));
  }
});

test('17 independent skills cover seven effect categories without a mercenary or rank owner',()=>{
  assert.equal(skills.length,17);assert.equal(new Set(skills.map(s=>s.role)).size,7);
  for(const key of ['id','mechanic'])assert.equal(new Set(skills.map(s=>s[key])).size,17);
  assert.equal(new Set(skills.map(s=>s.visual.asset)).size,17);
  assert.equal(new Set(skills.map(s=>s.visual.motion)).size,17);
  for(const s of skills){assert.equal(s.code,undefined);assert.equal(s.exclusivity,undefined);assert.equal(s.rank,undefined);
    for(const card of roster.cards)assert.ok(!`${s.trigger} ${s.effect} ${s.counterplay}`.includes(card.name));
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
test('review imports reject assignment fields, live activation, missing skills and stale catalog versions',()=>{
  const good=createSkillDraft();assert.deepEqual(parseSkillDraft(JSON.stringify(good)),good);
  const mutations=[d=>d.runtimeEnabled=true,d=>d.skills[0].damageRatio=99,d=>d.skills[0].code='V-043',d=>d.skills.pop(),d=>d.skills[1]=d.skills[0],d=>d.catalogVersion--,d=>d.skills[0].name='',d=>d.skills[0].review='APPROVED',d=>d.revision=Number.MAX_SAFE_INTEGER,d=>d.rosterVersion=11];
  for(const mutate of mutations){const bad=copy(good);mutate(bad);assert.throws(()=>validateSkillDraft(bad));}
  assert.throws(()=>parseSkillDraft(' '.repeat(49*1024)));
});

test('assignment drafts start with all 43 mercenaries unassigned, including SSS Omega',()=>{
  const before=copy(roster),draft=createSkillAssignments(roster);
  assert.equal(draft.authority,'USER');assert.equal(draft.runtimeEnabled,false);
  assert.equal(draft.assignments.length,43);assert.ok(draft.assignments.every(row=>row.skillIds.length===0));
  assert.deepEqual(roster,before);assert.equal(roster.cards.find(card=>card.code==='V-021').rank,'SSS');
  assert.notEqual(ASSIGNMENT_STORAGE_KEY,'cnine.mercenarySkills.draft.v1');
});
test('users can select event horizon for other mercenaries, combine skills and reuse one skill',()=>{
  const draft=createSkillAssignments(roster);
  draft.assignments.find(row=>row.code==='V-004').skillIds=['MS-021','MS-003'];
  draft.assignments.find(row=>row.code==='V-043').skillIds=['MS-021'];
  const accepted=parseSkillAssignments(JSON.stringify(draft),roster);
  assert.deepEqual(accepted,draft);assert.deepEqual(accepted.assignments.find(row=>row.code==='V-021').skillIds,[]);
  accepted.assignments[0].skillIds.push('MS-004');assert.equal(draft.assignments[0].skillIds.length,0);
  draft.assignments.find(row=>row.code==='V-004').skillIds=[];assert.deepEqual(validateSkillAssignments(draft,roster),draft);
});
test('assignment import rejects invented IDs, duplicate pairs, omitted mercenaries and release bypasses',()=>{
  const good=createSkillAssignments(roster);
  for(const mutate of [d=>d.authority='ASSISTANT',d=>d.runtimeEnabled=true,d=>d.status='APPROVED',d=>d.rosterVersion--,d=>d.catalogVersion++,d=>d.assignments.pop(),d=>d.assignments[1]=d.assignments[0],d=>d.assignments[0].code='CN-123',d=>d.assignments[0].skillIds=['MS-999'],d=>d.assignments[0].skillIds=['MS-003','MS-003'],d=>d.assignments[0].rank='SSS',d=>d.assignments[0].skillIds=null,d=>d.revision=Number.MAX_SAFE_INTEGER]){
    const bad=copy(good);mutate(bad);assert.throws(()=>parseSkillAssignments(JSON.stringify(bad),roster));
  }
  assert.throws(()=>parseSkillAssignments(JSON.stringify(createSkillDraft()),roster));
  assert.throws(()=>parseSkillAssignments(' '.repeat(65*1024),roster));
  assert.throws(()=>parseSkillDraft(JSON.stringify(good)));
});
test('assignment revisions reject stale saves and preserve the caller draft on success or failure',()=>{
  const initial=createSkillAssignments(roster),before=copy(initial);
  const first=reviseSkillAssignments(initial,null,null,roster);assert.equal(first.revision,2);assert.deepEqual(initial,before);
  const edited=copy(first);edited.assignments[0].skillIds=['MS-021'];
  const saved=reviseSkillAssignments(edited,first,2,roster);assert.equal(saved.revision,3);assert.deepEqual(initial,before);
  assert.throws(()=>reviseSkillAssignments(edited,saved,2,roster),/다른 화면/);
  assert.throws(()=>reviseSkillAssignments(edited,null,2,roster),/다른 화면/);
  assert.equal(edited.revision,2);assert.deepEqual(saved.assignments[0].skillIds,['MS-021']);
});
test('Pixi lifecycle uses one cancellable V3 clock, rewinds poses, and preserves shared textures',()=>{
  const layer=new Container(),combatLayer=new Container(),engine={effectLayer:layer,combatLayer,simpleTimelines:new Set(),mobile:false,reducedMotion:false};
  const actors=new Map(rehearsalSnapshot().map((a,i)=>[a.id,{baseX:i*30,baseY:200,fullBodyHeight:260,root:{x:i*30,y:200,rotation:0,scale:{y:.5},position:{set(x,y){const actor=actors.get(a.id);actor.root.x=x;actor.root.y=y}}},fullBodySprite:{tint:0xffffff},layoutHudBars(){},setShield(){}}]));
  for(const s of skills){
    const sequence={frames:Array.from({length:16},()=>new Texture({source:Texture.EMPTY.source}))};
    const auxiliary=Object.fromEntries(['flash','smoke','dust','cinder'].map(n=>[n,Texture.EMPTY]));
    const fx=new MercenarySkillFX(engine,actors,s,compileRehearsal(s.id),sequence,auxiliary);
    fx.seek(s.visual.impacts[0]+.1);assert.ok(fx.diagnostics().visibleSprites>0,`${s.id} needs an actual visible effect`);
    if(s.id==='MS-021'){
      fx.seek(1.05);assert.ok(fx.diagnostics().activeFrames.every(frame=>frame.index===4));
      fx.seek(2.25);assert.ok(fx.diagnostics().activeFrames.every(frame=>frame.index===8));
    }
    fx.setSpeed(2);fx.play();assert.equal(engine.simpleTimelines.size,1);fx.pause();assert.equal(fx.playing,false);
    fx.cancel();assert.equal(engine.simpleTimelines.size,0);assert.equal(fx.diagnostics().visibleSprites,0);assert.equal(actors.get('M').root.x,actors.get('M').baseX);
    for(const a of actors.values()){a.baseX+=4;a.baseY+=2;}fx.syncFormation();fx.seek(s.visual.impacts[0]+.1);fx.cancel();
    for(const a of actors.values()){assert.equal(a.root.x,a.baseX);assert.equal(a.root.y,a.baseY);}
    fx.seek(s.visual.duration);assert.equal(fx.diagnostics().visibleSprites,0);fx.destroy();fx.destroy();assert.equal(layer.children.length,0);assert.equal(combatLayer.children.length,0);releaseFrameViews(sequence);
  }
  gsap.ticker.sleep();layer.destroy();assert.equal(Texture.EMPTY.destroyed,false);
});

test('authored impact selects changing frame UVs on the shared clock and rejects a single still',()=>{
  assert.equal(sampleSequence(-.3),null);assert.equal(sampleSequence(0).index,4);
  const at=sampleSequence(.15);assert.ok(at.index>4);assert.deepEqual(at,sampleSequence(.15));
  assert.equal(sampleSequence(1.06),null);assert.equal(sampleSequence(-.24).alpha,0);
  assert.throws(()=>new MercenarySkillFX({},new Map(),skills[0],{},Texture.EMPTY),/sixteen-frame/);
});

test('all seventeen sequences and three scenarios stay within the sprite budget and fully rewind',()=>{
  const layer=new Container(),combatLayer=new Container(),engine={effectLayer:layer,combatLayer,simpleTimelines:new Set(),mobile:true,scene:{width:320},reducedMotion:false};
  const actors=new Map(rehearsalSnapshot().map((a,i)=>[a.id,{baseX:50+i*20,baseY:200,fullBodyHeight:260,root:{x:50+i*20,y:200,rotation:0,scale:{y:.5},position:{set(x,y){const item=actors.get(a.id);item.root.x=x;item.root.y=y}}},fullBodySprite:{tint:0xffffff},layoutHudBars(){},setShield(){}}]));
  for(const s of skills)for(const scenario of ['normal','counter','boss']){
    const sequence={frames:Array.from({length:16},()=>new Texture({source:Texture.EMPTY.source})),extent:{x:.45,y:.5}};
    const aux=Object.fromEntries(['flash','smoke','dust','cinder'].map(n=>[n,Texture.EMPTY]));
    const fx=new MercenarySkillFX(engine,actors,s,compileRehearsal(s.id,scenario),sequence,aux);
    for(let i=0;i<=75;i++){
      fx.seek(i/75*s.visual.duration);assert.equal(fx.diagnostics().poolOverflow,0,`${s.id}/${scenario} at ${i}`);
      for(const sprite of fx.foreground.filter(p=>p.visible&&sequence.frames.includes(p.texture))){
        const reach=sprite.width*(.45*Math.abs(Math.cos(sprite.rotation))+.5*Math.abs(Math.sin(sprite.rotation)));
        assert.ok(sprite.x-reach>=17.99&&sprite.x+reach<=302.01,`${s.id} primary silhouette must fit the mobile arena`);
      }
    }
    fx.seek(s.visual.impacts[0]+.1);const snapshot=JSON.stringify(fx.diagnostics().activeFrames);
    if(s.id==='MS-042'&&scenario==='counter')assert.equal(fx.diagnostics().activeFrames.length,0,'An unqualified pistol hit cannot show restraint rings');
    if(s.id==='MS-021'&&scenario==='counter'){
      fx.seek(2.25);assert.equal(fx.diagnostics().activeFrames.length,1,'Only the uncleansed target retains a terminal sequence');
      fx.seek(s.visual.impacts[0]+.1);
    }
    engine.mobile=false;
    for(let i=0;i<=75;i++){fx.seek(i/75*s.visual.duration);assert.equal(fx.diagnostics().poolOverflow,0,`${s.id} after mobile-to-desktop resize`);}
    engine.mobile=true;
    fx.seek(s.visual.duration);fx.seek(s.visual.impacts[0]+.1);assert.equal(JSON.stringify(fx.diagnostics().activeFrames),snapshot);
    fx.cancel();for(const a of actors.values()){assert.equal(a.root.x,a.baseX);assert.equal(a.root.y,a.baseY);assert.equal(a.root.rotation,0);}
    assert.equal(fx.lines.context.instructions.length,0);fx.destroy();releaseFrameViews(sequence);
  }
  gsap.ticker.sleep();layer.destroy();combatLayer.destroy();assert.equal(Texture.EMPTY.destroyed,false);
});
test('rejected V1 originals remain preserved as history, not a runtime fallback',()=>{
  const manifest=read('preview/project-v-mercenary-system-v1/skill-assets/manifest.json');assert.equal(manifest.images.length,16);
  assert.equal(manifest.status,'USER_REJECTED_V1_SINGLE_SPRITE_TWEENS');
  assert.equal(new Set(manifest.images.map(i=>i.runtimeSha256)).size,16);
  for(const image of manifest.images){
    for(const [key,hash] of [['source','sourceSha256'],['runtime','runtimeSha256']]){
      const file=fs.readFileSync(new URL('../preview/project-v-mercenary-system-v1/'+image[key],import.meta.url));
      assert.equal(crypto.createHash('sha256').update(file).digest('hex').toUpperCase(),image[hash]);
    }
    assert.ok(image.alpha.transparentFraction>.15);assert.ok(image.alpha.edgeMax<=5);assert.deepEqual(image.runtimeSize,[512,512]);
  }
});

test('seventeen individually authored sequences retain 272 original frames and clean gutters',()=>{
  const manifest=read('preview/project-v-mercenary-system-v1/skill-assets-v2/manifest.json');
  assert.equal(manifest.images.length,17);assert.equal(manifest.frameCount,272);assert.equal(manifest.runtimeEnabled,false);
  const hashes=new Set(),ids=new Set();
  for(const row of manifest.images){
    assert.equal(row.code,undefined,'Creation references must never be used as skill ownership');
    assert.ok(skills.some(s=>s.id===row.skillId&&s.visual.asset===row.id));assert.equal(row.frameCount,16);assert.equal(row.frames.length,16);ids.add(row.skillId);
    for(const [file,hash]of [[row.source,row.sourceSha256],[row.runtime,row.runtimeSha256],...row.frames.map(f=>[f.file,f.sha256])]){
      const bytes=fs.readFileSync(new URL('../preview/project-v-mercenary-system-v1/skill-assets-v2/'+file,import.meta.url));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),hash);
    }
    assert.equal(new Set(row.frames.map(f=>f.rawSha256)).size,16);
    for(const f of row.frames){assert.ok(f.edgeMax<=5);assert.ok(f.nonempty>0||f.index===15);assert.ok(row.cellSize>=256);if(f.nonempty)hashes.add(f.rawSha256);}
  }
  assert.equal(ids.size,17);assert.ok(hashes.size>=255,'All substantive frames are independently authored; a final empty extinction frame can be shared.');
});
test('skill review stays outside production battle routes, source-art roster and five-card contract',()=>{
  for(const path of ['index.html','js/app.js','functions/api/[[path]].js','js/battle-v3-live.js']){
    const content=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.ok(!/mercenary-skills-v1|skills\.bundle\.js|skill-rehearsal\.mjs/.test(content),path);
  }
  assert.ok(roster.cards.every(c=>c.code==='V-021'?c.rank==='SSS':c.rank===null));assert.equal(roster.formationRule.regularCardSlots,5);
});
