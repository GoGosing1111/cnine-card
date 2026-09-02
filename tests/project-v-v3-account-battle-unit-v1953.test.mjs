import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const [engine,unit,ballistic,live,bundle,readme]=await Promise.all([
  readFile(new URL('preview/project-v-v3/source/battle/BattleEngine.js',root),'utf8'),
  readFile(new URL('preview/project-v-v3/source/battle/AccountBattleUnit.js',root),'utf8'),
  readFile(new URL('preview/project-v-v3/source/battle/BallisticVFX.js',root),'utf8'),
  readFile(new URL('js/battle-v3-live.js',root),'utf8'),
  readFile(new URL('preview/project-v-v3/project-v-pixi-battle.bundle.js',root),'utf8'),
  readFile(new URL('preview/project-v-v3/source/battle/README.md',root),'utf8')
]);

// Canonical deck combatants remain five cards; the account unit is a sibling
// render object, not a sixth card or an HP-bearing target. Its server-side
// support fighter remains separate from this five-character visual array.
assert.match(engine,/const ISO_FORMATIONS=Object\.freeze\(\{[\s\S]*?allies:\[[\s\S]*?\{gridX:0,gridY:5,baseScale:\.5\}[\s\S]*?enemies:/);
assert.match(engine,/this\.accountBattleUnit=new AccountBattleUnit\(\{effectLayer:this\.effectLayer\}\);[\s\S]*this\.combatLayer\.addChild\(this\.accountBattleUnit\.root\)/);
assert.doesNotMatch(engine,/this\.(?:allies|characters|cards)\.push\(this\.accountBattleUnit\)/);
assert.doesNotMatch(unit,/\bsetHp\b|\bhpFill\b|\bserverMaxHp\b/);
assert.match(unit,/affectsDeck:false,[\s\S]*affectsDamage:true,[\s\S]*damageAuthority:'SERVER_BATTLE_V2_TIMELINE'/);

// Battle Suit body and DB weapon stay separate and the root is never moved by
// attack animation. Only the visual child recoils while server damage remains authoritative.
assert.match(unit,/this\.bodySprite\.label='BattleSuitBody'/);
assert.match(unit,/this\.weaponSprite\.label='DatabaseWeaponAttachment'/);
const rangedFire=unit.slice(unit.indexOf('playRangedFire('),unit.indexOf('\n  diagnostics(){'));
assert.match(rangedFire,/this\.weaponSprite/);
assert.match(rangedFire,/this\.view/);
assert.match(rangedFire,/this\.ballisticVfx\.createShot/);
assert.match(ballistic,/PVEAccountBattleUnitCosmeticShot/);
assert.match(ballistic,/renderer:'PIXI_RASTER_ATLAS'/);
assert.match(ballistic,/cssEffects:false/);
assert.match(ballistic,/BallisticTracerCore/);
assert.match(ballistic,/BallisticMonsterImpactAtlas/);
assert.doesNotMatch(ballistic,/\bGraphics\b|roundRect\(|\.circle\(|\.lineTo\(/,
  'muzzle, tracer and monster impact must be authored raster sprites, not runtime vector/CSS stand-ins');
assert.doesNotMatch(rangedFire,/this\.root\.(?:x|y|position)|damage|setHp|syncTargetHp/);
assert.match(engine,/triggerAccountBattleUnitBallisticHit/);
assert.match(unit,/prepareRangedFireEffects\(\)\{[\s\S]*this\.ballisticVfx\?\.prepare/);
assert.match(engine,/async playAccountBattleUnitShot[\s\S]*await unit\.prepareRangedFireEffects\(\)[\s\S]*if\(previewHook\)/,
  'cold ballistic assets must finish before recorded audio is scheduled');
assert.match(engine,/victim\.setState\(CHARACTER_STATE\.HIT\)/);
assert.match(engine,/isAccountBattleUnitDamageEvent\(event\)/);
assert.match(engine,/actorId\.includes\(':BATTLE_SUIT:'\)/);
assert.match(engine,/await this\.queueAccountBattleUnitDamageShot\(target,\{[\s\S]*authoritative:!event\.dodge/);
assert.match(engine,/this\.syncTargetHp\(victim,Number\(targetHp\)\)/);
assert.match(engine,/this\.accountBattleUnitDamageTotal\+=/);
assert.match(engine,/independentOfCardTurns:true/);
assert.match(engine,/independentOfActionGauge:true/);
assert.match(live,/startAccountBattleUnitContinuousFire\(\)/);
assert.match(live,/finally \{[\s\S]*await stopAccountBattleUnitContinuousFire\(\)/);

// Public payload contract: top-level wins, characterBonus/bonuses are fallback
// only. Nickname is optional and follows the requested priority.
assert.match(engine,/const ownsTop=Object\.prototype\.hasOwnProperty\.call\(payload,key\)/);
assert.match(engine,/payload\?\.characterBonus\?\.\[key\][\s\S]*payload\?\.bonuses\?\.\[key\]/);
assert.match(engine,/payload\?\.accountNickname\|\|payload\?\.user\?\.nickname\|\|payload\?\.profile\?\.nickname\|\|payload\?\.nickname/);
assert.match(unit,/this\.nameHud\.visible=Boolean\(name\)/);
assert.match(unit,/NAME_HUD_SCREEN_SCALE\/rootScale/,'Battle Suit nickname must compensate for the small formation scale');
assert.match(unit,/fontSize:18/,'Battle Suit nickname must retain a readable authored font size');
assert.match(unit,/stroke:\{color:0x00111c,width:4/,'Battle Suit nickname must retain a high-contrast edge over bright battlefields');
assert.match(unit,/screenScale:Number\(\(this\.root\?\.scale\?\.x\|\|1\)\*\(this\.nameHud\?\.scale\?\.x\|\|1\)\)/,'nickname diagnostics must expose its effective screen scale');
assert.match(readme,/PVE 계정 배틀슈트 유닛 계약[\s\S]*equippedBattleSuit[\s\S]*equippedWeapon[\s\S]*5장과 분리된 타깃 불가 지원 액터/);
assert.match(readme,/서버가 `characterBonus\.battleSuitPve`[\s\S]*독립 피해/);

// Only approved transparent weapon cutouts may override DB card art. Unknown
// generic image/imageUrl values are deliberately absent from the weapon helper.
for(const [code,file] of Object.entries({
  EQ_1785427638137:'avalon-m4a1-v1.png',
  EQ_1785961232958:'infinity-ak-v1.png',
  EQ_1785961300455:'infinity-m200-v1.png',
  EQ_1786966923833:'sovereign-sks-v1.png'
})){
  assert.match(engine,new RegExp(`${code}:[^\\n]*${file.replaceAll('.','\\.')}`));
  assert.match(bundle,new RegExp(file.replaceAll('.','\\.')));
}
const weaponHelper=engine.slice(engine.indexOf('function weaponAppearanceUrl'),engine.indexOf('\nfunction accountNickname'));
assert.doesNotMatch(weaponHelper,/item\.image(?:Url|_url)?/);

// Both the wrapper and engine hard-deny competitive/captain contexts. The
// wrapper stamp prevents CAPTAIN from being reclassified as the HUNT backdrop.
assert.match(live,/ACCOUNT_UNIT_FORBIDDEN_MODE[\s\S]*PVP[\s\S]*SIEGE[\s\S]*TERRITORY[\s\S]*CAPTAIN/);
assert.match(engine,/ACCOUNT_UNIT_FORBIDDEN_MODE[\s\S]*PVP[\s\S]*SIEGE[\s\S]*TERRITORY[\s\S]*CAPTAIN/);
assert.match(live,/v3RenderContext:[\s\S]*accountBattleUnitPve/);
assert.match(live,/root\.loadUser\?\.\(\)\?\.nickname/);
assert.match(engine,/if\(wrapperGate===false\)return false/);

const payloads=[];
const phase={textContent:''};
const status={textContent:''};
const classList={add(){},remove(){}};
const canvas={width:1600,height:820,parentNode:null,getContext:()=>({isContextLost:()=>false})};
const loader={remove(){}};
const host={
  querySelector(selector){return selector==='canvas'?canvas:selector==='.battle-v3-loader'?loader:null},
  querySelectorAll(){return []},
  appendChild(node){node.parentNode=this}
};
canvas.parentNode=host;
const stage={
  classList,
  querySelector(selector){
    if(selector==='#battlePhase')return phase;
    if(selector==='#pvBattleStatus')return status;
    return null;
  },
  querySelectorAll(){return []}
};
const modal={classList};
let firearmHook=null;
let sustainedStarts=0;
let sustainedStops=0;
const context={
  console,setTimeout,clearTimeout,Promise,
  requestAnimationFrame(callback){callback(0);return 1},
  document:{querySelectorAll(){return []}},
  window:null,
  ProjectVPixiBattle:{
    diagnostics(){return {mounted:true}},
    async mountForBattle(payload){payloads.push(payload)},
    async resetSession(payload){payloads.push(payload)},
    async setBattlefield(){},
    async setVisible(){},
    async playEvents(){},
    setAccountPreviewFirearmHook(hook){if(typeof hook==='function')firearmHook=hook;return Boolean(hook)},
    startAccountBattleUnitSustainedFire(){sustainedStarts+=1},
    stopAccountBattleUnitSustainedFire(){sustainedStops+=1;return 0},
    destroy(){},
    cancelActiveAnimations(){}
  }
};
context.window=context;
vm.runInNewContext(live,context,{filename:'battle-v3-live.js'});

const battleV2={rules:{battleSuitDamageAuthority:'SERVER_TIMELINE'},teams:{A:{cards:[],supports:[{id:'A:SUPPORT:BATTLE_SUIT:BATTLE_SUIT_01',actorKind:'BATTLE_SUIT',authoritative:true,damageAuthority:'SERVER_TIMELINE'}]},B:{cards:[]}},result:{timeline:[]}};
const suit={code:'BATTLE_SUIT_01',battleSprite:'/suit.png'};
const weapon={code:'EQ_1785427638137',image:'/square-card-art.png',battleSprite:''};
let pveRenderer=null;
for(const mode of ['PVE','PVP','SIEGE','CAPTAIN']){
  const renderer=await context.ProjectVBattleV3Live.createRenderer({stage,host,modal,mode,playerName:'테스터',data:{battleV2,equippedBattleSuit:suit,characterBonus:{equippedWeapon:weapon}}});
  if(mode==='PVE')pveRenderer=renderer;
}
await context.ProjectVBattleV3Live.createRenderer({stage,host,modal,mode:'PVE',playerName:'테스터',data:{battleV2:{teams:{A:{cards:[]},B:{cards:[]}},result:{timeline:[]}},equippedBattleSuit:suit,characterBonus:{equippedWeapon:weapon}}});
assert.equal(payloads.length,5);
assert.equal(payloads[0].v3RenderContext.accountBattleUnitPve,true,'PVE must enable the auxiliary unit gate');
assert.equal(payloads[1].v3RenderContext.accountBattleUnitPve,false,'PVP must disable the auxiliary unit gate');
assert.equal(payloads[2].v3RenderContext.accountBattleUnitPve,false,'territory/siege must disable the auxiliary unit gate');
assert.equal(payloads[3].battlefieldMode,'HUNT','captain currently reuses the fallback battlefield');
assert.equal(payloads[3].v3RenderContext.accountBattleUnitPve,false,'captain must stay disabled even on the fallback battlefield');
assert.equal(payloads[4].v3RenderContext.accountBattleUnitPve,false,'PVE metadata without an authoritative support actor must not render a cosmetic-only Battle Suit');
assert.equal(payloads[0].equippedBattleSuit.battleSprite,'/suit.png');
assert.equal(payloads[0].characterBonus.equippedWeapon.image,'/square-card-art.png','wrapper must preserve authoritative metadata for the engine code map');
assert.equal(payloads[0].accountNickname,'테스터','PVE wrapper must carry the signed-in account name into the Pixi payload');
assert.equal(typeof firearmHook,'function','live PVE must bind recorded firearm audio to the Battle Suit shot hook');
await pveRenderer.play();
assert.equal(sustainedStarts,1,'Battle Suit sustained fire must start once after deployment, independently of timeline turns');
assert.equal(sustainedStops,1,'Battle Suit sustained fire must stop once when the battle playback ends');

console.log('Project V V3 PVE-only account Battle Suit unit contract: PASS');

// Keep the release-gated `npm run test:battle-suit` command authoritative
// without changing package.json: these imported suites cover the authored
// 4x2 suit/DB-weapon atlases and their runtime fallback/mode behavior.
await import('./project-v-battle-suit-animation-assets-v1955.test.mjs');
await import('./project-v-battle-suit-animation-runtime-v1955.test.mjs');
