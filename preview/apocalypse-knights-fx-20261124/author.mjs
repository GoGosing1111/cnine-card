// Author the six secondary particle passes in Effekseer 1.70e.
// The original painted sequence and the particle pass remain separately placeable.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {t, ring, spark} from '../v35-effects-production-20261102/effekseer-nodes.mjs';

const editor = process.env.V35_EFFEKSEER;
if (!editor) throw Error('Set V35_EFFEKSEER to the Effekseer 1.70e executable.');
const native = path.join(import.meta.dirname, 'native');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'knight-effekseer-'));
await fs.mkdir(native, {recursive:true});
const red = [255,48,43,245], gold = [255,168,77,244];
const white = [222,252,255,250], cyan = [36,205,255,232], violet = [115,137,255,214];
const rad = angle => angle * Math.PI / 180;
const fan = (count, makeNode) => Array.from({length:count}, (_, i) => makeNode(i));
function splinter(name, angle, distance, speed, delay, life, color, length, width, y = 0) {
  const xAxis = Math.cos(rad(angle)), yAxis = Math.sin(rad(angle));
  return spark({name, color, delay, life, fade:Math.round(life*.7), rotation:[0,0,angle],
    location:[xAxis*distance, y+yAxis*distance, 0], velocity:[xAxis*speed, yAxis*speed, 0],
    start:[.85,1,1], end:[.12,.18,1]}, length, width);
}
const seal = [
  ...fan(12, i => splinter('Iron filings drawn into the lock '+i, 15+i*30, 3.6, -.09, 4+i%4, 30, red, .38,.043)),
  ...fan(16, i => splinter('Crossing hot rivet '+i, (i%2?158:22)+Math.floor(i/2)*4, .1, .16, 31+i%3, 22, i%3?gold:red, .52,.045)),
  ring({name:'Sealing pressure seam',r:2.3,inner:2.18,from:12,to:334,color:red,delay:30,life:18,start:[.2,.18,1],end:[1,.48,1]})
];
const lotus = [
  ...fan(9, i => ring({name:'Inward petal cinder '+i, r:3.2,inner:3.06,from:i*40,to:i*40+22,
    spin:[0,0,2.8],start:[1,.78,1],end:[.16,.17,1],delay:3+i%4,life:34,color:i%3?red:gold})),
  ...fan(17, i => splinter('Updraft from exposed heart '+i, 45+i*5.3, .26, .088+(i%4)*.018, 33+i%7, 21, i%3?red:gold, .27,.055))
];
const sword = [
  ...fan(9, i => splinter('Downward blade wake '+i, 78+i*2, 3.7, -.16, 14+i%4, 19, red,.82,.032)),
  ...fan(24, i => splinter('Floor ejecta '+i, 6+i*7.25, .13, .12+i%5*.033, 31+i%3, 21+i%6, i%4?red:gold, .52,.063)),
  ...fan(2, i => ring({name:'Ground rupture '+i, r:3.4+i*.4,inner:3.26+i*.4,from:6,to:330,color:i?gold:red,delay:31+i*3,life:19,start:[.08,.025,1],end:[1.25,.27,1]}))
];
const tide = [
  ...fan(16, i => splinter('Foam blown off the crest '+i, 70+i*6, .27+(i%4)*.25, .12+i%3*.027, 9+i, 24, i%4?cyan:white,.23,.07)),
  ...fan(7, i => ring({name:'Elliptical undertow '+i,r:2.5+i*.12,inner:2.42+i*.12,from:16+i*20,to:142+i*19,
    color:i%2?cyan:white,delay:22+i*2,life:25,location:[.65-i*.13,0,0],velocity:[-.035,0,0],start:[.16,.09,1],end:[1.25,.3,1]}))
];
const freeze = [
  ...fan(3, i => ring({name:'Precessing astrolabe orbit '+i,r:2.9,inner:2.82,from:6+i*105,to:286+i*29,
    color:i===1?white:cyan,delay:2+i*3,life:40,rotation:[0,0,52*i],spin:[0,0,(i%2?-1:1)*1.65],start:[.38,.12,1],end:[1,.34,1]})),
  ...fan(16, i => splinter('Radial ice cleavage '+i, i*22.5, 1.2, .095+i%4*.014, 39+i%5, 19, i%3?white:cyan,.55,.095))
];
const star = [
  ...fan(14, i => splinter('Infall to the eclipse '+i, 14+i*25.7, 3.8, -.125, i%6, 27, i%2?violet:cyan,.44,.038)),
  ...fan(20, i => splinter('Stellar impact ray '+i, i*18+8, .09, .13+i%4*.03, 36+i%3, 21, i%3?cyan:white,.79,.041)),
  ring({name:'Receding impact horizon',r:4,inner:3.77,color:violet,delay:36,life:24,start:[.08,.035,1],end:[1.12,.31,1]})
];
function exportNative(input, output, runtime) {
  const run = spawnSync(editor,['-cui','-in',input,'-o',output,'-e',runtime],{cwd:path.dirname(editor),encoding:'utf8',windowsHide:true});
  if (run.status !== 0) throw Error(run.error?.message || run.stderr || 'Effekseer export failed');
}
for (const [key,nodes] of Object.entries({'rahden-seal':seal,'rahden-curse':lotus,'rahden-ultimate':sword,'velsir-curse':tide,'velsir-seal':freeze,'velsir-ultimate':star})) {
  const xml = '<?xml version="1.0" encoding="utf-8"?>'+t('EffekseerProject',t('Root',t('Name',key)+t('Children',nodes.join('')))+t('ToolVersion','1.70e')+t('Version',3)+t('StartFrame',0)+t('EndFrame',64)+t('IsLoop','False'));
  const source = path.join(temp,key+'.efkproj'), project = path.join(native,key+'.efkefc'), runtime = path.join(native,key+'.efk');
  await fs.writeFile(source,xml);
  exportNative(source,project,path.join(temp,key+'-import.efk'));
  exportNative(project,path.join(temp,key+'-reopened.efkefc'),runtime);
  exportNative(path.join(temp,key+'-reopened.efkefc'),path.join(temp,key+'-again.efkefc'),path.join(temp,key+'-again.efk'));
  const bytes = await fs.readFile(runtime);
  if (!bytes.equals(await fs.readFile(path.join(temp,key+'-again.efk'))) || bytes.length < 1000) throw Error(key+' native round trip failed');
  console.log(key,nodes.length,'emitters',bytes.length,'bytes');
}
