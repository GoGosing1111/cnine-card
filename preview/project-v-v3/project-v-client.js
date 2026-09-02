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
  const battleSuitQc={
    suits:{
      BATTLE_SUIT_01:{name:'외형 01 · 메카닉 화이트 골드',sprite:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-01-mechanical-female-v3.png'},
      BATTLE_SUIT_02:{name:'외형 02 · 오렌지 택티컬',sprite:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-02-orange-tactical-v3.png'},
      BATTLE_SUIT_03:{name:'외형 03 · 모델 02 자수정 엑소슈트',sprite:'/assets/ui/project-v/account-battle-suits/suits/battle-suit-appearance-03-amethyst-model02-v3.png'}
    },
    weapons:{
      EQ_1785427638137:{name:'아발론 M4A1',kind:'AR',sprite:'/assets/ui/project-v/account-battle-suits/weapons/avalon-m4a1-v1.png'},
      EQ_1785961232958:{name:'인피니티 AK',kind:'AR',sprite:'/assets/ui/project-v/account-battle-suits/weapons/infinity-ak-v1.png'},
      EQ_1785961300455:{name:'인피니티 M200',kind:'SNIPER',sprite:'/assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png'},
      EQ_1786966923833:{name:'소버린 SKS',kind:'DMR',sprite:'/assets/ui/project-v/account-battle-suits/weapons/sovereign-sks-v1.png'}
    }
  };
  const battleQcState={suitCode:'BATTLE_SUIT_01',weaponCode:'EQ_1785427638137',battlefield:'HUNT',sound:true,mounted:false,busy:false};
  const qcAllies=[
    ['QC-FAKER','FAKER','FUR','ATTACK','/assets/ui/project-v/characters/deck-faker-sd-v1.png','/assets/cards/7777777.jpg'],
    ['QC-TAEK','김택용','PRESTIGE','SPEED','/assets/ui/project-v/characters/deck-kimtaekyong-sd-v1.png','/assets/pre/8.jpg'],
    ['QC-PPLI','쁠리','ZENITH','HP','/assets/ui/project-v/characters/deck-ppli-sd-v1.png','/assets/cards/ZENITH/V1.jpg'],
    ['QC-AYOON','비키니 아윤','LIMITED','ATTACK','/assets/ui/project-v/characters/deck-bikini-ayoon-sd-v1.png','/assets/cards/0725/3.jpg'],
    ['QC-BONG','프로필찍는 봉준','FUR','DEFENSE','/assets/ui/project-v/characters/deck-bongjun-sd-v1.png','/assets/NEWCARD/8.jpg']
  ].map(([cardId,name,grade,type,primaryUrl,sourceArt],index)=>({
    id:`A:${index}:${cardId}`,cardId,name,grade,type,hp:100,maxHp:100,sourceArt,
    projectVBattleArt:{kind:'APPROVED_DECK_SD',primaryUrl,sourceArtUrl:sourceArt,scaleMultiplier:1}
  }));
  const pveBattlefields=new Set(['HUNT','TOWER','RAID']);
  const qcPayload=()=>{
    const suit=battleSuitQc.suits[battleQcState.suitCode];
    const weapon=battleSuitQc.weapons[battleQcState.weaponCode];
    const pveAllowed=pveBattlefields.has(battleQcState.battlefield);
    const mode=pveAllowed?'PVE':battleQcState.battlefield;
    const monsterCard={id:'B:0:MONSTER:QC-JORO',cardId:'MONSTER:QC-JORO',name:'결전의 조로',grade:'MONSTER',type:'ATTACK',hp:100,maxHp:100};
    const monster={
      id:'QC-JORO',monsterId:'QC-JORO',cardId:'MONSTER:QC-JORO',name:'결전의 조로',mode:battleQcState.battlefield,isBoss:true,
      projectVMonsterArt:{kind:'APPROVED_MONSTER_SD',name:'결전의 조로',primaryUrl:'/assets/ui/project-v/monsters/nightmare-slime-sd-v1.png',scaleMultiplier:1.08,isBoss:true}
    };
    const equippedBattleSuit={code:battleQcState.suitCode,name:suit.name,battleSprite:suit.sprite,pvePower:35000,scaleMultiplier:1};
    const equippedWeapon={code:battleQcState.weaponCode,name:weapon.name,battleSprite:weapon.sprite,weaponClass:weapon.kind};
    return {
      mode,battlefieldMode:battleQcState.battlefield,contentType:battleQcState.battlefield,
      accountNickname:'핑크빛유두',monster,equippedBattleSuit,equippedWeapon,
      characterBonus:{battleSuitPve:35000,equippedBattleSuit,equippedWeapon},
      v3RenderContext:{accountBattleUnitPve:pveAllowed,previewContract:'BATTLE_SUIT_FIREARM_QC_V1'},
      battleV2:{mode,battlefieldMode:battleQcState.battlefield,teams:{A:{cards:qcAllies.map(card=>({...card,projectVBattleArt:{...card.projectVBattleArt}}))},B:{cards:[monsterCard]}},result:{timeline:[]}}
    };
  };
  let battleRendererPromise=null,battleRendererRequested=false,battleMutation=Promise.resolve();
  let battleAutoAudioHookBound=false;
  const queueBattleMutation=task=>{
    const run=battleMutation.then(task,task);
    battleMutation=run.catch(()=>{});
    return run;
  };
  const setQcChip=(id,text,state='')=>{
    const chip=document.getElementById(id);
    if(!chip)return;
    chip.textContent=text;
    chip.classList.toggle('is-pass',state==='pass');
    chip.classList.toggle('is-fail',state==='fail');
  };
  const setQcBusy=busy=>{
    battleQcState.busy=Boolean(busy);
    const panel=document.getElementById('pvBattleSuitQc');
    const fire=document.getElementById('pvBattleSuitFire');
    panel?.setAttribute('aria-busy',String(battleQcState.busy));
    if(fire)fire.disabled=battleQcState.busy||!pveBattlefields.has(battleQcState.battlefield);
    document.querySelectorAll('[data-qc-suit],[data-qc-weapon],[data-battlefield]').forEach(button=>button.disabled=battleQcState.busy);
  };
  const battleReplayPlaying=()=>Boolean(window.ProjectVPixiBattle?.diagnostics?.().playing);
  const refreshBattleQc=message=>{
    const diagnostics=window.ProjectVPixiBattle?.diagnostics?.()||{};
    const unit=diagnostics.accountBattleUnit||{};
    const pveAllowed=pveBattlefields.has(battleQcState.battlefield);
    const pvePass=pveAllowed?unit.enabled===true:unit.enabled!==true;
    setQcChip('pvQcModeChip',pveAllowed?'PVE ONLY':`${battleQcState.battlefield} 차단`,pvePass?'pass':'fail');
    setQcChip('pvQcDeckChip',`${unit.canonicalAllyFormationCount??diagnostics.formation?.allies??0} CARD`,Number(unit.canonicalAllyFormationCount??diagnostics.formation?.allies)===5?'pass':'fail');
    setQcChip('pvQcDamageChip',unit.affectsDamage===false?'NO DAMAGE':'DAMAGE 오류',unit.affectsDamage===false?'pass':'fail');
    const output=document.getElementById('pvBattleQcOutput');
    const suit=battleSuitQc.suits[battleQcState.suitCode];
    const weapon=battleSuitQc.weapons[battleQcState.weaponCode];
    if(output)output.textContent=message||`${suit.name} · ${weapon.name} · ${pveAllowed?'사격 대기':'경쟁 콘텐츠 유닛 차단 검증'}`;
    return {diagnostics,unit,pvePass};
  };
  const ensureBattleQcSession=async({reset=false}={})=>{
    const api=window.ProjectVPixiBattle;
    if(!api)return false;
    setQcBusy(true);
    try{
      if(!battleQcState.mounted){await api.mountForBattle(qcPayload(),document.getElementById('pvPixiBattle'));battleQcState.mounted=true}
      else if(reset)await api.resetSession(qcPayload(),document.getElementById('pvPixiBattle'));
      if(!battleRendererRequested)return false;
      await api.setVisible(true);
      await api.playEvents([{type:'DEPLOY'}]);
      refreshBattleQc();
      return true;
    }finally{setQcBusy(false)}
  };
  const bindBattleAutoAudioHook=()=>{
    if(battleAutoAudioHookBound)return true;
    const api=window.ProjectVPixiBattle;
    if(!api?.setAccountPreviewFirearmHook)return false;
    battleAutoAudioHookBound=api.setAccountPreviewFirearmHook(event=>{
      const audio=window.ProjectVFirearmQcAudio;
      if(event?.phase==='anticipation'){
        return audio?.armSustainedShot?.(event.weaponCode,{
          enabled:battleQcState.sound,
          visualLeadMs:event.visualLeadMs,
          isCancelled:event.isCancelled
        })||null;
      }
      if(event?.phase==='fire'){
        const result=event.plan?.markVisualFire?.(event.at)||null;
        if(battleQcState.sound&&result?.audioScheduled){
          setQcChip('pvQcSyncChip',`AUTO A/V ${result.deltaMs>=0?'+':''}${result.deltaMs.toFixed(1)}ms`,result.syncPass?'pass':'fail');
        }
        return result;
      }
      return null;
    });
    return battleAutoAudioHookBound;
  };
  const syncBattleRenderer=async active=>{
    battleRendererRequested=Boolean(active);
    if(active&&!window.ProjectVPixiBattle){
      battleRendererPromise||=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='project-v-pixi-battle.bundle.js?v=84-contact-locked-four-weapons';
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
    if(battleRendererRequested){
      bindBattleAutoAudioHook();
      await queueBattleMutation(()=>ensureBattleQcSession());
    }
    else{
      window.ProjectVFirearmQcAudio?.stop?.();
      await window.ProjectVPixiBattle?.setVisible(false);
    }
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

  const rebuildBattleQc=async message=>{
    battleRendererRequested=true;
    if(!window.ProjectVPixiBattle)await syncBattleRenderer(true);
    else await queueBattleMutation(()=>ensureBattleQcSession({reset:true}));
    if(message)notify(message);
  };
  document.querySelectorAll('[data-qc-suit]').forEach(button=>button.addEventListener('click',async()=>{
    setActiveWithin('[data-qc-suit]',button);
    battleQcState.suitCode=button.dataset.qcSuit;
    await rebuildBattleQc(`${battleSuitQc.suits[battleQcState.suitCode].name} 적용 완료`);
  }));
  document.querySelectorAll('[data-qc-weapon]').forEach(button=>button.addEventListener('click',async()=>{
    setActiveWithin('[data-qc-weapon]',button);
    battleQcState.weaponCode=button.dataset.qcWeapon;
    await rebuildBattleQc(`${battleSuitQc.weapons[battleQcState.weaponCode].name} 외형·사운드 프로필 적용`);
  }));
  document.getElementById('pvBattleSoundToggle')?.addEventListener('click',event=>{
    battleQcState.sound=!battleQcState.sound;
    event.currentTarget.classList.toggle('is-active',battleQcState.sound);
    event.currentTarget.setAttribute('aria-pressed',String(battleQcState.sound));
    event.currentTarget.textContent=battleQcState.sound?'SOUND ON':'SOUND OFF';
    if(!battleQcState.sound)window.ProjectVFirearmQcAudio?.stop?.();
    setQcChip('pvQcSyncChip',battleQcState.sound?'A/V 대기':'SOUND OFF',battleQcState.sound?'':'pass');
  });
  document.getElementById('pvBattleSuitFire')?.addEventListener('click',async()=>{
    if(battleReplayPlaying()){
      notify('자동 전투 재생 중에는 수동 사격을 사용할 수 없습니다.');
      return;
    }
    if(!pveBattlefields.has(battleQcState.battlefield)){
      notify('배틀슈트 계정 유닛은 PVE 전장에서만 사격할 수 있습니다.');
      return;
    }
    await syncBattleRenderer(true);
    await queueBattleMutation(async()=>{
      if(battleReplayPlaying()){
        notify('자동 전투 재생 중에는 수동 사격을 사용할 수 없습니다.');
        return;
      }
      setQcBusy(true);
      const audio=window.ProjectVFirearmQcAudio;
      let plan=null,audioError=null,syncResult=null;
      try{
        if(battleQcState.sound)await audio?.unlock?.();
        try{plan=await audio?.armShot?.(battleQcState.weaponCode,{enabled:battleQcState.sound,visualLeadMs:45})}
        catch(error){audioError=error;console.warn('[Project V V3] firearm QC audio scheduling failed',error)}
        const shot=await window.ProjectVPixiBattle?.playAccountPreviewShot?.({
          onFire:({at})=>{
            syncResult=plan?.markVisualFire?.(at)||null;
            if(syncResult?.audioScheduled)setQcChip('pvQcSyncChip',`A/V ${syncResult.deltaMs>=0?'+':''}${syncResult.deltaMs.toFixed(1)}ms`,syncResult.syncPass?'pass':'fail');
          }
        });
        const weapon=battleSuitQc.weapons[battleQcState.weaponCode];
        if(!shot?.played){
          setQcChip('pvQcSyncChip','사격 FAIL','fail');
          refreshBattleQc(`${weapon.name} · 계정 유닛 사격을 시작하지 못했습니다.`);
          return;
        }
        if(audioError){
          setQcChip('pvQcSyncChip','SOUND 오류','fail');
          refreshBattleQc(`${weapon.name} 모션 PASS · 사운드 로드 오류: ${audioError.message}`);
        }else if(!battleQcState.sound){
          setQcChip('pvQcSyncChip','SOUND OFF','pass');
          refreshBattleQc(`${weapon.name} 모션 PASS · 사운드 음소거`);
        }else if(!plan?.scheduled){
          setQcChip('pvQcSyncChip','A/V 수동검수');
          refreshBattleQc(`${weapon.name} 모션 PASS · 현재 자동화 브라우저는 WebAudio 미지원`);
        }else{
          const result=syncResult||plan.diagnostics?.();
          setQcChip('pvQcSyncChip',result?.deltaMs===undefined?'A/V 측정 중':`A/V ${result.deltaMs>=0?'+':''}${result.deltaMs.toFixed(1)}ms`,result?.syncPass?'pass':result?.syncPass===false?'fail':'');
          refreshBattleQc(`${weapon.name} · ${plan.acousticLabel} · 3계층 사격음 ${result?.syncPass?'PASS':'검수 필요'}`);
        }
      }finally{setQcBusy(false)}
    });
  });

  document.querySelectorAll('[data-battlefield]').forEach(button=>button.addEventListener('click',async()=>{
    setActiveWithin('[data-battlefield]',button);
    battleQcState.battlefield=button.dataset.battlefield;
    const mode=battleQcState.battlefield;
    const labels={HUNT:'몬스터 토벌',TOWER:'무한의 탑',PVP:'PVP 랭크전',RAID:'월드 레이드',SIEGE:'공성·봉인전'};
    await rebuildBattleQc(`${labels[mode]||mode} 전장 · ${pveBattlefields.has(mode)?'배틀슈트 표시':'배틀슈트 차단'} 검증`);
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
