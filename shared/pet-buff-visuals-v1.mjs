// Visual resources only: no combat values, ownership or release switches.
const base='/assets/ui/pets/buffs-v1/';
export const PET_BUFF_VISUALS=Object.freeze(Object.fromEntries([
 ['ATTACK_PERCENT','attack','공격력 증가','공격을 강화하는 붉은 검','#ff9a71','적용 대상의 공격력을 설정한 비율만큼 높입니다.'],
 ['DEFENSE_PERCENT','defense','방어력 증가','단단하게 빛나는 푸른 갑옷','#80baff','적용 대상의 방어력을 설정한 비율만큼 높입니다.'],
 ['MAX_HP_PERCENT','vitality','최대 HP 증가','생명력을 넓히는 녹색 심장','#89e7ac','최대 HP를 높이고 현재 HP의 비율을 유지합니다.'],
 ['SPEED_PERCENT','speed','속도 증가','황금빛 날개와 번개','#ffdf8c','적용 대상의 속도를 설정한 비율만큼 높입니다.'],
 ['START_SHIELD_PERCENT','barrier','시작 보호막','피해를 흡수하는 보랏빛 결계','#c4a1ff','버프 적용 후 최대 HP를 기준으로 보호막을 더합니다. 보호막은 피해를 받으면 소모됩니다.'],
].map(([type,slug,label,motif,color,description])=>[type,Object.freeze({type,slug,label,motif,color,description,icon:base+slug+'-icon.webp',atlas:base+slug+'-atlas.webp',columns:4,rows:2,frames:8,iconFrame:3,durationMs:1600})])));
export const petBuffVisual=type=>Object.hasOwn(PET_BUFF_VISUALS,type)?PET_BUFF_VISUALS[type]:null;
