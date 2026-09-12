import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {createCowEncounter} from '../preview/cow-room-v3-v1/source/model.mjs';
import {COW_ROOM_DRAFT,COW_ROOM_RELEASE_ENABLED,buildCowRoomBattle} from '../functions/_cow_room_v3.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(read('assets/ui/project-v/characters/'+p));return m.characters.map(c=>({...c,grade:m.rarity}));});
const equipment=JSON.parse(read('assets/ui/project-v/account-battle-suits/manifest-v2.json'));
const run=extra=>createCowEncounter({catalog,equipment,...extra});
test('cow room uses five real source cards and a separate support with one canonical battle',()=>{
  const p=run();assert.equal(p.cards.length,5);assert.equal(p.battleV2.teams.A.cards.length,5);assert.equal(p.battleV2.teams.A.supports.length,1);
  for(const c of p.cards){assert.ok(c.image);assert.notEqual(c.image,c.battleSprite);assert.ok(catalog.some(row=>row.cardId===c.id));}
  assert.equal(p.continuousEncounter.instances.length,22);assert.equal(p.continuousEncounter.instances.filter(row=>row.elite).length,3);
  assert.equal(p.battleV2.rules.battleSuitDamageAuthority,'SERVER_TIMELINE');
});
test('twenty seeds preserve all three encounter phases and never exceed three hostile slots',()=>{
  for(let seed=1;seed<=20;seed++){
    const p=run({seed}),info=p.continuousEncounter,byId=new Map(info.instances.map(row=>[row.id,row]));
    const active=new Set(info.initialIds),dead=new Set();
    for(const e of p.battleV2.result.timeline){
      if(e.type==='ENEMY_SPAWN'){
        const row=byId.get(e.targetId);assert.ok(row);assert.ok(!active.has(e.targetId));
        if(row.elite)assert.ok(info.instances.filter(r=>!r.elite&&!r.boss).every(r=>dead.has(r.id)));
        if(row.boss)assert.equal(dead.size,21);
        active.add(e.targetId);assert.ok(active.size<=3);
      }
      if(e.type==='KO'&&byId.has(e.targetId)){assert.ok(!dead.has(e.targetId));dead.add(e.targetId);active.delete(e.targetId);}
    }
    assert.equal(dead.size,p.battleV2.result.encounter.defeated);
    if(p.battleV2.result.winner==='A')assert.equal(dead.size,22);
  }
});
test('weak accounts can lose and stronger accounts do not cause enemies to scale',()=>{
  const weak=run({powerScale:.25}),base=run(),strong=run({powerScale:2});
  assert.equal(weak.battleV2.result.winner,'B');assert.equal(base.battleV2.result.winner,'A');assert.equal(strong.battleV2.result.winner,'A');
  assert.deepEqual(weak.battleV2.encounter.instances,strong.battleV2.encounter.instances);
  assert.deepEqual(run().battleV2.result,base.battleV2.result,'same seed is reproducible');
});
test('server builder rejects invalid parties, unsafe powers and oversized encounters',()=>{
  const snapshot={cards:run().cards};
  assert.throws(()=>buildCowRoomBattle({snapshot:{cards:snapshot.cards.slice(1)}}),/FIVE_CARDS/);
  for(const patch of [{normalCount:50},{simultaneous:6},{normalPower:NaN},{bossPower:1e12},{maxDuration:0},{maxActions:1000}])
    assert.throws(()=>buildCowRoomBattle({snapshot,config:{...COW_ROOM_DRAFT,...patch}}),/INVALID_COW_ROOM/);
  const cap=buildCowRoomBattle({snapshot,config:{...COW_ROOM_DRAFT,maxActions:2}});
  assert.equal(cap.battleV2.result.winner,'B');
});
test('new sprites have real alpha and keep useful silhouettes inside the canvas',async()=>{
  for(const name of ['cow-warrior','cow-king']){
    const image=sharp(new URL('../assets/ui/project-v/monsters/cow-room/'+name+'-sd-v1.png',import.meta.url).pathname.replace(/^\/(.:)/,'$1'));
    const m=await image.metadata(),s=await image.stats();assert.equal(m.hasAlpha,true);assert.ok(m.width>=1024&&m.height>=1024);assert.equal(s.channels[3].min,0);assert.equal(s.channels[3].max,255);
    const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let x0=info.width,y0=info.height,x1=0,y1=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    assert.ok(x0>0&&y0>0&&x1<info.width-1&&y1<info.height-1);
  }
});
test('cow combat reuses the V3 renderer and bridge without touching account economy or live navigation',()=>{
  assert.equal(COW_ROOM_RELEASE_ENABLED,false);
  const html=read('preview/cow-room-v3-v1/battle.html');
  for(const name of ['card.css','battle-v3-live.js','project-v-battle-art-adapter-v1.js','project-v-tier-battle-art-adapter-v1.js','project-v-monster-battle-art-adapter-v1.js','project-v-unassigned-battle-fallback-v1.js','scrapyard-v3-v1/battle-bridge.js'])assert.ok(html.includes(name));
  for(const file of ['index.html','js/app.js','functions/api/[[path]].js'])assert.doesNotMatch(read(file),/cow-room-v3|_cow_room_v3/);
  assert.doesNotMatch(read('functions/_cow_room_v3.js'),/INSERT |UPDATE |DELETE |env\.DB/);
});
