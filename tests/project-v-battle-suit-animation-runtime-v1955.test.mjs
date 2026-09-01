import assert from 'node:assert/strict';
import test from 'node:test';

import {Assets, Container, Rectangle, Texture, TextureSource} from 'pixi.js';
import {gsap} from 'gsap';

globalThis.matchMedia??=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.document??={hidden:false,addEventListener(){},removeEventListener(){},getElementById(){return null},querySelector(){return null}};

const root=new URL('../',import.meta.url);
const [{AccountBattleUnit},{BattleEngine},{resolveAccountBattleSuitAnimation}]=await Promise.all([
  import(new URL('preview/project-v-v3/source/battle/AccountBattleUnit.js',root).href),
  import(new URL('preview/project-v-v3/source/battle/BattleEngine.js',root).href),
  import(new URL('preview/project-v-v3/source/battle/AccountBattleSuitAnimationCatalog.js',root).href)
]);

const SUIT_CODE='BATTLE_SUIT_01';
const WEAPON_CODE='EQ_1785961300455'; // M200: physical row 1 exercises lower-atlas slicing.
const STATIC_SUIT='/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-white-gold-wing-v1.png';
const STATIC_WEAPON='/assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png';
const DENIED_MODES=['PVP','RANKED','SIEGE','TERRITORY','CAPTAIN','CLAN'];

function testTexture(width,height){
  const source=new TextureSource({resource:{width,height}});
  return new Texture({source,frame:new Rectangle(0,0,width,height)});
}

function battlePayload(mode='PVE',overrides={}){
  const cards=Array.from({length:5},(_,index)=>({cardId:`ALLY-${index+1}`}));
  const battleV2={
    mode,
    teams:{A:{cards},B:{cards:[{cardId:'MONSTER:TEST'}]}},
    result:{timeline:[]}
  };
  return {
    mode,
    battlefieldMode:mode,
    battleV2,
    v3RenderContext:{accountBattleUnitPve:true},
    equippedBattleSuit:{code:SUIT_CODE,battleSprite:STATIC_SUIT,scaleMultiplier:1},
    equippedWeapon:{code:WEAPON_CODE,image:'/assets/items/not-a-battle-sprite.jpeg',battleSprite:''},
    ...overrides
  };
}

function engineHarness(){
  const allies=Array.from({length:5},(_,index)=>({id:`ALLY-${index+1}`}));
  const enemies=Array.from({length:5},(_,index)=>({id:`ENEMY-${index+1}`}));
  const cards=Array.from({length:5},(_,index)=>({id:`CARD-${index+1}`}));
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    accountBattleUnit:null,
    accountBattleUnitEnabled:false,
    accountBattleUnitEquipment:{battleSuit:null,weapon:null},
    accountBattleUnitShotCount:0,
    allies,
    enemies,
    characters:[...allies,...enemies],
    cards,
    effectLayer:new Container({label:'TestEffectLayer'}),
    combatLayer:new Container({label:'TestCombatLayer',sortableChildren:true}),
    pendingLiveAssets:new Map(),
    visible:false,
    layoutAccountBattleUnit(){},
    sortCombatDepth(){}
  });
  return engine;
}

async function withAssetsLoader(loader,callback){
  const original=Assets.load;
  Assets.load=loader;
  try{return await callback()}finally{Assets.load=original}
}

async function withAssetsUnloader(unloader,callback){
  const original=Assets.unload;
  Assets.unload=unloader;
  try{return await callback()}finally{Assets.unload=original}
}

function destroyHarness(engine){
  engine.accountBattleUnit?.destroy?.();
  engine.accountBattleUnit=null;
  engine.effectLayer?.destroy?.({children:true});
  engine.combatLayer?.destroy?.({children:true});
}

