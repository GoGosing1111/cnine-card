const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const storageKey=()=>`apocalypse-dodge-pending-v1:${window.loadUser?.()?.serverUserId||window.loadUser?.()?.id||''}`;
function pending(){try{return JSON.parse(localStorage.getItem(storageKey())||'[]').filter(row=>row.expiresAt>Date.now())}catch{return []}}
function remember(row){try{const rows=pending().filter(item=>item.requestId!==row.requestId);if(!['CLAIMED','FAILED'].includes(row.status))rows.push({requestId:row.requestId,expiresAt:row.expiresAt});localStorage.setItem(storageKey(),JSON.stringify(rows.slice(-20)))}catch{}}
async function request(action,requestId,body={},keepalive=false){return window.apiRequest(`battle/apocalypse-challenge/${action}`,{method:'POST',body:JSON.stringify({requestId,...body}),keepalive},{timeoutMs:12000,ttl:0})}
function style(){if(document.querySelector('[data-apocalypse-challenge-css]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/apocalypse-challenge-v1.css?v=20261005';link.dataset.apocalypseChallengeCss='';document.head.append(link)}

// Nonce exists only in this document's memory. Refresh/back/new tabs cannot
// reconstruct it from the persisted request IDs used for cancellation/recovery.
export function beginBattle(){
  window.__activeApocalypseAttempt?.abandon();
  const requestId=crypto.randomUUID(),runToken=crypto.randomUUID();
  let ended=false,abandoned=false,stage=null,timer=null,pulsing=false,observer=null;
  remember({requestId,expiresAt:Date.now()+1200000,status:'PREPARING'});
  const attempt={requestId,runToken,
    ensure(){if(abandoned||(stage&&(!stage.isConnected||!stage.closest('.modal')?.classList.contains('show'))))throw new Error('아포칼립스 전투가 중단되어 패배했습니다.');},
    attach(nextStage){stage=nextStage;this.ensure();observer=new MutationObserver(()=>{if(!stage.isConnected||!stage.closest('.modal')?.classList.contains('show'))attempt.abandon()});observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
      timer=setInterval(async()=>{if(ended||abandoned||pulsing)return;pulsing=true;try{const result=await request('pulse',requestId,{runToken});if(result.status==='FAILED'){attempt.failure=result;attempt.stopPulse()}}catch{}finally{pulsing=false}},4000);},
    stopPulse(){clearInterval(timer);timer=null;},
    abandon(){if(ended||abandoned)return;abandoned=true;attempt.stopPulse();observer?.disconnect();window.removeEventListener('pagehide',onLeave);void request('abandon',requestId,{},true).then(remember).catch(()=>{});},
    finish(){ended=true;attempt.stopPulse();observer?.disconnect();window.removeEventListener('pagehide',onLeave);if(window.__activeApocalypseAttempt===attempt)window.__activeApocalypseAttempt=null;}
  };
  const onLeave=()=>attempt.abandon();window.addEventListener('pagehide',onLeave);window.__activeApocalypseAttempt=attempt;return attempt;
}
function apply(data,result){if(result.serverNow)data._apocalypseServerOffset=Number(result.serverNow)-Date.now();remember(result);data.apocalypseChallenge=result;if(result.settlement)Object.assign(data,result.settlement);if(result.user)data.user=result.user;return result;}
export async function playDodge({stage,phase,data,apocalypseAttempt:attempt}){
  style();attempt.ensure();const initial=data.apocalypseChallenge;
  const opened=apply(data,await request('open',initial.requestId,{runToken:attempt.runToken}));
  if(opened.status==='FAILED'){attempt.stopPulse();return opened.settlement;}
  if(opened.status!=='OPEN')throw new Error('회피 기믹을 시작하지 못했습니다.');
  const remaining=Math.max(0,opened.openedAt+opened.windowMs-Number(opened.serverNow||Date.now()));
  const panel=document.createElement('section');panel.className='apocalypse-dodge';panel.setAttribute('aria-label','아포칼립스 안전지대 회피');
  panel.innerHTML=`<header><span>APOCALYPSE · 전멸기 경보</span><b data-dodge-time></b></header><h3>안전지대로 이동하세요</h3><p>시간 안에 초록색 안전 구역을 선택하세요. 실패하면 전멸합니다. <small>키보드 1 · 2 · 3 / 터치</small></p><div class="apocalypse-dodge-zones">${['왼쪽','중앙','오른쪽'].map((label,index)=>`<button type="button" data-dodge-zone="${index}" class="${index===opened.safeZone?'is-safe':'is-danger'}"><small>${index+1}</small><b>${label}</b><span>${index===opened.safeZone?'안전 구역':'충격파'}</span></button>`).join('')}</div><div class="apocalypse-dodge-track"><i></i></div><p class="apocalypse-dodge-feedback" role="status">회피 실패·시간 초과 시 전멸 · 새로고침·화면 이탈 시 패배</p>`;
  stage.append(panel);phase.textContent='전멸기 · 충격파 회피';
  let selected=false,answerPromise,answerError;
  const feedback=panel.querySelector('[role=status]'),start=performance.now();
  const choose=zone=>{
    if(selected)return;selected=true;
    panel.querySelectorAll('button').forEach(button=>{button.disabled=true;button.classList.toggle('is-selected',Number(button.dataset.dodgeZone)===zone)});
    feedback.textContent=zone<0?'회피 시간 종료':'이동 결과 확인 중…';
    answerPromise=request('answer',initial.requestId,{runToken:attempt.runToken,zone}).then(result=>{
      apply(data,result);if(result.status==='FAILED')attempt.stopPulse();feedback.textContent=result.success?'안전 구역 도착 · 충격파를 피했습니다.':'회피 실패 · 전원 전멸';
    }).catch(error=>{answerError=error;feedback.textContent='입력 결과 연결을 다시 확인합니다.'});
  };
  panel.querySelectorAll('[data-dodge-zone]').forEach(button=>button.onclick=()=>choose(Number(button.dataset.dodgeZone)));
  const onKey=event=>{if(['1','2','3'].includes(event.key)){event.preventDefault();choose(Number(event.key)-1)}};document.addEventListener('keydown',onKey);
  try{
    while(performance.now()-start<remaining){attempt.ensure();const left=Math.max(0,remaining-(performance.now()-start));panel.querySelector('[data-dodge-time]').textContent=(left/1000).toFixed(1)+'초';panel.querySelector('.apocalypse-dodge-track i').style.width=(left/Math.max(1,remaining)*100)+'%';await wait(60);}
    attempt.ensure();if(!selected)choose(-1);await answerPromise;
    if(answerError){const recovered=await request('status',initial.requestId);if(!['ANSWERED','FAILED'].includes(recovered.status))throw answerError;apply(data,recovered);}
    await wait(500);attempt.ensure();
    return data.apocalypseChallenge.settlement||null;
  }finally{document.removeEventListener('keydown',onKey);panel.remove();}
}
export async function claimBonus({data,stage,apocalypseAttempt:attempt}){
  attempt.ensure();if(data.apocalypseChallenge.status==='FAILED')return;
  const claim=async()=>{
    attempt.ensure();if(attempt.failure){apply(data,attempt.failure);return;}
    const result=await request('claim',attempt.requestId,{runToken:attempt.runToken,played:true});attempt.ensure();apply(data,result);
    if(!['CLAIMED','FAILED'].includes(result.status))throw new Error('전투 완료 결과를 확인하지 못했습니다.');
    window.clearApiCache?.('inventory');window.clearApiCache?.('shell/summary');return result;
  };
  const finishAfter=Number(data.apocalypseChallenge.finishAfter||0),offset=Number(data._apocalypseServerOffset||0);
  while(Date.now()+offset<finishAfter){attempt.ensure();await wait(100);}
  try{return await claim()}catch(error){
    attempt.ensure();const panel=document.createElement('section');panel.className='apocalypse-dodge is-recovery';panel.innerHTML=`<h3>전투 완료 확인 중</h3><p>${esc(error.message)}<br>현재 전투 화면에서 다시 확인하세요. 화면을 나가면 미완료 전투는 패배 처리됩니다.</p><div class="apocalypse-retry-actions"><button type="button" data-retry>결과 다시 확인</button></div><p role="status"></p>`;stage.append(panel);
    try{await new Promise((resolve,reject)=>{
      const check=setInterval(()=>{try{attempt.ensure()}catch(e){clearInterval(check);reject(e)}},200);
      panel.querySelector('[data-retry]').onclick=async event=>{event.currentTarget.disabled=true;try{await claim();clearInterval(check);resolve()}catch(next){panel.querySelector('[role=status]').textContent=next.message;panel.querySelector('[data-retry]').disabled=false}};
    })}finally{panel.remove()}
  }
}
let recoveryRunning=false;
export function mountRecovery(root){
  const host=root.querySelector('.pvev2-content'),rows=pending().filter(row=>row.requestId!==window.__activeApocalypseAttempt?.requestId);if(!rows.length||recoveryRunning)return;
  recoveryRunning=true;style();const panel=document.createElement('div');panel.className='apocalypse-recovery-notice';panel.dataset.apocalypseRecover='';panel.textContent='이전 전투 기록을 확인하고 있습니다.';host?.prepend(panel);
  void (async()=>{let failed=false;try{for(const row of rows){try{
    let saved=await request('status',row.requestId);if(!['CLAIMED','FAILED'].includes(saved.status))saved=await request('abandon',row.requestId);
    remember(saved);failed ||= saved.status==='FAILED';if(saved.user)window.saveUser?.(window.apiUserToLocal(saved.user));
  }catch(error){if(error.status===404||/찾지 못|찾을 수 없/.test(error.message)){remember({...row,status:'FAILED'});continue;}throw error;}}
  panel.textContent=failed?'중단된 아포칼립스 전투는 패배 처리되었습니다. 클리어 보상은 지급되지 않습니다.':'완료된 전투 기록을 확인했습니다.';
  }catch(error){panel.textContent=error.message}finally{recoveryRunning=false}})();
}
