/* This page only calls read-only OWNER preview APIs. No account save or fight API. */
(()=>{
  let catalog,series,battles=[],currentMode='PVP',currentPayload=null,busy=false;
  const status=document.getElementById('status'),roundSelect=document.getElementById('round');
  window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.cards=[];window.loadUser=()=>({nickname:'OWNER 검수'});
  window.pvpState={deck:[],profile:{tier:{name:'준비 검수'}},rankedSeries:{codes:[],cards:[],ready:false,ownedCount:0,revision:0,mercenariesPerRound:2}};
  localStorage.setItem('cnine_battle_sound','OFF');
  async function request(path,body){
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
    const response=await fetch('/api/admin/companions/preparation'+path,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',authorization:`Bearer ${token}`},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'검수 요청 실패');return data;
  }
  async function calculate(mode,codes){return request('/dual',{mode,codes,mercenaryRevision:catalog.mercenaryRevision,seed:20261028});}
  window.apiRequest=async(path,options)=>{
    if(path!=='pvp/series-roster')throw Error('검수 경로가 아닙니다.');
    const body=JSON.parse(options.body);await calculate('RANKED',body.codes);
    return {rankedSeries:{...pvpState.rankedSeries,codes:[...body.codes],ready:true,revision:pvpState.rankedSeries.revision+1}};
  };
  window.renderPvpTab=()=>{
    document.getElementById('roster').innerHTML=CNineRankedSeries.render();CNineRankedSeries.bind();
    const save=document.getElementById('rsSave');save.textContent=pvpState.rankedSaving?'검수 중…':'검수 편성 적용';
    const start=document.getElementById('rankedMatchStart');start.querySelector('strong').textContent='두 용병 랭크전 검수';start.disabled=!CNineRankedSeries.ready()||busy;start.onclick=()=>run('RANKED');
    document.getElementById('coop').disabled=document.getElementById('duo').disabled=document.getElementById('pve').disabled=busy||!pvpState.rankedDraft?.slice(0,2).every(Boolean)||pvpState.rankedDraft?.slice(0,2).length!==2;
  };
  async function show(index){
    const battle=battles[index];if(!battle)return;
    const payload={...currentPayload,mode:currentMode==='COOP'?'RAID':currentMode==='DUO'?'PVP':currentMode,preparationOnly:true,battleV2:battle,...(currentMode==='PVE'?{monster:battle.teams.B.cards[0]}:{})};
    const engine=await ProjectVPixiBattle.mountForBattle(payload,document.getElementById('battle'));
    await ProjectVPixiBattle.setBattlePayload(payload);await ProjectVPixiBattle.setVisible(true);await ProjectVPixiBattle.restoreDeployedFormation();
    window.dualPreparationEngine=engine;
    document.getElementById('play').disabled=false;
    status.textContent=series?`${index+1}차전 · 용병 2명씩 · 세트 결과 ${series.score.A} : ${series.score.B}`:currentMode==='COOP'?'협동 · 참가자별 카드 2장 + 용병 2명 · 적 체력 60%·공격력 15% 상향 검수':currentMode==='DUO'?'듀오 · 참가자별 카드 5장 + 용병 2명':'PVE · 카드 5장 + 용병 2명';
  }
  async function run(mode){
    if(busy)return;busy=true;renderPvpTab();status.textContent='서버 전투를 계산하는 중입니다.';
    try{
      const result=await calculate(mode,mode==='RANKED'?pvpState.rankedSeries.codes:pvpState.rankedDraft.slice(0,2));
      series=result.rankedSeries||null;currentPayload=result.payload||null;currentMode=mode==='RANKED'?'PVP':mode;battles=series?series.rounds.map(r=>r.battleV2):[result.battle];
      roundSelect.innerHTML=battles.map((_,i)=>`<option value="${i}">${series?i+1+'차전':currentMode==='COOP'?'협동격전지':currentMode==='DUO'?'랭크 듀오':'PVE'}</option>`).join('');await show(0);
    }catch(error){status.textContent=error.message;}finally{busy=false;renderPvpTab();}
  }
  document.getElementById('pve').onclick=()=>run('PVE');document.getElementById('coop').onclick=()=>run('COOP');document.getElementById('duo').onclick=()=>run('DUO');
  roundSelect.onchange=()=>{if(!busy)void show(Number(roundSelect.value)).catch(error=>{status.textContent=error.message;});};
  document.getElementById('play').onclick=async()=>{
    if(busy)return;busy=true;const index=Number(roundSelect.value),button=document.getElementById('play');button.disabled=true;roundSelect.disabled=true;renderPvpTab();
    try{await show(index);button.disabled=true;await ProjectVPixiBattle.playEvents(battles[index].result.timeline);await ProjectVPixiBattle.syncFinalState(battles[index].result.final);status.textContent+=' · 재생 완료';}
    catch(error){status.textContent=error.message;}finally{busy=false;button.disabled=false;roundSelect.disabled=false;renderPvpTab();}
  };
  request('').then(data=>{catalog=data;window.cards=data.cards;pvpState.deck=cards.map(c=>c.id);pvpState.rankedSeries.cards=data.mercenaries;pvpState.rankedSeries.ownedCount=data.mercenaries.length;status.textContent='서버에 등록된 용병으로 검수합니다. 검수 선택은 이 페이지에만 유지됩니다.';renderPvpTab();}).catch(error=>{status.textContent=error.message;});
})();
