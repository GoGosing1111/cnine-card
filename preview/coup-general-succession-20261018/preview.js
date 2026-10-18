(() => {
  'use strict';
  const now=Date.now(),chief={
    active:true,status:'ACTIVE',reignStyle:'GENERAL',source:'COUP',ordinal:12,
    nickname:'박세라-ㅂ-',startsAt:new Date(now-1000).toISOString(),endsAt:new Date(now+7*86400000).toISOString(),
    inaugurationVersion:'coup-general-preview-20261018',
    coupSuccession:{status:'APPOINTED',roundId:'preview-only',previousNickname:'나무늘봉순'}
  };
  function open(settled=false,returnFocus=document.querySelector('#replay')){
    if(!window.QueenCoronation.show(chief,{returnFocus}))return;
    const dialog=document.querySelector('#chiefElectionPopup');
    dialog.querySelector('.queen-coronation-header>span').firstChild.textContent='REVERSE CALL · 미리보기';
    if(settled)dialog.querySelector('.queen-skip').click();
  }
  document.querySelector('#replay').onclick=event=>open(false,event.currentTarget);
  document.querySelector('#settled').onclick=event=>open(true,event.currentTarget);
  open();
})();
