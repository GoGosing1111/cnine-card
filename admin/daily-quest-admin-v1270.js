/* v1270: CMS 일일퀘스트 저장/새로고침 버튼 실제 DOM ID 연결 */
(()=>{
  const byIds=(...ids)=>ids.map(id=>document.getElementById(id)).find(Boolean)||null;
  const readNumber=(id,label,min,max)=>{
    const el=document.getElementById(id);
    const value=Number(el?.value);
    if(!Number.isFinite(value)||value<min||value>max){
      throw new Error(`${label}은(는) ${min}~${max} 범위로 입력하세요.`);
    }
    return Math.floor(value);
  };

  async function saveDailyQuestV1270(){
    const btn=byIds('saveDailyQuestBtn','saveDailyQuestSettingsBtn');
    if(btn?.disabled)return;
    try{
      const reward=readNumber('dqPostRewardCoin','게시글 보상 코인',0,1000000000);
      const settings={
        enabled:document.getElementById('dqEnabled')?.value==='1',
        postEnabled:document.getElementById('dqPostEnabled')?.value==='1',
        requiredPosts:readNumber('dqRequiredPosts','필요 게시글 수',1,200),
        postRewardCoin:reward,
        rewardCoin:reward,
        maxPages:readNumber('dqPostMaxPages','확인 페이지 수',1,20),
        checkCooldownSeconds:readNumber('dqCooldown','확인 대기시간',5,300),
        adminTestAllowed:document.getElementById('dqAdminTestAllowed')?.value==='1',
        boardUrl:'https://ygosu.com/board/soop'
      };
      setBusy(btn,true,'저장 중...');
      await api('admin/daily-quests',{method:'PATCH',body:JSON.stringify({settings})});
      alert('일일퀘스트 설정이 저장되었습니다.');
      await loadDailyQuestAdmin();
    }catch(error){
      alert(error?.message||'일일퀘스트 설정 저장 중 오류가 발생했습니다.');
    }finally{
      setBusy(btn,false);
    }
  }

  async function refreshDailyQuestV1270(){
    const btn=byIds('refreshDailyQuestBtn','refreshDailyQuestAdminBtn');
    if(btn?.disabled)return;
    try{
      setBusy(btn,true,'불러오는 중...');
      await loadDailyQuestAdmin();
    }catch(error){
      alert(error?.message||'일일퀘스트 현황을 불러오지 못했습니다.');
    }finally{
      setBusy(btn,false);
    }
  }

  function bindDailyQuestV1270(){
    const saveBtn=byIds('saveDailyQuestBtn','saveDailyQuestSettingsBtn');
    const refreshBtn=byIds('refreshDailyQuestBtn','refreshDailyQuestAdminBtn');
    if(saveBtn){
      saveBtn.type='button';
      saveBtn.onclick=saveDailyQuestV1270;
      saveBtn.dataset.dailyQuestBound='v1270';
    }
    if(refreshBtn){
      refreshBtn.type='button';
      refreshBtn.onclick=refreshDailyQuestV1270;
      refreshBtn.dataset.dailyQuestBound='v1270';
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindDailyQuestV1270,{once:true});
  else bindDailyQuestV1270();
  window.bindDailyQuestAdminControls=bindDailyQuestV1270;
})();
