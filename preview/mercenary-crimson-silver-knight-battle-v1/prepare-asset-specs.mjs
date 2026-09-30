import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const part=(source,bodyPixels,positions,angles,rows=2)=>({source,bodyPixels,count:positions.length,rows,hands:positions.map((p,i)=>[...p,Array.isArray(angles)?angles[i]:angles]),gripReview:'MANUALLY_REGISTERED_CLOSED_RIGHT_GLOVE',weaponPolicy:'ORIGINAL_RIGID_ONLY'});
const motion={
 idle:{parts:[part('idle-body-only-v2.png',506,[[190,200],[577,199],[966,199],[1349,199],[187,710],[572,710],[960,710],[1345,710]],-40)]},
 ready:{parts:[part('ready-a-body-v3.png',500,[[191,234],[602,196],[994,177],[1383,151],[231,659],[619,643],[1005,632],[1399,626]],[-45,-55,-67,-80,-92,-104,-114,-125]),part('ready-b-body-v3.png',485,[[192,114],[552,110],[958,100],[1323,45],[179,525],[565,515],[953,513],[1352,512]],[-125,-133,-141,-147,-155,-162,-169,-175])]},
 attack:{parts:[part('attack-a-body-v3.png',450,[[165,26],[541,33],[902,107],[1468,201],[351,624],[736,650],[1129,650],[1502,646]],[160,174,195,222,246,264,278,296]),part('attack-b-body-v3.png',480,[[334,118],[673,255],[1018,294],[1485,298],[278,769],[596,738],[968,696],[1327,695]],[-58,-42,-28,-18,-24,-30,-38,-40])],contacts:[{frame:6,targetHeightFraction:.46}]},
 recover:{parts:[part('recover-body-only-v2.png',352,[[288,230],[578,161],[893,158],[1240,159],[194,527],[555,527],[903,528],[1264,527],[189,888],[549,888],[910,888],[1271,888]],[-25,-28,-32,-36,-40,-43,-45,-45,-45,-45,-45,-45],3)]},
 dash:{parts:[part('dash-body-only-v2.png',506,[[176,214],[557,251],[1006,231],[1394,218],[214,710],[551,736],[970,713],[1330,713]],[-40,-50,-62,-70,-64,-52,-46,-40])]},
 guard:{parts:[part('guard-body-only-v2.png',500,[[184,229],[594,181],[1009,159],[1403,138],[229,662],[599,690],[979,718],[1361,728]],[-40,-75,-112,-139,-139,-112,-75,-40])]},
 hit:{parts:[part('hit-body-only-v2.png',500,[[163,210],[512,210],[905,230],[1323,270],[176,709],[562,691],[959,705],[1345,710]],[-40,-42,-45,-50,-50,-45,-42,-40])]},
 defeat:{parts:[part('defeat-body-only-v2.png',539,[[149,229],[556,251],[944,287],[1365,347],[175,775],[616,796],[1027,836],[1449,862]],[-40,-45,-51,-61,-67,-73,-81,-87])]},
 cast:{parts:[part('cast-body-only-v2.png',478,[[101,188],[359,189],[610,191],[869,191],[99,700],[358,700],[611,701],[869,701],[101,1220],[355,1220],[611,1220],[870,1218]],-45,3)]},
 ultimate:{parts:[part('ultimate-body-only-v2.png',365,[[176,159],[542,66],[867,15],[1283,15],[162,389],[645,546],[1023,565],[1376,642],[274,1000],[570,886],[894,877],[1246,884]],[-45,-130,-166,-175,-178,-135,-95,-45,-24,-25,-35,-45],3)],contacts:[{frame:7,targetHeightFraction:0}]}
};
const fx=(source,count,rows,peak,anchor='center')=>({source,count,columns:4,rows,peak,anchor});
const effects={aura:fx('aura-fx-v1.png',12,3,6,'ground'),dash:fx('dash-fx-v1.png',12,3,5),slash:fx('slash-fx-v2.png',16,4,9),guard:fx('guard-fx-v2.png',12,3,6),charge:fx('charge-fx-v2.png',12,3,7,'ground'),execution:fx('execution-fx-v2.png',16,4,9,'ground'),ultimate:fx('ultimate-fx-v2.png',16,4,10,'ground')};
await fs.writeFile(path.join(root,'asset-specs.json'),JSON.stringify({motion,effects},null,2)+'\n');
console.log('108 body frames / 96 effect frames, original sword registered');
