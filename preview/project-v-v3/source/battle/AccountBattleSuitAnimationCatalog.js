const FRAME_ORDER=Object.freeze(['ready','fire','recoil','recover']);
const GRID=Object.freeze({columns:4,rows:2});
const DURATIONS_MS=Object.freeze({ready:45,fire:45,recoil:70,recover:125});
const SOLE_PIVOT_CONTRACT=Object.freeze({
  type:'SOLE_CENTER',
  unit:'NORMALIZED_FRAME',
  alphaThreshold:16,
  bottomBandPx:9
});

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

const SHEET_URL_OVERRIDES=Object.freeze({
  'BATTLE_SUIT_01:m4a1-m200':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-01-m4a1-m200-horizontal-fire-atlas-v3.png',
  'BATTLE_SUIT_01:ak-sks':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-01-ak-sks-horizontal-fire-atlas-v3.png',
  'BATTLE_SUIT_02:m4a1-m200':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-02-m4a1-m200-horizontal-fire-atlas-v3.png',
  'BATTLE_SUIT_02:ak-sks':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-02-ak-sks-horizontal-fire-atlas-v3.png',
  'BATTLE_SUIT_03:m4a1-m200':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-03-m4a1-m200-horizontal-fire-atlas-v3.png',
  'BATTLE_SUIT_03:ak-sks':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-03-ak-sks-horizontal-fire-atlas-v3.png'
});

function tuning(scaleMultiplier,contentTop,contentBottom,muzzleX,muzzleY){
  return Object.freeze({scaleMultiplier,contentTop,contentBottom,muzzleX,muzzleY});
}

const solePivot=(x,y)=>Object.freeze({
  unit:SOLE_PIVOT_CONTRACT.unit,
  x:x/384,
  y:y/512
});
const solePivots=(ready,fire,recoil,recover)=>Object.freeze({
  ready:solePivot(...ready),
  fire:solePivot(...fire),
  recoil:solePivot(...recoil),
  recover:solePivot(...recover)
});

// Measured directly from the final RGBA atlases. For every frame, X is the
// alpha>=16 centroid of the lowest nine visible pixel rows and Y is the lowest
// visible pixel. Suit 02 M4A1 stays pixel-locked to the approved v2 row; every
// other row uses the same grip-pose body scale, with the exact DB weapon below
// the retained arms and hands so the rifle cannot cut through the character.
const SOLE_PIVOTS_BY_SUIT_PAIR_ROW=Object.freeze({
  'BATTLE_SUIT_01:m4a1-m200:0':solePivots([69.808,478],[67.808,478],[64.808,475],[67.808,477]),
  'BATTLE_SUIT_01:m4a1-m200:1':solePivots([69.808,478],[67.808,478],[64.808,475],[67.808,477]),
  'BATTLE_SUIT_01:ak-sks:0':solePivots([69.808,478],[67.808,478],[64.808,475],[67.808,477]),
  'BATTLE_SUIT_01:ak-sks:1':solePivots([69.808,478],[67.808,478],[64.808,475],[67.808,477]),
  'BATTLE_SUIT_02:m4a1-m200:0':solePivots([51.526,479],[46.451,479],[47.451,476],[49.526,478]),
  'BATTLE_SUIT_02:m4a1-m200:1':solePivots([110.759,478],[108.759,478],[105.759,475],[108.759,477]),
  'BATTLE_SUIT_02:ak-sks:0':solePivots([92.858,478],[90.858,478],[87.858,475],[90.858,477]),
  'BATTLE_SUIT_02:ak-sks:1':solePivots([92.858,478],[90.858,478],[87.858,475],[90.858,477]),
  'BATTLE_SUIT_03:m4a1-m200:0':solePivots([80.272,478],[78.272,478],[75.272,475],[78.272,477]),
  'BATTLE_SUIT_03:m4a1-m200:1':solePivots([79.418,478],[77.418,478],[74.418,475],[77.418,477]),
  'BATTLE_SUIT_03:ak-sks:0':solePivots([80.272,478],[78.272,478],[75.272,475],[78.272,477]),
  'BATTLE_SUIT_03:ak-sks:1':solePivots([80.272,478],[78.272,478],[75.272,475],[78.272,477])
});

// Measured from the final exact-weapon atlases. Per-pair values keep the sole,
// nickname panel and runtime muzzle flash fixed when weapon rows have different
// authored whitespace or character scale.
const PAIR_TUNING=Object.freeze({
  'BATTLE_SUIT_01:EQ_1785427638137':tuning(1.4,36/512,478/512,379/384,126/512),
  'BATTLE_SUIT_01:EQ_1785961300455':tuning(1.4,36/512,478/512,379/384,122/512),
  'BATTLE_SUIT_01:EQ_1785961232958':tuning(1.4,36/512,478/512,379/384,135/512),
  'BATTLE_SUIT_01:EQ_1786966923833':tuning(1.4,36/512,478/512,379/384,118/512),
  'BATTLE_SUIT_02:EQ_1785427638137':tuning(1.4,39/512,479/512,379/384,152/512),
  'BATTLE_SUIT_02:EQ_1785961300455':tuning(1.4,36/512,478/512,379/384,132/512),
  'BATTLE_SUIT_02:EQ_1785961232958':tuning(1.4,36/512,478/512,379/384,122/512),
  'BATTLE_SUIT_02:EQ_1786966923833':tuning(1.4,36/512,478/512,379/384,108/512),
  'BATTLE_SUIT_03:EQ_1785427638137':tuning(1.4,36/512,478/512,379/384,119/512),
  'BATTLE_SUIT_03:EQ_1785961300455':tuning(1.4,36/512,478/512,379/384,134/512),
  'BATTLE_SUIT_03:EQ_1785961232958':tuning(1.4,36/512,478/512,379/384,126/512),
  'BATTLE_SUIT_03:EQ_1786966923833':tuning(1.4,36/512,478/512,379/384,111/512)
});

function catalogEntry(suitCode,suitSlug,weaponCode,weapon){
  const pairTuning=PAIR_TUNING[`${suitCode}:${weaponCode}`];
  if(!pairTuning)throw new Error(`ACCOUNT_BATTLE_SUIT_TUNING_MISSING:${suitCode}:${weaponCode}`);
  const pivots=SOLE_PIVOTS_BY_SUIT_PAIR_ROW[`${suitCode}:${weapon.pairSlug}:${weapon.row}`];
  if(!pivots)throw new Error(`ACCOUNT_BATTLE_SUIT_PIVOTS_MISSING:${suitCode}:${weaponCode}`);
  const frames=Object.freeze(Object.fromEntries(FRAME_ORDER.map((name,column)=>[
    name,
    Object.freeze({name,column,row:weapon.row})
  ])));
  return Object.freeze({
    suitCode,
    weaponCode,
    weaponSlug:weapon.weaponSlug,
    sheetUrl:SHEET_URL_OVERRIDES[`${suitCode}:${weapon.pairSlug}`]
      ||`/assets/ui/project-v/account-battle-suits/animations/${suitSlug}-${weapon.pairSlug}-topdown-fire-atlas-v1.png`,
    row:weapon.row,
    grid:GRID,
    frameOrder:FRAME_ORDER,
    frames,
    durationsMs:DURATIONS_MS,
    pivotContract:SOLE_PIVOT_CONTRACT,
    pivots,
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
