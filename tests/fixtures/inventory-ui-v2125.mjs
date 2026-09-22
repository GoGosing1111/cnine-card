import {BATTLE_SUIT_CORE_CATALOG} from '../../functions/_battle_suit_materials.js';
import {SKILL_CHIP_CATALOG} from '../../shared/battle-suit-skill-chips.mjs';
import {FORGE_PROTECTION_ITEM} from '../../functions/_forge_protection_catalog.js';
import {FORGE_REPAIR_ITEM} from '../../functions/_forge_repair_catalog.js';

// Local UI fixtures only. Quantities and ownership never reach production APIs.
export function inventoryUiFixture(){
  const make=(code,name,category,rarity,image,quantity,description,extra={})=>({code,name,category,rarity,image,quantity,description,subtitle:'',usable:category!=='MATERIAL'&&category!=='SKILL_CHIP',unseenQuantity:0,...extra});
  const items=[
    make('PREMIUM_CUBE','프리미엄 큐브','CUBE','PREMIUM','assets/ui/packs/premium-cube.png',128,'큐브를 개방하면 카드 1장을 획득합니다. 1개·10개·100개를 선택해 한 번에 개방할 수 있습니다.',{unseenQuantity:3}),
    make('PRIME_EQUIPMENT_SUPPLY_BOX','프라임 아머리 상자','SUPPLY_BOX','PRIME','assets/ui/packs/prime-armory-equipment-box-v1.png',12,'프라임 장비 보급 상자입니다. 개봉 화면에서 수량과 보상을 확인하세요.'),
    make('PRIME_VEHICLE_DRAW_TICKET','프라임 하이퍼드라이브 팩','VEHICLE_DRAW','PRIME','assets/items/prime-hyperdrive-vehicle-pack-v1.png',4,'프라임 이동수단을 획득할 수 있는 팩입니다.'),
    make('BLACK_MIRACLE_PACK','블랙 미라클','PACK','MYTHIC','assets/ui/packs/black-miracle-pack-v1485-384.jpg',6,'특별한 장비와 이동수단을 획득하는 아이템입니다.',{usable:false,useDisabledMessage:'현재 개봉이 중지되어 있습니다.'}),
    make('MAGIC_CARD_PACK','마법카드 팩','PACK','EPIC','assets/cards/magic-card-pack-v2-384.jpg',8,'마법카드 1장을 획득합니다.'),
    make('VEHICLE_DRAW_TICKET','이동수단 뽑기권','VEHICLE_DRAW','RARE','assets/items/vehicle-draw-ticket-v1391.png',2,'이동수단 뽑기에 사용하는 티켓입니다.'),
    make('MASTER_STAR','마스터의 별','MATERIAL','MA','',1234567890,'카드 성장과 장비 강화에 사용하는 재료입니다.'),
    {...FORGE_PROTECTION_ITEM,quantity:3,unseenQuantity:1,usable:false,useDisabledMessage:'장비 강화에서 보호권 사용을 선택하세요.'},
    {...FORGE_REPAIR_ITEM,quantity:2,unseenQuantity:1,usable:false,useDisabledMessage:'장비 강화 센터 → 파괴 기록에서 복구할 장비를 선택하세요.'},
    ...BATTLE_SUIT_CORE_CATALOG.map((core,i)=>make(core.code,core.name,'MATERIAL',core.rarity,core.image,[24,18,8,3,2,1][i],core.description,{unseenQuantity:i>=4?1:0})),
    make('SCRAPYARD_ENTRY_TICKET','폐차장 출입증','ENTRY_TICKET','RARE','assets/ui/scrapyard/scrapyard-entry-ticket-v1680.png',11,'폐차장 원정을 시작할 때 사용하는 출입증입니다.'),
    make('CORE_RAID_ENTRY_TICKET','붕괴 코어 입장권','ENTRY_TICKET','EPIC','assets/items/core-raid-entry-ticket-v1.png',3,'붕괴 코어 레이드 입장에 필요한 아이템입니다.',{usable:false,useDisabledMessage:'붕괴 코어 공대 생성 시 사용'}),
    ...SKILL_CHIP_CATALOG.map(chip=>make(chip.code,`${chip.name} 스킬칩`,'SKILL_CHIP','SPECIAL',chip.image||chip.imageUrl||'',2,chip.description||'배틀슈트 스킬칩입니다.',{useDisabledMessage:'장비 → 스킬칩 탭에서 장착'})),
    make('FUR_REROLL_TICKET','FUR 재뽑기권','REROLL','FUR','',1,'같은 등급의 활성 카드 1장을 다시 뽑습니다.'),
    make('SUPERSTAR_REROLL_TICKET','슈퍼스타 재뽑기권','REROLL','SUPERSTAR','',5,'슈퍼스타 카드 1장을 다시 뽑습니다.'),
    make('UNIQUE_ADVANCEMENT_PASS','전직 패스권','ADVANCEMENT','SPECIAL','assets/items/unique-advancement-pass-v2043.svg',3,'카드 상세 > 고유효과 전직에 사용하는 패스권입니다.',{usable:false,useDisabledMessage:'카드 상세 전직 시 자동 사용'}),
    make('PINGDU_WISH_TICKET','핑두의 소원권','EVENT','SPECIAL','',2,'핑두의 소원램프에서 사용하는 소원권입니다.',{usable:false,useDisabledMessage:'핑두의 소원램프에서 사용'}),
    make('QA_EMPTY_PACK','미보유 상자','PACK','RARE','assets/ui/packs/premium-cube.png',0,'미보유 표시 검수용입니다.'),
    make('QA_EMPTY_CORE','미보유 코어','MATERIAL','EPIC','assets/items/suit-core-1-v2004.png',0,'미보유 표시 검수용입니다.')
  ];
  return {items,totalQuantity:items.reduce((sum,item)=>sum+item.quantity,0),ownedTypes:items.filter(x=>x.quantity>0).length,unseenTotal:items.reduce((sum,item)=>sum+item.unseenQuantity,0)};
}
