/* Isolated ownership fixture using the real title UI; no live API calls. */
(()=>{
 const locked=new URLSearchParams(location.search).get('locked')==='1';
 const titles=[
  {id:1,code:'SECRET_POLICE',name:'비밀경찰',badgeText:'비밀경찰',description:'핑두의 비밀경찰. 운영자가 임명하는 전용 칭호.',image:'/assets/ui/titles/secret-police-v1.webp',stylePreset:'SECRET_POLICE',fontPreset:'SERIF',unlockType:'MANUAL',unlockConfig:{fontPreset:'SERIF'},pvePower:75000,owned:!locked,equipped:!locked},
  {id:2,code:'GAMBLING_KING',name:'도박왕',badgeText:'도박왕',description:'승부예측 누적 적중 1,000회를 달성한 승부사.',image:'/assets/ui/titles/gambling-king-v1.webp',stylePreset:'GAMBLING_KING',unlockType:'PREDICTION_HITS',unlockConfig:{count:1000},pvePower:75000,owned:!locked,equipped:false}
 ];
 const data={slots:[],instances:[],loadout:{},titles,vehicles:[],equippedTitleId:locked?null:1,bonuses:{}};
 if(locked){document.getElementById('viewMode').href='?';document.getElementById('viewMode').textContent='획득 후 보기';}
 window.titlePreview=window.SoopketmonCharacterLoadoutV2.create(document.getElementById('titleRoot'),{initialTab:'title',assetBase:'../../',profile:{nickname:'숲켓몬'},async request(path,init={}){
  if(path==='character/loadout')return structuredClone(data);
  if(path==='character/title/equip'){const id=Number(JSON.parse(init.body).titleId);if(!titles.some(t=>t.id===id&&t.owned))throw Error('미획득 칭호');data.equippedTitleId=id;return {ok:true};}
  if(path==='character/title/unequip'){data.equippedTitleId=null;return {ok:true};}
  throw Error('Unsupported isolated preview action');
 }});
})();
