import {fits as hFits, transformExactWeapon} from '../battle-suit-prestige-v1/exact-weapon-fit.mjs';

export const sourceCanvas={width:1280,height:1536,scale:956/1024,left:-60,top:36};
export const approvedSuits=[
  {id:'s-body',name:'S-BODY',code:'BATTLE_SUIT_S_BODY',order:2,accent:'#69aaff',source:'s-body-approved-v1.png',matte:'s-body-matte-v1.png',sha256:'A497FBB8A4DE40B10951E08BA06120CC36295472980C12A35777DBA67886D15C'},
  {id:'z-body',name:'Z-BODY',code:'BATTLE_SUIT_Z_BODY',order:3,accent:'#e5c27a',source:'z-body-approved-v1.png',matte:'z-body-matte-v2.png',sha256:'094A2C618F2683059FA129DE5DA2BCE558D5774748477D9AD26C3B41CE62CD6D'}
];
export const weaponFits=[
  {id:'m4a1',weapon:'avalon-m4a1-v1.png',width:700,rotation:0,flop:true,grip:[260,227],support:[650,163],muzzle:[1008,104],bore:[800,104]},
  {id:'ak',weapon:'infinity-ak-v1.png',width:700,rotation:0,flop:true,grip:[311,220],support:[640,177],muzzle:[930,116],bore:[760,116]},
  {id:'m200',weapon:'infinity-m200-v1.png',width:980,rotation:0,flop:true,grip:[210,190],support:[495,157],muzzle:[1007,103],bore:[730,103]},
  {...hFits[3]}, {...hFits[4]}, {...hFits[5]}
];
export const atlasPairs=[['m4a1-m200',0,2],['ak-sks',1,3],['gilded-dragon',4,5]];
export {transformExactWeapon};
