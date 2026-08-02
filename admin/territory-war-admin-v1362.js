(()=>{
  const token=()=>localStorage.getItem('cnine_admin_token')||'';
  async function api(path,options={}){
    const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token(),...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||'요청 실패');
    return data;
  }
  function mount(){
    const root=document.getElementById('territoryWarAdminRoot');
    if(!root||document.getElementById('territoryWarAdminV1364')) return;
    root.innerHTML='';
    const box=document.createElement('section');
    box.id='territoryWarAdminV1364';
    box.className='panel';
    box.innerHTML=`
      <div class="maintenanceHead">
        <div><small>TERRITORY WAR V1364</small><h2>영토전 운영 관리</h2><p>신청자를 A·B 진영으로 균형 배정하고 3인 소대로 편성하는 V2 기반 영토전입니다.</p></div>
        <button id="twAdminReload" class="ghost" type="button">새로고침</button>
      </div>
      <div class="formgrid">
        <label class="field"><span>운영 모드</span><select id="twMode"><option>OFF</option><option>TEST</option><option>ON</option></select></label>
        <label class="field"><span>회차 시간(분)</span><input id="twRoundMinutes" type="number" min="5" max="1440"></label>
        <label class="field"><span>행동력 최대</span><input id="twEnergyMax" type="number" min="1" max="50"></label>
        <label class="field"><span>충전 간격(분)</span><input id="twEnergyMinutes" type="number" min="1" max="1440"></label>
        <label class="field"><span>일반 영토 필요 승리</span><input id="twNormalWins" type="number" min="1" max="100"></label>
        <label class="field"><span>중앙 거점 필요 승리</span><input id="twCenterWins" type="number" min="1" max="100"></label>
      </div>
      <div class="bar" style="flex-wrap:wrap">
        <button id="twSave" type="button">설정 저장</button>
        <button id="twStart" type="button">모집 마감·전쟁 시작</button>
        <button id="twFinish" class="danger" type="button">회차 종료·신규 모집</button>
      </div>
      <div id="twAdminState" class="inlineNotice">불러오는 중...</div>`;
    root.appendChild(box);
    const q=id=>box.querySelector('#'+id);
    async function load(){
      q('twAdminState').textContent='불러오는 중...';
      try{
        const data=await api('admin/territory-war/settings');
        const settings=data.settings||{};
        const round=(data.state&&data.state.round)||{};
        q('twMode').value=settings.mode||'OFF';
        q('twRoundMinutes').value=settings.roundMinutes??60;
        q('twEnergyMax').value=settings.energyMax??5;
        q('twEnergyMinutes').value=settings.energyMinutes??15;
        q('twNormalWins').value=settings.normalCaptureWins??2;
        q('twCenterWins').value=settings.centerCaptureWins??3;
        const registrations=Array.isArray(data.state&&data.state.registrations)?data.state.registrations.length:0;
        q('twAdminState').textContent=`회차 #${round.id??'-'} · ${round.status||'준비'} · 신청 ${registrations}명 · A ${round.a_score||0} : ${round.b_score||0} B`;
      }catch(error){
        q('twAdminState').textContent=error.message;
      }
    }
    q('twAdminReload').onclick=load;
    const topReload=document.getElementById('twAdminTopReload');
    if(topReload) topReload.onclick=load;
    q('twSave').onclick=async()=>{
      try{
        await api('admin/territory-war/settings',{method:'POST',body:JSON.stringify({
          mode:q('twMode').value,
          roundMinutes:q('twRoundMinutes').value,
          energyMax:q('twEnergyMax').value,
          energyMinutes:q('twEnergyMinutes').value,
          normalCaptureWins:q('twNormalWins').value,
          centerCaptureWins:q('twCenterWins').value
        })});
        await load();
        alert('영토전 설정 저장 완료');
      }catch(error){alert(error.message)}
    };
    q('twStart').onclick=async()=>{
      if(!confirm('신청자를 진영·소대로 편성하고 영토전을 시작합니까?')) return;
      try{await api('admin/territory-war/start',{method:'POST',body:'{}'});await load()}catch(error){alert(error.message)}
    };
    q('twFinish').onclick=async()=>{
      if(!confirm('현재 영토전 회차를 종료하고 신규 모집 회차를 만듭니까?')) return;
      try{await api('admin/territory-war/finish',{method:'POST',body:'{}'});await load()}catch(error){alert(error.message)}
    };
    load();
  }
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('load',mount);
  mount();
})();
