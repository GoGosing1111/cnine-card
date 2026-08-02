(()=>{
 const token=()=>localStorage.getItem('cnine_admin_token')||'';
 async function api(path,opt={}){const r=await fetch('/api/'+path,{...opt,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token(),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'요청 실패');return d}
 function mount(){const root=document.getElementById('territoryWarAdminRoot');if(!root||document.getElementById('territoryWarAdminV1368'))return;root.innerHTML='';const box=document.createElement('section');box.id='territoryWarAdminV1368';box.className='panel';box.innerHTML=`
 <div class="maintenanceHead"><div><small>TERRITORY WAR V1368</small><h2>영토전 운영 관리</h2><p>운영 모드 OFF 시 모집·편성·전투가 즉시 중지되며, TEST/ON 전환 시 새 모집 회차가 시작됩니다.</p></div><button id="twReload" class="ghost">새로고침</button></div>
 <div class="formgrid">
  <label class="field"><span>운영 모드</span><select id="twMode"><option>OFF</option><option>TEST</option><option>ON</option></select></label>
  <label class="field"><span>모집 시간(시간)</span><input id="twRecruit" type="number" min="1"></label>
  <label class="field"><span>편성 공개·준비 시간(분)</span><input id="twPrep" type="number" min="0"></label>
  <label class="field"><span>영토전 진행 시간(분)</span><input id="twRound" type="number" min="10"></label>
  <label class="field"><span>소대 행동력 최대</span><input id="twEnergyMax" type="number" min="1"></label>
  <label class="field"><span>행동력 충전 간격(분)</span><input id="twEnergyMin" type="number" min="1"></label>
  <label class="field"><span>일반 적 영토 점령 승점</span><input id="twNormalWins" type="number" min="1"></label>
  <label class="field"><span>중앙 영토 점령 승점</span><input id="twCenterWins" type="number" min="1"></label>
  <label class="field"><span>소대전 승리 점수</span><input id="twBattlePoint" type="number" min="0"></label>
  <label class="field"><span>일반 영토 점령 점수</span><input id="twCapturePoint" type="number" min="0"></label>
  <label class="field"><span>중앙 영토 점령 점수</span><input id="twCenterCapturePoint" type="number" min="0"></label>
  <label class="field"><span>종료 시 일반 영토 점수</span><input id="twFinalNormal" type="number" min="0"></label>
  <label class="field"><span>종료 시 중앙 영토 점수</span><input id="twFinalCenter" type="number" min="0"></label>
  <label class="field"><span>종료 시 적 본진 인접 점수</span><input id="twFinalFrontier" type="number" min="0"></label>
  <label class="field"><span>무방비 영토 점령 대기(초)</span><input id="twCaptureSec" type="number" min="5"></label>
  <label class="field"><span>자동 지휘권 위임(분)</span><input id="twDelegate" type="number" min="1"></label>
  <label class="field"><span>최근 전투 보관 건수</span><input id="twRecent" type="number" min="10" max="200"></label>
  <label class="field"><span>승리 코인</span><input id="twWinner" type="number" min="0"></label>
  <label class="field"><span>패배 코인</span><input id="twLoser" type="number" min="0"></label>
  <label class="field"><span>참가 조각</span><input id="twShards" type="number" min="0"></label>
 </div>
 <div class="bar" style="flex-wrap:wrap"><button id="twSave">설정 저장</button><button id="twStart">모집 강제마감·편성</button><button id="twFinish" class="danger">회차 종료·신규 모집</button></div>
 <div id="twState" class="inlineNotice">불러오는 중...</div>
 <div class="panel" style="margin-top:14px"><h3>소대 지휘권 강제 지정</h3><div class="formgrid"><label class="field"><span>진영</span><select id="twCmdSide"><option>A</option><option>B</option></select></label><label class="field"><span>소대 번호</span><input id="twCmdSquad" type="number" min="1"></label><label class="field"><span>지휘 유저 ID</span><input id="twCmdUser" type="number" min="1"></label></div><button id="twCommander">지휘권 변경</button></div>`;root.appendChild(box);const q=id=>box.querySelector('#'+id);
 const ids={mode:'twMode',recruitmentHours:'twRecruit',preparationMinutes:'twPrep',roundMinutes:'twRound',energyMax:'twEnergyMax',energyMinutes:'twEnergyMin',normalCaptureWins:'twNormalWins',centerCaptureWins:'twCenterWins',battleWinPoints:'twBattlePoint',territoryCapturePoints:'twCapturePoint',centerCapturePoints:'twCenterCapturePoint',finalNormalPoints:'twFinalNormal',finalCenterPoints:'twFinalCenter',finalFrontierPoints:'twFinalFrontier',unguardedCaptureSeconds:'twCaptureSec',leaderDelegateMinutes:'twDelegate',recentBattleLimit:'twRecent',winnerCoin:'twWinner',loserCoin:'twLoser',participationShards:'twShards'};
 async function load(){q('twState').textContent='불러오는 중...';try{const d=await api('admin/territory-war/settings'),s=d.settings||{},r=d.state?.round||{};for(const[k,id]of Object.entries(ids))if(q(id))q(id).value=s[k]??'';const squads=d.state?.squads||[],orders=d.state?.orders||[];const off=String(s.mode||'OFF').toUpperCase()==='OFF';q('twState').textContent=off?'영토전 운영 중지 · 신규 모집/자동 편성/전투/점령이 모두 차단되었습니다.':`회차 #${r.id??'-'} · ${r.status||'-'} · 신청 ${(d.state?.registrations||[]).length}명 · 소대 ${squads.length}개 · 진행 작전 ${orders.length}개 · A ${r.a_score||0} : ${r.b_score||0} B`;q('twStart').disabled=off;q('twFinish').disabled=off;}catch(e){q('twState').textContent=e.message}}
 q('twReload').onclick=load;q('twSave').onclick=async()=>{try{const body={};for(const[k,id]of Object.entries(ids))body[k]=q(id).value;await api('admin/territory-war/settings',{method:'POST',body:JSON.stringify(body)});await load();alert('영토전 설정 저장 완료')}catch(e){alert(e.message)}};
 q('twStart').onclick=async()=>{if(!confirm('모집을 마감하고 진영·소대를 편성합니까? 준비 시간 후 자동 시작됩니다.'))return;try{await api('admin/territory-war/start',{method:'POST',body:'{}'});await load()}catch(e){alert(e.message)}};
 q('twFinish').onclick=async()=>{if(!confirm('현재 회차를 종료하고 신규 모집을 시작합니까?'))return;try{await api('admin/territory-war/finish',{method:'POST',body:'{}'});await load()}catch(e){alert(e.message)}};
 q('twCommander').onclick=async()=>{try{await api('admin/territory-war/commander',{method:'POST',body:JSON.stringify({side:q('twCmdSide').value,squadNo:q('twCmdSquad').value,userId:q('twCmdUser').value})});await load();alert('지휘권 변경 완료')}catch(e){alert(e.message)}};load();}
 new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});addEventListener('load',mount);mount();
})();
