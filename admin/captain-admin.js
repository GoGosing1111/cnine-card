(()=>{
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const statusKo=value=>({WAITING:'대기',ASSIGNED:'팀 편성',CANCELLED:'참가 취소',ACTIVE:'운영 중',DONE:'완료',PENDING:'처리 중'}[String(value||'').toUpperCase()]||String(value||'-'));
  function settlementRow(item={}){
    return `<div class="captainSettlementRow"><label><span>시작 순위</span><input data-key="from" type="number" min="1" value="${Number(item.from||1)}"></label><label><span>종료 순위</span><input data-key="to" type="number" min="1" value="${Number(item.to||item.from||1)}"></label><label><span>코인</span><input data-key="coin" type="number" min="0" value="${Number(item.coin||0)}"></label><label><span>카드 조각</span><input data-key="shards" type="number" min="0" value="${Number(item.shards||0)}"></label><button type="button" class="warn" data-remove-settlement>삭제</button></div>`;
  }
  function renderSettlement(items){
    const box=$('#capSettlementRows'); if(!box)return;
    box.innerHTML=(Array.isArray(items)&&items.length?items:[{from:1,to:1,coin:0,shards:0}]).map(settlementRow).join('');
    box.querySelectorAll('[data-remove-settlement]').forEach(button=>button.onclick=()=>{button.closest('.captainSettlementRow')?.remove();if(!box.children.length)box.insertAdjacentHTML('beforeend',settlementRow())});
  }
  let loading=false;
  let reloadQueued=false;

  async function api(path,opt={}){
    try{
      if(typeof window.api==='function')return await window.api(path,opt);
      const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
      const response=await fetch('../api/'+path,{
        ...opt,
        headers:{
          'content-type':'application/json',
          'authorization':'Bearer '+token,
          ...(opt.headers||{})
        },
        cache:'no-store'
      });
      const text=await response.text();
      let data={};
      try{data=text?JSON.parse(text):{}}catch{throw new Error(`API가 JSON이 아닌 응답을 반환했습니다. (HTTP ${response.status})`)}
      if(!response.ok)throw new Error(data.error||`요청 실패 (HTTP ${response.status})`);
      return data;
    }catch(error){
      throw new Error(`${path}: ${error?.message||error}`);
    }
  }

  function ensure(){
    const nav=$('#nav'),cms=$('#cms');
    if(!nav||!cms)return false;

    if(!nav.querySelector('[data-view="captain"]')){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.view='captain';
      button.innerHTML='대장전 관리 <span class="buildBadge">NEW</span>';
      const tier=nav.querySelector('[data-view="tiers"]');
      nav.insertBefore(button,tier||null);
    }

    if(!$('#view-captain')){
      const view=document.createElement('section');
      view.className='view';
      view.id='view-captain';
      view.hidden=true;
      view.innerHTML=`<div class="sectionIntro"><h2>대장전 관리</h2><p>3:3 랜덤 팀 승자 연전식 비동기 PVP의 운영·팀·보상·로그를 관리합니다.</p></div><div class="panel"><div class="maintenanceHead"><div><small>대장전 운영 관리</small><h2>운영 설정</h2></div><button id="capCmsSave">설정 저장</button></div><div class="formgrid"><label class="field"><span>운영 상태</span><select id="capCmsMode"><option value="OFF">운영 중지</option><option value="ON">정식 운영</option><option value="TEST">테스트 운영</option></select></label><label class="field"><span>최대 공격 횟수</span><input id="capCmsEnergyMax" type="number" min="1" value="5"></label><label class="field"><span>충전 시간(분)</span><input id="capCmsEnergyMinutes" type="number" min="1" value="15"></label><label class="field"><span>승리 점수</span><input id="capCmsWinScore" type="number" value="24"></label><label class="field"><span>패배 차감</span><input id="capCmsLoseScore" type="number" value="16"></label><label class="field"><span>팀명 변경 쿨타임(분)</span><input id="capCmsRenameCooldown" type="number" value="60"></label><label class="field"><span>운영자 테스트 참여</span><select id="capCmsAdminTest"><option value="true">허용</option><option value="false">차단</option></select></label></div><details class="captainRewardCms" open><summary>대장전 배경음 설정</summary><div class="formgrid"><label class="field"><span>배경음 사용</span><select id="capCmsBgmEnabled"><option value="false">사용 안 함</option><option value="true">사용</option></select></label><label class="field captainBgmSource"><span>음원 경로 또는 직접 URL</span><input id="capCmsBgmSource" type="text" placeholder="/assets/audio/captain-theme.mp3 또는 https://.../theme.mp3"></label><label class="field"><span>기본 음량 (0~100)</span><input id="capCmsBgmVolume" type="number" min="0" max="100" value="35"></label><label class="field"><span>반복 재생</span><select id="capCmsBgmLoop"><option value="true">사용</option><option value="false">사용 안 함</option></select></label><label class="field"><span>화면 이탈 시 정지</span><select id="capCmsBgmStop"><option value="true">사용</option><option value="false">사용 안 함</option></select></label><div class="field captainBgmPreviewActions"><span>미리듣기</span><div><button type="button" class="ghost" id="capCmsBgmPreview">재생</button><button type="button" class="ghost" id="capCmsBgmPreviewStop">정지</button></div></div></div><p class="muted">유튜브 페이지 주소는 사용할 수 없습니다. MP3·OGG·WAV 파일 직접 URL 또는 프로젝트 루트 경로를 입력하세요.</p></details><details class="captainRewardCms" open><summary>공격 승리 보상</summary><div class="formgrid"><label class="field"><span>코인</span><input id="capVictoryCoin" type="number" min="0" value="0"></label><label class="field"><span>카드 조각</span><input id="capVictoryShards" type="number" min="0" value="0"></label></div><p class="muted">공격을 시작한 유저가 3:3 경기에서 승리했을 때 즉시 지급됩니다.</p></details><details class="captainRewardCms" open><summary>주간 정산 보상</summary><div id="capSettlementRows" class="captainSettlementRows"></div><button type="button" class="ghost" id="capSettlementAdd">정산 구간 추가</button><p class="muted">지난 주 최종 팀 순위를 기준으로 유저가 직접 수령합니다. 보상은 코인과 카드 조각만 지급됩니다.</p></details></div><div class="panel"><div class="maintenanceHead"><div><h2>이번 주 운영 현황</h2><p id="capCmsWeek">불러오는 중</p></div><div><button class="ghost" id="capCmsRefresh">새로고침</button><button class="warn" id="capCmsReset">주간 초기화 확인</button></div></div><div id="capCmsStats" class="stats"></div><div class="captainCmsColumns"><section><h3>참가자·대기열</h3><div id="capCmsRegs"></div></section><section><h3>팀 관리</h3><div id="capCmsTeams"></div></section></div></div><div class="panel"><h2>최근 공격·방어 로그</h2><div id="capCmsLogs" class="table"></div></div>`;
      cms.appendChild(view);
    }

    const navButton=nav.querySelector('[data-view="captain"]');
    if(navButton&&!navButton.dataset.captainBound){
      navButton.dataset.captainBound='1';
      navButton.addEventListener('click',event=>{
        event.preventDefault();
        event.stopImmediatePropagation();
        openCaptain();
      });
    }
    return true;
  }

  function openCaptain(){
    if(!ensure())return;
    document.querySelectorAll('.view').forEach(view=>{view.hidden=view.id!=='view-captain'});
    document.querySelectorAll('#nav button').forEach(button=>button.classList.toggle('active',button.dataset.view==='captain'));
    const title=$('#pageTitle');
    if(title)title.textContent='대장전 관리';
    load();
  }

  function renderOverview(overview){
    $('#capCmsWeek').textContent=`${overview.weekKey} 주차`;
    const registrations=Array.isArray(overview.registrations)?overview.registrations:[];
    const teams=Array.isArray(overview.teams)?overview.teams:[];
    const logs=Array.isArray(overview.logs)?overview.logs:[];
    $('#capCmsStats').innerHTML=`<article><b>${registrations.length}</b><span>등록</span></article><article><b>${registrations.filter(x=>x.status==='WAITING').length}</b><span>대기</span></article><article><b>${teams.length}</b><span>팀</span></article><article><b>${logs.length}</b><span>최근 경기</span></article>`;
    $('#capCmsRegs').innerHTML=registrations.map(x=>`<div class="captainCmsRow"><b>${esc(x.nickname)}</b><span>${esc(statusKo(x.status))}</span><small>${esc(x.cooldown_until||'')}</small></div>`).join('')||'<p class="muted">등록자가 없습니다.</p>';
    $('#capCmsTeams').innerHTML=teams.map(team=>`<div class="captainCmsTeam2"><div><b>${esc(team.name)}</b><small>${(team.members||[]).map(member=>`${esc(member.role)} ${esc(member.nickname)}`).join(' · ')}</small></div><input value="${esc(team.name)}" maxlength="20"><button type="button" data-team="${Number(team.id)}">저장</button></div>`).join('')||'<p class="muted">팀이 없습니다.</p>';
    $('#capCmsTeams').querySelectorAll('button[data-team]').forEach(button=>{
      button.onclick=async()=>{
        if(button.disabled)return;
        const row=button.closest('.captainCmsTeam2');
        button.disabled=true;
        try{
          await api('admin/captain/team',{method:'PATCH',body:JSON.stringify({teamId:Number(button.dataset.team),name:row.querySelector('input').value})});
          await load();
        }catch(error){alert(`팀명 저장 실패\n${error.message}`)}finally{button.disabled=false}
      };
    });
    $('#capCmsLogs').innerHTML=logs.map(x=>{const rounds=Array.isArray(x.battle?.rounds)?x.battle.rounds.length:0;const attackWin=Number(x.winner_team_id)===Number(x.attacker_team_id);return `<div class="tr"><span>${esc(x.created_at)}</span><b>${esc(x.attacker_team_name)} → ${esc(x.defender_team_name)}<small>${esc(x.initiated_by_name||'-')} 공격 · ${rounds}라운드</small></b><span>${attackWin?'공격팀 승':'방어팀 승'}</span></div>`}).join('')||'<div class="muted">로그가 없습니다.</div>';
  }

  async function load(){
    if(!ensure()||$('#view-captain')?.hidden)return;
    if(loading){reloadQueued=true;return}
    loading=true;
    const refresh=$('#capCmsRefresh');
    if(refresh)refresh.disabled=true;
    try{
      const settingsResult=await api('admin/captain/settings');
      const overviewResult=await api('admin/captain/overview');
      const config=settingsResult.settings||{};
      $('#capCmsMode').value=config.mode||'OFF';
      $('#capCmsEnergyMax').value=config.energyMax||5;
      $('#capCmsEnergyMinutes').value=config.energyMinutes||15;
      $('#capCmsWinScore').value=config.winScore||24;
      $('#capCmsLoseScore').value=config.loseScore||16;
      $('#capCmsRenameCooldown').value=config.renameCooldownMinutes||60;
      $('#capCmsAdminTest').value=String(config.adminTestParticipation!==false);
      $('#capCmsBgmEnabled').value=String(Boolean(config.bgm?.enabled));
      $('#capCmsBgmSource').value=config.bgm?.source||'';
      $('#capCmsBgmVolume').value=Number(config.bgm?.volume??35);
      $('#capCmsBgmLoop').value=String(config.bgm?.loop!==false);
      $('#capCmsBgmStop').value=String(config.bgm?.stopOnExit!==false);
      $('#capVictoryCoin').value=Number(config.rewards?.victory?.coin||0);
      $('#capVictoryShards').value=Number(config.rewards?.victory?.shards||0);
      renderSettlement(config.rewards?.settlement||[]);
      renderOverview(overviewResult);
    }catch(error){
      console.error('captain CMS load failed',error);
      alert(`대장전 CMS 불러오기 실패\n${error.message}`);
    }finally{
      loading=false;
      if(refresh)refresh.disabled=false;
      if(reloadQueued){reloadQueued=false;queueMicrotask(load)}
    }
  }

  function bind(){
    if(!ensure())return;
    const save=$('#capCmsSave'),refresh=$('#capCmsRefresh'),reset=$('#capCmsReset'),settlementAdd=$('#capSettlementAdd');
    if(settlementAdd&&!settlementAdd.dataset.captainBound){settlementAdd.dataset.captainBound='1';settlementAdd.onclick=()=>{const box=$('#capSettlementRows');box?.insertAdjacentHTML('beforeend',settlementRow({from:(box?.children.length||0)+1,to:(box?.children.length||0)+1}));const row=box?.lastElementChild;row?.querySelector('[data-remove-settlement]')?.addEventListener('click',()=>row.remove())}}
    if(save&&!save.dataset.captainBound){
      save.dataset.captainBound='1';
      save.onclick=async()=>{
        if(save.disabled)return;
        const original=save.textContent;
        save.disabled=true;
        save.textContent='저장 중...';
        try{
          const settlement=[...document.querySelectorAll('.captainSettlementRow')].map(row=>({
            from:Math.max(1,Math.floor(Number(row.querySelector('[data-key="from"]').value)||1)),
            to:Math.max(1,Math.floor(Number(row.querySelector('[data-key="to"]').value)||1)),
            coin:Math.max(0,Math.floor(Number(row.querySelector('[data-key="coin"]').value)||0)),
            shards:Math.max(0,Math.floor(Number(row.querySelector('[data-key="shards"]').value)||0))
          })).filter(item=>item.to>=item.from);
          const rewards={victory:{coin:Math.max(0,Math.floor(Number($('#capVictoryCoin').value)||0)),shards:Math.max(0,Math.floor(Number($('#capVictoryShards').value)||0))},settlement};
          const payload={mode:$('#capCmsMode').value,energyMax:Number($('#capCmsEnergyMax').value),energyMinutes:Number($('#capCmsEnergyMinutes').value),winScore:Number($('#capCmsWinScore').value),loseScore:Number($('#capCmsLoseScore').value),renameCooldownMinutes:Number($('#capCmsRenameCooldown').value),adminTestParticipation:$('#capCmsAdminTest').value==='true',bgm:{enabled:$('#capCmsBgmEnabled').value==='true',source:$('#capCmsBgmSource').value.trim(),volume:Number($('#capCmsBgmVolume').value),loop:$('#capCmsBgmLoop').value==='true',stopOnExit:$('#capCmsBgmStop').value==='true'},rewards};
          const result=await api('admin/captain/settings',{method:'PATCH',body:JSON.stringify(payload)});
          if(!result?.ok)throw new Error(result?.error||'설정 저장 응답이 올바르지 않습니다.');
          alert('대장전 설정을 저장했습니다.');
          await load();
        }catch(error){alert(`대장전 설정 저장 실패\n${error.message}`)}finally{save.disabled=false;save.textContent=original}
      };
    }
    if(refresh&&!refresh.dataset.captainBound){refresh.dataset.captainBound='1';refresh.onclick=load}
    const preview=$('#capCmsBgmPreview'),previewStop=$('#capCmsBgmPreviewStop');
    if(preview&&!preview.dataset.captainBound){
      preview.dataset.captainBound='1';
      preview.onclick=async()=>{
        const source=$('#capCmsBgmSource').value.trim();
        if(!source)return alert('음원 경로 또는 직접 URL을 입력하세요.');
        if(/(?:youtube\.com|youtu\.be)/i.test(source))return alert('유튜브 페이지 주소는 직접 재생할 수 없습니다. 음원 파일 직접 URL을 사용하세요.');
        window.__captainCmsPreview?.pause();
        const audio=new Audio(source);
        audio.volume=Math.max(0,Math.min(1,(Number($('#capCmsBgmVolume').value)||0)/100));
        audio.loop=$('#capCmsBgmLoop').value==='true';
        window.__captainCmsPreview=audio;
        try{await audio.play();preview.textContent='재생 중'}catch(error){alert(`미리듣기 실패\n${error.message}`)}
      };
    }
    if(previewStop&&!previewStop.dataset.captainBound){
      previewStop.dataset.captainBound='1';
      previewStop.onclick=()=>{window.__captainCmsPreview?.pause();window.__captainCmsPreview=null;if(preview)preview.textContent='재생'};
    }
    if(reset&&!reset.dataset.captainBound){
      reset.dataset.captainBound='1';
      reset.onclick=async()=>{
        try{
          if(!confirm('기존 기록은 삭제하지 않고 주차 키 기준으로 분리됩니다. 계속할까요?'))return;
          const result=await api('admin/captain/reset',{method:'POST'});
          alert(result.note);
          await load();
        }catch(error){alert(`주간 초기화 확인 실패\n${error.message}`)}
      };
    }
  }

  function init(){ensure();bind()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
