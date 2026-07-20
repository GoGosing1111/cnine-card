(()=>{
  let panel=null,current=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const send=msg=>new Promise(resolve=>chrome.runtime.sendMessage(msg,r=>resolve(r||{ok:false,error:'확장프로그램 응답이 없습니다.'})));
  function nicknameFrom(el){
    const node=el.closest('[data-nick],[data-nickname],.nickname,.nick,.writer_nick,.name,a[href*="member"],a[href*="user"]');
    if(!node)return null;
    const raw=node.dataset?.nick||node.dataset?.nickname||node.getAttribute('title')||node.textContent;
    const nick=String(raw||'').replace(/\s+/g,' ').trim();
    if(!nick||nick.length>80||/^(로그인|회원가입|글쓰기|답글|추천|신고)$/i.test(nick))return null;
    return {nick,node};
  }
  function sourceKey(el){
    const row=el.closest('[id],[data-comment-id],[data-id],tr,li,.comment,.reply,.article');
    return `${location.pathname}|${row?.dataset?.commentId||row?.dataset?.id||row?.id||''}|${current?.nick||''}`.slice(0,300);
  }
  function close(){panel?.remove();panel=null;current=null;}
  async function open(nick,node){
    close();current={nick,node};panel=document.createElement('section');panel.id='cnine-wago-panel';
    panel.innerHTML=`<div class="cnw-head"><b>씨켓몬 코인 지급</b><button class="cnw-close">×</button></div><div class="cnw-body"><div class="cnw-line">와고 닉네임<strong>${esc(nick)}</strong></div><div id="cnw-account" class="cnw-line">2단계 인증 연결 계정 조회 중...</div><div class="cnw-grid"><button class="cnw-quick" data-v="500">500</button><button class="cnw-quick" data-v="1000">1천</button><button class="cnw-quick" data-v="3000">3천</button><button class="cnw-quick" data-v="5000">5천</button></div><input id="cnw-amount" class="cnw-input" type="number" min="1" max="1000000" value="1000" placeholder="지급 코인"><input id="cnw-reason" class="cnw-input" maxlength="120" value="시청 이벤트" placeholder="지급 사유"><button id="cnw-submit" class="cnw-submit" disabled>지급하기</button><div id="cnw-msg" class="cnw-msg">연결 정보를 확인하고 있습니다.</div></div>`;
    document.body.appendChild(panel);panel.querySelector('.cnw-close').onclick=close;
    panel.querySelectorAll('.cnw-quick').forEach(b=>b.onclick=()=>panel.querySelector('#cnw-amount').value=b.dataset.v);
    const resolved=await send({type:'CNINE_RESOLVE',wagoNickname:nick,sourceUrl:location.href});
    const account=panel?.querySelector('#cnw-account'),msg=panel?.querySelector('#cnw-msg'),submit=panel?.querySelector('#cnw-submit');if(!panel)return;
    if(!resolved.ok){account.innerHTML='연결된 씨켓몬 계정<strong>확인 실패</strong>';msg.className='cnw-msg cnw-error';msg.textContent=resolved.error;return;}
    current.resolved=resolved;account.innerHTML=`연결된 씨켓몬 계정<strong>${esc(resolved.gameUser.nickname)}</strong><span>현재 ${Number(resolved.gameUser.coin).toLocaleString()}코인</span>`;msg.textContent='지급 금액과 사유를 확인하세요.';submit.disabled=false;
    submit.onclick=async()=>{
      const amount=Number(panel.querySelector('#cnw-amount').value),reason=panel.querySelector('#cnw-reason').value.trim();
      if(!Number.isInteger(amount)||amount<1||amount>1000000){msg.className='cnw-msg cnw-error';msg.textContent='1~1,000,000 사이의 정수를 입력하세요.';return;}
      if(!reason){msg.className='cnw-msg cnw-error';msg.textContent='지급 사유를 입력하세요.';return;}
      if(!confirm(`${nick} → ${resolved.gameUser.nickname}\n${amount.toLocaleString()}코인을 지급할까요?`))return;
      submit.disabled=true;msg.className='cnw-msg';msg.textContent='지급 처리 중...';
      const requestId=`wago-${Date.now()}-${crypto.randomUUID()}`;
      const result=await send({type:'CNINE_GRANT',payload:{requestId,targetUserId:resolved.gameUser.id,wagoNickname:nick,amount,reason,sourceUrl:location.href,sourceKey:sourceKey(node)}});
      if(!result.ok){msg.className='cnw-msg cnw-error';msg.textContent=result.error;submit.disabled=false;return;}
      msg.className='cnw-msg cnw-success';msg.textContent=`지급 완료\n${resolved.gameUser.coin.toLocaleString()} → ${Number(result.gameUser.coin).toLocaleString()}코인`;account.innerHTML=`연결된 씨켓몬 계정<strong>${esc(result.gameUser.nickname)}</strong><span>현재 ${Number(result.gameUser.coin).toLocaleString()}코인</span>`;
    };
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('#cnine-wago-panel'))return;
    const found=nicknameFrom(e.target);if(!found)return;
    if(found.node.tagName==='A')e.preventDefault();e.stopPropagation();open(found.nick,found.node);
  },true);
})();
