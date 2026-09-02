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
    requirements: { minSlots: 3, minRare: 0 },
    scoring: { equipmentPowerBounds:{ min:1200, max:360000 }, equipmentScoreRange:{ min:25, max:250 }, cardGradeBonus:{ LIMITED:120, PRESTIGE:180, FUR:240, ZENITH:320 }, cardRewardGradeFactor:{ LIMITED:.2, PRESTIGE:.45, FUR:.8, ZENITH:2.5 }, cardRewardTiers:{ LIMITED:['AWAKENED'], PRESTIGE:['OVERDRIVE'], FUR:['OVERDRIVE','FORBIDDEN'], ZENITH:['FORBIDDEN'] }, cardRewardDensityScale:.35, rewardCurve:{ name:'BLACK_MIRACLE_INVERSE', minFactor:.1, maxFactor:1, exponent:1.35 } },
    tiers: [
      { code: 'DORMANT', name: '휴면', minValue: 0, color: '#5d7672' },
      { code: 'AWAKENED', name: '각성', minValue: 260, color: '#62ded1' },
      { code: 'OVERDRIVE', name: '과부하', minValue: 520, color: '#dfb55d' },
      { code: 'FORBIDDEN', name: '금단', minValue: 820, color: '#f06e76' }
    ],
    assets: [
      { type: 'CARD', id: 'CN-A5A786E91B314805', name: '봉순', member: '나무늘봉순', rarity: 'ZENITH', rank: 10, value: 320, gradeBonus:320, available: 3, image: 'assets/cards/bongson2.jpg', color: '#6fe9dc', confirmRequired: true },
      { type: 'CARD', id: 'CN-0505936A0CBB4E59', name: '구수댕', member: '남수댕', rarity: 'LIMITED', rank: 8, value: 120, gradeBonus:120, available: 2, image: 'assets/cards/남수댕/031.webp', color: '#ffd36f', confirmRequired: true },
      { type: 'CARD', id: 'CN-0B48C6FF8F9B4AC5', name: 'Faker', member: 'Faker', rarity: 'FUR', rank: 9, value: 240, gradeBonus:240, available: 4, image: 'assets/cards/7777777.jpg', color: '#e75f67', confirmRequired: true },
      { type: 'CARD', id: 'CN-57C561CA1F874657', name: '류하', member: '류하', rarity: 'PRESTIGE', rank: 9, value: 180, gradeBonus:180, available: 2, image: 'assets/cards/newcard0730/7979.jpg', color: '#e8c066', confirmRequired: true },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON', name: '성좌의 집행검', rarity: 'MYTHIC', rank: 5, value: 250, totalPower:360000, powerPercent:100, available: 2, enhancement: 12, image: 'assets/items/sovereign-weapon-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_TOP', name: '성좌의 흉갑', rarity: 'MYTHIC', rank: 5, value: 205, totalPower:128000, powerPercent:79, available: 3, enhancement: 9, image: 'assets/items/sovereign-top-v1.webp', color: '#ef657f' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_BOTTOM', name: '성좌의 각갑', rarity: 'LEGENDARY', rank: 4, value: 94, totalPower:16000, powerPercent:31, available: 2, enhancement: 8, image: 'assets/items/sovereign-bottom-v1.webp', color: '#f2c96d' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_SHOES', name: '성좌의 전투화', rarity: 'RARE', rank: 2, value: 25, totalPower:1200, powerPercent:0, available: 3, enhancement: 7, image: 'assets/items/sovereign-shoes-v1.webp', color: '#54c9ff' }
    ],
    rewardPool: [
      { rewardId: 'AW_LIMITED', mode: 'ANY', tierCode: 'AWAKENED', type: 'CARD', id: 'CN-0505936A0CBB4E59', name: '구수댕', member: '남수댕', rarity: 'LIMITED', basePower:18600, uniqueEffectScore:31, strengthPercent:36, image: 'assets/cards/남수댕/031.webp', weight: 100, rawEffectiveWeight:15.384, effectiveWeight:5.3844, autoFactor:.7692, gradeFactor:.2, densityDivisor:1, densityScale:.35, active: true, valid: true, color: '#ffd36f' },
      { rewardId: 'AW_TICKET', mode: 'ANY', tierCode: 'AWAKENED', type: 'ITEM', id: 'SCRAPYARD_ENTRY_TICKET', name: '폐차장 출입 허가증', rarity: 'EPIC', quantity: 2, image: 'assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png', weight: 20, effectiveWeight:14.2, autoFactor:.71, active: true, valid: true, color: '#b37aff' },
      { rewardId: 'AW_STAR', mode: 'ANY', tierCode: 'AWAKENED', type: 'ITEM', id: 'MASTER_STAR', name: '마스터의 별', rarity: 'MA', quantity: 50, image: '', weight: 18, effectiveWeight:13.5, autoFactor:.75, active: true, valid: true, color: '#8ee7ff' },
      { rewardId: 'OD_PRESTIGE', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'CARD', id: 'CN-57C561CA1F874657', name: '류하', member: '류하', rarity: 'PRESTIGE', basePower:22600, uniqueEffectScore:46, strengthPercent:54, image: 'assets/cards/newcard0730/7979.jpg', weight: 100, rawEffectiveWeight:26.928, effectiveWeight:9.4248, autoFactor:.5984, gradeFactor:.45, densityDivisor:1, densityScale:.35, active: true, valid: true, color: '#e8c066' },
      { rewardId: 'OD_FUR', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'CARD', id: 'CN-0B48C6FF8F9B4AC5', name: 'Faker', member: 'Faker', rarity: 'FUR', basePower:25600, uniqueEffectScore:58, strengthPercent:67, image: 'assets/cards/7777777.jpg', weight: 100, rawEffectiveWeight:43.968, effectiveWeight:15.3888, autoFactor:.5496, gradeFactor:.8, densityDivisor:1, densityScale:.35, active: true, valid: true, color: '#e75f67' },
      { rewardId: 'OD_BLACK_MIRACLE', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'ITEM', id: 'BLACK_MIRACLE_PACK', name: '블랙 미라클 팩', rarity: 'MYTHIC', quantity: 1, image: 'assets/ui/packs/black-miracle-pack-v1485-768.jpg', weight: 30, effectiveWeight:3, autoFactor:.1, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'OD_TICKET', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'ITEM', id: 'SCRAPYARD_ENTRY_TICKET', name: '폐차장 출입 허가증', rarity: 'EPIC', quantity: 5, image: 'assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png', weight: 18, effectiveWeight:10.8, autoFactor:.6, active: true, valid: true, color: '#b37aff' },
      { rewardId: 'OD_STAR', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'ITEM', id: 'MASTER_STAR', name: '마스터의 별', rarity: 'MA', quantity: 150, image: '', weight: 16, effectiveWeight:9.28, autoFactor:.58, active: true, valid: true, color: '#8ee7ff' },
      { rewardId: 'OD_WEAPON', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON', name: '성좌의 집행검', rarity: 'MYTHIC', totalPower:360000, strengthPercent:100, enhancement: 12, image: 'assets/items/sovereign-weapon-v1.webp', weight: 28, effectiveWeight:2.8, autoFactor:.1, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'OD_TOP', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'EQUIPMENT', id: 'SOVEREIGN_TOP', name: '성좌의 흉갑', rarity: 'MYTHIC', totalPower:128000, strengthPercent:79, enhancement: 9, image: 'assets/items/sovereign-top-v1.webp', weight: 22, effectiveWeight:7.6, autoFactor:.3455, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'OD_CUBE', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'ITEM', id: 'PREMIUM_CUBE', name: '프리미엄 큐브', rarity: 'PREMIUM', quantity: 2, image: 'assets/ui/alchemy-v1/material-cube-v1.webp', weight: 35, effectiveWeight:30, autoFactor:.8571, active: true, valid: true, color: '#e5ae4d' },
      { rewardId: 'OD_VEHICLE', mode: 'ANY', tierCode: 'OVERDRIVE', type: 'VEHICLE', id: '17', name: '아포칼립스 장갑차', rarity: 'MYTHIC', totalPower:220000, strengthPercent:88, image: 'assets/ui/escort/escort-armored-carrier-v1.webp', weight: 4, effectiveWeight:.94, autoFactor:.235, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'FB_FUR', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'CARD', id: 'CN-0B48C6FF8F9B4AC5', name: 'Faker', member: 'Faker', rarity: 'FUR', basePower:25600, uniqueEffectScore:58, strengthPercent:67, image: 'assets/cards/7777777.jpg', weight: 100, rawEffectiveWeight:43.968, effectiveWeight:15.3888, autoFactor:.5496, gradeFactor:.8, densityDivisor:1, densityScale:.35, active: true, valid: true, color: '#e75f67' },
      { rewardId: 'FB_ZENITH', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'CARD', id: 'CN-A5A786E91B314805', name: '봉순', member: '나무늘봉순', rarity: 'ZENITH', basePower:32000, uniqueEffectScore:82, strengthPercent:98, image: 'assets/cards/bongson2.jpg', weight: 100, rawEffectiveWeight:30.95, effectiveWeight:10.8325, autoFactor:.1238, gradeFactor:2.5, densityDivisor:1, densityScale:.35, active: true, valid: true, color: '#6fe9dc' },
      { rewardId: 'FB_BLACK_MIRACLE', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'ITEM', id: 'BLACK_MIRACLE_PACK', name: '블랙 미라클 팩', rarity: 'MYTHIC', quantity: 1, image: 'assets/ui/packs/black-miracle-pack-v1485-768.jpg', weight: 60, effectiveWeight:6, autoFactor:.1, active: true, valid: true, color: '#ef657f' },
      { rewardId: 'FB_TICKET', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'ITEM', id: 'SCRAPYARD_ENTRY_TICKET', name: '폐차장 출입 허가증', rarity: 'EPIC', quantity: 10, image: 'assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png', weight: 16, effectiveWeight:6.4, autoFactor:.4, active: true, valid: true, color: '#b37aff' },
      { rewardId: 'FB_STAR', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'ITEM', id: 'MASTER_STAR', name: '마스터의 별', rarity: 'MA', quantity: 300, image: '', weight: 14, effectiveWeight:5.6, autoFactor:.4, active: true, valid: true, color: '#8ee7ff' },
      { rewardId: 'FB_VEHICLE', mode: 'ANY', tierCode: 'FORBIDDEN', type: 'VEHICLE', id: '21', name: '성좌 궤도차량', rarity: 'MYTHIC', totalPower:360000, strengthPercent:100, image: 'assets/ui/escort/escort-armored-carrier-v1.webp', weight: 2, effectiveWeight:.2, autoFactor:.1, active: true, valid: true, color: '#ef657f' }
    ],
    defaultSelection: [
      { type: 'EQUIPMENT', id: 'SOVEREIGN_WEAPON' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_TOP' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_BOTTOM' },
      { type: 'EQUIPMENT', id: 'SOVEREIGN_SHOES' }
    ]
  };

  let resultCursor = 0;
  async function previewRequest(path, init = {}) {
    if (path === 'alchemy/state') return structuredClone(data);
    if (path === 'alchemy/transmute' && init.method === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 320));
      const payload = JSON.parse(init.body || '{}');
      const tier = [...data.tiers].filter((row) => payload.inputs.reduce((sum, entry) => sum + Number(data.assets.find((asset) => asset.type === entry.type && asset.id === entry.id)?.value || 0), 0) >= row.minValue).pop() || data.tiers[0];
      const candidates = data.rewardPool.filter((row) => row.tierCode === tier.code);
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
