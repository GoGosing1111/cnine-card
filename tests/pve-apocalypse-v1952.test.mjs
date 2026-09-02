import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {
  APOCALYPSE_ENERGY_CONFIG,
  apocalypseChallengeMultiplier,
  nightmareChallengeMultiplier,
  normalizeApocalypseSettings,
  normalizeNightmareSettings,
  pveDifficultyRuntime
} from '../functions/_pve_nightmare.js';
import {buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';

const defaults=normalizeApocalypseSettings();
assert.deepEqual(defaults.energy,APOCALYPSE_ENERGY_CONFIG);
assert.equal(defaults.energy.maxEnergy,5);
assert.equal(defaults.energy.rechargeMinutes,30);
assert.ok(defaults.hpPercent>normalizeNightmareSettings().hpPercent);
assert.ok(defaults.attackPercent>normalizeNightmareSettings().attackPercent);
assert.ok(defaults.defensePercent>normalizeNightmareSettings().defensePercent);
assert.ok(defaults.speedPercent>normalizeNightmareSettings().speedPercent);
assert.ok(apocalypseChallengeMultiplier(defaults)>nightmareChallengeMultiplier(normalizeNightmareSettings()));

const monster={id:952,pveTab:'APOCALYPSE',battlePower:100000,rewardCoin:1000,name:'TEST APOCALYPSE'};
const runtime=pveDifficultyRuntime({nightmare:normalizeNightmareSettings(),apocalypse:defaults},monster);
assert.equal(runtime.difficulty,'APOCALYPSE');
assert.equal(runtime.isApocalypse,true);
assert.ok(runtime.effectiveBattlePower>pveDifficultyRuntime({nightmare:normalizeNightmareSettings()},{...monster,pveTab:'NIGHTMARE'}).effectiveBattlePower);
assert.equal(runtime.effectiveRewardCoin,4000);
assert.equal(runtime.shieldPercent,40);
assert.equal(runtime.attackCount,2);
assert.equal(runtime.forcedActionEvery,4);
assert.equal(runtime.apocalypseSkill.enabled,true);
assert.equal(runtime.apocalypseSkill.damagePercent,28);

const fighter=buildMonsterFighter(runtime.engineMonster);
assert.equal(fighter.attackCount,2);
assert.equal(fighter.forcedActionEvery,4);
assert.equal(fighter.maxShield,Math.round(fighter.maxHp*.4));
assert.equal(fighter.shield,fighter.maxShield);
const player={id:'A:TEST',cardId:'TEST',side:'A',slot:0,row:'FRONT',title:'TEST',grade:'TEST',maxHp:1_000_000_000,hp:1_000_000_000,attack:1,defense:1_000_000,speed:55,shield:0,maxShield:0,gauge:0,type:'NONE',alive:true,emergencyUsed:false,survivalUsed:false,frontlineAnnounced:false,actions:0,damageDealt:0,healingDone:0};
fighter.gauge=100;
const simulation=simulateBattleV2Preview({teamA:[player],teamB:[fighter],openingBossUltimatePercent:runtime.apocalypseSkill.damagePercent,bossUltimateCapPercent:runtime.bossUltimateCapPercent,forcedMonsterEvery:runtime.forcedActionEvery,maxActions:4,seed:1952});
assert.ok(simulation.timeline.some(event=>event.type==='BOSS_ULTIMATE'&&event.damagePercent===28),'exclusive opening skill must resolve as real damage');
assert.ok(simulation.timeline.some(event=>event.type==='MONSTER_MULTI_ATTACK_READY'&&event.attackCount===2),'multi-attack must be scheduled in the authoritative timeline');
assert.ok(simulation.timeline.filter(event=>event.type==='TURN'&&event.actorId===fighter.id).length>=2,'the monster must perform the configured repeated attacks');

const apiSource=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const appSource=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const dropSource=readFileSync(new URL('../functions/_drop_pool.js',import.meta.url),'utf8');
const adminSource=readFileSync(new URL('../admin/apocalypse-admin-v1952.js',import.meta.url),'utf8');
const indexSource=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const packageSource=readFileSync(new URL('../package.json',import.meta.url),'utf8');
const battleCharacterSource=readFileSync(new URL('../preview/project-v-v3/source/battle/BattleCharacter.js',import.meta.url),'utf8');
const battleEngineSource=readFileSync(new URL('../preview/project-v-v3/source/battle/BattleEngine.js',import.meta.url),'utf8');
const apocalypseFxSource=readFileSync(new URL('../preview/project-v-v3/source/battle/ApocalypseBossUltimateFX.js',import.meta.url),'utf8');
const apocalypseAtlas=JSON.parse(readFileSync(new URL('../assets/ui/project-v/fx/apocalypse-boss-ultimate-v1/boss-ultimate-impact-atlas-v2.json',import.meta.url),'utf8'));
const apocalypseAudioPath=new URL('../assets/sfx/v3-apocalypse-boss-ultimate-v1/boss-ultimate-combat-v2.mp3',import.meta.url);
assert.match(apiSource,/CREATE TABLE IF NOT EXISTS user_apocalypse_energy/);
assert.match(apiSource,/function apocalypseEnergySchemaStatements\(env\)/);
assert.match(apiSource,/env\.DB\?\.dialect==='postgres'&&typeof env\.DB\.execSchema==='function'\)await env\.DB\.execSchema\(schema\)/,'PostgreSQL must execute the Apocalypse energy DDL instead of silently skipping it');
assert.match(apiSource,/apocalypseEnergyState\(env,user,maintenance\)\.catch\(/,'an Apocalypse storage fault must not block the standard PVE energy response');
assert.match(apiSource,/if\(databaseInitialized\)\{[\s\S]*await ensurePrisonFoundation\(env\);[\s\S]*await ensureApocalypseEnergyFoundation\(env\)/,'production health checks must create and verify the Apocalypse energy relation before player traffic');
assert.match(apiSource,/apocalypseEnergySchema:true/);
assert.match(apiSource,/NO_APOCALYPSE_ENERGY/);
assert.match(apiSource,/consumePveEnergyForDifficulty/);
assert.match(apiSource,/battle_apocalypse_settings_v1/);
assert.match(apiSource,/apocalypseSkillCast/);
assert.match(appSource,/\['NORMAL','HARD','HELL','NIGHTMARE','APOCALYPSE'\]/,'Apocalypse must sit immediately after Nightmare');
assert.match(appSource,/apocalypseEnergy/);
assert.doesNotMatch(appSource,/battleState\.apocalypseEnergy\|\|battleState\.energy/,'the client must never substitute standard PVE energy for Apocalypse energy');
assert.match(appSource,/unavailable:true,energy:0,maxEnergy:5/);
assert.match(appSource,/CMS에서 아포칼립스 몬스터를 추가하세요/);
assert.match(dropSource,/PVE_APOCALYPSE_AUTO/);
assert.match(dropSource,/SAVE_APOCALYPSE_BINDINGS/);
assert.match(adminSource,/data-ap-shield/);
assert.match(adminSource,/data-ap-attack-count/);
assert.match(adminSource,/data-ap-skill-name/);
assert.match(indexSource,/pve-apocalypse-v1952/);
assert.match(packageSource,/"release:gate"[^\n]+test:apocalypse/,'Apocalypse regression coverage must remain in the production release gate');
assert.match(battleCharacterSource,/setShield\(value,maxValue=this\.maxShield\)/,'V3 combatants must expose an authoritative shield HUD setter');
assert.match(battleCharacterSource,/SHIELD \$\{Math\.round\(ratio\*100\)\}%/,'the V3 shield HUD must expose a readable percent');
assert.match(battleCharacterSource,/SHIELD BREAK/,'depleted boss shields must remain visibly identified');
assert.match(battleEngineSource,/function openingShieldState\(payload,card\)/,'opening shields must be reconstructed from the server timeline, not final-state card rows');
assert.match(battleEngineSource,/targetShieldAfter=hasFiniteNumber\(event\.targetShieldAfter\)/,'every authoritative damage event must drive the shield HUD');
assert.match(battleEngineSource,/character\.setShield\?\.\(Math\.max\(0,Number\(row\?\.shield\)\|\|0\),character\.serverMaxShield\)/,'final server shield state must be forced after playback');
assert.match(battleEngineSource,/this\.apocalypseMode&&await this\.playApocalypseBossUltimate\(event,bossActor\)/,'the authored finisher must stay scoped to Apocalypse BOSS_ULTIMATE events');
const apocalypsePlayback=battleEngineSource.slice(battleEngineSource.indexOf('async playApocalypseBossUltimate'),battleEngineSource.indexOf('\n  /**',battleEngineSource.indexOf('async playApocalypseBossUltimate')));
assert.match(apocalypsePlayback,/ApocalypseBossUltimateFX\.create/);
assert.match(apocalypsePlayback,/scheduleApocalypseBossUltimate/);
assert.doesNotMatch(apocalypsePlayback,/pvUltimateLayer|pvUltimateVideo|\.play\(\)/,'Apocalypse must use the Pixi EffectLayer, never a screen video/DOM cutscene');
assert.match(apocalypseFxSource,/V3_APOCALYPSE_BOSS_ULTIMATE_ATLAS/);
assert.match(apocalypseFxSource,/proceduralFallback:false/);
assert.equal(Object.keys(apocalypseAtlas.frames||{}).filter(name=>name.startsWith('boss-ultimate_')).length,12);
assert.equal(statSync(apocalypseAudioPath).size,86828,'the approved recorded boss-impact SFX must remain byte-identical');

console.log('PVE Apocalypse: energy, authoritative shield HUD, in-battle boss ultimate atlas/SFX, combat rules, CMS and drops verified');
