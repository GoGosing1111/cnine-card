import manifest from '../../../../assets/ui/project-v/account-battle-suits/sz-body-v2124.json' with {type:'json'};

function freezeTree(value){
  if(value&&typeof value==='object'){
    for(const child of Object.values(value))freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
export const SZ_BODY_ANIMATION_CATALOG=freezeTree(Object.fromEntries(
  manifest.suits.flatMap(suit=>Object.entries(suit.profiles).map(([weaponCode,profile])=>[
    `${suit.code}:${weaponCode}`,profile
  ]))
));
