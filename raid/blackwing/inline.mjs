import {jointAccountRequest as api} from '/js/joint-account-transport.mjs';
import {createBlackwingBattle} from './battle.mjs?v=20261024-test1';
import {ART,roles,roleDetails,esc,lobbyMarkup,configMarkup,partyMarkup,roomsMarkup,partyStripMarkup} from './lobby-ui.mjs?v=20261024-codex-ui4';
const VERSION='20261024-codex-ui4',wardNames=['재의 성역','뼈의 성역','피의 성역'];
const styles=new Map();
function loadStyle(file){
 if(!styles.has(file))styles.set(file,new Promise((resolve,reject)=>{const l=document.createElement('link');l.rel='stylesheet';l.href='/raid/blackwing/'+file+'?v='+VERSION;l.onload=resolve;l.onerror=()=>{styles.delete(file);l.remove();reject(Error('흑익 화면을 불러오지 못했습니다.'));};document.head.appendChild(l);}));
 return styles.get(file);
}
// The existing OWNER screen retains its own stylesheet.
export const blackwingStyles=()=>loadStyle('live.css');
export async function mountInlineRaid(root,{current=()=>true}={}){
 await loadStyle('ui.css');if(!current())return null;
 const abort=new AbortController();let stopped=false,state=null,roomId=null,timer,busy=false,pending=null,shownSeq=0,battleReady=false,mounting=false,offset=0,locked=[],bodyOverflow='',previousFocus=null,rooms=[];
 root.innerHTML=lobbyMarkup();
 const $=s=>root.querySelector(s),note=s=>{if(!stopped){$('[data-status]').textContent=s;combat.querySelector('[data-status]').textContent=s;}};
 const selectedRole=()=> $('[data-role]:checked')?.value||'BREAKER';
 const combat=document.createElement('section');combat.className='bw-combat cn-command-ui';combat.hidden=true;combat.setAttribute('role','dialog');combat.setAttribute('aria-modal','true');combat.setAttribute('aria-label','흑익의 맹약 전투');combat.tabIndex=-1;
 combat.innerHTML='<header class="bw-top cn-ui-panel"><span class="bw-boss-portrait" role="img" aria-label="모르드레인 얼굴"></span><div><h3>흑익의 맹약</h3><span class="bw-clock" data-clock></span></div><span data-strain></span><button type="button" class="mr-button cn-ui-button" data-exit>공대 나가기</button></header><div class="bw-battle-mount"></div><div class="bw-party-strip" aria-label="공대원 전황" data-party-strip></div><section class="bw-command cn-ui-panel"><h4 data-phase></h4><p data-detail></p><div class="bw-actions" data-actions></div><p class="bw-status" role="status" aria-live="polite" data-status></p></section><section class="bw-result cn-ui-panel" hidden><h3 data-result></h3><p data-result-detail></p><p>TEST · 입장 비용 0 · 계정 보상 미지급</p><button type="button" class="mr-button cn-ui-button" data-result-exit>공대 목록으로</button></section>';document.body.appendChild(combat);const battle=createBlackwingBattle(combat.querySelector('.bw-battle-mount'));
 function fullscreen(on){if(on&&!locked.length){previousFocus=document.activeElement;bodyOverflow=document.body.style.overflow;locked=[...document.body.children].filter(e=>e!==combat&&!['SCRIPT','LINK','STYLE'].includes(e.tagName)).map(e=>[e,e.inert]);for(const[e]of locked)e.inert=true;document.body.style.overflow='hidden';combat.hidden=false;combat.focus({preventScroll:true});}else if(!on){combat.hidden=true;for(const[e,v]of locked)e.inert=v;locked=[];document.body.style.overflow=bodyOverflow;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}}
 async function request(path,options={}){return api('raid/blackwing/'+path,{...options,signal:abort.signal,timeoutMs:15000});}
 function lobbyControls(){const create=$('[data-create]');create.disabled=busy;create.innerHTML=busy?'공대 처리 중…':roles[selectedRole()]+'로 공대 만들기 <span aria-hidden="true">→</span>';root.querySelectorAll('[data-role],[data-refresh]').forEach(el=>el.disabled=busy);$('[data-lobby]').setAttribute('aria-busy',String(busy));drawRooms();}
 async function command(kind,body={}){if(busy||stopped)return;busy=true;drawActions();lobbyControls();drawParty();if(!pending)pending={kind,body:{requestId:crypto.randomUUID(),clientRulesVersion:1,...body}};
  try{const {clientRulesVersion,...rest}=pending.body;const input=['create','join','ready','start'].includes(pending.kind)?pending.body:rest;const result=await request(pending.kind+'?since='+shownSeq,{method:'POST',body:input});pending=null;note('');if(kind==='leave'){roomId=null;state=null;battleReady=false;shownSeq=0;battle.destroy();fullscreen(false);await lobby();}else if(result.state){roomId=result.roomId;await accept(result);}else await lobby();}
  catch(e){if(stopped)return;if(!e.retryable&&e.name!=='AbortError')pending=null;note(e.message+(pending?' · 같은 요청으로 재시도하세요.':''));}
  finally{busy=false;if(!stopped){drawActions();drawParty();lobbyControls();}}
 }
 function button(label,action,target,disabled=false){return `<button type="button" class="mr-button cn-ui-button primary" data-action="${action}"${target!==undefined?` data-target="${esc(target)}"`:''}${disabled||busy?' disabled':''}>${label}</button>`;}
 function drawActions(){if(stopped||!state?.challenge)return;const q=state.challenge,m=state.me,now=Date.now()+offset,d=q.debt,h=q.hearts,box=combat.querySelector('[data-actions]');let html='',detail='';
  combat.querySelector('[data-phase]').textContent=state.phase+'/5 · '+state.phaseName+' · '+roles[m.role]+' '+(m.slot+1);
  if(pending){html='<button type="button" class="mr-button cn-ui-button" data-retry>같은 요청 재시도</button>';detail='이전 요청의 결과를 확인하고 있습니다.';}
  else if(state.step==='DAMAGE'){html=button('편성 공격','STRIKE',undefined,state.attackRemaining<=0||now<state.nextStrikeAt);detail='역린 노출 · 내 남은 공격 몫 '+Math.ceil(state.attackRemaining).toLocaleString()+' · 보스 '+Math.ceil(state.bossHp/state.bossMaxHp*100)+'%';}
  else if(state.step==='TRANSITION'){detail='다음 맹약으로 이동 중입니다.';}
  else if(state.status==='ACTIVE'){
   if(['DEBT','FINAL'].includes(q.kind)&&!d.reflected){detail+='용혈 '+d.packets+'/3 · 격리 '+d.seals.length+'/2 · 반전 '+Math.max(0,(d.opensAt-now)/1000).toFixed(1)+'초 후 / 마감 '+Math.max(0,(d.closesAt-now)/1000).toFixed(1)+'초. ';if(q.kind==='FINAL'&&state.broken==='WING'&&!d.anchor)detail+='검 반격: 반전 시작 후 2.5초 이내 · 종료까지 '+Math.max(0,(d.opensAt+2500-now)/1000).toFixed(1)+'초. ';if(m.role==='BREAKER')html+=button('용혈 축적','CHARGE',undefined,d.packets>=3||now<state.nextStrikeAt);if(m.role==='SEALER')html+=button('부채 격리','ISOLATE',undefined,d.seals.includes(m.id)||d.packets!==3);if(m.role==='GUARD')html+=m.slot===1?button(state.broken==='WING'?'검 반격 저지':'용혈 고정','ANCHOR',undefined,d.anchor||now<d.opensAt||(q.kind==='FINAL'&&state.broken==='WING'&&now>=d.opensAt+2500)):button('부채 반전','REFLECT',undefined,!d.anchor||d.seals.length!==2||now<d.opensAt);}
   if(['HEARTS','FINAL'].includes(q.kind)&&!h.done){detail+='심장 준비 '+h.armed.filter(Boolean).length+'/2 · '+(h.firstAt!==null?'동시 파괴 '+Math.max(0,3-(now-h.firstAt)/1000).toFixed(1)+'초':'좌·우 동시 준비')+'. ';if(m.role==='SEALER')html+=button((m.slot?'우':'좌')+'심장 준비','ARM',m.slot,h.armed[m.slot]);if(m.role==='BREAKER')html+=button((m.slot?'우':'좌')+'심장 파괴','HEART',m.slot,!h.armed.every(Boolean)||h.broken[m.slot]||now<state.nextStrikeAt);}
   if(q.kind==='SEVER'){const votes=Object.values(q.votes);detail+='절단 합의 '+votes.length+'/2 · 수호 고정 '+q.braces.length+'/2 · 파쇄 '+q.cuts.length+'/2. ';detail+='선택: '+(votes.map(v=>v==='WING'?'흑익':'대검').join(' / ')||'미정');if(m.role==='SEALER')html+=button('흑익 선택','VOTE','WING',q.cuts.length>0)+button('대검 선택','VOTE','BLADE',q.cuts.length>0);if(m.role==='GUARD')html+=button('부위 고정','BRACE',undefined,q.braces.includes(m.id));if(m.role==='BREAKER')html+=button('합의 부위 절단','CUT',undefined,votes.length!==2||votes[0]!==votes[1]||q.braces.length!==2||q.cuts.includes(m.id));}
   if(['SANCTUARY','FINAL'].includes(q.kind)&&q.breaths<q.breathGoal){detail+='용염 '+(q.breaths+1)+'/'+q.breathGoal+' · '+Math.max(0,(q.breathAt-now)/1000).toFixed(1)+'초 · 수호 '+(q.breaths%2+1)+' 담당. ';detail+=wardNames.map((v,i)=>v+' '+state.wards[i]).join(' / ');if(m.role==='GUARD')html+=wardNames.map((v,i)=>button(v+' 전개','WARD',i,m.slot!==q.breaths%2||q.wardLocked!==null||!state.wards[i]||state.lastWard===i||now<q.breathAt-2500)).join('');}
  }
  if(m.role==='GUARD'&&state.status==='ACTIVE'&&!pending)html+=button('공대 회복 '+state.resources.heal+'/4','HEAL',undefined,state.resources.heal<=0);
  if(!html&&state.status==='ACTIVE')html='<span>동료의 임무 진행을 확인하세요.</span>';if(box.innerHTML!==html)box.innerHTML=html;combat.querySelector('[data-detail]').textContent=detail;
 }
 function drawParty(){
  const panel=$('[data-party]');panel.hidden=!state||state.status!=='LOBBY';$('[data-lobby]').hidden=!!state;$('[data-registry]').hidden=!!state;
  if(!state||state.status!=='LOBBY')return;
  const html=partyMarkup(state,roomId,busy);if(panel.innerHTML!==html)panel.innerHTML=html;
 }

 async function accept(result){if(stopped||!result.state)return;const next=result.state;if(state&&next.id===state.id&&next.revision<state.revision)return;state=next;roomId=next.id;offset=next.serverNow-Date.now();drawParty();
  if(next.status!=='LOBBY'){fullscreen(true);if(!battleReady&&!mounting){mounting=true;try{const payload=result.payload||(await request('state?roomId='+roomId+'&payload=1&since='+shownSeq)).payload;if(stopped)return;await battle.mount(payload);battleReady=true;}catch(e){note('전장 로딩 실패: '+e.message+' · 다음 갱신에서 다시 시도합니다.');}finally{mounting=false;}}
   if(stopped)return;battle.update(next);drawActions();const strip=combat.querySelector('[data-party-strip]'),stripHtml=partyStripMarkup(next);if(strip.innerHTML!==stripHtml)strip.innerHTML=stripHtml;combat.querySelector('[data-strain]').textContent='침식 '+next.strain+'/3 · 성역 '+next.wards.reduce((a,b)=>a+b,0)+'/6';
   const ended=!['ACTIVE','LOBBY'].includes(next.status);combat.querySelector('.bw-result').hidden=!ended;if(ended){combat.querySelector('[data-result]').textContent=next.status==='CLEAR'?'맹약 파괴 · 공략 성공':'작전 종료';combat.querySelector('[data-result-detail]').textContent=next.failure?.reason||'서버가 모든 기믹과 공대의 전투 피해를 확인했습니다.';}
  }shownSeq=Math.max(shownSeq,next.eventSeq);}
 async function lobby(){
  const result=await request('lobby');if(stopped)return;
  $('[data-config]').innerHTML=configMarkup(result.settings);
  if(result.account.roomId){roomId=result.account.roomId;await accept(await request('state?roomId='+roomId+'&payload=1'));return;}
  $('[data-lobby]').hidden=false;$('[data-party]').hidden=true;$('[data-registry]').hidden=false;
  rooms=result.rooms;drawRooms();
 }
 function drawRooms(){const html=roomsMarkup(rooms,selectedRole(),busy),box=$('[data-rooms]');if(box.innerHTML!==html)box.innerHTML=html;$('[data-room-count]').textContent=rooms.length;}

 async function poll(){if(stopped)return;try{if(!busy){if(roomId)await accept(await request('state?roomId='+roomId+'&since='+shownSeq));else await lobby();}}catch(e){if(!stopped){note(e.message);if(['BLACKWING_KICKED','BLACKWING_NOT_MEMBER','BLACKWING_ROOM_MISSING'].includes(e.code)){roomId=null;state=null;battleReady=false;shownSeq=0;battle.destroy();fullscreen(false);}}}finally{if(!stopped)timer=setTimeout(poll,roomId?800:4000);}}
 async function leave(){if(!roomId||busy)return;if(state?.status==='ACTIVE'&&!confirm('전투 중 나가면 공대 전체가 실패합니다. 나가시겠습니까?'))return;await command('leave',{roomId});}
 root.addEventListener('change',e=>{if(!e.target.matches('[data-role]'))return;const role=selectedRole();$('[data-role-hint]').textContent=roleDetails[role][1];$('[data-create]').innerHTML=roles[role]+'로 공대 만들기 <span aria-hidden="true">→</span>';drawRooms();},{signal:abort.signal});
 root.addEventListener('click',e=>{if(busy)return;if(e.target.closest('[data-copy]'))void navigator.clipboard.writeText(roomId).then(()=>note('공대 코드를 복사했습니다.')).catch(()=>note('공대 코드: '+roomId));if(e.target.closest('[data-create]'))void command('create',{role:selectedRole()});const join=e.target.closest('[data-join]');if(join)void command('join',{roomId:join.dataset.join,role:selectedRole()});if(e.target.closest('[data-refresh]'))void lobby().catch(e=>note(e.message));if(e.target.closest('[data-ready]'))void command('ready',{roomId,ready:!state.me.ready});if(e.target.closest('[data-start]'))void command('start',{roomId});if(e.target.closest('[data-leave]'))void leave();const kick=e.target.closest('[data-kick]');if(kick)void command('kick',{roomId,targetId:kick.dataset.kick});},{signal:abort.signal});
 combat.addEventListener('click',e=>{if(e.target.closest('[data-exit],[data-result-exit]'))void leave();const b=e.target.closest('[data-action]');if(b&&!busy){const action=b.dataset.action;void command('action',{roomId,action,token:state.challenge.tokens[action],...(b.dataset.target!==undefined?{target:b.dataset.target}:{})});}if(e.target.closest('[data-retry]')&&pending)void command(pending.kind,pending.body);},{signal:abort.signal});
 document.addEventListener('keydown',e=>{if(!combat.hidden&&e.key==='Escape'){e.preventDefault();void leave();}},{signal:abort.signal});
 const ticker=setInterval(()=>{if(stopped||!state||combat.hidden)return;const now=Date.now()+offset;combat.querySelector('[data-clock]').textContent='광폭화 '+Math.max(0,Math.ceil((state.endsAt-now)/1000))+'초 · 구간 '+Math.max(0,Math.ceil((state.challenge.deadline-now)/1000))+'초';drawActions();},200);
 globalThis.BlackwingRaidDiagnostics=()=>({roomId,state,battle:battle.diagnostics(),busy,pending:!!pending});
 void poll();return {destroy(){stopped=true;abort.abort();clearTimeout(timer);clearInterval(ticker);battle.destroy();fullscreen(false);combat.remove();root.replaceChildren();delete globalThis.BlackwingRaidDiagnostics;}};
}
