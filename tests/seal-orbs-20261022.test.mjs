import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {isProductionFile,sealOrbQaOnly} from '../scripts/prepare-production-assets.mjs';
const source=fs.readFileSync('js/battle-v3-live.js','utf8');
function bridge(Image=class {}){
  const context={console,setTimeout,clearTimeout,Image};context.window=context;
  vm.runInNewContext(source,context);
  return context.ProjectVBattleV3Live;
}

test('each seal role supplies its new sprite to the actual V3 payload while the dragon is unchanged',()=>{
  const api=bridge();
  for(const [role,label] of [['ATTACK','파괴'],['GUARD','수호'],['PURIFY','정화']]){
    const p=api.sealPayload({roleKey:role,data:{result:'WIN',cards:[{cardId:'1',name:'QA',image:'/qa.png'}]}});
    const art=p.monster.projectVMonsterArt;
    assert.equal(art.primaryUrl,`/assets/ui/seal-battle/orbs-20261022/${role.toLowerCase()}.webp`);
    assert.equal(art.sealRole,role);assert.equal(art.approved,false);
    assert.equal(p.monster.name,label+' 봉인구');
    assert.equal(p.battleV2.teams.B.cards[0].image,art.primaryUrl);
    assert.equal(p.monster.hp,100);assert.equal(p.monster.maxHp,100);
    assert.equal(p.battleV2.result.winner,'A');
  }
  const dragon=api.sealPayload({roleKey:'BOSS',data:{battlePhase:'BOSS',bossHpBefore:1000,bossMaxHp:2000,contribution:100,result:'WIN',cards:[]}});
  assert.equal(dragon.monster.projectVMonsterArt.kind,'SEAL_DRAGON_SD');
  assert.equal(dragon.monster.image,'/assets/ui/seal-battle/dragon-20261022/portrait.webp');
});

test('orb preload shares work, supports the matching PNG, and retries after total failure',async()=>{
  const requests=[];let failAll=false;
  class Image {
    set src(url){requests.push(url);queueMicrotask(()=>{if(failAll||url.endsWith('.webp'))this.onerror?.();else{this.naturalWidth=768;this.onload?.();}});}
  }
  const api=bridge(Image);
  await Promise.all([api.prepareSealOrb('GUARD'),api.prepareSealOrb('GUARD')]);
  assert.equal(requests.length,2);assert(requests.every(x=>x.includes('/guard.')));
  await api.prepareSealOrb('GUARD');assert.equal(requests.length,2);
  failAll=true;await assert.rejects(api.prepareSealOrb('PURIFY'),/봉인구/);
  failAll=false;await api.prepareSealOrb('PURIFY');
  assert.equal(requests.length,6);
  const player=fs.readFileSync('js/seal-battle.js','utf8');
  assert(player.indexOf('await globalThis.ProjectVBattleV3Live.prepareSealOrb(roleKey)')<player.indexOf("await api('seal-battle/participate'"));
});

test('seal and dragon playback include the saved mercenary attack and exactly the committed damage',()=>{
  const api=bridge(),cards=Array.from({length:5},(_,i)=>({id:'qa-'+i,title:'카드 '+i,grade:'SS'}));
  const mercenary={id:'A:MERCENARY:V-999',cardId:'V-999',code:'V-999',name:'헬리오스',isMercenary:true,actorKind:'MERCENARY',hp:50000,maxHp:50000,power:30000};
  for(const roleKey of ['ATTACK','GUARD','PURIFY','BOSS'])for(const result of ['WIN','LOSE']){
    const data={cards,mercenary,result,playerPower:50000,totalBattleDamage:50000,mercenaryBattlePower:30000,
      contribution:17,battlePhase:roleKey==='BOSS'?'BOSS':'SEALS',bossHpBefore:17,bossHpAfter:0,bossMaxHp:200000,bossDefeated:roleKey==='BOSS'};
    const payload=api.sealPayload({roleKey,data}),team=payload.battleV2.teams.A,timeline=payload.battleV2.result.timeline;
    assert.equal(team.cards.length,5);assert.equal(team.mercenaries.length,1);assert.equal(team.mercenaries[0].id,mercenary.id);
    const hits=timeline.filter(e=>e.targetId===payload.monster.cardId&&['TURN','SKILL'].includes(e.type));
    assert.equal(hits.length,6);assert.equal(hits.reduce((n,e)=>n+e.damage,0),17);
    const hit=hits.find(e=>e.actorId===mercenary.id);assert.equal(hit.type,'TURN');assert.equal(hit.actorKind,'MERCENARY');assert(hit.damage>0);
    assert.equal(payload.playUltimateCinematics,false);
    if(roleKey==='BOSS'){assert.equal(hits.at(-1).targetHpAfter,0);assert(hits.every(e=>e.targetMaxHp===200000));}
    if(result==='LOSE'&&roleKey!=='BOSS'){
      const counter=timeline.find(e=>e.type==='COUNTER'&&e.targetId===mercenary.id);
      assert.equal(counter.targetHpAfter,0);assert.equal(counter.targetMaxHp,50000);
      assert(timeline.some(e=>e.type==='KO'&&e.targetId===mercenary.id));
    }
    assert.equal(mercenary.hp,50000,'playback must not mutate the receipt');
  }
  const unassigned=api.sealPayload({data:{cards,result:'WIN',mercenary:null}});
  assert.equal(unassigned.battleV2.teams.A.mercenaries.length,0);
});

test('all six runtime orb files retain alpha and ship within the Pages cap; exact sources remain in Git',async()=>{
  const manifest=JSON.parse(fs.readFileSync('docs/qa/seal-orbs-20261022/manifest.json','utf8'));
  const hash=b=>createHash('sha256').update(b).digest('hex');
  for(const row of manifest.assets){
    assert.equal(hash(fs.readFileSync(row.source.file)),row.source.sha256);
    assert.equal(isProductionFile(row.source.file),false);
    for(const asset of row.outputs){
      const buffer=fs.readFileSync(asset.file);assert.equal(hash(buffer),asset.sha256);assert(isProductionFile(asset.file));
      const m=await sharp(buffer).metadata(),s=await sharp(buffer).stats();
      assert.equal(m.width,768);assert.equal(m.height,768);assert.equal(m.hasAlpha,true);
      assert.equal(s.channels[3].min,0);assert.equal(s.channels[3].max,255);
    }
  }
  for(const file of sealOrbQaOnly){assert.equal(isProductionFile(file),false);assert.match(fs.readFileSync(file,'utf8'),/from 'node:/);}
  const tracked=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
  const count=tracked.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
  assert(count<=20000,`Pages has ${count} assets`);
});
