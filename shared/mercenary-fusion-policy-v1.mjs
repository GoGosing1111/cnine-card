// User-approved economics, 2026-09-22. Preparation does not activate consumption.
export const MERCENARY_FUSION_RELEASE_ENABLED = false;
export const MERCENARY_FUSION_POLICY = Object.freeze({
  version: 'mercenary-fusion-eight-20260922', materialCount: 8, materialRule: 'SAME_RANK',
  successChancePpm: 100000, chanceTotal: 1000000, coinCost: 0, resultQuantity: 1,
  successOutcome: 'NEXT_RANK', failureOutcome: 'SAME_RANK_RANDOM', preserveOriginal: true,
  withinRankSelection: 'EXISTING_CMS_CARD_WEIGHTS',
});
