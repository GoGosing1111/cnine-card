(function clanWarReview(global){
  'use strict';

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const mount=$('#clanPreviewMount');
  const overlay=$('#battleReview');
  const resultLayer=$('#battleResultLayer');
  const frame=$('#v3BattleFrame');
  const toast=$('#reviewToast');
  const descriptions={
    registration:['/clan · SEASON ENTRY','참가 신청과 랭크전 5장 시즌 고정 화면입니다.'],
    draft:['/clan · BLIND DRAFT','후보 신원을 숨긴 스네이크 드래프트와 자동 지명 흐름입니다.'],
    war:['/clan · 60 MIN WAR','21:00—22:00 단일 대진과 유사 전투력 자동 매칭 검수 화면입니다.'],
    settlement:['/clan · RANKING','시즌 점수·승패·드래프트 순서로 정렬되는 정산 화면입니다.']
  };
  const scenes={registration:{phase:'REGISTRATION',tab:'command'},draft:{phase:'DRAFT',tab:'command'},war:{phase:'ACTIVE',tab:'war'},settlement:{phase:'COMPLETE',tab:'rank'}};
  let currentScene='war',activeFixture=null,toastTimer=0,framePrimed=false,framePrimePromise=null,battlePlaying=false;

  const officialClans=[
    ['DK','DK','#2f7cff','#d8e8ff','핑크빛유두',20,42,14,5],['삼성','SAMSUNG','#3c74c9','#e7f2ff','세별',20,38,12,7],['T1','T1','#d32f4a','#f6d37a','왕좌',20,36,11,8],['한화','HANWHA','#f1781f','#ffe3a1','불꽃',20,33,10,9],
    ['LG','LG','#d64192','#f4dbea','쌍월',20,30,9,10],['롯데','LOTTE','#7b2445','#f0d28e','등대',20,27,8,11],['FM','FM','#1dad72','#e9d07a','주파수',20,24,7,12],['DC','DC','#7b4ae2','#62d9ff','회로왕',20,21,6,13]
  ].map(([name,markKey,primaryColor,accentColor,masterNickname,memberCount,score,wins,losses],index)=>({clanId:index+1,name,markKey,primaryColor,accentColor,masterNickname,memberCount,score,wins,losses,draftPosition:index,slogan:index===0?'정확한 판정, 마지막까지 유지되는 전선.':'시즌 전선을 사수한다.'}));
  const MY_COMBAT_POWER=1265400;
  const roster=['핑크빛유두','DK_돌격대','푸른전선','밤의정찰','공성병기','유리대포','후방지원','철벽수비'].map((nickname,index)=>({userId:101+index,nickname,memberRole:index===0?'MASTER':'MEMBER',preferredRole:['BALANCED','ATTACK','SPEED','DEFENSE','HP'][index%5],draftPickNo:index,contributionScore:31-index*2,battleWins:8-index%4,battleLosses:2+index%3,combatPower:MY_COMBAT_POWER-index*43800}));
  const opponents=[
    {userId:201,nickname:'T1_선봉대',preferredRole:'ATTACK',battleWins:9,battleLosses:2,defenseCount:4,combatPower:1281900,powerDeltaPct:1.3,powerGapPct:1.3,matchEligible:true,matchState:'PRIMARY',available:true},
    {userId:202,nickname:'붉은왕관',preferredRole:'DEFENSE',battleWins:8,battleLosses:3,defenseCount:3,combatPower:1238600,powerDeltaPct:2.1,powerGapPct:-2.1,matchEligible:false,matchState:'QUEUED',available:false},
    {userId:203,nickname:'철의창끝',preferredRole:'SPEED',battleWins:7,battleLosses:4,defenseCount:5,combatPower:1309200,powerDeltaPct:3.5,powerGapPct:3.5,matchEligible:false,matchState:'QUEUED',available:false},
    {userId:204,nickname:'불멸의수비',preferredRole:'HP',battleWins:6,battleLosses:5,defenseCount:2,combatPower:1182100,powerDeltaPct:6.6,powerGapPct:-6.6,matchEligible:false,matchState:'QUEUED',available:false},
    {userId:205,nickname:'새벽추격자',preferredRole:'BALANCED',battleWins:5,battleLosses:6,defenseCount:1,combatPower:1364100,powerDeltaPct:7.8,powerGapPct:7.8,matchEligible:false,matchState:'QUEUED',available:false},
    {userId:206,nickname:'최후의오더',preferredRole:'ATTACK',battleWins:4,battleLosses:7,defenseCount:0,combatPower:1515000,powerDeltaPct:19.7,powerGapPct:19.7,matchEligible:false,matchState:'OUTSIDE',available:false}
  ];
  const candidates=['ATTACK','DEFENSE','SPEED','HP','BALANCED','ATTACK','SPEED','DEFENSE'].map((preferredRole,index)=>({candidateKey:`REVIEW-CANDIDATE-${index+1}`,preferredRole,activityWindow:['EVENING','NIGHT','FLEX','DAY'][index%4],activityBand:index<3?'CORE':'ACTIVE',rankBand:['DIAMOND','PLATINUM','GOLD'][index%3],activityScore:960-index*22,rankScore:920-index*27,contributionScore:880-index*31,reliabilityScore:940-index*19,totalScore:936-index*24}));
  const battleCard=(team,index,{cardId,name,grade,type,maxHp,sprite,sourceArt})=>({
    id:`${team}:${index}:${cardId}`,cardId,name,grade,type,maxHp,hp:maxHp,power:76000-index*2300,
    sourceArt,projectVBattleArt:{kind:'CARD_SD',primaryUrl:sprite,scaleMultiplier:1}
  });
  const clanPvpTeams={
    A:[
      battleCard('A',0,{cardId:'CLAN-A-FAKER',name:'FAKER',grade:'FUR',type:'ATTACK',maxHp:132000,sprite:'/assets/ui/project-v/characters/deck-faker-sd-v1.png?v=33-alpha-clean',sourceArt:'/assets/cards/7777777.jpg'}),
      battleCard('A',1,{cardId:'CLAN-A-TAEK',name:'김택용',grade:'PRESTIGE',type:'SPEED',maxHp:118000,sprite:'/assets/ui/project-v/characters/deck-kimtaekyong-sd-v1.png?v=33-alpha-clean',sourceArt:'/assets/pre/8.jpg'}),
      battleCard('A',2,{cardId:'CLAN-A-PPLI',name:'쁠리',grade:'ZENITH',type:'HP',maxHp:146000,sprite:'/assets/ui/project-v/characters/deck-ppli-sd-v1.png?v=33-alpha-clean',sourceArt:'/assets/cards/ZENITH/V1.jpg'}),
      battleCard('A',3,{cardId:'CLAN-A-AYOON',name:'비키니 아윤',grade:'LIMITED',type:'ATTACK',maxHp:124000,sprite:'/assets/ui/project-v/characters/deck-bikini-ayoon-sd-v1.png?v=33-alpha-clean',sourceArt:'/assets/cards/0725/3.jpg'}),
      battleCard('A',4,{cardId:'CLAN-A-BONG',name:'프로필찍는 봉준',grade:'FUR',type:'DEFENSE',maxHp:154000,sprite:'/assets/ui/project-v/characters/deck-bongjun-sd-v1.png?v=33-alpha-clean',sourceArt:'/assets/NEWCARD/8.jpg'})
    ],
    B:[
      battleCard('B',0,{cardId:'CLAN-B-AYOON',name:'아윤',grade:'PRESTIGE',type:'HP',maxHp:142000,sprite:'/assets/ui/project-v/characters/prestige/prestige-ayoon-sd-v1.png',sourceArt:'/assets/pre/11.jpg'}),
      battleCard('B',1,{cardId:'CLAN-B-YUBYEOL',name:'유별',grade:'PRESTIGE',type:'SPEED',maxHp:121000,sprite:'/assets/ui/project-v/characters/prestige/prestige-yubyeol-sd-v1.png',sourceArt:'/assets/pre/10.jpg'}),
      battleCard('B',2,{cardId:'CLAN-B-OJOEUN',name:'오조은',grade:'PRESTIGE',type:'ATTACK',maxHp:126000,sprite:'/assets/ui/project-v/characters/prestige/prestige-ojoeun-sd-v1.png',sourceArt:'/assets/pre/12.jpg'}),
      battleCard('B',3,{cardId:'CLAN-B-IDANI',name:'이다니',grade:'PRESTIGE',type:'DEFENSE',maxHp:151000,sprite:'/assets/ui/project-v/characters/prestige/prestige-idani-sd-v1.png',sourceArt:'/assets/pre/15.jpg'}),
      battleCard('B',4,{cardId:'CLAN-B-AESOONI',name:'애순이',grade:'PRESTIGE',type:'HP',maxHp:139000,sprite:'/assets/ui/project-v/characters/prestige/prestige-aesooni-sd-v1.png',sourceArt:'/assets/pre/14.jpg'})
    ]
  };
  const actor=(team,index)=>clanPvpTeams[team][index].id;
  const CLAN_PVP_TIMELINE=[
    {type:'DEPLOY'},
    {type:'ATTACK',actorId:actor('A',0),targetId:actor('B',0),damage:28640,targetHpAfter:113360,critical:true},
    {type:'SKILL',actorId:actor('B',1),targetId:actor('A',1),damage:33100,targetHpAfter:84900,label:'질풍의 역습'},
    {type:'MAGIC_CARD',actorId:actor('A',2),targetId:actor('B',2),damage:41200,targetHpAfter:84800,magicName:'월광 연쇄'},
    {type:'ATTACK',actorId:actor('B',3),targetId:actor('A',3),damage:39500,targetHpAfter:84500,critical:true},
    {type:'COUNTER',actorId:actor('A',4),targetId:actor('B',3),damage:52700,targetHpAfter:98300,label:'강철 반격'},
    {type:'SKILL',actorId:actor('A',0),targetId:actor('B',4),damage:69400,targetHpAfter:69600,label:'CRIMSON BLADE',critical:true},
    {type:'ULTIMATE',actorId:actor('A',2),targetId:actor('B',0),damage:113360,targetHpAfter:0,label:'천상개화 · 월하난무',critical:true},
    {type:'KO',targetId:actor('B',0)},
    {type:'ATTACK',actorId:actor('A',3),targetId:actor('B',1),damage:121000,targetHpAfter:0,critical:true},
    {type:'KO',targetId:actor('B',1)},
    {type:'RESULT',winner:'A'}
  ];
  const clanBattlePayload=()=>({mode:'PVP',battlefieldMode:'PVP',contentType:'CLAN_WAR',battleV2:{mode:'PVP',battlefieldMode:'PVP',teams:{A:{cards:structuredClone(clanPvpTeams.A)},B:{cards:structuredClone(clanPvpTeams.B)}},result:{winner:'A',reason:'LAST_TEAM_STANDING',timeline:structuredClone(CLAN_PVP_TIMELINE)}}});

  function isoAfter(days=0,hours=0){return new Date(Date.now()+days*86400000+hours*3600000).toISOString()}
  function buildFixture(phase){
    const hasClan=phase!=='REGISTRATION',complete=phase==='COMPLETE';
    return{
      ok:true,mode:'TEST',verified:true,verificationExempt:true,verificationName:'OWNER',
      season:{id:1,seasonNo:1,phase,maxMembers:20,registrationEndsAt:isoAfter(6),draftEndsAt:isoAfter(9),startsAt:isoAfter(-2),endsAt:isoAfter(25),nextPickDeadline:isoAfter(0,0.08),draftPickCount:27},
      registration:{registered:false},membership:hasClan?{...officialClans[0],memberRole:'MASTER',isMaster:true}:null,
      teams:officialClans,officialClans:officialClans.map((clan,index)=>({...clan,order:index+1})),roster:hasClan?roster:[],
      draft:phase==='DRAFT'?{isMyTurn:true,pickNo:28,currentClan:officialClans[0]}:null,candidates:phase==='DRAFT'?candidates:[],
      war:phase==='ACTIVE'?{id:11,roundNo:1,status:'ACTIVE',clanAId:1,clanBId:3,scoreA:18,scoreB:16,battleCount:72,attacksUsed:0,attackLimit:10,attacksRemaining:10,attackerPower:MY_COMBAT_POWER,energy:{available:5,cap:10,cost:1,usesRemaining:10,useLimit:10,nextEnergyAt:isoAfter(0,.05),windowOpen:true,canAttack:true},startsAt:new Date().toISOString(),endsAt:isoAfter(0,1)}:null,
      opponents:phase==='ACTIVE'?opponents:[],
      settlement:complete?{status:'COMPLETED',championClanId:1,rewardStatus:'DISABLED_TEST',completedAt:new Date().toISOString()}:null,
      battleEngine:{active:true,version:'PROJECT_V_V3',playbackSpeed:1.3},
      rules:{maxMembers:20,maxClans:8,maxParticipants:160,attacksPerWar:10,initialEnergy:5,energyCap:10,energyRecoverySeconds:180,warDurationMinutes:60,defensesPerTarget:10,repeatTargetLimit:1,powerMatchTolerancePct:10,powerMatchFallback:'NEAREST_LOWEST_DEFENSE',powerSnapshot:'RANKED_DECK_5',noFixedRoster:true,blindDraft:true,snakeDraft:true,identityPersists:true,identityFixed:true,queryPolicy:'SNAPSHOT_NO_VIEW_LOGS'},serverNow:new Date().toISOString()
    };
  }

  function notify(message){clearTimeout(toastTimer);toast.textContent=message;toast.classList.add('is-visible');toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),2600)}
  function formatPower(value){return Math.max(0,Number(value)||0).toLocaleString('ko-KR')}
  function signedPercent(value){const number=Number(value)||0;return `${number>0?'+':''}${number.toFixed(1)}%`}

  function decorateWarScene(){
    if(currentScene!=='war')return;
    const rule=$('.clan-rule-strip span:nth-child(4)',mount),score=$('.clan-war-score',mount),targets=$('.clan-targets',mount),energy=$('.clan-war-ops',mount);
    if(rule){const value=$('b',rule),label=$('em',rule);if(value&&value.textContent!=='10')value.textContent='10';if(label&&label.textContent!=='MAX OPS / WAR')label.textContent='MAX OPS / WAR'}
    if(energy&&energy.textContent!=='행동력 5 / 10')energy.textContent='행동력 5 / 10';
    if(score&&!$('.clan-design-strip',mount))score.insertAdjacentHTML('afterend',`<section class="clan-design-strip" aria-label="60분 클랜전 변경 규칙">
      <article><small>MATCH WINDOW</small><b>21:00—22:00</b><span>60분 · 상대 클랜 고정</span></article>
      <article><small>ENERGY</small><b>5 / 10</b><span>3분마다 +1 · 총 10회</span></article>
      <article><small>MY SNAPSHOT POWER</small><b>${formatPower(MY_COMBAT_POWER)}</b><span>시즌 고정 랭크전 덱 5장</span></article>
      <article><small>AUTO MATCH</small><b>±10%</b><span>최저 방어 배정 우선</span></article>
    </section>`);
    if(!targets||targets.dataset.powerMatchDecorated==='1')return;
    targets.dataset.powerMatchDecorated='1';
    const headerSmall=$('header small',targets),headerTitle=$('header h3',targets),headerCopy=$('header p',targets),headerState=$('header em',targets);
    if(headerSmall)headerSmall.textContent='PROJECT V V3 · POWER MATCH QUEUE';
    if(headerTitle)headerTitle.textContent='유사 전투력 자동 매칭';
    if(headerCopy)headerCopy.textContent=`내 전투력 ${formatPower(MY_COMBAT_POWER)} · ±10% 우선 · 동일 대상 1회 · 대상별 방어 10회`;
    if(headerState)headerState.textContent='AUTO ASSIGN';
    $$('.clan-targets article',targets).forEach((article,index)=>{
      const opponent=opponents[index];if(!opponent)return;
      const profile=article.children[1],detail=profile?.querySelector('small'),button=article.querySelector('button'),gap=signedPercent(opponent.powerGapPct);
      article.classList.add(`is-match-${opponent.matchState.toLowerCase()}`);article.dataset.matchState=opponent.matchState;
      if(detail)detail.textContent=`전투력 ${formatPower(opponent.combatPower)} · 차이 ${gap} · 방어 ${opponent.defenseCount} / 10`;
      if(profile&&!profile.querySelector('.clan-power-match'))profile.insertAdjacentHTML('beforeend',`<em class="clan-power-match">${opponent.matchState==='PRIMARY'?'현재 자동 배정':opponent.matchState==='QUEUED'?'동급 매칭 풀':'허용 범위 밖'} · ${gap}</em>`);
      if(button){button.textContent=opponent.matchState==='PRIMARY'?'자동 매칭 교전':opponent.matchState==='QUEUED'?'배정 대기':'범위 밖';button.disabled=opponent.matchState!=='PRIMARY'}
    });
  }

  const ctx={
    apiRequest(path,options={}){
      if(String(path).startsWith('clan/overview'))return Promise.resolve(structuredClone(activeFixture));
      if(String(options.method||'GET').toUpperCase()!=='GET')return Promise.reject(new Error('검수 프리뷰에서는 운영 API 쓰기가 차단됩니다.'));
      return Promise.resolve(structuredClone(activeFixture));
    },
    clearApiCache(){},ensureFeatureResources(){return Promise.resolve()},ensureBattleSoundButton(){},battleSfx(){},
    renderShell(){mountScene(currentScene)}
  };

  function syncSceneChrome(scene){
    const copy=descriptions[scene]||descriptions.war;
    $('#reviewPath').textContent=copy[0];$('#sceneDescription').textContent=copy[1];
    $$('[data-review-scene]').forEach(button=>button.classList.toggle('is-active',button.dataset.reviewScene===scene));
  }

  function mountScene(scene){
    if(scene==='battle'){syncSceneChrome('war');$$('[data-review-scene]').forEach(button=>button.classList.toggle('is-active',button.dataset.reviewScene==='battle'));openBattle();return}
    const config=scenes[scene]||scenes.war;currentScene=scene;activeFixture=buildFixture(config.phase);syncSceneChrome(scene);
    global.ClanV1.stop();global.ClanV1.state.data=null;global.ClanV1.state.loading=false;global.ClanV1.state.error='';global.ClanV1.state.tab=config.tab;
    mount.innerHTML=global.ClanV1.view();global.ClanV1.bind(ctx);setTimeout(decorateWarScene,0);
  }

  async function primeV3Frame(){
    if(framePrimed){await frame.contentWindow?.ProjectVPixiBattle?.setVisible?.(true);return true}
    if(framePrimePromise)return framePrimePromise;
    framePrimePromise=(async()=>{
      try{
        const doc=frame.contentDocument;if(!doc)return false;
        doc.querySelector('[data-open-module="battle"]')?.click();
        for(let attempt=0;attempt<60;attempt++){
          if(frame.contentWindow?.ProjectVPixiBattle?.diagnostics?.().mounted)break;
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        const runtime=frame.contentWindow?.ProjectVPixiBattle,host=doc.querySelector('#pvPixiBattle');
        if(!runtime?.resetSession||!host)return false;
        await runtime.resetSession(clanBattlePayload(),host);await runtime.setBattlefield('PVP');await runtime.setVisible(true);await runtime.playEvents([{type:'DEPLOY'}]);
        doc.querySelectorAll('[data-battlefield]').forEach(button=>button.classList.toggle('is-active',button.dataset.battlefield==='PVP'));
        const childStart=doc.querySelector('#pvBattleStart');if(childStart){childStart.disabled=true;childStart.textContent='왼쪽 V3 교전 재생 사용'}
        const battleHeader=doc.querySelector('[data-module-page="battle"] .pv-battle-screen>header');
        if(battleHeader){
          const eyebrow=battleHeader.querySelector('small'),title=battleHeader.querySelector('h3'),counterLabel=battleHeader.querySelector('.pv-turn-counter small'),counterValue=battleHeader.querySelector('.pv-turn-counter strong');
          if(eyebrow)eyebrow.textContent='PVP · CLAN WAR / ROUND 1';if(title)title.textContent='DK vs T1 · POWER MATCH';if(counterLabel)counterLabel.textContent='남은 행동력';if(counterValue)counterValue.textContent='4 / 10';
        }
        $('#battleFrameState').textContent='V3 PVP RENDERER READY';framePrimed=true;return true;
      }catch(error){$('#battleFrameState').textContent='V3 FRAME MANUAL MODE';return false}
      finally{framePrimePromise=null}
    })();
    return framePrimePromise;
  }

  function openBattle(target=opponents[0]){
    const matched=typeof target==='object'?target:opponents.find(item=>item.nickname===target)||opponents[0];
    $('#battleTargetName').textContent=matched.nickname;$('#battlePowerMatch').textContent=signedPercent(matched.powerGapPct);$('#battleDefenseCount').textContent=`${matched.defenseCount} / 10`;resultLayer.classList.remove('is-visible');resultLayer.setAttribute('aria-hidden','true');
    $('#battleFrameState').textContent=framePrimed?'V3 PVP RENDERER READY':'V3 CLIENT CONNECTING';
    overlay.classList.add('is-open');overlay.setAttribute('aria-hidden','false');document.documentElement.style.overflow='hidden';
    void primeV3Frame();
  }
  function closeBattle(){overlay.classList.remove('is-open');overlay.setAttribute('aria-hidden','true');document.documentElement.style.overflow='';resultLayer.classList.remove('is-visible');resultLayer.setAttribute('aria-hidden','true');void frame.contentWindow?.ProjectVPixiBattle?.setVisible?.(false);syncSceneChrome(currentScene)}
  async function playV3(){
    if(battlePlaying)return;const ready=await primeV3Frame();if(!ready){notify('V3 PVP 렌더러를 준비하지 못했습니다.');return}
    const runtime=frame.contentWindow?.ProjectVPixiBattle,host=frame.contentDocument?.querySelector('#pvPixiBattle'),button=$('[data-play-v3]');if(!runtime||!host)return;
    battlePlaying=true;if(button){button.disabled=true;button.textContent='5 vs 5 교전 재생 중'}$('#battleFrameState').textContent='V3 POWER-MATCHED PVP · 1.3×';notify('유사 전투력으로 자동 배정된 양쪽 랭크전 덱 5장을 재생합니다.');
    try{await runtime.resetSession(clanBattlePayload(),host);await runtime.setVisible(true);await runtime.playEvents(structuredClone(CLAN_PVP_TIMELINE));$('#battleFrameState').textContent='V3 CLAN PVP COMPLETE'}
    catch(error){$('#battleFrameState').textContent='V3 FRAME MANUAL MODE';notify('V3 클랜전 연출 재생 중 오류가 발생했습니다.')}
    finally{battlePlaying=false;if(button){button.disabled=false;button.textContent='V3 교전 재생'}}
  }
  function showResult(){resultLayer.classList.add('is-visible');resultLayer.setAttribute('aria-hidden','false');$('#battleFrameState').textContent='SERVER RESULT · DK WIN'}
  function hideResult(){resultLayer.classList.remove('is-visible');resultLayer.setAttribute('aria-hidden','true');$('#battleFrameState').textContent='V3 PVP RENDERER READY'}

  let decorationFrame=0;
  const mountObserver=new MutationObserver(()=>{if(currentScene!=='war'||decorationFrame)return;decorationFrame=requestAnimationFrame(()=>{decorationFrame=0;decorateWarScene()})});
  mountObserver.observe(mount,{childList:true,subtree:true});

  mount.addEventListener('click',event=>{
    const fight=event.target.closest('[data-clan-fight]');if(fight){event.preventDefault();event.stopImmediatePropagation();const target=opponents.find(item=>item.userId===Number(fight.dataset.clanFight));openBattle(target||opponents[0]);return}
    const write=event.target.closest('[data-clan-pick],[data-clan-test],[data-clan-route]');if(write){event.preventDefault();event.stopImmediatePropagation();notify('검수 프리뷰라 운영 데이터 변경은 차단했습니다. 위 단계 버튼으로 화면을 확인하세요.')}
  },true);
  mount.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();notify('검수 프리뷰라 참가·슬로건 등 운영 데이터 변경은 차단했습니다.')},true);
  $$('[data-review-scene]').forEach(button=>button.addEventListener('click',()=>mountScene(button.dataset.reviewScene)));
  $('[data-scroll-rules]')?.addEventListener('click',()=>$('#rulesInspector').scrollIntoView({behavior:'smooth',block:'start'}));
  $$('[data-close-battle]').forEach(button=>button.addEventListener('click',closeBattle));
  $('[data-play-v3]')?.addEventListener('click',playV3);$('[data-show-result]')?.addEventListener('click',showResult);$('[data-hide-result]')?.addEventListener('click',hideResult);
  frame.addEventListener('load',()=>{framePrimed=false;framePrimePromise=null});
  global.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.classList.contains('is-open'))closeBattle()});

  if(!global.ClanV1){mount.innerHTML='<p class="review-fatal">클랜 라이브 컴포넌트를 불러오지 못했습니다.</p>';return}
  mountScene('war');
})(window);
