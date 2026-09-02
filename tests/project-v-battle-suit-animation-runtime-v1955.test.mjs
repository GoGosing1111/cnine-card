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
const SUIT_CODES=Object.freeze(['BATTLE_SUIT_01','BATTLE_SUIT_02','BATTLE_SUIT_03']);
const WEAPON_CODES=Object.freeze(['EQ_1785427638137','EQ_1785961300455','EQ_1785961232958','EQ_1786966923833']);
const FRAME_ORDER=Object.freeze(['ready','fire','recoil','recover']);
const NAME_PANEL_HEIGHT=29;
const STATIC_SUIT='/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-mechanical-female-v3.png';
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
    rules:{battleSuitDamageAuthority:'SERVER_TIMELINE'},
    teams:{A:{cards,supports:[{id:`A:SUPPORT:BATTLE_SUIT:${SUIT_CODE}`,actorKind:'BATTLE_SUIT',authoritative:true,damageAuthority:'SERVER_TIMELINE'}]},B:{cards:[{cardId:'MONSTER:TEST'}]}},
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
  const vfxFrame=testTexture(256,256);
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
    unit.ballisticVfx.frames={
      muzzle:Array(8).fill(vfxFrame),
      tracer:Array(6).fill(vfxFrame),
      impact:Array(8).fill(vfxFrame)
    };
    assert.equal(engine.allies.length,5);
    assert.equal(engine.cards.length,5);
    assert.equal(engine.characters.length,10);
    assert.ok(!engine.allies.includes(unit)&&!engine.cards.includes(unit)&&!engine.characters.includes(unit));

    const readyTexture=unit.bodySprite.texture;
    assert.deepEqual(
      {x:readyTexture.frame.x,y:readyTexture.frame.y,width:readyTexture.frame.width,height:readyTexture.frame.height},
      {x:0,y:512,width:384,height:512}
    );
    assert.ok(Math.abs(unit.bodySprite.anchor.x-profile.pivots.ready.x)<1e-9,'ready frame must use its measured sole pivot x');
    assert.ok(Math.abs(unit.bodySprite.anchor.y-profile.pivots.ready.y)<1e-9,'ready frame must use its measured sole pivot y');
    assert.ok(Math.abs(unit.bodySprite.height-Math.min(430,278*profile.scaleMultiplier))<1e-6,'authored row scale correction must be applied');
    const highestContentOffset=Math.min(...FRAME_ORDER.map(name=>profile.nameHud.contentTop-profile.pivots[name].y));
    const expectedNameHudY=unit.bodySprite.height*highestContentOffset-profile.nameHud.gap-NAME_PANEL_HEIGHT;
    assert.ok(Math.abs(unit.nameHud.y-expectedNameHudY)<1e-6,'nickname panel must include its full height above every frame content top');
    for(const name of FRAME_ORDER){
      assert.ok(unit.nameHud.y+NAME_PANEL_HEIGHT<=unit.bodySprite.height*(profile.nameHud.contentTop-profile.pivots[name].y)-profile.nameHud.gap+1e-6,`${name} must preserve the requested nickname gap`);
    }
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
    assert.deepEqual(diagnostics.authoredPivot,{x:profile.pivots.ready.x,y:profile.pivots.ready.y});
    assert.deepEqual(diagnostics.authoredPivots,profile.pivots);
    assert.deepEqual(diagnostics.authoredMuzzle,profile.muzzle);
    assert.equal(diagnostics.weaponSpriteVisible,false);
    assert.equal(diagnostics.separateWeaponAttachment,false);
    assert.equal(diagnostics.shotCount,1);
    assert.equal(diagnostics.affectsDeck,false);
    assert.equal(diagnostics.affectsDamage,true);
    assert.equal(diagnostics.damageAuthority,'SERVER_BATTLE_V2_TIMELINE');
  }finally{
    destroyHarness(engine);
    if(!sheet.destroyed)sheet.destroy(true);
    if(!rejectedSeparateWeapon.destroyed)rejectedSeparateWeapon.destroy(true);
    if(!vfxFrame.destroyed)vfxFrame.destroy(true);
  }
});

