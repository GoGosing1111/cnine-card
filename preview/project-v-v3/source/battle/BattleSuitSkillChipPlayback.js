import {gsap} from 'gsap';
import {SKILL_CHIP_CLOCK,skillChipByCode} from '../../../../shared/battle-suit-skill-chips.mjs';
import {SkillChipFX} from '../../../battle-suit-skill-chip-v1/source/SkillChipFX.js';
import {SkillChipAudio} from '../../../battle-suit-skill-chip-v1/source/SkillChipAudio.js';

const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
export const isSkillChipTimeline=events=>events.some(event=>event.combatClock===SKILL_CHIP_CLOCK);
const deadline=(promise,ms,fallback)=>{
  let timer;
  return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]).finally(()=>clearTimeout(timer));
};

// One pausable game clock owns both chips. Ordinary V3 animations remain on the
// existing engine; no timer computes damage, invents casts, or changes a roster.
export class BattleSuitSkillChipPlayback{
  constructor(engine,events,{beforeEvent=null}={}){
    this.engine=engine;this.events=events;this.beforeEvent=beforeEvent;this.clock={time:0};this.holds=0;this.revision=0;
    this.epoch=engine.playbackEpoch;this.active=true;this.fx=new Map();this.pending=new Set();
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
    this.endMs=Math.max(1,...events.map(event=>Number(event.combatAtMs)||0),...events.filter(event=>event.type==='SKILL_CHIP_CAST').map(event=>(Number(event.combatAtMs)||0)+(skillChipByCode(event.chipCode)?.effectDurationMs||0)));
    this.audio=new SkillChipAudio({sharedContext:globalThis.__CNINE_SHARED_BATTLE_AUDIO_CONTEXT||null});
  }
  valid(){return this.active&&this.engine.visible&&this.engine.playbackEpoch===this.epoch;}
  play(){
    this.done=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
    void this.start();return this.done;
  }
  async start(){
    try{
      // Load once before starting the battle clock. Optional sound failures do
      // not discard server events; there is no synthetic replacement sound.
      const hasCasts=this.events.some(event=>event.type==='SKILL_CHIP_CAST');
      const sound=hasCasts&&this.engine.audio?.enabled?.()!==false;
      const [,audioReady]=await Promise.all([
        hasCasts?SkillChipFX.preload().then(textures=>{
          if(this.valid())this.textures=textures;
          else textures.frames.forEach(frame=>frame.destroy(false));
        }):null,
        sound?deadline(this.audio.unlock().catch(()=>false),2500,false):false
      ]);
      if(!this.valid()){this.cancel();return;}
      this.audio.setEnabled(Boolean(audioReady&&sound));
      this.timeline=gsap.timeline({paused:true,onUpdate:()=>this.pump(),onComplete:()=>this.finish()});
      this.timeline.to(this.clock,{time:this.endMs/1000,duration:this.endMs/1000,ease:'none'});
      // Sample the final actor transforms immediately before Pixi renders.
      // This also keeps a paused blast grounded while a card finishes moving.
      this.renderTick=()=>this.render();this.engine.app?.ticker?.add(this.renderTick,null,-10);
      this.pump();
      if(this.valid()&&!this.waiting&&!this.holds)this.timeline.play();
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
    let entry=this.fx.get(chip.code);
    if(!entry){
      const fx=new SkillChipFX(this.engine,this.textures);fx.shake=false;
      entry={fx,chip,at:0};this.fx.set(chip.code,entry);
    }
    entry.at=event.combatAtMs/1000;
    entry.fx.target=this.engine.combatantById(event.targetId);
    entry.fx.select(chip.effectKey);entry.fx.timeline.pause();
    this.audio.schedule(chip.effectKey,Math.max(0,this.clock.time-entry.at),this.rate,{append:true});
    this.casts++;
  }
  hit(event){
    const target=this.engine.combatantById(event.targetId);if(!target)return;
    const hp=this.engine.eventHpPercent(target,event.targetHpAfter);
    if(finite(hp))this.engine.syncTargetHp(target,hp);
    if(finite(event.targetShieldAfter))this.engine.syncTargetShield(target,event.targetShieldAfter);
    this.engine.showAccountBattleUnitDamage(target,{damage:Number(event.damage||0)+Number(event.absorbed||0),critical:Boolean(event.critical),playbackRate:this.rate});
    this.engine.updateStatus(`${skillChipByCode(event.chipCode)?.name||'스킬칩'} · ${Math.round(Number(event.damage||0)+Number(event.absorbed||0)).toLocaleString()}`);
    this.hits++;
  }
  resyncAudio(){
    this.audio.stop();this.audio.syncRecords=[];
    if(!this.valid()||this.waiting||this.holds)return;
    for(const {fx,at,chip} of this.fx.values()){
      const from=this.clock.time-at;
      if(from>=0&&from<chip.effectDurationMs/1000)this.audio.schedule(fx.key,from,this.rate,{append:true});
    }
  }
  render(){
    for(const {fx,at,chip} of this.fx.values()){
      const time=Math.max(0,Math.min(chip.effectDurationMs/1000,this.clock.time-at));
      fx.clock.time=time;fx.render(time);
    }
  }
  async prepare(event){
    if(!this.beforeEvent)return event;
    const hold=/^(RAID_|PVE_ULTIMATE$|BOSS_ULTIMATE$)/.test(event.type);
    if(hold){this.holds++;this.timeline?.pause();this.audio.stop();}
    try{return await this.beforeEvent(event);}
    finally{
      if(hold){this.holds--;if(this.valid()&&!this.holds&&!this.waiting){this.resyncAudio();this.timeline?.play();}}
    }
  }
  pump(){
    if(!this.valid()||this.waiting||this.holds)return;
    const nextRate=this.engine.paceScale||1;
    if(nextRate!==this.rate){this.rate=nextRate;this.timeline?.timeScale(this.rate);this.resyncAudio();}
    while(this.index<this.groups.length&&this.groups[this.index].at<=this.clock.time*1000+.001){
      const group=this.groups[this.index];
      const previousRun=this.blocking||(group.external&&this.pending.size?Promise.all([...this.pending]):null);
      if(group.blocking&&previousRun){
        // A cold asset or slow device can overrun an authored card animation.
        // Freeze game time (including both chips) until that action is ready.
        this.waiting=true;this.pauses++;
        this.timeline.pause().time(group.at/1000,true);this.render();this.audio.stop();
        const wait=previousRun;
        wait.then(()=>{
          if(!this.valid())return;
          this.waiting=false;if(this.blocking===wait)this.blocking=null;
          this.pump();this.resyncAudio();if(!this.waiting&&!this.holds)this.timeline.play();
        }).catch(error=>this.fail(error));
        return;
      }
      this.index++;
      const regular=[];
      for(const event of group.events){
        if(event.type==='SKILL_CHIP_CAST')this.cast(event);
        else if(event.type==='SKILL_CHIP_HIT'){this.remember(event);this.hit(event);}
        else regular.push(event);
      }
      if(regular.length){
        const run=(async()=>{
          for(const event of regular){
            if(!this.valid())return;
            const prepared=await this.prepare(event);
            if(!this.valid())return;
            if(prepared){this.remember(prepared);await this.engine.playEvents([prepared],{timedInternal:true});}
          }
        })();
        this.pending.add(run);if(group.blocking)this.blocking=run;
        run.then(()=>{
          this.pending.delete(run);if(this.blocking===run)this.blocking=null;
          if(this.valid()&&this.clock.time>=this.endMs/1000)void this.finish();
        },error=>this.fail(error));
      }
      if(this.holds){this.render();return;}
    }
    this.render();
  }
  async finish(){
    if(this.finishing||this.waiting||this.holds||!this.valid())return;
    this.pump();if(this.waiting||this.holds)return;
    this.finishing=true;
    try{await Promise.all([...this.pending]);if(this.valid()){this.completed=true;this.dispose();this.resolve(true);}}
    catch(error){this.fail(error);}
  }
  diagnostics(){return {clock:SKILL_CHIP_CLOCK,timeMs:Math.round(this.clock.time*1000),endMs:this.endMs,active:this.active,completed:Boolean(this.completed),casts:this.casts,hits:this.hits,barrierPauses:this.pauses,activeEffects:this.fx.size,pendingGroups:this.pending.size,audio:this.audio.diagnostics()};}
  dispose(){
    this.active=false;this.timeline?.kill();this.timeline=null;
    if(this.renderTick)this.engine.app?.ticker?.remove(this.renderTick);this.renderTick=null;
    for(const {fx} of this.fx.values())fx.destroy();this.fx.clear();
    this.textures?.frames.forEach(frame=>frame.destroy(false));this.textures=null;
    void this.audio.destroy();
  }
  cancel(){if(!this.active)return;this.dispose();this.resolve?.(false);}
  fail(error){if(!this.active)return;this.dispose();this.reject?.(error);}
}
