import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {SAINT_CODE,SAINT_EVENT,SAINT_FIELD_RATE,SAINT_SKILLS} from '../shared/mercenary-lightning-saint-v1.mjs';
import {saintBattleArt} from '../preview/project-v-v3/source/battle/LightningSaintCombatPlayback.js';
import {actorPlacement,saintFieldFxScale} from '../preview/project-v-v3/source/battle/lightning-saint/mercenary.mjs';
import {skillPose} from '../preview/project-v-v3/source/battle/lightning-saint/choreography.mjs';
import {bladeTracks} from '../preview/project-v-v3/source/battle/lightning-saint/blade-tracks.mjs';
import {citadelHitRows,citadelVisualReceipts} from '../js/legion-citadel-v1.mjs';

const art=saintBattleArt(SAINT_CODE);
const directory='assets/ui/project-v/mercenaries/lightning-saint-20261125/';

test('field scaling measures the standing body separately from the greatsword',async()=>{
 const {data,info}=await sharp(directory+'guard.webp').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let head=0;
 for(;head<info.height;head++){
  let pixels=0;
  for(let x=0;x<125;x++)if(data[(head*info.width+x)*4+3]>156)pixels++;
  if(pixels>=4)break;
 }
 assert.equal(art.fullBodyHeight*(info.height-head)/info.height,art.bodyHeight);
 assert.equal(art.bodyHeight,300);
 // Bright widths at the authored crest, expressed in the same standing-body units as Ryujin.
 const H=(info.height-head)*.846;
 for(const [id,width,min,max] of [['basic',434*.92,2.4,2.7],['cleave',583*1.08*.92,4.7,4.9],
  ['rush',729*.95,6.4,6.8],['wave',637*.99,6,7],['cross',801*.93,10.2,10.5],['horizon',1065*.93,10.4,10.8]]){
  const visible=width*saintFieldFxScale(id,1)/H;
  assert(visible>=min&&visible<=max,id+' '+visible);
 }
});

test('every physical cut releases on its receipt including both crossed cuts and the finisher',()=>{
 for(const key of ['cleave','cyclone','rush','cross','wave','pursuit','horizon']){
  const skill=SAINT_SKILLS.find(s=>s.key===key);
  for(const at of skill.contactsMs){
   const pose=skillPose(key,at/1000);
   assert(Math.abs(pose.progress-.58)<1e-6,key+' '+at+' '+pose.kind+' '+pose.progress);
  }
 }
 for(const name of ['battle-hd.bin','battle-sd.bin']){
  const bytes=readFileSync(directory+name),actor=JSON.parse(bytes.subarray(4,bytes.readUInt32LE()+4)).actor;
  for(const facing of [-1,1])for(const scale of [.5,1.25]){
   for(const [key,ms] of [['cleave',288],['horizon',4208]]){
    const opts={scale,facing,source:[145,370],target:[280,310],floor:[280,430]};
    const pose=actorPlacement(actor,key,ms/1000,opts),id=actor.frames[pose.sample],offset=actor.sprites[id].offset;
    assert.equal(pose.sample,actor.banks.v2.start+41);
    const [, ,tx,ty]=bladeTracks[id];
    const x=pose.x+(tx+offset[0]-pose.pivot[0])*pose.bodyScale*pose.direction;
    const y=pose.y+(ty+offset[1]-pose.pivot[1])*pose.bodyScale;
    assert(Math.hypot(x-280,y-430)<2*scale);
   }
  }
 }
});

test('Citadel splits light-mode receipts and uses animated impact numbers once in the detailed field',()=>{
 const saints=new Set(['a']),skill=SAINT_SKILLS.find(s=>s.key==='cross');
 const hits=[{targetId:'b',damage:3,absorbed:7},{targetId:'c',damage:0,absorbed:0,dodge:true}];
 const event={actorId:'a',combatAtMs:5000,type:SAINT_EVENT,hits,beats:skill.contactsMs.map(atMs=>({atMs,hits}))};
 assert.deepEqual(citadelVisualReceipts(event,saints,false),[]);
 const light=citadelVisualReceipts(event,saints,true);
 assert.equal(light.length,5);
 assert.deepEqual(light.map(r=>r.combatAtMs),skill.contactsMs.map(t=>5000+t/SAINT_FIELD_RATE));
 for(const r of light)assert.deepEqual(citadelHitRows(r).map(h=>[h.id,h.damage,h.shield,h.dodge]),[['b',3,7,false],['c',0,0,true]]);
 const turn={actorId:'a',type:'TURN',targetId:'b',damage:2};
 assert.deepEqual(citadelVisualReceipts(turn,saints,false),[]);
 for(const other of [{...turn,actorId:'other'},{...turn,dodge:true},{...event,beats:undefined}])
  assert.deepEqual(citadelVisualReceipts(other,saints,false),[other]);
});