test('all twelve authored suit/weapon profiles apply frame-exact sole pivots and keep muzzle math on the fire pivot',()=>{
  const sheet=testTexture(1536,1024);
  const effectLayer=new Container({label:'AllPairPivotEffectLayer'});
  const unit=new AccountBattleUnit({effectLayer});
  unit.setFormation(321,456,.5);
  const fixedRoot={x:unit.root.x,y:unit.root.y};
  try{
    for(const suitCode of SUIT_CODES){
      for(const weaponCode of WEAPON_CODES){
        const profile=resolveAccountBattleSuitAnimation(suitCode,weaponCode);
        assert.ok(profile,`${suitCode}:${weaponCode}`);
        assert.equal(unit.setAuthoredSheet(sheet,profile,{source:profile.sheetUrl}),true);
        for(const name of FRAME_ORDER){
          assert.equal(unit.applyAuthoredFrame(name),true,`${suitCode}:${weaponCode}:${name}`);
          assert.ok(Math.abs(unit.bodySprite.anchor.x-profile.pivots[name].x)<1e-9,`${suitCode}:${weaponCode}:${name} pivot x`);
          assert.ok(Math.abs(unit.bodySprite.anchor.y-profile.pivots[name].y)<1e-9,`${suitCode}:${weaponCode}:${name} pivot y`);
          assert.deepEqual({x:unit.root.x,y:unit.root.y},fixedRoot,`${suitCode}:${weaponCode}:${name} must not move the fixed formation root`);
        }

        unit.applyAuthoredFrame('ready');
        let capturedLocal=null;
        const originalToGlobal=unit.bodySprite.toGlobal;
        const originalToLocal=effectLayer.toLocal;
        unit.bodySprite.toGlobal=point=>{capturedLocal={x:point.x,y:point.y};return point};
        effectLayer.toLocal=point=>point;
        try{unit.muzzlePoint()}finally{
          unit.bodySprite.toGlobal=originalToGlobal;
          effectLayer.toLocal=originalToLocal;
        }
        const texture=unit.bodySprite.texture;
        const width=Number(texture?.orig?.width??texture?.width);
        const height=Number(texture?.orig?.height??texture?.height);
        const firePivot=profile.pivots.fire;
        assert.ok(Math.abs(capturedLocal.x-(profile.muzzle.x-firePivot.x)*width)<1e-9,`${suitCode}:${weaponCode} muzzle x must use the fire-frame pivot while ready`);
        assert.ok(Math.abs(capturedLocal.y-(profile.muzzle.y-firePivot.y)*height)<1e-9,`${suitCode}:${weaponCode} muzzle y must use the fire-frame pivot while ready`);

        const highestContentOffset=Math.min(...FRAME_ORDER.map(name=>profile.nameHud.contentTop-profile.pivots[name].y));
        const conservativeTop=unit.bodySprite.height*highestContentOffset;
        assert.ok(unit.nameHud.y+NAME_PANEL_HEIGHT<=conservativeTop-profile.nameHud.gap+1e-6,`${suitCode}:${weaponCode} nickname panel must clear every authored frame`);
      }
    }
  }finally{
    unit.destroy();
    effectLayer.destroy({children:true});
    if(!sheet.destroyed)sheet.destroy(true);
  }
});

test('twenty-character nicknames are ellipsized inside the fixed panel width',()=>{
  const unit=new AccountBattleUnit();
  const fakeLabel={
    _text:'',
    position:{set(x,y){this.x=x;this.y=y}},
    get text(){return this._text},
    set text(value){this._text=String(value||'')},
    get width(){return Array.from(this._text).reduce((sum,character)=>sum+(character==='…'?10:16),0)}
  };
  unit.nameLabel=fakeLabel;
  try{
    const full='가'.repeat(20);
    unit.setName(full);
    const diagnostics=unit.diagnostics().nickname;
    assert.equal(diagnostics.fullText,full);
    assert.equal(diagnostics.truncated,true);
    assert.match(diagnostics.displayText,/…$/);
    assert.ok(fakeLabel.width<=diagnostics.maxTextWidth,'display text must fit inside the panel content width');
    assert.ok(diagnostics.panelWidth<=188,'nickname panel must retain its maximum width');
    assert.ok(fakeLabel.width+24<=diagnostics.panelWidth,'panel padding must contain the fitted label');

    unit.setName('테스터');
    const shortDiagnostics=unit.diagnostics().nickname;
    assert.equal(shortDiagnostics.displayText,'테스터');
    assert.equal(shortDiagnostics.truncated,false);
  }finally{
    unit.destroy();
  }
});

