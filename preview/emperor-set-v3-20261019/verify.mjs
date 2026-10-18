import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {emperorSetEligible,PREVIEW_LOADOUT} from './set-policy.mjs';
const copy=()=>structuredClone(PREVIEW_LOADOUT);
assert.equal(emperorSetEligible(copy()),true,'four equipped +10 Emperor parts');
assert.equal(emperorSetEligible(copy().map(i=>({...i,level:15}))),true,'higher enhancements qualify');
assert.equal(emperorSetEligible(copy().slice(0,3)),false,'missing accessory fails');
for(let slot=0;slot<4;slot++){
 for(const change of [{level:9},{equipped:false},{code:'ARDEN_PART'}]){
  const parts=copy();Object.assign(parts[slot],change);assert.equal(emperorSetEligible(parts),false,'all four parts are required');
 }
}
assert.equal(emperorSetEligible([]),false,'no equipment fails');
const dir=new URL('./',import.meta.url),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assets=[];
for(const name of ['crest','ground','impact','impact-sequence']){
 const file=new URL('assets/'+name+'.png',dir),bytes=fs.readFileSync(file),m=await sharp(bytes).metadata(),s=await sharp(bytes).stats();
 assert.equal(m.hasAlpha,true,name+' transparency');assert.equal(s.channels[3].min,0,name+' clear margins');
 if(name==='impact-sequence'){assert.equal(m.width/4,m.height/3);assert.equal(m.width%4,0);}
 assets.push({path:'assets/'+name+'.png',sha256:hash(bytes),bytes:bytes.length,width:m.width,height:m.height,alpha:true});
}
const fixture=JSON.parse(fs.readFileSync(new URL('fixture.json',dir)));
assert(fixture.cards.every(c=>c.id.startsWith('CN-')),'real catalog IDs');
assert.equal(fixture.equippedBattleSuit,null);assert.equal(fixture.equippedWeapon,null);
const lock=JSON.parse(fs.readFileSync(new URL('../../package-lock.json',dir)));
const manifest={name:'엠퍼러 +10 · 황제의 위광',version:1,date:'2026-10-19',status:'USER_VISUAL_REVIEW_PENDING',liveConnected:false,sourceArtwork:'ImageGen; originals copied byte-for-byte',assets,
 sourceReference:{path:'assets/items/emperor-suit-v1.png',sha256:hash(fs.readFileSync(new URL('../../assets/items/emperor-suit-v1.png',dir)))},
 runtime:{path:'preview/project-v-v3/project-v-pixi-battle.bundle.js',sha256:hash(fs.readFileSync(new URL('../project-v-v3/project-v-pixi-battle.bundle.js',dir))),pixi:lock.packages['node_modules/pixi.js'].version,gsap:lock.packages['node_modules/gsap'].version,rendererCount:1,timeOwner:'BattleEngine.timeline / GSAP'},
 eligibility:PREVIEW_LOADOUT,owner:'A; account formation only; no account avatar',damageChanges:false,
 layers:{ground:'combatLayer z=-5000; desktop formation seal / portrait formation tiles',crest:'combatLayer z=-4990; behind ally formation',impact:'effectLayer z=7; confirmed ally normalAttack onImpact'},
 impactAtlas:{source:'assets/impact-sequence.png',columns:4,rows:3,frames:12,cell:[362,362],durationSeconds:.7,order:'row-major',pivots:[[.5,.59],[.5,.59],[.5,.59],[.5,.59],[.5,.53],[.5,.53],[.5,.53],[.5,.53],[.5,.5],[.5,.5],[.5,.5],[.5,.5]],timeOwner:'same GSAP time as ambient layer'},
 fixture:{path:'fixture.json',sha256:hash(fs.readFileSync(new URL('fixture.json',dir))),generator:'build-fixture.mjs',seed:20261019,events:fixture.battleV2.result.timeline.length},
 prompts:'prompts.json',verification:{scope:'equipment eligibility, asset alpha/provenance, existing fixture identities',passed:true,liveAccountReads:0,liveAccountWrites:0}};
fs.writeFileSync(new URL('manifest.json',dir),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({passed:true,policyCases:16,assets:assets.length,atlasFrames:12,pixi:manifest.runtime.pixi,gsap:manifest.runtime.gsap}));
