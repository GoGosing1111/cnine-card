// Opt-in enemy mechanics; all hits run through the canonical damage/KO pipeline.
const living=team=>team.filter(c=>c.alive&&c.hp>0&&!c.isBattleSuit&&!c.untargetable);
export function legionIncomingMultiplier(target){return target?.legionRegion?Math.max(.25,Math.min(1.75,target.legionVulnerability??1)):1;}
export function castLegionRegionAction(actor,allies,enemies,{damage,knockout,emit}){
  if(!actor.legionRegion||!actor.isMonster)return false;
  const targets=living(enemies);if(!targets.length)return false;
  const strongest=[...targets].sort((a,b)=>(a.row==='FRONT'?0:1)-(b.row==='FRONT'?0:1)||a.slot-b.slot)[0];
  const attack=(target,scale,label)=>{
    const raw=Math.min(target.maxHp*.34,Math.max(1,actor.attack*scale*.42));
    const state=damage(target,raw,{actor,direct:true});actor.damageDealt+=state.hpDamage+state.absorbed;
    emit('TURN',{actorId:actor.id,actorKind:'MONSTER',targetId:target.id,damage:state.hpDamage,absorbed:state.absorbed,targetHpAfter:target.hp,targetMaxHp:target.maxHp,targetShieldAfter:target.shield,legionPattern:label,label});
    knockout(target);
  };
  const heal=(target,ratio,label)=>{const amount=Math.min(target.maxHp-target.hp,Math.round(target.maxHp*ratio));if(amount<=0)return;target.hp+=amount;actor.healingDone+=amount;emit('TEAM_HEAL',{actorId:actor.id,targetId:target.id,amount,hpAfter:target.hp,maxHp:target.maxHp,label});};
  if(!actor.isBoss){
    if(actor.legionRole==='SUPPORT'&&actor.actions%4===0&&actor.actions<=32){
      const target=living(allies).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(target?.hp<target?.maxHp){heal(target,.025,'군단 지원 · 회복');return true;}
    }
    if(actor.huntElite&&actor.actions%3===0){emit('MONSTER_MULTI_ATTACK_READY',{actorId:actor.id,attackCount:2,label:'정예 · 강습'});for(const target of targets.slice(0,2))attack(target,.75,'정예 강습');return true;}
    return false;
  }
  const turn=actor.actions,stage=Math.min(3,1+Math.floor((1-actor.hp/actor.maxHp)*3));
  let label='';
  if(actor.legionRegion==='coast'){
    const guards=living(allies).filter(c=>c.legionBossSupport).length;
    actor.legionVulnerability=guards?.72:1.1;
    label=guards?'난파왕 · 선체 포격':'난파왕 · 파선 격노';
    emit('LEGION_PATTERN',{actorId:actor.id,label,stage:guards?1:2,counter:guards?'호위 몬스터 처치 시 본체 보호 약화':'강해진 집게 공격에 대비'});
    if(guards)for(const target of targets.slice(0,2))attack(target,.8,label);else attack(strongest,1.35,label);
  }else if(actor.legionRegion==='desert'){
    const open=turn%3===0;actor.legionVulnerability=open?1.65:.7;
    label=open?'태양 전갈 · 갑각 개방':'태양 전갈 · 꼬리 찌르기';
    emit('LEGION_PATTERN',{actorId:actor.id,label,stage:open?2:1,counter:open?'다음 행동까지 받는 피해 증가':'큰 공격 뒤 갑각이 열립니다'});
    attack(strongest,open?1.6:.8,label);
  }else if(actor.legionRegion==='theatre'){
    const act=Math.min(4,1+Math.floor((turn-1)/4));label=`단장의 공연 · ${act}막`;
    emit('LEGION_PATTERN',{actorId:actor.id,label,stage:act,counter:'공연이 진행될수록 공격 대상과 피해 증가'});
    for(const target of targets.slice(0,Math.min(3,act)))attack(target,.65+act*.12,label);
  }else if(actor.legionRegion==='viscera'){
    const parasites=living(allies).filter(c=>c.legionBossSupport);label=turn%3===0?'기생 여왕 · 산성 분출':'기생 여왕 · 흡수';
    emit('LEGION_PATTERN',{actorId:actor.id,label,stage,counter:'기생체가 남아 있으면 여왕이 회복합니다'});
    if(parasites.length)heal(actor,.012*parasites.length,'기생체 흡수');
    for(const target of turn%3===0?targets:[strongest])attack(target,turn%3===0?.45:.9,label);
  }else if(actor.legionRegion==='sky'){
    const phase=(turn-1)%3;actor.legionVulnerability=phase===2?1.5:1;
    label=['천공 포식조 · 날개 폭격','천공 포식조 · 급습','천공 포식조 · 착지'][phase];
    emit('LEGION_PATTERN',{actorId:actor.id,label,stage:phase+1,counter:phase===2?'착지 중 받는 피해 증가':'다음 급습과 착지 구간에 대비'});
    for(const target of phase===0?targets:[strongest])attack(target,phase===0?.45:phase===1?1.7:.45,label);
  }else return false;
  return true;
}
