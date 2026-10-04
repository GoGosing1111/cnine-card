import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Container,Sprite,Texture,TextureSource} from 'pixi.js';
import {LIMITED_VISUALS,limitedBattleArt,limitedEmission} from '../shared/mercenary-limited-visuals-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
test('final approved assets are hash-identical in live storage and six codex SDs',()=>{
 const approval=JSON.parse(fs.readFileSync('preview/mercenary-limited-sd-skills-20261003-v1/final-approval-20261004.json'));
 assert.equal(approval.userApproval,'최종승인');assert.equal(approval.userDeploymentInstruction,'라이브에 반영해');
 for(const f of approval.files){assert.equal(hash(f.source),f.sha256);assert.equal(hash(f.path),f.sha256);}
 assert.equal(createHash('sha256').update(fs.readFileSync(approval.visualManifest.path,'utf8').replace(/\r\n/g,'\n')).digest('hex').toUpperCase(),approval.visualManifest.sha256);
 const ready=LIMITED_MERCENARIES.filter(c=>c.battleSprite);assert.equal(ready.length,6);
 for(const c of ready){assert.equal(hash(c.battleSprite),c.battleSpriteSha256);assert.equal(c.visualApproval,'USER_APPROVED_20261004');assert.equal(c.acquisitionEnabled,false);assert.equal(c.deploymentEnabled,false);assert.deepEqual(c.skills,[]);}
 assert.equal(limitedBattleArt('V-997'),null,'Ayoon artwork is not a battle sprite');
});
test('six actual sprite transforms share original Valter body height; emission stays ahead on both teams',()=>{
 assert.equal(LIMITED_VISUALS.reference.textureHeight,358);
 for(const c of LIMITED_VISUALS.characters){
  const art=limitedBattleArt(c.code),scale=art.fullBodyHeight/c.spriteHeight;
  assert.ok(Math.abs(c.bodyHeight*scale-312.3894230769231)<1e-6);
  const stage=new Container(),layer=new Container();stage.addChild(layer);const pair=[];
  for(const facing of [1,-1]){
   const root=new Container(),view=new Container(),sprite=new Sprite(new Texture({source:new TextureSource({width:c.spriteWidth,height:c.spriteHeight})}));
   stage.addChild(root);root.addChild(view);view.addChild(sprite);root.position.set(500,400);root.scale.set(.65);view.scale.x=facing;
   sprite.anchor.set(art.footAnchor.x,art.footAnchor.y);sprite.scale.set(scale);
   const pose=limitedEmission({cardId:c.code,fullBodySprite:sprite},layer);
   if(pose){assert.ok((pose.origin.x-pose.emission.x)*facing>0);assert.ok(Math.abs((pose.origin.x-pose.emission.x)*pose.direction.y-(pose.origin.y-pose.emission.y)*pose.direction.x)<1e-6);pair.push(pose);}
  }
  if(pair.length){assert.ok(Math.abs(pair[0].origin.x+pair[1].origin.x-1000)<1e-6);assert.equal(pair[0].origin.y,pair[1].origin.y);}
  stage.destroy({children:true});
 }
 assert.equal(limitedBattleArt('V-055'),null,'Berkan is not a limited Valter alias');
});
test('main loader and every rebuilt consumer contain approved visual runtime',()=>{
 const read=p=>fs.readFileSync(p,'utf8');
 const report=JSON.parse(read('preview/project-v-v3/grid-build-report.json'));
 for(const row of report.outputs){const source=read(row.file);assert.ok(source.includes('ApprovedLimitedRearAura'),row.file);assert.equal(createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),row.sha256);}
 assert.match(read('js/app.js'),/battle-v3-live\.js\?limitedVisuals=20261004-approved/);
 assert.match(read('js/battle-v3-live.js'),/20261004-limited-approved-visuals-v1/);
 assert.match(read('preview/project-v-v3/source/battle/MercenaryCombatPlayback.js'),/limitedBattleArt\(card.code\|\|card.cardId\)/);
});
