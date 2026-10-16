import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {HALLOWEEN_MERCENARIES} from '../shared/mercenary-halloween-catalog-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {LIMITED_BATTLE_VISUALS} from '../shared/mercenary-limited-visual-catalog-v1.mjs';
import {limitedVisual,limitedBattleArt} from '../shared/mercenary-limited-visuals-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {HARLEQUIN_SKILL,sampleHarlequinSkill} from '../shared/mercenary-harlequin-skill-v1.mjs';
import {halloweenPackDraft,HALLOWEEN_PACK} from '../shared/mercenary-halloween-pack-v1.mjs';
import {playLimitedBasic,playLimitedSkill} from '../preview/project-v-v3/source/battle/LimitedMercenaryPlayback.js';
const dir='assets/ui/project-v/mercenaries/halloween-harlequin-20261017/',manifest=JSON.parse(fs.readFileSync(dir+'manifest.json'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
test('V-980 uses the selected exact SD and Harley art while other Bongsoon and Halloween sources stay intact',()=>{
 const card=HALLOWEEN_MERCENARIES.find(c=>c.code==='V-980');
 assert.equal(hash(manifest.sd.path),'C51F275D8DFB5F2E5ACC5C3299B9B6C60114F862367E4750F33A5F730E08A067');
 assert.equal(hash(card.sourceArt),card.sourceArtSha256);assert.equal(hash(card.battleSprite),card.battleSpriteSha256);
 assert.equal(hash(manifest.retiredSource),manifest.retiredSourceSha256);
 assert.equal(card.visualSkill.id,HARLEQUIN_SKILL.id);assert.equal(card.rank,'SS');assert.equal(card.serverLimit,5);
 for(const c of HALLOWEEN_MERCENARIES.filter(c=>c.code!=='V-980')){assert.ok(c.sourceArt.includes('halloween-approved-20261014/'));assert.equal(hash(c.sourceArt),c.sourceArtSha256);assert.equal(c.battleSprite,null);}
 assert.equal(LIMITED_MERCENARIES.find(c=>c.code==='V-990').sourceArtSha256,'EFC0B6D14A891917D517E8F9850D398165A0F94C11006DD6945BB2D05C627120');
 for(const c of LIMITED_BATTLE_VISUALS.characters)assert.deepEqual(limitedVisual(c.code),c,'existing limited visual '+c.code);
});
test('static SD and sixteen authored FX cells are connected with safe alpha, distinct frames and exact hashes',()=>{
 const v=limitedVisual('V-980'),art=limitedBattleArt('V-980');assert.equal(v.bodyMotion,'STATIC_SD_USER_SELECTED');assert.equal(manifest.bodyMotionRequired,false);
 assert.equal(hash(manifest.effects.source),manifest.effects.sha256);assert.equal(hash(manifest.effects.runtime),manifest.effects.runtimeSha256);
 assert.equal(v.effects.frames.length,16);assert.equal(new Set(v.effects.frames.map(f=>f.rawSha256)).size,16);
 assert.ok(v.effects.frames.every(f=>f.edgeMax<=8&&f.transparentFraction>.2));
 assert.ok(art.footAnchor.x>0&&art.footAnchor.x<1&&art.footAnchor.y>.8&&art.footAnchor.y<1);assert.ok(art.fullBodyHeight>art.bodyHeight);
 assert.equal(sampleHarlequinSkill(0).frame,null);assert.equal(sampleHarlequinSkill(.01).frame,0);assert.equal(sampleHarlequinSkill(.6).frame,4);assert.equal(sampleHarlequinSkill(1.2).frame,8);assert.equal(sampleHarlequinSkill(2.59).frame,15);assert.equal(sampleHarlequinSkill(2.6).frame,null);
 assert.equal(sampleHarlequinSkill(.38,{basic:true}).frame,8);assert.equal(sampleHarlequinSkill(1,{basic:true}).frame,null);
});
test('visual registration does not open the pack, change stock or invent combat stats',()=>{
 const c=HALLOWEEN_MERCENARIES.find(c=>c.code==='V-980'),p=halloweenPackDraft();
 assert.equal(limitedDeploymentSnapshot('V-980'),null);assert.equal(c.deploymentEnabled,false);assert.equal(c.acquisitionEnabled,false);assert.deepEqual(c.skills,[]);assert.equal(c.basePower,null);
 assert.equal(p.mode,'OFF');assert.equal(p.prices.single,null);assert.equal(p.cardRatesPpm['V-980'],null);assert.equal(c.acquisitionPackId,HALLOWEEN_PACK.id);
});
test('V-980 authoritative playback applies one receipt at contact, honors cancel and keeps basic timing separate',async()=>{
 for(const [basic,cancel] of [[false,false],[true,false],[false,true]]){
  const actor={id:'A',cardId:'V-980',hp:100,root:{},animationController:{kill(){}}},target={id:'B',root:{},hp:100};let hits=0;
  const state={spec:limitedVisual('V-980'),sprites:[],ambient:null};
  const engine={visible:true,mercenaryEpoch:1,playbackEpoch:1,limitedStates:new Map([[actor,state]]),isAlive:()=>true,combatantById:id=>id==='A'?actor:target,eventHpPercent:(_t,v)=>v,syncTargetHp:(t,v)=>t.hp=v,showAccountBattleUnitDamage(){hits++;},async timeline(build,cleanup,_speed,options){const calls=[];build({to(_clock,vars){engine.duration=vars.duration;},call(fn,_args,at){calls.push({fn,at});}});engine.contact=calls[0].at;engine.releaseAt=options.releaseAt;if(cancel)engine.playbackEpoch++;for(const c of calls){c.fn();c.fn();}state.stopped=true;cleanup();return !cancel;}};
  const result=await(basic?playLimitedBasic(engine,{attacker:actor,target,damage:37,targetHp:63}):playLimitedSkill(engine,{actorId:'A',targetId:'B',damage:37,targetHpAfter:63}));
  assert.equal(result,!cancel);assert.equal(hits,cancel?0:1);assert.equal(target.hp,cancel?100:63);assert.equal(engine.contact,basic?.38:1.2);assert.equal(engine.duration,basic?1:2.6);
 }
});
