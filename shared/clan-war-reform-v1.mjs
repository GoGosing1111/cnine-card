export const CLAN_REFORM_KEY='clan_reform_v1';
export const WAR_DAYS=[2,4,6,0];
export const READY_WINDOW_MS=15*60*1000;
export const SUPPORT_RULES=Object.freeze({initial:3,cap:3,recoveryMs:300000,limit:12,cooldownMs:5000});
export const CLAN_SKILLS=Object.freeze({
  DK:{name:'청룡 강습',description:'기본 팀 점수 +8 · 확보한 정보를 추가 점수로 전환',score:8},
  SAMSUNG:{name:'청색 통찰',description:'기본 팀 점수 +5 · 다음 작전용 정보 3 확보',score:5,intel:3},
  T1:{name:'붉은 연계',description:'기본 팀 점수 +6 · 다음 협동 연계 보너스 +2',score:6,comboBonus:2},
  HANWHA:{name:'불꽃 돌격',description:'기본 팀 점수 +6 · 상대 보호 효과 무시',score:6,ignoreGuard:true},
  LG:{name:'쌍둥이 수호',description:'기본 팀 점수 +5 · 아군 보호 3 확보',score:5,guard:3},
  LOTTE:{name:'거인 압박',description:'기본 팀 점수 +6 · 상대 지휘력 최대 20 감소',score:6,drain:20},
  FM:{name:'녹빛 결속',description:'기본 팀 점수 +4 · 보호 2 확보 · 지휘력 15 반환',score:4,guard:2,refund:15},
  DC:{name:'암흑 침투',description:'기본 팀 점수 +5 · 상대 보호 해제 · 정보 1 확보',score:5,breakGuard:true,intel:1}
});
export const OPERATION_ROLES=Object.freeze({
  assault:{name:'돌파 임무',role:'공격',command:15,description:'팀 점수 +2 · 지휘력 +15'},
  disrupt:{name:'교란 임무',role:'교란',command:10,description:'팀 점수 +2 · 지휘력 +10 · 정보 +1'},
  support:{name:'구호 임무',role:'지원',command:10,description:'팀 점수 +2 · 지휘력 +10 · 보호 +1'}
});
export function utcMs(value){const s=String(value||'');return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s:s.replace(' ','T')+'Z');}
export function weekOf(now=Date.now()){
  const d=new Date(now+9*3600000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  return d.toISOString().slice(0,10);
}
export function weekDates(now=Date.now()){
  const monday=Date.parse(weekOf(now)+'T00:00:00+09:00');
  return WAR_DAYS.map(day=>({day,date:new Date(monday+((day+6)%7)*86400000+9*3600000).toISOString().slice(0,10)}));
}
export function readyOpen(war,now=Date.now()){return Boolean(war&&['SCHEDULED','ACTIVE'].includes(war.status)&&now>=utcMs(war.starts_at)-READY_WINDOW_MS&&now<utcMs(war.starts_at));}
export function supportEnergy(war,used=0,now=Date.now()){
  const elapsed=Math.max(0,now-utcMs(war.starts_at));
  const generated=Math.min(SUPPORT_RULES.limit,SUPPORT_RULES.initial+Math.floor(elapsed/SUPPORT_RULES.recoveryMs));
  return {available:Math.max(0,Math.min(SUPPORT_RULES.cap,generated-used)),used,limit:SUPPORT_RULES.limit,
    remaining:Math.max(0,SUPPORT_RULES.limit-used),nextAt:generated<SUPPORT_RULES.limit?utcMs(war.starts_at)+(Math.floor(elapsed/SUPPORT_RULES.recoveryMs)+1)*SUPPORT_RULES.recoveryMs:0};
}
export function newField(){return {version:2,teams:{},users:{},events:[]};}
export function fieldTeam(state,clanId){return state.teams[clanId]??={command:0,intel:0,guard:0,commander:0,skillAt:0,points:0,operation:{},combos:0,comboBonus:0};}
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
export function applyFieldAction(state,{war,userId,clanId,markKey,kind,now,executive=false,targetUserId=0,memberIds=[]}){
  const enemyId=Number(war.clan_a_id)===clanId?Number(war.clan_b_id):Number(war.clan_a_id);
  const team=fieldTeam(state,clanId),enemy=fieldTeam(state,enemyId);
  if(![Number(war.clan_a_id),Number(war.clan_b_id)].includes(clanId))fail('이 경기의 참가 클랜이 아닙니다.');
  if(war.status!=='ACTIVE'||now<utcMs(war.starts_at)||now>=utcMs(war.ends_at))fail('진행 중인 클랜전에서만 사용할 수 있습니다.');
  if(kind==='commander'){
    if(!executive)fail('집행관만 지휘관을 지정할 수 있습니다.');
    if(!memberIds.includes(targetUserId))fail('현재 클랜원 중에서 지휘관을 선택하세요.');
    team.commander=targetUserId;return {points:0,label:'지휘관 지정',targetUserId};
  }
  const player=state.users[userId]??={used:0,lastAt:0,points:0};
  let points=0,label='',combo=false;const credit=new Map();
  if(kind==='skill'){
    if((team.commander&&memberIds.includes(team.commander))?team.commander!==userId:!executive)fail('지정된 지휘관만 스킬을 사용할 수 있습니다.');
    if(team.command<60)fail('지휘력 60이 필요합니다. 클랜원 임무로 지휘력을 모으세요.');
    if(now<team.skillAt+120000)fail('지휘 스킬 재사용 대기 중입니다.');
    const skill=CLAN_SKILLS[markKey];if(!skill)fail('클랜 전용 스킬을 확인할 수 없습니다.');
    team.command-=60;team.skillAt=now;
    if(skill.breakGuard)enemy.guard=0;
    const absorbed=skill.ignoreGuard?0:enemy.guard;
    points=Math.max(2,skill.score+team.intel-absorbed);team.intel=0;
    if(!skill.ignoreGuard)enemy.guard=0;
    team.intel=Math.min(3,team.intel+(skill.intel||0));team.guard=Math.min(3,team.guard+(skill.guard||0));
    team.command=Math.min(120,team.command+(skill.refund||0));enemy.command=Math.max(0,enemy.command-(skill.drain||0));
    team.comboBonus=Math.max(team.comboBonus,skill.comboBonus||0);label=skill.name;credit.set(userId,points);
  }else{
    const role=OPERATION_ROLES[kind];if(!role)fail('클랜 임무를 다시 선택하세요.');
    if(player.lastAt&&now<player.lastAt+SUPPORT_RULES.cooldownMs)fail('임무는 5초 간격으로 수행할 수 있습니다.');
    if(!supportEnergy(war,player.used,now).available)fail('임무 행동력이 부족합니다. 5분마다 회복되며 한 경기 최대 12회입니다.');
    player.used++;player.lastAt=now;points=2;credit.set(userId,2);label=role.name;team.command=Math.min(120,team.command+role.command);
    if(kind==='disrupt')team.intel=Math.min(3,team.intel+1);
    if(kind==='support')team.guard=Math.min(3,team.guard+1);
    // Three different members complete one operation. A lone member cannot farm
    // the group bonus by pressing all three buttons. Normal mission points remain available.
    for(const [roleId,entry] of Object.entries(team.operation))if(!memberIds.includes(entry.userId))delete team.operation[roleId];
    if(!team.operation[kind]&&!Object.values(team.operation).some(e=>e.userId===userId))team.operation[kind]={userId,at:now};
    if(Object.keys(team.operation).length===3){
      const bonus=8+team.comboBonus;points+=bonus;
      ['assault','disrupt','support'].forEach((roleId,i)=>{const id=team.operation[roleId].userId;credit.set(id,(credit.get(id)||0)+Math.floor(bonus/3)+(i<bonus%3?1:0));});
      team.comboBonus=0;team.combos++;combo=true;team.operation={};label+=' · 협동 작전 완성';
    }
  }
  for(const [id,score] of credit){const p=state.users[id]??={used:0,lastAt:0,points:0};p.points+=score;}team.points+=points;
  state.events.unshift({userId,clanId,kind,label,points,combo,at:now});state.events=state.events.slice(0,20);
  return {points,label,combo,contributions:[...credit].map(([userId,points])=>({userId,points}))};
}