test('authored account-unit atlases are PVE-only and forbidden modes perform zero loads or uses',async()=>{
  const engine=engineHarness();
  let loads=0,uses=0;
  engine.ensureAccountBattleUnit=()=>{uses+=1;throw new Error('forbidden mode attempted to create the authored account unit')};

  await withAssetsLoader(async()=>{loads+=1;throw new Error('forbidden mode attempted to load an authored atlas')},async()=>{
    for(const mode of DENIED_MODES){
      const result=await engine.configureAccountBattleUnit(battlePayload(mode));
      assert.equal(result,false,mode);
    }
    // A friendly outer label must not override an authoritative competitive
    // token nested inside battleV2.
    for(const mode of DENIED_MODES){
      const payload=battlePayload('PVE');
      payload.battleV2.mode=mode;
      const result=await engine.configureAccountBattleUnit(payload);
      assert.equal(result,false,`PVE + nested ${mode}`);
    }
  });

  assert.equal(loads,0,'forbidden payloads must not start Assets.load');
  assert.equal(uses,0,'forbidden payloads must not create/use AccountBattleUnit');
  assert.equal(engine.accountBattleUnit,null);
  assert.equal(engine.allies.length,5);
  assert.equal(engine.cards.length,5);
  assert.equal(engine.characters.length,10);
  destroyHarness(engine);
});

test('PVE authored composite slices row/columns, never shows or tweens a separate weapon, and returns to ready',async()=>{
  const engine=engineHarness();
  const profile=resolveAccountBattleSuitAnimation(SUIT_CODE,WEAPON_CODE);
  assert.ok(profile);
  assert.equal(profile.row,1);
  const sheet=testTexture(1536,1024);
  const rejectedSeparateWeapon=testTexture(1024,341);
  const loads=[];

  try{
    const configured=await withAssetsLoader(async url=>{
      loads.push(String(url));
      assert.equal(String(url),profile.sheetUrl);
      return sheet;
    },()=>engine.configureAccountBattleUnit(battlePayload('PVE')));
    assert.equal(configured,true);
    assert.deepEqual(loads,[profile.sheetUrl],'PVE authored path loads only its exact suit/weapon-pair sheet');

    const unit=engine.accountBattleUnit;
    assert.ok(unit instanceof AccountBattleUnit);
    assert.equal(engine.allies.length,5);
    assert.equal(engine.cards.length,5);
    assert.equal(engine.characters.length,10);
    assert.ok(!engine.allies.includes(unit)&&!engine.cards.includes(unit)&&!engine.characters.includes(unit));

    const readyTexture=unit.bodySprite.texture;
    assert.deepEqual(
      {x:readyTexture.frame.x,y:readyTexture.frame.y,width:readyTexture.frame.width,height:readyTexture.frame.height},
      {x:0,y:512,width:384,height:512}
    );
    assert.ok(Math.abs(unit.bodySprite.anchor.y-profile.contentBottom)<1e-9,'authored sole pivot must use pair-specific visible content bottom');
    assert.ok(Math.abs(unit.bodySprite.height-Math.min(430,278*profile.scaleMultiplier))<1e-6,'authored row scale correction must be applied');
    assert.ok(Math.abs(unit.nameHud.y-(-unit.bodySprite.height*(profile.contentBottom-profile.nameHud.contentTop)-profile.nameHud.gap))<1e-6,'nickname panel must clear the pair-specific visible content top');
    assert.equal(unit.setWeapon(rejectedSeparateWeapon,{source:STATIC_WEAPON}),false,'authored composite must reject a separate weapon attachment');

    const before={x:unit.weaponSprite.x,y:unit.weaponSprite.y,rotation:unit.weaponSprite.rotation};
    const weaponSamples=[];
    const frameCalls=[];
    const tweenTargets=[];
    const originalApply=unit.applyAuthoredFrame.bind(unit);
    const originalTimeline=gsap.timeline;
    unit.applyAuthoredFrame=name=>{frameCalls.push(name);return originalApply(name)};
    gsap.timeline=(...args)=>{
      const timeline=originalTimeline.apply(gsap,args);
      const originalTo=timeline.to;
      timeline.to=function(target,...rest){tweenTargets.push(target);return originalTo.call(this,target,...rest)};
      return timeline;
    };
    const sampler=setInterval(()=>weaponSamples.push({
      visible:unit.weaponSprite.visible,
      x:unit.weaponSprite.x,
      y:unit.weaponSprite.y,
      rotation:unit.weaponSprite.rotation
    }),3);
    try{
      const fired=await unit.playRangedFire({targetX:900,targetY:300});
      assert.equal(fired,true);
    }finally{
      clearInterval(sampler);
      gsap.timeline=originalTimeline;
    }

    const compressed=frameCalls.filter((name,index)=>index===0||name!==frameCalls[index-1]);
    const lastFire=compressed.lastIndexOf('fire');
    assert.ok(lastFire>=0,`missing authored fire frame: ${compressed.join(' -> ')}`);
    assert.deepEqual(compressed.slice(lastFire,lastFire+4),['fire','recoil','recover','ready']);
    assert.ok(tweenTargets.every(target=>target!==unit.weaponSprite&&!(Array.isArray(target)&&target.includes(unit.weaponSprite))),'authored fire must not tween DatabaseWeaponAttachment');
    assert.ok(weaponSamples.length>0);
    assert.ok(weaponSamples.every(sample=>sample.visible===false&&sample.x===before.x&&sample.y===before.y&&sample.rotation===before.rotation),'separate weapon must stay hidden and stationary for the whole authored shot');

    const diagnostics=unit.diagnostics();
    assert.equal(diagnostics.authoredComposite,true);
    assert.equal(diagnostics.authoredFrame,'ready');
    assert.equal(diagnostics.authoredWeaponCode,WEAPON_CODE);
    assert.equal(diagnostics.authoredContentTop,profile.nameHud.contentTop);
    assert.equal(diagnostics.authoredContentBottom,profile.contentBottom);
    assert.deepEqual(diagnostics.authoredMuzzle,profile.muzzle);
    assert.equal(diagnostics.weaponSpriteVisible,false);
    assert.equal(diagnostics.separateWeaponAttachment,false);
    assert.equal(diagnostics.shotCount,1);
    assert.equal(diagnostics.affectsDeck,false);
    assert.equal(diagnostics.affectsDamage,false);
  }finally{
    destroyHarness(engine);
    if(!sheet.destroyed)sheet.destroy(true);
    if(!rejectedSeparateWeapon.destroyed)rejectedSeparateWeapon.destroy(true);
  }
});

