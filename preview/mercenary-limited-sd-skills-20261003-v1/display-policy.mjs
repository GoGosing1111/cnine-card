// Reuse the existing combat card's texture height. No preview-only enlargement
// or reduction percentage. Uniformly scale the approved pixels and weapon.
export const regularBattleSpriteHeight = engine => engine.allies.find(actor => actor.battleActive !== false && actor.fullBodySprite?.visible)?.fullBodyHeight ?? engine.allies[0].fullBodyHeight;
export const LIMITED_AURA_WIDTH_MULTIPLIER = 1.65;
