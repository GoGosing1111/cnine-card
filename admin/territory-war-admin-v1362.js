(()=>{
  const token=()=>localStorage.getItem('cnine_admin_token')||'';
  async function api(path,options={}){const response=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json','authorization':`Bearer ${token()}`,...(options.headers||{})}}),data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(data.error||'요청 실패');Object.assign(error,data,{status:response.status});throw error}return data}
  const CACHE_MS=30000,pendingKeys=new Map();let loadedAt=0,loadPromise=null,currentRoundId=0,busy='',triggerLoad=()=>{};
  const visible=()=>{const view=document.getElementById('view-territorywar');return Boolean(view&&!view.hidden&&!document.getElementById('cms')?.hidden)};
  const opKey=action=>{let key=pendingKeys.get(action);if(!key){key=`TW3_${action}:${crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;pendingKeys.set(action,key)}return key};
  function mount(){
    const root=document.getElementById('territoryWarAdminRoot');if(!root||document.getElementById('territoryWarAdminV1402'))return;
    root.innerHTML='';const box=document.createElement('section');box.id='territoryWarAdminV1402';box.className='panel';box.innerHTML=`
      <div class="maintenanceHead"><div><small>TERRITORY WAR V3 · BATTLE ENGINE V2</small><h2>영토전 전선 공성 관리</h2><p>A·B 진영 참가자를 매칭해 V2 전투를 실행하고, 승리 진영이 상대 공성 HP를 감소시킵니다.</p></div><button id="tw3Reload" class="ghost">새로고침</button></div>
      <div class="formgrid">
        <label class="field"><span>운영 모드</span><select id="tw3Mode"><option>OFF</option><option>TEST</option><option>ON</option></select></label>
        <label class="field"><span>영토전 이름</span><input id="tw3BattleName" type="text" maxlength="40" placeholder="예: 오렌성 전투"></label>
        <label class="field"><span>A팀 표시 이름</span><input id="tw3TeamAName" type="text" maxlength="20" placeholder="예: 수호 연합"></label>
        <label class="field"><span>B팀 표시 이름</span><input id="tw3TeamBName" type="text" maxlength="20" placeholder="예: 침공 연합"></label>
        <label class="field"><span>모집 시간(시간)</span><input id="tw3Recruit" type="number" min="1"></label>
        <label class="field"><span>전투 준비 시간(분)</span><input id="tw3Prep" type="number" min="0"></label>
        <label class="field"><span>회차 제한 시간(분)</span><input id="tw3Round" type="number" min="10"></label>
        <label class="field"><span>최소 참가 인원</span><input id="tw3MinParticipants" type="number" min="2"></label>
        <label class="field"><span>개인 행동력 최대</span><input id="tw3EnergyMax" type="number" min="1"></label>
        <label class="field"><span>행동력 회복 간격(분)</span><input id="tw3EnergyMinutes" type="number" min="1"></label>
        <label class="field"><span>공격 1회 행동력 비용</span><input id="tw3EnergyCost" type="number" min="1"></label>
        <label class="field"><span>실시간 갱신 간격(초)</span><input id="tw3Poll" type="number" min="2" max="15"></label>
      </div>
      <div class="panel" style="margin-top:14px;border:1px solid #385a7d;background:linear-gradient(180deg,#0e1c2d,#09131f)">
        <div class="maintenanceHead"><div><small>SIEGE HP</small><h3>거점별 공성 체력</h3><p>중앙 기본 HP에 거점 종류별 배수를 곱합니다. 양 팀은 현재 교전지에서 동일한 최대 HP로 시작합니다.</p></div></div>
        <div class="formgrid">
          <label class="field"><span>중앙 기본 공성 HP</span><input id="tw3BaseHp" type="number" min="1000"></label>
          <label class="field"><span>전초기지 HP 배수</span><input id="tw3OutpostHp" type="number" min="1" step="0.1"></label>
          <label class="field"><span>중간거점 HP 배수</span><input id="tw3MidHp" type="number" min="1" step="0.1"></label>
          <label class="field"><span>최종관문 HP 배수</span><input id="tw3GateHp" type="number" min="1" step="0.1"></label>
          <label class="field"><span>본진 HP 배수</span><input id="tw3HomeHp" type="number" min="1" step="0.1"></label>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="maintenanceHead"><div><small>V2 SIEGE DAMAGE</small><h3>V2 승리 공성 피해</h3><p>참가자끼리 V2 전투를 진행한 뒤 승리한 덱 전투력의 제곱근에 피해 계수를 적용합니다. 패배 진영의 공성 HP가 감소합니다.</p></div></div>
        <div class="formgrid">
          <label class="field"><span>피해 계수</span><input id="tw3DamageScale" type="number" min="0.1" step="0.1"></label>
          <label class="field"><span>최소 1회 피해</span><input id="tw3MinDamage" type="number" min="1"></label>
          <label class="field"><span>최대 1회 피해</span><input id="tw3MaxDamage" type="number" min="1"></label>
          <label class="field"><span>피해 변동폭(±%)</span><input id="tw3Variance" type="number" min="0" max="40"></label>
          <label class="field"><span>최근 공격 표시 수</span><input id="tw3Recent" type="number" min="5" max="50"></label>
          <label class="field"><span>개인 교전 승리 코인</span><input id="tw3BattleWinCoin" type="number" min="0"><small>공격을 시작한 참가자가 승리했을 때 즉시 지급</small></label>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="maintenanceHead"><div><small>SETTLEMENT</small><h3>회차 정산 보상</h3></div></div>
        <div class="formgrid">
          <label class="field"><span>승리 진영 코인</span><input id="tw3Winner" type="number" min="0"></label>
          <label class="field"><span>패배 진영 코인</span><input id="tw3Loser" type="number" min="0"></label>
          <label class="field"><span>무승부 코인</span><input id="tw3Draw" type="number" min="0"></label>
          <label class="field"><span>참가 카드 조각</span><input id="tw3Shards" type="number" min="0"></label>
          <label class="field"><span>피해 1,000당 추가 코인</span><input id="tw3Contribution" type="number" min="0"></label>
          <label class="field"><span>기여 추가 코인 상한</span><input id="tw3ContributionMax" type="number" min="0"></label>
          <label class="field"><span>보상 최소 공격 횟수</span><input id="tw3MinAttacks" type="number" min="0"></label>
        </div>
      </div>
      <div class="bar" style="flex-wrap:wrap;margin-top:14px"><button id="tw3Save">전체 설정 저장</button><button id="tw3ResetRecruit" class="ghost">편성 대기시간 리셋</button><button id="tw3Start">모집 강제마감·진영 편성</button><select id="tw3ForceWinner"><option value="">강제 종료 승리팀 선택</option><option value="A">A 진영 승리</option><option value="B">B 진영 승리</option><option value="DRAW">무승부</option></select><button id="tw3Finish" class="danger">선택 결과로 강제 종료</button></div>
      <div id="tw3State" class="inlineNotice">메뉴 진입 시 상태를 불러옵니다.</div>
      <div id="tw3TeamSummary" class="panel" style="margin-top:14px"></div>`;
    root.appendChild(box);const q=id=>box.querySelector('#'+id);
    const fields={mode:'tw3Mode',battleName:'tw3BattleName',teamAName:'tw3TeamAName',teamBName:'tw3TeamBName',recruitmentHours:'tw3Recruit',preparationMinutes:'tw3Prep',roundMinutes:'tw3Round',minParticipants:'tw3MinParticipants',energyMax:'tw3EnergyMax',energyMinutes:'tw3EnergyMinutes',attackEnergyCost:'tw3EnergyCost',realtimePollSeconds:'tw3Poll',baseSiegeHp:'tw3BaseHp',outpostHpMultiplier:'tw3OutpostHp',midHpMultiplier:'tw3MidHp',gateHpMultiplier:'tw3GateHp',homeHpMultiplier:'tw3HomeHp',damageScale:'tw3DamageScale',minDamage:'tw3MinDamage',maxDamage:'tw3MaxDamage',damageVariancePercent:'tw3Variance',recentActionLimit:'tw3Recent',individualBattleWinCoin:'tw3BattleWinCoin',winnerCoin:'tw3Winner',loserCoin:'tw3Loser',drawCoin:'tw3Draw',participationShards:'tw3Shards',contributionCoinPer1000Damage:'tw3Contribution',maxContributionCoin:'tw3ContributionMax',settlementMinAttacks:'tw3MinAttacks'};
    function setBusy(action=''){busy=action;['tw3Save','tw3ResetRecruit','tw3Start','tw3Finish','tw3Reload'].forEach(id=>{const button=q(id);if(button)button.disabled=Boolean(action)})}
    function teamNodeName(front,settings={}){const index=Number(front?.node_index??4),side=index<4?'A':index>4?'B':'',raw=String(front?.node_name||'');if(!side)return raw;const team=side==='A'?String(settings.teamAName||'A 진영'):String(settings.teamBName||'B 진영'),suffix=raw.replace(new RegExp(`^${side}(?:팀)?\\s*`),'').trim();return`${team} ${suffix}`.trim()}
    function renderTeamSummary(state,settings={}){const aName=String(settings?.teamAName||'A 진영'),bName=String(settings?.teamBName||'B 진영'),round=state?.round||{},front=state?.front||{},users=state?.adminUsers||[],a=users.filter(row=>row.side==='A'),b=users.filter(row=>row.side==='B');q('tw3TeamSummary').innerHTML=`<div class="maintenanceHead"><div><small>LIVE FRONT</small><h3>${teamNodeName(front,settings)||'교전지 준비 중'}</h3><p>현재 전선 ${Number(round.current_front_index??4)+1}/9 · ${aName} ${Number(front.a_hp||0).toLocaleString()} / ${Number(front.a_max_hp||0).toLocaleString()} · ${bName} ${Number(front.b_hp||0).toLocaleString()} / ${Number(front.b_max_hp||0).toLocaleString()}</p></div></div><div class="formgrid"><div class="inlineNotice"><b>${aName} ${a.length}명</b><span>총 전투력 ${a.reduce((sum,row)=>sum+Number(row.deck_power||0),0).toLocaleString()} · 누적 피해 ${Number(round.a_total_damage||0).toLocaleString()}</span></div><div class="inlineNotice"><b>${bName} ${b.length}명</b><span>총 전투력 ${b.reduce((sum,row)=>sum+Number(row.deck_power||0),0).toLocaleString()} · 누적 피해 ${Number(round.b_total_damage||0).toLocaleString()}</span></div></div>`}
    async function load(force=false){if(!visible())return;if(!force&&loadedAt&&Date.now()-loadedAt<CACHE_MS)return;if(loadPromise)return loadPromise;q('tw3State').textContent='불러오는 중...';loadPromise=(async()=>{try{const data=await api('admin/territory-war/settings'),settings=data.settings||{},state=data.state||{},round=state.round||{},front=state.front||{};currentRoundId=Number(round.id||0);for(const[key,id]of Object.entries(fields))if(q(id))q(id).value=settings[key]??'';const battleName=String(round.battle_name||settings.battleName||'').trim()||`제${round.id||'-'}회 영토전`;q('tw3State').textContent=String(settings.mode||'OFF')==='OFF'?'영토전 운영 중지 · 신규 모집과 공성 공격이 차단되었습니다.':`${battleName} · ${round.status||'-'} · 참가 ${state.counts?.total||0}명 · 현재 전선 ${teamNodeName(front,settings)||'-'} · A ${Number(front.a_hp||0).toLocaleString()} : ${Number(front.b_hp||0).toLocaleString()} B`;q('tw3Start').disabled=String(settings.mode||'OFF')==='OFF'||Boolean(busy);q('tw3Finish').disabled=String(settings.mode||'OFF')==='OFF'||Boolean(busy);renderTeamSummary(state,settings);loadedAt=Date.now()}catch(error){q('tw3State').textContent=error.message}finally{loadPromise=null}})();return loadPromise}
    triggerLoad=load;
    async function operation(action,path,extra={}){if(busy)return;setBusy(action);try{await api(path,{method:'POST',body:JSON.stringify({operationKey:opKey(action),roundId:currentRoundId||null,...extra})});pendingKeys.delete(action);loadedAt=0;await load(true)}catch(error){alert(error.message)}finally{setBusy('')}}
    q('tw3Reload').onclick=()=>load(true);const topReload=document.getElementById('twAdminTopReload');if(topReload)topReload.onclick=()=>load(true);
    q('tw3Save').onclick=async()=>{if(busy)return;setBusy('SAVE');try{const body={};for(const[key,id]of Object.entries(fields))body[key]=q(id).value;await api('admin/territory-war/settings',{method:'POST',body:JSON.stringify(body)});loadedAt=0;await load(true);alert('영토전 V3 설정 저장 완료')}catch(error){alert(error.message)}finally{setBusy('')}};
    q('tw3ResetRecruit').onclick=async()=>{if(busy||!confirm(`현재 모집 종료시각을 지금부터 ${q('tw3Recruit').value||3}시간 뒤로 초기화합니까?`))return;setBusy('RESET_RECRUITMENT');try{await api('admin/territory-war/reset-recruitment',{method:'POST',body:'{}'});loadedAt=0;await load(true);alert('편성 대기시간을 초기화했습니다.')}catch(error){alert(error.message)}finally{setBusy('')}};
    q('tw3Start').onclick=async()=>{if(!confirm('모집을 마감하고 A·B 진영을 자동 편성합니까?'))return;await operation('START','admin/territory-war/start')};
    q('tw3Finish').onclick=async()=>{const winnerSide=String(q('tw3ForceWinner').value||'');if(!winnerSide)return alert('강제 종료할 승리팀을 먼저 선택하세요.');const label=winnerSide==='A'?String(q('tw3TeamAName').value||'A 진영'):winnerSide==='B'?String(q('tw3TeamBName').value||'B 진영'):'무승부';if(!confirm(`${label} 결과로 현재 회차를 즉시 정산합니까?\n이 선택은 보상 정산에 직접 반영됩니다.`))return;await operation('FINISH','admin/territory-war/finish',{winnerSide})};
    if(visible())void load(false);
  }
  new MutationObserver(()=>{mount();if(visible())void triggerLoad(false)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  addEventListener('load',()=>{mount();if(visible())void triggerLoad(false)});mount();if(visible())void triggerLoad(false);
})();
