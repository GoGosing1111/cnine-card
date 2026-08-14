import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeNightmareSettings,pveDifficultyRuntime } from '../functions/_pve_nightmare.js';
import { simulateBattleV2Preview } from '../functions/_battle_v2_preview.js';

const defaults=normalizeNightmareSettings();
assert.deepEqual(defaults,{enabled:true,hpPercent:200,attackPercent:160,defensePercent:150,speedPercent:120,rewardPercent:250,bossUltimateUnlocked:true,bossUltimateCapPercent:120});

const settings={nightmare:defaults};
const normal=pveDifficultyRuntime(settings,{id:1,pveTab:'NORMAL',battlePower:100000,rewardCoin:1000});
assert.equal(normal.effectiveBattlePower,100000);
assert.equal(normal.effectiveRewardCoin,1000);
assert.equal(normal.bossUltimateCapPercent,100);

const nightmare=pveDifficultyRuntime(settings,{id:2,pveTab:'NIGHTMARE',battlePower:100000,rewardCoin:1000});
assert.equal(nightmare.difficulty,'NIGHTMARE');
assert.equal(nightmare.effectiveBattlePower,167500);
assert.equal(nightmare.effectiveRewardCoin,2500);
assert.equal(nightmare.bossUltimateCapPercent,120);
assert.equal(nightmare.engineMonster.pve_hp_percent,200);

const fighter=(side,id)=>({id,side,slot:0,row:'FRONT',title:id,grade:'TEST',maxHp:1000,hp:1000,attack:1,defense:1,speed:100,shield:0,maxShield:0,gauge:0,alive:true,emergencyUsed:false,survivalUsed:false,frontlineAnnounced:false,actions:0,damageDealt:0,healingDone:0});
const capped=simulateBattleV2Preview({teamA:[fighter('A','A1')],teamB:[fighter('B','B1')],openingBossUltimatePercent:300,maxActions:1});
assert.equal(capped.timeline.find(event=>event.type==='BOSS_ULTIMATE')?.damagePercent,100,'existing PVE must retain the 100% boss-ultimate cap');
const unlocked=simulateBattleV2Preview({teamA:[fighter('A','A1')],teamB:[fighter('B','B1')],openingBossUltimatePercent:300,bossUltimateCapPercent:300,maxActions:1});
assert.equal(unlocked.timeline.find(event=>event.type==='BOSS_ULTIMATE')?.damagePercent,300,'Nightmare must accept the CMS value above 100%');
assert.equal(unlocked.final.A[0].hp,0);

const apiSource=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
assert.match(apiSource,/safe_runtime_upgrade_v1693_nightmare_clone/,'a corrective clone migration must exist');
assert.match(apiSource,/safe_runtime_upgrade_v1205_d1_hotpath_indexes','safe_runtime_upgrade_v1693_nightmare_clone'/,'the lightweight runtime gate must check the corrective migration marker');
assert.match(apiSource,/SET pve_tab='HELL'.*UPPER\(COALESCE\(pve_tab,''\)\)='NIGHTMARE'/s,'the original HELL monster must be restored');
assert.match(apiSource,/SELECT src\.name[\s\S]*'NIGHTMARE'[\s\S]*FROM battle_monsters src/,'Nightmare must be created as a separate monster row');
assert.doesNotMatch(apiSource,/safe_runtime_upgrade_v1692_nightmare_pve[\s\S]{0,500}UPDATE battle_monsters SET pve_tab='NIGHTMARE'/,'the original HELL row must never be moved again');

console.log('PVE Nightmare: profile, reward, legacy isolation, ultimate unlock and HELL-preserving clone migration verified');
