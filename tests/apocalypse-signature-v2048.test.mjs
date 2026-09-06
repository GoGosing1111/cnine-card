import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Assets,Container,Texture} from 'pixi.js';
import {gsap} from 'gsap';
import sharp from 'sharp';
import {APOCALYPSE_SIGNATURE_SKILLS,apocalypseSignatureSkill} from '../shared/apocalypse-boss-skills-v2048.mjs';
import {normalizeApocalypseSettings,pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {buildCoreRaidBattlePayload,defaultCoreRaidSettings,cleanCoreRaidSettings,CORE_RAID_BOSS_SOURCE_ART,CORE_RAID_BOSS_BATTLE_SPRITE} from '../functions/_raid_core_protocol.js';
import {ApocalypseSignatureSkillFX,fitSignatureScale} from '../preview/project-v-v3/source/battle/ApocalypseSignatureSkillFX.js';

after(()=>gsap.ticker.sleep());
const read=path=>readFile(new URL('../'+path,import.meta.url));
const text=async path=>(await read(path)).toString('utf8');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const cards=['HP','DEFENSE','SPEED','ATTACK','DEFENSE'].map((power_type,i)=>({id:'TEST-'+i,power_type,power:400000}));

test('signature identities are stable; old bosses and non-monster names cannot select new FX',()=>{
  for(const id of [73,74]){
    const skill=APOCALYPSE_SIGNATURE_SKILLS[id];
    for(const value of [id,{id},{monsterId:id},{id:'B:0:MONSTER:'+id},{id:'B:0',cardId:'MONSTER:'+id}])assert.equal(apocalypseSignatureSkill(value),skill);
    assert(Object.isFrozen(skill));
  }
  for(const value of [71,72,173,'CN-73',{name:'마이트 가이'},null,{},'CORE_ARCHEON'])assert.equal(apocalypseSignatureSkill(value),null);
});

test('Guy 80% and Hashirama 90% are stronger than existing 70%; manual CMS overrides remain authoritative',()=>{
  const normalized=normalizeApocalypseSettings({monsterProfiles:{71:{skillDamagePercent:70},72:{skillDamagePercent:70},73:{},74:{}}});
  const hits=[];
  for(const id of [71,72,73,74]){
    const runtime=pveDifficultyRuntime({apocalypse:normalized},{id,pveTab:'APOCALYPSE',is_boss:1});
    const battle=createPveBattleV2({cards,monster:{...runtime.engineMonster,battle_power:300000},bossUltimatePercent:runtime.apocalypseSkill.damagePercent,bossUltimateCapPercent:runtime.bossUltimateCapPercent,seed:2048});
    const event=battle.result.timeline.find(row=>row.type==='BOSS_ULTIMATE');
    assert(event);assert.equal(event.hits.length,5);
    assert.equal(event.hits[0].configuredDamagePercent,id<73?70:id===73?80:90);
    hits.push(event.hits.map(hit=>hit.damage));
  }
  assert.deepEqual(hits[0],hits[1]);
  for(let slot=0;slot<5;slot++){assert(hits[2][slot]>hits[1][slot]);assert(hits[3][slot]>hits[2][slot]);}
  const disabled=pveDifficultyRuntime({apocalypse:{monsterProfiles:{73:{skillEnabled:false,skillName:'CMS 수동명',skillDamagePercent:55}}}},{id:73,pveTab:'APOCALYPSE'});
  assert.equal(disabled.apocalypseSkill.enabled,false);assert.equal(disabled.apocalypseSkill.name,'CMS 수동명');assert.equal(disabled.apocalypseSkill.damagePercent,55);
  assert.equal(pveDifficultyRuntime({}, {id:73,pveTab:'NORMAL'}).apocalypseSkill,null);
});

test('Core Yhwach keeps original artwork separate from battle SD and preserves TEST/reward lock',()=>{
  const defaults=defaultCoreRaidSettings();
  assert.equal(defaults.bossName,'유하바하');assert.equal(defaults.bossImage,CORE_RAID_BOSS_SOURCE_ART);assert.equal(defaults.bossBattleSprite,CORE_RAID_BOSS_BATTLE_SPRITE);
  assert.equal(defaults.mode,'TEST');assert.equal(defaults.rewardLocked,true);
  assert.equal(cleanCoreRaidSettings({...defaults,bossImage:'assets/custom-art.png',bossBattleSprite:'/assets/custom-sd.webp'}).bossBattleSprite,'/assets/custom-sd.webp');
  for(const stage of ['BOSS','CORE']){
    const payload=buildCoreRaidBattlePayload({participant:{room_id:'QA',attempt_id:'QA',user_id:1,stage,operation:'BREAK',total_power:2000000,deck_snapshot:JSON.stringify(cards),challenge_json:JSON.stringify({challengeId:'QA',weaknessCycle:[],sequence:[],mashTarget:1})}});
    const boss=payload.battleV2.teams.B.cards[0];
    assert.equal(boss.image,stage==='BOSS'?'assets/tower/uhabha.jpg':'assets/tower/badq.jpg');
    assert.equal(boss.sourceArt,boss.image);assert.notEqual(boss.image,boss.battleSprite);
    assert.equal(boss.battleSprite,boss.projectVMonsterArt.primaryUrl);
    assert.equal(boss.projectVMonsterArt.scope,'BATTLE_ENGINE_ONLY');
    if(stage==='BOSS'){
      assert.equal(boss.name,'유하바하');assert.equal(boss.monsterId,'CORE_ARCHEON','keep stable receipt/attempt identity');
      assert(payload.battleV2.result.timeline.some(e=>e.type==='RAID_STAGGER'&&e.label.includes('유하바하')));
    }else assert.match(boss.battleSprite,/hunt-068-omega/);
  }
});

test('both authored atlases contain twelve RGBA frames, distinct artwork and a frame-six impact',async()=>{
  const hashes=[];
  for(const spec of Object.values(APOCALYPSE_SIGNATURE_SKILLS)){
    const root='assets/ui/project-v/fx/apocalypse-signature-v2048/';
    const atlas=JSON.parse(await text(root+spec.asset+'-impact-atlas-v2.json'));
    const png=await read(root+atlas.meta.image),metadata=await sharp(png).metadata();
    assert.equal(metadata.hasAlpha,true);assert.equal(metadata.channels,4);
    assert.equal(Object.keys(atlas.frames).length,12);assert.equal(atlas.meta.collisionFrame,6);
    assert.equal(atlas.meta.hashes.atlas,hash(png));assert.equal(atlas.meta.fps,18);
    assert.equal(atlas.meta.alpha.atlas.minAlpha,0);assert(atlas.meta.alpha.atlas.transparentRatio>.2);
    for(const name of Object.keys(atlas.frames))assert(name.startsWith(spec.asset+'_'));
    hashes.push(hash(png));
  }
  assert.notEqual(...hashes);
});

test('authored frames fit desktop and mobile bounds without moving the foot-level impact',()=>{
  for(const point of [{x:629,y:415,width:1600,height:820,scale:1.02},{x:406.2,y:499.6,width:1050,height:1500,scale:.76}]){
    for(const spec of Object.values(APOCALYPSE_SIGNATURE_SKILLS)){
      const scale=fitSignatureScale({x:point.x,y:point.y,width:512,height:455,scale:spec.scale*point.scale,viewport:point});
      assert(scale<=spec.scale*point.scale);
      assert(point.x-512*.5*scale>=24);assert(point.x+512*.5*scale<=point.width-24);
      assert(point.y-455*.72*scale>=35.99);assert(point.y+455*.28*scale<=point.height-24);
    }
  }
});

test('real Pixi AnimatedSprites and GSAP share exact collision time; release removes all FX',async t=>{
  t.mock.method(Assets,'load',async path=>({textures:Object.fromEntries(Array.from({length:12},(_,i)=>[`${path.includes('night-guy')?'night-guy':'wood-dragon'}_${String(i).padStart(2,'0')}.png`,new Texture({source:Texture.EMPTY.source})]))}));
  t.mock.method(Assets,'unload',async()=>{});
  for(const spec of Object.values(APOCALYPSE_SIGNATURE_SKILLS)){
    await ApocalypseSignatureSkillFX.preload(spec.code);
    const layer=new Container(),fx=ApocalypseSignatureSkillFX.create(spec.code,{x:400,y:600,origin:{x:1100,y:460}}).attach(layer);
    const tl=gsap.timeline({paused:true});fx.play(tl);
    tl.time(spec.impactAt,false);
    assert.equal(fx.dragon.currentFrame,6);assert.equal(fx.dragon.x,0);assert.equal(fx.dragon.y,0);
    assert.equal(fx.display.y,600,'effect ground remains on the passed target-foot coordinate');
    assert.equal(fx.dragon.autoUpdate,false);assert.equal(fx.dragon.blendMode,'normal');
    tl.time(tl.duration(),false);assert.equal(fx.released,true);assert.equal(layer.children.length,0);tl.kill();
    const reduced=ApocalypseSignatureSkillFX.create(spec.code,{reducedMotion:true}).attach(layer),low=gsap.timeline({paused:true});
    reduced.play(low);low.time(.2,false);assert.equal(reduced.trail.visible,false);assert.equal(reduced.dragon.y,0);
    reduced.release();reduced.release();low.kill();assert.equal(layer.children.length,0);layer.destroy();
  }
  await ApocalypseSignatureSkillFX.release();
  assert(ApocalypseSignatureSkillFX.diagnostics().every(row=>!row.ready));
});

test('failed or cancelled atlas loads never create procedural substitutes or revive released textures',async t=>{
  t.mock.method(Assets,'unload',async()=>{});
  t.mock.method(console,'error',()=>{});
  t.mock.method(Assets,'load',async()=>{throw new Error('QA failure');});
  assert.deepEqual(await ApocalypseSignatureSkillFX.preload('NIGHT_GUY'),[]);
  assert.equal(ApocalypseSignatureSkillFX.create('NIGHT_GUY').display,null);
  let finish;
  t.mock.method(Assets,'load',()=>new Promise(resolve=>{finish=resolve;}));
  const load=ApocalypseSignatureSkillFX.preload('WOOD_DRAGON');await ApocalypseSignatureSkillFX.release();
  finish({textures:Object.fromEntries(Array.from({length:12},(_,i)=>['wood-dragon_'+i+'.png',Texture.EMPTY]))});
  assert.deepEqual(await load,[]);assert(ApocalypseSignatureSkillFX.diagnostics().every(row=>!row.ready&&!row.proceduralFallback));
});
