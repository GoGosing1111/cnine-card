import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import art from '../assets/ui/tower-monsters-20261124/manifest.json' with {type:'json'};
import files from '../docs/qa/tower-200-20261124/art-files.json' with {type:'json'};
import {towerMonsterArt,presentTowerMonsters} from '../shared/tower-monsters-20261022.mjs';
import {presentOriginalIpResponse} from '../shared/monster-original-ip-presentation-v1.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
import {reviewBattle} from './helpers/tower-expansion-20261102.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('each independent tower drawing ships as an anchored and transparent mobile sprite',async()=>{
  assert.equal(art.sprites.length,9);
  assert.equal(new Set(files.sprites.map(row=>row.sourceSha256)).size,9);
  for(const {key,name,image} of art.sprites){
    const row=files.sprites.find(r=>r.key===key);
    assert.equal(row.name,name);assert.equal(row.image,image);
    const bytes=await readFile(image.slice(1)),source='docs/qa/tower-200-20261124/'+row.source;
    assert.equal(sha(bytes),row.sha256);assert.equal(sha(await readFile(source)),row.sourceSha256);
    assert.equal(isProductionFile(source),false);assert.equal(isProductionFile(image.slice(1)),true);
    assert(bytes.length<125000);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual([info.width,info.height],[640,640]);
    let solid=0,lastSolid=0;
    for(let i=0;i<640*640;i++){
      const a=data[i*4+3],x=i%640,y=Math.floor(i/640);
      if(x<20||x>=620||y<12||y>=580)assert.equal(a,0,key);
      if(a>100){solid++;lastSolid=y;}
    }
    assert(solid>26000&&solid<315000&&lastSolid>=570&&lastSolid<577,key);
  }
});

test('floor previews and all 28 encounter actors follow the three inclusive art bands and six unique guardians',()=>{
  const six=new Set();
  for(let floor=150;floor<=200;floor++){
    const band=art.cohorts.find(r=>r.first<=floor&&floor<=r.last);
    const normal=art.sprites.find(r=>r.key===band.regular);
    const expected=art.guardians[floor]?art.sprites.find(r=>r.key===art.guardians[floor]):{...normal,name:normal.name+' 우두머리'};
    if(art.guardians[floor])six.add(expected.image);
    const actor=i=>({id:'B:1:ENCOUNTER:TOWER:'+floor+':'+i,cardId:'MONSTER:18',
      title:i>=25&&i<28?'정예 이전':'이전',displayName:'이전 '+i,battleSprite:'old',image:'old',hp:14});
    const old={floorNo:floor,monster:{id:18,name:'old',image:'old'},cards:[{id:18,title:'용병',image:'player'}],
      continuousEncounter:{total:28,instances:Array.from({length:28},(_,i)=>actor(i+1))}};
    const status=presentOriginalIpResponse('tower/status',{floor:{floorNo:floor,monsterId:18,monsterName:'old',monsterImage:'old',isBoss:floor%10===0}});
    assert.deepEqual([status.floor.monsterName,status.floor.monsterImage],[expected.name,expected.image]);
    for(const route of ['tower/start','tower/pending','tower/finish']){
      const body=route==='tower/pending'?{pending:old}:old;
      const projected=presentOriginalIpResponse(route,body),out=projected.pending??projected;
      assert.deepEqual([out.monster.name,out.monster.image],[expected.name,expected.image]);assert.deepEqual(out.cards,old.cards);
      out.continuousEncounter.instances.forEach((enemy,i)=>{
        const guardian=i===27,look=guardian?expected:normal,name=(i>=24&&!guardian?'정예 ':'')+look.name;
        assert.deepEqual([enemy.title,enemy.image,enemy.battleSprite,enemy.projectVMonsterArt.primaryUrl,enemy.hp],[name,look.image,look.image,look.image,14]);
      });
      assert.deepEqual(presentTowerMonsters(projected),projected);
    }
    assert.equal(old.monster.name,'old');
  }
  assert.equal(six.size,6);
  assert.equal(towerMonsterArt(18,149,true),towerMonsterArt(18));
  assert.equal(towerMonsterArt(18,201,true),towerMonsterArt(18));
  const input={floor:{floorNo:180,monsterId:18,monsterName:'hunt',monsterImage:'hunt.png'}};
  assert.deepEqual(presentOriginalIpResponse('battle/fight',input),input);
  const battle=presentTowerMonsters(reviewBattle({floor:150}));
  for(const fighters of [battle.continuousEncounter.instances,battle.battleV2.encounter.instances,battle.battleV2.result.final.B]){
    assert.equal(fighters[0].battleSprite,towerMonsterArt(17,150).image);
    assert.equal(fighters.at(-1).battleSprite,towerMonsterArt(18,150,true).image);
  }
});
