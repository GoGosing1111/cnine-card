import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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
assert.match(apiSource,/CREATE TABLE IF NOT EXISTS user_apocalypse_energy/);
assert.match(apiSource,/NO_APOCALYPSE_ENERGY/);
assert.match(apiSource,/consumePveEnergyForDifficulty/);
assert.match(apiSource,/battle_apocalypse_settings_v1/);
assert.match(apiSource,/apocalypseSkillCast/);
assert.match(appSource,/\['NORMAL','HARD','HELL','NIGHTMARE','APOCALYPSE'\]/,'Apocalypse must sit immediately after Nightmare');
assert.match(appSource,/apocalypseEnergy/);
assert.match(appSource,/CMS에서 아포칼립스 몬스터를 추가하세요/);
assert.match(dropSource,/PVE_APOCALYPSE_AUTO/);
assert.match(dropSource,/SAVE_APOCALYPSE_BINDINGS/);
assert.match(adminSource,/data-ap-shield/);
assert.match(adminSource,/data-ap-attack-count/);
assert.match(adminSource,/data-ap-skill-name/);
assert.match(indexSource,/pve-apocalypse-v1952/);
assert.match(packageSource,/"release:gate"[^\n]+test:apocalypse/,'Apocalypse regression coverage must remain in the production release gate');

console.log('PVE Apocalypse v1952: independent 5/30 energy, harder runtime, shield, skill, repeat attacks, CMS and dedicated drops verified');
