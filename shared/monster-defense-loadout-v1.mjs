// Defense owns its battle balance. Account selection supplies identity and art,
// while these established defense roles retain the wave/upgrade contract.
export const DEFENSE_PROFILES=Object.freeze({
 GUARD:{hp:850,attack:23,range:175,interval:1200,skill:'방어 태세',cooldown:18000},
 RANGED:{hp:440,attack:48,range:560,interval:1000,skill:'집중 사격',cooldown:14000},
 STRIKER:{hp:620,attack:65,range:240,interval:1150,skill:'광역 참격',cooldown:15000},
 HEALER:{hp:480,attack:22,range:480,interval:1300,skill:'응급 회복',cooldown:18000},
 CAPTAIN:{hp:580,attack:36,range:480,interval:1100,skill:'합동 지휘',cooldown:20000}
});
export const DEFENSE_ROLE_NAMES=Object.freeze({GUARD:'수호',RANGED:'사격',STRIKER:'돌격',HEALER:'회복',CAPTAIN:'지휘'});
export const emptyDefenseLoadout=()=>({mercenaries:[],card:''});
export function defenseSelection(value){
 if(!value||!Array.isArray(value.mercenaries)||value.mercenaries.length!==2||new Set(value.mercenaries).size!==2||
  value.mercenaries.some(code=>typeof code!=='string'||!/^V-\d{3,6}$/.test(code))||typeof value.card!=='string'||!value.card||value.card.length>100)
  throw Object.assign(Error('서로 다른 보유 용병 2명과 카드 1장을 선택하세요.'),{code:'DEFENSE_LOADOUT',status:400});
 return {mercenaries:[...value.mercenaries],card:value.card};
}
