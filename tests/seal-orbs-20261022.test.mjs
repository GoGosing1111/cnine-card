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
