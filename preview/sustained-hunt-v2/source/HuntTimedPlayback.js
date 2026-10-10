import {BattleSuitSkillChipPlayback} from '../../project-v-v3/source/battle/BattleSuitSkillChipPlayback.js';
import {HuntBackgroundClock,HuntBattleSnapshot} from './HuntBackgroundState.js';

// Hunt alone has fixed phase boundaries. Keep the canonical 1x animation
// player, but check the boundary before its asynchronous dependency fences.
export class HuntPhasePlayback extends BattleSuitSkillChipPlayback{
  constructor(engine,events,options,startMs,deadlineMs){
    super(engine,events,options);
    this.startMs=startMs;this.deadlineMs=deadlineMs;this.clock.time=startMs/1000;
  }
  async start(){
    await super.start();
    // The base clock ends at 86400; preserve one second per second when the
    // boss phase starts at an absolute combat offset instead of zero.
    if(this.valid())this.timeline?.getChildren(false,true,false)[0]?.duration(86400-this.startMs/1000);
  }
  pump(){
    this.syncPause();
    if(!this.valid()||this.holds||this.userPaused)return;
    if(this.clock.time*1000+.001>=this.deadlineMs){
      this.deadlineReached=true;this.cancel();return;
    }
    super.pump();
  }
}

export async function playHuntTimeline(engine,events,options,plan){
  engine.skillChipPlayback?.cancel();
  engine.accountBattleUnitIsPaused=options.isPaused||(()=>false);
  const run={cancelled:false,transitioning:false,deadlineReached:false,bossEntered:false,timeMs:0};
  engine.huntRun=run;
  const clock=new HuntBackgroundClock(),state=new HuntBattleSnapshot(engine.battleData);
  const bossIndex=plan.boss?events.findIndex(event=>event.seq===plan.boss.seq):-1;
  let cursor=0,phase=null,wake=null;
  const notify=(event,meta)=>{state.record(event);options.afterEvent?.(event,meta);};
  const transition=fn=>{run.transitioning=true;try{return fn();}finally{run.transitioning=false;}};
  Object.defineProperties(run,{
    wake:{value:()=>wake?.()},
    pause:{value:paused=>{clock.pause(paused);wake?.();}},
    background:{value:()=>{
      if(!clock.running)clock.start(Math.max(run.timeMs,(phase?.clock.time||0)*1000),options.isPaused?.());
      if(phase?.active){phase.backgroundInterrupted=true;transition(()=>engine.cancelTimelines());}
      wake?.();
    }}
  });
  if(engine.huntBackground)run.background();
  try{while(cursor<events.length&&!run.cancelled&&engine.visible){
    if(clock.running){
      const at=Math.min(plan.limitMs,clock.sample());run.timeMs=at;
      while(cursor<events.length&&(Number(events[cursor].combatAtMs)||0)<=at+.001){
        const event=events[cursor++];
        if(event.huntKill&&!engine.seenKnockouts.has(event.targetId)){
          engine.seenKnockouts.add(event.targetId);engine.defeatedCount++;
        }
        notify(event,{caughtUp:true});
        if(cursor===bossIndex+1){run.bossEntered=true;state.replace(plan.boss.final);}
      }
      engine.groundDrops?.expire?.();
      if(cursor===events.length){
        run.deadlineReached=at>=plan.limitMs;
        transition(()=>engine.reconcileHuntBackground(plan.final));
        return true;
      }
      if(engine.huntBackground){
        await new Promise(resolve=>{
          const timer=setTimeout(()=>run.wake(),1000);
          wake=()=>{clearTimeout(timer);wake=null;resolve();};
        });
        continue;
      }
      clock.stop();
      transition(()=>engine.reconcileHuntBackground(state.snapshot()));
      engine.startAccountBattleUnitSustainedFire();
    }
    const enteringBoss=!run.bossEntered&&bossIndex>=0;
    const end=enteringBoss?bossIndex+1:events.length;
    const deadlineMs=enteringBoss?plan.boss.combatAtMs:plan.limitMs;
    phase=new HuntPhasePlayback(engine,events.slice(cursor,end),{...options,afterEvent:notify},run.timeMs,deadlineMs);
    engine.skillChipPlayback=phase;
    const completed=await phase.play();
    if(run.cancelled||!engine.visible)return false;
    run.timeMs=Math.min(plan.limitMs,Math.max(run.timeMs,phase.clock.time*1000));
    if(phase.backgroundInterrupted){cursor+=phase.notifyIndex;continue;}
    if(!phase.deadlineReached)return completed;

    // Invalidate every old animation continuation before rebinding any slot.
    // Only presentation is skipped: ordered server KO receipts still use the
    // existing reveal/claim path, and unclaimed field drops keep their expiry.
    transition(()=>{
      engine.reconcileHuntState(enteringBoss?plan.boss.final:plan.final,enteringBoss?plan.boss.targetId:null);
      for(const event of phase.events.slice(phase.notifyIndex)){
        if(event.huntKill&&!engine.seenKnockouts.has(event.targetId)){
          engine.seenKnockouts.add(event.targetId);engine.defeatedCount++;
        }
        notify(event,{caughtUp:true});
      }
      state.replace(enteringBoss?plan.boss.final:plan.final);
    });
    cursor=end;
    if(enteringBoss){
      run.bossEntered=true;
      engine.startAccountBattleUnitSustainedFire();
    }else{
      run.timeMs=plan.limitMs;run.deadlineReached=true;
      phase.clock.time=plan.limitMs/1000;
      return true;
    }
  }
  return !run.cancelled;
  }finally{wake?.();clock.stop();}
}
