import {ADVANCEMENT_FX as roles} from '../catalog.mjs';
export const ADVANCEMENT_FX=roles.map(s=>({...s,width:s.id==='vampire'?340:s.id==='guardian'?460:s.id==='commander'?560:600}));
export const FX_BY_ID=new Map(ADVANCEMENT_FX.map(s=>[s.id,s]));
export function resolveClips(id){if(!FX_BY_ID.has(id))throw Error('Unknown advancement effect '+id);return [id];}
