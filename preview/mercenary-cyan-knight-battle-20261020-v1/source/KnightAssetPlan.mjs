import {MODES} from '../motion.mjs';

// Only authored resources sampled by the current choreography belong in the
// runtime load. Older sheets stay in the manifest and on disk for editing.
const EFFECTS_BY_MODE=Object.freeze({
 idle:[],dash:['dash'],hit:[],defeat:[],
 horizon:['dash','cleave-v3','burst-v3','ground'],
 flurry:['dash','cleave-v3','burst-v3'],
 meteor:['dragon-v3','cleave-v3','burst-v3','ground'],
 array:['burst-v3','ground','rail-v4','snap-v4'],
 zenith:['orbit','dash','cleave-v3','burst-v3','dragon-v3','ground']
});

export function planKnightAssets(manifest,modes=Object.keys(MODES)){
 const motion=new Set(['idle']),effects=new Set(['rail-v4']);
 // The existing sword array builds its pooled ropes eagerly, even in PVP.
 for(const mode of modes){
  if(!MODES[mode]||!Object.hasOwn(EFFECTS_BY_MODE,mode))throw Error('ZERO_RESOURCE_MODE: '+mode);
  for(const pose of MODES[mode].poses)motion.add(pose.bank);
  for(const key of EFFECTS_BY_MODE[mode])effects.add(key);
 }
 const banks=(kind,keys)=>[...keys].map(key=>{
  const spec=manifest[kind]?.[key];if(!spec?.url)throw Error('ZERO_RESOURCE_MISSING: '+kind+'/'+key);
  return{key,spec};
 });
 const plan={motion:banks('motion',motion),effects:banks('effects',effects)};
 plan.urls=[...new Set([
  manifest.weapon.url,...plan.motion.map(x=>x.spec.url),...plan.effects.map(x=>x.spec.url),
  manifest.summonedWeapons?.url,manifest.appearance?.url,manifest.backdrop?.url,manifest.backdrop?.effect?.url
 ].filter(Boolean))];
 return plan;
}
