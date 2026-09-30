import fs from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {weaponAt,foreground,cleanAlpha,sha} from './compose-weapon.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const source='assets/source/dorsal-grip-closeup-v9.png';
await fs.copyFile('C:/Users/User/.codex/generated_images/01a0f210-dfde-7e73-acb5-b2cc712e8a32/exec-c3f5d633-3e7e-4f1a-96a9-11946d574a05.png',path.join(root,source));
const target='assets/knight-sd-v6-original-sword.png',original=await fs.readFile(path.join(root,target));
const patch=await cleanAlpha(await sharp(path.join(root,source)).resize(560,560).png().toBuffer());
// Only the elbow/forearm/glove region of this generated close-up is used.
// The locked original sword is restored above the arm, below its actual glove.
const region=[[72,126],[159,123],[166,179],[173,222],[206,256],[270,283],[293,339],[307,376],[279,398],[228,387],[192,373],[140,339],[108,299],[77,260],[58,205]];
const selected=await foreground(patch,region);
const glovePolygon=[[220,292],[245,288],[267,289],[284,306],[296,327],[298,350],[286,377],[263,388],[241,380],[222,365],[214,344],[215,320]];
const glove=await foreground(patch,glovePolygon);
const weapon=await weaponAt({scale:1,angle:-32,grip:[521,557]});
const output='assets/knight-sd-v9-dorsal-grip.png';
const png=await sharp(original).composite([{input:selected,left:260,top:230},{input:weapon.input,left:weapon.left,top:weapon.top},{input:glove,left:260,top:230}]).png().toBuffer();
await fs.writeFile(path.join(root,output),png);
await fs.writeFile(path.join(root,'assets/knight-sd-v9-dorsal-grip.json'),JSON.stringify({version:9,status:'USER_REVIEW_PENDING',source,sourceSha256:sha(await fs.readFile(path.join(root,source))),target,targetSha256:sha(original),output,outputSha256:sha(png),generatedEdit:'RIGHT_ELBOW_FOREARM_AND_DORSAL_GLOVE_ONLY',editRect:[260,230,560,560],armPolygon:region,glovePolygon,weapon:weapon.record,weaponTransformUnchanged:true,feet:[644,1510],bodyPixels:1452},null,2)+'\n');
await sharp(png).extract({left:280,top:370,width:420,height:340}).resize(840,680).flatten({background:'#152031'}).png().toFile(path.join(root,'qa/grip-v9-closeup.png'));
console.log(output);
