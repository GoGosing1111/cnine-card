(() => {
  'use strict';
  const now=Date.now(),chief={
    active:true,status:'ACTIVE',reignStyle:'GENERAL',source:'COUP',ordinal:12,
    nickname:'박세라-ㅂ-',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+7*86400000).toISOString(),
    inaugurationVersion:'coup-general-preview-20261018',
    coupSuccession:{status:'APPOINTED',roundId:'preview-only',previousNickname:'나무늘봉순'}
  };
  function open(stage='full',returnFocus=document.querySelector('#replay')){
    if(!window.QueenCoronation.show(chief,{returnFocus}))return;
    const dialog=document.querySelector('#chiefElectionPopup');
    dialog.querySelector('.queen-coronation-header>span').firstChild.textContent='REVERSE CALL · 미리보기';
    if(stage==='settled')dialog.querySelector('.queen-skip').click();
    if(stage==='escort'||stage==='verdict')dialog.classList.add(`is-coup-${stage}-review`);
  }
  document.querySelector('#replay').onclick=event=>open('full',event.currentTarget);
  for(const stage of ['verdict','escort','settled'])document.querySelector('#'+stage).onclick=event=>open(stage,event.currentTarget);
  open();
})();
