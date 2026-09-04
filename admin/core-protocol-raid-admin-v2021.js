(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  if(!document.getElementById('coreRaidAdminStyleV2021')){const style=document.createElement('link');style.id='coreRaidAdminStyleV2021';style.rel='stylesheet';style.href='core-protocol-raid-admin-v2021.css?v=2021-test-gated-live';document.head.appendChild(style)}
  const token=()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const split=value=>[...new Set(String(value||'').split(/[\n,]/).map(item=>item.trim()).filter(Boolean))];
  let loading=false,loaded=false;

  async function api(options={}){
    const response=await fetch('/api/admin/raid/core/settings',{credentials:'include',cache:'no-store',headers:{'content-type':'application/json',...(token()?{authorization:`Bearer ${token()}`}:{})},...options});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'붕괴 코어 설정 요청에 실패했습니다.');return data;
  }

  function panelMarkup(){return `<section class="panel coreRaidAdmin" id="coreRaidAdminV2021">
    <header class="coreRaidAdminHead"><div><small>CORE PROTOCOL / STAGED RELEASE</small><h2>신규 레이드 · 붕괴 코어</h2><p>기존 월드 레이드는 유지됩니다. TEST에서는 아래 계정과 OWNER에게만 내부 탭이 표시되며 보상은 별도 잠금할 수 있습니다.</p></div><span id="coreRaidAdminState">설정 확인 전</span></header>
    <div class="coreRaidAdminSafety"><b>현재 권장 상태</b><span>TEST · 보상 잠금 · 테스트 닉네임만 공개</span><em>ON은 전체 유저에게 즉시 노출됩니다.</em></div>
    <div class="coreRaidAdminGrid">
      <label><span>공개 단계</span><select id="coreRaidMode"><option value="OFF">OFF · 완전 숨김</option><option value="TEST">TEST · 지정 유저만</option><option value="ON">ON · 전체 공개</option></select></label>
      <label><span>보상 지급</span><select id="coreRaidRewardLocked"><option value="1">잠금 · 테스트 기록만</option><option value="0">해제 · 제압 보상 지급</option></select></label>
      <label class="wide"><span>테스트 닉네임</span><textarea id="coreRaidTestUsers" rows="3" placeholder="한 줄에 한 명 또는 쉼표로 구분"></textarea></label>
      <label class="wide"><span>테스트 유저 ID (선택)</span><input id="coreRaidTestUserIds" placeholder="예: 12, 47"></label>
      <label><span>레이드 제목</span><input id="coreRaidTitle" maxlength="60"></label><label><span>영문 부제</span><input id="coreRaidSubtitle" maxlength="80"></label>
      <label class="wide"><span>설명</span><textarea id="coreRaidDescription" rows="2" maxlength="240"></textarea></label>
      <label><span>보스명</span><input id="coreRaidBossName" maxlength="60"></label><label><span>보스 SD 경로</span><input id="coreRaidBossImage" maxlength="420"></label>
      <label><span>작전 주기(분)</span><input id="coreRaidWindowMinutes" type="number" min="5" max="120"></label><label><span>하루 출전 횟수</span><input id="coreRaidDailyEntries" type="number" min="1" max="20"></label>
      <label><span>최대 참가자</span><input id="coreRaidMaxParticipants" type="number" min="3" max="100"></label><label><span>공유 보스 HP</span><input id="coreRaidBossMaxHp" type="number" min="1000000" max="2000000000"></label>
      <label><span>개인전 보스 전투력</span><div><input id="coreRaidBossCombatPower" type="number" min="20" max="300"><em>%</em></div></label><label><span>공동 피해 배율</span><input id="coreRaidDamageScale" type="number" min="1" max="5000"></label>
      <label><span>약점 분석 목표</span><input id="coreRaidAnalysisRequired" type="number" min="50" max="10000"></label><label><span>코어별 목표</span><input id="coreRaidCoreRequired" type="number" min="50" max="10000"></label>
      <label><span>공동 제압 목표</span><input id="coreRaidSuppressionRequired" type="number" min="50" max="10000"></label><label><span>방향 신호 길이</span><input id="coreRaidSequenceLength" type="number" min="4" max="12"></label>
      <label><span>방향 신호 제한(ms)</span><input id="coreRaidSequenceWindow" type="number" min="3000" max="15000"></label><label><span>연타 목표</span><input id="coreRaidMashTarget" type="number" min="10" max="80"></label>
      <label><span>연타 제한(ms)</span><input id="coreRaidMashWindow" type="number" min="3000" max="15000"></label><label><span>제압 보상 코인</span><input id="coreRaidRewardCoin" type="number" min="0" max="2000000000"></label>
      <label><span>제압 보상 카드조각</span><input id="coreRaidRewardShards" type="number" min="0" max="1000000"></label>
    </div>
    <footer><button type="button" class="ghost" id="refreshCoreRaidSettings">새로고침</button><button type="button" id="saveCoreRaidSettings">붕괴 코어 설정 저장</button></footer>
  </section>`}

  function ensurePanel(){const view=$('#view-raid');if(!view)return null;let panel=$('#coreRaidAdminV2021');if(panel)return panel;const holder=document.createElement('div');holder.innerHTML=panelMarkup();panel=holder.firstElementChild;const intro=view.querySelector('.sectionIntro');if(intro)intro.after(panel);else view.prepend(panel);$('#refreshCoreRaidSettings').onclick=()=>load(true);$('#saveCoreRaidSettings').onclick=save;return panel}
  const value=(id,fallback=0)=>Number($(id)?.value??fallback);
  function render(settings={}){
    $('#coreRaidMode').value=settings.mode||'TEST';$('#coreRaidRewardLocked').value=settings.rewardLocked===false?'0':'1';$('#coreRaidTestUsers').value=(settings.testUsers||[]).join('\n');$('#coreRaidTestUserIds').value=(settings.testUserIds||[]).join(', ');
    $('#coreRaidTitle').value=settings.title||'';$('#coreRaidSubtitle').value=settings.subtitle||'';$('#coreRaidDescription').value=settings.description||'';$('#coreRaidBossName').value=settings.bossName||'';$('#coreRaidBossImage').value=settings.bossImage||'';
    $('#coreRaidWindowMinutes').value=settings.windowMinutes??20;$('#coreRaidDailyEntries').value=settings.dailyEntries??3;$('#coreRaidMaxParticipants').value=settings.maxParticipants??30;$('#coreRaidBossMaxHp').value=settings.bossMaxHp??300000000;$('#coreRaidBossCombatPower').value=settings.bossCombatPowerPercent??90;$('#coreRaidDamageScale').value=settings.damageScale??180;
    $('#coreRaidAnalysisRequired').value=settings.analysisRequired??200;$('#coreRaidCoreRequired').value=settings.coreRequired??120;$('#coreRaidSuppressionRequired').value=settings.suppressionRequired??300;$('#coreRaidSequenceLength').value=settings.sequenceLength??6;$('#coreRaidSequenceWindow').value=settings.sequenceWindowMs??5500;$('#coreRaidMashTarget').value=settings.mashTarget??24;$('#coreRaidMashWindow').value=settings.mashWindowMs??5000;$('#coreRaidRewardCoin').value=settings.rewardCoin??0;$('#coreRaidRewardShards').value=settings.rewardShards??0;
  }
  function collect(){return {mode:$('#coreRaidMode').value,rewardLocked:$('#coreRaidRewardLocked').value!=='0',testUsers:split($('#coreRaidTestUsers').value),testUserIds:split($('#coreRaidTestUserIds').value).map(Number).filter(Number.isInteger).filter(id=>id>0),title:$('#coreRaidTitle').value,subtitle:$('#coreRaidSubtitle').value,description:$('#coreRaidDescription').value,bossName:$('#coreRaidBossName').value,bossImage:$('#coreRaidBossImage').value,windowMinutes:value('#coreRaidWindowMinutes'),dailyEntries:value('#coreRaidDailyEntries'),maxParticipants:value('#coreRaidMaxParticipants'),bossMaxHp:value('#coreRaidBossMaxHp'),bossCombatPowerPercent:value('#coreRaidBossCombatPower'),damageScale:value('#coreRaidDamageScale'),analysisRequired:value('#coreRaidAnalysisRequired'),coreRequired:value('#coreRaidCoreRequired'),suppressionRequired:value('#coreRaidSuppressionRequired'),sequenceLength:value('#coreRaidSequenceLength'),sequenceWindowMs:value('#coreRaidSequenceWindow'),mashTarget:value('#coreRaidMashTarget'),mashWindowMs:value('#coreRaidMashWindow'),rewardCoin:value('#coreRaidRewardCoin'),rewardShards:value('#coreRaidRewardShards')}}
  async function load(force=false){if(loading||(!force&&loaded)||!ensurePanel()||document.body.classList.contains('auth-guest'))return;loading=true;const state=$('#coreRaidAdminState');state.textContent='서버 설정 확인 중';try{const data=await api();render(data.settings||{});loaded=true;state.textContent=`${data.settings?.mode||'TEST'} · ${data.settings?.rewardLocked===false?'보상 활성':'보상 잠금'}`;state.classList.add('ok')}catch(error){state.textContent='불러오기 실패';state.classList.remove('ok');console.error('core raid admin load failed',error)}finally{loading=false}}
  async function save(){const settings=collect();if(settings.mode==='ON'&&!confirm('붕괴 코어 탭을 전체 유저에게 공개합니다. 계속할까요?'))return;if(!settings.rewardLocked&&!confirm(`제압 시 코인 ${settings.rewardCoin.toLocaleString()} · 카드조각 ${settings.rewardShards.toLocaleString()} 지급을 활성화합니다. 계속할까요?`))return;const button=$('#saveCoreRaidSettings'),state=$('#coreRaidAdminState');button.disabled=true;state.textContent='저장 중';try{const data=await api({method:'PATCH',body:JSON.stringify(settings)});render(data.settings||settings);loaded=true;state.textContent=`저장 완료 · ${data.settings?.mode||settings.mode}`;state.classList.add('ok');alert('붕괴 코어 레이드 설정을 저장했습니다.')}catch(error){state.textContent='저장 실패';state.classList.remove('ok');alert(error.message||error)}finally{button.disabled=false}}

  function install(){const view=$('#view-raid');ensurePanel();if(view)new MutationObserver(()=>{if(!view.hidden)load()}).observe(view,{attributes:true,attributeFilter:['hidden']});$('#nav button[data-view="raid"]')?.addEventListener('click',()=>setTimeout(()=>load(true),0))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
