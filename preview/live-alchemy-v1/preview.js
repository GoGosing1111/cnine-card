(() => {
  'use strict';

  // 2026-08-25 live /api/cards and the active inventory catalog were used.
  // Quantities are preview-only; names, grades, ids and art paths are the live catalog values.
  const data = {
    access: { mode: 'OWNER_TEST', visible: true, ownerTest: true, version: 1 },
    profile: { id: 1, nickname: 'OWNER 검수계정', role: 'OWNER' },
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
      { type: 'CARD', id: 'CN-A5A786E91B314805', name: '봉순', member: '나무늘봉순', rarity: 'ZENITH', rank: 10, value: 390, available: 3, image: 'assets/cards/bongson2.jpg', color: '#6fe9dc', confirmRequired: true },
      { type: 'CARD', id: 'CN-0505936A0CBB4E59', name: '구수댕', member: '남수댕', rarity: 'ZENITH', rank: 10, value: 390, available: 2, image: 'assets/cards/남수댕/031.webp', color: '#6fe9dc', confirmRequired: true },
      { type: 'CARD', id: 'CN-0B48C6FF8F9B4AC5', name: 'Faker', member: 'Faker', rarity: 'FUR', rank: 9, value: 300, available: 4, image: 'assets/cards/7777777.jpg', color: '#e75f67', confirmRequired: true },
      { type: 'CARD', id: 'CN-57C561CA1F874657', name: '류하', member: '류하', rarity: 'PRESTIGE', rank: 9, value: 300, available: 2, image: 'assets/cards/newcard0730/7979.jpg', color: '#e8c066', confirmRequired: true },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON', name: '성좌의 집행검', rarity: 'MYTHIC', rank: 5, value: 96, available: 2, enhancement: 12, image: 'assets/items/sovereign-weapon-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_TOP', name: '성좌의 흉갑', rarity: 'MYTHIC', rank: 5, value: 91, available: 3, enhancement: 9, image: 'assets/items/sovereign-top-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_BOTTOM', name: '성좌의 각갑', rarity: 'MYTHIC', rank: 5, value: 88, available: 2, enhancement: 8, image: 'assets/items/sovereign-bottom-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_SHOES', name: '성좌의 전투화', rarity: 'MYTHIC', rank: 5, value: 86, available: 3, enhancement: 7, image: 'assets/items/sovereign-shoes-v1.webp', color: '#ef657f' },
      { type: 'ITEM', id: 'PREMIUM_CUBE', name: '프리미엄 큐브', rarity: 'PREMIUM', rank: 4, value: 72, available: 18, image: 'assets/ui/alchemy-v1/material-cube-v1.webp', color: '#ad70ea' },
      { type: 'ITEM', id: 'EQUIPMENT_SUPPLY_BOX', name: '장비 보급상자', rarity: 'HIGH', rank: 2, value: 46, available: 9, image: 'assets/ui/alchemy-v1/material-supply-v1.webp', color: '#61c5ee' },
      { type: 'ITEM', id: 'MAGIC_CARD_PACK', name: '마법카드팩', rarity: 'SPECIAL', rank: 3, value: 64, available: 7, image: 'assets/cards/magic-card-pack-v2-384.jpg', color: '#ad70ea' },
      { type: 'ITEM', id: 'STARLIGHT_ARMOR_CORE', name: '별빛 방어구 코어', rarity: 'MYTHIC', rank: 5, value: 104, available: 6, image: 'assets/items/starlight-armor-core-v1749.png', color: '#ef657f' }
    ],
    rewardPool: [
      { rewardId: 'OD_WEAPON', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON', name: '성좌의 집행검', rarity: 'MYTHIC', enhancement: 12, image: 'assets/items/sovereign-weapon-v1.webp', weight: 28, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'OD_TOP', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'EQUIPMENT', id: 'SOVEREIGN_TOP', name: '성좌의 흉갑', rarity: 'MYTHIC', enhancement: 9, image: 'assets/items/sovereign-top-v1.webp', weight: 22, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'OD_CUBE', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'ITEM', id: 'PREMIUM_CUBE', name: '프리미엄 큐브 ×2', rarity: 'PREMIUM', quantity: 2, image: 'assets/ui/alchemy-v1/material-cube-v1.webp', weight: 35, active: true, valid: true, color: '#e5ae4d' },
      { rewardId: 'OD_CORE', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'ITEM', id: 'STARLIGHT_ARMOR_CORE', name: '별빛 방어구 코어', rarity: 'MYTHIC', image: 'assets/items/starlight-armor-core-v1749.png', weight: 15, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'FB_CARD', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'CARD', id: 'CN-A5A786E91B314805', name: '봉순', member: '나무늘봉순', rarity: 'MA', image: 'assets/cards/bongson2.jpg', weight: 18, active: true, valid: true, color: '#8ee7ff' },
      { rewardId: 'FB_CORE', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'ITEM', id: 'STARLIGHT_ARMOR_CORE', name: '별빛 방어구 코어 ×2', rarity: 'MYTHIC', quantity: 2, image: 'assets/items/starlight-armor-core-v1749.png', weight: 42, active: true, valid: true, color: '#ef657f' }
    ],
    defaultSelection: [
      { type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_TOP' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_BOTTOM' },
      { type: 'ITEM', id: 'PREMIUM_CUBE' }
    ]
  };

  let resultCursor = 0;
  async function previewRequest(path, init = {}) {
    if (path === 'alchemy/state') return structuredClone(data);
    if (path === 'alchemy/transmute' && init.method === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 320));
      const payload = JSON.parse(init.body || '{}');
      const tier = [...data.tiers].filter((row) => payload.inputs.reduce((sum, entry) => sum + Number(data.assets.find((asset) => asset.type === entry.type && asset.id === entry.id)?.value || 0), 0) >= row.minValue).pop() || data.tiers[0];
      const candidates = data.rewardPool.filter((row) => row.tierCode === tier.code && (row.mode === 'ANY' || row.mode === payload.mode));
      const reward = candidates[resultCursor % candidates.length];
      resultCursor += 1;
      for (const entry of payload.inputs) { const asset = data.assets.find((row) => row.type === entry.type && row.id === entry.id); if (asset) asset.available = Math.max(0, Number(asset.available || 0) - 1); }
      data.totalRuns += 1;
      data.stability = Math.min(data.stabilityMax, data.stability + 1);
      return { reward: structuredClone(reward), stability: data.stability, state: structuredClone(data) };
    }
    throw new Error(`지원하지 않는 연금술 미리보기 요청입니다: ${path}`);
  }

  window.SoopketmonAlchemyV1.create(document.getElementById('alchemyPreviewRoot'), {
    request: previewRequest,
    assetBase: '../../',
    profile: { nickname: 'OWNER 검수계정' }
  });
})();
