import {accountRankBenefits,rankCards} from './_account_rank.js';
import {createPveBattleV2} from './_battle_v2_preview.js';
import {SCRAPYARD_ENEMIES} from './_scrapyard.js';

// Staged as part of the entire PVE overhaul. Not imported by an HTTP route.
export const PVE_CONTINUOUS_OVERHAUL_RELEASE_ENABLED = false;
export const SCRAPYARD_V3_VERSION = 'PVE_CONTINUOUS_V1';
export const SCRAPYARD_V3_DRAFT = Object.freeze({
  OUTER: Object.freeze({normalCount:9, simultaneous:3, maxActions:180, maxDuration:2, forcedMonsterEvery:6}),
  CORE: Object.freeze({normalCount:12, simultaneous:3, maxActions:240, maxDuration:2.5, forcedMonsterEvery:6}),
  FURNACE: Object.freeze({normalCount:15, simultaneous:3, maxActions:300, maxDuration:3, forcedMonsterEvery:6})
});
const ART = Object.freeze({
  SCRAP_OUTER_GEARJAW:'/preview/scrapyard-v3-v1/assets/gearjaw-sd-v1.png',
  SCRAP_OUTER_BREAKER:'/preview/scrapyard-v3-v1/assets/breaker-sd-v1.png',
  SCRAP_CORE_POLARITY:'/preview/scrapyard-v3-v1/assets/polarity-sd-v1.png',
  SCRAP_CORE_ATLAS:'/preview/scrapyard-v3-v1/assets/atlas-sd-v1.png',
  SCRAP_FURNACE_RAVAGER:'/preview/scrapyard-v3-v1/assets/ravager-sd-v1.png',
  SCRAP_FURNACE_MOLOCH:'/preview/scrapyard-v3-v1/assets/moloch-sd-v1.png'
});
function fail(code, message) { throw Object.assign(new Error(message), {code}); }
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('SCRAPYARD_V3_CONFIG', `${label} 설정이 올바르지 않습니다.`);
  return value;
}

export function validateScrapyardV3Config(zone, input = SCRAPYARD_V3_DRAFT[zone]) {
  if (!SCRAPYARD_ENEMIES[zone] || !input) fail('SCRAPYARD_V3_ZONE', '폐차장 구역을 선택하세요.');
  const normalCount = integer(Number(input.normalCount), 5, 40, '일반 몬스터 수');
  const simultaneous = integer(Number(input.simultaneous), 3, 5, '동시 몬스터 수');
  const maxActions = integer(Number(input.maxActions), 10, 600, '전투 행동 한도');
  const forcedMonsterEvery = integer(Number(input.forcedMonsterEvery), 1, 20, '몬스터 행동 간격');
  const maxDuration = Number(input.maxDuration);
  if (!Number.isFinite(maxDuration) || maxDuration < 0.1 || maxDuration > 4) fail('SCRAPYARD_V3_CONFIG', '서버 전투 시계 한도가 올바르지 않습니다.');
  return {normalCount, simultaneous, maxActions, maxDuration, forcedMonsterEvery};
}

