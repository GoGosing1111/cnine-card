import {createPveBattleV2} from './_battle_v2_preview.js';
import {COW_ROOM_PUBLIC_RELEASE_ENABLED} from '../shared/pve-public-release-v2092.mjs';

// Shared encounter builder. It accepts a server-owned snapshot, never a request body.
// Account admission/economy are intentionally separate from this combat contract.
export const COW_ROOM_RELEASE_ENABLED = COW_ROOM_PUBLIC_RELEASE_ENABLED;
export const COW_ROOM_ASSETS = Object.freeze({
  warrior: '/assets/ui/project-v/monsters/cow-room/cow-warrior-sd-v1.png',
  king: '/assets/ui/project-v/monsters/cow-room/cow-king-sd-v1.png',
  battlefield: '/assets/ui/project-v/battlefields/v3-cow-pasture-v1.png'
});
export const COW_ROOM_DRAFT = Object.freeze({normalCount:18, eliteCount:3, simultaneous:3,
  normalPower:550000, elitePower:1000000, bossPower:2600000, maxActions:260, maxDuration:3, forcedMonsterEvery:6});
export function buildCowRoomBattle({snapshot, seed = 7123, config = COW_ROOM_DRAFT} = {}) {
  if (!snapshot || snapshot.cards?.length !== 5 || new Set(snapshot.cards.map(c => String(c.id))).size !== 5)
    throw new Error('COW_ROOM_REQUIRES_FIVE_CARDS');
  for (const key of ['normalCount','eliteCount','simultaneous','maxActions','forcedMonsterEvery'])
    if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error('INVALID_COW_ROOM_CONFIG');
  if (config.simultaneous > 5 || config.normalCount < config.simultaneous || config.normalCount + config.eliteCount + 1 > 40 ||
      config.maxActions > 600 || config.forcedMonsterEvery > 20 || !Number.isFinite(config.maxDuration) || config.maxDuration <= 0 || config.maxDuration > 4)
    throw new Error('INVALID_COW_ROOM_CONFIG');
  for (const key of ['normalPower','elitePower','bossPower'])
    if (!Number.isSafeInteger(config[key]) || config[key] < 1000 || config[key] > 1000000000) throw new Error('INVALID_COW_ROOM_POWER');
  const count = config.normalCount + config.eliteCount;
  const instances = Array.from({length:count + 1}, (_, i) => {
    const boss = i === count, elite = !boss && i >= config.normalCount;
    const name = boss ? '카우 킹' : elite ? '왕의 도끼병' : '젖소 도끼병';
    return {instanceId:`COW:${i+1}`, slot:boss ? 1 : i % config.simultaneous, afterClear:boss || elite,
      monster:{id:boss ? 'COW_KING' : elite ? 'COW_ELITE' : 'COW_WARRIOR', name,
        battle_power:boss ? config.bossPower : elite ? config.elitePower : config.normalPower,
        is_boss:boss ? 1 : 0, pve_difficulty:'APOCALYPSE'},
      name, boss, elite, battleSprite:boss ? COW_ROOM_ASSETS.king : COW_ROOM_ASSETS.warrior,
      // No card/source illustration is substituted by a battle sprite.
      sourceArt:null};
  });
  const battleV2 = createPveBattleV2({cards:snapshot.cards, magicCards:snapshot.magicCards || [],
    characterBonus:snapshot.cardSupportBonus || 0, battleSuit:snapshot.battleSuit || null,mercenary:snapshot.mercenary||null,
    singleHealerBonus:snapshot.singleHealerBonus || {}, ultimateDamage:snapshot.ultimateDamage || 0, seed,
    encounter:{...config, initialCount:config.simultaneous, instances}});
  return {mode:'HUNT', battlefieldMode:'HUNT', title:'카우방', phaseLabel:'붉은 목초지',
    playerName:snapshot.accountNickname || '목초지 원정대', opponentName:'카우 군단',
    cards:snapshot.cards, accountNickname:snapshot.accountNickname,
    characterBonus:snapshot.characterBonus || {}, equippedBattleSuit:snapshot.characterBonus?.equippedBattleSuit,
    equippedWeapon:snapshot.characterBonus?.equippedWeapon, battleV2,
    continuousEncounter:{total:instances.length, normalCount:config.normalCount, eliteCount:config.eliteCount,
      initialIds:battleV2.encounter.initialIds, instances:battleV2.encounter.instances.map((fighter,i)=>({...fighter,
        slot:instances[i].slot, boss:instances[i].boss, elite:instances[i].elite,
        name:instances[i].name, displayName:instances[i].boss ? '카우 킹' : `${instances[i].name} ${i+1}`,
        sourceArt:null, battleSprite:instances[i].battleSprite}))}};
}
