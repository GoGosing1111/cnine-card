import {SKILL_CHIP_CATALOG,SKILL_CHIP_BALANCE_STATUS} from '../../../shared/battle-suit-skill-chips.mjs';
const fixture={
  avatarFeature:{visible:true},instances:[],loadout:{},titles:[],vehicles:[],bonuses:{},
  skillChips:{visible:true,maxSlots:3,battleEnabled:false,balanceStatus:SKILL_CHIP_BALANCE_STATUS,damageBase:null,
    loadout:[null,null,null],catalog:SKILL_CHIP_CATALOG.map(chip=>({...chip,quantity:1,owned:true,active:true,equipped:false,slot:null}))}
};
const request=async(path,init={})=>{
  if(path==='character/loadout')return structuredClone(fixture);
  if(!['character/skill-chips/equip','character/skill-chips/unequip'].includes(path))throw new Error('로컬 스킬칩 검수만 지원합니다.');
  const {slot,code}=JSON.parse(init.body||'{}'),system=fixture.skillChips;
  if(!Number.isInteger(slot)||slot<1||slot>3)throw new Error('올바른 슬롯이 아닙니다.');
  if(!system.catalog.some(chip=>chip.code===code&&chip.owned))throw new Error('미보유 스킬칩입니다.');
  if(path.endsWith('/unequip')){if(system.loadout[slot-1]===code)system.loadout[slot-1]=null;}
  else{
    if(system.loadout.some((item,index)=>item===code&&index!==slot-1))throw new Error('동일한 스킬칩은 중복 장착할 수 없습니다.');
    system.loadout[slot-1]=code;
  }
  for(const chip of system.catalog){const index=system.loadout.indexOf(chip.code);chip.equipped=index>=0;chip.slot=index>=0?index+1:null;}
  return {ok:true,skillChips:structuredClone(system)};
};
window.SkillChipLoadoutPreview=window.SoopketmonCharacterLoadoutV2.create(document.getElementById('skillChipLoadout'),{
  initialTab:'skillChips',profile:{nickname:'스킬칩 검수'},request,onOpenAvatarShop:()=>{}
});