test('authored load failure behaviorally restores the static body plus approved DB weapon fallback',async()=>{
  const engine=engineHarness();
  const profile=resolveAccountBattleSuitAnimation(SUIT_CODE,WEAPON_CODE);
  const body=testTexture(1241,1267);
  const weapon=testTexture(1024,341);
  const loads=[];
  const originalWarn=console.warn;
  console.warn=()=>{};
  try{
    const configured=await withAssetsLoader(async url=>{
      const source=String(url);
      loads.push(source);
      if(source===profile.sheetUrl)throw new Error('simulated authored atlas failure');
      if(source===STATIC_SUIT)return body;
      if(source===STATIC_WEAPON)return weapon;
      throw new Error(`unexpected asset ${source}`);
    },()=>engine.configureAccountBattleUnit(battlePayload('PVE')));
    assert.equal(configured,true);
    assert.deepEqual(loads,[profile.sheetUrl,STATIC_SUIT,STATIC_WEAPON]);

    const unit=engine.accountBattleUnit;
    const diagnostics=unit.diagnostics();
    assert.equal(diagnostics.authoredComposite,false);
    assert.equal(diagnostics.bodySource,STATIC_SUIT);
    assert.equal(diagnostics.weaponSource,STATIC_WEAPON);
    assert.equal(diagnostics.weaponSpriteVisible,true);
    assert.equal(diagnostics.separateWeaponAttachment,true);
    assert.equal(unit.bodySprite.anchor.y,.98,'static fallback must restore the legacy body pivot');
    assert.equal(diagnostics.affectsDeck,false);
    assert.equal(diagnostics.affectsDamage,false);
    assert.equal(engine.allies.length,5);
    assert.equal(engine.cards.length,5);
    assert.equal(engine.characters.length,10);
    assert.ok(!engine.allies.includes(unit)&&!engine.cards.includes(unit)&&!engine.characters.includes(unit));
  }finally{
    console.warn=originalWarn;
    destroyHarness(engine);
    if(!body.destroyed)body.destroy(true);
    if(!weapon.destroyed)weapon.destroy(true);
  }
});

