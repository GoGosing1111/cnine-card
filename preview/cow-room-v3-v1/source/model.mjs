import {buildCowRoomBattle, COW_ROOM_DRAFT} from '../../../functions/_cow_room_v3.js';
import {buildPreviewDeck, BATTLE_SUIT} from '../../idle-v3-v1/source/idle-model.mjs';
export function createCowEncounter({catalog,equipment,powerScale=1,seed=7123}={}) {
  if (![.25,1,2].includes(powerScale)) throw new Error('INVALID_PREVIEW_POWER');
  const cards = buildPreviewDeck(catalog).map(card=>({...card,power:Math.round(card.power*powerScale)}));
  const suit = equipment.suits.find(row=>row.code===BATTLE_SUIT.code);
  const weapon = equipment.weapons.find(row=>row.equipmentCode===BATTLE_SUIT.weaponCode);
  if (!suit || !weapon) throw new Error('승인된 슈트 리소스를 찾을 수 없습니다.');
  const suitPower = Math.round(BATTLE_SUIT.basePower*powerScale);
  const equippedBattleSuit={code:suit.code,pvePower:suitPower,appearance:{battleSprite:suit.image,battleHeight:278}};
  const equippedWeapon={code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}};
  const snapshot={cards,accountNickname:'목초지 원정대 · 체험 편성',
    battleSuit:{...equippedBattleSuit,weapon:equippedWeapon,accountNickname:'원정대 지원'},
    characterBonus:{battleSuitPve:suitPower,equippedBattleSuit,equippedWeapon}};
  return {...buildCowRoomBattle({snapshot,seed,config:COW_ROOM_DRAFT}),previewOnly:true};
}
