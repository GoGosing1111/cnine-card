/* Uses the production title renderer. All mutations stay in this local fixture. */
(() => {
  const locked = new URLSearchParams(location.search).get('locked') === '1';
  const titles = [
    { id:1,code:'COLLECTION_COMPLETIONIST',name:'폐인',badgeText:'폐인',description:'카드 도감 100%와 차량 도감 90% 이상을 완성한 수집가.',image:'/assets/ui/titles/completionist-v1.webp',stylePreset:'COMPLETIONIST',unlockType:'COLLECTION_MASTERY',unlockConfig:{cardPercent:100,vehiclePercent:90},pvePower:50000,owned:!locked,equipped:!locked },
    { id:2,code:'TROPHY_HUNTER',name:'우승청부사',badgeText:'우승청부사',description:'서로 다른 트로피 4종을 수집한 승리의 증명.',image:'/assets/ui/titles/trophy-hunter-v1.webp',stylePreset:'TROPHY_HUNTER',unlockType:'TROPHY_KINDS',unlockConfig:{count:4},pvePower:75000,owned:!locked,equipped:false }
  ];
  const data = {slots:[],instances:[],loadout:{},titles,vehicles:[],equippedTitleId:locked?null:1,bonuses:{}};
  const link = document.getElementById('viewMode');
  if (locked) { link.href='?';link.textContent='획득 후 보기'; }
  window.titlePreview = window.SoopketmonCharacterLoadoutV2.create(document.getElementById('achievementTitles'), {
    initialTab:'title',assetBase:'../../',profile:{nickname:'숲켓몬'},
    async request(path) {
      if(path==='character/loadout')return structuredClone(data);
      if(/^character\/title\/(equip|unequip)$/.test(path))return {ok:true};
      throw Error('칭호 미리보기에서 지원하지 않는 동작입니다.');
    },
    onLoad(){queueMicrotask(()=>window.titlePreview.setTitleProgress({COLLECTION_COMPLETIONIST:{cards:{owned:497,total:500},vehicles:{owned:17,total:20}},TROPHY_HUNTER:{owned:3,goal:4}}));}
  });
  document.getElementById('callingCard').addEventListener('click', () => {
    const current = window.titlePreview.getState();
    window.PlayerCallingCard.open({previewData:{player:{nickname:'숲켓몬',title:current.titles.find(t=>t.id===current.equippedTitleId)||null},ranked:{state:'UNRANKED',season:'미리보기',history:[]},clanHistory:[],trophies:[],frame:{name:'옵시디언',level:0}}});
  });
})();