// The same saved-deck validator, equipment resolver and magic loadout as live
// PVE are dependencies. Client-supplied cards, powers and outcomes are never read.
export async function loadScrapyardV3Snapshot(env, user, deps, mode = 'PVE') {
  if (!['PVE','TOWER'].includes(mode)) fail('SCRAPYARD_V3_SCOPE', '전투 범위를 확인하세요.');
  for (const key of ['raidDeckPower','cardBattlePower','magicBattleLoadout','selectActivatedUltimate']) {
    if (typeof deps?.[key] !== 'function') fail('SCRAPYARD_V3_DEPENDENCY', `서버 전투 의존성 누락: ${key}`);
  }
  const [deck, magic] = await Promise.all([
    deps.raidDeckPower(env, user.id, null, mode), deps.magicBattleLoadout(env, user, mode)
  ]);
  if (deck?.ids?.length !== 5 || new Set(deck.ids.map(String)).size !== 5 || deck?.cards?.length !== 5) fail('SCRAPYARD_V3_DECK', '저장된 PVE 덱 5장이 필요합니다.');
  const byId = new Map(deck.cards.map(card => [String(card.id), card]));
  const uniqueById = new Map((deck.unique?.cards || []).map(card => [String(card.id), card]));
  const multiplier = Math.max(0, 1 + Number(deck.synergy?.totals?.attackPercent || 0) / 100 + Number(deck.synergy?.totals?.bossDamagePercent || 0) / 100);
  const cards = deck.ids.map(id => {
    const card = byId.get(String(id));
    if (!card) fail('SCRAPYARD_V3_DECK', '현재 보유하지 않은 덱 카드가 있습니다.');
    const unique = uniqueById.get(String(id)) || card;
    // raidDeckPower.cards may already contain attack-% adjusted power. Rebuild
    // the raw enhanced card power; the canonical engine applies the effect once.
    const rawPower = Number(deps.cardBattlePower(card, card.breakthrough_level ?? card.breakthroughLevel, deck.battleSettings));
    if (!Number.isFinite(rawPower) || rawPower <= 0 || !Number.isFinite(multiplier) || multiplier <= 0) fail('SCRAPYARD_V3_DECK', '카드 전투력을 확인할 수 없습니다.');
    return {...card, id:String(id), power:Math.max(1, Math.floor(rawPower * multiplier)),
      uniqueAbility:unique.uniqueAbility || null, uniqueAdvancement:unique.uniqueAdvancement || null};
  });
  const equipment = deck.characterBonus || {}, suitPower = Math.max(0, Number(equipment.battleSuitPve || 0));
  const cardSupportBonus = Math.max(0, Number(equipment.pve || 0) - suitPower);
  if (!Number.isFinite(suitPower) || !Number.isFinite(cardSupportBonus)) fail('SCRAPYARD_V3_DECK', '장비 전투력을 확인할 수 없습니다.');
  const battleSuit = suitPower > 0 && equipment.equippedBattleSuit ? {
    ...equipment.equippedBattleSuit, pvePower:suitPower, weapon:equipment.equippedWeapon || null, accountNickname:user.nickname
  } : null;
  const ultimate = deps.selectActivatedUltimate(deck.battleSettings, cards);
  const ultimateSource = ultimate?.matchedCards?.[0];
  const ultimateDamage = ultimateSource ? Math.max(0, Math.floor(Number(ultimateSource.power || 0) * Number(ultimate.rule?.coefficientPercent || 0) / 100)) : 0;
  if (!Number.isSafeInteger(ultimateDamage)) fail('SCRAPYARD_V3_DECK', '궁극기 전투력을 확인할 수 없습니다.');
  const mercenary=deps.loadMercenaryBattleSnapshot?await deps.loadMercenaryBattleSnapshot(env,user):null;
  const snapshot = {schemaVersion:1, userId:user.id, accountNickname:String(user.nickname || ''), cards:rankCards(cards,env.DB?await accountRankBenefits(env,user.id,mode==='PVE'?'SCRAPYARD':mode):{attackBp:0,hpBp:0}),...(mercenary?{mercenary}:{}),
    cardSupportBonus, battleSuit, characterBonus:equipment, magicCards:magic?.cards || [], ultimateDamage,
    singleHealerBonus:deck.battleSettings?.engine?.singleHealerBonus || {},
    power:{...(mercenary?{mercenary:Math.round(mercenary.basePower*(1+(mercenary.combat?.powerGrowthPercentPerLevel||0)*(mercenary.level-1)/100))}:{}),cards:cards.reduce((sum, card) => sum + card.power, 0), equipment:cardSupportBonus, battleSuit:battleSuit ? suitPower : 0},
    source:'LATEST_SAVED_PVE_DECK', capturedAt:new Date().toISOString()};
  // Also detach the in-flight battle from mutable helper caches and object aliases.
  return JSON.parse(JSON.stringify(snapshot));
}

