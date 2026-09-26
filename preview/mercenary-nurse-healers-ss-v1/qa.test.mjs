import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import crypto from 'node:crypto';
import {NURSE_SKILL,sampleNurseSkill} from './skill.mjs';
import {createMercenaryBattleArtAdapter} from '../../js/project-v-mercenary-battle-art-adapter-v1.js';
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',import.meta.url),'utf8'));
const userSources=JSON.parse(await fs.readFile(new URL('user-sources.json',import.meta.url),'utf8'));
const project=new URL('../../',import.meta.url),hash=b=>crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
test('four user-assigned SS healers reference exactly one shared skill with approved live balance',()=>{
 assert.equal(manifest.cards.length,4);assert.equal(new Set(manifest.cards.map(c=>c.code)).size,4);assert.equal(manifest.runtimeEnabled,true);assert.equal(manifest.liveCatalogChanged,true);
 for(const c of manifest.cards){assert.equal(c.rank,'SS');assert.equal(c.role,'HEALER');assert.equal(c.rankStatus,'USER_ASSIGNED_RANK');assert.deepEqual(c.skillIds,[NURSE_SKILL.id]);assert.equal(c.runtimeEnabled,true);assert.equal(c.sourceArtStatus,'USER_SUPPLIED_SOURCE_ART');assert.equal(c.nameStatus,'USER_ASSIGNED_NAME');}
 assert.equal(manifest.skill.healCoefficient,3.2);assert.equal(manifest.skill.cooldown,4);assert.deepEqual(manifest.skill.assignment.cards,manifest.cards.map(c=>c.code));
});
test('native RGB portraits, real transparent SD and consumer separation are preserved',async()=>{
 const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:4,battleSpritePending:0},cards:manifest.cards});
 for(const c of manifest.cards){
  const art=await fs.readFile(new URL(c.sourceArt,project)),sd=await fs.readFile(new URL(c.battleSprite,project)),a=await sharp(art).metadata(),s=await sharp(sd).metadata();
  const supplied=userSources.find(source=>source.id===c.id);
  assert.equal(c.name,supplied.name);assert.equal(c.sourceArt,supplied.sourceArt);assert.equal(hash(art),supplied.sha256);
  assert.equal(hash(art),c.sourceArtSha256);assert.equal(hash(sd),c.battleSpriteSha256);assert.equal(a.width*3,a.height*2);assert.ok(a.width>=1024);assert.equal(a.channels,3);assert.ok(s.hasAlpha);
  assert.ok(c.battleSpriteInfo.clear>.4);assert.ok(c.battleSpriteInfo.solid>.2);assert.ok(c.battleSpriteInfo.edgeMax<=5);assert.ok(c.battleSpriteFootAnchor.x>.25&&c.battleSpriteFootAnchor.x<.75);
  assert.ok(adapter.resolveForConsumer('BATTLE_FIELD',c.code));for(const consumer of ['CATALOG','CARD_DOCK','SKILL_CUTIN'])assert.equal(adapter.resolveForConsumer(consumer,c.code),null);
 }
});
test('sixteen unique authored frames and atlas retain every visible pixel and alpha value',async()=>{
 const skill=manifest.skill,atlas=await fs.readFile(new URL(skill.atlas,project));assert.equal(hash(atlas),skill.atlasSha256);assert.equal(skill.frames.length,16);
 assert.equal(new Set(skill.frames.map(f=>f.rawSha256)).size,16);
 for(const f of skill.frames){
  const bytes=await fs.readFile(new URL(f.file,project));assert.equal(hash(bytes),f.sha256);assert.ok(f.edgeMax<=5);
  const raw=await sharp(bytes).raw().toBuffer(),tile=await sharp(atlas).extract({left:f.rect.x,top:f.rect.y,width:f.rect.width,height:f.rect.height}).raw().toBuffer();
  assert.equal(hash(raw),f.rawSha256);
  // Lossless WebP may discard RGB under alpha zero; it must preserve all visible RGB and alpha.
  for(let i=0;i<raw.length;i+=4){if(raw[i+3]===0)raw.fill(0,i,i+3);if(tile[i+3]===0)tile.fill(0,i,i+3);}
  assert.equal(hash(tile),hash(raw));
 }
});
test('contact frame, forward/reverse seeking and visual completion use deterministic shared timing',()=>{
 assert.equal(sampleNurseSkill(NURSE_SKILL.contactAt).index,NURSE_SKILL.contactFrame);
 const times=Array.from({length:261},(_,i)=>i/100),samples=times.map(sampleNurseSkill);for(const t of [...times].reverse())assert.deepEqual(sampleNurseSkill(t),samples[times.indexOf(t)]);
 for(const time of [-1,0,2.4,2.6,999,NaN])assert.equal(sampleNurseSkill(time).visible,false);
 assert.ok(samples.filter(s=>s.visible).every(s=>s.index>=0&&s.next<16&&s.alpha>=0&&s.alpha<=1));
});
