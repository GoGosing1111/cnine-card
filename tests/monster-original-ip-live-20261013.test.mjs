import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ORIGINAL_IP_MONSTERS} from '../shared/monster-original-ip-data-v1.mjs';
import {presentOriginalIpResponse,originalHuntPresentation,originalRaidPresentation} from '../shared/monster-original-ip-presentation-v1.mjs';
import {weeklyRaidBossByName} from '../functions/_raid_weekly_bosses_v1.js';
import {buildMonsterFighter} from '../functions/_battle_v2_preview.js';

test('36 exact approved source/SD pairs and every hunt alias; excluded SD entries stay byte-equivalent',async()=>{
  const manifest=JSON.parse(await readFile('preview/monster-original-ip-sd-20261013-v1/manifest.json'));
  const live=JSON.parse(await readFile('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'));
  assert.equal(ORIGINAL_IP_MONSTERS.length,36);
  for(const e of ORIGINAL_IP_MONSTERS){
    const approved=manifest.entries.find(row=>row.key===e.key);
    assert.equal(e.sourceSha256,approved.sourceArt.sha256);
    assert.equal(e.spriteSha256,approved.battleSprite.sha256);
    for(const [file,sha] of [[e.sourceArt,e.sourceSha256],[e.battleSprite,e.spriteSha256]])assert.equal(createHash('sha256').update(await readFile(file.slice(1))).digest('hex').toUpperCase(),sha);
    for(const id of e.monsterIds){
      assert.equal(originalHuntPresentation(id).key,e.key);
      const row=live.sprites.find(row=>row.monsterId===id||row.aliases?.includes(id));
      assert.equal(row.battleSprite,e.battleSprite.slice(1));assert.equal(row.name,e.name);
    }
  }
  for(const e of manifest.excluded)assert.equal(originalHuntPresentation(e.id),null);
});
test('only content presentation changes; no player nickname/card, request or combat result rewriting',()=>{
  const monster={id:14,name:'사스케',image:'old.png',isBoss:true,battle_power:90000};
  const boss=buildMonsterFighter(monster),player={id:14,name:'사스케',cardId:'CN-14',image:'player.png'};
  const timeline=[{type:'BOSS_ULTIMATE',actorId:boss.id,label:'아마테라스',hits:[{targetId:player.id,damage:300,hpAfter:700}],turn:9},{type:'RESULT',winner:'A'}];
  const input={monster,cards:[player],battleV2:{teams:{A:{cards:[player]},B:{cards:[boss]}},result:{timeline,winner:'A',reward:500}},bossUltimate:{name:'아마테라스',mediaUrl:'old.mp4',soundUrl:'voice.mp3',durationMs:4000,damagePercent:65,maxUses:2},requestId:'receipt-1'};
  const before=structuredClone(input),out=presentOriginalIpResponse('battle/fight',input);
  assert.deepEqual(input,before);
  assert.equal(out.monster.name,'시엔');assert.equal(out.battleV2.teams.B.cards[0].title,'시엔');
  assert.deepEqual(out.cards,input.cards);assert.deepEqual(out.battleV2.teams.A,input.battleV2.teams.A);
  for(const key of ['id','cardId','hp','maxHp','attack','defense','speed','pveBuffs'])assert.deepEqual(out.battleV2.teams.B.cards[0][key],boss[key]);
  assert.deepEqual(out.battleV2.result.timeline[0].hits,timeline[0].hits);assert.equal(out.battleV2.result.winner,'A');assert.equal(out.requestId,'receipt-1');
  assert.equal(out.bossUltimate.mediaUrl,'');assert.equal(out.bossUltimate.soundUrl,'');assert.equal(out.bossUltimate.damagePercent,65);assert.equal(out.bossUltimate.durationMs,4000);assert.equal(out.bossUltimate.presentation,'V3_EXISTING_EFFECT');
  assert.equal(presentOriginalIpResponse('me/collection',input),input);
});
test('NORMAL and Big Seal keep their names, source, SD and ultimate contract',()=>{
  for(const id of [2,3,5,8,9,17,18,19,20,21,22,23,24,27,28,64,67,68,69]){
    const input={monster:{id,name:'unchanged',image:'old.png'},bossUltimate:{mediaUrl:'keep.mp4',name:'keep',damagePercent:10}};
    assert.deepEqual(presentOriginalIpResponse('battle/fight',input),input);
  }
});
test('active weekly raid snapshots, minions and title aliases use current approved art; inactive boss untouched',()=>{
  const input={current:{id:100,bossName:'나가토',bossImage:'old.jpg',bossBattleSprite:'old.webp',currentHp:120},weeklyBosses:[{id:4,name:'나가토',image:'old.jpg'}],settings:{bossProfile:{code:'NAGATO',name:'나가토',sourceArt:'old.jpg',battleSprite:'old.webp',minions:[{code:'PAIN_ANIMAL',sprite:'old.webp',currentHp:25}]}},bosses:[{id:1,name:'은퇴',image:'unchanged.png'}]};
  const out=presentOriginalIpResponse('raid/status',input),e=originalRaidPresentation(4);
  assert.equal(out.current.bossName,e.name);assert.equal(out.current.bossImage,e.sourceArt);assert.equal(out.current.bossBattleSprite,e.battleSprite);assert.equal(out.current.currentHp,120);
  assert.equal(out.settings.bossProfile.minions[0].sprite,originalHuntPresentation(30).battleSprite);assert.equal(out.settings.bossProfile.minions[0].currentHp,25);
  assert.deepEqual(out.bosses,input.bosses);assert.equal(weeklyRaidBossByName('오르제').code,'NAGATO');assert.equal(weeklyRaidBossByName('나가토').code,'NAGATO');
});
test('saved special raid boss/card projections replace old form sprites without changing phase or fighter IDs',()=>{
  for(const [route,id,code]of [['madara','MADARA','MADARA'],['lich','LICH_KING','LICH_KING'],['core','CORE_ARCHEON','CORE_PROTOCOL']]){
    const boss={id:'B:0:MONSTER:'+id,cardId:'MONSTER:'+id,title:'old',isBoss:true,image:'old.png',hp:50,maxHp:100,projectVMonsterArt:{primaryUrl:'old-form.png',scaleMultiplier:1.5}};
    const input={monster:{id,name:'old',image:'old.png'},battleV2:{teams:{B:{cards:[boss]}}},phase:5,settings:{bossName:'old',bossImage:'old.png'}};
    const out=presentOriginalIpResponse('raid/'+route+'/battle',input),e=originalRaidPresentation(code);
    assert.equal(out.monster.name,e.name);assert.equal(out.battleV2.teams.B.cards[0].projectVMonsterArt.primaryUrl,e.battleSprite);assert.equal(out.battleV2.teams.B.cards[0].id,boss.id);assert.equal(out.phase,5);
  }
});
test('server projection and V3 existing atlas are wired, and Madara never loads old body frames',async()=>{
  const api=await readFile('functions/api/[[path]].js','utf8'),engine=await readFile('preview/project-v-v3/source/battle/BattleEngine.js','utf8'),madara=await readFile('preview/madara-raid-v1/presentation.js','utf8');
  assert.match(api,/const json=\(data,status,headers\)=>originalIpJson\(path,data,status,headers\)/);
  assert.match(engine,/this\.apocalypseMode\|\|this\.originalIpUltimateMode\)\&\&await this\.playApocalypseBossUltimate/);
  assert.match(madara,/if\(key==='cast'\)return/);assert.doesNotMatch(madara,/assets\.frames\.cast/);
});
