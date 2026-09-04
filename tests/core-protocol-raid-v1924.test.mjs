import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  defaultCoreRaidSettings,createCoreRaidChallenge,evaluateCoreRaidQte,
  coreRaidContribution,resolveCoreRaidAggregate,buildCoreRaidBattlePayload,coreRaidFeatureAccess
} from '../functions/_raid_core_protocol.js';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const cards=[
  {id:'A1',title:'공격',power_type:'ATTACK',power:50000,image:'/a.png'},
  {id:'D1',title:'방어',power_type:'DEFENSE',power:50000,image:'/d.png'},
  {id:'S1',title:'속도',power_type:'SPEED',power:50000,image:'/s.png'},
  {id:'H1',title:'생명',power_type:'HP',power:50000,image:'/h.png'},
  {id:'A2',title:'공격2',power_type:'ATTACK',power:50000,image:'/a2.png'}
];

test('core protocol challenge is deterministic and contains both QTE contracts',()=>{
  const settings=defaultCoreRaidSettings(),first=createCoreRaidChallenge({instanceId:'CORE-1',userId:7,cards,settings}),second=createCoreRaidChallenge({instanceId:'CORE-1',userId:7,cards,settings});
  assert.deepEqual(first,second);
  assert.equal(first.sequence.length,settings.sequenceLength);
  assert.equal(first.weaknessCycle.length,5);
  assert.ok(first.mashTarget>=settings.mashTarget-1&&first.mashTarget<=settings.mashTarget+1);
});

test('staged release is TEST and reward-locked, with explicit tester access only',()=>{
  const defaults=defaultCoreRaidSettings();
  assert.equal(defaults.mode,'TEST');assert.equal(defaults.rewardLocked,true);assert.deepEqual(defaults.testUsers,[]);
  assert.equal(coreRaidFeatureAccess({id:1,nickname:'운영자',role:'OWNER'},defaults).accessible,true);
  assert.equal(coreRaidFeatureAccess({id:2,nickname:'테스터',role:'USER'},{...defaults,testUsers:['테스터']}).accessible,true);
  assert.equal(coreRaidFeatureAccess({id:3,nickname:'일반유저',role:'USER'},defaults).accessible,false);
  assert.equal(coreRaidFeatureAccess({id:3,nickname:'일반유저',role:'USER'},{...defaults,mode:'ON'}).accessible,true);
});

test('server replays direction and mash traces instead of trusting success booleans',()=>{
  const challenge={sequence:['UP','RIGHT','DOWN','LEFT'],sequenceWindowMs:5500,mashTarget:10,mashWindowMs:5000};
  const success=evaluateCoreRaidQte(challenge,{sequence:{inputs:challenge.sequence.map((key,index)=>({key,at:300+index*400}))},mash:{presses:Array.from({length:10},(_,index)=>200+index*90)}});
  assert.equal(success.allSuccess,true);
  assert.equal(success.sequence.perfect,true);
  assert.equal(success.mash.perfect,true);
  assert.equal(success.suppressionScore,120);
  const forged=evaluateCoreRaidQte(challenge,{sequence:{success:true,inputs:[{key:'LEFT',at:100}]},mash:{success:true,presses:[1,2,3,4,5,6,7,8,9,10]}});
  assert.equal(forged.allSuccess,false);
  assert.equal(forged.sequence.success,false);
  assert.equal(forged.mash.success,false,'impossibly dense mash presses must be filtered');
});

test('deck roles, selected operation, QTE and damage contribute independently',()=>{
  const settings=defaultCoreRaidSettings(),challenge={weaknessCycle:['ATTACK','DEFENSE','SPEED','HP','ATTACK']},qte={allSuccess:true,suppressionScore:110};
  const contribution=coreRaidContribution({cards,totalPower:250000,operation:'BREAK',challenge,qte,settings});
  assert.equal(contribution.analysisScore,100);
  assert.equal(contribution.coreScore,70);
  assert.equal(contribution.suppressionScore,110);
  assert.ok(contribution.totalDamage>0);
});

