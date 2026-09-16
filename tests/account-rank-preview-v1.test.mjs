import test from 'node:test';
import assert from 'node:assert/strict';
import {RANKS,POLICY,rankForLevel,draftEffects} from '../preview/account-rank-v1/model.mjs';
import {GROWTH_POLICY,XP_SOURCES,estimateGrowth,totalXpForLevel,levelFromXp,nextLevelXp} from '../scripts/internal/account-rank-growth-v1.mjs';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
test('every level 1–250 belongs to exactly one rank with no gaps or overlaps',()=>{
  for(let l=1;l<=250;l++){const rows=RANKS.filter(r=>r.min<=l&&r.max>=l);assert.equal(rows.length,1,`level ${l}`);assert.equal(rankForLevel(l),rows[0]);}
  assert.equal(rankForLevel(1).name,'훈련병');assert.equal(rankForLevel(250).name,'원수');assert.equal(POLICY.startLevel,1);assert.equal(GROWTH_POLICY.retroactiveXp,false);
});
test('every XP boundary changes level once; max level has no next requirement',()=>{
  for(let l=2;l<=250;l++){const xp=totalXpForLevel(l);assert.equal(levelFromXp(xp-1),l-1);assert.equal(levelFromXp(xp),l);assert.equal(xp-totalXpForLevel(l-1),nextLevelXp(l-1));}
  assert.equal(totalXpForLevel(250),139440);assert.equal(levelFromXp(1e9),250);assert.equal(levelFromXp(-1),1);assert.equal(nextLevelXp(250),0);
});
test('PvP and scored/unknown contexts never receive draft effects',()=>{
  for(let l=1;l<=250;l++)for(const mode of ['PVP','CLAN','TERRITORY','WORLD_RAID','RANKED_PVE',undefined,'NEW_MODE'])assert.deepEqual(draftEffects(l,mode),{attackBp:0,hpBp:0,coinBp:0});
  assert.deepEqual(draftEffects(250,'PERSONAL_PVE_UNRANKED'),{attackBp:1000,hpBp:1500,coinBp:500});
});
test('draft benefits are bounded and monotonic; all 21 ranks have distinct art',()=>{
  assert.equal(RANKS.filter(r=>r.art).length,21);assert.equal(new Set(RANKS.map(r=>r.art)).size,21);
  for(let i=1;i<RANKS.length;i++){assert.ok(RANKS[i].attackBp>=RANKS[i-1].attackBp);assert.ok(RANKS[i].hpBp>=RANKS[i-1].hpBp);assert.ok(RANKS[i].coinBp>=RANKS[i-1].coinBp);assert.ok(RANKS[i].presetSlots<=5);}
});
test('all listed PvE sources grant XP without a new daily or per-source cap',()=>{
  assert.equal(GROWTH_POLICY.dailyXpCap,null);assert.equal(GROWTH_POLICY.xpScope,'ALL_PVE');
  for(const source of XP_SOURCES){assert.ok(estimateGrowth({[source.code]:1}).dailyXp>0);assert.equal(estimateGrowth({[source.code]:100}).dailyXp,source.xp*100);}
  assert.equal(estimateGrowth({IDLE:0.5}).dailyXp,3);
});
test('reduced payouts update duration while seal and siege retain their contribution',()=>{
  const regular=Object.fromEntries(XP_SOURCES.map(s=>[s.code,s.example]));
  assert.deepEqual(estimateGrowth(regular),{dailyXp:280,days:498});
  assert.equal(GROWTH_POLICY.referenceDailyXp,280);
  const double=Object.fromEntries(XP_SOURCES.map(s=>[s.code,s.example*2]));
  assert.deepEqual(estimateGrowth(double),{dailyXp:560,days:249});
  assert.deepEqual(estimateGrowth({...regular,SIEGE:9,SEAL:9}),{dailyXp:2800,days:50});
  assert.deepEqual(estimateGrowth({}),{dailyXp:0,days:null});
});

test('all 21 rank PNGs are present, transparent, and match their provenance hashes',async()=>{
  const base=new URL('../preview/account-rank-v1/assets/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
  assert.equal(manifest.readyArtCount,21);assert.equal(manifest.files.length,21);
  for(const rank of RANKS){
    const bytes=await readFile(new URL(rank.art,base)),entry=manifest.files.find(f=>f.file===rank.art);
    assert.ok(entry,rank.code);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
    const meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
    assert.ok(meta.width>=1024);assert.equal(meta.width,meta.height);assert.equal(meta.hasAlpha,true);
    assert.equal(stats.channels[3].min,0);assert.equal(stats.channels[3].max,255);
  }
});
test('public client has no growth-method UI, source payouts, or growth formula imports',async()=>{
  for(const file of ['index.html','app.mjs','model.mjs']){
    const src=await readFile(new URL('../preview/account-rank-v1/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(src,/growth-tab|growth-view|xp-sources|estimateGrowth|XP_SOURCES|totalXpForLevel|nextLevelXp|referenceDailyXp|targetDays|scripts\/internal|성장 방식|예상 성장|139.?440|498일/,file);
  }
});
test('preview server exposes UI and art but denies internal XP policy and authoring files',async t=>{
  const child=spawn(process.execPath,['preview/account-rank-v1/serve.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,RANK_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  const base=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('preview server startup timeout')),8000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited: ${code}`));});
  });
  for(const file of ['/preview/account-rank-v1/','/preview/account-rank-v1/model.mjs','/preview/account-rank-v1/assets/marshal-v1.png'])assert.equal((await fetch(base+file)).status,200,file);
  for(const file of ['/scripts/internal/account-rank-growth-v1.mjs','/docs/account-level-rank-proposal-20260916.md','/preview/account-rank-v1/README.md','/preview/account-rank-v1/serve.mjs','/preview/account-rank-v1/assets/prompts.json'])assert.equal((await fetch(base+file)).status,404,file);
});
