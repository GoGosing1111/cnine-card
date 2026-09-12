import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {MERCENARY_SKILLS} from '../shared/mercenary-skills-v1.mjs';
import {compileRehearsal} from '../preview/project-v-mercenary-system-v1/skill-rehearsal.mjs';
import {mercenaryAudioEvents,MercenarySkillAudio} from '../preview/project-v-mercenary-system-v1/source/MercenarySkillAudio.js';
import {attachMercenaryArt,attachmentProfile,mercenaryAttachment} from '../preview/project-v-mercenary-system-v1/source/MercenaryAttachmentPoints.js';
import {BattleCharacter} from '../preview/project-v-v3/source/battle/BattleCharacter.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const roster=JSON.parse(read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'));
const audio=JSON.parse(read('preview/project-v-mercenary-system-v1/skill-audio-v1.json'));

test('all 43 immutable SDs have hash-bound attachment points and opposing team mirrors',()=>{
 for(const row of roster.cards){
  const profile=attachmentProfile(row);assert.ok(profile,row.code);
  assert.equal(createHash('sha256').update(read(row.battleSprite)).digest('hex'),profile.battleSpriteSha256.toLowerCase());
  assert.equal(attachmentProfile({...row,battleSpriteSha256:'0'.repeat(64)}),null);
  const stage=new Container(),layer=new Container();stage.addChild(layer);
  const positions=[];
  for(const team of ['ALLY','ENEMY']){
   const root=new Container(),view=new Container(),sprite=new Sprite(new Texture({source:new TextureSource({width:1000,height:1500})}));
   root.position.set(500,700);root.scale.set(.65);sprite.anchor.set(.5,.98);sprite.height=260;sprite.width=260/1.5;root.addChild(view);view.addChild(sprite);stage.addChild(root);
   const actor={root,view,fullBodySprite:sprite,team,applyFacing:BattleCharacter.prototype.applyFacing};attachMercenaryArt(actor,row);
   const tip=mercenaryAttachment(actor,'weapon',layer),contact=mercenaryAttachment(actor,'contact',layer);positions.push(tip);
   if(['GUN','BOW'].includes(profile.weaponKind))assert.ok((tip.x-contact.x)*(team==='ALLY'?1:-1)>0,`${row.code}: gun points toward opposing formation`);
   root.destroy({children:true});
  }
  assert.ok(Math.abs(positions[0].x+positions[1].x-1000)<.001);assert.equal(positions[0].y,positions[1].y);stage.destroy({children:true});
 }
});
test('17 profiles use preserved recordings and align their measured principal peaks at every impact',()=>{
 assert.equal(audio.proceduralSynthesis,false);assert.equal(audio.runtimeEnabled,false);assert.equal(Object.keys(audio.profiles).length,17);
 for(const row of Object.values(audio.assets)){assert.equal(createHash('sha256').update(read(row.url.slice(1))).digest('hex'),row.sha256);assert.ok(row.licenseUrl&&row.sources&&row.peakAmplitude>0);}
 for(const skill of MERCENARY_SKILLS){const events=mercenaryAudioEvents(skill,compileRehearsal(skill.id));
  for(const layer of ['NOTICE','IMPACT','TAIL'])assert.ok(events.some(e=>e.layer===layer),skill.id+layer);
  for(const e of events){assert.ok(e.offset>=0&&e.duration>0&&e.offset+e.duration<=audio.assets[e.asset].duration+.001);if(e.impact!==undefined)for(const rate of [.5,1,2,8])assert.ok(Math.abs((e.at+audio.assets[e.asset].peak-e.offset-e.impact)/rate*1000)<.01);}
 }
});
test('cancelled rehearsal cannot schedule a hit, and a server second beat does not replay its first beat',()=>{
 const skill=MERCENARY_SKILLS.find(s=>s.id==='MS-043');
 const events=mercenaryAudioEvents(skill,{authoritative:true,duration:2.7,events:[{at:1.55,phaseIndex:1}]});
 assert.deepEqual(events.filter(e=>e.impact!==undefined).map(e=>e.impact),[1.55]);
 const cancelled=mercenaryAudioEvents(MERCENARY_SKILLS.find(s=>s.id==='MS-004'),compileRehearsal('MS-004','counter'));
 assert.ok(!cancelled.some(e=>e.impact!==undefined));assert.throws(()=>new MercenarySkillAudio(null),/SHARED_CONTEXT/);
});