test('shared boss HP is gated by analysis, all three cores, then suppression',()=>{
  const settings={...defaultCoreRaidSettings(),bossMaxHp:300000000,analysisRequired:200,coreRequired:120,suppressionRequired:300};
  const missingCore=[
    {status:'RESOLVED',operation:'BREAK',analysis_score:100,core_score:140,suppression_score:120,total_damage:200000000},
    {status:'RESOLVED',operation:'BLOCK',analysis_score:100,core_score:140,suppression_score:120,total_damage:200000000}
  ];
  const gated=resolveCoreRaidAggregate(missingCore,settings);
  assert.equal(gated.analysisReady,true);assert.equal(gated.coresReady,false);assert.equal(gated.phase,2);assert.ok(gated.bossHp>=settings.bossMaxHp*.3);
  assert.deepEqual(gated.bossBuffs.map(buff=>buff.core),['STABILIZE']);assert.equal(gated.bossDamageReductionPct,16);assert.ok(gated.effectiveDamage<gated.totalDamage);
  const cleared=resolveCoreRaidAggregate([...missingCore,{status:'RESOLVED',operation:'STABILIZE',analysis_score:100,core_score:140,suppression_score:120,total_damage:200000000}],settings);
  assert.equal(cleared.coresReady,true);assert.equal(cleared.suppressionReady,true);assert.equal(cleared.cleared,true);assert.equal(cleared.bossHp,0);assert.deepEqual(cleared.bossBuffs,[]);
});

test('V3 payload combines all three phases and conditional QTE branches',()=>{
  const settings=defaultCoreRaidSettings(),challenge=createCoreRaidChallenge({instanceId:'CORE-2',userId:9,cards,settings}),aggregate={bossBuffs:[{id:'GRAVITY_ARMOR',core:'BREAK',name:'초중력 외피',effect:'누적 피해 18% 경감',damageReductionPct:18}]},createBattle=({cards:engineCards,monster})=>({engine:'BATTLE_ENGINE_V2',teams:{A:{cards:engineCards.map(card=>({...card,cardId:card.id}))},B:{cards:[{id:'B:0',cardId:'MONSTER:CORE',name:monster.name,image:monster.image,maxHp:100,hp:100}]}},result:{winner:'A',timeline:[{type:'TURN',actorId:'A1',targetId:'B:0',damage:10,targetHpAfter:90},{type:'RESULT',winner:'A'}]}}),payload=buildCoreRaidBattlePayload({participant:{instance_id:'CORE-2',user_id:9,deck_snapshot:JSON.stringify({cards,power:250000,cardPower:250000,characterBonus:{pve:0}}),challenge_json:JSON.stringify(challenge),operation:'STABILIZE',total_power:250000},settings,aggregate,createBattle}),types=payload.battleV2.result.timeline.map(event=>event.type);
  assert.equal(payload.contentType,'CORE_PROTOCOL');
  assert.equal(payload.battleV2.engine,'BATTLE_ENGINE_V2');
  assert.equal(payload.battleV2.result.winner,'PENDING');
  assert.ok(types.includes('TURN'),'authoritative Battle V2 events must be preserved');
  for(const type of ['RAID_PHASE_CHANGE','RAID_WEAKNESS_REVEAL','RAID_OPERATION_REVEAL','RAID_BOSS_BUFF','RAID_CORE_BREAK','RAID_QTE_SEQUENCE','RAID_QTE_MASH','RAID_STAGGER','BOSS_ULTIMATE'])assert.ok(types.includes(type),`${type} missing`);
  assert.equal(payload.coreRaid.bossBuffs[0].id,'GRAVITY_ARMOR');
  assert.ok(payload.battleV2.result.timeline.some(event=>event.qteCondition==='ALL_SUCCESS'));
  assert.ok(payload.battleV2.result.timeline.some(event=>event.qteCondition==='ANY_FAILURE'));
});

