// Recovered unchanged from 7096a12267c5fcb342caeb80755f0364557880ec.
// Art review and runtime release remain independent of equipment UI preparation.
const base='assets/ui/pets/gugugaga/';
export const PET_ART_CATALOG=Object.freeze([
  ['BONGSOON','봉순','펭귄','pet-bongsoon-gugugaga-nametag-v2.png','2ba48e1b55f6da43c2ba65d6c74b5a8802fd8aa5eebab26b527f13988e8e4b2f','꽃을 들고 반갑게 인사하는 봉순.'],
  ['JOEUN','조은','펭귄','pet-joeun-gugugaga-nametag-v2.png','814905a3639b6e4b341d6a32ab3058e3b3fe14ad5b87f328a292dd6326fc1122','볼 옆에 날개를 대고 고개를 기울인 조은.'],
  ['HEEYA','희야','돼지','pet-heeya-pig-nametag-v3.png','1c89ac01721e048ee4981717857c1fa5e9b8f80fd6e10166d0eeaa7888de5bb8','분홍 돼지 의상과 꼬리를 갖춘 희야.'],
  ['DIIM','디임','펭귄','pet-diim-gugugaga-nametag-v2.png','907c3a1ca2ec4f86ebad7ec31fa73981e4e106eb62ee78566a8d3bea59ecef41','살짝 돌아서 작은 인사를 건네는 디임.'],
].map(([slug,name,animal,file,sha256,description])=>Object.freeze({code:`PET-${slug}`,name,animal,sourceArt:base+file,sha256,description,artStatus:'USER_REVIEW_PENDING'})));
