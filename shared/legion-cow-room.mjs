export const COW_AREA = 'cow-room';
export const COW_SOLO_CAP = 5_000_000_000_000;
export const COW_PARTY_CAP = 10_000_000_000_000;
export const COW_DROP_FACTOR = 1.5;
const art = '/assets/ui/legion-cow-room/';
export const COW_REGION = Object.freeze({
  id:COW_AREA, name:'카우방', english:'COW LEVEL', accent:'#eeb76f',
  background:art+'pasture.webp',
  description:'군단을 돌파하고 마지막에 나타나는 젖소왕을 처치하세요.',
  setRole:'솔로 입장권 1장', counter:'재앙 전리품 드랍률 150%',
  monsters:['젖소 돌격병','철갑 젖소','젖소 주술사'].map((name,index)=>({
    id:'cow-'+index, name, sprite:art+'warrior.webp'
  })),
  boss:{id:'cow-king',name:'젖소왕',sprite:art+'king.webp'}
});
export const COW_TICKETS = Object.freeze({
  solo:{code:'LEGION_COW_SOLO_TICKET',name:'군단토벌 카우방 입장권',image:'assets/ui/legion-cow-room/warrior.webp'},
  party:{code:'LEGION_COW_PARTY_TICKET',name:'군단토벌 파티 카우방 입장권',image:'assets/ui/legion-cow-room/king.webp'}
});
