// Coordinates in the user's 1536 x 1024 sheet. UV clipping separates irregular
// gutters without redrawing, warping, recoloring, or resampling the source.
export const MOTION_SOURCE = 'sources/user-motion-sheet-v2.png';
export const MOTION_SHA256 = '3EDC3E6AE57D0032CD63912927B47D57008E1C2D35719491245FC8A4F42F26B9';
export const BODY_PIXELS = 472;
// Latest user correction: begin with both feet planted in the upright source pose.
export const READY_POSE = 0;
export const MOTION_FRAMES = [
  {rect:[0,0,290,515],foot:[151,503],emitter:[83,52],grip:[65,293],core:[175,149],crown:[150,40],
    clip:[0,0,290,0,290,515,0,515]},
  {rect:[285,105,329,410],foot:[462,500],emitter:[431,139],grip:[381,294],core:[516,231],crown:[500,126],
    clip:[285,105,614,105,614,315,605,345,614,380,614,515,285,515]},
  {rect:[605,125,412,384],foot:[812,496],emitter:[612,349],grip:[851,233],core:[925,248],crown:[925,140],
    clip:[635,125,1017,125,1017,410,945,466,920,509,605,509,605,353,637,324]},
  {rect:[985,124,551,385],foot:[1182,496],emitter:[1522,217],grip:[1334,220],core:[1281,223],crown:[1253,144],
    clip:[1043,124,1536,124,1536,330,1400,365,1134,509,985,509,985,447,1020,398,1040,327]},
  {rect:[0,515,442,493],foot:[218,984],emitter:[69,522],grip:[218,670],core:[251,711],crown:[229,600],
    clip:[0,515,442,515,442,775,422,800,402,848,416,900,422,935,420,959,400,967,415,1008,0,1008]},
  {rect:[407,565,432,439],foot:[614,981],emitter:[824,783],grip:[610,740],core:[575,705],crown:[565,590],
    clip:[455,565,839,565,839,793,779,804,761,846,839,984,407,1004,426,971,445,947,450,886,430,829,462,740]},
  {rect:[783,670,493,334],foot:[991,981],emitter:[1267,897],grip:[1037,814],core:[1015,794],crown:[970,694],
    clip:[865,670,1240,670,1240,850,1276,900,1160,968,1103,1004,810,1004,810,925,815,865,812,824,845,758]},
  {rect:[1240,515,296,489],foot:[1393,981],emitter:[1340,544],grip:[1330,772],core:[1426,650],crown:[1415,550],
    clip:[1288,515,1536,515,1536,1004,1240,1004,1240,924,1285,905,1285,891,1240,873,1240,814,1283,759]}
];