test('account Battle Suit occupies the dedicated internal front-left support tile',()=>{
  const engine=Object.create(BattleEngine.prototype);
  engine.mobile=false;
  engine.configureIsometricScene();
  let formation=null;
  engine.accountBattleUnit={
    root:{depthSortY:0},
    setFormation(x,y,scale){formation={x,y,scale}}
  };
  engine.layoutAccountBattleUnit();
  const expected=engine.gridToScreen(2,5);
  assert.deepEqual({x:formation.x,y:formation.y},expected,'account unit must advance one cell toward the enemy side and center on the unused 2:5 tile');
  assert.ok(formation.x>=engine.gridToScreen(0,5).x&&formation.x<=engine.gridToScreen(2,5).x,'support tile must remain inside the canonical grid');
  engine.activeBattlefieldMode='ESCORT';
  engine.layoutAccountBattleUnit();
  assert.deepEqual(
    {x:formation.x,y:formation.y},
    engine.gridToScreen(1,5),
    'ESCORT must fall back to 1:5 because the objective vehicle owns 2:5'
  );
  engine.activeBattlefieldMode='HUNT';
  engine.layoutAccountBattleUnit();
  assert.deepEqual({x:formation.x,y:formation.y},expected,'leaving ESCORT must restore the advanced HUNT station');
  engine.isoFloorLayer=new Container({label:'FormationModeFloor'});
  engine.accountBattleUnitEnabled=true;
  engine.drawIsometricFloor();
  assert.equal(engine.accountBattleUnitTile.label,'AccountSupportTile:2:5','HUNT accent must follow the advanced station');
  engine.activeBattlefieldMode='ESCORT';
  engine.drawIsometricFloor();
  assert.equal(engine.accountBattleUnitTile.label,'AccountSupportTile:1:5','ESCORT accent must follow the safe fallback station');
  engine.isoFloorLayer.destroy({children:true});
  engine.accountBattleUnitTile={visible:false,accountSupportAccent:{visible:false}};
  engine.accountBattleUnitEnabled=true;
  engine.syncAccountBattleUnitTile();
  assert.equal(engine.accountBattleUnitTile.visible,true,'the internal grid cell must never become a visual hole');
  assert.equal(engine.accountBattleUnitTile.accountSupportAccent.visible,true,'PVE account unit enables its matching support accent');
  engine.accountBattleUnitEnabled=false;
  engine.syncAccountBattleUnitTile();
  assert.equal(engine.accountBattleUnitTile.visible,true,'forbidden modes retain the neutral base tile');
  assert.equal(engine.accountBattleUnitTile.accountSupportAccent.visible,false,'forbidden modes hide only the account support accent');
});

test('forced live replay redeploy restores all five allied Pixi visibility gates',async()=>{
  const makeCharacter=(id,team)=>({
    id,team,battleActive:true,baseX:100,baseY:200,restScale:.5,
    root:{visible:false,renderable:false,alpha:0,x:100,y:200,scale:{x:.5,y:.5}}
  });
  const allies=Array.from({length:5},(_,index)=>makeCharacter(`ALLY-${index+1}`,'ALLY'));
  const enemy=makeCharacter('ENEMY-1','ENEMY');
  let timelineCalls=0;
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    livePayload:true,liveDeployed:true,allies,enemies:[enemy],characters:[...allies,enemy],cards:[],
    accountBattleUnitEnabled:false,accountBattleUnit:null,
    updateStatus(){},
    timeline(build){
      timelineCalls+=1;
      const timeline={
        fromTo(target,_from,to){
          Object.entries(to).forEach(([key,value])=>{
            if(key!=='duration'&&key!=='ease')target[key]=value;
          });
          return this;
        }
      };
      build(timeline);
      return Promise.resolve(true);
    }
  });

  await engine.deployCards();
  assert.equal(timelineCalls,0,'ordinary live duplicate DEPLOY must retain the one-shot guard');
  assert.equal(allies.filter(character=>character.root.visible).length,0);

  await engine.deployCards({force:true});
  assert.equal(timelineCalls,1,'QC replay must bypass the live one-shot guard exactly once');
  assert.equal(allies.filter(character=>character.root.visible&&character.root.renderable&&character.root.alpha===1).length,5);
  assert.equal(engine.liveDeployed,true);
});

