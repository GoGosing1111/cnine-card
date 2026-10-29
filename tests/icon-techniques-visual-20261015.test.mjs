import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ICON_EXPANSION_ART} from '../shared/icon-expansion-art-v1.mjs';
import {duoStation,latticeStation} from '../preview/project-v-v3/source/battle/FormationLayout.mjs';
const raw=fs.readFileSync(new URL('../preview/project-v-v3/source/battle/IconTechniquePlayback.js',import.meta.url),'utf8');
function runtime(){
 class Display{constructor(options={}){Object.assign(this,options);this.children=[];this.x=this.y=0;this.alpha=1;this.visible=this.renderable=true;this.position={set:(x,y)=>{this.x=x;this.y=y}};this.scale={set:()=>{}};this.anchor={set:()=>{}};}addChild(child){this.children.push(child);return child;}toGlobal(p){return{x:this.x+p.x,y:this.y+p.y};}toLocal(p){return p;}destroy(){this.destroyed=true;}}
 class Graphics extends Display{}for(const key of ['clear','circle','ellipse','poly','rect','arc','moveTo','lineTo','quadraticCurveTo','fill','stroke'])Graphics.prototype[key]=function(){return this};
 class Actor{constructor({id,team='ALLY',hp=100,fullBodyHeight=200}){Object.assign(this,{id,team,hp,fullBodyHeight,name:id,baseX:0,baseY:0,restScale:.5,battleActive:true});this.root=new Display();this.view=new Display();this.hud=new Display();this.fullBodySprite=new Display();this.root.addChild(this.view);this.state='IDLE';}setFormation(x,y,scale=this.restScale){this.baseX=x;this.baseY=y;this.restScale=scale;this.root.position.set(x,y)}captureNeutralAvatarPose(){}setHp(v){this.hp=v;this.state=v>0?'IDLE':'DEAD';}setShield(v){this.shield=v}setState(v){this.state=v}destroy(){this.root.destroy()}}
 const sandbox={Container:Display,Graphics,Text:Display,BattleCharacter:Actor,TEAM:{ALLY:'ALLY',ENEMY:'ENEMY'},ICON_EXPANSION_ART,Assets:{get:()=>({})},liveExpansionIcon:()=>false,console};
 vm.runInNewContext(raw.replace(/^import .*;\r?\n/gm,'').replaceAll('export ', '')+'\nglobalThis.qa={playIconTechnique,disposeIconTechniques,layoutIconTechniqueWeapons};',sandbox);
 const a=new Actor({id:'A:0:a'}),b=new Actor({id:'A:2:b'}),x=new Actor({id:'B:0:x',team:'ENEMY'}),y=new Actor({id:'B:2:y',team:'ENEMY'});
 const engine={visible:true,playbackEpoch:1,characters:[a,b,x,y],allies:[a,b],enemies:[x,y],effectLayer:new Display(),combatLayer:new Display(),app:{renderer:{generateTexture:()=>({destroy(){this.destroyed=true}})}},combatantById(id){return this.characters.find(a=>a.id===id)},syncTargetHp(a,hp){a.setHp(hp)},eventHpPercent(a,hp,max){return hp/max*100},syncTargetShield(a,s){a.setShield(s)},queueBanner(){},drawIsometricFloor(){},station:(kind,index,team)=>({x:(team==='ALLY'?0:700)+index*50,y:200+index*80}),screenToGrid:(x,y)=>({x,y}),async timeline(build,cleanup){const callbacks=[],api={to:(target,value)=>{Object.assign(target,Object.fromEntries(Object.entries(value).filter(([k])=>!['duration','ease','onUpdate'].includes(k))));value.onUpdate?.();return api;},call:fn=>{callbacks.push(fn);return api;}};build(api);callbacks.forEach(fn=>fn());cleanup();return true;}};
 const event=(code,phase,more={})=>({type:'ICON_TECHNIQUE',techniqueCode:code,phase,actorId:a.id,sourceId:a.id,targetId:b.id,...more});return{...sandbox.qa,engine,a,b,x,y,event};
}
test('server slot swaps affect real actor positions without corrupting compact roster order; next session clears overrides',async()=>{const r=runtime(),before=r.engine.enemies.slice();await r.playIconTechnique(r.engine,r.event('FORMATION_EDIT','SWAP',{targets:[{targetId:r.x.id,previousSlot:0,slot:2},{targetId:r.y.id,previousSlot:2,slot:0}]}));assert.deepEqual(r.engine.enemies,before);assert.equal(r.x.iconTechniqueDisplaySlot,2);assert.equal(r.x.baseX,r.engine.station('cards',2,'ENEMY').x);assert.equal(r.y.iconTechniqueDisplaySlot,0);r.disposeIconTechniques(r.engine);assert.equal(r.x.iconTechniqueDisplaySlot,undefined);});
test('expired wound protection retains unpaid debt until authoritative repayment reaches zero',async()=>{const r=runtime();for(const [phase,data] of [['APPLY',{}],['DEFER',{debtRemaining:900}],['EXPIRE',{}]])await r.playIconTechnique(r.engine,r.event('WOUND_DEFER',phase,data));assert.equal(r.b.iconTechniqueBadges.has('WOUND_DEFER'),false);assert.equal(r.b.iconTechniqueBadges.get('WOUND_DEFER:DEBT').text,'부채 900');await r.playIconTechnique(r.engine,r.event('WOUND_DEFER','REPAY',{amount:900,debtRemaining:0,targetHpAfter:3000,targetMaxHp:12000}));assert.equal(r.b.hp,25);assert.equal(r.b.iconTechniqueBadges.has('WOUND_DEFER:DEBT'),false);});
test('return oath clears both goal and fallen-ally marks and restores the authoritative HP and visibility',async()=>{const r=runtime();r.b.hp=0;r.b.root.visible=r.b.root.renderable=false;await r.playIconTechnique(r.engine,r.event('RETURN_OATH','APPLY',{targetId:r.x.id,goalTargetId:r.x.id,returnTargetId:r.b.id}));assert.equal(r.x.iconTechniqueBadges.has('RETURN_OATH'),true);await r.playIconTechnique(r.engine,r.event('RETURN_OATH','REVIVE',{goalTargetId:r.x.id,returnTargetId:r.b.id,targetHpAfter:2400,targetMaxHp:12000,targetShieldAfter:0}));assert.equal(r.x.iconTechniqueBadges.has('RETURN_OATH'),false);assert.equal(r.b.iconTechniqueBadges.has('RETURN_OATH'),false);assert.equal(r.b.hp,20);assert.equal(r.b.root.visible,true);assert.equal(r.b.root.renderable,true);});
test('same-ID weapon can be destroyed then authoritatively summoned again and is fully removed on cleanup',async()=>{const r=runtime(),event={type:'ICON_SUMMON',actorId:r.a.id,targetId:r.a.id+':ICON_WEAPON',side:'A',slot:10,fighter:{hp:200,maxHp:200}};await r.playIconTechnique(r.engine,event);const first=r.engine.combatantById(event.targetId);await r.playIconTechnique(r.engine,{type:'ICON_SUMMON_END',targetId:event.targetId});assert.equal(first.root.visible,false);await r.playIconTechnique(r.engine,{...event,fighter:{hp:100,maxHp:400}});assert.equal(r.engine.combatantById(event.targetId),first);assert.equal(first.hp,25);assert.equal(first.serverMaxHp,400);assert.equal(first.battleActive,true);assert.equal(first.root.visible,true);r.disposeIconTechniques(r.engine);assert.equal(r.engine.combatantById(event.targetId),undefined);assert.equal(first.root.destroyed,true);assert.equal(first.iconWeaponTexture.destroyed,true);});

