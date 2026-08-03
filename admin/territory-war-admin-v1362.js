(()=>{
 const token=()=>localStorage.getItem('cnine_admin_token')||'';
 async function api(path,opt={}){const r=await fetch('/api/'+path,{...opt,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token(),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||'요청 실패');Object.assign(e,d,{status:r.status});throw e}return d}
 const CACHE_MS=30000,pendingOperationKeys=new Map();let loadedAt=0,loadPromise=null,currentRoundId=0,actionBusy='';
 const viewVisible=()=>{const view=document.getElementById('view-territorywar');return Boolean(view&&!view.hidden&&!document.getElementById('cms')?.hidden)};
 const operationKey=action=>{let key=pendingOperationKeys.get(action);if(!key){key=`TW_${action}:${crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;pendingOperationKeys.set(action,key)}return key};
 function mount(){const root=document.getElementById('territoryWarAdminRoot');if(!root||document.getElementById('territoryWarAdminV1378'))return;root.innerHTML='';const box=document.createElement('section');box.id='territoryWarAdminV1378';box.className='panel';box.innerHTML=`
 <div class="maintenanceHead"><div><small>TERRITORY WAR V1378</small><h2>영토전 운영 관리</h2><p>운영 모드 OFF 시 모집·편성·전투가 즉시 중지되며, TEST/ON 전환 시 새 모집 회차가 시작됩니다.</p></div><button id="twReload" class="ghost">새로고침</button></div>
 <div class="formgrid">
  <label class="field"><span>운영 모드</span><select id="twMode"><option>OFF</option><option>TEST</option><option>ON</option></select></label>
  <label class="field"><span>모집 시간(시간)</span><input id="twRecruit" type="number" min="1"></label>
  <label class="field"><span>편성 공개·준비 시간(분)</span><input id="twPrep" type="number" min="0"></label>
  <label class="field"><span>영토전 진행 시간(분)</span><input id="twRound" type="number" min="10"></label>
  <label class="field"><span>개인 행동력 최대</span><input id="twEnergyMax" type="number" min="1"></label>
  <label class="field"><span>개인 행동력 충전 간격(분)</span><input id="twEnergyMin" type="number" min="1"></label>
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
  <label class="field"><span>회차 승리 진영 코인</span><input id="twWinner" type="number" min="0"></label>
  <label class="field"><span>회차 패배 진영 코인</span><input id="twLoser" type="number" min="0"></label>
  <label class="field"><span>회차 무승부 코인</span><input id="twDraw" type="number" min="0"></label>
  <label class="field"><span>회차 참가 조각</span><input id="twShards" type="number" min="0"></label>
  <label class="field"><span>공헌도 1점당 추가 코인</span><input id="twContributionCoin" type="number" min="0"></label>
  <label class="field"><span>회차 보상 최소 실전 횟수</span><input id="twMinBattles" type="number" min="0"><small>승리+패배 합계 기준</small></label>
 </div>
 <div class="panel" style="margin-top:14px;border:1px solid #385a7d;background:linear-gradient(180deg,#0e1c2d,#09131f)">
  <div class="maintenanceHead"><div><small>DUEL WIN REWARD</small><h3 style="margin:5px 0">개별 전투 1승 보상</h3><p>영토전 V2 1대1 전투에서 실제 승리한 유저에게 즉시 지급됩니다. 무방비 영토 점령은 제외됩니다.</p></div></div>
  <div class="formgrid">
   <label class="field"><span>1승당 코인</span><input id="twDuelCoin" type="number" min="0" step="1"><small>0으로 설정하면 코인을 지급하지 않습니다.</small></label>
   <label class="field"><span>1승당 카드 조각</span><input id="twDuelShards" type="number" min="0" step="1"><small>0으로 설정하면 조각을 지급하지 않습니다.</small></label>
   <label class="field"><span>일일 최대 보상 횟수</span><input id="twDuelLimit" type="number" min="0" step="1"><small>0이면 제한 없이 승리할 때마다 지급합니다.</small></label>
  </div>
  <div class="inlineNotice">코인과 조각은 서로 독립적으로 저장되며 둘 중 하나만 지급하도록 설정할 수 있습니다.</div>
 </div>
 <div class="bar" style="flex-wrap:wrap"><button id="twSave">전체 설정 저장</button><button id="twStart">모집 강제마감·편성</button><button id="twFinish" class="danger">회차 종료·신규 모집</button></div>
 <div id="twState" class="inlineNotice">불러오는 중...</div>
 <div class="panel" style="margin-top:14px"><h3>소대 지휘권 강제 지정</h3><div class="formgrid"><label class="field"><span>진영</span><select id="twCmdSide"><option>A</option><option>B</option></select></label><label class="field"><span>소대 번호</span><input id="twCmdSquad" type="number" min="1"></label><label class="field"><span>지휘 유저 ID</span><input id="twCmdUser" type="number" min="1"></label></div><button id="twCommander">지휘권 변경</button></div>`;root.appendChild(box);const q=id=>box.querySelector('#'+id);
 const ids={mode:'twMode',recruitmentHours:'twRecruit',preparationMinutes:'twPrep',roundMinutes:'twRound',energyMax:'twEnergyMax',energyMinutes:'twEnergyMin',normalCaptureWins:'twNormalWins',centerCaptureWins:'twCenterWins',battleWinPoints:'twBattlePoint',territoryCapturePoints:'twCapturePoint',centerCapturePoints:'twCenterCapturePoint',finalNormalPoints:'twFinalNormal',finalCenterPoints:'twFinalCenter',finalFrontierPoints:'twFinalFrontier',unguardedCaptureSeconds:'twCaptureSec',leaderDelegateMinutes:'twDelegate',recentBattleLimit:'twRecent',individualWinCoin:'twDuelCoin',individualWinShards:'twDuelShards',individualWinDailyLimit:'twDuelLimit',winnerCoin:'twWinner',loserCoin:'twLoser',drawCoin:'twDraw',participationShards:'twShards',contributionCoinPerPoint:'twContributionCoin',settlementMinBattles:'twMinBattles'};
 async function load(force=false){if(!viewVisible())return;if(!force&&loadedAt&&Date.now()-loadedAt<CACHE_MS)return;if(loadPromise)return loadPromise;q('twState').textContent='불러오는 중...';loadPromise=(async()=>{try{const d=await api('admin/territory-war/settings'),s=d.settings||{},r=d.state?.round||{};currentRoundId=Number(r.id||0);for(const[k,id]of Object.entries(ids))if(q(id))q(id).value=s[k]??'';const squads=d.state?.squads||[],orders=d.state?.orders||[];const off=String(s.mode||'OFF').toUpperCase()==='OFF';q('twState').textContent=off?'영토전 운영 중지 · 신규 모집/자동 편성/전투/점령이 모두 차단되었습니다.':`회차 #${r.id??'-'} · ${r.status||'-'} · 신청 ${(d.state?.registrations||[]).length}명 · 소대 ${squads.length}개 · 진행 작전 ${orders.length}개 · A ${r.a_score||0} : ${r.b_score||0} B`;q('twStart').disabled=off||Boolean(actionBusy);q('twFinish').disabled=off||Boolean(actionBusy);loadedAt=Date.now();}catch(e){q('twState').textContent=e.message}finally{loadPromise=null}})();return loadPromise}
 function setActionBusy(action=''){actionBusy=action;['twStart','twFinish','twSave','twCommander'].forEach(id=>{const b=q(id);if(b)b.disabled=Boolean(action)});const top=document.getElementById('twAdminTopReload');if(top)top.disabled=Boolean(action)}
 async function runOperation(action,path){if(actionBusy)return;const key=operationKey(action);setActionBusy(action);try{await api(path,{method:'POST',body:JSON.stringify({operationKey:key,roundId:currentRoundId||null})});pendingOperationKeys.delete(action);loadedAt=0;await load(true)}catch(e){alert(e.message)}finally{setActionBusy('')}}

 q('twReload').onclick=()=>load(true);const top=document.getElementById('twAdminTopReload');if(top)top.onclick=()=>load(true);q('twSave').onclick=async()=>{if(actionBusy)return;setActionBusy('SAVE');try{const body={};for(const[k,id]of Object.entries(ids))body[k]=q(id).value;await api('admin/territory-war/settings',{method:'POST',body:JSON.stringify(body)});loadedAt=0;await load(true);alert('영토전 설정 저장 완료')}catch(e){alert(e.message)}finally{setActionBusy('')}};
 q('twStart').onclick=async()=>{if(!confirm('모집을 마감하고 진영·소대를 편성합니까? 준비 시간 후 자동 시작됩니다.'))return;await runOperation('START','admin/territory-war/start')};
 q('twFinish').onclick=async()=>{if(!confirm('현재 ACTIVE 회차를 종료하고 신규 모집을 시작합니까?'))return;await runOperation('FINISH','admin/territory-war/finish')};
 q('twCommander').onclick=async()=>{if(actionBusy)return;setActionBusy('COMMANDER');try{await api('admin/territory-war/commander',{method:'POST',body:JSON.stringify({side:q('twCmdSide').value,squadNo:q('twCmdSquad').value,userId:q('twCmdUser').value})});loadedAt=0;await load(true);alert('지휘권 변경 완료')}catch(e){alert(e.message)}finally{setActionBusy('')}};if(viewVisible())void load(false);}
 new MutationObserver(()=>{mount();if(viewVisible())void load(false)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});addEventListener('load',()=>{mount();if(viewVisible())void load(false)});mount();if(viewVisible())void load(false);
})();
