(()=>{
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const message='최고사령부에서 당신을 체포하였습니다';
  let noticeLoading=false;
  function dialog(className,markup){
    const previous=document.activeElement,el=document.createElement('dialog');el.className=className;el.innerHTML=markup;
    document.body.appendChild(el);el.addEventListener('close',()=>{el.remove();if(previous?.isConnected)previous.focus();},{once:true});
    el.querySelector('[data-chief-prison-close]')?.addEventListener('click',()=>el.close());el.showModal();return el;
  }
  async function open(){
    if(document.querySelector('.chief-prison-dialog'))return;
    const el=dialog('chief-prison-dialog',`<header><div><small>최고사령부 · 집권자 권한</small><h2>감옥 수감 명령</h2></div><button type="button" data-chief-prison-close aria-label="닫기">×</button></header><div class="chief-prison-content"><p class="chief-prison-intro">대상을 확인하고 수감 시간과 사유를 입력하세요.</p><form data-chief-prison-search><label for="chiefPrisonQuery">대상 유저</label><div class="chief-prison-search"><input id="chiefPrisonQuery" placeholder="닉네임 또는 유저 번호" maxlength="40" required autocomplete="off"><button type="submit">검색</button></div></form><div class="chief-prison-results" aria-label="검색 결과"></div><form data-chief-prison-sentence><div class="chief-prison-selected">수감할 유저를 선택하세요.</div><label for="chiefPrisonMinutes">수감 시간 <span>10분~6시간</span></label><div class="chief-prison-duration"><input id="chiefPrisonMinutes" type="number" min="10" max="360" step="1" value="60" required><span>분</span></div><label for="chiefPrisonReason">수감 사유</label><textarea id="chiefPrisonReason" rows="3" maxlength="200" placeholder="대상자에게 표시할 수감 사유" required></textarea><p class="chief-prison-notice-copy">체포 시 대상자에게 “${message}” 안내가 표시됩니다.</p><button type="submit" class="chief-prison-submit" disabled>대상 선택 후 수감 명령</button></form><p class="chief-prison-status" role="status" aria-live="polite">집권 권한을 확인하고 있습니다.</p></div>`);
    el.setAttribute('aria-label','감옥 수감 명령');
    const status=el.querySelector('.chief-prison-status'),results=el.querySelector('.chief-prison-results'),submit=el.querySelector('.chief-prison-submit'),selected=el.querySelector('.chief-prison-selected');
    let allowed=false,target=null,busy=false,searchVersion=0,lastRequest=null;
    const setStatus=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
    el.querySelector('[data-chief-prison-search]').onsubmit=async event=>{
      event.preventDefault();if(!allowed||busy)return;
      const query=el.querySelector('#chiefPrisonQuery').value.trim();if(!query)return;
      const version=++searchVersion;target=null;submit.disabled=true;selected.textContent='수감할 유저를 선택하세요.';results.innerHTML='';setStatus('대상을 검색하고 있습니다.');
      try{
        const data=await apiRequest('chief/prison/users?q='+encodeURIComponent(query),{}, {ttl:0});if(version!==searchVersion||!el.isConnected)return;
        results.innerHTML=(data.users||[]).map(user=>`<button type="button" data-target="${Number(user.id)}"><b>${esc(user.nickname)}</b><small>#${Number(user.id)}</small></button>`).join('');
        setStatus(data.users?.length?'목록에서 수감할 유저를 선택하세요.':'검색된 유저가 없습니다.');
        for(const button of results.querySelectorAll('[data-target]'))button.onclick=()=>{if(busy)return;target=data.users.find(u=>Number(u.id)===Number(button.dataset.target));for(const b of results.children)b.classList.toggle('is-selected',b===button);selected.textContent=`수감 대상: ${target.nickname} · #${target.id}`;submit.textContent=`${target.nickname} 수감 명령`;submit.disabled=false;};
      }catch(error){if(version===searchVersion)setStatus(error.message||'검색에 실패했습니다.',true);}
    };
    el.querySelector('[data-chief-prison-sentence]').onsubmit=async event=>{
      event.preventDefault();if(!allowed||!target||busy)return;
      const payload={userId:Number(target.id),durationMinutes:Number(el.querySelector('#chiefPrisonMinutes').value),reason:el.querySelector('#chiefPrisonReason').value.trim()};
      if(!payload.reason){setStatus('수감 사유를 입력하세요.',true);return;}
      const signature=JSON.stringify(payload);if(lastRequest?.signature!==signature)lastRequest={signature,requestId:crypto.randomUUID()};
      busy=true;submit.disabled=true;setStatus('수감 명령을 처리하고 있습니다.');
      try{
        const data=await apiRequest('chief/prison',{method:'POST',body:JSON.stringify({...payload,requestId:lastRequest.requestId})});
        setStatus(`${data.user.nickname} 님을 ${data.durationMinutes}분 동안 감옥에 수감했습니다.`);target=null;submit.textContent='수감 완료';selected.textContent=`수감 완료: ${data.user.nickname}`;results.innerHTML='';
      }catch(error){setStatus(error.message||'결과를 확인하지 못했습니다. 같은 내용으로 다시 시도하세요.',true);}
      finally{busy=false;submit.disabled=!target;}
    };
    try{const data=await apiRequest('chief/status',{}, {ttl:0});allowed=data?.chief?.active===true&&data.chief.isChief===true;setStatus(allowed?'닉네임을 검색해 대상을 선택하세요.':'현재 임기의 족장만 수감 권한을 사용할 수 있습니다.',!allowed);}catch(error){setStatus(error.message||'집권 권한을 확인하지 못했습니다.',true);}
  }
  function showArrestNotice(command,prison){
    if(command?.type!=='PRISON_LOCK'||command.payload?.source!=='CHIEF'||!prison?.incarcerated||prison.facility==='CLAN_CAMP'||prison.facility==='DEATH_GAME')return;
    const time=value=>Date.parse(String(value||'').replace(' ','T').replace(/Z?$/,'Z'));
    if(time(command.payload.jailedUntil)!==time(prison.jailedUntil))return;
    const user=typeof loadUser==='function'?loadUser():null,key='cnine_chief_arrest_notice_'+Number(user?.serverUserId||user?.id||0),id=Number(command.id);
    if(!id||document.getElementById('chiefArrestNotice'))return;
    try{if(Number(sessionStorage.getItem(key)||0)>=id)return;sessionStorage.setItem(key,String(id));}catch(_){}
    const el=dialog('chief-arrest-notice',`<small>최고사령부 · 체포 통지</small><img class="chief-arrest-emblem" src="/assets/ui/chief/general-insignia-v1.svg" width="54" height="64" alt="최고사령부 휘장"><h2>${message}</h2><p>감옥 수감이 집행되었습니다.</p><dl><div><dt>수감 사유</dt><dd>${esc(command.payload.reason)}</dd></div><div><dt>수감 시간</dt><dd>${Number(command.payload.durationMinutes)||0}분</dd></div></dl><button type="button" data-chief-prison-close>확인</button>`);
    el.id='chiefArrestNotice';el.setAttribute('aria-label',message);
  }
  async function checkArrestNotice(prison){
    if(noticeLoading||!prison?.incarcerated||prison.facility==='CLAN_CAMP'||prison.facility==='DEATH_GAME')return;
    noticeLoading=true;
    try{
      const data=await apiRequest('user/runtime-command',{}, {ttl:0}),command=data?.command;
      if(command?.type==='PRISON_LOCK'&&command.payload?.source==='CHIEF'){
        showArrestNotice(command,data.prison||prison);
        await apiRequest('user/runtime-command',{method:'POST',body:JSON.stringify({commandId:Number(command.id)})},{allowEmpty:true});
      }
    }catch(error){console.warn('최고사령부 체포 통지 확인 실패:',error);}finally{noticeLoading=false;}
  }
  window.ChiefPrison=Object.freeze({open,showArrestNotice,checkArrestNotice});
})();
