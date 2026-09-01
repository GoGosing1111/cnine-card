const FRAME_ORDER=Object.freeze(['ready','fire','recoil','recover']);
const GRID=Object.freeze({columns:4,rows:2});
const DURATIONS_MS=Object.freeze({ready:45,fire:45,recoil:70,recover:125});

const SUITS=Object.freeze({
  BATTLE_SUIT_01:'battle-suit-01',
  BATTLE_SUIT_02:'battle-suit-02',
  BATTLE_SUIT_03:'battle-suit-03'
});

const WEAPONS=Object.freeze({
  EQ_1785427638137:Object.freeze({weaponSlug:'m4a1',pairSlug:'m4a1-m200',row:0}),
  EQ_1785961300455:Object.freeze({weaponSlug:'m200',pairSlug:'m4a1-m200',row:1}),
  EQ_1785961232958:Object.freeze({weaponSlug:'ak',pairSlug:'ak-sks',row:0}),
  EQ_1786966923833:Object.freeze({weaponSlug:'sks',pairSlug:'ak-sks',row:1})
});

function tuning(scaleMultiplier,contentTop,contentBottom,muzzleX,muzzleY){
  return Object.freeze({scaleMultiplier,contentTop,contentBottom,muzzleX,muzzleY});
}

// Measured from the final exact-weapon atlases. Per-pair values keep the sole,
// nickname panel and runtime muzzle flash fixed when weapon rows have different
// authored whitespace or character scale.
const PAIR_TUNING=Object.freeze({
  'BATTLE_SUIT_01:EQ_1785427638137':tuning(1.4,51/512,462/512,311/384,109/512),
  'BATTLE_SUIT_01:EQ_1785961300455':tuning(1.414,23/512,434/512,313/384,100/512),
  'BATTLE_SUIT_01:EQ_1785961232958':tuning(1.4,51/512,462/512,314/384,114/512),
  'BATTLE_SUIT_01:EQ_1786966923833':tuning(1.414,23/512,434/512,312/384,96/512),
  'BATTLE_SUIT_02:EQ_1785427638137':tuning(1.4,72/512,473/512,329/384,84/512),
  'BATTLE_SUIT_02:EQ_1785961300455':tuning(1.507,41/512,412/512,324/384,66/512),
  'BATTLE_SUIT_02:EQ_1785961232958':tuning(1.4,72/512,473/512,331/384,88/512),
  'BATTLE_SUIT_02:EQ_1786966923833':tuning(1.507,36/512,412/512,321/384,62/512),
  'BATTLE_SUIT_03:EQ_1785427638137':tuning(1.4,53/512,465/512,344/384,91/512),
  'BATTLE_SUIT_03:EQ_1785961300455':tuning(1.455,24/512,429/512,304/384,101/512),
  'BATTLE_SUIT_03:EQ_1785961232958':tuning(1.4,53/512,465/512,346/384,95/512),
  'BATTLE_SUIT_03:EQ_1786966923833':tuning(1.455,24/512,429/512,302/384,97/512)
});

function catalogEntry(suitCode,suitSlug,weaponCode,weapon){
  const pairTuning=PAIR_TUNING[`${suitCode}:${weaponCode}`];
  if(!pairTuning)throw new Error(`ACCOUNT_BATTLE_SUIT_TUNING_MISSING:${suitCode}:${weaponCode}`);
  const frames=Object.freeze(Object.fromEntries(FRAME_ORDER.map((name,column)=>[
    name,
    Object.freeze({name,column,row:weapon.row})
  ])));
  return Object.freeze({
    suitCode,
    weaponCode,
    weaponSlug:weapon.weaponSlug,
    sheetUrl:`/assets/ui/project-v/account-battle-suits/animations/${suitSlug}-${weapon.pairSlug}-topdown-fire-atlas-v1.png`,
    row:weapon.row,
    grid:GRID,
    frameOrder:FRAME_ORDER,
    frames,
    durationsMs:DURATIONS_MS,
    muzzle:Object.freeze({frame:'fire',unit:'NORMALIZED_FRAME',x:pairTuning.muzzleX,y:pairTuning.muzzleY}),
    scaleMultiplier:pairTuning.scaleMultiplier,
    contentBottom:pairTuning.contentBottom,
    nameHud:Object.freeze({contentTop:pairTuning.contentTop,gap:18})
  });
}

export const ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG=Object.freeze(Object.fromEntries(
  Object.entries(SUITS).flatMap(([suitCode,suitSlug])=>Object.entries(WEAPONS).map(([weaponCode,weapon])=>{
    const key=`${suitCode}:${weaponCode}`;
    return [key,catalogEntry(suitCode,suitSlug,weaponCode,weapon)];
  }))
));

export function resolveAccountBattleSuitAnimation(suitCode,weaponCode){
  const suit=String(suitCode||'').trim().toUpperCase();
  const weapon=String(weaponCode||'').trim().toUpperCase();
  return ACCOUNT_BATTLE_SUIT_ANIMATION_CATALOG[`${suit}:${weapon}`]||null;
}
