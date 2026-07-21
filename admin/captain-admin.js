(()=>{
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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
      view.innerHTML=`<div class="sectionIntro"><h2>대장전 관리</h2><p>3:3 랜덤 팀 비동기 PVP의 운영·팀·보상·로그를 관리합니다.</p></div><div class="panel"><div class="maintenanceHead"><div><small>CAPTAIN BATTLE CONTROL</small><h2>운영 설정</h2></div><button id="capCmsSave">설정 저장</button></div><div class="formgrid"><label class="field"><span>운영 상태</span><select id="capCmsMode"><option>OFF</option><option>ON</option><option>TEST</option></select></label><label class="field"><span>최대 공격 횟수</span><input id="capCmsEnergyMax" type="number" min="1" value="5"></label><label class="field"><span>충전 시간(분)</span><input id="capCmsEnergyMinutes" type="number" min="1" value="15"></label><label class="field"><span>승리 점수</span><input id="capCmsWinScore" type="number" value="24"></label><label class="field"><span>패배 차감</span><input id="capCmsLoseScore" type="number" value="16"></label><label class="field"><span>팀명 변경 쿨타임(분)</span><input id="capCmsRenameCooldown" type="number" value="60"></label></div><details class="captainRewardCms"><summary>참여 보상 설정</summary><div class="formgrid">${['coin','shards','NORMAL_CUBE','ADVANCED_CUBE','PREMIUM_CUBE'].map(k=>`<label class="field"><span>${k}</span><input id="capReward_${k}" type="number" min="0" value="0"></label>`).join('')}</div></details></div><div class="panel"><div class="maintenanceHead"><div><h2>이번 주 운영 현황</h2><p id="capCmsWeek">불러오는 중</p></div><div><button class="ghost" id="capCmsRefresh">새로고침</button><button class="warn" id="capCmsReset">주간 초기화 확인</button></div></div><div id="capCmsStats" class="stats"></div><div class="captainCmsColumns"><section><h3>참가자·대기열</h3><div id="capCmsRegs"></div></section><section><h3>팀 관리</h3><div id="capCmsTeams"></div></section></div></div><div class="panel"><h2>최근 공격·방어 로그</h2><div id="capCmsLogs" class="table"></div></div>`;
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
    $('#capCmsRegs').innerHTML=registrations.map(x=>`<div class="captainCmsRow"><b>${esc(x.nickname)}</b><span>${esc(x.status)}</span><small>${esc(x.cooldown_until||'')}</small></div>`).join('')||'<p class="muted">등록자가 없습니다.</p>';
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
    $('#capCmsLogs').innerHTML=logs.map(x=>`<div class="tr"><span>${esc(x.created_at)}</span><b>${esc(x.attacker_name)} → ${esc(x.defender_name)}</b><span>${Number(x.winner_user_id)===Number(x.attacker_user_id)?'공격 승':'방어 승'}</span></div>`).join('')||'<div class="muted">로그가 없습니다.</div>';
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
      for(const key of ['coin','shards','NORMAL_CUBE','ADVANCED_CUBE','PREMIUM_CUBE'])$('#capReward_'+key).value=config.rewards?.participation?.[key]||0;
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
    const save=$('#capCmsSave'),refresh=$('#capCmsRefresh'),reset=$('#capCmsReset');
    if(save&&!save.dataset.captainBound){
      save.dataset.captainBound='1';
      save.onclick=async()=>{
        if(save.disabled)return;
        const original=save.textContent;
        save.disabled=true;
        save.textContent='저장 중...';
        try{
          const rewards={participation:{}};
          for(const key of ['coin','shards','NORMAL_CUBE','ADVANCED_CUBE','PREMIUM_CUBE'])rewards.participation[key]=Math.max(0,Math.floor(Number($('#capReward_'+key).value)||0));
          const payload={mode:$('#capCmsMode').value,energyMax:Number($('#capCmsEnergyMax').value),energyMinutes:Number($('#capCmsEnergyMinutes').value),winScore:Number($('#capCmsWinScore').value),loseScore:Number($('#capCmsLoseScore').value),renameCooldownMinutes:Number($('#capCmsRenameCooldown').value),rewards};
          const result=await api('admin/captain/settings',{method:'PATCH',body:JSON.stringify(payload)});
          if(!result?.ok)throw new Error(result?.error||'설정 저장 응답이 올바르지 않습니다.');
          alert('대장전 설정을 저장했습니다.');
          await load();
        }catch(error){alert(`대장전 설정 저장 실패\n${error.message}`)}finally{save.disabled=false;save.textContent=original}
      };
    }
    if(refresh&&!refresh.dataset.captainBound){refresh.dataset.captainBound='1';refresh.onclick=load}
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
