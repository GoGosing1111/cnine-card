// Resolved offline examples, never a source of production damage or economy.
export function rehearseSSkill({skill,targets,t,work,get,add,flag,hit,mark,counter,boss}) {
  const impacts=skill.visual.impacts;
  switch(skill.mechanic) {
    case 'DUEL_OATH':
      hit(1,t,26,'성검 단일 검격');flag(1,t,'결투 맹세',true,'시전자 상대 기본 공격 1회 방호');
      if(counter){hit(1.8,'A2',15,'다른 아군 공격: 결투 방호 없음');}
      else hit(1.8,'M',9,'시전자 공격: 기본 피해 15 → 9');
      flag(1.8,t,'결투 맹세',false,'상대의 기본 공격 1회로 맹세 소모');break;
    case 'OBSERVED_SHIELD_BREAK': {
      if(counter)add(.6,'SCENARIO','보호막 없는 표적',[t],{[t]:{shield:0}});
      else add(.6,'SCENARIO','관측 대상 보호막 40',[t],{[t]:{shield:40}});
      hit(1.35,t,24,'정밀탄 기본 피해');const spent=Math.min(get(t).shield,12);
      add(1.35,'STATUS',`남은 보호막만 ${spent} 파쇄 · HP 이전 없음`,[t],{[t]:{shield:get(t).shield-spent}});break;}
    case 'DANCING_TARGET_VOLLEY': {
      let previous=t;
      impacts.forEach((at,i)=>{if(counter&&i>0)return;
        if(i){const alive=work.filter(a=>a.team==='ENEMY'&&a.hp>0),other=alive.filter(a=>a.id!==previous);previous=(other.length?other:alive).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id.localeCompare(b.id))[0]?.id;}
        if(previous){mark(at-.2,'이번 탄의 표적 예고',[previous],'WINDUP');hit(at,previous,12,`적주 선회 사격 ${i+1}/3`,{phaseIndex:i});}
      });if(counter)mark(1.1,'제압으로 후속 탄 취소',targets,'CANCEL');break;}
    case 'WOUNDED_MOON_DRAW': {
      if(counter)add(.85,'SCENARIO','충돌 전에 완전 회복',[t],{[t]:{hp:100}});
      const amount=24*(1+(1-get(t).hp/get(t).maxHp)*.5);
      hit(1.1,t,amount,'잃은 HP 비율에 따른 상한 있는 발도');flag(1.4,'M','재정비',true,'처치와 관계없이 재정비');break;}
    case 'FRONT_STAND_FAST':
      targets.forEach(id=>flag(1,id,'백철 방호',true,'전열 인원으로 방호 예산 분배'));
      if(counter){targets.forEach(id=>flag(1.45,id,'백철 방호',false,'방호 정화','CLEANSE'));hit(1.8,t,18,'정화 후 기본 피격');}
      else{hit(1.8,t,10.8,'기본 피격 18 → 10.8');flag(1.8,t,'백철 방호',false,'피격 1회 방호 소모');}break;
    case 'THORN_RECOIL_SEAL':
      hit(.85,t,18,'봉인시 직접 피해');flag(.85,t,'청록 가시',true,'해제 가능한 가시 봉인');
      if(counter)flag(1.4,t,'청록 가시',false,'기본 공격 전 정화','CLEANSE');
      else{hit(1.7,'A2',8,'표적의 기본 공격 명중');hit(1.8,t,12,'봉인 피해 1회 · 반사 아님',{phaseIndex:1,procEligible:false});flag(1.8,t,'청록 가시',false,'봉인 소모');}break;
    case 'ABYSS_SHIELD_ECHO': {
      if(counter){mark(1.1,'첫 탄 회피: 추적탄 생성 없음',targets,'BLOCKED');break;}
      add(.5,'SCENARIO','고정 표적 보호막 14',[t],{[t]:{shield:14}});
      const absorbed=Math.min(14,18);hit(1.1,t,18,'첫 수압탄: 흡수량 기록',{phaseIndex:0});
      hit(1.95,t,18+Math.min(absorbed,10),'같은 적 추적 · 추가량 상한 10',{phaseIndex:1,procEligible:false});break;}
    case 'PLATINUM_FOCUS_LOCK':
      impacts.forEach((at,i)=>{if(counter&&i===1)mark(at,'둘째 점사 회피: 전탄 조건 실패',targets,'BLOCKED');else hit(at,t,10,`백금 점사 ${i+1}/3`,{phaseIndex:i});});
      if(!counter&&get(t).hp>0)flag(1.6,t,'공격술 봉쇄',true,'다음 일반 공격 스킬 1회 감쇠');break;
    case 'DISTRIBUTED_CORAL_VOLLEY':
      targets.forEach((id,i)=>{if(counter&&i===0){mark(impacts[i],'첫 표적 화살 회피 · 몫 이전 없음',[id],'BLOCKED');return;}hit(impacts[i],id,36/targets.length,boss?'단일 보스 한 발 · 전체 예산 36':`고정 표적 ${i+1}의 배분량`,{phaseIndex:i});});break;
    default:throw Error('Unknown S/SS rehearsal');
  }
}
