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
  EQ_1786966923833:Object.freeze({weaponSlug:'sks',pairSlug:'ak-sks',row:1}),
  EQ_1788486929132:Object.freeze({weaponSlug:'gilded-dragon-ar',pairSlug:'gilded-dragon',row:0}),
  EQ_1788486888336:Object.freeze({weaponSlug:'gilded-dragon-antimateriel',pairSlug:'gilded-dragon',row:1})
});

const SHEET_URL_OVERRIDES=Object.freeze({
  'BATTLE_SUIT_01:m4a1-m200':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-01-m4a1-m200-horizontal-fire-atlas-v6.png',
  'BATTLE_SUIT_01:ak-sks':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-01-ak-sks-horizontal-fire-atlas-v6.png',
  'BATTLE_SUIT_02:m4a1-m200':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-02-m4a1-m200-horizontal-fire-atlas-v6.png',
  'BATTLE_SUIT_02:ak-sks':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-02-ak-sks-horizontal-fire-atlas-v5.png',
  'BATTLE_SUIT_03:m4a1-m200':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-03-m4a1-m200-horizontal-fire-atlas-v7.png',
  'BATTLE_SUIT_03:ak-sks':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-03-ak-sks-horizontal-fire-atlas-v5.png',
  'BATTLE_SUIT_01:gilded-dragon':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-01-gilded-dragon-horizontal-fire-atlas-v1.png',
  'BATTLE_SUIT_02:gilded-dragon':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-02-gilded-dragon-horizontal-fire-atlas-v1.png',
  'BATTLE_SUIT_03:gilded-dragon':'/assets/ui/project-v/account-battle-suits/animations/battle-suit-03-gilded-dragon-horizontal-fire-atlas-v1.png'
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
// visible pixel. User-requested static rows repeat one crisp standing/aiming
// pose across all runtime phases. V7 restores Suit 03 M200's original helmet;
// approved SKS and M4 rows remain pixel-locked.
const SOLE_PIVOTS_BY_SUIT_PAIR_ROW=Object.freeze({
  'BATTLE_SUIT_01:m4a1-m200:0':solePivots([55.265,478],[55.265,478],[55.265,478],[55.265,478]),
  'BATTLE_SUIT_01:m4a1-m200:1':solePivots([22.005,478],[22.005,478],[22.005,478],[22.005,478]),
  'BATTLE_SUIT_01:ak-sks:0':solePivots([23.406,478],[23.406,478],[23.406,478],[23.406,478]),
  'BATTLE_SUIT_01:ak-sks:1':solePivots([24.987,476],[23.503,476],[20.695,473],[24.125,475]),
  'BATTLE_SUIT_02:m4a1-m200:0':solePivots([51.526,479],[46.451,479],[47.451,476],[49.526,478]),
  'BATTLE_SUIT_02:m4a1-m200:1':solePivots([38.196,478],[38.196,478],[38.196,478],[38.196,478]),
  'BATTLE_SUIT_02:ak-sks:0':solePivots([92.858,478],[90.858,478],[87.858,475],[90.858,477]),
  'BATTLE_SUIT_02:ak-sks:1':solePivots([39.958,477],[38.260,477],[39.000,474],[40.631,476]),
  'BATTLE_SUIT_03:m4a1-m200:0':solePivots([80.272,478],[78.272,478],[75.272,475],[78.272,477]),
  'BATTLE_SUIT_03:m4a1-m200:1':solePivots([20.869,478],[20.869,478],[20.869,478],[20.869,478]),
  'BATTLE_SUIT_03:ak-sks:0':solePivots([80.272,478],[78.272,478],[75.272,475],[78.272,477]),
  'BATTLE_SUIT_03:ak-sks:1':solePivots([20.565,476],[18.158,476],[18.377,473],[18.911,475]),
  'BATTLE_SUIT_01:gilded-dragon:0':solePivots([21.691,479],[21.691,479],[21.691,479],[21.691,479]),
  'BATTLE_SUIT_01:gilded-dragon:1':solePivots([17.244,479],[17.244,479],[17.244,479],[17.244,479]),
  'BATTLE_SUIT_02:gilded-dragon:0':solePivots([36.132,479],[36.132,479],[36.132,479],[36.132,479]),
  'BATTLE_SUIT_02:gilded-dragon:1':solePivots([28.299,479],[28.299,479],[28.299,479],[28.299,479]),
  'BATTLE_SUIT_03:gilded-dragon:0':solePivots([19.798,479],[19.798,479],[19.798,479],[19.798,479]),
  'BATTLE_SUIT_03:gilded-dragon:1':solePivots([18.309,479],[18.309,479],[18.309,479],[18.309,479])
});

// Measured from the final exact-weapon atlases. Per-pair values keep the sole,
// nickname panel and runtime muzzle flash fixed when weapon rows have different
// authored whitespace or character scale.
const PAIR_TUNING=Object.freeze({
  'BATTLE_SUIT_01:EQ_1785427638137':tuning(1.4,41/512,478/512,345/384,148/512),
  'BATTLE_SUIT_01:EQ_1785961300455':tuning(1.47,64/512,478/512,377/384,161/512),
  'BATTLE_SUIT_01:EQ_1785961232958':tuning(1.4,47/512,478/512,377/384,154/512),
  'BATTLE_SUIT_01:EQ_1786966923833':tuning(1.4,38/512,476/512,374/384,133/512),
  'BATTLE_SUIT_02:EQ_1785427638137':tuning(1.4,39/512,479/512,379/384,152/512),
  'BATTLE_SUIT_02:EQ_1785961300455':tuning(1.5,100/512,478/512,377/384,175/512),
  'BATTLE_SUIT_02:EQ_1785961232958':tuning(1.4,36/512,478/512,379/384,122/512),
  'BATTLE_SUIT_02:EQ_1786966923833':tuning(1.4,39/512,477/512,376/384,124/512),
  'BATTLE_SUIT_03:EQ_1785427638137':tuning(1.4,36/512,478/512,379/384,119/512),
  'BATTLE_SUIT_03:EQ_1785961300455':tuning(1.47,79/512,478/512,377/384,160/512),
  'BATTLE_SUIT_03:EQ_1785961232958':tuning(1.4,36/512,478/512,379/384,126/512),
  'BATTLE_SUIT_03:EQ_1786966923833':tuning(1.4,57/512,476/512,375/384,145/512),
  'BATTLE_SUIT_01:EQ_1788486929132':tuning(1.45,72/512,479/512,378/384,163/512),
  'BATTLE_SUIT_01:EQ_1788486888336':tuning(1.55,161/512,479/512,378/384,229/512),
  'BATTLE_SUIT_02:EQ_1788486929132':tuning(1.45,129/512,479/512,378/384,204/512),
  'BATTLE_SUIT_02:EQ_1788486888336':tuning(1.55,185/512,479/512,378/384,248/512),
  'BATTLE_SUIT_03:EQ_1788486929132':tuning(1.45,76/512,479/512,378/384,169/512),
  'BATTLE_SUIT_03:EQ_1788486888336':tuning(1.55,158/512,479/512,378/384,220/512)
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
