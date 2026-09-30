import {BattleEngine as LiveBattleEngine} from '../../project-v-v3/source/battle/BattleEngine.js';
import {SKILL_CHIP_CLOCK} from '../../../shared/battle-suit-skill-chips.mjs';

const finite=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n));
// An optional event adapter over the exact live V3 renderer. The server owns
// every outcome and formation slot; no card art is repurposed as a battle sprite.
export const withMagicSeason2Playback=Base=>class extends Base{
 async applyBattlePayload(payload){this.s2Slots=new Map();this.s2Statuses=new Map();return super.applyBattlePayload(payload);}
 station(kind,index=0,team='ALLY'){
  const actor=(team==='ALLY'?this.allies:this.enemies)?.[index];
  return super.station(kind,kind==='cards'?(this.s2Slots?.get(actor?.id)??index):index,team);
 }
 async playEvents(events=[],options={}){
  if(!options.timedInternal&&events.some(e=>e.combatClock===SKILL_CHIP_CLOCK)||!events.some(e=>e.type==='MAGIC_SEASON2'))return super.playEvents(events,options);
  for(const event of events){
   if(!this.visible)return false;
   if(event.type==='MAGIC_SEASON2')await this.playMagicSeason2Event(event);
   else await super.playEvents([event],options);
  }
  return true;
 }
 async playMagicSeason2Event(event){
  const target=this.combatantById(event.targetId),actor=this.combatantById(event.actorId);
  const rows=[{targetId:event.targetId,hpAfter:event.targetHpAfter,shieldAfter:event.targetShieldAfter,gaugeAfter:event.gaugeAfter},...(event.targets||[])];
  const damage=Number(event.damage||0)+Number(event.absorbed||0);
  if(damage>0&&target){
   await super.playEvents([{...event,type:'MAGIC_CARD'}],{timedInternal:true});
  }
  // All snapshots are applied immediately, in event order, including the
  // protector of INTERCEPT and every FALLEN_STAR recipient.
  for(const row of rows){const unit=this.combatantById(row.targetId);if(!unit)continue;
   if(finite(row.hpAfter))this.syncTargetHp(unit,this.eventHpPercent(unit,row.hpAfter));
   if(finite(row.shieldAfter))this.syncTargetShield(unit,row.shieldAfter);
   if(finite(row.gaugeAfter))unit.s2ServerGauge=Number(row.gaugeAfter);
   if(finite(row.attackAfter))unit.s2ServerAttack=Number(row.attackAfter);
  }
  if(actor&&finite(event.actorShieldAfter))this.syncTargetShield(actor,event.actorShieldAfter);
  if(event.phase==='STATUS'){
   const key=`${event.targetId}:${event.statusKind}`;
   if(event.remaining>0)this.s2Statuses.set(key,{...event});else this.s2Statuses.delete(key);
  }
  if(event.phase==='FORMATION_SWAP'){
   const units=(event.targets||[]).map(row=>({row,unit:this.combatantById(row.targetId)})).filter(x=>x.unit);
   const previous=units.map(({unit})=>({unit,x:unit.root.x,y:unit.root.y}));
   for(const {row,unit}of units){this.s2Slots.set(unit.id,row.slot);unit.s2ServerRow=row.row;
    const shell=this.host.closest('.battle-v3-live-shell');
    for(const node of shell?.querySelectorAll('[data-v3-roster-card]')||[]){
     if(node.dataset.v3RosterCard===unit.id){const label=node.querySelector('.battle-v3-roster-row');if(label)label.textContent=row.row==='FRONT'?'전열':'후열';}
    }
   }
   this.layoutCharacterGrid();
   const destinations=previous.map(({unit,x,y})=>({unit,x,y,nextX:unit.baseX,nextY:unit.baseY}));
   await this.timeline(timeline=>{
    for(const {unit,x,y,nextX,nextY}of destinations)timeline.fromTo(unit.root,{x,y},{x:nextX,y:nextY,duration:.35,ease:'power2.inOut'},0);
   },()=>{for(const {unit,nextX,nextY}of destinations)unit.root.position.set(nextX,nextY);this.sortCombatDepth();});
  }
  const quiet=event.phase==='LEDGER_RECORD'||event.phase==='STATUS'&&event.remaining<=0;
  if(!damage&&!quiet){
   const support=rows.map(r=>this.combatantById(r.targetId)).filter(Boolean);
   if(['OVERHEAL','INTERCEPT'].includes(event.phase))this.queueSupportEffect(support,{kind:'DEFENSE'});
   if(['FALLEN_STAR','FORMATION_SWAP'].includes(event.phase))this.queueSupportEffect(support,{kind:'SPEED'});
   this.queueBanner(event.magicName,0xe4c687,event.phase==='SKILL_BLOCK'?'스킬 봉쇄 · 평타 허용':'시즌2 마법 발동');
  }
  this.host.dispatchEvent(new CustomEvent('magic-season2-event',{detail:event,bubbles:true}));
  return true;
 }
 diagnostics(){return {...super.diagnostics(),magicSeason2:{slots:Object.fromEntries(this.s2Slots||[]),statuses:[...(this.s2Statuses?.values()||[])]}};}
};
export class BattleEngine extends withMagicSeason2Playback(LiveBattleEngine){}
