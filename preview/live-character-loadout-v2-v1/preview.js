(() => {
  'use strict';

  const item = (id, code, name, slot, rarity, image, totalPower, pvePower, pvpPower, subtype = slot) => ({
    instanceId: id,
    sourceType: 'PREVIEW_CONTRACT',
    sourceId: `PREVIEW:${id}`,
    acquiredAt: `2026-08-${String(25 - (id % 8)).padStart(2, '0')} 12:00:00`,
    item: { id, code, name, slot, slotLabel: slot, subtype, rarity, image, description: `${name} 장비`, totalPower, pvePower, pvpPower, sortOrder: id }
  });

  const fixture = {
    avatarFeature: { mode: 'TEST', visible: true, ownerTest: true, shopEnabled: true, version: 1 },
    slots: [
      { id: 'WEAPON', label: '무기' },
      { id: 'ACCESSORY', label: '장신구' },
      { id: 'TOP', label: '상의' },
      { id: 'BOTTOM', label: '하의' },
      { id: 'SHOES', label: '신발' }
    ],
    instances: [
      item(101, 'SOVEREIGN_WEAPON', '성좌의 집행검', 'WEAPON', 'MYTHIC', 'assets/items/sovereign-weapon-v1.webp', 196000, 110000, 86000, 'MODERN_SWORD'),
      item(102, 'SOVEREIGN_TOP', '성좌의 흉갑', 'TOP', 'MYTHIC', 'assets/items/sovereign-top-v1.webp', 181000, 101000, 80000, 'TOP'),
      item(103, 'SOVEREIGN_BOTTOM', '성좌의 각갑', 'BOTTOM', 'MYTHIC', 'assets/items/sovereign-bottom-v1.webp', 173000, 96000, 77000, 'BOTTOM'),
      item(104, 'SOVEREIGN_SHOES', '성좌의 전투화', 'SHOES', 'MYTHIC', 'assets/items/sovereign-shoes-v1.webp', 168000, 94000, 74000, 'SHOES'),
      item(105, 'TACTICAL_DUEL_DISK', '아크 듀얼디스크', 'ACCESSORY', 'EPIC', 'assets/items/124151515.jpeg', 128000, 70000, 58000, 'DUAL_DISK'),
      item(106, 'VOID_RIFLE', '공허 추적 라이플', 'WEAPON', 'EPIC', 'assets/items/41515123.jpeg', 118000, 66000, 52000, 'RIFLE'),
      item(107, 'ORBITAL_TOP', '궤도 강습 상의', 'TOP', 'RARE', 'assets/items/A1.jpeg', 76000, 43000, 33000, 'TOP'),
      item(108, 'ORBITAL_BOTTOM', '궤도 강습 하의', 'BOTTOM', 'RARE', 'assets/items/A2.jpeg', 72000, 40000, 32000, 'BOTTOM'),
      item(109, 'ORBITAL_SHOES', '궤도 강습 신발', 'SHOES', 'RARE', 'assets/items/A3.jpeg', 69000, 38000, 31000, 'SHOES'),
      item(110, 'DRAGON_RIFLE_ALPHA', '적룡 돌격소총', 'WEAPON', 'LEGENDARY', 'assets/items/GUN1.jpeg', 142000, 80000, 62000, 'RIFLE'),
      item(111, 'DRAGON_RIFLE_OMEGA', '흑룡 저격소총', 'WEAPON', 'LEGENDARY', 'assets/items/GUN2.jpeg', 149000, 82000, 67000, 'RIFLE')
    ],
    loadout: { WEAPON: 101, ACCESSORY: 105, TOP: 102, BOTTOM: 103, SHOES: 104 },
    titles: [
      { id: 1, code: 'GOAT', name: 'GOAT', badgeText: 'GOAT', description: '전설의 숲켓몬', pvePower: 75000, unlockType: 'MANUAL', unlockConfig: {}, stylePreset: 'GOLD', fontPreset: 'SERIF', owned: true, equipped: true },
      { id: 2, code: 'TERRITORY_COMMANDER', name: '공대장', badgeText: '★★★★ 공대장', description: '영토전의 영웅', pvePower: 52000, unlockType: 'MANUAL', unlockConfig: {}, stylePreset: 'CRIMSON', fontPreset: 'DISPLAY', owned: true, equipped: false },
      { id: 3, code: 'MATCHMAKER', name: '승부사', badgeText: '★★ 승부사', description: '승부의 흐름을 지배한 자', pvePower: 41000, unlockType: 'CONTENT_CLEAR', unlockConfig: {}, stylePreset: 'CRIMSON', fontPreset: 'SCIFI', owned: true, equipped: false },
      { id: 4, code: 'VOID_WALKER', name: '심연의 개척자', badgeText: '심연의 개척자', description: '미공개 칭호', pvePower: 60000, unlockType: 'CONTENT_CLEAR', unlockConfig: {}, stylePreset: 'VOID', fontPreset: 'SERIF', owned: false, equipped: false }
    ],
    equippedTitleId: 1,
    vehicles: [
      { id: 11, code: 'ARCANOTECH_GT', name: '아스트라 그랜드 투어러', rarity: 'MYTHIC', image: 'assets/ui/character-loadout-v2/arcanotech-gt-v1.webp', description: '자수정 코어를 탑재한 고성능 이동수단', totalPower: 230000, pvePower: 126000, pvpPower: 104000, owned: true, equipped: true, acquiredAt: '2026-08-23 18:30:00' }
    ],
    equippedVehicleId: 11,
    bonuses: {}
  };

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const previewRequest = async (path) => {
    await wait(140);
    if (path === 'character/loadout') return structuredClone(fixture);
    if (/^character\/(?:equipment|title|garage)\/(?:equip|unequip)$/.test(path)) return { ok: true };
    throw new Error(`프리뷰 계약에 없는 요청입니다: ${path}`);
  };

  window.SooperLoadoutPreview = window.SoopketmonCharacterLoadoutV2.create(
    document.getElementById('characterLoadoutV2'),
    {
      request: previewRequest,
      assetBase: '../../',
      profile: { nickname: '핑크빛유두' },
      onOpenAvatarShop() {
        window.location.href = '../live-avatar-shop-v1/?v=2-avatar-effects&from=loadout';
      }
    }
  );
})();
