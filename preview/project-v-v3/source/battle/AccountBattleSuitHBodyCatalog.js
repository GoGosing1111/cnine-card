import manifest from '../../../../assets/ui/project-v/account-battle-suits/h-body-v2066.json' with {type:'json'};

// Generated from the approved resource measurements, not a second renderer.
// Only H-BODY is extended here; the existing 18 approved pairs remain intact.
function freezeTree(value){
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
export const H_BODY_ANIMATION_CATALOG=freezeTree(Object.fromEntries(
  Object.entries(manifest.profiles).map(([weaponCode,profile])=>[
    `${manifest.suit.code}:${weaponCode}`,profile
  ])
));
