// Actual scope centers in the raw generated 362px cells, not the center of each cell.
// The unequal margins in the source atlas previously moved the ring by ~50px per cycle.
export const AURA_REGISTRATION=Object.freeze([
 [204,208,68],[181,208,68],[175,208,68],[171,208,68],
 [204,184,68],[181,184,68],[175,184,68],[171,184,68],
 [204,158,68],[181,158,68],[175,158,68],[171,158,68]
].map(([x,y,radius])=>Object.freeze({x,y,radius})));
export function auraTransform(frame,bodyHeight,time){
 const {registration:r,rect}=frame;
 return {anchorX:r.x/rect.width,anchorY:r.y/rect.height,scale:bodyHeight*.305/r.radius,x:-12,y:-bodyHeight*.61,rotation:time*.24};
}
