// The approved Valter V17 manifest is the single size reference for all limited SDs.
// Match visible head-to-foot height, not PNG padding, weapon length, or a new percentage.
export const approvedLimitedSpriteScale = (valter,bodyPixels) =>
  (valter.displaySizing.fullBodyHeight * valter.bodyPixels / valter.battleSpriteInfo.height) / bodyPixels;
export const LIMITED_AURA_WIDTH_MULTIPLIER = 1.65;