test('instant profile redeploy restores the full live formation without an empty-frame timeline',async()=>{
  const makeCharacter=(id,active=true)=>({
    id,battleActive:active,baseX:120,baseY:240,restScale:.55,
    root:{visible:false,renderable:false,alpha:0,x:-1,y:-1,scale:{x:0,y:0,set(value){this.x=value;this.y=value}}}
  });
  const allies=Array.from({length:5},(_,index)=>makeCharacter(`ALLY-${index+1}`));
  const enemy=makeCharacter('ENEMY-1');
  const inactive=makeCharacter('ENEMY-INACTIVE',false);
  const accountRoot={visible:false,renderable:false,alpha:0};
  let timelineCalls=0,layoutCalls=0,sortCalls=0;
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    livePayload:true,liveDeployed:false,allies,enemies:[enemy,inactive],characters:[...allies,enemy,inactive],cards:[],
    accountBattleUnitEnabled:true,
    accountBattleUnit:{
      active:true,root:accountRoot,
      setActive(next,{deployed}={}){
        this.active=Boolean(next);
        this.root.visible=this.root.renderable=this.active;
        this.root.alpha=this.active&&deployed?1:0;
        return this.active;
      }
    },
    updateStatus(){},
    layoutAccountBattleUnit(){layoutCalls+=1},
    sortCombatDepth(){sortCalls+=1},
    timeline(){timelineCalls+=1;return Promise.resolve(true)}
  });

  assert.equal(await engine.deployCards({force:true,instant:true}),true);
  assert.equal(timelineCalls,0,'profile swaps must not start the alpha-zero DEPLOY timeline');
  assert.equal(allies.filter(character=>character.root.visible&&character.root.renderable&&character.root.alpha===1).length,5);
  assert.equal(enemy.root.visible,true);
  assert.equal(inactive.root.visible,false);
  assert.deepEqual({x:allies[0].root.x,y:allies[0].root.y,scale:allies[0].root.scale.x},{x:120,y:240,scale:.55});
  assert.deepEqual(accountRoot,{visible:true,renderable:true,alpha:1});
  assert.equal(layoutCalls,1);
  assert.equal(sortCalls,1);
  assert.equal(engine.liveDeployed,true);
});

test('PVE sustained fire preserves weapon cadence differences and never enters the five-card damage contract',async()=>{
  const engine=Object.create(BattleEngine.prototype);
  const target={id:'ENEMY-1',hp:73,root:{x:900,y:420}};
  const allies=Array.from({length:5},(_,index)=>({id:`ALLY-${index+1}`,hp:100}));
  const cards=Array.from({length:5},(_,index)=>({id:`CARD-${index+1}`}));
  const unit={active:true,cancelFire(){}};
  const shots=[];
  const delays=[];
  Object.assign(engine,{
    visible:true,playing:false,accountBattleUnitEnabled:true,accountBattleUnit:unit,
    accountBattleUnitEquipment:{battleSuit:{code:SUIT_CODE},weapon:{code:'EQ_1785427638137'}},
    accountBattleUnitFireRun:null,accountBattleUnitDamageQueue:[],accountBattleUnitSustainedShotCount:0,
    currentEnemyTarget:target,enemies:[target],allies,cards,characters:[...allies,target],
    isAlive(character){return character.hp>0},
    async playAccountBattleUnitShot(victim,options){shots.push({victim,options});return true},
    async waitForAccountBattleUnitFire(delay,run){
      delays.push(delay);
      return run.active&&delays.length<5;
    }
  });

  const m4=engine.accountBattleUnitSustainedFireProfile();
  engine.accountBattleUnitEquipment.weapon={code:'EQ_1785961232958'};
  const ak=engine.accountBattleUnitSustainedFireProfile();
  engine.accountBattleUnitEquipment.weapon={code:'EQ_1785961300455'};
  const m200=engine.accountBattleUnitSustainedFireProfile();
  assert.equal(m4.fireMode,'FULL_AUTO');
  assert.equal(ak.fireMode,'FULL_AUTO');
  assert.ok(m4.roundsPerBurst>ak.roundsPerBurst,'M4A1 must retain the denser automatic burst');
  assert.equal(m200.fireMode,'BOLT_ACTION');
  assert.equal(m200.roundsPerBurst,1);
  assert.ok(m200.burstDelayMs>m4.burstDelayMs,'M200 must retain a slower bolt-action follow-up');

  engine.accountBattleUnitEquipment.weapon={code:'EQ_1785427638137'};
  const run=engine.startAccountBattleUnitSustainedFire();
  assert.ok(run?.active);
  const shotCount=await run.promise;
  assert.equal(shotCount,5);
  assert.equal(shots.length,5);
  assert.ok(shots.every(sample=>sample.victim===target&&sample.options.playbackRate===m4.playbackRate&&sample.options.authoritative===false));
  assert.deepEqual(delays,[m4.intraBurstDelayMs,m4.intraBurstDelayMs,m4.intraBurstDelayMs,m4.burstDelayMs,m4.intraBurstDelayMs]);
  assert.equal(engine.accountBattleUnitSustainedShotCount,5);
  assert.equal(engine.accountBattleUnitFireRun,null);
  assert.equal(allies.length,5);
  assert.equal(cards.length,5);
  assert.ok(allies.every(ally=>ally.hp===100),'presentation fire must not mutate allied HP');
  assert.equal(target.hp,73,'presentation fire must not mutate authoritative enemy HP');

  engine.accountBattleUnitEnabled=false;
  assert.equal(engine.startAccountBattleUnitSustainedFire(),null,'forbidden/non-PVE state must never start sustained fire');
});

