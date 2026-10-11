// Local Madara review rules. Only decisionView may leave the authority boundary.
const RUNES=['화','월','뇌','풍'];
const SHAPES=['갈라진 눈','닫힌 눈','세 겹 눈'];
const KINDS=new Set(['SIGNAL','SUPPRESS','MARK','BIND','DISPEL','CLONE','BREAK','CORE','SOUL','SCOUT','REINFORCE','PROTECT']);
const rand=room=>{let x=room.rng||1;x^=x<<13;x^=x>>>17;x^=x<<5;room.rng=x>>>0;return room.rng/4294967296;};
const pick=(room,values)=>values[Math.floor(rand(room)*values.length)];
function shuffled(room,values){const out=[...values];for(let i=out.length-1;i>0;i--){const j=Math.floor(rand(room)*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
const shift=(r,n)=>RUNES[(RUNES.indexOf(r)+n+8)%4];

export function initializeDecisions(room){
  for(const task of room.challenge.tasks){
    if(!KINDS.has(task.kind))continue;
    task.rounds=['CLONE','BREAK'].includes(task.kind)?3:2;
    task.decision=true;
    renewDecision(room,task);
  }
}

export function renewDecision(room,task,{recovery=false}={}){
  const q=room.challenge,kind=task.kind,slot=task.index;
  const recoveryAt=room.clock+(recovery?1500:0);
  const start=Math.max(recoveryAt,kind==='BREAK'?q.firstAt:room.clock);
  const timed=kind==='CORE'||(['PROTECT','REINFORCE'].includes(kind)&&slot===1);
  const readyAt=start+(timed?2200:600);
  let type,rule,title,options,expected,detail;
  if(['SIGNAL','SUPPRESS','MARK','BIND'].includes(kind)){
    type='SEAL';title=kind==='MARK'?'보존 결계 해독':kind==='BIND'?'낙하 봉인 재배열':'개인 봉인 해독';
    const direction=pick(room,[1,-1]),steps=pick(room,[1,2]);
    const answer=kind==='MARK'&&slot===task.rounds-1?q.preserve:pick(room,RUNES);
    const anchor=shift(answer,-direction*steps);
    rule=`${anchor}에서 ${direction===1?'정방향':'역방향'} ${steps}칸 이동한 문양을 봉인하세요.`;
    detail='정방향: 화 → 월 → 뇌 → 풍 → 화 · 역방향은 반대';
    options=RUNES.map(r=>({rune:r,label:r,detail:'봉인 문양'}));expected=options.find(o=>o.rune===answer);
    task.sealHistory||=[];
  }else if(kind==='DISPEL'||kind==='SCOUT'){
    type='IDENTIFY';title=kind==='DISPEL'?'실체의 틈을 찾아라':'낙인의 근원을 식별하라';
    const rune=pick(room,RUNES),shape=pick(room,SHAPES);
    rule=`${rune} 문양 + ${shape}. 두 조건이 모두 맞는 실체를 ${kind==='DISPEL'?'공격':'추적'}하세요.`;
    detail='같은 문양의 가짜가 섞여 있습니다. 표식의 모양까지 확인하세요.';
    options=[{rune,shape},{rune,shape:SHAPES[(SHAPES.indexOf(shape)+1)%3]},{rune:shift(rune,1),shape},{rune:shift(rune,2),shape:SHAPES[(SHAPES.indexOf(shape)+2)%3]}].map(o=>({...o,label:o.rune+' · '+o.shape,detail:kind==='DISPEL'?'환영':'낙인'}));expected=options[0];
  }else if(kind==='CLONE'||kind==='CORE'){
    type=kind==='CORE'?'EXPOSURE':'PRIORITY';title=kind==='CORE'?'핵 노출에 맞춰 타격':'증식 시전을 끊어라';
    rule='반사 표적을 제외하고, 발동까지 남은 시간이 가장 짧은 표적을 공격하세요.';
    detail=kind==='CORE'?'예고 중에는 공격 중단. 노출 구간에만 타격하세요.':'반사 표적이 가장 급해 보여도 공격하면 역류합니다.';
    options=shuffled(room,RUNES).map((r,i)=>({rune:r,label:r+' · '+(kind==='CORE'?'운석 핵':'분신'),reflected:i===0,threat:[4,8,11,14][i],detail:i===0?'반사':'시전 중'}));expected=options[1];
  }else if(kind==='BREAK'){
    type='HEAT';title='과열된 결계를 먼저 파쇄';rule=`보존 결계 ${q.preserve}와 반사 결계를 피하고, 열기가 가장 높은 결계부터 파쇄하세요.`;
    detail='한 번 파쇄할 때마다 열기와 반사 위치가 바뀝니다. 다음 표적을 다시 판단하세요.';
    const others=shuffled(room,RUNES.filter(r=>r!==q.preserve));
    options=[{rune:q.preserve,label:q.preserve+' · 결계',preserved:true,heat:100,detail:'보존'},{rune:others[0],label:others[0]+' · 결계',reflected:true,heat:95,detail:'반사'},{rune:others[1],label:others[1]+' · 결계',heat:80,detail:'과열'},{rune:others[2],label:others[2]+' · 결계',heat:40,detail:'가열'}];expected=options[2];
  }else if(['PROTECT','REINFORCE'].includes(kind)&&slot===1){
    type='INTERCEPT';title=kind==='PROTECT'?'낙하 순간에 보호 전개':'두 번째 화염의 충격 완충';
    rule=`${task.protectedName||'선택한 동료'} · 충격 예고가 끝나면 보호를 전개하세요.`;
    detail='미리 누르면 보호막이 소진됩니다. 지금 전개 표시와 흰색 구간을 확인하세요.';
    options=[{label:'보호 전개',detail:'예고 → 전개 → 보호 확정',targetId:task.protectedId}];expected=options[0];
  }else{
    type='TRIAGE';title=kind==='SOUL'?'폭주 위험을 먼저 정화':kind==='REINFORCE'?'화염에 노출될 동료 선정':'낙하 위험을 먼저 보호';
    rule='보호받는 동료를 제외하고, 충격까지 남은 시간이 가장 짧은 동료를 선택하세요.';
    detail='체력 순서만으로 선택하지 마세요. 보호 유무와 위협 시간을 함께 비교하세요.';
    const people=shuffled(room,room.members.filter(m=>!m.left)).slice(0,3);
    options=people.map((m,i)=>({label:m.name,targetId:m.id,shielded:i===0,threat:[4,9,13][i],detail:i===0?'보호 중':'보호 없음'}));expected=options[1];
  }
  options=shuffled(room,options);
  options.forEach((o,i)=>{o.id=`choice-${i}`;if(o.threat)o.impactAt=readyAt+o.threat*1000;});
  const expiresAt=readyAt+(timed?6500:expected.threat?expected.threat*1000:14000);
  task.trial={type,title,rule,detail,options,expected:expected.id,startedAt:start,readyAt,expiresAt,recoveryAt,timed};
}

export function decide(room,task,target){
  const d=task.trial,choice=d.options.find(o=>o.id===target);
  if(!choice)return {invalid:true};
  if(room.clock<d.recoveryAt)return {blocked:'판단을 재정비하는 중입니다.'};
  if(room.clock<d.readyAt){
    if(!d.timed)return {blocked:'기믹 예고를 확인하세요.'};
    return {ok:false,reason:d.type==='INTERCEPT'?'보호를 너무 일찍 전개했습니다. 새 예고를 기다리세요.':'핵이 열리기 전에 공격해 반사되었습니다.'};
  }
  if(room.clock>=d.expiresAt)return {expired:true};
  if(target!==d.expected)return {ok:false,reason:choice.reflected?'반사 표적을 공격했습니다. 반사 표시를 먼저 제외하세요.':choice.preserved?'보존 결계를 공격했습니다. 보존 표식은 남겨 두세요.':choice.shielded?'이미 보호 중인 동료를 선택했습니다. 노출된 동료의 위협을 비교하세요.':d.type==='IDENTIFY'?'문양과 눈 모양이 모두 맞아야 합니다.':d.type==='SEAL'?'봉인 순환의 방향과 이동 칸 수를 다시 확인하세요.':'더 먼저 처리해야 할 위협이 남아 있습니다.'};
  if(d.type==='TRIAGE'){task.protectedId=choice.targetId;task.protectedName=choice.label;}
  if(d.type==='SEAL')task.sealHistory.push(choice.rune);
  if(d.type==='IDENTIFY'){task.sealHistory||=[];task.sealHistory.push(choice.rune);}
  task.index++;
  return {ok:true,reason:d.type==='INTERCEPT'?'충격에 맞춰 보호를 전개했습니다.':`${choice.label} · 판단 성공`,complete:task.index>=task.rounds};
}

export function decisionView(task){
  const d=task.trial;
  return {id:task.id,kind:task.kind,label:d.title,clue:d.rule,partnerName:null,done:task.done,index:task.index,total:task.rounds,blocked:task.done?'임무 완료':'',channelAt:null,echo:false,selected:[],
    choices:d.options.map(o=>({...o})),decision:{type:d.type,detail:d.detail,startedAt:d.startedAt,readyAt:d.readyAt,expiresAt:d.expiresAt,recoveryAt:d.recoveryAt,timed:d.timed},feedback:task.feedback||null};
}

export function nextDecisionTime(task){return task.decision&&!task.done?task.trial.expiresAt:Infinity;}
