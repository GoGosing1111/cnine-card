/* The production title renderer with isolated preview ownership. No live API calls. */
(() => {
  const locked = new URLSearchParams(location.search).get('locked') === '1';
  const titles = [
    {id:1,code:'SUPPORTER',name:'서포터',badgeText:'서포터',description:'운영에 도움을 주신 감사 칭호',image:'/assets/ui/titles/supporter-vip-v1.webp',stylePreset:'SUPPORTER_VIP',unlockType:'MANUAL',unlockConfig:{},pvePower:75000,owned:!locked,equipped:!locked},
    {id:2,code:'BLUE_BEAST',name:'푸른 맹수',badgeText:'푸른 맹수',description:'챌린저 누적 10회 달성',image:'/assets/ui/titles/blue-beast-v1.webp',stylePreset:'BLUE_BEAST',unlockType:'CHALLENGER_TOTAL',unlockConfig:{count:10},pvePower:70000,owned:!locked,equipped:false}
  ];
  const data={slots:[],instances:[],loadout:{},titles,vehicles:[],equippedTitleId:locked?null:1,bonuses:{}};
  if(locked){document.getElementById('viewMode').href='?';document.getElementById('viewMode').textContent='획득 후 보기';}
  window.titlePreview=window.SoopketmonCharacterLoadoutV2.create(document.getElementById('achievementTitles'),{
    initialTab:'title',assetBase:'../../',profile:{nickname:'숲켓몬'},
    async request(path,init={}){
      if(path==='character/loadout')return structuredClone(data);
      if(path==='character/title/equip'){
        const id=Number(JSON.parse(init.body).titleId);
        if(!data.titles.some(row=>row.id===id&&row.owned))throw Error('미획득 칭호');
        data.equippedTitleId=id;return {ok:true};
      }
      if(path==='character/title/unequip'){data.equippedTitleId=null;return {ok:true};}
      throw Error('칭호 미리보기에서 지원하지 않는 동작입니다.');
    },
    onLoad(){queueMicrotask(()=>window.titlePreview.setTitleProgress({BLUE_BEAST:{owned:9,goal:10,complete:false}}));}
  });
})();