test('server Battle Suit damage joins the next continuous round without controlling the fire loop',async()=>{
  let signalFirstShot;
  let releaseFirstShot;
  const firstShotStarted=new Promise(resolve=>{signalFirstShot=resolve});
  const firstShotGate=new Promise(resolve=>{releaseFirstShot=resolve});
  const target={id:'ENEMY-1',hp:100,root:{x:900,y:420}};
  const shots=[];
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    visible:true,playing:false,accountBattleUnitEnabled:true,
    accountBattleUnit:{active:true,cancelFire(){}},
    accountBattleUnitEquipment:{weapon:{code:'EQ_1785427638137'}},
    accountBattleUnitFireRun:null,accountBattleUnitDamageQueue:[],accountBattleUnitSustainedShotCount:0,
    currentEnemyTarget:target,enemies:[target],
    isAlive(character){return character.hp>0},
    async playAccountBattleUnitShot(victim,options){
      shots.push({victim,options});
      if(shots.length===1){signalFirstShot();await firstShotGate}
      return true;
    },
    async waitForAccountBattleUnitFire(_delay,run){return run.active&&shots.length<2}
  });

  const run=engine.startAccountBattleUnitSustainedFire();
  await firstShotStarted;
  const damagePromise=engine.queueAccountBattleUnitDamageShot(target,{
    damage:123456,targetHp:72,critical:true,authoritative:true,playbackRate:1
  });
  assert.equal(engine.accountBattleUnitDamageQueue.length,1,'server damage waits for the next weapon-cadence shot');
  releaseFirstShot();

  assert.equal(await damagePromise,true);
  assert.equal(await run.promise,2);
  assert.equal(shots[0].options.authoritative,false,'the loop starts before any server Battle Suit turn');
  assert.deepEqual(
    {damage:shots[1].options.damage,targetHp:shots[1].options.targetHp,critical:shots[1].options.critical,authoritative:shots[1].options.authoritative},
    {damage:123456,targetHp:72,critical:true,authoritative:true}
  );
  assert.equal(engine.accountBattleUnitDamageQueue.length,0);
  assert.equal(engine.accountBattleUnitSustainedShotCount,2);
});

test('preview sustained-fire hook schedules at anticipation and measures the exact authored FIRE frame',async()=>{
  const phases=[];
  const plan={profileId:'AR_M4A1_REAL_V1'};
  const target={hp:100,root:{x:900,y:420}};
  const unit={
    active:true,
    authoredProfile:{durationsMs:{ready:45}},
    hasAuthoredAnimation(){return true},
    applyAuthoredFrame(name){this.frame=name;return true},
    async playRangedFire(){
      this.applyAuthoredFrame('ready');
      this.applyAuthoredFrame('fire');
      this.applyAuthoredFrame('recover');
      return true;
    }
  };
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    visible:true,accountBattleUnitEnabled:true,accountBattleUnit:unit,
    accountBattleUnitFireRun:{active:true},accountBattleUnitShotCount:0,
    accountBattleUnitEquipment:{weapon:{code:'EQ_1785427638137'}},
    enemies:[target],
    isAlive(character){return character.hp>0},
    async accountBattleUnitPreviewFireHook(event){
      phases.push(event);
      return event.phase==='anticipation'?plan:null;
    }
  });

  assert.equal(await engine.playAccountBattleUnitCosmeticShot(target,{playbackRate:1.5}),true);
  assert.deepEqual(phases.map(event=>event.phase),['anticipation','fire']);
  assert.equal(phases[1].plan,plan);
  assert.equal(phases[1].weaponCode,'EQ_1785427638137');
  assert.equal(phases[0].visualLeadMs,30);
  assert.ok(Number.isFinite(phases[1].at));
  assert.equal(engine.accountBattleUnitShotCount,1);

  phases.length=0;
  engine.accountBattleUnitFireRun=null;
  assert.equal(await engine.playAccountBattleUnitCosmeticShot(target,{playbackRate:1}),true);
  assert.equal(phases.length,0,'manual/live calls without the preview sustained run must not receive the audio hook');
});

