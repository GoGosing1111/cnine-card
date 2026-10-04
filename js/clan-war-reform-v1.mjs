const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Math.max(0,Number(v)||0).toLocaleString('ko-KR');
const dayName={2:'화',4:'목',6:'토',0:'일'},readyName={READY:'준비 완료',ABSENT:'불참',UNANSWERED:'미응답'};
const dateLabel=v=>new Date(dateMs(v)).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
let ctx=null,timer=null,busy=false,refresh=null,lastData=null,clockTimer=null;
const pending=new Map(),weeklyDraft=new Map();
const api=(path,body)=>ctx.apiRequest(path,body?{method:'POST',body:JSON.stringify(body)}:{},{timeoutMs:20000});
export function schedule(d){
  const r=d.reform;if(!r?.membership)return '';const selectedDays=weeklyDraft.get(`${d.membership.userId}:${r.weekStart}`)||r.myDays;
  const start=r.war?new Date(r.war.startsAt).getTime():0,day=start?new Date(start+9*3600000).getUTCDay():-1;
  const counts={planned:r.roster.filter(m=>m.days.includes(day)).length,ready:r.roster.filter(m=>m.ready==='READY').length,absent:r.roster.filter(m=>m.ready==='ABSENT').length,unanswered:r.roster.filter(m=>m.ready==='UNANSWERED').length};
  return `<section class="cw-plan" aria-label="이번 주 클랜전 일정"><header><div><small>WEEKLY OPERATIONS</small><h3>이번 주, 함께할 전장</h3><p>화·목·토·일 · 클랜전 2시간 · 시작 15분 전 레디 확인</p></div><span class="cw-week">${esc(r.weekStart.replaceAll('-','.'))} 주간</span></header><form data-cw-schedule><div class="cw-days">${r.days.map(({day,date})=>`<label class="cw-day"><input type="checkbox" name="warDay" value="${day}" ${selectedDays.includes(day)?'checked':''}><span><small>${esc(date.slice(5).replace('-','.'))}</small><b>${dayName[day]}요일</b><em>${r.roster.filter(m=>m.days.includes(day)).length}명 참여 예정</em><i aria-hidden="true">✓</i></span></label>`).join('')}</div><footer><p>가능한 날을 선택하세요. <b>신청하지 않아도 당일 참여할 수 있습니다.</b></p><button class="cw-primary" type="submit">${r.submitted?'참여 일정 수정':'참여 일정 저장'} <span>→</span></button></footer><div class="cw-feedback" role="status"></div></form><div class="cw-muster"><div><small>NEXT OPERATION</small><h4>${r.war?esc(dateLabel(r.war.startsAt)):'다음 대진 준비 중'}</h4><p>${r.war?.readyOpen?'지금 참여 상태를 확인하고 있습니다.':r.war?`${esc(dateLabel(r.war.readyAt))} 레디 팝업`:'대진 확정 후 레디 시간이 표시됩니다.'}</p></div><div class="cw-counts"><span><b>${counts.planned}</b>참여 예정</span><span class="ready"><b>${counts.ready}</b>준비 완료</span><span><b>${counts.absent}</b>불참</span><span><b>${counts.unanswered}</b>미응답</span></div></div>${r.war?.readyOpen?`<div class="cw-ready-inline"><span>내 상태 · <b>${readyName[r.war.myReady]}</b></span><button data-cw-ready="READY" class="cw-primary" type="button">참여 준비 완료</button><button data-cw-ready="ABSENT" class="cw-secondary" type="button">이번 경기 불참</button></div>`:''}<details class="cw-attendance"><summary>클랜원 참여 상태 · ${r.roster.length}명</summary><div>${r.roster.map(m=>`<article><b>${esc(m.nickname)}</b><span>${m.days.map(day=>dayName[day]).join('·')||(m.submitted?'참여 예정일 없음':'일정 미신청')}</span><em class="${m.ready.toLowerCase()}">${readyName[m.ready]}</em></article>`).join('')}</div></details></section>`;
}
export function executives(d){const r=d.reform;if(!r?.membership)return '';return `<section class="cw-executives"><header><small>EXECUTIVE COUNCIL</small><h3>클랜 집행관</h3><p>최신 랭크전 덱 전투력 상위 3명 · 동률이면 계정 순서 · 권한 사용 시 재확인</p></header><div>${r.executives.map(e=>`<article><i>0${e.position}</i><div><b>${esc(e.nickname)}</b><span>전투력 ${num(e.power)}</span></div><em>집행관</em></article>`).join('')}</div></section>`;}
const ART='/assets/ui/clan/war-operations-20261005/';
const icons={assault:'<path d="m5 3 12 12-2 2L3 5V3h2ZM15 3l-4 4m6-4h4v4l-4 4M4 16l4 4m-5 1 5-5m8 0 5 5m-1-5-4 4"/>',disrupt:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="m4 3 16 18"/>',support:'<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z"/><path d="M12 7v9m-4-4h8"/>',command:'<path d="m3 6 5 4 4-7 4 7 5-4-2 12H5L3 6ZM5 21h14"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'};
const icon=kind=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'+(icons[kind]||'')+'</svg>';
const dateMs=v=>Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(String(v))?v:String(v).replace(' ','T')+'Z');
const clockLabel=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');};
const crest=d=>'<img class="cw-crest" src="/assets/ui/clan/marks/'+esc(String(d?.markKey||'DK').toLowerCase())+'-clan-mark-v1.webp" alt="'+esc(d?.name||'클랜')+' 문장" width="128" height="128">';
export function warScreen(d,{participationPanel,scoreRuleText}={}){
  const w=d.war,m=d.membership,r=d.reform;if(!m)return '';
  if(!w)return '<section class="cw-war-screen cw-standby"><img src="'+ART+'hero.webp" alt="" class="cw-arena-art"><div><small>CLAN WAR / STANDBY</small><h2>다음 결전을 준비하세요</h2><p>대진이 확정되면 이곳에서 전투와 협동 작전을 시작할 수 있습니다.</p><button class="cw-primary" data-clan-tab="schedule">이번 주 참여 일정 '+icon('arrow')+'</button></div></section>';
  const isA=Number(w.clanAId)===Number(m.clanId),enemy=d.teams.find(t=>t.clanId===(isA?w.clanBId:w.clanAId)),score=isA?w.scoreA:w.scoreB,enemyScore=isA?w.scoreB:w.scoreA,e=w.energy||{},now=dateMs(r.serverNow||d.serverNow||new Date().toISOString());
  const live=w.status==='ACTIVE'&&e.windowOpen!==false&&dateMs(w.endsAt)>now,finished=['COMPLETED','CLOSED','CLOSING'].includes(w.status)||dateMs(w.endsAt)<=now;
  const remaining=Number(e.usesRemaining??w.attacksRemaining??0),limit=Number(e.useLimit||w.attackLimit||21),available=Number(w.availableOpponentCount||0),canFight=live&&e.canAttack!==false&&remaining>0&&w.liveDeckReady!==false&&available>0;
  const fightLabel=!live?(finished?'이번 경기 종료':'경기 시작 대기'):remaining<=0?'이번 경기 대결 완료':Number(e.available||0)<Number(e.cost||1)?'행동력 회복 대기':w.liveDeckReady===false?'랭크전 덱 저장 필요':available<=0?'매칭 상대 대기':'클랜 대결 출전';
  const side=(t,s,opponent=false)=>'<article class="'+(opponent?'enemy':'')+'">'+crest(t)+'<span>'+(opponent?'상대 클랜':'우리 클랜')+'</span><h3>'+esc(t?.name||'상대 클랜')+'</h3><b>'+num(s)+'<small>POINTS</small></b></article>';
  return [
    '<div class="cw-war-screen"><section class="cw-arena" aria-label="클랜전 대진과 점수"><img class="cw-arena-art" src="'+ART+'hero.webp" alt="" fetchpriority="high">',
    '<header class="cw-arena-heading"><div><small>SEASON '+num(d.season?.seasonNo)+' / '+(w.stage==='FINAL'?'GRAND FINAL':w.stage==='SEMIFINAL'?'SEMIFINAL':'ROUND '+num(w.roundNo))+'</small><h2>클랜 결전</h2></div><span class="cw-live '+(live?'on':'')+'"><i></i>'+(live?'전투 진행 중':finished?'경기 종료':'출전 준비')+'</span></header>',
    '<div class="cw-versus">'+side(m,score)+'<div class="cw-versus-center"><small>CLAN VERSUS CLAN</small><strong>VS</strong><span>'+(live?'남은 전투 시간':finished?'최종 결과':'시작까지')+'</span><b '+(finished?'':'data-cw-clock="'+esc(live?w.endsAt:w.startsAt)+'"')+'>'+(finished?'FINISHED':clockLabel(dateMs(live?w.endsAt:w.startsAt)-now))+'</b></div>'+side(enemy,enemyScore,true)+'</div>',
    '<footer><span>'+esc(dateLabel(w.startsAt))+' 개전</span><b>대결과 협동으로 완성하는 2시간의 승부</b><button class="cw-text-button" data-clan-tab="schedule">참여 일정 '+icon('arrow')+'</button></footer></section>',
    '<section class="cw-duel"><div class="cw-duel-title"><i>'+icon('assault')+'</i><div><small>PERSONAL BATTLE</small><h3>당신의 한 판이, 클랜의 승점으로.</h3><p>최신 랭크전 덱으로 무작위 대결 · '+esc(scoreRuleText?.(w)||'전투 완료 시 기여도 반영')+'</p></div></div>',
    '<div class="cw-duel-stats"><span>대결 행동력<b>'+num(e.available)+'<em> / '+num(e.cap||10)+'</em></b></span><span>이번 경기 출전<b>'+num(w.attacksUsed)+'<em> / '+num(limit)+'</em></b></span></div>',
    '<button type="button" class="cw-deploy-button" data-clan-fight '+(canFight?'':'disabled')+'>'+icon('assault')+'<span><b>'+fightLabel+'</b><small>'+(live?'행동력 '+num(e.cost||1)+' · 매칭 가능 '+num(available)+'명':esc(dateLabel(w.startsAt)))+'</small></span>'+icon('arrow')+'</button></section>',
    r.war?.id===w.id?battlefield(d):'',participationPanel?.(w)||'','</div>'
  ].join('');
}
export function battlefield(d){
  const r=d.reform,f=r?.field,w=r?.war,m=d.membership;if(!f||!w||!m)return '';
  const own=f.teams[m.clanId],enemyId=w.clanAId===m.clanId?w.clanBId:w.clanAId,enemy=f.teams[enemyId],now=dateMs(r.serverNow),live=w.status==='ACTIVE'&&dateMs(w.endsAt)>now,commander=r.roster.find(p=>p.userId===own.commander);
  const disabled=!live||f.energy.available<=0,roles=[['assault','돌파 작전','공격','지휘력 +15','선두에서 길을 열고, 협동 연계의 공격 역할을 완성합니다.','ASSAULT'],['disrupt','교란 작전','교란','지휘력 +10 · 정보 +1','정보 1마다 다음 지휘 스킬의 점수가 1 증가합니다.','DISRUPTION'],['support','구호 작전','지원','지휘력 +10 · 보호 +1','보호 1마다 상대의 다음 지휘 스킬 점수를 1 차단합니다.','SUPPORT']];
  const operationCount=Object.keys(own.operation||{}).length,recovering=now<own.skillAt+120000,commandDisabled=!live||!f.canCommand||own.command<60||recovering;
  const commandLabel=!live?'개전 후 사용 가능':!f.canCommand?'지휘관 전용':recovering?'스킬 회복 중':own.command<60?'지휘력 충전 중':'지휘 스킬 발동';
  return [
    '<section class="cw-field cw-operations" aria-label="클랜 협동 작전"><header class="cw-field-hero"><div><small>JOINT OPERATIONS</small><h3>승부를 바꾸는 <em>세 가지 역할</em></h3><p>전투력에 상관없이, 모든 클랜원이 작전을 완성하는 주역입니다.</p></div><aside><small>내 임무 행동력</small><b>'+f.energy.available+'<em> / 3</em></b><span>사용 '+f.energy.used+' / '+f.energy.limit+'회 · 5분마다 +1</span><strong>내 작전 기여 +'+num(f.my.points)+'</strong></aside></header>',
    '<div class="cw-operation-chain"><div class="cw-chain-heading"><span>OPERATION '+String(own.combos+1).padStart(2,'0')+'</span><strong>협동 연계</strong><b>'+operationCount+'<em> / 3</em></b><small>완성 보너스 <b>+'+(8+own.comboBonus)+'</b></small></div><div class="cw-chain-roles">',
    roles.map(([kind,title,role])=>'<span class="'+kind+' '+(own.operation[kind]?'complete':'')+'"><i>'+(own.operation[kind]?'✓':icon(kind))+'</i><b>'+role+'</b><em>'+esc(r.roster.find(p=>p.userId===own.operation[kind]?.userId)?.nickname||'참여 대기')+'</em></span>').join(''),
    '</div><p>서로 다른 클랜원 3명이 각 역할을 채우면 팀 보너스가 추가됩니다. 개인 임무 점수는 항상 획득합니다.</p></div><div class="cw-missions">',
    roles.map(([kind,title,role,benefit,description,en],i)=>'<article class="cw-mission '+kind+'"><div class="cw-mission-art"><img src="'+ART+kind+'.webp" alt="'+title+'를 수행하는 클랜 부대" width="960" height="640" decoding="async"><div class="cw-mission-top"><small>0'+(i+1)+' / '+en+'</small><span>팀 점수 +2</span></div><div class="cw-mission-name"><i>'+icon(kind)+'</i><div><small>'+role+' 임무</small><h4>'+title+'</h4></div></div></div><div class="cw-mission-body"><strong>'+benefit+'</strong><p>'+description+'</p><div class="cw-mission-result" aria-live="polite"></div><button type="button" class="cw-action" data-cw-action="'+kind+'" '+(disabled?'disabled':'')+'><span><b>'+(live?(f.energy.available?'작전 수행':'행동력 회복 대기'):'개전 후 작전 가능')+'</b><small>임무 행동력 1</small></span>'+icon('arrow')+'</button></div></article>').join(''),
    '</div><section class="cw-command"><div class="cw-command-crest">'+crest(m)+'<span>CLAN SPECIAL</span></div><div class="cw-command-title"><small>COMMANDER’S ABILITY</small><h4>'+esc(f.skill?.name||'클랜 지휘 스킬')+'</h4><p>'+esc(f.skill?.description)+'</p><span>지휘관 · <b>'+esc(commander?.nickname||'미지정 / 집행관 대행')+'</b></span></div>',
    '<div class="cw-command-control"><div><span>지휘력 <b>'+own.command+'<em> / 120</em></b></span><progress max="120" value="'+own.command+'"></progress></div><button class="cw-skill-button" data-cw-action="skill" '+(commandDisabled?'disabled':'')+'>'+icon('command')+'<span><b>'+commandLabel+'</b><small>지휘력 60 · 재사용 120초</small></span>'+icon('arrow')+'</button></div>',
    '<div class="cw-operation-resources"><div><i>'+icon('disrupt')+'</i><span>우리 정보<b>'+own.intel+'<em> / 3</em></b></span><small>다음 스킬 점수 추가</small></div><div><i>'+icon('support')+'</i><span>우리 보호<b>'+own.guard+'<em> / 3</em></b></span><small>상대 스킬 점수 차단</small></div><div class="enemy"><i>'+icon('command')+'</i><span>상대 지휘력<b>'+enemy.command+'<em> / 120</em></b></span><small>정보 '+enemy.intel+' · 보호 '+enemy.guard+'</small></div></div>',
    m.isExecutive?'<form class="cw-commander" data-cw-commander><label for="cwCommander">'+icon('command')+'이번 경기 지휘관 지정</label><select id="cwCommander" name="commander">'+r.roster.map(p=>'<option value="'+p.userId+'" '+(p.userId===own.commander?'selected':'')+'>'+esc(p.nickname)+'</option>').join('')+'</select><button class="cw-secondary" '+(live?'':'disabled')+'>지휘관 임명 '+icon('arrow')+'</button></form>':'',
    '</section><p class="cw-field-note">임무 행동력과 대결 행동력은 별도입니다. 임무는 팀 점수와 개인 기여도에 반영되며, 대결 참여 보상은 실제 대결 완료 횟수로 계산합니다.</p><div class="cw-feedback" role="status"></div><details class="cw-battle-log"><summary>작전 기록 <span>협동 연계 '+own.combos+'회 완성</span></summary>',
    f.events.slice(0,8).map(e=>'<p><time>'+new Date(e.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'})+'</time><b>'+esc(r.roster.find(p=>p.userId===e.userId)?.nickname||'상대 클랜')+'</b><span>'+esc(e.label)+'</span><strong>+'+e.points+'</strong></p>').join('')||'<p>아직 작전 기록이 없습니다.</p>','</details></section>'
  ].join('');
}

async function mutate(path,body,node){
  const button=node?.matches('button')?node:node?.querySelector('button');if(button)button.disabled=true;
  const feedback=node?.closest('.cw-field,.cw-plan')?.querySelector('.cw-feedback');
  try{const result=await api(path,body);if(path==='clan/war/availability')weeklyDraft.delete(`${lastData.membership.userId}:${body.weekStart}`);if(feedback)feedback.textContent=result.label?`${result.label} · 팀 점수 +${result.points}`:'저장했습니다.';await refresh?.();if(result.label){const resultNode=document.querySelector(".cw-mission."+body.kind+" .cw-mission-result")||document.querySelector(".cw-field .cw-feedback");if(resultNode){resultNode.textContent=result.label+(result.points?" · 팀 +"+result.points:"");setTimeout(()=>{if(resultNode.isConnected)resultNode.textContent="";},4000);}}return result;}
  catch(error){if(feedback)feedback.textContent=error.message;else throw error;return null;}
  finally{if(button?.isConnected)button.disabled=false;}
}
export function bind(d,context,reload){
  lastData=d;ctx=context;refresh=reload;
  clearInterval(clockTimer);const offset=dateMs(d.reform?.serverNow||d.serverNow||new Date().toISOString())-Date.now();
  const tick=()=>{const nodes=document.querySelectorAll("[data-cw-clock]");if(!nodes.length){clearInterval(clockTimer);return;}nodes.forEach(n=>n.textContent=clockLabel(dateMs(n.dataset.cwClock)-Date.now()-offset));};
  tick();if(document.querySelector("[data-cw-clock]"))clockTimer=setInterval(tick,1000);
  document.querySelectorAll('[name="warDay"]').forEach(input=>input.onchange=()=>weeklyDraft.set(`${d.membership.userId}:${d.reform.weekStart}`,[...document.querySelectorAll('[name="warDay"]:checked')].map(x=>Number(x.value))));
  document.querySelector('[data-cw-schedule]')?.addEventListener('submit',e=>{e.preventDefault();void mutate('clan/war/availability',{weekStart:d.reform.weekStart,days:[...e.currentTarget.querySelectorAll('input:checked')].map(x=>Number(x.value))},e.currentTarget);});
  document.querySelectorAll('[data-cw-ready]').forEach(button=>button.onclick=()=>void mutate('clan/war/ready',{warId:d.reform.war.id,status:button.dataset.cwReady},button));
  document.querySelectorAll('[data-cw-action]').forEach(button=>button.onclick=async()=>{
    const kind=button.dataset.cwAction,key=`${d.membership.userId}:${d.reform.war.id}:${kind}`;
    let requestId=pending.get(key)||sessionStorage.getItem('clan-field:'+key);if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem('clan-field:'+key,requestId);}pending.set(key,requestId);
    const result=await mutate('clan/war/field',{warId:d.reform.war.id,kind,requestId},button);
    if(result){pending.delete(key);sessionStorage.removeItem('clan-field:'+key);}
  });
  document.querySelector('[data-cw-commander]')?.addEventListener('submit',e=>{e.preventDefault();void mutate('clan/war/field',{warId:d.reform.war.id,kind:'commander',targetUserId:Number(e.currentTarget.commander.value),requestId:crypto.randomUUID()},e.currentTarget);});
}
function safeForPopup(){return !document.hidden&&!document.querySelector('dialog[open],#modal.show,.battle-v3-stage,.battle-v3-live,.cw-ready-popup');}
async function poll(){
  if(!ctx||busy||!safeForPopup())return;busy=true;
  try{const {alert}=await api('clan/war/ready-alert');if(alert&&safeForPopup()&&Number(sessionStorage.getItem(`clan-ready-later:${alert.userId}:${alert.warId}`)||0)<Date.now())showReady(alert);}catch{}finally{busy=false;}
}
export function showReady(alert){
  const dialog=document.createElement('dialog');dialog.className='cw-ready-popup';dialog.setAttribute('aria-label','클랜전 참여 준비 확인');
  dialog.innerHTML=`<small>CLAN WAR / READY CHECK</small><h2>곧, 클랜전이 시작됩니다.</h2><p>${esc(dateLabel(alert.startsAt))} 시작 · 2시간 진행</p><div class="cw-ready-message"><b>함께 출전할 준비가 되었나요?</b><span>공격·교란·지원 임무도 팀 승점에 기여합니다.<br>사전 신청 여부와 관계없이 참여할 수 있습니다.</span></div><div class="cw-popup-actions"><button class="cw-primary" data-status="READY">참여 준비 완료</button><button class="cw-secondary" data-status="ABSENT">이번 경기 불참</button></div><p class="cw-feedback" role="status"></p><button class="cw-later">잠시 후 확인</button>`;
  const previous=document.activeElement;document.body.append(dialog);
  let expiry;const close=()=>{clearTimeout(expiry);dialog.close();dialog.remove();previous?.focus?.();};
  const later=()=>{sessionStorage.setItem(`clan-ready-later:${alert.userId}:${alert.warId}`,String(Date.now()+120000));close();};
  dialog.querySelector('.cw-later').onclick=later;dialog.addEventListener('cancel',e=>{e.preventDefault();later();});
  dialog.querySelectorAll('[data-status]').forEach(button=>button.onclick=async()=>{
    const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try{await api('clan/war/ready',{warId:alert.warId,status:button.dataset.status});close();if(document.getElementById('clanRoot'))await refresh?.();}
    catch(error){dialog.querySelector('.cw-feedback').textContent=error.message;buttons.forEach(b=>b.disabled=false);}
  });dialog.showModal();expiry=setTimeout(close,Math.max(0,Date.parse(alert.startsAt)-Date.parse(alert.serverNow||new Date().toISOString())));
}
export function connect(context){ctx=context;if(!timer){timer=setInterval(poll,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();});void poll();}}
window.ClanWarReform={schedule,executives,warScreen,battlefield,bind,connect};
