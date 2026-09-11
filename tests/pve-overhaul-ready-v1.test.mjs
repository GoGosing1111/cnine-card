import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {createReleaseEncounter,ZONES} from '../preview/scrapyard-v3-v1/source/release-model.mjs';
import {createTowerV3Session} from '../js/tower-v3-session.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(read('assets/ui/project-v/characters/'+p));return m.characters.map(c=>({...c,grade:m.rarity}));});
const equipment=JSON.parse(read('assets/ui/project-v/account-battle-suits/manifest-v2.json'));
test('all three release encounters display the same server rules and the six separate SD assets',()=>{
  const art=new Set();for(const z of ZONES){const b=createReleaseEncounter({catalog,equipment,zone:z.id});assert.equal(b.resourceReady,true);assert.equal(b.cards.length,5);assert.equal(b.continuousEncounter.total,{OUTER:10,CORE:13,FURNACE:16}[z.id]);
    for(const r of b.continuousEncounter.instances){art.add(r.battleSprite);assert.notEqual(r.sourceArt,r.battleSprite);}assert.equal(b.difficulty.clearCoin,z.clearCoin);}
  assert.equal(art.size,6);
});
test('four generated sprites have real alpha, clear borders and unchanged foreground RGB',async()=>{
  for(const code of ['polarity','atlas','ravager','moloch']){
    const prefix=new URL('../preview/scrapyard-v3-v1/assets/'+code+'-sd-',import.meta.url);
    const source=await sharp(fs.readFileSync(new URL(prefix+'source-v1.png'))).removeAlpha().raw().toBuffer();
    const {data,info}=await sharp(fs.readFileSync(new URL(prefix+'v1.png'))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clear=0;for(let i=0;i<info.width*info.height;i++){for(let c=0;c<3;c++)assert.equal(data[i*4+c],source[i*3+c]);if(data[i*4+3]===0)clear++;if(i<info.width||i>=info.width*(info.height-1)||i%info.width===0||i%info.width===info.width-1)assert.equal(data[i*4+3],0);}
    assert.ok(clear/(info.width*info.height)>.3);
  }
});
test('tower recovery uses only request ID and selected tier, and does not retry validation errors',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},sent=[];let scheduled=0;
  const s=createTowerV3Session({accountId:7,storage,exclusive:(_k,f)=>f(),makeRequestId:()=> 'tower-qa',schedule:()=>{scheduled++;return 1;},unschedule:()=>{},transport:{status:async()=>({ok:true,status:'IDLE'}),run:async b=>{sent.push(b);return {ok:true,status:'COMPLETED',requestId:b.requestId,tier:b.tier,battleV2:{result:{winner:'A'}}};}}});
  await s.start('60');assert.deepEqual(sent,[{requestId:'tower-qa',tier:60}]);assert.equal(s.getState().phase,'READY');assert.equal(data.size,1);s.dispose();
  const s2=createTowerV3Session({accountId:7,storage,exclusive:(_k,f)=>f(),schedule:()=>{scheduled++;return 1;},unschedule:()=>{},transport:{status:async()=>({ok:true,status:'IDLE'}),run:async b=>{sent.push(b);throw Object.assign(new Error('Locked'),{code:'TOWER_V3_LOCKED'});}}});
  await s2.resume();assert.deepEqual(sent[1],sent[0]);assert.equal(scheduled,0);s2.dispose();
});