const summon=async(r,owner,slot=10)=>{owner.cardId='CN-1C000011';await r.playIconTechnique(r.engine,{type:'ICON_SUMMON',actorId:owner.id,ownerId:owner.id,targetId:owner.id+':ICON_WEAPON',side:owner.team==='ALLY'?'A':'B',slot,fighter:{hp:200,maxHp:200}});return r.engine.combatantById(owner.id+':ICON_WEAPON');};
function assertInFront(unit,owner){const forward=owner.team==='ALLY'?1:-1,dx=(unit.baseX-owner.baseX)*forward,dy=unit.baseY-owner.baseY;assert.ok(dx>0&&dx<owner.restScale*200,'weapon stays within one SD width in front of its owner');assert.ok(dy>0&&dy<owner.restScale*80,'weapon is slightly below the owner and draws in front');assert.equal(unit.root.depthSortY,unit.baseY);}
test('authored weapon follows each summoner in every normal formation slot on desktop and mobile, mirrored for enemies',async()=>{
 for(const profile of ['desktop','compact'])for(const team of ['ALLY','ENEMY'])for(let slot=0;slot<5;slot++){
  const r=runtime(),owner=team==='ALLY'?r.a:r.x,p=latticeStation('cards',slot,team,profile);r.engine.mobile=profile==='compact';owner.setFormation(p.x,p.y,r.engine.mobile?.65:.5);
  // A transient attack lunge must not change the weapon's resting station.
  owner.root.position.set(900,900);const unit=await summon(r,owner,14);assertInFront(unit,owner);assert.equal(unit.iconExpansionWeapon,true);
 }
});
test('duo weapons stay by their respective owners and relayout with the mobile formation',async()=>{
 const r=runtime(),owners=[r.a,r.b,r.x,r.y],units=[];
 for(const [i,owner] of owners.entries()){const p=duoStation('cards',i%2?7:0,owner.team,false);owner.setFormation(p.x,p.y,.5);units.push(await summon(r,owner,10+i));assertInFront(units[i],owner);}
 const before=units.map(u=>[u.baseX,u.baseY]);r.engine.mobile=true;
 for(const [i,owner] of owners.entries()){const p=duoStation('cards',i%2?7:0,owner.team,true);owner.setFormation(p.x,p.y,.64);}
 r.layoutIconTechniqueWeapons(r.engine);
 for(const [i,unit] of units.entries()){assertInFront(unit,owners[i]);assert.notDeepEqual([unit.baseX,unit.baseY],before[i]);}
 assert.ok(Math.abs(units[0].baseY-units[1].baseY)>500);assert.equal(r.engine.allies.length,2);assert.equal(r.engine.enemies.length,2);
});
test('formation swaps and same-ID resummons keep the weapon in front of the new owner station',async()=>{
 const r=runtime();r.x.setFormation(700,200,.5);const unit=await summon(r,r.x);
 await r.playIconTechnique(r.engine,r.event('FORMATION_EDIT','SWAP',{targets:[{targetId:r.x.id,previousSlot:0,slot:2}]}));assertInFront(unit,r.x);
 await r.playIconTechnique(r.engine,{type:'ICON_SUMMON_END',targetId:unit.id});r.x.setFormation(850,500,.65);assert.equal(await summon(r,r.x),unit);assertInFront(unit,r.x);assert.equal(unit.root.visible,true);
});