test('core raid payload preserves live V3 roster art and keeps battle sprites separate',()=>{
  const sourceCard={...cards[0],image:'/assets/cards/source-card.webp',image_url:'/assets/cards/stale-source.webp',battleSprite:'/assets/ui/project-v/characters/card-sd-v1.png',battle_sprite:'/assets/ui/project-v/characters/stale-card-sd.png'};
  const challenge={challengeId:'CORE-PRESENTATION',weaknessCycle:['ATTACK'],sequence:['UP'],sequenceWindowMs:5500,mashTarget:10,mashWindowMs:5000};
  const payload=buildCoreRaidBattlePayload({participant:{deck_snapshot:JSON.stringify([sourceCard]),challenge_json:JSON.stringify(challenge),operation:'BREAK',total_power:50000}});
  const normalized=payload.battleV2.teams.A.cards[0];
  assert.equal(normalized.image,'/assets/cards/source-card.webp');
  assert.equal(normalized.image_url,'/assets/cards/source-card.webp');
  assert.equal(normalized.battleSprite,'/assets/ui/project-v/characters/card-sd-v1.png');
  assert.equal(normalized.battle_sprite,'/assets/ui/project-v/characters/card-sd-v1.png');
  assert.deepEqual(payload.presentation,{
    owner:'PROJECT_V_V3_LIVE',
    characterRenderer:'PROJECT_V_PIXI_V3',
    rosterRenderer:'LIVE_V3_ROSTER',
    cardFrameRenderer:'LIVE_CARD_FRAME',
    preserveCardSourceArt:true
  });
  const noSourceArt=buildCoreRaidBattlePayload({participant:{deck_snapshot:JSON.stringify([{...sourceCard,image:'',image_url:''}]),challenge_json:JSON.stringify(challenge),operation:'BREAK',total_power:50000}}).battleV2.teams.A.cards[0];
  assert.equal(noSourceArt.image,'','SD must never be promoted into the roster card image');
});

test('core raid integration delegates presentation to live V3 without overriding its UI',()=>{
  const raidUi=read('js/core-protocol-raid-v1924.js'),raidCss=read('css/core-protocol-raid-v1924.css'),liveV3=read('js/battle-v3-live.js');
  assert.match(raidUi,/playRaidBattleV3Live\s*\(\s*\{[\s\S]*?preserveServerTimeline\s*:\s*true/);
  assert.doesNotMatch(raidUi,/ProjectVBattleV3Live(?:\?\.|\.)createRenderer/);
  assert.match(raidUi,/core-v3-mechanic-result/,'mechanic result must be appended as a core-owned layer');
  assert.doesNotMatch(raidUi,/suppressDefaultVerdict/,'core raid must not suppress the live V3 result layer');
  const coreOwnedSource=`${raidUi}\n${raidCss}`;
  for(const selector of ['[data-v3-verdict]','#battleMessage','.card-frame','.battle-v3-roster','.battle-v3-roster-card','[data-v3-roster','.battle-character','.project-v-battle-character','[data-formation']){
    assert.equal(coreOwnedSource.includes(selector),false,`core raid must not target live V3 selector ${selector}`);
  }
  assert.match(liveV3,/class="zenith-card-frame"[^>]+zenith-frame-concept-v2\.png/,'live V3 roster must retain the ZENITH frame layer');
  assert.match(liveV3,/class="superstar-card-frame"[^>]+superstar-championship-frame-v1\.webp/,'live V3 roster must retain the SUPERSTAR frame layer');
});

test('core raid preview uses the live V3 art chain and separates roster art from SD assets',()=>{
  const previewIndex=read('preview/core-protocol-raid-v1/index.html'),preview=read('preview/core-protocol-raid-v1/preview.js');
  for(const adapter of ['project-v-battle-art-adapter-v1.js','project-v-tier-battle-art-adapter-v1.js','project-v-monster-battle-art-adapter-v1.js','project-v-unassigned-battle-fallback-v1.js']){
    assert.match(previewIndex,new RegExp(adapter.replaceAll('.','\\.')));
  }
  for(const style of ['card.css','battle-v3-live.css','zenith-v1.css','superstar-v1.css','faker-card-v1.css','no-light-beams-v1789.css','breakthrough-tier-v1802.css']){
    assert.match(previewIndex,new RegExp(style.replaceAll('.','\\.')),`preview must load the live roster style ${style}`);
  }
  assert.match(preview,/cnineCardCatalog\s*=\s*\(\)\s*=>\s*deck/,'preview roster must resolve card source art through the live catalog contract');
  assert.doesNotMatch(preview,/Faker|페이커|ZENITH\s*0[1-9]/i);
  const deckBlock=preview.match(/const deck=\[(.*?)\];/s)?.[1]||'';
  const sampleCards=[...deckBlock.matchAll(/\{[^{}]*\}/g)].map(match=>match[0]);
  assert.equal(sampleCards.length,5,'preview deck must contain five live-shaped sample cards');
  for(const card of sampleCards){
    const sourceArt=card.match(/\bimage\s*:\s*'([^']+)'/)?.[1];
    const battleSprite=card.match(/\bbattleSprite\s*:\s*'([^']+)'/)?.[1];
    assert.ok(sourceArt,`sample card is missing source art: ${card}`);
    assert.ok(battleSprite,`sample card is missing battleSprite: ${card}`);
    assert.notEqual(sourceArt,battleSprite,'preview must not use an SD battle sprite as roster/card artwork');
  }
});

