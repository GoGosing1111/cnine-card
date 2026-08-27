(() => {
  'use strict';

  // 2026-08-25 live /api/cards and the active inventory catalog were used.
  // Quantities are preview-only; names, grades, ids and art paths are the live catalog values.
  const data = {
    totalRuns: 27,
    stability: 6,
    stabilityMax: 10,
    requirements: { minSlots: 3, minRare: 2 },
    tiers: [
      { code: 'DORMANT', name: '휴면', minValue: 0, color: '#5d7672' },
      { code: 'AWAKENED', name: '각성', minValue: 100, color: '#62ded1' },
      { code: 'OVERDRIVE', name: '과부하', minValue: 220, color: '#dfb55d' },
      { code: 'FORBIDDEN', name: '금단', minValue: 380, color: '#f06e76' }
    ],
    assets: [
      { type: 'CARD', id: 'CN-A5A786E91B314805', name: '봉순', member: '나무늘봉순', rarity: 'ZENITH', rank: 7, value: 142, available: 3, image: 'assets/cards/bongson2.jpg', color: '#6fe9dc' },
      { type: 'CARD', id: 'CN-0505936A0CBB4E59', name: '구수댕', member: '남수댕', rarity: 'ZENITH', rank: 7, value: 139, available: 2, image: 'assets/cards/남수댕/031.webp', color: '#6fe9dc' },
      { type: 'CARD', id: 'CN-0B48C6FF8F9B4AC5', name: 'Faker', member: 'Faker', rarity: 'FUR', rank: 6, value: 121, available: 4, image: 'assets/cards/7777777.jpg', color: '#e75f67' },
      { type: 'CARD', id: 'CN-48BBCAC81D0E44FA', name: 'Chovy', member: 'Chovy', rarity: 'SUPERSTAR', rank: 8, value: 168, available: 2, image: 'assets/superstar/1.jpg', color: '#ffd66f' },
      { type: 'CARD', id: 'CN-57C561CA1F874657', name: '류하', member: '류하', rarity: 'PRESTIGE', rank: 6, value: 117, available: 2, image: 'assets/cards/newcard0730/7979.jpg', color: '#e8c066' },
      { type: 'CARD', id: 'CN-651FAC27247A4922', name: 'CR7', member: 'CR7', rarity: 'SUPERSTAR', rank: 8, value: 170, available: 2, image: 'assets/superstar/2.jpg', color: '#ffd66f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON', name: '성좌의 집행검', rarity: 'MYTHIC', rank: 5, value: 96, available: 2, enhancement: 12, image: 'assets/items/sovereign-weapon-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_TOP', name: '성좌의 흉갑', rarity: 'MYTHIC', rank: 5, value: 91, available: 3, enhancement: 9, image: 'assets/items/sovereign-top-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_BOTTOM', name: '성좌의 각갑', rarity: 'MYTHIC', rank: 5, value: 88, available: 2, enhancement: 8, image: 'assets/items/sovereign-bottom-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_SHOES', name: '성좌의 전투화', rarity: 'MYTHIC', rank: 5, value: 86, available: 3, enhancement: 7, image: 'assets/items/sovereign-shoes-v1.webp', color: '#ef657f' },
      { type: 'ITEM', id: 'PREMIUM_CUBE', name: '프리미엄 큐브', rarity: 'PREMIUM', rank: 4, value: 72, available: 18, image: 'assets/ui/alchemy-v1/material-cube-v1.webp', color: '#ad70ea' },
      { type: 'ITEM', id: 'EQUIPMENT_SUPPLY_BOX', name: '장비 보급상자', rarity: 'HIGH', rank: 2, value: 46, available: 9, image: 'assets/ui/alchemy-v1/material-supply-v1.webp', color: '#61c5ee' },
      { type: 'ITEM', id: 'MAGIC_CARD_PACK', name: '마법카드팩', rarity: 'SPECIAL', rank: 3, value: 64, available: 7, image: 'assets/cards/magic-card-pack-v2-384.jpg', color: '#ad70ea' },
      { type: 'ITEM', id: 'BLACK_MIRACLE_PACK', name: '블랙 미라클 팩', rarity: 'MYTHIC', rank: 5, value: 104, available: 2, image: 'assets/ui/packs/black-miracle-pack-v1485-384.jpg', color: '#ef657f' }
    ],
    rewardPool: [
      { type: 'CARD', id: 'CN-A5A786E91B314805', name: '봉순', member: '나무늘봉순', rarity: 'ZENITH', image: 'assets/cards/bongson2.jpg' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON', name: '성좌의 집행검', rarity: 'MYTHIC', enhancement: 12, image: 'assets/items/sovereign-weapon-v1.webp' },
      { type: 'ITEM', id: 'PREMIUM_CUBE', name: '프리미엄 큐브', rarity: 'PREMIUM', image: 'assets/ui/alchemy-v1/material-cube-v1.webp' },
      { type: 'CARD', id: 'CN-48BBCAC81D0E44FA', name: 'Chovy', member: 'Chovy', rarity: 'SUPERSTAR', image: 'assets/superstar/1.jpg' }
    ],
    defaultSelection: [
      { type: 'CARD', id: 'CN-A5A786E91B314805' },
      { type: 'CARD', id: 'CN-0B48C6FF8F9B4AC5' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON' },
      { type: 'ITEM', id: 'PREMIUM_CUBE' }
    ]
  };

  let resultCursor = 0;
  async function previewRequest(path, init = {}) {
    if (path === 'alchemy/state') return structuredClone(data);
    if (path === 'alchemy/transmute' && init.method === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 320));
      const reward = data.rewardPool[resultCursor % data.rewardPool.length];
      resultCursor += 1;
      return { reward: structuredClone(reward), stability: Math.min(data.stabilityMax, data.stability + resultCursor) };
    }
    throw new Error(`지원하지 않는 연금술 미리보기 요청입니다: ${path}`);
  }

  window.SoopketmonAlchemyV1.create(document.getElementById('alchemyPreviewRoot'), {
    request: previewRequest,
    assetBase: '../../',
    profile: { nickname: '핑크빛유두' }
  });
})();