test('stopping sustained fire during audio anticipation prevents a late visual shot',async()=>{
  let releaseAnticipation;
  let signalAnticipationStarted;
  let visualShots=0;
  let cancellationProbe=null;
  const anticipationStarted=new Promise(resolve=>{signalAnticipationStarted=resolve});
  const anticipationGate=new Promise(resolve=>{releaseAnticipation=resolve});
  const target={hp:100,root:{x:900,y:420}};
  const unit={
    active:true,
    authoredProfile:{durationsMs:{ready:45}},
    hasAuthoredAnimation(){return true},
    applyAuthoredFrame(){return true},
    cancelFire(){},
    async playRangedFire(){visualShots+=1;return true}
  };
  const run={active:true,shots:0,timer:0,wake:null,promise:null};
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    visible:true,accountBattleUnitEnabled:true,accountBattleUnit:unit,
    accountBattleUnitFireRun:run,accountBattleUnitShotCount:0,
    accountBattleUnitEquipment:{weapon:{code:'EQ_1785427638137'}},
    enemies:[target],
    isAlive(character){return character.hp>0},
    async accountBattleUnitPreviewFireHook(event){
      if(event.phase!=='anticipation')return null;
      cancellationProbe=event.isCancelled;
      signalAnticipationStarted();
      return anticipationGate;
    }
  });

  const pendingShot=engine.playAccountBattleUnitCosmeticShot(target,{playbackRate:1});
  await anticipationStarted;
  assert.equal(cancellationProbe(),false);
  void engine.stopAccountBattleUnitSustainedFire();
  assert.equal(cancellationProbe(),true,'the pending audio hook must observe the stopped run before decode completes');
  releaseAnticipation({scheduled:false,reason:'CANCELLED_BY_STOP'});

  assert.equal(await pendingShot,false);
  assert.equal(run.active,false);
  assert.equal(visualShots,0,'cancelled anticipation must not start a late authored FIRE sequence');
  assert.equal(engine.accountBattleUnitShotCount,0);
});

test('preview runSequence replays authoritative battle-suit damage events and restores the canonical roster',async()=>{
  const makeCharacter=id=>({
    id,hp:100,root:{alpha:1,visible:true,renderable:true,position:{set(){}},scale:{set(){}}},
    setState(){},setHp(value){this.hp=value}
  });
  const allies=Array.from({length:5},(_,index)=>makeCharacter(`ALLY-${index+1}`));
  const enemies=Array.from({length:2},(_,index)=>makeCharacter(`ENEMY-${index+1}`));
  const cards=Array.from({length:5},()=>({
    alpha:1,baseX:0,baseY:0,restScale:1,hpValue:100,hp:{},
    position:{set(){}},scale:{set(){}}
  }));
  const eventBatches=[];
  const playOptions=[];
  let restores=0,starts=0,stops=0;
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    visible:true,playing:false,livePayload:true,liveDeployed:true,cards,allies,enemies,characters:[...allies,...enemies],
    uiLayer:{combo:{alpha:0,text:''},comboLabel:{alpha:0}},
    captureLivePreviewRosterState(){return {preserved:true}},
    cancelTimelines(){this.playing=false},
    startAccountBattleUnitSustainedFire(){starts+=1;return {active:true}},
    async stopAccountBattleUnitSustainedFire(){stops+=1;return 3},
    setHp(){},updateStatus(){},
    async playEvents(events,options={}){
      eventBatches.push(events.map(event=>event.type));
      playOptions.push(options);
      if(eventBatches.length===1){
        assert.deepEqual(eventBatches[0],['DEPLOY']);
        assert.equal(options.forceDeploy,true,'a replay of an already deployed live payload must bypass the one-shot deploy guard');
        this.characters.filter(character=>character.battleActive!==false).forEach(character=>{
          character.root.visible=true;
          character.root.renderable=true;
          character.root.alpha=1;
        });
      }else{
        assert.equal(
          events.filter(event=>event.actorKind==='BATTLE_SUIT'&&event.damageSource==='BATTLE_SUIT_INDEPENDENT').length,
          3,
          'the preview must include three independently damaging battle-suit turns'
        );
        assert.equal(
          this.allies.filter(character=>character.root.visible&&character.root.renderable&&character.root.alpha===1).length,
          5,
          'all five allied SD actors, including non-acting allies, must remain visible during replay actions'
        );
      }
    },
    restoreLivePreviewRosterState(snapshot){
      restores+=1;
      assert.deepEqual(snapshot,{preserved:true});
      return true;
    }
  });

  await engine.runSequence();
  assert.deepEqual(eventBatches,[
    ['DEPLOY'],
    ['TURN','ATTACK','TURN','SKILL','COUNTER','TURN','ULTIMATE','ATTACK']
  ]);
  assert.deepEqual(playOptions,[{forceDeploy:true},{}]);
  assert.equal(restores,1);
  assert.equal(starts,1,'continuous fire starts immediately after deployment');
  assert.equal(stops,1,'continuous fire always stops when preview playback finishes');
  assert.equal(engine.playing,false);
});

