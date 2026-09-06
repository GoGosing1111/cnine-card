// Read-only local QA. Uses real approved sourceArt/card identities and the exact
// server simulator. No API calls, credentials, inventory writes or rewards.
import {readFile} from 'node:fs/promises';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {SKILL_CHIP_CATALOG} from '../shared/battle-suit-skill-chips.mjs';
const json=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const manifests=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(file=>json(`assets/ui/project-v/characters/${file}`)));
const roster=manifests.flatMap(manifest=>manifest.characters.map(card=>({...card,grade:manifest.rarity})));
const cards=ids.map((id,i)=>{
  const card=roster.find(row=>row.cardId===id);if(!card)throw new Error(`Unapproved QA identity: ${id}`);
  return {...card,id,cardId:id,rarity:card.grade,name:card.member,title:card.title,image:card.sourceArt,image_url:card.sourceArt,power_type:['HP','DEFENSE','DEFENSE','ATTACK','SPEED'][i],power:400000};
});
const assets=await json('assets/ui/project-v/account-battle-suits/manifest-v2.json');
const suit=assets.suits[2],weapon=assets.weapons[0];
const monsterArt=(await json('assets/ui/project-v/monsters/hunt-tower/manifest-v1.json')).sprites.find(row=>row.monsterId===68);
const monster={id:68,name:monsterArt.name,image:monsterArt.sourceArt,image_url:monsterArt.sourceArt,battle_power:300000,is_boss:1,pve_hp_percent:1200,pve_attack_percent:100,pve_shield_percent:100};
const equippedBattleSuit={code:suit.code,pvePower:300000,appearance:{battleSprite:suit.image,battleHeight:278},skillChips:SKILL_CHIP_CATALOG.map(chip=>chip.code)};
const equippedWeapon={code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}};
const battleV2=createPveBattleV2({cards,battleSuit:{...equippedBattleSuit,weapon:equippedWeapon},monster,seed:2011});
console.log(JSON.stringify({previewOnly:true,mode:'HUNT',battlefieldMode:'HUNT',accountNickname:'스킬칩 서버 재생 검수',equippedBattleSuit,equippedWeapon,characterBonus:{battleSuitPve:300000,equippedBattleSuit,equippedWeapon},monster,battleV2}));
