(() => {
  const state={settings:{teamAName:'벤츠',teamBName:'BMW'},round:{id:1,status:'ACTIVE',current_front_index:4},front:{id:1,a_hp:500,a_max_hp:500,b_hp:487,b_max_hp:500},mine:{side:'A'},truce:{active:false},serverNow:new Date().toISOString(),battlefield:{config:{chargeMax:100},relay:{owner:'B'},supply:{active:true},A:{cannonDueAt:0},B:{cannonDueAt:0},events:[]}};
  const api=window.CNineTerritoryBattlefield,root=document.querySelector('main');
  document.querySelector('#scene').outerHTML=api.stageHtml(state);api.attach(root,state);document.querySelector('[data-tw6-enter]').click();
  let paused=false,enabled=true;
  async function fire(side){
    api.previewControl('stop');await api.playPreview('CANNON_FIRED',side);api.previewControl('speed',Number(document.querySelector('#speed').value));
    paused=false;document.querySelector('#pause').textContent='일시정지';
  }
  document.querySelector('#fire-a').onclick=()=>void fire('A');document.querySelector('#fire-b').onclick=()=>void fire('B');
  document.querySelector('#pause').onclick=event=>{paused=!paused;api.previewControl(paused?'pause':'resume');event.target.textContent=paused?'재생':'일시정지';};
  document.querySelector('#speed').onchange=event=>api.previewControl('speed',Number(event.target.value));
  document.querySelector('#seek').oninput=event=>{api.previewControl('seek',Number(event.target.value));paused=true;document.querySelector('#pause').textContent='재생';};
  document.querySelector('#toggle').onclick=event=>{enabled=!enabled;document.querySelector('[data-tw6-fx]').click();event.target.textContent='연출 '+(enabled?'ON':'OFF');};
  const timer=setInterval(()=>{api.tick();const d=api.diagnostics(),t=d.last?.time||0;document.querySelector('#seek').value=t;document.querySelector('#time').textContent=t.toFixed(2)+'초';document.querySelector('#status').textContent=d.failed?'리소스 로딩 실패':!d.ready?'포격 준비 중':d.active?(t<1.05?'포격 중':'착탄 · 잔연기'):'준비 완료';},100);
  document.addEventListener('visibilitychange',()=>api.tick());window.addEventListener('pagehide',()=>{clearInterval(timer);api.dispose();});
  void fire('A');
})();
