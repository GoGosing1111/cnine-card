import {PET_TRAITS} from './pet-growth-v2.mjs';
const base='/assets/ui/pets/rework-20261114/';
export const PET_GROWTH_IMAGES=Object.freeze({stats:base+'stat-dice.webp',trait:base+'trait-dice.webp'});
export function petTraitVisual(id){
 const trait=PET_TRAITS[id];if(!trait)return null;
 const fresh=['hunter','luck'].includes(trait.slug);
 return {id,...trait,atlas:fresh?base+trait.slug+'-atlas.webp':'/assets/ui/pets/buffs-v1/'+trait.slug+'-atlas.webp',
  icon:fresh?base+trait.slug+'-icon.webp':'/assets/ui/pets/buffs-v1/'+trait.slug+'-icon.webp',columns:4,rows:fresh?3:2,frames:fresh?12:8,durationMs:2200};
}