test('core protocol is wired as a hidden TEST tab while legacy raid entry stays direct',()=>{
  const app=read('js/app.js'),pve=read('js/pve-command-v2-live.js'),api=read('functions/api/[[path]].js'),server=read('functions/_raid_core_protocol.js'),bridge=read('js/battle-v3-live.js'),qte=read('js/project-v-raid-qte-v1924.js'),raidUi=read('js/core-protocol-raid-v1924.js'),raidCss=read('css/core-protocol-raid-v1924.css'),index=read('index.html'),previewIndex=read('preview/core-protocol-raid-v1/index.html');
  assert.match(pve,/id="pveRaidView"/);assert.match(pve,/data-raid-content="core"[^>]+aria-hidden="true"[^>]+hidden/);assert.match(pve,/id="pveCoreRaidView"/);
  assert.match(app,/if\(mode==='raid'\)[\s\S]{0,500}loadRaidView\(\);/,'legacy raid must still be entered directly');assert.match(app,/CNineCoreRaidBridge/);
  assert.match(api,/handleRaidCoreProtocol/);assert.match(server,/raid\/core\/feature/);assert.match(server,/raid\/core\/join/);assert.match(server,/raid\/core\/resolve/);assert.match(server,/raid\/core\/claim/);
  assert.match(server,/raidDeckPower\(env,user\.id,body\.cardIds,'RAID'\)/);assert.match(server,/createBattle:createPveBattleV2/);assert.doesNotMatch(server,/pveDeckSnapshot/);assert.doesNotMatch(server,/let ensurePromise/);
  assert.match(bridge,/RAID_QTE_SEQUENCE/);assert.match(bridge,/RAID_QTE_MASH/);assert.match(bridge,/getInteractiveResults/);assert.match(bridge,/qteCondition/);
  assert.match(qte,/addEventListener\('keydown'/);assert.match(qte,/addEventListener\('pointerdown'/);assert.match(qte,/addEventListener\('pointerup'/);assert.match(qte,/swipeStart/);assert.doesNotMatch(qte,/data-qte-dir/);assert.match(qte,/data-qte-mash/);
  assert.match(raidUi,/ACTIVE BOSS ENHANCEMENTS/);assert.match(raidUi,/bossDamageReductionPct/);assert.match(raidUi,/data-core-buff/);
  assert.doesNotMatch(raidUi,/async function loadFeature\(\)[\s\S]{0,500}?activeTab='world'/,'feature denial must retain the previous Core tab long enough to restore the legacy raid');
  assert.match(raidUi,/const previousTab=activeTab[\s\S]{0,600}?previousTab==='core'[\s\S]{0,120}?activateLegacyRaid/,'losing Core access must reload the legacy world raid');
  assert.match(raidUi,/core-mechanic-flow/);assert.match(raidUi,/role="progressbar"/);assert.match(raidCss,/conic-gradient/);assert.match(raidCss,/coreSignalX/);assert.match(raidCss,/coreSignalY/);
  assert.match(index,/core-protocol-raid-v1924\.css\?v=2021-test-gated-live/);assert.match(index,/project-v-raid-qte-v1924\.js\?v=2021-sequence-swipe/);assert.match(index,/core-protocol-raid-v1924\.js\?v=2021-test-gated-live/);
  assert.match(previewIndex,/core-protocol-raid-v1924\.css/);assert.match(previewIndex,/project-v-raid-qte-v1924\.js/);assert.match(previewIndex,/core-protocol-raid-v1924\.js/);
});
