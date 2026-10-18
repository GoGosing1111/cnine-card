import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('.',import.meta.url),read=async n=>JSON.parse(await fs.readFile(new URL(n,root),'utf8'));
const cfg=await read('asset-registration.json');
const sheet=async(source,standingHeight,poses,rects)=>({source,sha256:createHash('sha256').update(await fs.readFile(new URL(source,root))).digest('hex'),standingHeight,poses:poses.map((p,i)=>({foot:p[0],grip:p[1],angle:p[2],weaponInFront:true,...(rects?{rect:rects[i]}:{})}))});
cfg.version='LEONEL_ASSET_REGISTRATION_V2';
cfg.status='REPLACEMENT_CANDIDATE_USER_REVIEW_PENDING';
cfg.motions.attack=[
 await sheet('assets/sources/body-attack-a-v2-anatomy.png',500,[
 [[350,592],[244,350],150],[[1011,593],[938,159],-92],[[386,1174],[513,891],15],[[999,1175],[1154,843],0]
 ]),
 await sheet('assets/sources/body-attack-b-v2.png',590,[
 [[431,584],[610,300],25],[[1048,580],[930,323],65],[[465,1190],[384,923],70],[[997,1212],[882,915],145]
 ],[{left:0,top:0,width:665,height:605},{left:665,top:0,width:589,height:605},{left:0,top:605,width:627,height:649},{left:627,top:605,width:627,height:649}])
];
cfg.motions.skill=[
 await sheet('assets/sources/body-skill-a-v2.png',550,[
 [[414,544],[292,148],145],[[1027,542],[1132,204],18],[[405,1178],[488,934],-20],[[1054,1193],[1073,666],-25]
 ],[{left:0,top:0,width:627,height:627},{left:627,top:0,width:627,height:627},{left:0,top:627,width:650,height:627},{left:650,top:627,width:604,height:627}]),
 await sheet('assets/sources/body-skill-b-v2.png',560,[
 [[390,593],[301,75],-36],[[1021,592],[1125,237],2],[[420,1196],[507,891],30],[[991,1208],[881,932],145]
 ])
];
cfg.motions.ultimate=[
 await sheet('assets/sources/body-ultimate-a-v2.png',540,[
 [[365,590],[290,315],150],[[1006,591],[982,271],0],[[390,1217],[351,727],-125],[[1008,1208],[1008,741],-135]
 ]),
 await sheet('assets/sources/body-ultimate-b-v2.png',555,[
 [[402,589],[361,170],23],[[1010,590],[1176,192],0],[[401,1200],[431,933],45],[[1021,1197],[953,916],30]
 ],[{left:0,top:0,width:644,height:610},{left:644,top:0,width:610,height:610},{left:0,top:610,width:627,height:644},{left:627,top:610,width:627,height:644}]),
 await sheet('assets/sources/body-ultimate-c-v2.png',570,[
 [[431,590],[383,272],30],[[997,590],[928,306],95],[[401,1217],[347,885],155],[[1007,1214],[923,919],145]
 ])
];
cfg.effects.aura.source='assets/sources/fx-aura-v2.png';
cfg.effects.pressure.source='assets/sources/fx-pressure-retry-v2-candidate1.png';
cfg.effects.slash.source='assets/sources/fx-slash-v2-candidate1.png';
cfg.effects.crosscut.source='assets/sources/fx-crosscut-fixed-v2.png';
cfg.effects.ultimate.source='assets/sources/fx-ultimate-v2-candidate1.png';
cfg.effects.fracture.source='assets/atlases/fx-fracture-v2.png';
cfg.cinematics={awakening:{source:'assets/sources/cutin-awakening-v2.png',columns:2,rows:2,layer:'screen',blendMode:'normal'}};
await fs.writeFile(new URL('asset-registration.json',root),JSON.stringify(cfg,null,2)+'\n');
console.log('V2: 40 body frames, 84 FX and 4 cinematic drawings registered, body reference 610px retained.');
