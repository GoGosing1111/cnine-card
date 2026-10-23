export const PET_PUMPKIN_CHOICE_ITEM=Object.freeze({
  code:'PET_PUMPKIN_CHOICE_TICKET',name:'호박펫 선택권',subtitle:'PUMPKIN PET SELECT',
  description:'호박봉순·호박조은 중 원하는 펫 1장을 선택해 확정 획득합니다. 선택권 1개를 소모하며 코인·펫 정수는 소모하지 않습니다.',
  category:'EVENT',rarity:'SPECIAL',image:'assets/items/pumpkin-pet-choice-20261023/ticket.webp'
});
// This ticket always selects exactly one of these two approved pumpkin pets.
export const PET_PUMPKIN_CHOICES=Object.freeze([
  Object.freeze({code:'PET-PUMPKIN-BONGSOON',name:'호박봉순',sourceArt:'assets/ui/pets/pumpkin-duo-20261022/pet-pumpkin-bongsoon-approved.png'}),
  Object.freeze({code:'PET-PUMPKIN-JOEUN',name:'호박조은',sourceArt:'assets/ui/pets/pumpkin-duo-20261022/pet-pumpkin-joeun-approved.png'})
]);
export const PET_PUMPKIN_CHOICE_VERSION=1;
