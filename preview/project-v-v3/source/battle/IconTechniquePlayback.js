import {ICON_EXPANSION_ART} from '../../../../shared/icon-expansion-art-v1.mjs';
import {liveExpansionIcon} from '../../../../shared/icon-expansion-v1.mjs';
import {preloadIconExpansionPlayback,playIconExpansionRaster} from './IconExpansionPlayback.js';
import {Assets,Container,Graphics,Text} from 'pixi.js';
import {BattleCharacter,TEAM} from './BattleCharacter.js';

// Presentation consumes authoritative events only. No targeting, combat timers,
// HP calculations, proc rolls, or card assignments are performed here.
export const ICON_TECHNIQUE_VISUALS=Object.freeze({
 CROWN_USURP:{name:'왕관 찬탈',color:0xe9c270,motif:'CROWN_TRANSFER'},
 FORMATION_EDIT:{name:'전열 편집',color:0x66e7d1,motif:'CROSSING_STATIONS'},
 WOUND_DEFER:{name:'상처 유예',color:0xff897c,motif:'DEBT_ORBIT'},
 SKILL_ADVANCE:{name:'선불 출격',color:0x70cfff,motif:'BORROWED_CLOCK'},
 PURSUIT_BAN:{name:'추적 금지',color:0xff6b91,motif:'BROKEN_RETICLE'},
 SKILL_CENSOR:{name:'기술 검열',color:0xc29bff,motif:'SCAN_REDACTION'},
 AUTONOMOUS_WEAPON:{name:'자율 병기',color:0x8bd7ff,motif:'INDEPENDENT_TURRET'},
 RETURN_OATH:{name:'귀환 서약',color:0xc7f6c4,motif:'LIFE_TETHER'}
});
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const colorFor=event=>ICON_TECHNIQUE_VISUALS[event.techniqueCode]?.color||0x8bd7ff;
const phaseLabel={TRACK:'재지정 차단',CAST:'전개',APPLY:'적용',SWAP:'진형 교환',EXPIRE:'해제',DEFER:'피해 유예',REPAY:'부채 상환',ADVANCE:'선불 사용',CENSOR:'부가효과 검열',PROGRESS:'구출 진행',REVIVE:'귀환 완료',FAIL:'서약 종료'};
const center=(engine,actor,up=.52)=>engine.effectLayer.toLocal(actor.root.toGlobal({x:0,y:-actor.fullBodyHeight*up}));
function metrics(engine){return engine.iconTechniqueMetrics||(engine.iconTechniqueMetrics={events:0,applied:0,codes:[],phases:[],summons:0,summonAttacks:0,swaps:0,revivals:0,missingActors:[],history:[]});}
function record(engine,event,extra={}){const m=metrics(engine),code=event.techniqueCode||'AUTONOMOUS_WEAPON';m.events++;m.applied++;if(!m.codes.includes(code))m.codes.push(code);if(event.phase&&!m.phases.includes(event.phase))m.phases.push(event.phase);m.history.push({type:event.type,code,phase:event.phase||'',actorId:event.actorId,targetId:event.targetId,...extra});if(m.history.length>120)m.history.shift();engine.lastIconTechnique={...m.history.at(-1),authority:'SERVER_ONLY',clock:'V3_REGISTERED_GSAP'};}
function sync(engine,row){const actor=engine.combatantById(row.targetId);if(!actor)return;const hp=row.targetHpAfter??row.hpAfter;if(finite(hp))engine.syncTargetHp(actor,engine.eventHpPercent(actor,Number(hp),row.targetMaxHp??row.maxHp));if(finite(row.targetShieldAfter))engine.syncTargetShield(actor,Number(row.targetShieldAfter),row.targetMaxShield);}
function badge(actor,code,text,color){if(!actor)return;actor.iconTechniqueBadges??=new Map();let label=actor.iconTechniqueBadges.get(code);if(!text){label?.destroy();actor.iconTechniqueBadges.delete(code);return;}if(!label){label=new Text({text:'',style:{fontFamily:'Pretendard,Arial,sans-serif',fontSize:17,fontWeight:'800',fill:color,stroke:{color:0x071018,width:5}}});label.anchor.set(.5);actor.root.addChild(label);actor.iconTechniqueBadges.set(code,label);}label.text=text;label.y=20+Array.from(actor.iconTechniqueBadges.keys()).indexOf(code)*22;}
function circle(g,x,y,r,color,alpha=1,width=2){g.circle(x,y,r).stroke({color,width,alpha});}
function arrow(g,a,b,color,alpha=1){g.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color,width:3,alpha});const t=Math.atan2(b.y-a.y,b.x-a.x);g.moveTo(b.x-13*Math.cos(t-.55),b.y-13*Math.sin(t-.55)).lineTo(b.x,b.y).lineTo(b.x-13*Math.cos(t+.55),b.y-13*Math.sin(t+.55)).stroke({color,width:3,alpha});}
function crown(g,x,y,r,c,a){g.poly([x-r,y-r*.25,x-r*.7,y-r*.95,x-r*.25,y-r*.4,x,y-r*1.2,x+r*.25,y-r*.4,x+r*.7,y-r*.95,x+r,y-r*.25,x+r*.7,y+r*.2,x-r*.7,y+r*.2]).fill({color:0x32291c,alpha:a*.8}).stroke({color:c,width:3,alpha:a});g.moveTo(x-r*.65,y+r*.4).lineTo(x+r*.65,y+r*.4).stroke({color:c,width:3,alpha:a});}
function renderMotif(g,code,p,q,t,c,phase){
 g.clear();const alpha=Math.sin(Math.PI*Math.min(1,t))*.9,r=34+Math.sin(t*Math.PI)*15;
 if(code==='CROWN_USURP'){
  const x=q.x+(p.x-q.x)*t,y=q.y+(p.y-q.y)*t-Math.sin(t*Math.PI)*65;crown(g,x,y,26,c,alpha);
  g.moveTo(q.x,q.y).quadraticCurveTo((p.x+q.x)/2,Math.min(p.y,q.y)-70,p.x,p.y).stroke({color:0xb68dff,width:2,alpha:alpha*.7});
  for(let i=0;i<4;i++)circle(g,x-(p.x-q.x)*i*.035,y-(p.y-q.y)*i*.035,3+i,c,alpha*(1-i*.2));
 }else if(code==='FORMATION_EDIT'){
  const mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};g.moveTo(p.x,p.y).quadraticCurveTo(mid.x,mid.y-65,q.x,q.y).stroke({color:c,width:3,alpha});g.moveTo(q.x,q.y+12).quadraticCurveTo(mid.x,mid.y+65,p.x,p.y+12).stroke({color:0xea94c5,width:3,alpha});
  arrow(g,{x:p.x+(q.x-p.x)*t-16,y:p.y+(q.y-p.y)*t},{x:p.x+(q.x-p.x)*t+16,y:p.y+(q.y-p.y)*t},c,alpha);
  for(const n of [p,q])g.poly([n.x-45,n.y,n.x,n.y-18,n.x+45,n.y,n.x,n.y+18]).stroke({color:c,width:2,alpha});
 }else if(code==='WOUND_DEFER'){
  for(let i=0;i<8;i++){const a=i*Math.PI/4+t*(phase==='REPAY'?-3:2);g.arc(q.x,q.y,r+i%2*7,a,a+.43).stroke({color:c,width:3,alpha});}
  for(let i=0;i<3;i++){const x=q.x+(i-1)*18,y=q.y+(phase==='REPAY'?45-90*t:-35+15*t);g.poly([x-6,y-10,x+6,y-10,x+6,y+9,x,y+5,x-6,y+9]).fill({color:c,alpha:alpha*.65});}
 }else if(code==='SKILL_ADVANCE'){
  circle(g,q.x,q.y,r,c,alpha);for(let i=0;i<12;i++){const a=i*Math.PI/6;g.moveTo(q.x+Math.cos(a)*r*.84,q.y+Math.sin(a)*r*.84).lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r).stroke({color:c,width:2,alpha});}
  const a=-Math.PI/2+t*Math.PI*2;arrow(g,q,{x:q.x+Math.cos(a)*r*.7,y:q.y+Math.sin(a)*r*.7},c,alpha);g.arc(q.x,q.y,r+10,Math.PI/2,Math.PI/2+t*Math.PI).stroke({color:0xe5af70,width:3,alpha});
 }else if(code==='PURSUIT_BAN'){
  for(let i=0;i<4;i++){const a=i*Math.PI/2+t*.5;g.arc(q.x,q.y,r,a+.14,a+1.1).stroke({color:c,width:3,alpha});}g.moveTo(q.x-r*.7,q.y+r*.7).lineTo(q.x+r*.7,q.y-r*.7).stroke({color:c,width:5,alpha});
  for(let i=0;i<5;i++){const x=p.x+(q.x-p.x)*i/6,y=p.y+(q.y-p.y)*i/6;g.moveTo(x,y).lineTo(x+(q.x-p.x)/15,y+(q.y-p.y)/15).stroke({color:c,width:2,alpha:alpha*.5});}
 }else if(code==='SKILL_CENSOR'){
  g.rect(q.x-48,q.y-52,96,104).stroke({color:c,width:2,alpha});for(let i=0;i<3;i++)g.rect(q.x-36,q.y-31+i*25,72,12).fill({color:0x100a1e,alpha:alpha*.9}).stroke({color:c,width:1,alpha});const y=q.y-50+t*100;g.moveTo(q.x-58,y).lineTo(q.x+58,y).stroke({color:0xf1deff,width:4,alpha});
 }else if(code==='RETURN_OATH'){
  const lift=phase==='REVIVE'?1-t:t;g.moveTo(p.x,p.y).quadraticCurveTo((p.x+q.x)/2,Math.min(p.y,q.y)-75,q.x,q.y).stroke({color:c,width:2,alpha});
  for(let i=0;i<3;i++)g.ellipse(q.x,q.y+36-i*26*lift,r*(1-i*.16),9).stroke({color:c,width:2,alpha:alpha*(1-i*.15)});
  g.moveTo(q.x-8,q.y).lineTo(q.x-2,q.y+8).lineTo(q.x+10,q.y-15).stroke({color:0xffffff,width:3,alpha});
 }else{for(let i=0;i<6;i++){const a=i*Math.PI/3;g.moveTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r).lineTo(q.x+Math.cos(a+.9)*r,q.y+Math.sin(a+.9)*r).stroke({color:c,width:3,alpha});}}
}
function weaponDrawing(){const g=new Graphics();g.ellipse(0,-4,65,16).fill({color:0x02080e,alpha:.65});g.poly([-54,-20,-28,-51,28,-51,54,-20,38,-4,-38,-4]).fill(0x1c3541).stroke({color:0x75b8c9,width:3});g.rect(-25,-104,50,64).fill(0x182832).stroke({color:0x5c99af,width:3});g.poly([-43,-119,-27,-137,29,-137,45,-119,31,-76,-29,-76]).fill(0x314957).stroke({color:0xa5daea,width:3});g.rect(-62,-116,98,15).fill(0x101c25).stroke({color:0x7da4ba,width:2});g.rect(-77,-113,26,9).fill(0xb6e5eb);g.circle(8,-109,10).fill(0x7ce8fa);g.circle(8,-109,4).fill(0xe7ffff);for(const x of [-37,-20,20,37])g.moveTo(x,-30).lineTo(x*1.35,-4).stroke({color:0x547f8e,width:5});return g;}
function layoutWeapon(engine,unit){const owner=engine.combatantById(unit.iconWeaponOwner),team=unit.team,a=engine.station?.('cards',0,'ALLY')||{x:170,y:240},b=engine.station?.('cards',0,'ENEMY')||{x:1430,y:240},last=engine.station?.('cards',4,team)||{y:592},ordinal=Math.max(0,Number(unit.iconTechniqueServerSlot||10)-10),row=ordinal%5,column=Math.floor(ordinal/5),middle=(a.x+b.x)/2,side=team===TEAM.ALLY?-1:1,spread=engine.mobile?92:110,spacing=Math.max(80,(last.y-Math.min(a.y,b.y)-45)/4),p={x:middle+side*(spread+column*80),y:Math.min(a.y,b.y)+35+spacing*row};const scale=Math.min(.52,owner?.restScale||.5,spacing/240);unit.setFormation(p.x,p.y,scale);unit.root.depthSortY=p.y;unit.hud.y=-238;unit.setCompactHud?.(engine.mobile);}
export function layoutIconTechniqueWeapons(engine){for(const unit of engine.iconTechniqueWeapons?.values()||[])layoutWeapon(engine,unit);}
function spawn(engine,event){engine.iconTechniqueWeapons??=new Map();if(engine.iconTechniqueWeapons.has(event.targetId)){const unit=engine.iconTechniqueWeapons.get(event.targetId),f=event.fighter||{};unit.serverMaxHp=Number(f.maxHp)||unit.serverMaxHp;unit.battleActive=true;unit.root.visible=unit.root.renderable=true;unit.root.alpha=unit.view.alpha=1;unit.view.visible=unit.view.renderable=true;unit.setHp(Number(f.hp)/Math.max(1,Number(f.maxHp))*100);unit.setShield(Number(f.shield)||0,Number(f.maxShield)||0);unit.setState('IDLE');layoutWeapon(engine,unit);metrics(engine).summons++;return unit;}const f=event.fighter||{},owner=engine.combatantById(event.actorId),art=ICON_EXPANSION_ART[owner?.cardId]?.weapon,graphic=art?null:weaponDrawing(),texture=art?Assets.get(art.url):engine.app.renderer.generateTexture(graphic);graphic?.destroy();if(!texture)throw Error('ICON_WEAPON_ASSET_NOT_READY');const unit=new BattleCharacter({id:event.targetId,name:'자율 병기',team:(event.side||f.side)==='B'?TEAM.ENEMY:TEAM.ALLY,fullBodyTexture:texture,fullBodyHeight:art?480:170,accent:0x8bd7ff,hp:finite(f.hp)&&finite(f.maxHp)?f.hp/f.maxHp*100:100});unit.iconWeapon=true;unit.iconWeaponOwner=event.ownerId||event.actorId;unit.iconWeaponTexture=art?null:texture;if(art){unit.fullBodySprite.anchor.set(art.anchor.x,art.anchor.y);unit.captureNeutralAvatarPose();unit.iconExpansionWeapon=true;}unit.serverMaxHp=Number(f.maxHp)||1;unit.cardId='';unit.battleActive=true;unit.root.visible=true;unit.root.alpha=1;unit.hud.scale.set(.78);unit.animationController?.kill();unit.animationAdapter=null;unit.iconTechniqueServerSlot=event.slot;engine.characters.push(unit);engine.combatLayer.addChild(unit.root);engine.iconTechniqueWeapons.set(unit.id,unit);layoutWeapon(engine,unit);metrics(engine).summons++;return unit;}
function endWeapon(engine,event){const unit=engine.iconTechniqueWeapons?.get(event.targetId||event.summonId);if(!unit)return;unit.battleActive=false;unit.setHp(0);unit.root.visible=false;}
export function disposeIconTechniques(engine){if(engine.iconTechniqueOriginalFormation){engine.allies=engine.iconTechniqueOriginalFormation.allies;engine.enemies=engine.iconTechniqueOriginalFormation.enemies;engine.iconTechniqueOriginalFormation=null;}engine.iconTechniqueOaths?.clear();for(const unit of engine.iconTechniqueWeapons?.values()||[]){engine.characters=engine.characters.filter(a=>a!==unit);unit.destroy();unit.iconWeaponTexture?.destroy(true);}engine.iconTechniqueWeapons?.clear();for(const actor of engine.characters||[]){for(const label of actor.iconTechniqueBadges?.values()||[])label.destroy();actor.iconTechniqueBadges?.clear();delete actor.iconTechniqueServerSlot;delete actor.iconTechniqueDisplaySlot;}engine.iconTechniqueMetrics=null;engine.lastIconTechnique=null;engine.iconTechniqueActive=null;}
async function playIconTechniqueCore(engine,event){
 const code=event.techniqueCode||'AUTONOMOUS_WEAPON',spec=ICON_TECHNIQUE_VISUALS[code];if(!spec)return false;
 let actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);
 if(event.type==='ICON_SUMMON')target=spawn(engine,event);
 if(event.type==='ICON_SUMMON_END'){endWeapon(engine,event);record(engine,event);return true;}
 for(const row of [event,...event.targets||[]])sync(engine,row);
 if(event.phase==='REVIVE'&&target){target.battleActive=true;target.root.visible=target.root.renderable=true;target.root.alpha=target.view.alpha=1;target.root.position.set(target.baseX,target.baseY);target.setState('IDLE');metrics(engine).revivals++;}
 const participants=(event.targets||[]).map(row=>({row,actor:engine.combatantById(row.targetId)})).filter(x=>x.actor);
 const movements=[];
 if(code==='FORMATION_EDIT'&&event.phase==='SWAP'){

  for(const {row,actor:a} of participants){const list=a.team===TEAM.ALLY?engine.allies:engine.enemies;const old=list.indexOf(a),slot=Number(row.slot);if(old<0||!Number.isInteger(slot)||slot<0||slot>=5)continue;const p=engine.station?.('cards',slot,a.team);if(!p)continue;movements.push({actor:a,list,old,slot,p,from:{x:a.root.x,y:a.root.y}});a.iconTechniqueServerSlot=slot;}
  for(const move of movements){move.actor.iconTechniqueDisplaySlot=move.slot;move.actor.baseX=move.p.x;move.actor.baseY=move.p.y;move.actor.gridPosition=engine.screenToGrid?.(move.p.x,move.p.y)||move.actor.gridPosition;move.actor.root.depthSortY=move.p.y;}metrics(engine).swaps++;
 }
 if(code==='WOUND_DEFER'){const debtTarget=target||actor;if(['CAST','APPLY'].includes(event.phase))badge(debtTarget,code,'상처 유예',spec.color);if(event.phase==='EXPIRE')badge(debtTarget,code,'',spec.color);if(['DEFER','REPAY'].includes(event.phase)){const debt=event.debtRemaining??event.debtAfter??event.totalDebt; if(finite(debt))badge(debtTarget,code+':DEBT',Number(debt)>0?`부채 ${Number(debt).toLocaleString()}`:'',spec.color);}}
 if(code==='SKILL_ADVANCE')badge(target,code,['EXPIRE','REPAY'].includes(event.phase)?'':'선불 출격',spec.color);
 if(code==='PURSUIT_BAN')badge(target,code,event.phase==='EXPIRE'?'':'추적 금지',spec.color);
 if(code==='SKILL_CENSOR')badge(target,code,['EXPIRE','CENSOR'].includes(event.phase)?'':'부가효과 검열',spec.color);
 if(code==='RETURN_OATH'){engine.iconTechniqueOaths??=new Map();const key=event.sourceId||event.actorId,old=engine.iconTechniqueOaths.get(key)||{},ids={goalId:event.goalTargetId||old.goalId||event.targetId,returnId:event.returnTargetId||old.returnId};if(['EXPIRE','FAIL','REVIVE'].includes(event.phase)){for(const id of [old.goalId,old.returnId,ids.goalId,ids.returnId,event.targetId])badge(engine.combatantById(id),code,'',spec.color);engine.iconTechniqueOaths.delete(key);}else{engine.iconTechniqueOaths.set(key,ids);badge(engine.combatantById(ids.goalId)||target,code,event.phase==='PROGRESS'?`구출 ${event.progress??event.progressAfter??''}`:'구출 목표',spec.color);badge(engine.combatantById(ids.returnId),code,'귀환 대기',spec.color);}}
 const origin=actor||target;if(!origin){metrics(engine).missingActors.push(event.actorId||event.targetId);record(engine,event);return true;}
 target=target||participants[0]?.actor||origin;const other=participants[1]?.actor;
 const p=center(engine,code==='FORMATION_EDIT'?target:origin,code==='FORMATION_EDIT'?0:.52),q=center(engine,other||target,code==='FORMATION_EDIT'?0:.52);
 const layer=new Container({label:'ICON_TECHNIQUE:'+code}),g=new Graphics(),motifScale=engine.mobile?1.8:1.4;g.scale.set(motifScale);layer.addChild(g);engine.effectLayer.addChild(layer);
 engine.queueBanner(`${spec.name} · ${phaseLabel[event.phase]||'전개'}`,spec.color,liveExpansionIcon(actor?.cardId)?'ICON 전용 기술':'ICON 기술 준비');
 const cursor={t:0},duration=event.phase==='CAST'?.36:['EXPIRE','FAIL'].includes(event.phase)?.25:.72,epoch=engine.playbackEpoch;
 const valid=()=>engine.visible&&!engine.disposed&&epoch===engine.playbackEpoch;
 engine.iconTechniqueActive={code,phase:event.phase||event.type,progress:0};
 const done=await engine.timeline(t=>{t.to(cursor,{t:1,duration,ease:'none',onUpdate(){if(!layer.destroyed){renderMotif(g,code,{x:p.x/motifScale,y:p.y/motifScale},{x:q.x/motifScale,y:q.y/motifScale},cursor.t,spec.color,event.phase);if(engine.iconTechniqueActive?.code===code)engine.iconTechniqueActive.progress=cursor.t;}}},0);for(const m of movements)t.to(m.actor.root,{x:m.p.x,y:m.p.y,duration:.55,ease:'power2.inOut'},0);},()=>{layer.destroy({children:true});for(const m of movements)if(!m.actor.root.destroyed){m.actor.root.position.set(m.p.x,m.p.y);m.actor.setState(m.actor.hp>0?'IDLE':'DEAD');}engine.drawIsometricFloor?.();},null,{releaseAt:duration,owners:[origin,target,...participants.map(p=>p.actor)]});
 engine.iconTechniqueActive=null;record(engine,event,{motif:spec.motif,moved:movements.map(m=>({id:m.actor.id,slot:m.slot,x:m.p.x,y:m.p.y}))});return done&&valid();
}
async function playIconWeaponAttackCore(engine,event){const actor=engine.combatantById(event.actorId),target=engine.combatantById(event.targetId);if(!actor?.iconWeapon||!target)return false;const p=center(engine,actor,.68),q=center(engine,target),layer=new Container({label:'ICON_WEAPON_SHOT'}),g=new Graphics();layer.addChild(g);engine.effectLayer.addChild(layer);const cursor={t:0};let applied=false;const done=await engine.timeline(t=>{t.to(cursor,{t:1,duration:.42,onUpdate(){g.clear();const a=Math.sin(cursor.t*Math.PI);g.moveTo(p.x,p.y).lineTo(q.x,q.y).stroke({color:0x90e9ff,width:2+3*a,alpha:a});circle(g,q.x,q.y,8+cursor.t*25,0xd5fbff,a);}},0);t.call(()=>{sync(engine,event);applied=true;},[],.16);},()=>layer.destroy({children:true}),null,{releaseAt:.42,owners:[actor,target]});if(applied)metrics(engine).summonAttacks++;return done;}

export async function playIconTechnique(engine,event){
 const actor=engine.combatantById(event.actorId);
 if(!liveExpansionIcon(actor?.cardId))return playIconTechniqueCore(engine,event);
 await preloadIconExpansionPlayback(engine);
 const results=await Promise.all([playIconTechniqueCore(engine,event),playIconExpansionRaster(engine,event)]);return results[0];
}
export async function playIconWeaponAttack(engine,event){
 const actor=engine.combatantById(event.actorId),owner=engine.combatantById(actor?.iconWeaponOwner);
 if(!liveExpansionIcon(owner?.cardId))return playIconWeaponAttackCore(engine,event);
 const results=await Promise.all([playIconWeaponAttackCore(engine,event),playIconExpansionRaster(engine,event)]);return results[0];
}
