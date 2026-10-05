const title=await fetch('live-fixture.json').then(r=>r.json());
const locked=new URLSearchParams(location.search).get('locked')==='1';
const data={slots:[],instances:[],loadout:{},titles:[{...title,owned:!locked,equipped:false}],vehicles:[],equippedTitleId:null,bonuses:{},equipmentQuantitiesPending:false};
if(locked){document.getElementById('viewMode').href='live.html';document.getElementById('viewMode').textContent='검수용 보유 상태 확인';}
window.SoopketmonCharacterLoadoutV2.create(document.getElementById('titleReview'),{
 initialTab:'title',assetBase:'../../',profile:{nickname:'레이드 기사'},
 async request(path,init={}){
  if(path==='character/loadout')return structuredClone(data);
  if(path==='character/title/equip'){const id=Number(JSON.parse(init.body).titleId);if(locked||id!==title.id)throw Error('미획득 칭호');data.equippedTitleId=id;data.titles[0].equipped=true;return{ok:true};}
  if(path==='character/title/unequip'){data.equippedTitleId=null;data.titles[0].equipped=false;return{ok:true};}
  throw Error('칭호 화면 검수에서 지원하지 않는 동작입니다.');
 }
});