test('stale authored atlas detaches and destroys frame views before the base asset is unloaded',async()=>{
  const engine=engineHarness();
  const profile=resolveAccountBattleSuitAnimation(SUIT_CODE,WEAPON_CODE);
  const staleSheet=testTexture(1536,1024);
  const nextSheet=testTexture(1536,1024);
  const unit=new AccountBattleUnit({effectLayer:engine.effectLayer});
  assert.equal(unit.setAuthoredSheet(staleSheet,profile,{source:profile.sheetUrl}),true);
  unit.setActive(true,{deployed:true});
  engine.accountBattleUnit=unit;
  engine.characters=[];
  engine.liveAssets=new Map([[profile.sheetUrl,staleSheet]]);
  const nextUrl='/assets/ui/project-v/account-battle-suits/animations/not-current-test-atlas-v99.png';
  engine.pendingLiveAssets=new Map([[nextUrl,nextSheet]]);

  const staleFrames=[...unit.authoredSubtextures];
  const events=[];
  const originalClear=unit.clearAppearance.bind(unit);
  unit.clearAppearance=()=>{events.push('clear');return originalClear()};
  try{
    const released=await withAssetsUnloader(async urls=>{
      events.push('unload');
      assert.deepEqual(urls,[profile.sheetUrl]);
      assert.equal(unit.bodySprite.texture,Texture.EMPTY,'stale subtexture must be detached before base unload');
      assert.equal(unit.hasAuthoredAnimation(),false);
      assert.equal(unit.authoredSubtextures.length,0);
      assert.ok(staleFrames.every(texture=>texture.destroyed),'all stale frame views must be destroyed before base unload');
    },()=>engine.releaseStaleLiveAssets());
    assert.equal(released,1);
    assert.deepEqual(events,['clear','unload']);
  }finally{
    destroyHarness(engine);
    if(!staleSheet.destroyed)staleSheet.destroy(true);
    if(!nextSheet.destroyed)nextSheet.destroy(true);
  }
});

test('releasing an older atlas never clears the newly selected authored suit/weapon sheet',async()=>{
  const engine=engineHarness();
  const oldProfile=resolveAccountBattleSuitAnimation('BATTLE_SUIT_01',WEAPON_CODE);
  const currentProfile=resolveAccountBattleSuitAnimation('BATTLE_SUIT_02',WEAPON_CODE);
  assert.notEqual(oldProfile.sheetUrl,currentProfile.sheetUrl);
  const oldSheet=testTexture(1536,1024);
  const currentSheet=testTexture(1536,1024);
  const unit=new AccountBattleUnit({effectLayer:engine.effectLayer});
  assert.equal(unit.setAuthoredSheet(currentSheet,currentProfile,{source:currentProfile.sheetUrl}),true);
  unit.setActive(true,{deployed:true});
  engine.accountBattleUnit=unit;
  engine.characters=[];
  engine.liveAssets=new Map([[oldProfile.sheetUrl,oldSheet]]);
  engine.pendingLiveAssets=new Map([[currentProfile.sheetUrl,currentSheet]]);

  const currentFrames=[...unit.authoredSubtextures];
  let clearCalls=0;
  const originalClear=unit.clearAppearance.bind(unit);
  unit.clearAppearance=()=>{clearCalls+=1;return originalClear()};
  try{
    const released=await withAssetsUnloader(async urls=>assert.deepEqual(urls,[oldProfile.sheetUrl]),()=>engine.releaseStaleLiveAssets());
    assert.equal(released,1);
    assert.equal(clearCalls,0);
    assert.equal(unit.hasAuthoredAnimation(),true);
    assert.equal(unit.authoredSheetSource,currentProfile.sheetUrl);
    assert.equal(unit.diagnostics().authoredFrame,'ready');
    assert.notEqual(unit.bodySprite.texture,Texture.EMPTY);
    assert.ok(currentFrames.every(texture=>!texture.destroyed),'current atlas frame views must remain live');
  }finally{
    destroyHarness(engine);
    if(!oldSheet.destroyed)oldSheet.destroy(true);
    if(!currentSheet.destroyed)currentSheet.destroy(true);
  }
});
