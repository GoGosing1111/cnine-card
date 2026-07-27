/* v1193: 차원의 균열 원정 독립 CMS · 보상 설정 서버 연결 */
(() => {
  const NODE_META={
    BATTLE:{icon:'⚔',label:'일반 전투'},
    ELITE:{icon:'◆',label:'정예 전투'},
    BOSS:{icon:'♛',label:'중간 보스'},
    FINAL_BOSS:{icon:'✦',label:'최종 보스'}
  };
  const defaults={
    enabled:true,maxDifficulty:10,weeklyRewardLimit:3,
    baseCoin:300,stageCoinIncrease:90,baseShards:4,baseCrystals:5,
    eventCrystalReward:20,riskCrystalReward:35,
    difficultyRewardPercent:Array.from({length:20},(_,i)=>(i+1)*100),
    difficultyCrystalBonus:Array.from({length:20},(_,i)=>i+1),
    nodeRewardPercent:{BATTLE:100,ELITE:160,BOSS:230,FINAL_BOSS:340},
    shardRewardPercent:{BATTLE:100,ELITE:150,BOSS:250,FINAL_BOSS:250}
  };
  let current={...defaults};

  const q=s=>document.querySelector(s);
  const number=(id,fallback=0)=>{const value=Number(q(id)?.value);return Number.isFinite(value)?value:fallback};
  const integer=(id,fallback=0)=>Math.floor(number(id,fallback));
  const safe=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

  function setView(){
    state.view='riftsettings';
    document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-riftsettings');
    document.querySelectorAll('#nav button').forEach(el=>el.classList.toggle('active',el.dataset.view==='riftsettings'));
    const title=q('#pageTitle');if(title)title.textContent='균열 원정 보상';
  }

  function renderStats(data){
    const s=data.stats||{};
    q('#riftAdminStats').innerHTML=[
      ['현재 주차',data.weekKey||'-','KST 월요일 초기화'],
      ['참여 유저',safe(s.participants).toLocaleString(),`원정 시작 ${safe(s.startedCount).toLocaleString()}회`],
      ['완료 원정',safe(s.completedCount).toLocaleString(),`보상 수령 ${safe(s.rewardCount).toLocaleString()}회`],
      ['진행 중',safe(s.activeCount).toLocaleString(),`실패 ${safe(s.failedCount).toLocaleString()}회`],
      ['최고 난이도',`${safe(s.highestDifficulty)}단계`,`수령 완료 ${safe(s.claimedCount).toLocaleString()}회`]
    ].map(([label,value,sub])=>`<article><small>${label}</small><b>${value}</b><span>${sub}</span></article>`).join('');
  }

  function renderNodeRows(settings){
    q('#riftNodeRewardRows').innerHTML=Object.entries(NODE_META).map(([key,meta])=>`<div class="riftRewardRow" data-node="${key}"><span><i>${meta.icon}</i><b>${meta.label}</b></span><label><input class="riftNodeMainPercent" type="number" min="0" max="10000" step="1" value="${safe(settings.nodeRewardPercent?.[key],defaults.nodeRewardPercent[key])}"><em>%</em></label><label><input class="riftNodeShardPercent" type="number" min="0" max="10000" step="1" value="${safe(settings.shardRewardPercent?.[key],defaults.shardRewardPercent[key])}"><em>%</em></label></div>`).join('');
  }

  function renderDifficultyRows(settings){
    q('#riftDifficultyRewardGrid').innerHTML=Array.from({length:20},(_,index)=>{
      const difficulty=index+1;
      const percent=safe(settings.difficultyRewardPercent?.[index],defaults.difficultyRewardPercent[index]);
      const crystal=safe(settings.difficultyCrystalBonus?.[index],defaults.difficultyCrystalBonus[index]);
      return `<article class="riftDifficultyRewardCard" data-difficulty="${difficulty}"><header><small>DIFFICULTY</small><b>${difficulty}</b><span>${difficulty<=3?'탐색':difficulty<=6?'심층':difficulty<=9?'극한':'붕괴'}</span></header><label><span>코인·조각 배율</span><div><input class="riftDifficultyPercent" type="number" min="0" max="10000" step="1" value="${percent}"><em>%</em></div></label><label><span>결정 추가값</span><div><input class="riftDifficultyCrystal" type="number" min="0" max="100000" step="1" value="${crystal}"><em>개</em></div></label><footer>${(percent/100).toFixed(2)}배</footer></article>`;
    }).join('');
    q('#riftDifficultyRewardGrid').querySelectorAll('.riftDifficultyPercent').forEach(input=>input.addEventListener('input',()=>{const card=input.closest('.riftDifficultyRewardCard');card.querySelector('footer').textContent=`${(safe(input.value)/100).toFixed(2)}배`;}));
    updateDifficultyVisibility();
  }

  function updateDifficultyVisibility(){
    const max=Math.max(1,Math.min(20,integer('#riftMaxDifficulty',10)));
    q('#riftDifficultyRewardGrid')?.querySelectorAll('[data-difficulty]').forEach(card=>card.classList.toggle('inactive',Number(card.dataset.difficulty)>max));
  }

  function render(data){
    current={...defaults,...(data.settings||{})};
    renderStats(data);
    q('#riftEnabled').value=current.enabled===false?'0':'1';
    q('#riftMaxDifficulty').value=safe(current.maxDifficulty,10);
    q('#riftWeeklyRewardLimit').value=safe(current.weeklyRewardLimit,3);
    q('#riftBaseCoin').value=safe(current.baseCoin,300);
    q('#riftStageCoinIncrease').value=safe(current.stageCoinIncrease,90);
    q('#riftBaseShards').value=safe(current.baseShards,4);
    q('#riftBaseCrystals').value=safe(current.baseCrystals,5);
    q('#riftEventCrystalReward').value=safe(current.eventCrystalReward,20);
    q('#riftRiskCrystalReward').value=safe(current.riskCrystalReward,35);
    renderNodeRows(current);
    renderDifficultyRows(current);
    const stateBadge=q('#riftAdminSaveState');
    if(stateBadge){stateBadge.textContent=current.enabled===false?'원정 중지':'원정 운영 중';stateBadge.classList.toggle('off',current.enabled===false);}
  }

  async function loadRiftAdmin(){
    const stats=q('#riftAdminStats');if(stats)stats.innerHTML='<div class="riftAdminLoading"><i></i><b>균열 원정 설정을 불러오는 중...</b></div>';
    const data=await api('admin/rift-settings');
    render(data);
    return data;
  }

  function collect(){
    const difficultyRewardPercent=[],difficultyCrystalBonus=[];
    q('#riftDifficultyRewardGrid').querySelectorAll('[data-difficulty]').forEach(card=>{
      const index=Number(card.dataset.difficulty)-1;
      difficultyRewardPercent[index]=safe(card.querySelector('.riftDifficultyPercent')?.value,defaults.difficultyRewardPercent[index]);
      difficultyCrystalBonus[index]=Math.floor(safe(card.querySelector('.riftDifficultyCrystal')?.value,defaults.difficultyCrystalBonus[index]));
    });
    const nodeRewardPercent={},shardRewardPercent={};
    q('#riftNodeRewardRows').querySelectorAll('[data-node]').forEach(row=>{
      const key=row.dataset.node;
      nodeRewardPercent[key]=safe(row.querySelector('.riftNodeMainPercent')?.value,defaults.nodeRewardPercent[key]);
      shardRewardPercent[key]=safe(row.querySelector('.riftNodeShardPercent')?.value,defaults.shardRewardPercent[key]);
    });
    return {
      enabled:q('#riftEnabled').value==='1',
      maxDifficulty:integer('#riftMaxDifficulty',10),
      weeklyRewardLimit:integer('#riftWeeklyRewardLimit',3),
      baseCoin:integer('#riftBaseCoin',300),
      stageCoinIncrease:integer('#riftStageCoinIncrease',90),
      baseShards:integer('#riftBaseShards',4),
      baseCrystals:integer('#riftBaseCrystals',5),
      eventCrystalReward:integer('#riftEventCrystalReward',20),
      riskCrystalReward:integer('#riftRiskCrystalReward',35),
      difficultyRewardPercent,difficultyCrystalBonus,nodeRewardPercent,shardRewardPercent
    };
  }

  function validate(settings){
    if(settings.maxDifficulty<1||settings.maxDifficulty>20)return '최대 난이도는 1~20으로 입력하세요.';
    if(settings.weeklyRewardLimit<1||settings.weeklyRewardLimit>20)return '주간 보상 횟수는 1~20으로 입력하세요.';
    const nonNegative=['baseCoin','stageCoinIncrease','baseShards','baseCrystals','eventCrystalReward','riskCrystalReward'];
    if(nonNegative.some(key=>!Number.isFinite(settings[key])||settings[key]<0))return '기본 보상은 0 이상의 숫자로 입력하세요.';
    if(settings.difficultyRewardPercent.some(value=>!Number.isFinite(value)||value<0||value>10000))return '난이도 배율은 0~10,000% 범위로 입력하세요.';
    if(settings.difficultyCrystalBonus.some(value=>!Number.isFinite(value)||value<0))return '난이도 결정 추가값은 0 이상으로 입력하세요.';
    if(Object.values(settings.nodeRewardPercent).some(value=>!Number.isFinite(value)||value<0||value>10000))return '노드 배율은 0~10,000% 범위로 입력하세요.';
    if(Object.values(settings.shardRewardPercent).some(value=>!Number.isFinite(value)||value<0||value>10000))return '카드 조각 배율은 0~10,000% 범위로 입력하세요.';
    return '';
  }

  async function saveRiftSettings(){
    const settings=collect(),error=validate(settings);if(error)return alert(error);
    if(!confirm('균열 원정 보상 설정을 저장할까요?\n저장 후 진행되는 전투와 사건 선택부터 적용됩니다.'))return;
    const button=q('#saveRiftSettingsBtn');if(button){button.disabled=true;button.textContent='서버 저장 중...';}
    try{
      const data=await api('admin/rift-settings',{method:'PATCH',body:JSON.stringify({settings})});
      current=data.settings||settings;
      const refreshed=await api('admin/rift-settings');render(refreshed);
      alert('균열 원정 보상 설정이 서버에 저장되었습니다.');
    }finally{if(button){button.disabled=false;button.textContent='균열 원정 설정 저장';}}
  }

  function resetDifficulty(){
    if(!confirm('난이도별 배율을 기존 기본값으로 복원할까요?\n아직 서버에는 저장되지 않습니다.'))return;
    q('#riftDifficultyRewardGrid').querySelectorAll('[data-difficulty]').forEach(card=>{
      const index=Number(card.dataset.difficulty)-1;
      card.querySelector('.riftDifficultyPercent').value=defaults.difficultyRewardPercent[index];
      card.querySelector('.riftDifficultyCrystal').value=defaults.difficultyCrystalBonus[index];
      card.querySelector('footer').textContent=`${(defaults.difficultyRewardPercent[index]/100).toFixed(2)}배`;
    });
  }

  const originalShow=show;
  show=function(view,prefetched){
    if(view==='riftsettings'){
      if(String(state.role||'').toUpperCase()!=='OWNER'){alert('균열 원정 보상 설정은 OWNER 전용입니다.');return originalShow('dashboard');}
      setView();loadRiftAdmin().catch(error=>alert(error.message));return;
    }
    return originalShow(view,prefetched);
  };

  const originalRenderIdentity=renderIdentity;
  renderIdentity=function(){
    originalRenderIdentity();
    const nav=q('#nav button[data-view="riftsettings"]');if(nav)nav.hidden=String(state.role||'').toUpperCase()!=='OWNER';
  };

  q('#riftAdminRefresh')?.addEventListener('click',()=>loadRiftAdmin().catch(error=>alert(error.message)));
  q('#saveRiftSettingsBtn')?.addEventListener('click',saveRiftSettings);
  q('#riftDifficultyReset')?.addEventListener('click',resetDifficulty);
  q('#riftMaxDifficulty')?.addEventListener('input',updateDifficultyVisibility);
})();
