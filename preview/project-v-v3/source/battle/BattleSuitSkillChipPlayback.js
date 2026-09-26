import {gsap} from 'gsap';
import {SKILL_CHIP_CLOCK} from '../../../../shared/battle-suit-skill-chips.mjs';
import {battleSuitCombatSkillByCode as skillChipByCode} from '../../../../shared/z-body-area-skill.mjs';
import {SkillChipFX} from '../../../battle-suit-skill-chip-v1/source/SkillChipFX.js';
import {AUDIO_FILES} from '../../../battle-suit-skill-chip-v1/source/SkillChipAudio.js';
import {OctaSeekerFX} from '../../../battle-suit-octaseeker-v1/source/OctaSeekerFX.js';
import {OctaSeekerAudio} from '../../../battle-suit-octaseeker-v1/source/OctaSeekerAudio.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
export const isSkillChipTimeline=events=>events.some(event=>event.combatClock===SKILL_CHIP_CLOCK);
const deadline=(promise,ms,fallback)=>{
  let timer;
  return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]).finally(()=>clearTimeout(timer));
};

// One pausable game clock owns all chips. Ordinary V3 animations remain on the
// existing engine; no timer computes damage, invents casts, or changes a roster.
export class BattleSuitSkillChipPlayback{
  constructor(engine,events,{beforeEvent=null,afterEvent=null,sequential=false,isPaused=()=>false}={}){
    this.engine=engine;this.events=events;this.beforeEvent=beforeEvent;this.afterEvent=afterEvent;this.sequential=sequential;this.clock={time:0};this.holds=0;this.revision=0;
    this.epoch=engine.playbackEpoch;this.active=true;this.fx=new Map();this.pending=new Set();this.isPaused=isPaused;
    this.castHits=new Map();this.finishedEvents=new Set();this.notifyIndex=0;this.suppressedCasts=0;
    for(const event of events)if(event.type==='SKILL_CHIP_HIT'){
      const key=event.castId||event.chipCode,rows=this.castHits.get(key)||[];rows.push(event);this.castHits.set(key,rows);
    }
    this.snapshots=new Map();this.index=0;this.casts=0;this.hits=0;this.pauses=0;this.rate=1;
    this.groups=[];let lastAt=0;
    for(const event of events){
      const external=event.combatClock!==SKILL_CHIP_CLOCK;
      const key=event.combatGroup,previous=this.groups.at(-1);
      if(!external)lastAt=Number(event.combatAtMs)||0;
      // A raid may insert QTE between members of one atomic server action.
      // Contiguous grouping preserves that order; a global Map would move it.
      if(!external&&previous&&!previous.external&&previous.key===key)previous.events.push(event);
      else this.groups.push({key,at:lastAt,external,blocking:external||Number(event.combatGroupDurationMs)>0,events:[event]});
    }
    // One area contact is one visual collision. The server writes each target
    // as HIT + KO; serializing those groups made twelve deaths take twelve
    // separate fade/drain cycles and left later blades waiting on that queue.
    const groups=[];
    for(const group of this.groups){
      const hit=group.events.find(event=>event.type==='SKILL_CHIP_HIT');
      const areaImpact=!group.external&&!group.blocking&&skillChipByCode(hit?.chipCode)?.targeting==='ALL_LIVING_ENEMIES'&&
        group.events.every(event=>event.type==='SKILL_CHIP_HIT'||event.type==='KO');
      const previous=groups.at(-1);
      group.areaImpact=Boolean(areaImpact);
      group.impactKey=areaImpact?`${hit.castId||hit.chipCode}:${Number(hit.hitIndex)||0}`:null;
      if(areaImpact&&previous?.areaImpact&&previous.at===group.at&&previous.impactKey===group.impactKey)previous.events.push(...group.events);
      else groups.push(group);
    }
    this.groups=groups;
    this.endMs=Math.max(1,...events.map(event=>Number(event.combatAtMs)||0),...events.filter(event=>event.type==='SKILL_CHIP_CAST').map(event=>(Number(event.combatAtMs)||0)+(skillChipByCode(event.chipCode)?.effectDurationMs||0)));
    this.audio=new OctaSeekerAudio({sharedContext:globalThis.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT||null,files:AUDIO_FILES});
  }
  valid(){return this.active&&this.engine.visible&&this.engine.playbackEpoch===this.epoch;}
  play(){
    this.done=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
    this.ready=this.start();return this.done;
  }
  async start(){
    try{
      // Load once before starting the battle clock. Optional sound failures do
      // not discard server events; there is no synthetic replacement sound.
      const hasCasts=this.events.some(event=>event.type==='SKILL_CHIP_CAST');
      const hasOcta=this.events.some(event=>event.type==='SKILL_CHIP_CAST'&&skillChipByCode(event.chipCode)?.effectKey==='octaseeker');
      const hasLegacy=this.events.some(event=>event.type==='SKILL_CHIP_CAST'&&!skillChipByCode(event.chipCode)?.intrinsic&&skillChipByCode(event.chipCode)?.effectKey!=='octaseeker');
      const sound=hasCasts&&this.events.some(event=>event.type==='SKILL_CHIP_CAST'&&!skillChipByCode(event.chipCode)?.silent)&&this.engine.audio?.enabled?.()!==false;
      const [,audioReady]=await Promise.all([
        hasLegacy?SkillChipFX.preload().then(textures=>{
          if(this.valid())this.textures=textures;
          else textures.frames.forEach(frame=>frame.destroy(false));
        }):null,
        sound?deadline(this.audio.unlock().catch(()=>false),2500,false):false,
        hasOcta?OctaSeekerFX.preload().then(textures=>{
          if(this.valid())this.octaTextures=textures;
          else [...textures.flight,...textures.impact].forEach(frame=>frame.destroy(false));
        }):null
      ]);
      if(!this.valid()){this.cancel();return;}
      this.audio.setEnabled(Boolean(audioReady&&sound));
      this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.pump()});
      // A dependency can delay dispatch, never the aging of an existing blast.
      // One GSAP clock drives flight, confirmed collisions and particle expiry.
      // Completion below owns its lifetime, including the final smoke tail.
      this.timeline.to(this.clock,{time:86400,duration:86400,ease:'none'});
      // Sample the final actor transforms immediately before Pixi renders.
      // This also keeps a paused blast grounded while a card finishes moving.
      this.renderTick=()=>{this.syncPause();this.render();};this.engine.app?.ticker?.add(this.renderTick,null,-10);
      this.pump();
      if(this.valid()&&!this.holds&&!this.userPaused)this.timeline.play();
    }catch(error){this.fail(error);}
  }
  remember(event){
    const revision=Number.isFinite(event.seq)?event.seq:++this.revision;
    const record=(id,row)=>{
      const target=this.engine.combatantById(id);if(!target)return;
      const state=this.snapshots.get(target)||{};
      const hp=row.targetHpAfter??row.hpAfter??row.targetHp??row.bossHp;
      const shield=row.targetShieldAfter??row.shieldAfter;
      if(finite(hp)&&revision>=(state.hpRevision??-1)){state.hp=this.engine.eventHpPercent(target,Number(hp));state.hpRevision=revision;}
      if(finite(shield)&&revision>=(state.shieldRevision??-1)){state.shield=Number(shield);state.shieldRevision=revision;}
      this.snapshots.set(target,state);
    };
    record(event.targetId,event);
    for(const row of [...(event.hits||[]),...(event.targets||[])])record(row.targetId,row);
    if(finite(event.actorShieldAfter))record(event.actorId,{shieldAfter:event.actorShieldAfter});
    if(event.type==='KO')record(event.targetId,{hpAfter:0});
  }
  currentHp(target,fallback){return this.active?(this.snapshots.get(target)?.hp??fallback):fallback;}
  currentShield(target,fallback){return this.active?(this.snapshots.get(target)?.shield??fallback):fallback;}
  cast(event){
    const chip=skillChipByCode(event.chipCode);if(!chip)return;
    this.casts++;
    const castId=event.castId||chip.code,targetIds=event.targetIds||[event.targetId];
    const hits=(this.castHits.get(castId)||[]).filter(hit=>targetIds.includes(hit.targetId));
    const target=targetIds.map(id=>this.engine.combatantById(id)).find(t=>t?.root?.visible&&t.battleActive!==false&&targetIds.includes(t.id));
    // The server omits impacts when this target died during anticipation. Do
    // not launch a cosmetic missile into that empty slot or a replacement mob.
    if((!hits.length&&!chip.intrinsic)||!target?.root?.visible||!targetIds.includes(target.id)||target.battleActive===false){this.suppressedCasts++;return;}
    const factory=this.engine.battleSuitSkillEffectFactories?.get(chip.code);
    if(chip.intrinsic&&!factory)throw Error('Missing approved intrinsic battle-suit effect: '+chip.code);
    const fx=factory?factory.create(this.engine,event,hits):chip.effectKey==='octaseeker'?new OctaSeekerFX(this.engine,this.octaTextures,()=>{},{serverDriven:true}):new SkillChipFX(this.engine,this.textures);
    fx.shake=false;fx.target=target;
    fx.select?.(chip.effectKey);fx.bindTarget?.(event.targetId,event,hits);fx.timeline?.pause();
    const at=Math.max(Number(event.combatAtMs)/1000||0,this.clock.time);
    // Intrinsic casts reserve the suit body immediately and share this clock.
    // Normal receipts during that pose use its active lightning, not a second
    // sword animation waiting behind the body lock.
    const started=Boolean(fx.cosmeticOnly)||(!this.sequential&&!fx.deferUntilImpact);
    this.fx.set(castId,{fx,chip,at,castId,castAtMs:event.combatAtMs,started,targetId:target.id,targetIds,impacts:new Map(),scheduledImpacts:new Map()});
    if(started&&!chip.silent)this.audio.schedule(chip.effectKey,0,this.rate,{append:true,phase:'launch'});
  }
  hit(event){
    const target=this.engine.combatantById(event.targetId);if(!target)return;
    const entry=this.fx.get(event.castId||event.chipCode);
    if(entry&&entry.targetIds.includes(target.id)&&target.root.visible){
      const index=Number(event.hitIndex)||0,age=this.clock.time-entry.at;
      entry.fx.confirmImpact(index,age,event);entry.impacts.set(index,age);
    }
    const hp=this.engine.eventHpPercent(target,event.targetHpAfter);
    if(finite(hp))this.engine.syncTargetHp(target,hp);
    if(finite(event.targetShieldAfter))this.engine.syncTargetShield(target,event.targetShieldAfter);
    this.engine.showAccountBattleUnitDamage(target,{damage:Number(event.damage||0)+Number(event.absorbed||0),critical:Boolean(event.critical),playbackRate:this.rate});
    this.engine.updateStatus(`${skillChipByCode(event.chipCode)?.name||'스킬칩'} · ${Math.round(Number(event.damage||0)+Number(event.absorbed||0)).toLocaleString()}`);
    this.hits++;
  }
  resyncAudio(){
    this.audio.stop();this.audio.syncRecords=[];
    if(!this.valid()||this.holds||this.userPaused)return;
    for(const {fx,at,chip,scheduledImpacts,started} of this.fx.values()){
      if(!started)continue;
      const from=this.clock.time-at;
      if(from>=0&&!chip.silent)this.audio.schedule(fx.key,from,this.rate,{append:true,impactTimes:scheduledImpacts,indices:[...scheduledImpacts.keys()]});
    }
  }
  render(){
    for(const [key,{fx,at,chip,impacts,started}] of this.fx){
      const time=started?Math.max(0,this.clock.time-at):0;
      fx.clock.time=time;fx.render(time);
      const lastImpact=Math.max(0,...impacts.values());
      const pendingHit=(this.castHits.get(key)||[]).some(event=>!this.finishedEvents.has(event));
      if(started&&!pendingHit&&time>=Math.max(chip.effectDurationMs/1000,lastImpact+fx.sequence.life,fx.endTime?.()||0)){
        fx.destroy();this.fx.delete(key);
      }
    }
  }
  notify(event){
    this.finishedEvents.add(event);
    while(this.notifyIndex<this.events.length&&this.finishedEvents.has(this.events[this.notifyIndex])){
      const next=this.events[this.notifyIndex++];this.afterEvent?.(next);
    }
  }
  syncPause(){
    const paused=Boolean(this.isPaused());
    if(paused===Boolean(this.userPaused))return;
    this.userPaused=paused;
    if(paused){this.timeline?.pause();this.audio.stop();}
    else if(this.valid()&&!this.holds){this.resyncAudio();this.timeline?.play();this.pump();}
  }
  async prepare(event){
    if(!this.beforeEvent)return event;
    const hold=/^(RAID_|PVE_ULTIMATE$|BOSS_ULTIMATE$)/.test(event.type);
    if(hold){this.holds++;this.timeline?.pause();this.audio.stop();}
    try{return await this.beforeEvent(event);}
    finally{
      if(hold){this.holds--;if(this.valid()&&!this.holds&&!this.userPaused){this.resyncAudio();this.timeline?.play();}}
    }
  }
  pump(){
    this.syncPause();
    if(!this.valid()||this.waiting||this.holds||this.userPaused)return;
    const nextRate=this.engine.combatClockRate??(this.engine.paceScale||1);
    if(nextRate!==this.rate){this.rate=nextRate;this.timeline?.timeScale(this.rate);this.resyncAudio();}
    while(this.index<this.groups.length&&this.groups[this.index].at<=this.clock.time*1000+.001){
      const group=this.groups[this.index];
      const fence=group.external||group.events.some(event=>event.type==='KO');
      const predecessors=[...this.pending];
      const previousRun=this.fence||((group.external||group.blocking)&&predecessors.length?Promise.all(predecessors):null);
      if(previousRun){
        // Keep already launched effects moving while a card returns, a final
        // bullet lands, or the old monster is retired. Only user/QTE pauses
        // stop the clock; event dependencies cannot leave a frozen smoke frame.
        this.waiting=true;this.pauses++;
        const wait=previousRun;
        wait.then(()=>{
          if(!this.valid())return;
          this.waiting=false;if(this.fence===wait)this.fence=null;
          this.pump();
        }).catch(error=>this.fail(error));
        return;
      }
      const lethalChip=group.events.some(event=>event.type==='SKILL_CHIP_HIT'&&finite(event.targetHpAfter)&&Number(event.targetHpAfter)<=0);
      const intrinsicCast=group.events.some(event=>event.type==='SKILL_CHIP_CAST'&&skillChipByCode(event.chipCode)?.intrinsic);
      if((lethalChip||intrinsicCast)&&(this.engine.accountBattleUnitDamageQueue?.length||this.engine.accountBattleUnit?.fireTimeline)){
        this.waiting=true;
        this.engine.waitForAccountBattleUnitDamageQueueDrain(6000).then(drained=>{
          if(!this.valid())return;
          if(!drained)throw Error('스킬 충돌 전 탄착 대기열이 남아 있습니다.');
          this.waiting=false;this.pump();
        }).catch(error=>this.fail(error));
        return;
      }
      // Impact presentation is armed only after its dependencies are ready.
      // Give recorded audio its measured output lead; the same GSAP clock then
      // releases the damage and explosion together, without a second timer.
      const earlyHit=group.events.some(event=>{
        const entry=event.type==='SKILL_CHIP_HIT'&&this.fx.get(event.castId||event.chipCode);
        if(!entry)return false;
        if(!entry.started){
          // Continuous waves can spend time draining bullets or replacing a
          // slot. Launch only once the collision lane is ready: the missile
          // then travels straight into its explosion without disappearing and
          // waiting for a delayed impact. Simultaneous chips share the launch.
          for(const other of this.fx.values())if(!other.started&&other.castAtMs===entry.castAtMs){
            other.started=true;other.at=this.clock.time;
            if(!other.chip.silent)this.audio.schedule(other.chip.effectKey,0,this.rate,{append:true,phase:'launch'});
          }
        }
        const index=Number(event.hitIndex)||0,from=this.clock.time-entry.at;
        if(!entry.scheduledImpacts.has(index)){
          entry.scheduledImpacts.set(index,Math.max(entry.chip.impactOffsetsMs[index]/1000,from+Math.max(entry.fx.impactLeadSeconds?.(index)||0,entry.chip.silent?0:this.audio.presentationLead(this.rate))));
          entry.fx.scheduleImpact?.(index,entry.scheduledImpacts.get(index));
          if(!entry.chip.silent)this.audio.schedule(entry.chip.effectKey,from,this.rate,{append:true,phase:'impact',impactTimes:entry.scheduledImpacts,indices:[index]});
        }
        return from+.001<entry.scheduledImpacts.get(index);
      });
      if(earlyHit)break;
      this.index++;
      const regular=[];
      for(const event of group.events){
        if(event.type==='SKILL_CHIP_CAST'){this.cast(event);this.notify(event);}
        else if(event.type==='SKILL_CHIP_HIT'){this.remember(event);this.hit(event);this.notify(event);}
        else regular.push(event);
      }
      if(regular.length){
        const run=(async()=>{
          if(fence&&predecessors.length)await Promise.all(predecessors);
          const playRegular=async event=>{
            if(!this.valid())return;
            const prepared=await this.prepare(event);
            if(!this.valid())return;
            if(prepared){
              const shot=this.engine.isAccountBattleUnitDamageEvent?.(prepared);
              if(!shot&&finite(prepared.targetHpAfter)&&Number(prepared.targetHpAfter)<=0&&(this.engine.accountBattleUnitDamageQueue?.length||this.engine.accountBattleUnit?.fireTimeline)){
                const drained=await this.engine.waitForAccountBattleUnitDamageQueueDrain(6000);
                if(!this.valid())return;
                if(!drained)throw Error('마지막 타격 전 탄착 대기열이 남아 있습니다.');
              }
              // Queued bullets have not landed yet. Recording their future HP
              // here made the first bullet apply the last bullet's lethal HP,
              // leaving a corpse to receive the rest of the queued attacks.
              if(!shot)this.remember(prepared);
              await this.engine.playEvents([prepared],{timedInternal:true});
            }
            if(this.valid())this.notify(event);
          };
          if(group.areaImpact)await Promise.all(regular.map(playRegular));
          else for(const event of regular)await playRegular(event);
        })();
        this.pending.add(run);if(fence)this.fence=run;
        run.then(()=>{
          this.pending.delete(run);if(this.fence===run)this.fence=null;
          if(this.valid())this.pump();
        },error=>this.fail(error));
      }
      if(this.holds){this.render();return;}
    }
    this.render();
    if(this.index===this.groups.length&&!this.pending.size&&!this.fx.size)void this.finish();
  }
  async finish(){
    if(this.finishing||this.waiting||this.holds||!this.valid())return;
    this.finishing=true;
    this.pump();this.render();
    if(this.index<this.groups.length||this.pending.size||this.fx.size){this.finishing=false;return;}
    try{await Promise.all([...this.pending]);if(this.valid()){this.completed=true;this.dispose();this.resolve(true);}}
    catch(error){this.fail(error);}
  }
  diagnostics(){return {clock:SKILL_CHIP_CLOCK,timeMs:Math.round(this.clock.time*1000),endMs:this.endMs,active:this.active,completed:Boolean(this.completed),casts:this.casts,hits:this.hits,barrierPauses:0,dispatchWaits:this.pauses,suppressedCasts:this.suppressedCasts,activeEffects:this.fx.size,pendingGroups:this.pending.size,effects:[...this.fx.values()].map(({castId,targetId,fx})=>({castId,targetId,...fx.diagnostics()})),audio:this.audio.diagnostics()};}
  dispose(){
    this.active=false;this.timeline?.kill();this.timeline=null;
    if(this.renderTick)this.engine.app?.ticker?.remove(this.renderTick);this.renderTick=null;
    for(const {fx} of this.fx.values())fx.destroy();this.fx.clear();
    this.textures?.frames.forEach(frame=>frame.destroy(false));this.textures=null;
    if(this.octaTextures)[...this.octaTextures.flight,...this.octaTextures.impact].forEach(frame=>frame.destroy(false));this.octaTextures=null;
    void this.audio.destroy();
  }
  cancel(){if(!this.active)return;this.dispose();this.resolve?.(false);}
  fail(error){if(!this.active)return;this.dispose();this.reject?.(error);}
}
