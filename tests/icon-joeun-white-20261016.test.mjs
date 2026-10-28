import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
const base=new URL('../preview/icon-joeun-white-battle-20261016-v1/',import.meta.url);
const read=file=>fs.readFile(new URL(file,base)),json=async file=>JSON.parse(await read(file));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex').toUpperCase();
test('new white Oh Joeun preserves her photo and is separate from the existing medic',async()=>{
 const manifest=await json('manifest.json'),input=await json('input.json'),card=ICON_EXPANSION_CARDS.find(c=>c.code==='ICON-OH-JOEUN-WHITE');
 assert.equal(hash(await read(manifest.sourceArt.file)),'9DA6986B613413B8F7C2F8F3798B47AE785A6569D29E0F2CD0CBD97109695C08');
 assert.equal(card.cardId,'CN-1C000012');assert.equal(card.techniqueCode,'SKILL_ADVANCE');assert.equal(card.releaseEnabled,true);
 assert.equal(ICON_LIVE_CARDS.find(c=>c.code==='ICON-OH-JOEUN').cardId,'CN-1C000004');
 assert.equal(ICON_LIVE_CARDS.length,13);assert.equal(manifest.acquisitionEnabled,false);assert.equal(manifest.battleEnabled,false);
 assert.equal(input.techniqueAssignment,'USER_CONFIRMED_PREPARATION_ONLY');
 assert.deepEqual(card.tuning,{firstAction:1,cooldownActions:3,maxCasts:6});
 assert.equal(hash(await read(manifest.sourceArt.runtime)),manifest.sourceArt.runtimeSha256);
 assert.ok((await read(manifest.sourceArt.runtime)).length<(await read(manifest.sourceArt.file)).length/10);
});
test('transparent SD and sixteen independent generated FX cells are preserved in the runtime atlas',async()=>{
 const manifest=await json('manifest.json');
 assert.equal(hash(await read(manifest.character.source)),manifest.character.sourceSha256);
 assert.equal(hash(await read(manifest.character.runtime)),manifest.character.runtimeSha256);
 assert.equal(hash(await read(manifest.effect.source)),manifest.effect.sourceSha256);
 assert.equal(hash(await read(manifest.effect.runtime)),manifest.effect.runtimeSha256);
 const sd=await sharp(await read(manifest.character.runtime)).metadata();assert.deepEqual([sd.width,sd.height,sd.hasAlpha],[768,768,true]);
 assert.ok(manifest.character.runtimeAlpha.edgeMax<=12);assert.ok(manifest.character.runtimeAlpha.transparentFraction>.2);
 assert.equal(new Set(manifest.effect.frames.map(f=>f.rawSha256)).size,16);
 for(const frame of manifest.effect.frames){
  const {width,height}=frame.sourceRect,left=frame.index%4*384+Math.floor((384-width)/2),top=Math.floor(frame.index/4)*384+Math.floor((384-height)/2);
  const raw=await sharp(await read(manifest.effect.runtime)).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();
  const source=await sharp(await read(manifest.effect.source)).extract(frame.sourceRect).ensureAlpha().raw().toBuffer();assert.equal(hash(source),frame.rawSha256);
  // Lossless WebP can normalize hidden RGB; alpha and every visible sample stay exact.
  for(let i=0;i<raw.length;i+=4){assert.equal(raw[i+3],source[i+3]);if(source[i+3])for(let c=0;c<3;c++)assert.equal(raw[i+c],source[i+c]);}assert.ok(frame.edgeMax<=12);
 }
});
test('PVP and PVE use real server advance and repayment events while retaining a preview-only identity',async()=>{
 const fixtures=await json('fixtures.json');
 for(const mode of ['PVP','PVE']){
  const f=fixtures[mode],events=f.battleV2.result.timeline,advance=events.filter(e=>e.techniqueCode==='SKILL_ADVANCE'&&e.phase==='ADVANCE'),repay=events.filter(e=>e.techniqueCode==='SKILL_ADVANCE'&&e.phase==='REPAY');
  assert.equal(f.review.authority,'REAL_SERVER_SYMBOL_SIMULATION');assert.equal(f.review.productionActivation,false);
  assert.equal(advance.length,f.review.advances);assert.equal(repay.length,f.review.repayments);assert.ok(repay.length>0);
  assert.equal(advance[0].borrowed,3);assert.equal(advance[0].previousNextAction,4);assert.equal(advance[0].nextAction,1);
  const loans=new Set();for(const event of events){if(event.techniqueCode!=='SKILL_ADVANCE')continue;if(event.phase==='ADVANCE'){assert.ok(!loans.has(event.targetId),'cannot borrow again before repayment');loans.add(event.targetId);}if(event.phase==='REPAY'){assert.ok(loans.has(event.targetId),'cannot repay twice');loans.delete(event.targetId);}}
  const caster=f.battleV2.teams.A.cards.find(c=>c.id===f.review.casterId);assert.equal(caster.cardId,'PREVIEW:OH-JOEUN-WHITE');assert.ok(caster.projectVBattleArt.primaryUrl.endsWith('/assets/joeun-sd.webp'));
 }
});
