import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {TOWER_MONSTERS,presentTowerMonsters} from '../shared/tower-monsters-20261022.mjs';
import {presentOriginalIpResponse} from '../shared/monster-original-ip-presentation-v1.mjs';
import {buildTowerV3Battle,TOWER_V3_DRAFT} from '../functions/_tower_v3.js';
import {combatHash,inputFor} from '../docs/qa/tower-monsters-20261022/combat-contract.mjs';
import {isProductionFile,towerMonsterQaOnly} from '../scripts/prepare-production-assets.mjs';
import {jointFixture} from './helpers/joint-db.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');

test('14 original Tower assets retain source hashes, actual alpha and clear canvas edges',async()=>{
 assert.equal(TOWER_MONSTERS.length,14);assert.equal(new Set(TOWER_MONSTERS.map(r=>r.monsterId)).size,14);
 for(const art of TOWER_MONSTERS){
  assert.equal(sha(await fs.readFile(art.source)),art.sourceSha256);
  const bytes=await fs.readFile(art.image.slice(1));assert.equal(sha(bytes),art.sha256);assert.ok(bytes.length<125000);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([info.width,info.height,info.channels],[640,640,4]);
  let visible=0;for(let y=0;y<640;y++)for(let x=0;x<640;x++){const alpha=data[(y*640+x)*4+3];if(alpha>8)visible++;if(x<16||x>=624||y<16||y>=592)assert.equal(alpha,0,art.key+' edge');}
  assert.ok(visible>640*640*.12,art.key);assert.equal(art.artFacing,-1);assert.equal(art.footAnchor.y,.9);
 }
});
test('all 120 floors and both winning/losing decks preserve exact seeded combat before art replacement',async()=>{
 const floors=(await read('docs/qa/tower-abyss-growth-20261022/floor-plan.json')).rows,before=(await read('docs/qa/tower-monsters-20261022/combat-before.json')).rows;
 assert.equal(before.length,240);
 const paths=new Set(TOWER_MONSTERS.map(r=>r.battleSprite)),seen=new Set();
 for(const expected of before){
  const battle=buildTowerV3Battle({...inputFor(floors[expected.floor-1],expected.weak),config:{...TOWER_V3_DRAFT,maxTier:120,powerGrowth:1.001}});
  assert.equal(combatHash(battle),expected.hash,`floor ${expected.floor} weak=${expected.weak}`);
  for(const monster of battle.continuousEncounter.instances){assert.ok(paths.has(monster.battleSprite),monster.battleSprite);seen.add(monster.battleSprite);}
 }
 assert.equal(seen.size,14);
});
test('Tower response boundary replaces entry, elites and old pending art without mutating snapshots or players',()=>{
 const player={id:17,cardId:'17',name:'위장악성',image:'player.png',power:12345};
 const old={requestId:'saved-old',reward:42,monster:{id:69,name:'old',image:'old.png'},floor:{monsterId:69,monsterName:'old',monsterImage:'old.png',monsterPower:1800000000},cards:[player],pending:{continuousEncounter:{instances:[{id:'B:1:ENCOUNTER:1',cardId:'MONSTER:17',name:'정예 위장악성',displayName:'정예 위장악성 25',elite:true,battleSprite:'old.png',maxHp:78,attack:9}]}}};
 const saved=structuredClone(old),out=presentOriginalIpResponse('tower/pending',old);
 assert.deepEqual(old,saved);assert.deepEqual(out.cards,old.cards);assert.equal(out.floor.monsterName,'나락의 군주');assert.equal(out.monster.name,'나락의 군주');assert.equal(out.floor.monsterPower,old.floor.monsterPower);
 const elite=out.pending.continuousEncounter.instances[0];assert.equal(elite.displayName,'정예 재의 사냥개 25');assert.equal(elite.maxHp,78);assert.equal(elite.attack,9);assert.equal(elite.id,old.pending.continuousEncounter.instances[0].id);
 assert.deepEqual(presentTowerMonsters(out),out);assert.equal(out.requestId,old.requestId);assert.equal(out.reward,42);
 for(const route of ['battle/fight','raid/status','admin/battle','me/collection'])assert.deepEqual(presentOriginalIpResponse(route,old),old,route);
 assert.deepEqual(presentTowerMonsters({monster:{id:999999,name:'custom',image:'custom.png'}}),{monster:{id:999999,name:'custom',image:'custom.png'}});
});
test('actual Tower status exposes every replacement and never changes CMS rows or account coins',async t=>{
 const f=await jointFixture(t),tower=await operatingTowerFixture(f,{maxFloor:120}),coin=await f.coin();
 for(const art of TOWER_MONSTERS){
  if(art.monsterId!==28)await f.p('INSERT INTO battle_monsters(id,name,image_url,battle_power,is_boss) VALUES(?,?,?,?,1)',art.monsterId,'CMS original '+art.monsterId,'cms-original.png',1000000).run();
  await f.p('UPDATE tower_floor_ranges SET monster_id=? WHERE id=2094',art.monsterId).run();
  const input=await f.p('SELECT * FROM battle_monsters WHERE id=?',art.monsterId).first();
  const response=await tower.handle('tower/status',new Request('https://game.example/api/tower/status',{headers:{authorization:'Bearer local-account-7'}}));assert.equal(response.status,200);
  const status=await response.json();assert.equal(status.floor.monsterName,art.name);assert.equal(status.floor.monsterImage,art.image);assert.equal(status.floor.monsterId,art.monsterId);
  assert.deepEqual(await f.p('SELECT * FROM battle_monsters WHERE id=?',art.monsterId).first(),input);
 }
 assert.equal(await f.coin(),coin);
});
test('runtime art ships while originals and Node-only runners stay in Git, with every old sprite retained',async()=>{
 for(const art of TOWER_MONSTERS){assert.equal(isProductionFile(art.image.slice(1)),true);assert.equal(isProductionFile(art.source),false);}
 assert.equal(towerMonsterQaOnly.size,16);for(const path of towerMonsterQaOnly){assert.equal(isProductionFile(path),false);assert.match(await fs.readFile(path,'utf8'),/node:(?:assert|fs|test)/);}
 const old=await read('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json');
 for(const row of old.sprites.filter(r=>TOWER_MONSTERS.some(a=>a.monsterId===r.monsterId))){assert.equal(isProductionFile(row.battleSprite),true);assert.equal(sha(await fs.readFile(row.battleSprite)).toUpperCase(),row.sha256);}
});
