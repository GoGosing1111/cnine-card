const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const storageKey=()=>`apocalypse-dodge-pending-v1:${window.loadUser?.()?.serverUserId||window.loadUser?.()?.id||''}`;
function pending(){try{return JSON.parse(localStorage.getItem(storageKey())||'[]').filter(row=>row.expiresAt>Date.now())}catch{return []}}
function remember(row){try{const rows=pending().filter(item=>item.requestId!==row.requestId);if(row.status!=='CLAIMED')rows.push(row);localStorage.setItem(storageKey(),JSON.stringify(rows.slice(-20)))}catch{}}
async function request(action,requestId,body={}){
  return window.apiRequest(`battle/apocalypse-challenge/${action}`,{method:'POST',body:JSON.stringify({requestId,...body})},{timeoutMs:12000,ttl:0});
}
function style(){if(document.querySelector('[data-apocalypse-challenge-css]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/css/apocalypse-challenge-v1.css?v=20261005';link.dataset.apocalypseChallengeCss='';document.head.append(link)}

export async function playDodge({stage,phase,data}){
  style();const initial=data.apocalypseChallenge;if(!initial)return;
  remember(initial);
  const opened=await request('open',initial.requestId);remember(opened);
  data.apocalypseChallenge=opened;
  if(opened.status==='CLAIMED'||opened.status==='ANSWERED')return;
  const remaining=Math.max(0,opened.openedAt+opened.windowMs-Number(opened.serverNow||Date.now()));
  const panel=document.createElement('section');panel.className='apocalypse-dodge';panel.setAttribute('aria-label','아포칼립스 안전지대 회피');
  panel.innerHTML=`<header><span>APOCALYPSE · 충격파 경보</span><b data-dodge-time></b></header><h3>안전지대로 이동하세요</h3><p>초록색 안전 구역을 한 번 선택하세요. <small>키보드 1 · 2 · 3 / 터치</small></p><div class="apocalypse-dodge-zones">${['왼쪽','중앙','오른쪽'].map((label,index)=>`<button type="button" data-dodge-zone="${index}" class="${index===opened.safeZone?'is-safe':'is-danger'}"><small>${index+1}</small><b>${label}</b><span>${index===opened.safeZone?'안전 구역':'충격파'}</span></button>`).join('')}</div><div class="apocalypse-dodge-track"><i></i></div><p class="apocalypse-dodge-feedback" role="status">보스의 충격파를 피하며 전투를 준비하세요.</p>`;
  stage.append(panel);phase.textContent='충격파 회피';
  let selected=false,answerPromise,answerError;
  const feedback=panel.querySelector('[role=status]'),start=performance.now();
  const choose=zone=>{
    if(selected)return;selected=true;
    panel.querySelectorAll('button').forEach(button=>{button.disabled=true;button.classList.toggle('is-selected',Number(button.dataset.dodgeZone)===zone)});
    feedback.textContent=zone<0?'회피 시간 종료':'이동 결과 확인 중…';
    answerPromise=request('answer',initial.requestId,{zone}).then(result=>{
      remember(result);data.apocalypseChallenge=result;feedback.textContent=result.success?'안전 구역 도착 · 충격파를 피했습니다.':'회피 실패 · 기존 전투 보상은 유지됩니다.';
    }).catch(error=>{answerError=error;feedback.textContent='입력 결과 연결을 다시 확인합니다.'});
  };
  panel.querySelectorAll('[data-dodge-zone]').forEach(button=>button.onclick=()=>choose(Number(button.dataset.dodgeZone)));
  const onKey=event=>{if(['1','2','3'].includes(event.key)){event.preventDefault();choose(Number(event.key)-1)}};
  document.addEventListener('keydown',onKey);
  try{
    while(performance.now()-start<remaining&&stage.isConnected){
      const left=Math.max(0,remaining-(performance.now()-start));panel.querySelector('[data-dodge-time]').textContent=(left/1000).toFixed(1)+'초';panel.querySelector('.apocalypse-dodge-track i').style.width=(left/Math.max(1,remaining)*100)+'%';await wait(60);
    }
    if(!selected)choose(-1);await answerPromise;
    if(answerError){const recovered=await request('status',initial.requestId);if(!['ANSWERED','CLAIMED'].includes(recovered.status))throw answerError;data.apocalypseChallenge=recovered;remember(recovered);}
    await wait(650);
  }finally{document.removeEventListener('keydown',onKey);panel.remove();}
}

export async function claimBonus({data,stage}){
  const challenge=data.apocalypseChallenge;if(!challenge)return;
  const claim=async()=>{
    const result=await request('claim',challenge.requestId);remember(result);data.apocalypseBonus=result;
    if(result.user)data.user=result.user;
    window.clearApiCache?.('inventory');window.clearApiCache?.('shell/summary');return result;
  };
  try{return await claim()}catch(error){
    const panel=document.createElement('section');panel.className='apocalypse-dodge is-recovery';panel.innerHTML=`<h3>처치 보상 확인 대기</h3><p>${esc(error.message)}<br>기존 전투 결과는 저장되어 있습니다.</p><div class="apocalypse-retry-actions"><button type="button" data-retry>같은 보상 다시 확인</button><button type="button" data-later>기존 결과 보기</button></div><p role="status"></p>`;stage.append(panel);
    await new Promise(resolve=>{
      panel.querySelector('[data-later]').onclick=resolve;
      panel.querySelector('[data-retry]').onclick=async event=>{event.currentTarget.disabled=true;try{await claim();resolve()}catch(next){panel.querySelector('[role=status]').textContent=next.message;panel.querySelector('[data-retry]').disabled=false}};
    });panel.remove();
  }
}

export function mountRecovery(root){
  const host=root.querySelector('.pvev2-content'),rows=pending();if(!host||!rows.length||root.querySelector('[data-apocalypse-recover]'))return;
  style();const panel=document.createElement('div');panel.className='apocalypse-recovery-notice';panel.dataset.apocalypseRecover='';panel.innerHTML='<span>이전 아포칼립스 공략의 추가 보상을 확인할 수 있습니다.</span><button type="button">저장된 보상 확인</button><small role="status"></small>';host.prepend(panel);
  panel.querySelector('button').onclick=async event=>{
    event.currentTarget.disabled=true;const status=panel.querySelector('[role=status]');
    try{for(const row of rows){let saved=await request('status',row.requestId);if(saved.status==='READY'){saved=await request('open',row.requestId);}if(saved.status==='OPEN'){saved=await request('answer',row.requestId,{zone:-1});}const remaining=Number(saved.openedAt||0)+Number(saved.windowMs||6000)-Number(saved.serverNow||Date.now());if(remaining>0)await wait(Math.min(remaining+100,6100));const result=await request('claim',row.requestId);remember(result);if(result.user)window.saveUser?.(window.apiUserToLocal(result.user));}status.textContent='저장된 공략 결과와 보상을 확인했습니다.';window.clearApiCache?.('inventory');}
    catch(error){status.textContent=error.message;panel.querySelector('button').disabled=false;}
  };
}
