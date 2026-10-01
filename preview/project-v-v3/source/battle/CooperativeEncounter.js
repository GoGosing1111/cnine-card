import {Assets} from 'pixi.js';
import {CHARACTER_STATE} from './BattleCharacter.js';

// The same V3 hostile slots are rebound to exact server instance IDs. Retired
// waves never take part in snapshot restoration or receive a delayed hit.
export function bindCooperativeEnemy(engine,row){
 const actor=engine.enemies[row.slot];if(!actor)throw Error('INVALID_COOP_ENEMY_SLOT');
 engine.settlePendingTails([actor]);actor.animationAdapter?.kill?.();
 actor.view.position.set(0,0);actor.view.rotation=0;actor.view.alpha=1;
 actor.fullBodySprite.position.set(0,0);actor.fullBodySprite.rotation=0;actor.fullBodySprite.alpha=1;
 Object.assign(actor,{id:row.id,cardId:row.cardId,name:row.title||row.name,serverMaxHp:row.maxHp,
  serverMaxShield:row.maxShield||row.shield||0,startingShield:row.shield||0,startingMaxShield:row.maxShield||row.shield||0,
  isBoss:!!row.isBoss,coopFinalBoss:!!row.finalBoss,combatRole:'ATTACK',attackStyle:row.attackStyle,artFacing:-1,battleActive:true});
 actor.texture=Assets.get(row.battleSprite);if(!actor.texture)throw Error('COOP_ENEMY_TEXTURE_NOT_READY');
 actor.cutInTexture=actor.texture;actor.useFullBodySprite(actor.texture,row.displayHeight||260);actor.applyFacing();
 actor.fullBodySprite.anchor.set(.5,row.projectVMonsterArt?.footAnchor?.y||.9);actor.captureNeutralAvatarPose();
 actor.nameLabel.text=actor.name;actor.formationHudY=-(actor.fullBodyHeight*.98+88);actor.hud.y=actor.formationHudY;
 actor.root.visible=true;actor.root.renderable=true;actor.root.alpha=1;actor.root.rotation=0;
 actor.root.position.set(actor.baseX,actor.baseY);actor.root.scale.set(actor.restScale);actor.setTint(0xffffff);
 actor.setState(CHARACTER_STATE.IDLE);actor.setHp(100);actor.setShield(row.shield||0,actor.serverMaxShield);
 actor.root.projectVMonsterArt=row.projectVMonsterArt;
 return actor;
}
export function cooperativeSnapshot(engine,rows=[]){
 const instances=engine.cooperativeInstances,wave=Math.max(1,...rows.map(r=>instances.get(r.id)?.encounterWave||1));
 const current=rows.filter(r=>instances.get(r.id)?.encounterWave===wave);
 for(const row of current){const spec=instances.get(row.id);if(engine.enemies[spec.slot].id!==row.id)bindCooperativeEnemy(engine,spec);}
 return current;
}
export function spawnCooperativeEnemy(engine,event){
 const row=engine.cooperativeInstances?.get(event.targetId);if(!row)return false;
 for(const actor of engine.enemies){actor.battleActive=false;actor.root.visible=false;actor.root.renderable=false;}
 const actor=bindCooperativeEnemy(engine,row);engine.currentEnemyTarget=actor;engine.boss=actor;
 engine.queueBanner(row.title||row.name,0xffbf72,`${row.encounterWave} / 3 단계`);
 return true;
}
