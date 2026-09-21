// Authored on the unmodified ImageGen masters. One body scale per sequence;
// crouched frames are never enlarged to match a standing bounding box.
export const MOTION_SPECS = {
  dash: {source:'dash-v2.png',count:8,columns:4,rows:2,feet:[[215,435],[670,430],[1100,429],[1570,426],[275,824],[735,832],[1120,844],[1540,856]],heads:[75,128,133,140,544,556,533,492],standingFrame:7},
  attack: {source:'attack-v2.png',count:12,columns:4,rows:3,feet:[[180,364],[570,364],[905,364],[1250,364],[195,699],[576,702],[897,700],[1255,702],[200,1049],[566,1049],[919,1049],[1260,1048]],heads:[78,98,80,97,415,448,424,433,761,760,761,761],standingFrame:0,
    contacts:[{frame:4,sourcePoint:[452,497],targetHeightFraction:.46},{frame:7,sourcePoint:[1425,498],targetHeightFraction:.46}]},
  cross: {source:'cross-v2.png',count:8,columns:4,rows:2,feet:[[218,424],[584,423],[1065,416],[1470,424],[268,851],[651,846],[1100,854],[1535,863]],heads:[67,142,134,119,546,555,523,507],standingFrame:0,
    contacts:[{frame:3,sourcePoint:[1659,161],targetHeightFraction:.48}]},
  cyclone: {source:'cyclone-v2.png',count:12,columns:4,rows:3,feet:[[186,346],[550,340],[936,335],[1325,333],[235,675],[568,671],[935,670],[1340,680],[187,989],[560,989],[936,989],[1331,1000]],heads:[27,66,62,35,373,389,385,415,708,712,707,688],standingFrame:0,
    contacts:[{frame:2,sourcePoint:[1158,85],targetHeightFraction:.46},{frame:7,sourcePoint:[1515,435],targetHeightFraction:.46}]},
  guard: {source:'guard-v2.png',count:6,columns:3,rows:2,feet:[[270,501],[780,499],[1285,501],[275,990],[785,990],[1295,991]],heads:[66,113,124,607,625,563],standingFrame:0,
    contacts:[{frame:3,sourcePoint:[343,652],targetHeightFraction:.46}]},
  cast: {source:'cast-v3.png',count:8,columns:4,rows:2,feet:[[221,457],[677,457],[1119,457],[1550,457],[225,837],[676,837],[1118,837],[1545,839]],heads:[121,173,161,137,539,539,558,504],standingFrame:0,
    contacts:[{frame:5,sourcePoint:[899,803],targetHeightFraction:0}]}
};
export const EFFECT_SPECS = {
  slash: {source:'slash-fx-v1.png',columns:4,rows:3,anchor:'center',collisionFrame:4},
  cross: {source:'cross-fx-v1.png',columns:4,rows:3,anchor:'center',collisionFrame:4},
  cyclone: {source:'cyclone-fx-v1.png',columns:4,rows:4,anchor:'ground',collisionFrame:8},
  guard: {source:'guard-fx-v1.png',columns:4,rows:3,anchor:'ground',collisionFrame:5},
  ultimate: {source:'ultimate-fx-v1.png',columns:4,rows:4,anchor:'ground',collisionFrame:5},
  aura: {source:'aura-v1.png',columns:4,rows:3,anchor:'ground',collisionFrame:null}
};
