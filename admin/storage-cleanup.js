(()=>{
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  let candidates=[],lastCriteria=null;
  const token=()=>localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  async function request(path,opt={}){const r=await fetch('../api/'+path,{...opt,headers:{'content-type':'application/json','authorization':'Bearer '+token(),...(opt.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'요청 실패');return d}
  const fmt=n=>Number(n||0).toLocaleString(),bytes=n=>{if(n===null||n===undefined||n==='')return '조회 불가';n=Number(n);if(!Number.isFinite(n))return '조회 불가';const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i>1?2:0)} ${u[i]}`};
  function busy(btn,on,text='처리 중...'){if(!btn)return;btn.disabled=on;if(!btn.dataset.old)btn.dataset.old=btn.textContent;btn.textContent=on?text:btn.dataset.old}
  function criteria(){return {dormantDays:Math.max(1,Number($('#cleanupDormantDays').value)||7)}}
  async function loadSummary(){const b=$('#cleanupSummaryBtn');busy(b,true);try{const d=await request('admin/storage-cleanup/summary');$('#cleanupDbSize').textContent=bytes(d.pages?.sizeBytes);$('#cleanupReusable').textContent=bytes(d.pages?.reusableBytes);$('#cleanupUserCount').textContent=fmt(d.userCount);$('#cleanupBatchLimit').textContent=`${d.limits?.deleteBatch||10}명`;$('#cleanupSummaryState').textContent=d.pages?.sizeSource==='D1_META'?'D1 실제 파일 크기 기준 · 삭제 후 빈 페이지는 신규 데이터에 재사용됩니다.':'DB 용량을 조회하지 못했습니다. Cloudflare D1 대시보드 수치를 확인하세요.'}catch(e){alert(e.message)}finally{busy(b,false)}}
  const tableNames={user_cards:'카드 보유',draw_logs:'카드 추첨 기록',draw_request_receipts:'구형 대형 영수증',draw_request_receipts_v2:'신규 경량 영수증',coin_logs:'코인 기록',shard_logs:'조각 기록',inventory_logs:'인벤토리 기록',battle_logs:'PVE 기록',raid_damage_logs:'레이드 피해 기록',cube_drop_receipts:'큐브 영수증',user_messages:'메시지',pvp_match_history:'PVP 전투 기록',captain_match_history_v2:'대장전 기록 v2',captain_match_history_v3:'대장전 기록 v3',captain_match_receipts_v3:'대장전 영수증 v3'};
  function renderCandidates(d){candidates=d.candidates||[];const box=$('#cleanupCandidateList'),days=Number(d.criteria?.dormantDays||criteria().dormantDays),x=d.excluded||{};$('#cleanupCandidateMeta').textContent=`${fmt(days)}일 이상 미접속 후보 ${fmt(candidates.length)}명${d.truncated?' · 최대 200명 표시':''}`;$('#cleanupEstimate').textContent=`최근 활동·유효 세션 ${fmt(Number(x.recentActivity||0)+Number(x.activeSession||0))}명, LIMITED 이상 ${fmt(x.limitedOrHigher||0)}명, +8강 이상 ${fmt(x.enhancedEightOrHigher||0)}명 자동 제외`;box.innerHTML=`<div class="storageCandidate head"><span><input id="cleanupSelectAll" type="checkbox"></span><span>닉네임 / 최종 활동</span><span>보유 카드 종류</span><span>보유 코인</span></div>`+candidates.map(u=>`<label class="storageCandidate" data-id="${u.id}"><span><input class="cleanupUserCheck" type="checkbox" value="${u.id}" checked></span><b>${escapeHtml(u.nickname)}<small>${escapeHtml(u.activity_at||u.created_at||'')}</small></b><span>${fmt(u.card_count)}</span><span>${fmt(u.coin)}</span></label>`).join('');if(!candidates.length)box.innerHTML+='<div class="storageEmpty">보호 조건을 제외한 삭제 후보가 없습니다.</div>';$('#cleanupSelectAll')?.addEventListener('change',e=>$$('.cleanupUserCheck').forEach(x=>x.checked=e.target.checked));updateSelected()}
  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function updateSelected(){const n=$$('.cleanupUserCheck:checked').length;$('#cleanupSelectedCount').textContent=`선택 ${n}명`}
  async function preview(){const b=$('#cleanupPreviewBtn');busy(b,true,'후보 분석 중...');try{lastCriteria=criteria();const d=await request('admin/storage-cleanup/preview',{method:'POST',body:JSON.stringify({criteria:lastCriteria})});renderCandidates(d)}catch(e){alert(e.message)}finally{busy(b,false)}}
  async function purgeSelected(){let ids=$$('.cleanupUserCheck:checked').map(x=>Number(x.value));if(!ids.length)return alert('삭제할 후보를 선택하세요.');const phrase=prompt(`선택한 ${ids.length}명의 계정과 연관 데이터를 영구 삭제합니다.\n최근 활동·유효 세션·LIMITED 이상·+8강 이상 보유 계정은 서버가 삭제 직전에 다시 차단합니다.\n\n계속하려면 휴면계정삭제 를 입력하세요.`,'');if(phrase!=='휴면계정삭제')return alert('삭제를 취소했습니다.');const btn=$('#cleanupDeleteBtn');busy(btn,true,'배치 삭제 중...');let done=0,total=ids.length;try{while(ids.length){const chunk=ids.splice(0,10),d=await request('admin/storage-cleanup/delete',{method:'POST',body:JSON.stringify({ids:chunk,criteria:lastCriteria||criteria(),confirmation:'휴면계정삭제'})});done+=Number(d.deletedUsers||0);chunk.forEach(id=>$(`.storageCandidate[data-id="${id}"]`)?.remove());const pct=Math.min(100,done/total*100);$('#cleanupProgressBar').style.width=pct+'%';$('#cleanupProgressText').textContent=`${done} / ${total}명 삭제 완료 · 현재 단계 ${Object.entries(d.changes||{}).filter(([,v])=>v).map(([k,v])=>`${k} ${v}`).slice(0,3).join(', ')}`}
      alert(`${done}명의 휴면·저활동 계정을 정리했습니다.\nDB 대시보드 용량 반영은 지연될 수 있으며 삭제된 페이지는 신규 데이터에 재사용됩니다.`);await loadSummary();
    }catch(e){alert(`정리 작업이 중단되었습니다. 완료된 배치는 유지됩니다.\n${e.message}`)}finally{busy(btn,false);updateSelected()}}
  const safeDefaults={SHARD_DUPLICATE:3,COIN_PACK_DRAW:14,BATTLE_HISTORY:7,PVP_HISTORY:14};
  function safeOpts(){
    const targetRows=Math.max(10000,Math.min(1000000,Number($('#cleanupSafeTarget').value)||250000));
    return {
      logType:$('#cleanupSafeTable').value,
      retentionDays:Math.max(2,Number($('#cleanupSafeDays').value)||3),
      targetRows,
      scanBatch:10000,
      sessionRetentionDays:Math.max(1,Number($('#cleanupSafeSessionDays').value)||7),
      cleanupExpiredSessions:$('#cleanupSafeSessions').checked
    };
  }
  function safeResultHtml(logs={},sessions={}){
    const candidate=Number(logs.candidateRows||0),sessionRows=Number(sessions.eligibleRows??sessions.deletedRows??0),scanned=Number(logs.scannedRows||0);
    if(!scanned&&!candidate&&!sessionRows)return '현재 조건에 안전 정리할 데이터가 없습니다.';
    return `다음 구간 검사 <b>${fmt(scanned)}</b>행 · 삭제 가능 <b>${fmt(candidate)}</b>행 · 행 데이터 추정 <b>${bytes(logs.estimatedStorageBytes||0)}</b><br><small>${escapeHtml(logs.description||'현재 잔액과 보유 데이터는 유지됩니다.')} · 현재 테이블 생성 번호 ${fmt(logs.highestSequence||0)} · 만료 세션 ${fmt(sessionRows)}건</small>`;
  }
  async function previewSafeCleanup(){
    const b=$('#cleanupSafePreviewBtn');busy(b,true,'안전 정리 분석 중...');
    try{
      const d=await request('admin/storage-cleanup/safe/preview',{method:'POST',body:JSON.stringify(safeOpts())});
      $('#cleanupSafePreview').innerHTML=safeResultHtml(d.logs,d.sessions);
      $('#cleanupSafeRunBtn').disabled=!(Number(d.logs?.candidateRows||0)||Number(d.sessions?.eligibleRows||0)||Number(d.logs?.scannedRows||0));
    }catch(e){alert(e.message)}finally{busy(b,false)}
  }
  async function runSafeCleanup(){
    const opts=safeOpts(),selected=$('#cleanupSafeTable')?.selectedOptions?.[0]?.textContent||'선택 로그';
    const phrase=prompt(`${selected}의 오래된 감사·전투 로그만 분할 삭제합니다.\n유저 보유 카드·강화·코인·카드 조각·인벤토리·덱·랭킹 점수·원정 진행도는 수정하지 않습니다.\n\n계속하려면 안전정리 를 입력하세요.`,'');
    if(phrase!=='안전정리')return;
    const b=$('#cleanupSafeRunBtn');busy(b,true,'안전 정리 준비 중...');
    const runId=`safe-log-cleanup-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let advanced=0,scanned=0,deleted=0,estimated=0,sessionsDeleted=0,batches=0;
    try{
      while(advanced<opts.targetRows){
        busy(b,true,`안전 정리 중 ${fmt(advanced)} / ${fmt(opts.targetRows)}`);
        const d=await request('admin/storage-cleanup/safe/run',{method:'POST',body:JSON.stringify({...opts,confirmation:'안전정리',bulkRun:true,runId})});
        const l=d.logs||{},s=d.sessions||{};
        scanned+=Number(l.scannedRows||0);advanced+=Number(l.advancedRows||0);deleted+=Number(l.deletedRows||0);estimated+=Number(l.estimatedStorageBytes||0);sessionsDeleted+=Number(s.deletedRows||0);batches++;
        const pct=opts.targetRows?Math.min(100,advanced/opts.targetRows*100):100;
        $('#cleanupSafePreview').innerHTML=`안전 정리 진행 중 <b>${fmt(advanced)} / ${fmt(opts.targetRows)}</b>행 검사 · ${fmt(batches)}회 분할<br><div class="storageProgress"><i style="width:${pct}%"></i></div><small>로그 ${fmt(deleted)}행 삭제 · 행 데이터 추정 ${bytes(estimated)} · 만료 세션 ${fmt(sessionsDeleted)}건 삭제</small>`;
        if(l.cycleComplete||(!Number(l.advancedRows||0)&&!Number(s.deletedRows||0)))break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      alert(`안전 정리를 완료했습니다.\n\n검사 행: ${fmt(scanned)}\n삭제 로그: ${fmt(deleted)}행\n삭제 행 데이터 추정: ${bytes(estimated)}\n만료 세션 삭제: ${fmt(sessionsDeleted)}건\n\n유저 보유 카드·강화·코인·카드 조각·인벤토리·덱·점수·진행 데이터는 변경하지 않았습니다.\nD1 파일 크기는 즉시 줄지 않을 수 있으며 비워진 페이지는 신규 데이터에 재사용됩니다.`);
      await previewSafeCleanup();await loadSummary();
    }catch(e){alert(`안전 정리가 중단되었습니다. 이미 완료된 배치는 유지됩니다.\n${e.message}`);try{await previewSafeCleanup()}catch{}}
    finally{busy(b,false)}
  }
  function captainCleanupOpts(){return {retentionDays:Math.max(2,Number($('#cleanupCaptainDays').value)||2),targetCount:Math.max(100,Math.min(5000,Number($('#cleanupCaptainTarget').value)||2500))}}
  function captainCountLabel(row={}){const count=Number(row.availableRows||0);return `${fmt(count)}건${row.countCapped?' 이상':''}`}
  function captainPreviewHtml(d={}){
    const history=d.history||{},receipts=d.receipts||{},total=Number(history.availableRows||0)+Number(receipts.availableRows||0);
    if(!total)return '현재 조건에 정리할 종료 회차 대장전 v3 기록·영수증이 없습니다.';
    return `종료 회차 상세 전투 기록 <b>${captainCountLabel(history)}</b> · 완료·실패 영수증 <b>${captainCountLabel(receipts)}</b><br><small>다음 표본 ${fmt(Number(history.sampleRows||0)+Number(receipts.sampleRows||0))}건의 JSON 약 ${bytes(Number(history.samplePayloadBytes||0)+Number(receipts.samplePayloadBytes||0))} · ACTIVE 회차와 PENDING 영수증은 서버에서 강제 보호합니다.</small>`;
  }
  async function previewCaptainCleanup(){
    const b=$('#cleanupCaptainPreviewBtn');busy(b,true,'대장전 정리 분석 중...');
    try{const d=await request('admin/storage-cleanup/captain/preview',{method:'POST',body:JSON.stringify(captainCleanupOpts())});$('#cleanupCaptainPreview').innerHTML=captainPreviewHtml(d);$('#cleanupCaptainRunBtn').disabled=!(Number(d.history?.availableRows||0)||Number(d.receipts?.availableRows||0))}
    catch(e){alert(e.message)}finally{busy(b,false)}
  }
  async function runCaptainCleanup(){
    const opts=captainCleanupOpts(),target=opts.targetCount,serverBatch=100;
    const phrase=prompt(`종료된 대장전 회차의 v3 상세 전투 기록과 완료·실패 영수증을 각 테이블 최대 ${fmt(target)}건씩 분할 삭제합니다.\n현재 ACTIVE 회차와 처리 중(PENDING) 영수증은 삭제하지 않습니다.\n\n계속하려면 대장전정리 를 입력하세요.`,'');
    if(phrase!=='대장전정리')return;
    const b=$('#cleanupCaptainRunBtn');busy(b,true,'대장전 정리 준비 중...');
    const runId=`captain-v3-cleanup-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let historyDeleted=0,receiptsDeleted=0,batches=0,historyCursor=0,receiptCursor=0,historyDone=false,receiptsDone=false;
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const runBatch=async payload=>{
      let lastError=null;
      for(let attempt=0;attempt<4;attempt++){
        try{return await request('admin/storage-cleanup/captain/run',{method:'POST',body:JSON.stringify(payload)})}
        catch(e){lastError=e;if(attempt<3)await pause([600,1400,3000][attempt])}
      }
      throw lastError||new Error('대장전 정리 요청 실패');
    };
    try{
      while((historyDeleted<target&&!historyDone)||(receiptsDeleted<target&&!receiptsDone)){
        const historyBatchSize=!historyDone&&historyDeleted<target?Math.min(serverBatch,target-historyDeleted):0;
        const receiptBatchSize=!receiptsDone&&receiptsDeleted<target?Math.min(serverBatch,target-receiptsDeleted):0;
        busy(b,true,`대장전 정리 중 기록 ${fmt(historyDeleted)} / 영수증 ${fmt(receiptsDeleted)}`);
        const d=await runBatch({...opts,historyBatchSize,receiptBatchSize,historyCursor,receiptCursor,confirmation:'대장전정리',bulkRun:true,runId});
        const hd=Number(d.deleted?.history||0),rd=Number(d.deleted?.receipts||0),hp=d.progress?.history||{},rp=d.progress?.receipts||{};
        historyDeleted+=hd;receiptsDeleted+=rd;batches++;
        historyCursor=Math.max(historyCursor,Number(hp.cursor||0));receiptCursor=Math.max(receiptCursor,Number(rp.cursor||0));
        historyDone=historyBatchSize<=0||Boolean(hp.cycleComplete)||historyDeleted>=target;
        receiptsDone=receiptBatchSize<=0||Boolean(rp.cycleComplete)||receiptsDeleted>=target;
        const pct=Math.min(100,Math.max(historyDeleted,receiptsDeleted)/target*100);
        $('#cleanupCaptainPreview').innerHTML=`대장전 v3 정리 진행 중 · 기록 <b>${fmt(historyDeleted)} / ${fmt(target)}</b> · 영수증 <b>${fmt(receiptsDeleted)} / ${fmt(target)}</b><br><div class="storageProgress"><i style="width:${pct}%"></i></div><small>${fmt(batches)}회 커서 분할 처리 · 오류 시 자동 재시도 · ACTIVE 회차 및 PENDING 영수증 보호 중</small>`;
        if((!hd&&!rd)&&(historyDone&&receiptsDone))break;
        await pause(batches%10===0?900:180);
      }
      // 내부 배치마다 감사 로그를 만들지 않고 실행 전체를 한 번만 기록한다.
      try{await runBatch({...opts,historyBatchSize:0,receiptBatchSize:0,historyCursor,receiptCursor,confirmation:'대장전정리',bulkRun:true,finalize:true,runId,summary:{historyDeleted,receiptsDeleted,batches}})}catch(e){console.error('captain cleanup final audit failed',e)}
      alert(`대장전 v3 대용량 기록 정리를 완료했습니다.\n\n상세 전투 기록: ${fmt(historyDeleted)}건\n완료·실패 영수증: ${fmt(receiptsDeleted)}건\n분할 처리: ${fmt(batches)}회\n\n현재 ACTIVE 회차와 PENDING 영수증은 유지했습니다.`);
      await previewCaptainCleanup();await loadSummary();
    }catch(e){alert(`대장전 v3 정리가 중단되었습니다. 이미 완료된 배치는 유지됩니다. 다시 실행하면 남은 대상부터 계속 정리됩니다.\n${e.message}`);try{await previewCaptainCleanup()}catch{}}
    finally{busy(b,false)}
  }
  function receiptOpts(){const targetCount=Math.max(100,Math.min(5000,Number($('#cleanupReceiptBatch').value)||1000));return {table:$('#cleanupReceiptTable').value,retentionDays:Number($('#cleanupReceiptDays').value),targetCount,batchSize:Math.min(500,targetCount)}}
  function receiptMetrics(d){return d.metrics||{receiptRows:d.rows?.length||0,responseJsonRows:0,responseJsonBytes:Number(d.estimatedBytes||0),receiptPayloadBytes:Number(d.estimatedBytes||0),assertionRows:0,assertionPayloadBytes:0,estimatedTextBytes:Number(d.estimatedBytes||0),estimatedStorageBytes:Number(d.estimatedBytes||0)}}
  async function previewReceipts(){const b=$('#cleanupReceiptPreviewBtn');busy(b,true);try{const opts=receiptOpts(),d=await request('admin/storage-cleanup/receipts/preview',{method:'POST',body:JSON.stringify(opts)}),m=receiptMetrics(d),count=Number(d.availableRows??m.receiptRows??0);$('#cleanupReceiptPreview').innerHTML=count?`한 번 클릭으로 <b>${fmt(count)}</b>건 정리 예정 · 서버에서 최대 500건씩 <b>${fmt(d.estimatedBatches||Math.ceil(count/500))}회</b> 자동 분할<br>삭제 대상 전체 추정 <b>${bytes(m.estimatedStorageBytes)}</b><br><small>응답 JSON ${fmt(m.responseJsonRows)}건 / ${bytes(m.responseJsonBytes)} · 영수증 행 텍스트 ${bytes(m.receiptPayloadBytes)} · 지급 검증 ${fmt(m.assertionRows)}건 / ${bytes(m.assertionPayloadBytes)}</small>`:'현재 조건에 정리할 완료·실패 영수증이 없습니다.';$('#cleanupReceiptDeleteBtn').disabled=!count}catch(e){alert(e.message)}finally{busy(b,false)}}
  async function purgeReceipts(){
    const opts=receiptOpts(),target=opts.targetCount;
    const phrase=prompt(`오래된 완료·실패 영수증을 최대 ${fmt(target)}건 자동 정리합니다.\n서버에서는 한 번에 최대 500건씩 나눠 처리하며 PENDING 요청은 삭제하지 않습니다.\n\n계속하려면 영수증정리 를 입력하세요.`,'');
    if(phrase!=='영수증정리')return;
    const b=$('#cleanupReceiptDeleteBtn');busy(b,true,'자동 정리 준비 중...');
    const totals=emptyReceiptTotals();let deleted=0,assertionsDeleted=0,batches=0,remaining=target;
    const runId=`receipt-purge-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    try{
      while(remaining>0){
        const batchSize=Math.min(500,remaining);
        busy(b,true,`영수증 삭제 중 ${fmt(deleted)} / ${fmt(target)}`);
        const d=await request('admin/storage-cleanup/receipts/delete',{method:'POST',body:JSON.stringify({table:opts.table,retentionDays:opts.retentionDays,batchSize,confirmation:'영수증정리',bulkRun:true,runId})});
        const count=Number(d.deleted||0),m=receiptMetrics(d);
        mergeReceiptTotals(totals,m);
        deleted+=count;assertionsDeleted+=Number(d.assertionsDeleted||0);batches++;
        remaining=Math.max(0,target-deleted);
        const pct=target?Math.min(100,deleted/target*100):100;
        $('#cleanupReceiptPreview').innerHTML=`자동 정리 진행 중 <b>${fmt(deleted)} / ${fmt(target)}</b>건 · ${fmt(batches)}회 분할 처리<br><div class="storageProgress"><i style="width:${pct}%"></i></div><small>현재 누적 추정 ${bytes(totals.estimatedStorageBytes)} · 지급 검증 ${fmt(assertionsDeleted)}건 삭제</small>`;
        if(!count||count<batchSize)break;
        await new Promise(resolve=>setTimeout(resolve,80));
      }
      alert(`${fmt(deleted)}건의 영수증을 ${fmt(batches)}회 분할해 정리했습니다.\n\n응답 JSON: ${fmt(totals.responseJsonRows)}건 / ${bytes(totals.responseJsonBytes)}\n영수증 행 텍스트: ${bytes(totals.receiptPayloadBytes)}\n지급 검증 기록: ${fmt(assertionsDeleted)}건 / ${bytes(totals.assertionPayloadBytes)}\n삭제 대상 전체 추정: ${bytes(totals.estimatedStorageBytes)}\n\n※ 위 수치는 행 데이터 추정치이며 D1 파일 용량 감소량과 동일하지 않습니다. 삭제된 페이지는 신규 데이터에 재사용될 수 있습니다.`);
      await previewReceipts();await loadSummary();
    }catch(e){
      alert(`영수증 정리가 중단되었습니다. 이미 완료된 ${fmt(deleted)}건은 유지됩니다.\n${e.message}`);
      try{await previewReceipts()}catch{}
    }finally{busy(b,false)}
  }
  function emptyReceiptTotals(){return {receiptRows:0,responseJsonRows:0,responseJsonBytes:0,receiptPayloadBytes:0,assertionRows:0,assertionProofBytes:0,assertionPayloadBytes:0,estimatedTextBytes:0,estimatedStorageBytes:0}}
  function mergeReceiptTotals(total,m){for(const key of Object.keys(total))total[key]+=Number(m?.[key]||0);return total}
  document.addEventListener('DOMContentLoaded',()=>{const syncOwnerVisibility=()=>{const role=String($('#roleBadge')?.textContent||'').trim().toUpperCase();if(role)$('#storageCleanupPanel').hidden=role!=='OWNER'};new MutationObserver(syncOwnerVisibility).observe($('#roleBadge'),{childList:true,subtree:true});syncOwnerVisibility();$('#cleanupSummaryBtn')?.addEventListener('click',loadSummary);$('#cleanupPreviewBtn')?.addEventListener('click',preview);$('#cleanupDeleteBtn')?.addEventListener('click',purgeSelected);$('#cleanupCandidateList')?.addEventListener('change',updateSelected);$('#cleanupSafeTable')?.addEventListener('change',()=>{$('#cleanupSafeDays').value=String(safeDefaults[$('#cleanupSafeTable').value]||7);$('#cleanupSafeRunBtn').disabled=true;$('#cleanupSafePreview').textContent='대상 확인 전입니다.'});$('#cleanupSafePreviewBtn')?.addEventListener('click',previewSafeCleanup);$('#cleanupSafeRunBtn')?.addEventListener('click',runSafeCleanup);$('#cleanupCaptainPreviewBtn')?.addEventListener('click',previewCaptainCleanup);$('#cleanupCaptainRunBtn')?.addEventListener('click',runCaptainCleanup);$('#cleanupReceiptPreviewBtn')?.addEventListener('click',previewReceipts);$('#cleanupReceiptDeleteBtn')?.addEventListener('click',purgeReceipts)});
})();
