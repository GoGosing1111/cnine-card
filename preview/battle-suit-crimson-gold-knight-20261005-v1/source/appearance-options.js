import options from '../appearance-options.json' with {type:'json'};
export const APPEARANCE_OPTIONS=options;
export const DEFAULT_AURA_PALETTE=options.defaultPaletteId;
export const AURA_PALETTES=Object.freeze(options.palettes);
export function resolveAuraPaletteId(value){
 return typeof value==='string'&&Object.hasOwn(AURA_PALETTES,value)?value:DEFAULT_AURA_PALETTE;
}
