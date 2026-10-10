const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));

// Only the hidden interval uses wall time. A suspended mobile page may receive
// no callbacks at all; the next callback still measures the whole interval.
export class HuntBackgroundClock{
  constructor(now=()=>Date.now()){this.now=now;this.timeMs=0;this.running=false;this.paused=false;}
  sample(){
    const now=this.now();
    if(this.running&&!this.paused)this.timeMs+=Math.max(0,now-this.stamp);
    this.stamp=now;return this.timeMs;
  }
  start(timeMs,paused){this.timeMs=timeMs;this.stamp=this.now();this.paused=!!paused;this.running=true;}
  pause(paused){this.sample();this.paused=!!paused;}
  stop(){this.sample();this.running=false;return this.timeMs;}
}

// Copy absolute server HP/shield receipts, never simulate attacks or rewards.
// Keeping this separate from actors also discards half-finished visual hits
// when a tab is hidden in the middle of a projectile or a spawn animation.
export class HuntBattleSnapshot{
  constructor(payload={}){
    const teams=payload.battleV2?.teams||{};
    this.instances=new Map((payload.continuousEncounter?.instances||[]).map(row=>[row.id,row]));
    const B=(payload.continuousEncounter?.initialIds||[]).map(id=>{
      const row=this.instances.get(id);return {...row,hp:row.maxHp};
    });
    this.replace({A:teams.A?.cards||[],B,mercenaries:{A:teams.A?.mercenaries||[],B:teams.B?.mercenaries||[]}});
  }
  replace(final){
    this.teams={A:new Map(),B:new Map(),mercenaries:{A:new Map(),B:new Map()}};
    for(const side of ['A','B']){
      for(const row of final[side]||[])this.teams[side].set(row.id,{...row});
      for(const row of final.mercenaries?.[side]||[])this.teams.mercenaries[side].set(row.id,{...row});
    }
  }
  record(event){
    if(event.type==='ENEMY_SPAWN'){
      const row=this.instances.get(event.targetId);
      if(row){
        for(const [id,old] of this.teams.B)if(old.slot===row.slot)this.teams.B.delete(id);
        this.teams.B.set(row.id,{...row,hp:row.maxHp});
      }
    }
    const update=(id,receipt)=>{
      const row=this.teams.A.get(id)||this.teams.B.get(id)||this.teams.mercenaries.A.get(id)||this.teams.mercenaries.B.get(id);
      if(!row)return;
      const hp=receipt.targetHpAfter??receipt.hpAfter??receipt.targetHp??receipt.bossHp;
      const maxHp=receipt.targetMaxHp??receipt.maxHp;
      const shield=receipt.targetShieldAfter??receipt.shieldAfter;
      const maxShield=receipt.targetMaxShieldAfter??receipt.targetMaxShield??receipt.maxShield;
      if(finite(maxHp))row.maxHp=Number(maxHp);
      if(finite(hp))row.hp=Number(hp);
      if(finite(shield))row.shield=Number(shield);
      if(finite(maxShield))row.maxShield=Number(maxShield);
      else if(finite(shield))row.maxShield=Math.max(row.maxShield||0,Number(shield));
    };
    update(event.targetId,event);
    for(const row of [...(event.hits||[]),...(event.targets||[])])update(row.targetId,row);
    if(finite(event.actorShieldAfter))update(event.actorId,{shieldAfter:event.actorShieldAfter,maxShield:event.actorMaxShieldAfter});
    if(finite(event.actorHpAfter))update(event.actorId,{hpAfter:event.actorHpAfter,maxHp:event.actorMaxHp});
    if(event.type==='KO')update(event.targetId,{hpAfter:0,shieldAfter:0});
    if(event.type==='ENEMY_DESPAWN')this.teams.B.delete(event.targetId);
  }
  snapshot(){return {A:[...this.teams.A.values()],B:[...this.teams.B.values()],mercenaries:{A:[...this.teams.mercenaries.A.values()],B:[...this.teams.mercenaries.B.values()]}};}
}