test('live preview replay restores all five allied SD units and the active enemy after the sequence',()=>{
  const makeCharacter=(id,team)=>{
    const root=new Container({label:id});
    root.visible=true;root.renderable=true;root.alpha=1;root.position.set(100,200);root.scale.set(.5);
    return {
      id,team,root,battleActive:true,baseX:100,baseY:200,restScale:.5,hp:100,state:'IDLE',
      setState(value){this.state=value},
      setHp(value){this.hp=value},
      setTint(){}
    };
  };
  const allies=Array.from({length:5},(_,index)=>makeCharacter(`ALLY-${index+1}`,'ALLY'));
  const enemy=makeCharacter('ENEMY-1','ENEMY');
  const cards=Array.from({length:5},(_,index)=>{
    const card=new Container({label:`CARD-${index+1}`});
    card.visible=true;card.renderable=true;card.alpha=1;card.baseX=index*10;card.baseY=700;card.restScale=.8;card.hpValue=100;
    card.position.set(card.baseX,card.baseY);card.scale.set(card.restScale);
    return card;
  });
  const accountRoot=new Container({label:'ACCOUNT'});
  accountRoot.visible=true;accountRoot.renderable=true;accountRoot.alpha=1;
  const engine=Object.create(BattleEngine.prototype);
  Object.assign(engine,{
    livePayload:{},characters:[...allies,enemy],allies,enemies:[enemy],cards,
    currentEnemyTarget:enemy,currentAllyTarget:allies[0],boss:enemy,bossHp:100,
    accountBattleUnitEnabled:true,
    accountBattleUnit:{active:true,root:accountRoot,cancelFire(){}},
    sortCombatDepth(){}
  });
  const snapshot=engine.captureLivePreviewRosterState();
  engine.characters.forEach(character=>{
    character.root.visible=false;character.root.renderable=false;character.root.alpha=0;
    character.root.position.set(-1,-1);character.setState('DEAD');character.setHp(0);
  });
  cards.forEach(card=>{card.visible=false;card.renderable=false;card.alpha=0;card.position.set(-1,-1)});
  accountRoot.alpha=0;

  assert.equal(engine.restoreLivePreviewRosterState(snapshot),true);
  assert.equal(allies.filter(character=>character.root.visible&&character.root.renderable&&character.root.alpha===1&&character.hp===100&&character.state==='IDLE').length,5);
  assert.equal(enemy.root.visible,true);
  assert.equal(enemy.root.renderable,true);
  assert.equal(enemy.root.alpha,1);
  assert.equal(enemy.hp,100);
  assert.ok(cards.every(card=>card.visible&&card.renderable&&card.alpha===1),'five dock cards must also survive replay');
  assert.equal(accountRoot.alpha,1,'account support unit must remain deployed');
  [...engine.characters.map(character=>character.root),...cards,accountRoot].forEach(node=>node.destroy?.());
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
    assert.equal(diagnostics.affectsDamage,true);
    assert.equal(diagnostics.damageAuthority,'SERVER_BATTLE_V2_TIMELINE');
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
