import manifest from '../../../assets/ui/project-v/mercenaries/mercenary-attachment-points-v1.json' with {type:'json'};

export function attachmentProfile(art){
  const row=manifest.cards[art?.code];
  if(!row||row.battleSpriteSha256.toUpperCase()!==art?.battleSpriteSha256?.toUpperCase())return null;
  return row;
}
export function attachMercenaryArt(actor,art){
  actor.art=art;actor.mercenaryAttachments=attachmentProfile(art);
  actor.artFacing=actor.mercenaryAttachments?.authoredFacing||1;actor.applyFacing();
}
export function mercenaryAttachment(actor,kind,layer){
  const sprite=actor?.fullBodySprite,anchor=actor?.mercenaryAttachments?.[kind];
  if(!sprite||!anchor||sprite.destroyed||!layer)return null;
  // Pixi transforms include the texture anchor, authored facing, team mirror,
  // actor recoil/approach, parent scales and compact viewport conversion.
  const texture=sprite.texture.orig;
  return layer.toLocal({x:(anchor.x-sprite.anchor.x)*texture.width,y:(anchor.y-sprite.anchor.y)*texture.height},sprite);
}
export function mercenaryEmission(actor,layer){
  const kind=actor?.mercenaryAttachments?.weaponKind;
  const point=mercenaryAttachment(actor,['GUN','BOW'].includes(kind)?'weapon':'cast',layer);
  return point?{...point,projected:!['GUN','BOW'].includes(kind)}:null;
}
