// Recovered unchanged from 7096a12267c5fcb342caeb80755f0364557880ec.
// Art review and runtime release remain independent of equipment UI preparation.
const base='assets/ui/pets/gugugaga/';
export const PET_ART_CATALOG=Object.freeze([
  ['BONGSOON','봉순','펭귄','pet-bongsoon-gugugaga-nametag-v2.png','2ba48e1b55f6da43c2ba65d6c74b5a8802fd8aa5eebab26b527f13988e8e4b2f','꽃을 들고 반갑게 인사하는 봉순.'],
  ['JOEUN','조은','펭귄','pet-joeun-gugugaga-nametag-v2.png','814905a3639b6e4b341d6a32ab3058e3b3fe14ad5b87f328a292dd6326fc1122','볼 옆에 날개를 대고 고개를 기울인 조은.'],
  ['HEEYA','희야','돼지','pet-heeya-pig-nametag-v3.png','1c89ac01721e048ee4981717857c1fa5e9b8f80fd6e10166d0eeaa7888de5bb8','분홍 돼지 의상과 꼬리를 갖춘 희야.'],
  ['DIIM','디임','펭귄','pet-diim-gugugaga-nametag-v2.png','907c3a1ca2ec4f86ebad7ec31fa73981e4e106eb62ee78566a8d3bea59ecef41','살짝 돌아서 작은 인사를 건네는 디임.'],
  ['GUSUDAENG','토끼 구수댕','토끼','assets/ui/pets/gusudaeng/pet-tokki-gusudaeng-approved-20261002.png','f632ce546f455947662e7c68cc11dadbb4f28907b2d28f74efb3a3dfab558349','포동포동한 흰 토끼 인형탈 안에 구수댕 얼굴이 보이는 승인 일러스트.','SOURCE_ART_APPROVED'],
  ['HEADSET-SHIBA','헤드셋 시바견','시바견','assets/ui/pets/gamer-duo-20261006-v1/pet-headset-shiba-v1.png','98810de99b1d2c9d33d96937555442f870d050abd130375f76645acd06572445','검정·빨강 헤드셋을 쓰고 곁눈질하는 황금빛 시바견.','SOURCE_ART_APPROVED'],
  ['BEANIE-CAT','비니 헤드셋 고양이','고양이','assets/ui/pets/gamer-duo-20261006-v1/pet-beanie-headset-cat-v1.png','173c92958da275af6b6a600ee4d576512a91f2ff0d8dcf721dc8757e17a3d9ec','회갈색 비니와 검정 헤드셋을 쓴 무심한 표정의 크림색 고양이.','SOURCE_ART_APPROVED'],
].map(([slug,name,animal,file,sha256,description,artStatus='USER_REVIEW_PENDING'])=>Object.freeze({code:`PET-${slug}`,name,animal,sourceArt:file.startsWith('assets/')?file:base+file,sha256,description,artStatus})));
