/* Uses the production title renderer. All mutations stay in this local fixture. */
(() => {
  const locked = new URLSearchParams(location.search).get('locked') === '1';
  const titles = [
    { id:1,code:'GAMBLING_KING',name:'도박왕',badgeText:'도박왕',description:'승부예측 누적 적중 1,000회를 달성한 승부사.',image:'/assets/ui/titles/gambling-king-v1.webp',stylePreset:'GAMBLING_KING',unlockType:'PREDICTION_HITS',unlockConfig:{count:1000},pvePower:60000,owned:!locked,equipped:!locked },
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
    onLoad(){queueMicrotask(()=>window.titlePreview.setTitleProgress({GAMBLING_KING:{owned:822,goal:1000,complete:false},TROPHY_HUNTER:{owned:3,goal:4}}));}
  });
  document.getElementById('callingCard').addEventListener('click', () => {
    const current = window.titlePreview.getState();
    window.PlayerCallingCard.open({previewData:{player:{nickname:'숲켓몬',title:current.titles.find(t=>t.id===current.equippedTitleId)||null},ranked:{state:'UNRANKED',season:'미리보기',history:[]},clanHistory:[],trophies:[],frame:{name:'옵시디언',level:0}}});
  });
})();
