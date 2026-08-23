(() => {
  'use strict';

  const modal=document.getElementById('liveBattleModal');
  const status=document.getElementById('previewStatus');
  const playOnce=document.getElementById('playOnce');
  const playTwice=document.getElementById('playTwice');
  const roleButtons=[...document.querySelectorAll('[data-role]')];
  let activeRenderer=null;
  let running=false;
  let session=0;
  let selectedRole='ATTACK';

  const cards=[
    {id:'A:0:CN-011CAD85BBB2470F',cardId:'CN-011CAD85BBB2470F',name:'조폭 감스트',title:'조폭 감스트',grade:'FUR',rarity:'FUR',type:'ATTACK',image:'/assets/NEWCARD/21.jpg',hp:1200,maxHp:1200,uniqueAbility:{dominantType:'ATTACK',effectName:'갑주 파쇄'}},
    {id:'A:1:CN-E074D2BF51F249BE',cardId:'CN-E074D2BF51F249BE',name:'아윤',title:'아윤',grade:'PRESTIGE',rarity:'PRESTIGE',type:'DEFENSE',image:'/assets/pre/11.jpg',hp:1480,maxHp:1480,uniqueAbility:{dominantType:'DEFENSE',effectName:'수호 반격'}},
    {id:'A:2:CN-A8A8700D38704DD5',cardId:'CN-A8A8700D38704DD5',name:'유별',title:'유별',grade:'PRESTIGE',rarity:'PRESTIGE',type:'SPEED',image:'/assets/pre/10.jpg',hp:1040,maxHp:1040,uniqueAbility:{dominantType:'SPEED',effectName:'초신속 연격'}},
    {id:'A:3:CN-519C181C18DF4B8E',cardId:'CN-519C181C18DF4B8E',name:'토마토',title:'토마토',grade:'ZENITH',rarity:'ZENITH',type:'HP',image:'/assets/cards/ZENITH/1.jpg',hp:1760,maxHp:1760,uniqueAbility:{dominantType:'HP',effectName:'생명력 흡수'}},
    {id:'A:4:CN-F9067B50E7B840A4',cardId:'CN-F9067B50E7B840A4',name:'오조은',title:'오조은',grade:'PRESTIGE',rarity:'PRESTIGE',type:'ATTACK',image:'/assets/pre/12.jpg',hp:1160,maxHp:1160,uniqueAbility:{dominantType:'ATTACK',effectName:'결전 강타'}}
  ];
  const boss={id:4,monsterId:4,cardId:'MONSTER:4',name:'해군대장 키자루',mode:'HUNT',isBoss:true,type:'ATTACK',hp:6400,maxHp:6400};

  function selectedCard(){
    return cards.find(card=>card.type===selectedRole)||cards[0];
  }

  function payload(){
    const card={...selectedCard()};
    const enemy={id:'B:0:MONSTER:4',cardId:'MONSTER:4',name:boss.name,title:boss.name,grade:'BOSS',rarity:'BOSS',type:'ATTACK',hp:6400,maxHp:6400};
    const roleEvent={
      ATTACK:{type:'ATTACK',damage:428100,critical:true,label:'공격형 · 갑주 파쇄'},
      DEFENSE:{type:'ATTACK',damage:286400,label:'방어형 · 수호 반격'},
      SPEED:{type:'ATTACK',damage:517800,critical:true,hitCount:7,label:'속도형 · 초신속 연격'},
      HP:{type:'ATTACK',damage:392700,healing:184200,label:'HP형 · 생명력 흡수'}
    }[selectedRole];
    const timeline=[
      {...roleEvent,actorId:card.id,targetId:enemy.id,targetHpAfter:0},
      {type:'RESULT',winner:'A',actions:1,label:`${selectedRole} 승인 이펙트 이식 검수`}
    ];
    return {
      mode:'HUNT',battlefieldMode:'HUNT',monster:{...boss},
      battleV2:{
        teams:{A:{name:'LIVE TEST DECK',cards:[card]},B:{name:boss.name,cards:[enemy]}},
        result:{winner:'A',reason:'ELIMINATION',timeline,final:{A:[{id:card.id,cardId:card.cardId,hp:card.hp,maxHp:card.maxHp}],B:[{id:enemy.id,cardId:enemy.cardId,hp:0,maxHp:enemy.maxHp}]}}
      }
    };
  }

  async function waitForAdapters(){
    await Promise.allSettled([
      window.ProjectVBattleArt?.ready?.(),
      window.ProjectVTierBattleArt?.ready?.(),
      window.ProjectVMonsterBattleArt?.ready?.(),
      window.ProjectVUnassignedBattleFallback?.ready?.()
    ].filter(Boolean));
  }

  async function runOne(){
    session+=1;status.textContent=`${selectedRole} · ${session}판 준비`;
    activeRenderer?.destroy?.();
    const live=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'HUNT',playerName:selectedCard().name,opponentName:boss.name,autoText:'승인된 역할별 타격 연출을 운영 V3 전투에 그대로 동기화합니다.'});
    activeRenderer=await window.ProjectVBattleV3Live.createRenderer({...live,modal,data:payload(),mode:'HUNT',playUltimateCinematics:false});
    status.textContent=`${selectedRole} · ${session}판 재생`;
    await activeRenderer.play();
    status.textContent=`${selectedRole} · ${session}판 완료`;
    return true;
  }

  async function run(count){
    if(running)return;running=true;playOnce.disabled=true;playTwice.disabled=true;roleButtons.forEach(button=>{button.disabled=true});
    try{for(let index=0;index<count;index+=1)await runOne()}
    catch(error){console.error('[LIVE V3 ROLE FX PREVIEW]',error);status.textContent=`오류 · ${error?.message||error}`}
    finally{running=false;playOnce.disabled=false;playTwice.disabled=false;roleButtons.forEach(button=>{button.disabled=false})}
  }

  roleButtons.forEach(button=>button.addEventListener('click',()=>{
    selectedRole=button.dataset.role||'ATTACK';
    roleButtons.forEach(item=>item.classList.toggle('is-active',item===button));
    void run(1);
  }));
  playOnce.addEventListener('click',()=>void run(1));
  playTwice.addEventListener('click',()=>void run(2));
  addEventListener('pagehide',()=>activeRenderer?.destroy?.(),{once:true});

  void (async()=>{
    await waitForAdapters();
    status.textContent='공격형 · LIVE 준비 완료';
    await run(1);
  })();
})();
