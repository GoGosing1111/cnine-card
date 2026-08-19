(()=>{
  const client=document.getElementById('pvClient');
  const scaleClient=()=>{
    if(innerWidth<=760){client.style.removeProperty('--pv-scale');return}
    client.style.setProperty('--pv-scale',String(Math.min(innerWidth/1920,innerHeight/1080)));
  };
  addEventListener('resize',scaleClient,{passive:true});scaleClient();

  const stageCopy={
    home:['전투 준비','출전 덱 편성','카드를 선택해 상세 전투 정보를 확인하세요.'],
    cards:['CARD COLLECTION','보유 카드 관리','보유 카드 273장 · 프레임과 강화 상태를 한 화면에서 관리합니다.'],
    dex:['ARCHIVE','카드 도감','수집 현황과 중복 보유 수량을 확인합니다.'],
    deck:['FORMATION','전투 덱 편성','PVE·랭크전·영토전 프리셋을 관리합니다.'],
    gear:['ARSENAL','장비·제작','장비·차량·마법카드 보너스를 확인합니다.']
  };
  const moduleLayer=document.getElementById('pvModuleLayer');
  const modulePages=[...document.querySelectorAll('[data-module-page]')];
  const moduleMeta={
    cards:['COLLECTION','카드 관리'],
    dex:['ARCHIVE','카드 도감'],
    deck:['FORMATION','덱 편성'],
    draw:['CARD PACK TERMINAL','카드팩 개봉'],
    battle:['COMBAT SYSTEM','전투'],
    arsenal:['ARSENAL','장비 · 제작'],
    inventory:['INVENTORY','인벤토리'],
    rewards:['REWARD & RANK','보상 · 랭킹'],
    auction:['LIVE AUCTION','경매장'],
    prediction:['COIN PREDICTION','승부예측']
  };
  let battleRendererPromise=null,battleRendererRequested=false;
  const syncBattleRenderer=async active=>{
    battleRendererRequested=Boolean(active);
    if(active&&!window.ProjectVPixiBattle){
      battleRendererPromise||=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='project-v-pixi-battle.bundle.js?v=51-session-reset';
        script.onload=resolve;
        script.onerror=()=>reject(new Error('PixiJS 전투 번들을 불러오지 못했습니다.'));
        document.head.appendChild(script);
      });
      try{await battleRendererPromise}catch(error){
        console.error('[Project V V3] 전투 렌더러 로드 실패',error);
        const status=document.getElementById('pvBattleStatus');
        if(status)status.textContent=`렌더러 오류 · ${error?.message||'모듈 로드 실패'}`;
        battleRendererPromise=null;
        return;
      }
    }
    await window.ProjectVPixiBattle?.setVisible(battleRendererRequested);
  };
  const sectionModule={cards:'cards',dex:'dex',deck:'deck',gear:'arsenal'};
  let activeModule='';
  const openModule=key=>{
    if(!moduleMeta[key])return;
    activeModule=key;
    modulePages.forEach(page=>page.hidden=page.dataset.modulePage!==key);
    document.getElementById('pvModuleEyebrow').textContent=moduleMeta[key][0];
    document.getElementById('pvModuleTitle').textContent=moduleMeta[key][1];
    moduleLayer.setAttribute('aria-hidden','false');
    void syncBattleRenderer(key==='battle');
  };
  const closeModule=()=>{activeModule='';moduleLayer.setAttribute('aria-hidden','true');void syncBattleRenderer(false)};
  document.getElementById('pvModuleBack').addEventListener('click',()=>{
    closeModule();
    document.querySelectorAll('[data-section-target]').forEach(item=>item.classList.toggle('is-active',item.dataset.sectionTarget==='home'));
  });
  document.querySelectorAll('[data-section-target]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-section-target]').forEach(item=>item.classList.toggle('is-active',item===button));
    const key=button.dataset.sectionTarget,copy=stageCopy[key]||stageCopy.home;
    client.dataset.section=key;
    document.getElementById('pvStageEyebrow').textContent=copy[0];
    document.getElementById('pvStageTitle').textContent=copy[1];
    document.getElementById('pvStageSub').textContent=copy[2];
    if(key==='home')closeModule();else openModule(sectionModule[key]);
  }));
  document.querySelectorAll('[data-open-module]').forEach(button=>button.addEventListener('click',()=>openModule(button.dataset.openModule)));

  const cards=[...document.querySelectorAll('.pv-card')];
  cards.forEach(card=>card.addEventListener('click',()=>{
    cards.forEach(item=>{item.classList.toggle('is-selected',item===card);item.setAttribute('aria-pressed',item===card?'true':'false')});
    document.getElementById('pvSelectedGrade').textContent=card.dataset.grade;
    document.getElementById('pvSelectedName').textContent=card.dataset.name;
    document.getElementById('pvSelectedLevel').textContent=`+${card.dataset.level}`;
    document.getElementById('pvSelectedPower').textContent=Number(card.dataset.power).toLocaleString('ko-KR');
  }));

  const toast=document.getElementById('pvToast');let toastTimer=0;
  const notify=message=>{clearTimeout(toastTimer);toast.textContent=message;toast.classList.add('is-visible');toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),1800)};
  document.getElementById('pvDetailButton').addEventListener('click',()=>notify(`${document.getElementById('pvSelectedName').textContent} 상세 화면으로 연결 가능한 버튼입니다.`));
  const dockModules={cards:'cards',battle:'battle',gear:'arsenal',reward:'rewards'};
  document.querySelectorAll('[data-dock]').forEach(button=>button.addEventListener('click',()=>openModule(dockModules[button.dataset.dock])));
  document.querySelector('.pv-profile').addEventListener('click',()=>openModule('inventory'));

  const operations=[...document.querySelectorAll('.pv-operation')],operationName=document.getElementById('pvOperationName'),operationButton=document.getElementById('pvOperationButton');
  operations.forEach(button=>button.addEventListener('click',()=>{
    operations.forEach(item=>item.classList.toggle('is-active',item===button));
    operationName.textContent=button.dataset.operation;operationButton.textContent=button.dataset.action;
  }));
  const operationModules={'랭크전':'battle','영토전':'battle','나이트메어':'battle','방치 원정':'rewards','경매장':'auction','승부예측':'prediction'};
  operationButton.addEventListener('click',()=>openModule(operationModules[operationName.textContent]||'battle'));

  const setActiveWithin=(selector,button)=>document.querySelectorAll(selector).forEach(item=>item.classList.toggle('is-active',item===button));
  document.querySelectorAll('.pv-segment button,.pv-count-switch button,.pv-prediction-options button').forEach(button=>button.addEventListener('click',()=>setActiveWithin(`.${button.parentElement.className.trim().split(/\s+/)[0]} button`,button)));

  document.querySelectorAll('[data-battlefield]').forEach(button=>button.addEventListener('click',async()=>{
    setActiveWithin('[data-battlefield]',button);
    await syncBattleRenderer(true);
    const mode=button.dataset.battlefield;
    await window.ProjectVPixiBattle?.setBattlefield(mode);
    const labels={HUNT:'몬스터 토벌',TOWER:'무한의 탑',PVP:'PVP 랭크전',RAID:'월드 레이드',SIEGE:'공성·봉인전'};
    notify(`${labels[mode]||mode} 전장으로 변경했습니다.`);
  }));

  document.querySelectorAll('.pv-library-card').forEach(button=>button.addEventListener('click',()=>{
    setActiveWithin('.pv-library-card',button);
    document.getElementById('pvLibraryGrade').textContent=button.dataset.libraryGrade;
    document.getElementById('pvLibraryName').textContent=button.dataset.libraryName;
    document.getElementById('pvLibraryPower').textContent=button.dataset.libraryPower;
  }));

  const packButtons=[...document.querySelectorAll('[data-pack-name]')];
  const packCountButtons=[...document.querySelectorAll('[data-pack-count]')];
  let selectedPack=packButtons[0],selectedPackCount=100;
  const syncPack=()=>{
    const price=Number(selectedPack.dataset.packPrice||0),total=price*selectedPackCount;
    document.getElementById('pvPackName').textContent=selectedPack.dataset.packName;
    document.getElementById('pvPackTotal').textContent=total.toLocaleString('ko-KR');
    document.querySelector('[data-preview-action="카드팩 개봉 연출"]').textContent=`${selectedPackCount}장 개봉`;
  };
  packButtons.forEach(button=>button.addEventListener('click',()=>{selectedPack=button;setActiveWithin('[data-pack-name]',button);syncPack()}));
  packCountButtons.forEach(button=>button.addEventListener('click',()=>{selectedPackCount=Number(button.dataset.packCount);syncPack()}));

  document.querySelectorAll('[data-arsenal-tab]').forEach(button=>button.addEventListener('click',()=>{
    setActiveWithin('[data-arsenal-tab]',button);
    document.querySelectorAll('[data-arsenal-panel]').forEach(panel=>panel.hidden=panel.dataset.arsenalPanel!==button.dataset.arsenalTab);
  }));
  document.querySelectorAll('[data-preview-action]').forEach(button=>button.addEventListener('click',()=>notify(`${button.dataset.previewAction}을 실제 기능에 연결할 수 있습니다.`)));

  const drawer=document.getElementById('pvDrawer');
  const setDrawer=open=>{drawer.classList.toggle('is-open',open);drawer.setAttribute('aria-hidden',open?'false':'true')};
  document.getElementById('pvLaunch').addEventListener('click',()=>setDrawer(true));
  document.querySelectorAll('[data-close-drawer]').forEach(button=>button.addEventListener('click',()=>setDrawer(false)));
  document.getElementById('pvConfirmLaunch').addEventListener('click',()=>{setDrawer(false);openModule('battle')});
  addEventListener('keydown',event=>{if(event.key==='Escape'){if(drawer.classList.contains('is-open'))setDrawer(false);else if(activeModule)closeModule()}});

  const canvas=document.getElementById('pvAtmosphere'),context=canvas.getContext('2d',{alpha:true});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running=!document.hidden&&!reduced,frame=0,last=0,particles=[];
  const resizeCanvas=()=>{const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(1920*ratio);canvas.height=Math.round(1080*ratio);context.setTransform(ratio,0,0,ratio,0,0);particles=Array.from({length:42},(_,index)=>({x:(index*193)%1920,y:(index*347)%1080,r:.5+(index%4)*.35,v:.08+(index%5)*.018,a:.08+(index%7)*.018}))};
  resizeCanvas();
  const draw=time=>{if(!running)return;const delta=Math.min(32,time-last||16);last=time;context.clearRect(0,0,1920,1080);for(const p of particles){p.y-=p.v*delta;if(p.y<-5){p.y=1085;p.x=(p.x+331)%1920}context.beginPath();context.fillStyle=`rgba(112,222,255,${p.a})`;context.arc(p.x,p.y,p.r,0,Math.PI*2);context.fill()}frame=requestAnimationFrame(draw)};
  const syncMotion=()=>{running=!document.hidden&&!reduced;if(running&&!frame){last=0;frame=requestAnimationFrame(draw)}else if(!running&&frame){cancelAnimationFrame(frame);frame=0}};
  document.addEventListener('visibilitychange',syncMotion);syncMotion();
})();