export function buildScrapyardV3Battle({snapshot, difficulty, config, seed}) {
  if (!snapshot || snapshot.cards?.length !== 5) fail('SCRAPYARD_V3_DECK', 'PVE 덱 스냅샷이 없습니다.');
  const zone = String(difficulty?.id || ''), cfg = validateScrapyardV3Config(zone, config);
  const start = integer(Number(difficulty.requiredPowerStart), 1000, 1000000000, '시작 전투력');
  const end = integer(Number(difficulty.requiredPowerEnd), start, 1000000000, '보스 전투력');
  const enemies = SCRAPYARD_ENEMIES[zone];
  const instances = Array.from({length:cfg.normalCount + 1}, (_, index) => {
    const boss = index === cfg.normalCount, art = (boss ? enemies.boss : enemies.normal)[0];
    const progress = index / cfg.normalCount;
    // Fixed CMS curve only; never scale monsters to the current player.
    const power = Math.round((start + (end - start) * Math.pow(progress, 1.22)) * (boss ? 1.08 : 1));
    return {instanceId:`${zone}:${index + 1}`, slot:boss ? 1 : index % cfg.simultaneous, afterClear:boss,
      monster:{id:art.id, name:art.name, image:art.image, battle_power:power, is_boss:boss ? 1 : 0},
      sourceArt:'/' + art.image, battleSprite:ART[art.id] || null};
  });
  const battleV2 = createPveBattleV2({cards:snapshot.cards, magicCards:snapshot.magicCards,
    characterBonus:snapshot.cardSupportBonus, battleSuit:snapshot.battleSuit, mercenary:snapshot.mercenary, singleHealerBonus:snapshot.singleHealerBonus,
    ultimateDamage:snapshot.ultimateDamage, seed,
    encounter:{...cfg, initialCount:cfg.simultaneous, instances}});
  const defeated = Number(battleV2.result.encounter?.defeated || 0), success = battleV2.result.winner === 'A';
  const wavesTotal = integer(Number(difficulty.waves), 3, 10, '기존 정산 웨이브 수');
  const wavesCleared = success ? wavesTotal : Math.min(wavesTotal - 1, Math.floor(defeated / cfg.normalCount * (wavesTotal - 1)));
  const continuousEncounter={total:instances.length,normalCount:cfg.normalCount,initialIds:battleV2.encounter.initialIds,
    instances:battleV2.encounter.instances.map((fighter,i)=>({...fighter,slot:instances[i].slot,boss:instances[i].afterClear,
      name:instances[i].monster.name,displayName:instances[i].afterClear?instances[i].monster.name:`${instances[i].monster.name} ${i+1}`,
      sourceArt:instances[i].sourceArt,battleSprite:instances[i].battleSprite}))};
  return {protocolVersion:3, engineVersion:SCRAPYARD_V3_VERSION, success, wavesCleared, wavesTotal,
    mode:'HUNT',battlefieldMode:'HUNT',title:'폐차장',phaseLabel:difficulty.name||zone,cards:snapshot.cards,
    equippedBattleSuit:snapshot.characterBonus?.equippedBattleSuit,equippedWeapon:snapshot.characterBonus?.equippedWeapon,continuousEncounter,
    defeated, enemiesTotal:instances.length, normalCount:cfg.normalCount,
    remainingPartyHp:battleV2.result.timeline.at(-1)?.teamAHpPercent ?? 0,
    failureReason:success ? null : battleV2.result.originalReason || battleV2.result.reason,
    deckPower:snapshot.power.cards + snapshot.power.equipment + snapshot.power.battleSuit + (snapshot.power.mercenary||0),
    deckCards:snapshot.cards, characterBonus:snapshot.characterBonus, accountNickname:snapshot.accountNickname,
    battleV2, scrapyardEncounter:{initialIds:battleV2.encounter.initialIds,
      instances:battleV2.encounter.instances.map((fighter, i) => ({...fighter, boss:instances[i].afterClear, speciesId:instances[i].monster.id,
        sourceArt:instances[i].sourceArt, battleSprite:instances[i].battleSprite})), config:cfg},
    // Report incompleteness instead of using a background illustration as a sprite.
    resourceReady:instances.every(row => Boolean(row.battleSprite))};
}
